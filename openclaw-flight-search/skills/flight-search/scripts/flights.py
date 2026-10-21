#!/usr/bin/env python3
"""Pesquisa de voos para agentes autônomos (skill do OpenClaw).

Somente biblioteca padrão. Provedores: serpapi (Google Flights) e mock (dados fictícios).
A chave pode vir do ambiente (SERPAPI_API_KEY) ou do arquivo .env na pasta da skill.
Saída: JSON normalizado (padrão) ou texto compacto (--format text).

Exemplos:
  flights.py search --from GRU --to LIS --depart 2026-11-10 --return 2026-11-20
  flights.py search --from CGH --to SDU --depart 2026-11-10 --max-stops 0 --sort duration
  flights.py airports "rio de janeiro"
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import html
import json
import os
import random
import secrets
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

VERSION = "3.0.0"
USER_AGENT = f"openclaw-flight-search/{VERSION}"
HTTP_TIMEOUT = 45
MAX_FLEX_DAYS = 3


class FlightSearchError(Exception):
    def __init__(self, message: str, code: str = "error", status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


# ---------------------------------------------------------------------------
# Utilitários


def minutes_between(start: str, end: str) -> int | None:
    try:
        return int((parse_local(end) - parse_local(start)).total_seconds() // 60)
    except (TypeError, ValueError):
        return None


def parse_local(value: str) -> dt.datetime:
    """Aceita '2026-11-10T08:00:00' e '2026-11-10 08:00'."""
    return dt.datetime.fromisoformat(value.replace(" ", "T")[:19])


def local_hhmm(value: str | None) -> str | None:
    m = re.search(r"[T ](\d{2}:\d{2})", value or "")
    return m.group(1) if m else None


def fmt_minutes(total: int | None) -> str:
    if total is None:
        return "?"
    return f"{total // 60}h{total % 60:02d}"


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)).lower()


def http_json(method: str, url: str, headers: dict, body: dict | None = None, retries: int = 3) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Encoding": "gzip", **headers}
    if data is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            raw = e.read()
            if e.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                retry_after = e.headers.get("Retry-After")
                time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt)
                continue
            detail = raw.decode(errors="replace")[:500]
            code = {401: "auth_error", 403: "auth_error", 422: "invalid_request", 429: "rate_limited"}.get(e.code, "provider_error")
            raise FlightSearchError(f"HTTP {e.code} do provedor: {detail}", code, e.code) from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries:
                time.sleep(2 ** attempt)
                continue
            raise FlightSearchError(f"Falha de rede: {e}", "network_error") from None
    raise FlightSearchError("Falha após novas tentativas", "network_error")


# ---------------------------------------------------------------------------
# Cache em disco (evita gastar cota repetindo a mesma busca)


def cache_dir() -> str:
    return os.environ.get("FLIGHTS_CACHE_DIR") or os.path.join(os.path.expanduser("~"), ".cache", "openclaw-flight-search")


def cache_ttl() -> int:
    try:
        return int(os.environ.get("FLIGHTS_CACHE_TTL", "900"))
    except ValueError:
        return 900


def cache_key(provider: str, query: dict) -> str:
    return hashlib.sha256(json.dumps([provider, query], sort_keys=True).encode()).hexdigest()[:32]


def cache_get(key: str) -> dict | None:
    path = os.path.join(cache_dir(), key + ".json")
    try:
        if time.time() - os.path.getmtime(path) > cache_ttl():
            return None
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def cache_put(key: str, entry: dict) -> None:
    try:
        os.makedirs(cache_dir(), exist_ok=True)
        tmp = os.path.join(cache_dir(), key + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(entry, f)
        os.replace(tmp, os.path.join(cache_dir(), key + ".json"))
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Provedores. Cada um recebe a consulta normalizada e devolve (ofertas, price_insights|None).
# Ofertas normalizadas:
# {id, provider, price:{amount,currency}, airlines[], slices[{origin,destination,
#  departure,arrival,duration_minutes,stops,segments[]}], total_duration_minutes, booking{}}

CABIN_SERPAPI = {"economy": 1, "premium_economy": 2, "business": 3, "first": 4}


def serpapi_params(q: dict) -> dict:
    key = os.environ.get("SERPAPI_API_KEY")
    if not key:
        raise FlightSearchError("SERPAPI_API_KEY não configurada (ambiente ou arquivo .env da skill).", "missing_credentials")
    params = {
        "engine": "google_flights",
        "departure_id": q["origin"],
        "arrival_id": q["destination"],
        "outbound_date": q["depart"],
        "type": 1 if q.get("return") else 2,
        "travel_class": CABIN_SERPAPI[q["cabin"]],
        "adults": q["adults"],
        "children": len(q["children_ages"]),
        "infants_on_lap": q["infants"],
        "currency": q["currency"],
        "hl": "pt",
        "gl": "br",
        "api_key": key,
    }
    if q.get("return"):
        params["return_date"] = q["return"]
    if q.get("max_stops") is not None:
        params["stops"] = min(q["max_stops"], 2) + 1  # 1=direto, 2=até 1 parada, 3=até 2 paradas
    return params


def search_serpapi(q: dict) -> list:
    resp = http_json("GET", "https://serpapi.com/search.json?" + urllib.parse.urlencode(serpapi_params(q)), {})
    if resp.get("error"):
        if "hasn't returned any results" in resp["error"]:
            return [], None
        raise FlightSearchError(f"SerpApi: {resp['error']}", "provider_error")
    url = (resp.get("search_metadata") or {}).get("google_flights_url")
    items = (resp.get("best_flights") or []) + (resp.get("other_flights") or [])
    insights = resp.get("price_insights") or {}
    summary = {
        "level": insights.get("price_level"),  # low / typical / high, na avaliação do Google
        "typical_range": insights.get("typical_price_range"),
        "lowest_price": insights.get("lowest_price"),
    } if insights else None
    return [normalize_serpapi(item, q, url, i) for i, item in enumerate(items)], summary


def normalize_serpapi(item: dict, q: dict, url: str | None, index: int) -> dict:
    segments, airlines = [], []
    for f in item.get("flights", []):
        if f.get("airline") and f["airline"] not in airlines:
            airlines.append(f["airline"])
        number = (f.get("flight_number") or "").replace(" ", "")
        segments.append({
            "from": (f.get("departure_airport") or {}).get("id"),
            "to": (f.get("arrival_airport") or {}).get("id"),
            "departure": (f.get("departure_airport") or {}).get("time"),
            "arrival": (f.get("arrival_airport") or {}).get("time"),
            "carrier": number[:2] or None,
            "carrier_name": f.get("airline"),
            "flight_number": number,
            "operating_carrier": None,
            "aircraft": f.get("airplane"),
            "duration_minutes": f.get("duration"),
            "amenities": [e for e in f.get("extensions") or [] if not e.startswith("Carbon emissions")],
        })
    outbound = build_slice(segments, item.get("total_duration"))
    offer = {
        "id": f"serpapi-{q['depart']}-{index}",
        "provider": "serpapi",
        "price": {"amount": float(item["price"]) if item.get("price") is not None else None, "currency": q["currency"]},
        "airlines": airlines,
        "slices": [outbound],
        "total_duration_minutes": outbound["duration_minutes"],
        "booking": {"google_flights_url": url, "booking_token": item.get("booking_token"), "departure_token": item.get("departure_token")},
    }
    if q.get("return"):
        offer["note"] = "Preço é ida e volta; detalhes da volta não buscados (use departure_token no Google Flights)."
    return offer


def serpapi_return(q: dict, departure_token: str) -> dict | None:
    """Voos de volta para uma ida escolhida (1 busca). Devolve a melhor volta em preço × tempo,
    o preço total da viagem e o link do Google Flights já com a ida selecionada."""
    key = cache_key("serpapi-return", {"q": q, "token": departure_token})
    entry = cache_get(key)
    if entry is None:
        resp = http_json("GET", "https://serpapi.com/search.json?" + urllib.parse.urlencode({**serpapi_params(q), "departure_token": departure_token}), {})
        if resp.get("error"):
            if "hasn't returned any results" in resp["error"]:
                return None
            raise FlightSearchError(f"SerpApi: {resp['error']}", "provider_error")
        url = (resp.get("search_metadata") or {}).get("google_flights_url")
        items = (resp.get("best_flights") or []) + (resp.get("other_flights") or [])
        entry = {"url": url, "returns": [normalize_serpapi(item, q, url, i) for i, item in enumerate(items)]}
        cache_put(key, entry)
    returns = [r for r in entry["returns"] if r["price"]["amount"] is not None]
    if not returns:
        return None
    best = sort_offers(returns, "best")[0]
    return {"slice": best["slices"][0], "price": best["price"]["amount"], "airlines": best["airlines"], "url": entry["url"]}


def search_mock(q: dict) -> list:
    """Ofertas fictícias e determinísticas — apenas para testes e simulação."""
    rng = random.Random(cache_key("mock", q))
    carriers = [("LA", "LATAM"), ("G3", "GOL"), ("AD", "Azul"), ("TP", "TAP Air Portugal"), ("AF", "Air France")]
    hubs = ["BSB", "CNF", "VCP", "LIS", "MAD"]
    offers = []
    for i in range(rng.randint(6, 12)):
        code, name = rng.choice(carriers)
        stops = rng.choice([0, 0, 1, 1, 2])
        if q.get("max_stops") is not None:
            stops = min(stops, q["max_stops"])
        slices = []
        o_code, d_code = q["origin"].split(",")[0], q["destination"].split(",")[0]
        legs = [(o_code, d_code, q["depart"])]
        if q.get("return"):
            legs.append((d_code, o_code, q["return"]))
        for origin, dest, day in legs:
            start = dt.datetime.fromisoformat(day) + dt.timedelta(hours=rng.randint(5, 22), minutes=rng.choice([0, 15, 30, 45]))
            points = [origin] + rng.sample([h for h in hubs if h not in (origin, dest)], stops) + [dest]
            segments, t = [], start
            for a, b in zip(points, points[1:]):
                dur = rng.randint(55, 600)
                segments.append({
                    "from": a, "to": b,
                    "departure": t.isoformat(), "arrival": (t + dt.timedelta(minutes=dur)).isoformat(),
                    "carrier": code, "carrier_name": name, "flight_number": f"{code}{rng.randint(1000, 9999)}",
                    "operating_carrier": None, "aircraft": rng.choice(["Airbus A320neo", "Boeing 737 MAX 8", "Airbus A330-900"]),
                    "duration_minutes": dur,
                })
                t += dt.timedelta(minutes=dur + rng.randint(50, 240))
            slices.append(build_slice(segments, None))
        pax = q["adults"] + len(q["children_ages"]) + 0.1 * q["infants"]
        amount = round(rng.uniform(350, 4800) * pax * (1.25 if stops == 0 else 1), 2)
        offers.append({
            "id": f"mock-{q['depart']}-{i}", "provider": "mock",
            "price": {"amount": amount, "currency": q["currency"]},
            "airlines": [name], "slices": slices, "total_duration_minutes": sum_durations(slices),
            "booking": {"note": "dados fictícios"},
        })
    return offers, None


PROVIDERS = {"serpapi": search_serpapi, "mock": search_mock}


def build_slice(segments: list, duration: int | None) -> dict:
    first, last = (segments[0], segments[-1]) if segments else ({}, {})
    if duration is None and segments:
        duration = minutes_between(first["departure"], last["arrival"])
    # chegada e partida da conexão são no mesmo aeroporto (mesmo fuso): a diferença local é exata
    layovers = []
    for prev, nxt in zip(segments, segments[1:]):
        wait = minutes_between(prev.get("arrival") or "", nxt.get("departure") or "")
        overnight = (prev.get("arrival") or "")[:10] != (nxt.get("departure") or "")[:10]
        layovers.append({"airport": prev.get("to"), "duration_minutes": wait, "overnight": overnight,
                         "change_airport": prev.get("to") != nxt.get("from")})
    return {
        "origin": first.get("from"),
        "destination": last.get("to"),
        "departure": first.get("departure"),
        "arrival": last.get("arrival"),
        "duration_minutes": duration,
        "stops": max(len(segments) - 1, 0),
        "segments": segments,
        "layovers": layovers,
    }


def sum_durations(slices: list) -> int | None:
    values = [s["duration_minutes"] for s in slices]
    return None if any(v is None for v in values) else sum(values)


def default_provider() -> str:
    explicit = os.environ.get("FLIGHTS_PROVIDER")
    if explicit:
        return explicit
    if os.environ.get("SERPAPI_API_KEY"):
        return "serpapi"
    raise FlightSearchError(
        "SERPAPI_API_KEY não configurada (ambiente ou arquivo .env da skill). "
        "Use --provider mock só para testes com dados fictícios.",
        "missing_credentials",
    )


# ---------------------------------------------------------------------------
# Filtros e ordenação (aplicados localmente para todos os provedores)


def apply_filters(offers: list, a: argparse.Namespace) -> list:
    include = {x.strip().lower() for x in (a.airlines or "").split(",") if x.strip()}
    exclude = {x.strip().lower() for x in (a.exclude_airlines or "").split(",") if x.strip()}

    def carriers(o):
        names = {n.lower() for n in o["airlines"] if n}
        codes = {(seg.get("carrier") or "").lower() for s in o["slices"] for seg in s["segments"]}
        return names | codes

    out = []
    for o in offers:
        if o["price"]["amount"] is None:
            continue
        if a.max_price is not None and o["price"]["amount"] > a.max_price:
            continue
        if a.max_stops is not None and any(s["stops"] > a.max_stops for s in o["slices"]):
            continue
        if a.max_duration is not None and any((s["duration_minutes"] or 0) > a.max_duration * 60 for s in o["slices"]):
            continue
        if include and not (carriers(o) & include):
            continue
        if exclude and carriers(o) & exclude:
            continue
        dep = local_hhmm(o["slices"][0]["departure"])
        if a.depart_after and dep and dep < a.depart_after:
            continue
        if a.depart_before and dep and dep > a.depart_before:
            continue
        out.append(o)
    return out


def sort_offers(offers: list, how: str) -> list:
    big = float("inf")
    keys = {
        "price": lambda o: (o["price"]["amount"], o["total_duration_minutes"] or big),
        "duration": lambda o: (o["total_duration_minutes"] or big, o["price"]["amount"]),
        "departure": lambda o: (o["slices"][0]["departure"] or "", o["price"]["amount"]),
        "stops": lambda o: (sum(s["stops"] for s in o["slices"]), o["price"]["amount"]),
    }
    if how == "best":
        if not offers:
            return []
        # equilíbrio preço x tempo: cada hora de viagem "vale" 3% do menor preço
        cheapest = min(o["price"]["amount"] for o in offers)
        return sorted(offers, key=lambda o: o["price"]["amount"] + 0.03 * cheapest * (o["total_duration_minutes"] or 0) / 60)
    return sorted(offers, key=keys[how])


# ---------------------------------------------------------------------------
# Comandos


METRO = [  # aeroportos da mesma região metropolitana, usados por --nearby
    ("GRU", "CGH", "VCP"), ("GIG", "SDU"), ("CNF", "PLU"), ("EZE", "AEP"), ("JFK", "EWR", "LGA"),
    ("CDG", "ORY"), ("LHR", "LGW", "STN"), ("NRT", "HND"), ("MXP", "LIN"), ("FCO", "CIA"), ("ORD", "MDW"),
    ("MIA", "FLL"), ("IAH", "HOU"), ("DXB", "DWC"), ("IST", "SAW"),
]


def airport_list(value: str, nearby: bool) -> str:
    codes = []
    for code in (c.strip().upper() for c in value.split(",") if c.strip()):
        if not re.fullmatch(r"[A-Z]{3}", code):
            raise FlightSearchError(f"Código IATA inválido: {code}. Use 'airports' para descobrir o código.", "invalid_request")
        group = next((g for g in METRO if code in g), (code,)) if nearby else (code,)
        for c in (code, *group):
            if c not in codes:
                codes.append(c)
    if not codes or len(codes) > 7:
        raise FlightSearchError("Informe de 1 a 7 aeroportos por ponta.", "invalid_request")
    return ",".join(codes)


def validate(a: argparse.Namespace) -> dict:
    origin = airport_list(a.origin, getattr(a, "nearby", False))
    dest = airport_list(a.destination, getattr(a, "nearby", False))
    if set(origin.split(",")) & set(dest.split(",")):
        raise FlightSearchError("Origem e destino iguais.", "invalid_request")
    try:
        depart = dt.date.fromisoformat(a.depart)
        ret = dt.date.fromisoformat(a.return_date) if a.return_date else None
    except ValueError:
        raise FlightSearchError("Datas devem estar no formato AAAA-MM-DD.", "invalid_request") from None
    if depart < dt.date.today():
        raise FlightSearchError(f"Data de ida no passado: {depart}.", "invalid_request")
    if ret and ret < depart:
        raise FlightSearchError("Data de volta anterior à de ida.", "invalid_request")
    children = [int(x) for x in a.children_ages.split(",") if x.strip()] if a.children_ages else []
    if any(not 2 <= c <= 17 for c in children):
        raise FlightSearchError("Idades de crianças devem estar entre 2 e 17 (bebês: --infants).", "invalid_request")
    if a.adults < 1 or a.adults + len(children) + a.infants > 9 or a.infants > a.adults:
        raise FlightSearchError("Passageiros: mínimo 1 adulto, máximo 9 no total, no máximo 1 bebê por adulto.", "invalid_request")
    for val in (a.depart_after, a.depart_before):
        if val and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", val):
            raise FlightSearchError(f"Horário inválido: {val} (use HH:MM).", "invalid_request")
    if not 0 <= a.flex_days <= MAX_FLEX_DAYS:
        raise FlightSearchError(f"--flex-days deve estar entre 0 e {MAX_FLEX_DAYS}.", "invalid_request")
    return {
        "origin": origin, "destination": dest,
        "depart": depart.isoformat(), "return": ret.isoformat() if ret else None,
        "adults": a.adults, "children_ages": children, "infants": a.infants,
        "cabin": a.cabin, "currency": a.currency.upper(), "max_stops": a.max_stops,
    }


def cmd_search(a: argparse.Namespace) -> dict:
    base = validate(a)
    provider = a.provider or default_provider()
    if provider not in PROVIDERS:
        raise FlightSearchError(f"Provedor desconhecido: {provider}. Opções: {', '.join(PROVIDERS)}.", "invalid_request")

    today = dt.date.today()
    all_offers, by_date, errors, insights = [], [], [], None
    for shift in range(-a.flex_days, a.flex_days + 1):
        q = dict(base)
        d = dt.date.fromisoformat(base["depart"]) + dt.timedelta(days=shift)
        if d < today:
            continue
        q["depart"] = d.isoformat()
        if base["return"]:
            q["return"] = (dt.date.fromisoformat(base["return"]) + dt.timedelta(days=shift)).isoformat()
        key = cache_key(provider, q)
        entry = None if a.no_cache else cache_get(key)
        cached = isinstance(entry, dict)
        if not cached:
            try:
                offers, day_insights = PROVIDERS[provider](q)
            except FlightSearchError as e:
                if a.flex_days == 0:
                    raise
                errors.append({"depart": q["depart"], "code": e.code, "message": str(e)})
                continue
            entry = {"offers": offers, "insights": day_insights}
            cache_put(key, entry)
        offers, day_insights = entry["offers"], entry.get("insights")
        if shift == 0:
            insights = day_insights
        for o in offers:
            o["search_dates"] = {"depart": q["depart"], "return": q["return"]}
        filtered = apply_filters(offers, a)
        if a.flex_days:
            cheapest = min((o["price"]["amount"] for o in filtered), default=None)
            by_date.append({"depart": q["depart"], "return": q["return"], "cheapest": cheapest, "offers": len(filtered), "cached": cached,
                            "price_level": (day_insights or {}).get("level")})
        all_offers.extend(filtered)

    ranked = sort_offers(all_offers, a.sort)
    result = {
        "query": {**base, "provider": provider, "sort": a.sort, "flex_days": a.flex_days},
        "count": len(ranked),
        "returned": min(len(ranked), a.limit),
        "offers": ranked[: a.limit],
    }
    if ranked:
        prices = [o["price"]["amount"] for o in ranked]
        result["summary"] = {
            "cheapest": min(prices),
            "median": sorted(prices)[len(prices) // 2],
            "fastest_minutes": min((o["total_duration_minutes"] for o in ranked if o["total_duration_minutes"]), default=None),
            "direct_available": any(all(s["stops"] == 0 for s in o["slices"]) for o in ranked),
            "currency": ranked[0]["price"]["currency"],
        }
    if insights:
        result["price_insights"] = insights
    if by_date:
        result["by_date"] = by_date
    if errors:
        result["errors"] = errors
    if provider == "mock":
        result["warning"] = "DADOS FICTÍCIOS (provedor mock). Não use para decisões reais."
    return result


AIRPORTS = [
    ("GRU", "São Paulo", "Guarulhos", "BR"), ("CGH", "São Paulo", "Congonhas", "BR"), ("VCP", "Campinas", "Viracopos", "BR"),
    ("GIG", "Rio de Janeiro", "Galeão", "BR"), ("SDU", "Rio de Janeiro", "Santos Dumont", "BR"), ("BSB", "Brasília", "Presidente Juscelino Kubitschek", "BR"),
    ("CNF", "Belo Horizonte", "Confins", "BR"), ("PLU", "Belo Horizonte", "Pampulha", "BR"), ("POA", "Porto Alegre", "Salgado Filho", "BR"),
    ("CWB", "Curitiba", "Afonso Pena", "BR"), ("FLN", "Florianópolis", "Hercílio Luz", "BR"), ("SSA", "Salvador", "Deputado Luís Eduardo Magalhães", "BR"),
    ("REC", "Recife", "Guararapes", "BR"), ("FOR", "Fortaleza", "Pinto Martins", "BR"), ("NAT", "Natal", "São Gonçalo do Amarante", "BR"),
    ("MCZ", "Maceió", "Zumbi dos Palmares", "BR"), ("JPA", "João Pessoa", "Castro Pinto", "BR"), ("AJU", "Aracaju", "Santa Maria", "BR"),
    ("BEL", "Belém", "Val de Cans", "BR"), ("MAO", "Manaus", "Eduardo Gomes", "BR"), ("GYN", "Goiânia", "Santa Genoveva", "BR"),
    ("CGB", "Cuiabá", "Marechal Rondon", "BR"), ("CGR", "Campo Grande", "Campo Grande", "BR"), ("VIX", "Vitória", "Eurico de Aguiar Salles", "BR"),
    ("IGU", "Foz do Iguaçu", "Cataratas", "BR"), ("NVT", "Navegantes", "Ministro Victor Konder", "BR"), ("SLZ", "São Luís", "Marechal Cunha Machado", "BR"),
    ("THE", "Teresina", "Senador Petrônio Portella", "BR"), ("PMW", "Palmas", "Brigadeiro Lysias Rodrigues", "BR"), ("RAO", "Ribeirão Preto", "Leite Lopes", "BR"),
    ("UDI", "Uberlândia", "Ten. Cel. Aviador César Bombonato", "BR"), ("LDB", "Londrina", "Gov. José Richa", "BR"), ("JOI", "Joinville", "Lauro Carneiro de Loyola", "BR"),
    ("BPS", "Porto Seguro", "Porto Seguro", "BR"), ("FEN", "Fernando de Noronha", "Fernando de Noronha", "BR"),
    ("EZE", "Buenos Aires", "Ezeiza", "AR"), ("AEP", "Buenos Aires", "Aeroparque", "AR"), ("SCL", "Santiago", "Arturo Merino Benítez", "CL"),
    ("MVD", "Montevidéu", "Carrasco", "UY"), ("LIM", "Lima", "Jorge Chávez", "PE"), ("BOG", "Bogotá", "El Dorado", "CO"),
    ("PTY", "Cidade do Panamá", "Tocumen", "PA"), ("MEX", "Cidade do México", "Benito Juárez", "MX"), ("CUN", "Cancún", "Cancún", "MX"),
    ("MIA", "Miami", "Miami International", "US"), ("MCO", "Orlando", "Orlando International", "US"), ("JFK", "Nova York", "John F. Kennedy", "US"),
    ("EWR", "Nova York", "Newark", "US"), ("ATL", "Atlanta", "Hartsfield-Jackson", "US"), ("IAH", "Houston", "George Bush", "US"),
    ("LAX", "Los Angeles", "Los Angeles International", "US"), ("YYZ", "Toronto", "Pearson", "CA"),
    ("LIS", "Lisboa", "Humberto Delgado", "PT"), ("OPO", "Porto", "Francisco Sá Carneiro", "PT"), ("MAD", "Madri", "Barajas", "ES"),
    ("BCN", "Barcelona", "El Prat", "ES"), ("CDG", "Paris", "Charles de Gaulle", "FR"), ("ORY", "Paris", "Orly", "FR"),
    ("LHR", "Londres", "Heathrow", "GB"), ("LGW", "Londres", "Gatwick", "GB"), ("FRA", "Frankfurt", "Frankfurt", "DE"),
    ("MUC", "Munique", "Munique", "DE"), ("AMS", "Amsterdã", "Schiphol", "NL"), ("FCO", "Roma", "Fiumicino", "IT"),
    ("MXP", "Milão", "Malpensa", "IT"), ("ZRH", "Zurique", "Zurique", "CH"), ("IST", "Istambul", "Istambul", "TR"),
    ("DXB", "Dubai", "Dubai International", "AE"), ("DOH", "Doha", "Hamad", "QA"), ("JNB", "Joanesburgo", "O. R. Tambo", "ZA"),
    ("NRT", "Tóquio", "Narita", "JP"), ("HND", "Tóquio", "Haneda", "JP"), ("SIN", "Singapura", "Changi", "SG"),
]


def cmd_airports(a: argparse.Namespace) -> dict:
    term = strip_accents(a.query.strip())
    matches = [
        {"iata": c, "city": city, "name": name, "country": cc, "source": "local"}
        for c, city, name, cc in AIRPORTS
        if term == c.lower() or term in strip_accents(city) or term in strip_accents(name)
    ]
    matches.sort(key=lambda m: m["iata"].lower() != term)  # código exato primeiro
    return {"query": a.query, "count": len(matches), "airports": matches[:20]}


# ---------------------------------------------------------------------------
# Estado persistente (monitores e reservas pendentes)


def state_dir() -> str:
    return os.environ.get("FLIGHTS_STATE_DIR") or os.path.join(os.path.expanduser("~"), ".local", "state", "openclaw-flight-search")


def load_state(name: str, default):
    try:
        with open(os.path.join(state_dir(), name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_state(name: str, data) -> None:
    os.makedirs(state_dir(), mode=0o700, exist_ok=True)
    path = os.path.join(state_dir(), name)
    tmp = path + ".tmp"
    with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def parse_search_argv(argv: list) -> argparse.Namespace:
    try:
        args = build_parser().parse_args(["search", *argv])
    except SystemExit:
        raise FlightSearchError("Parâmetros de busca inválidos para o monitor (veja 'search --help').", "invalid_request") from None
    validate(args)
    return args


# ---------------------------------------------------------------------------
# Monitor de preço. O agendamento fica com o cron do OpenClaw, que roda 'watch check'.

WATCHES_FILE = "watches.json"
MAX_HISTORY = 60


def cmd_watch_add(a: argparse.Namespace) -> dict:
    argv = [x for x in a.search_args if x != "--"]
    sargs = parse_search_argv(argv)
    if a.target_price is None and a.drop_percent is None:
        raise FlightSearchError("Informe --target-price e/ou --drop-percent.", "invalid_request")
    watches = load_state(WATCHES_FILE, [])
    watch = {
        "id": "w_" + secrets.token_hex(3),
        "label": a.label or f"{sargs.origin.upper()}→{sargs.destination.upper()} {sargs.depart}" + (f"/{sargs.return_date}" if sargs.return_date else ""),
        "search_args": argv,
        "target_price": a.target_price,
        "drop_percent": a.drop_percent,
        "created_at": now_iso(),
        "status": "active",
        "last_price": None,
        "best_price": None,
        "last_alert_price": None,
        "history": [],
    }
    watches.append(watch)
    save_state(WATCHES_FILE, watches)
    return {"kind": "watch_added", "watch": watch}


def cmd_watch_list(a: argparse.Namespace) -> dict:
    watches = load_state(WATCHES_FILE, [])
    return {"kind": "watch_list", "count": len(watches), "watches": [{k: v for k, v in w.items() if k != "history"} for w in watches]}


def cmd_watch_remove(a: argparse.Namespace) -> dict:
    watches = load_state(WATCHES_FILE, [])
    kept = [w for w in watches if w["id"] != a.watch_id]
    if len(kept) == len(watches):
        raise FlightSearchError(f"Monitor não encontrado: {a.watch_id}.", "not_found")
    save_state(WATCHES_FILE, kept)
    return {"kind": "watch_removed", "id": a.watch_id}


def cmd_watch_check(a: argparse.Namespace) -> dict:
    watches = load_state(WATCHES_FILE, [])
    alerts, checked, errors = [], [], []
    today = dt.date.today().isoformat()
    for w in watches:
        if w["status"] != "active" or (a.watch_id and w["id"] != a.watch_id):
            continue
        sargs = build_parser().parse_args(["search", *w["search_args"], "--no-cache", "--limit", "3"])
        if sargs.depart < today:
            w["status"] = "expired"
            continue
        try:
            res = cmd_search(sargs)
        except FlightSearchError as e:
            errors.append({"id": w["id"], "label": w["label"], "code": e.code, "message": str(e)})
            continue
        price = (res.get("summary") or {}).get("cheapest")
        checked.append({"id": w["id"], "label": w["label"], "price": price})
        if price is None:
            continue
        currency = res["summary"]["currency"]
        previous = w["last_price"]
        reason = None
        if w["target_price"] is not None and price <= w["target_price"] and (w["last_alert_price"] is None or price < w["last_alert_price"]):
            reason = "target_reached"
        elif w["drop_percent"] is not None and previous and price <= previous * (1 - w["drop_percent"] / 100):
            reason = "price_drop"
        if reason:
            w["last_alert_price"] = price
            alerts.append({
                "id": w["id"], "label": w["label"], "reason": reason, "price": price, "currency": currency,
                "previous_price": previous, "target_price": w["target_price"], "best_price_seen": w["best_price"],
                "top_offers": res["offers"],
            })
        w["last_price"] = price
        w["best_price"] = price if w["best_price"] is None else min(w["best_price"], price)
        w["last_checked_at"] = now_iso()
        w["history"] = (w["history"] + [{"at": w["last_checked_at"], "price": price}])[-MAX_HISTORY:]
    save_state(WATCHES_FILE, watches)
    return {"kind": "watch_check", "alerts": alerts, "checked": checked, "errors": errors}


# ---------------------------------------------------------------------------
# Cotação (uma página, minimalista): opção principal + 2–3 alternativas com conexão,
# do menor ao maior preço, com ida e volta, conexões e link de validação no Google Flights.

WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
CABIN_PT = {"economy": "Econômica", "premium_economy": "Premium Economy", "business": "Executiva", "first": "Primeira classe"}
CURRENCY_SYMBOL = {"BRL": "R$", "USD": "US$", "EUR": "€", "GBP": "£"}


def money_q(amount: float, currency: str) -> str:
    """Valor para o cliente: símbolo em vez do código ISO (R$ 12.626,00)."""
    return money(amount, currency).replace(currency, CURRENCY_SYMBOL.get(currency, currency), 1)


def money_short(amount: float, currency: str) -> str:
    """Sem centavos, para resumos: R$ 12.626."""
    s = f"{amount:,.0f}".replace(",", ".")
    return f"{CURRENCY_SYMBOL.get(currency, currency)} {s}"


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def city_of(code: str | None) -> str:
    code = (code or "").split(",")[0]
    return next((city for c, city, *_ in AIRPORTS if c == code), code)


def date_pt(value: str | dt.date) -> str:
    d = dt.date.fromisoformat(value[:10]) if isinstance(value, str) else value
    return f"{WEEKDAYS[d.weekday()]}, {d.day} {MONTHS[d.month - 1]}"


def outbound_signature(offer: dict) -> tuple:
    return tuple(seg.get("flight_number") for seg in offer["slices"][0]["segments"])


def select_options(offers: list, extra: int) -> list:
    """Principal = melhor equilíbrio preço × tempo; alternativas = as mais baratas com conexão."""
    pool, seen = [], set()
    for o in sort_offers([o for o in offers if o["price"]["amount"] is not None], "price"):
        sig = outbound_signature(o)
        if sig not in seen:
            seen.add(sig)
            pool.append(o)
    if not pool:
        return []
    main = sort_offers(pool, "best")[0]
    connecting = [o for o in pool if o is not main and o["slices"][0]["stops"] > 0]
    others = [o for o in pool if o is not main and o not in connecting]
    return [main] + (connecting + others)[:extra]


def render_slice(label: str, s: dict) -> str:
    """Uma linha por trecho: horários nas pontas, barra proporcional (voo escuro, conexão clara)
    e, abaixo, cada voo e cada conexão por extenso."""
    try:
        plus = (parse_local(s["arrival"]).date() - parse_local(s["departure"]).date()).days
    except (TypeError, ValueError):
        plus = 0
    bar, legs = [], []
    layovers = s.get("layovers") or []
    for i, seg in enumerate(s["segments"]):
        bar.append(f'<i class="f" style="flex-grow:{seg.get("duration_minutes") or 60}"></i>')
        legs.append(
            f'<span class="leg"><b>{esc(seg.get("flight_number"))}</b> {esc(seg.get("from"))} {esc(local_hhmm(seg.get("departure")))}'
            f' → {esc(seg.get("to"))} {esc(local_hhmm(seg.get("arrival")))} · {esc(fmt_minutes(seg.get("duration_minutes")))}</span>'
        )
        if i < len(layovers):
            lay = layovers[i]
            bar.append(f'<i class="w" style="flex-grow:{max(lay.get("duration_minutes") or 20, 20)}"></i>')
            flag = " · troca de aeroporto" if lay.get("change_airport") else (" · pernoite" if lay.get("overnight") else "")
            legs.append(f'<span class="lay">Conexão em {esc(city_of(lay.get("airport")))} <b>{esc(fmt_minutes(lay.get("duration_minutes")))}</b>{esc(flag)}</span>')
    stops = "Direto" if s["stops"] == 0 else f'{s["stops"]} {"conexão" if s["stops"] == 1 else "conexões"}'
    return f"""
      <div class="slice">
        <div class="when"><b>{esc(label)}</b><span>{esc(date_pt(s["departure"]))}</span></div>
        <div class="route-line">
          <div class="ends"><span><b>{esc(local_hhmm(s["departure"]))}</b> {esc(s["origin"])}</span><span><b>{esc(local_hhmm(s["arrival"]))}</b>{f"<sup>+{plus}</sup>" if plus > 0 else ""} {esc(s["destination"])}</span></div>
          <div class="bar">{"".join(bar)}</div>
          <div class="legs">{"".join(legs)}</div>
        </div>
        <div class="total"><b>{esc(fmt_minutes(s["duration_minutes"]))}</b><span>{esc(stops)}</span></div>
      </div>"""


def render_card(rank: int, o: dict, tags: list, seats: int) -> str:
    amount, currency = o["price"]["amount"], o["price"]["currency"]
    per = f'<span class="per">{esc(money_short(amount / seats, currency))} por pessoa</span>' if seats > 1 else ""
    tag_html = "".join(f'<span class="tag {esc(cls)}">{esc(text)}</span>' for text, cls in tags)
    slices = o["slices"]
    rows = render_slice("Ida", slices[0])
    if len(slices) > 1:
        rows += render_slice("Volta", slices[1])
    elif o.get("return_missing"):
        rows += '<div class="slice note">Volta: detalhes indisponíveis nesta consulta; confira no link.</div>'
    link = o.get("validation_url") or (o.get("booking") or {}).get("google_flights_url")
    link_html = f'<a class="gf" href="{esc(link)}" target="_blank" rel="noopener">Validar no Google Flights&nbsp;↗</a>' if link else ""
    return f"""
    <article class="card">
      <header class="card-head">
        <span class="rank">{rank:02d}</span>
        <div class="price"><b>{esc(money_q(amount, currency))}</b>{per}</div>
        <div class="who"><span class="air">{esc(" · ".join(a for a in o["airlines"] if a))}</span>{tag_html}</div>
        {link_html}
      </header>
      {rows}
    </article>"""


def find_browser() -> str | None:
    import shutil
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"):
        path = shutil.which(name)
        if path:
            return path
    for path in ("/opt/pw-browsers/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"):
        if os.path.exists(path):
            return path
    return None


def cmd_quote(a: argparse.Namespace) -> dict:
    if a.from_json:
        try:
            with open(a.from_json, encoding="utf-8") as f:
                result = json.load(f)
        except (OSError, ValueError) as e:
            raise FlightSearchError(f"Não consegui ler {a.from_json}: {e}", "invalid_request") from None
        if "offers" not in result or "query" not in result:
            raise FlightSearchError("O JSON precisa ser a saída de 'search' (com query e offers).", "invalid_request")
    else:
        argv = [x for x in a.search_args if x != "--"]
        if not argv:
            raise FlightSearchError("Informe --from-json ou os argumentos de busca após '--'.", "invalid_request")
        result = cmd_search(parse_search_argv(argv + ["--limit", "60"]))
    q, offers = result["query"], result["offers"]
    if not offers:
        raise FlightSearchError("A busca não trouxe ofertas para montar a cotação.", "no_results")

    chosen = [json.loads(json.dumps(o)) for o in select_options(offers, max(2, min(a.extra, 3)))]
    for o in chosen:  # recalcula conexões (cobre JSON de versões anteriores)
        o["slices"] = [build_slice(s["segments"], s["duration_minutes"]) for s in o["slices"]]
    main_id = chosen[0]["id"]
    return_lookups = 0
    if q.get("return") and not a.no_return:
        for o in chosen:
            token = (o.get("booking") or {}).get("departure_token")
            if o["provider"] != "serpapi" or not token:
                continue
            try:
                back = serpapi_return(q, token)
                return_lookups += 1
            except FlightSearchError:
                back = None
            if back:
                o["slices"] = [o["slices"][0], back["slice"]]
                o["price"]["amount"] = back["price"]
                o["airlines"] = list(dict.fromkeys(o["airlines"] + back["airlines"]))
                o["total_duration_minutes"] = sum_durations(o["slices"])
                o["validation_url"] = back["url"]
            else:
                o["return_missing"] = True
    chosen.sort(key=lambda o: (o["price"]["amount"], o["total_duration_minutes"] or 0))

    currency = chosen[0]["price"]["currency"]
    seats = q["adults"] + len(q.get("children_ages") or [])
    fastest = min(chosen, key=lambda o: o["total_duration_minutes"] or 10**9)
    cards, options_out = [], []
    for rank, o in enumerate(chosen, 1):
        tags = []
        if rank == 1:
            tags.append(("Mais em conta", "accent"))
        if o["id"] == main_id:
            tags.append(("Recomendada", "dark"))
        if o is fastest and len(chosen) > 1:
            tags.append(("Mais rápida", ""))
        cards.append(render_card(rank, o, tags, seats))
        options_out.append({
            "rank": rank, "price": o["price"], "airlines": o["airlines"], "tags": [t for t, _ in tags],
            "total_duration_minutes": o["total_duration_minutes"],
            "slices": [{"from": s["origin"], "to": s["destination"], "departure": s["departure"], "duration_minutes": s["duration_minutes"],
                        "flights": [seg["flight_number"] for seg in s["segments"]],
                        "layovers": [{"airport": l["airport"], "minutes": l["duration_minutes"]} for l in s.get("layovers") or []]}
                       for s in o["slices"]],
            "validation_url": o.get("validation_url") or (o.get("booking") or {}).get("google_flights_url"),
        })

    brand = a.brand or os.environ.get("FLIGHTS_BRAND_NAME") or "Argos Core"
    now = dt.datetime.now()
    valid = now + dt.timedelta(hours=a.valid_hours)
    o_code, d_code = q["origin"].split(",")[0], q["destination"].split(",")[0]
    reference = f"AC-{now:%y%m%d}-{o_code}{d_code}-{secrets.token_hex(2).upper()}"
    pax = [f"{q['adults']} adulto{'s' if q['adults'] > 1 else ''}"]
    if q.get("children_ages"):
        pax.append(f"{len(q['children_ages'])} criança{'s' if len(q['children_ages']) > 1 else ''}")
    if q.get("infants"):
        pax.append(f"{q['infants']} bebê{'s' if q['infants'] > 1 else ''}")
    dates = date_pt(q["depart"]) + (f" – {date_pt(q['return'])}" if q.get("return") else "")
    meta = [q["origin"].replace(",", "/") + " → " + q["destination"].replace(",", "/"), dates + f" {q['depart'][:4]}",
            ", ".join(pax), CABIN_PT.get(q["cabin"], q["cabin"])]
    trip_label = "Ida e volta" if q.get("return") else "Só ida"
    if q.get("provider") == "mock":
        trip_label = "Amostra com dados fictícios · " + trip_label

    pi = result.get("price_insights") or {}
    rng = pi.get("typical_range") or []
    level = {"low": "abaixo do típico", "typical": "dentro do típico", "high": "acima do típico"}.get(pi.get("level"), "")
    stats = [("A partir de", money_short(chosen[0]["price"]["amount"], currency), f"{len(chosen)} opções de {result['count']} analisadas"),
             ("Mais rápida", fmt_minutes(fastest["total_duration_minutes"]), "em voo e conexões, ida" + (" e volta" if q.get("return") else ""))]
    if len(rng) == 2:
        stats.append(("Faixa típica · Google", f"{money_short(rng[0], currency)}–{money_short(rng[1], currency).split(' ', 1)[1]}", f"Preço atual {level}" if level else ""))
    summary_html = "".join(f'<div class="stat"><span class="label">{esc(k)}</span><b>{esc(v)}</b><small>{esc(n)}</small></div>' for k, v, n in stats)

    mock_note = "Amostra com dados fictícios. " if q.get("provider") == "mock" else ""
    footnote = (f"{mock_note}Valores totais para {', '.join(pax)}, em {CURRENCY_SYMBOL.get(currency, currency)}, consultados no Google Flights em "
                f"{now.day} {MONTHS[now.month - 1]} {now.year}, {now:%H:%M}. Tarifas mudam sem aviso: valide cada opção no link antes de emitir. "
                "Horários locais; +1 indica chegada no dia seguinte. Bagagem e regras de alteração dependem da tarifa.")
    values = {
        "title": f"Cotação {o_code}–{d_code}",
        "brand": esc(brand),
        "reference": esc(reference),
        "issued": esc(f"{now.day} {MONTHS[now.month - 1]}, {now:%H:%M}"),
        "valid_until": esc(f"{valid.day} {MONTHS[valid.month - 1]}, {valid:%H:%M}"),
        "route_title": f"{esc(city_of(o_code))} <span>→</span> {esc(city_of(d_code))}",
        "route_meta": " · ".join(esc(m) for m in meta),
        "client_line": f'<p class="client">Para {esc(a.client)}</p>' if a.client else "",
        "trip_label": esc(trip_label),
        # cada voo/conexão é uma linha; acima de ~22 linhas a impressão reduz a escala para caber em uma página
        "print_zoom": f"{min(1.0, max(0.78, 22 / max(1, sum(len(sl['segments']) * 2 - 1 for o in chosen for sl in o['slices'])))):.2f}",
        "summary_html": summary_html,
        "options_html": "".join(cards),
        "footnote": esc(footnote),
    }
    template_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates", "quote.html")
    with open(template_path, encoding="utf-8") as f:
        page = f.read()
    for key, value in values.items():
        page = page.replace("{{" + key + "}}", str(value))

    out = a.output or os.path.join(state_dir(), "quotes", f"{reference}.html")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    response = {"kind": "quote", "reference": reference, "html_path": os.path.abspath(out), "client": a.client,
                "valid_until": valid.isoformat(timespec="minutes"), "return_lookups": return_lookups, "options": options_out}
    if a.pdf:
        browser = find_browser()
        if not browser:
            response["pdf_error"] = "Nenhum Chrome/Chromium encontrado; envie o HTML ou imprima em PDF pelo navegador."
        else:
            import subprocess
            pdf_path = os.path.splitext(os.path.abspath(out))[0] + ".pdf"
            proc = subprocess.run([browser, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                                   "--virtual-time-budget=8000",  # dá tempo às fontes carregarem antes de imprimir
                                   f"--print-to-pdf={pdf_path}", "file://" + os.path.abspath(out)],
                                  capture_output=True, text=True, timeout=90)
            if os.path.exists(pdf_path):
                response["pdf_path"] = pdf_path
            else:
                response["pdf_error"] = (proc.stderr or "falha ao gerar PDF")[-300:]
    return response


# ---------------------------------------------------------------------------
# Saída em texto compacto (economiza tokens do agente)


def money(amount: float, currency: str) -> str:
    s = f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{currency} {s}"


def describe_slice(s: dict) -> str:
    dep, arr = local_hhmm(s["departure"]), local_hhmm(s["arrival"])
    days = ""
    try:
        diff = (parse_local(s["arrival"]).date() - parse_local(s["departure"]).date()).days
        days = f"+{diff}" if diff > 0 else ""
    except (TypeError, ValueError):
        pass
    stops = "direto" if s["stops"] == 0 else f"{s['stops']} parada(s): " + ", ".join(
        f"{l['airport']} {fmt_minutes(l['duration_minutes'])}" for l in s.get("layovers") or [])
    flights = "/".join(seg["flight_number"] for seg in s["segments"] if seg.get("flight_number"))
    return f"{s['origin']}→{s['destination']} {(s['departure'] or '')[:10]} {dep}→{arr}{days} {fmt_minutes(s['duration_minutes'])} {stops} [{flights}]"


def watch_text(result: dict) -> str:
    kind = result["kind"]
    if kind == "watch_added":
        w = result["watch"]
        rules = ([f"alvo {w['target_price']:g}"] if w["target_price"] is not None else []) + ([f"queda ≥ {w['drop_percent']:g}%"] if w["drop_percent"] is not None else [])
        return f"Monitor {w['id']} criado: {w['label']} · {' · '.join(rules)}"
    if kind == "watch_removed":
        return f"Monitor {result['id']} removido."
    if kind == "watch_list":
        return "\n".join(
            f"{w['id']} [{w['status']}] {w['label']} · alvo {w['target_price']} · último {w['last_price']} · melhor {w['best_price']}"
            for w in result["watches"]
        ) or "Nenhum monitor."
    lines = []
    for al in result["alerts"]:
        why = "atingiu o alvo" if al["reason"] == "target_reached" else f"caiu de {money(al['previous_price'], al['currency'])}"
        lines.append(f"ALERTA {al['id']} {al['label']}: {money(al['price'], al['currency'])} ({why})")
        for i, o in enumerate(al["top_offers"], 1):
            lines.append(f"  {i}. {money(o['price']['amount'], o['price']['currency'])} | {', '.join(x for x in o['airlines'] if x)} | "
                         + " || ".join(describe_slice(s) for s in o["slices"]) + f" | id={o['id']}")
    for e in result["errors"]:
        lines.append(f"erro {e['id']} {e['label']}: {e['message']}")
    if not result["alerts"]:
        lines.insert(0, f"Nenhum alerta ({len(result['checked'])} monitor(es) verificado(s)).")
    return "\n".join(lines)


def to_text(result: dict) -> str:
    if result.get("kind") == "quote":
        lines = [f"Cotação {result['reference']}" + (f" para {result['client']}" if result.get("client") else "") + f" (válida até {result['valid_until']})",
                 f"HTML: {result['html_path']}"]
        if result.get("pdf_path"):
            lines.append(f"PDF: {result['pdf_path']}")
        if result.get("pdf_error"):
            lines.append(f"PDF não gerado: {result['pdf_error']}")
        for o in result["options"]:
            legs = " || ".join(
                f"{sl['from']}→{sl['to']} {fmt_minutes(sl['duration_minutes'])}"
                + (" (conexões: " + ", ".join(f"{l['airport']} {fmt_minutes(l['minutes'])}" for l in sl["layovers"]) + ")" if sl["layovers"] else " direto")
                for sl in o["slices"])
            tags = f" [{', '.join(o['tags'])}]" if o["tags"] else ""
            lines.append(f"  {o['rank']}. {money(o['price']['amount'], o['price']['currency'])} | {', '.join(o['airlines'])}{tags} | {legs}")
            lines.append(f"     {o['validation_url']}")
        return "\n".join(lines)
    if result.get("kind", "").startswith("watch"):
        return watch_text(result)
    if "airports" in result:
        return "\n".join(f"{x['iata']} — {x['city']} ({x['name']}, {x['country']})" for x in result["airports"]) or "Nenhum aeroporto encontrado."
    q = result["query"]
    trip = f"ida e volta {q['depart']}/{q['return']}" if q["return"] else f"só ida {q['depart']}"
    pax = f"{q['adults']} adulto(s)" + (f", {len(q['children_ages'])} criança(s)" if q["children_ages"] else "") + (f", {q['infants']} bebê(s)" if q["infants"] else "")
    lines = [f"{q['origin']}→{q['destination']} · {trip} · {pax} · {q['cabin']} · {q['provider']} · {result['count']} ofertas (mostrando {result['returned']})"]
    if result.get("warning"):
        lines.append("⚠ " + result["warning"])
    pi = result.get("price_insights")
    if pi and pi.get("level"):
        level = {"low": "BAIXO", "typical": "típico", "high": "ALTO"}.get(pi["level"], pi["level"])
        rng = pi.get("typical_range") or []
        typical = f"; faixa típica {money(rng[0], q['currency'])}–{money(rng[1], q['currency'])}" if len(rng) == 2 else ""
        lines.append(f"Avaliação do Google: preço {level}{typical}")
    for i, o in enumerate(result["offers"], 1):
        lines.append(f"{i}. {money(o['price']['amount'], o['price']['currency'])} | {', '.join(a for a in o['airlines'] if a)} | " + " || ".join(describe_slice(s) for s in o["slices"]) + f" | id={o['id']}")
    for d in result.get("by_date", []):
        cheapest = money(d["cheapest"], q["currency"]) if d["cheapest"] is not None else "—"
        level = f", preço {d['price_level']}" if d.get("price_level") else ""
        lines.append(f"  data {d['depart']}{'/' + d['return'] if d['return'] else ''}: menor {cheapest} ({d['offers']} ofertas{level})")
    for e in result.get("errors", []):
        lines.append(f"  erro em {e['depart']}: {e['message']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="flights.py", description="Pesquisa e monitoramento de preços de voos (Google Flights via SerpApi). Não reserva nem compra.")
    p.add_argument("--version", action="version", version=VERSION)
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("search", help="Buscar ofertas de voo")
    s.add_argument("--from", dest="origin", required=True, help="IATA de origem (ex.: GRU ou GRU,VCP)")
    s.add_argument("--to", dest="destination", required=True, help="IATA de destino (ex.: LIS ou LIS,OPO)")
    s.add_argument("--nearby", action="store_true", help="Incluir aeroportos da mesma cidade (ex.: GRU → GRU,CGH,VCP)")
    s.add_argument("--depart", required=True, help="Data de ida AAAA-MM-DD")
    s.add_argument("--return", dest="return_date", help="Data de volta AAAA-MM-DD (omitir = só ida)")
    s.add_argument("--adults", type=int, default=1)
    s.add_argument("--children-ages", default="", help="Idades das crianças (2-17), separadas por vírgula. Ex.: 5,9")
    s.add_argument("--infants", type=int, default=0, help="Bebês de colo (<2 anos)")
    s.add_argument("--cabin", choices=["economy", "premium_economy", "business", "first"], default="economy")
    s.add_argument("--currency", default=os.environ.get("FLIGHTS_CURRENCY", "BRL"), help="Moeda (padrão BRL)")
    s.add_argument("--max-stops", type=int, choices=[0, 1, 2])
    s.add_argument("--max-price", type=float)
    s.add_argument("--max-duration", type=float, help="Duração máxima por trecho, em horas")
    s.add_argument("--airlines", help="Somente estas cias (nomes ou códigos IATA, separados por vírgula)")
    s.add_argument("--exclude-airlines", help="Excluir estas cias")
    s.add_argument("--depart-after", help="Partida da ida a partir de HH:MM (hora local)")
    s.add_argument("--depart-before", help="Partida da ida até HH:MM (hora local)")
    s.add_argument("--flex-days", type=int, default=0, help=f"Buscar também ±N dias (0-{MAX_FLEX_DAYS}); cada dia é uma chamada")
    s.add_argument("--sort", choices=["price", "duration", "departure", "stops", "best"], default="price")
    s.add_argument("--limit", type=int, default=10)
    s.add_argument("--provider", choices=list(PROVIDERS), help="Padrão: serpapi (mock = dados fictícios para teste)")
    s.add_argument("--no-cache", action="store_true")
    s.add_argument("--format", choices=["json", "text"], default="json")
    s.set_defaults(func=cmd_search)

    ap = sub.add_parser("airports", help="Descobrir códigos IATA por cidade/aeroporto")
    ap.add_argument("query")
    ap.add_argument("--format", choices=["json", "text"], default="json")
    ap.set_defaults(func=cmd_airports)

    w = sub.add_parser("watch", help="Monitorar preços (rode 'watch check' periodicamente)")
    wsub = w.add_subparsers(dest="watch_command", required=True)
    wa = wsub.add_parser("add", help="Criar monitor: watch add --target-price 3000 -- --from GRU --to LIS --depart AAAA-MM-DD")
    wa.add_argument("--target-price", type=float, help="Alertar quando o menor preço for ≤ este valor")
    wa.add_argument("--drop-percent", type=float, help="Alertar quando cair ≥ N%% desde a última verificação")
    wa.add_argument("--label")
    wa.add_argument("search_args", nargs=argparse.REMAINDER, help="Argumentos do 'search' após '--'")
    wa.set_defaults(func=cmd_watch_add)
    wl = wsub.add_parser("list")
    wl.set_defaults(func=cmd_watch_list)
    wr = wsub.add_parser("remove")
    wr.add_argument("watch_id")
    wr.set_defaults(func=cmd_watch_remove)
    wc = wsub.add_parser("check", help="Verificar monitores ativos e emitir alertas")
    wc.add_argument("--id", dest="watch_id")
    wc.set_defaults(func=cmd_watch_check)

    qt = sub.add_parser("quote", help="Gerar cotação de uma página em HTML (e PDF)")
    qt.add_argument("--from-json", help="Saída JSON de um 'search' já feito")
    qt.add_argument("--client", help="Nome do cliente (opcional)")
    qt.add_argument("--extra", type=int, default=3, help="Alternativas com conexão além da principal (2 ou 3)")
    qt.add_argument("--no-return", action="store_true", help="Não buscar os voos de volta (economiza 1 busca por opção)")
    qt.add_argument("--valid-hours", type=int, default=24, help="Validade da cotação em horas")
    qt.add_argument("--brand", help="Marca exibida (padrão: FLIGHTS_BRAND_NAME ou Argos Core)")
    qt.add_argument("--output", help="Caminho do HTML (padrão: pasta de estado/quotes)")
    qt.add_argument("--pdf", action="store_true", help="Gerar PDF também (requer Chrome/Chromium)")
    qt.add_argument("search_args", nargs=argparse.REMAINDER, help="Argumentos do 'search' após '--' (se não usar --from-json)")
    qt.set_defaults(func=cmd_quote)

    for parser in (wa, wl, wr, wc, qt):
        parser.add_argument("--format", choices=["json", "text"], default="json")
    return p


def load_env_file() -> None:
    """Lê KEY=VALOR do .env da skill (pasta acima de scripts/). Variáveis já definidas no ambiente têm prioridade."""
    path = os.environ.get("FLIGHTS_ENV_FILE") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                value = value.strip().strip('"').strip("'")
                if value:
                    os.environ.setdefault(key.strip(), value)
    except OSError:
        pass


def main(argv: list | None = None) -> int:
    load_env_file()
    args = build_parser().parse_args(argv)
    try:
        result = args.func(args)
    except FlightSearchError as e:
        print(json.dumps({"error": {"code": e.code, "message": str(e), "status": e.status}}, ensure_ascii=False))
        return 1
    if args.format == "text":
        print(to_text(result))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
