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

VERSION = "2.1.0"
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


def search_serpapi(q: dict) -> list:
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
    resp = http_json("GET", "https://serpapi.com/search.json?" + urllib.parse.urlencode(params), {})
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
        legs = [(q["origin"], q["destination"], q["depart"])]
        if q.get("return"):
            legs.append((q["destination"], q["origin"], q["return"]))
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
    return {
        "origin": first.get("from"),
        "destination": last.get("to"),
        "departure": first.get("departure"),
        "arrival": last.get("arrival"),
        "duration_minutes": duration,
        "stops": max(len(segments) - 1, 0),
        "segments": segments,
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


def validate(a: argparse.Namespace) -> dict:
    origin, dest = a.origin.upper(), a.destination.upper()
    for code in (origin, dest):
        if not re.fullmatch(r"[A-Z]{3}", code):
            raise FlightSearchError(f"Código IATA inválido: {code}. Use 'airports' para descobrir o código.", "invalid_request")
    if origin == dest:
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
# Cotação para o cliente (HTML de papelaria, pronto para enviar ou imprimir em PDF)

WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
CABIN_PT = {"economy": "Classe econômica", "premium_economy": "Premium economy", "business": "Classe executiva", "first": "Primeira classe"}
CURRENCY_PT = {"BRL": "reais", "USD": "dólares americanos", "EUR": "euros"}
ROMAN = ["I", "II", "III", "IV", "V"]
AMENITIES_PT = [
    (r"legroom \((\d+) cm\)", "Espaço entre poltronas {0} cm"),
    (r"^Free Wi-Fi", "Wi-Fi gratuito"),
    (r"^Wi-Fi for a fee", "Wi-Fi pago"),
    (r"power & USB", "Tomada e USB na poltrona"),
    (r"^In-seat power outlet", "Tomada na poltrona"),
    (r"^In-seat USB", "USB na poltrona"),
    (r"^On-demand video", "Entretenimento individual"),
    (r"^Lie flat seat", "Assento-cama"),
]


CURRENCY_SYMBOL = {"BRL": "R$", "USD": "US$", "EUR": "€", "GBP": "£"}


def money_q(amount: float, currency: str) -> str:
    """Valor para o cliente: símbolo em vez do código ISO (R$ 12.626,00)."""
    return money(amount, currency).replace(currency, CURRENCY_SYMBOL.get(currency, currency), 1)


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def city_of(code: str | None) -> str:
    return next((city for c, city, *_ in AIRPORTS if c == code), code or "")


def date_pt(value: str | dt.date) -> str:
    d = dt.date.fromisoformat(value[:10]) if isinstance(value, str) else value
    return f"{WEEKDAYS[d.weekday()]}, {d.day} {MONTHS[d.month - 1]} {d.year}"


def amenities_pt(segment: dict) -> list:
    out = []
    for raw in segment.get("amenities") or []:
        for pattern, label in AMENITIES_PT:
            m = re.search(pattern, raw)
            if m:
                out.append(label.format(*m.groups()))
                break
    return out


def pick_options(offers: list, count: int) -> list:
    """Curadoria: recomendação (preço × tempo), a mais econômica e a mais rápida, sem repetir."""
    if not offers:
        return []
    by_best, by_price, by_time = sort_offers(offers, "best"), sort_offers(offers, "price"), sort_offers(offers, "duration")
    picks, seen = [], set()

    def add(offer, role):
        if offer["id"] not in seen and len(picks) < count:
            seen.add(offer["id"])
            picks.append((offer, role))

    add(by_best[0], "recommended")
    add(by_price[0], "cheapest")
    add(by_time[0], "fastest")
    for o in by_best:
        add(o, "alternative")
    return picks


def option_reason(offer: dict, role: str, cheapest: dict, recommended: dict, currency: str) -> str:
    s = offer["slices"][0]
    diff = offer["price"]["amount"] - cheapest["price"]["amount"]
    stops = "voo direto" if s["stops"] == 0 else f"{s['stops']} conexão em {city_of(s['segments'][0]['to'])}" if s["stops"] == 1 else f"{s['stops']} conexões"
    dur = fmt_minutes(s["duration_minutes"])
    if role == "recommended":
        if diff <= 0:
            return f"A menor tarifa encontrada, em {stops} de {dur}. Equilíbrio raro entre preço e conforto."
        return f"{stops.capitalize()} de {dur}, por apenas {money_q(diff, currency)} a mais que a tarifa mais baixa. É a nossa escolha."
    if role == "cheapest":
        extra = (offer["total_duration_minutes"] or 0) - (recommended["total_duration_minutes"] or 0)
        longer = f", {fmt_minutes(extra)} a mais de viagem que a recomendação" if extra > 0 else ""
        return f"A tarifa mais baixa da pesquisa, com {stops}{longer}."
    if role == "fastest":
        return f"O trajeto mais curto: {stops} de {dur}."
    dep = local_hhmm(s["departure"])
    other = "outro horário" if set(offer["airlines"]) & set(recommended["airlines"]) else "outro horário ou companhia"
    return f"Alternativa com {stops} e partida às {dep}, para quem prefere {other}."


def render_leg(s: dict) -> str:
    dep, arr = local_hhmm(s["departure"]) or "--:--", local_hhmm(s["arrival"]) or "--:--"
    try:
        plus = (parse_local(s["arrival"]).date() - parse_local(s["departure"]).date()).days
    except (TypeError, ValueError):
        plus = 0
    stops_html = ""
    for i, seg in enumerate(s["segments"][:-1], 1):
        pos = 100 * i / len(s["segments"])
        stops_html += f'<span class="stop" style="left:{pos:.1f}%"></span><span class="stop-label" style="left:{pos:.1f}%">{esc(seg["to"])}</span>'
    return f"""
      <div class="path">
        <div class="end"><span class="time">{esc(dep)}</span><span class="code">{esc(s["origin"])}</span></div>
        <div class="track" aria-label="{esc(fmt_minutes(s['duration_minutes']))}, {s['stops']} parada(s)">
          <span class="track-dur">{esc(fmt_minutes(s["duration_minutes"]))}</span>{stops_html}
        </div>
        <div class="end arr"><span class="time">{esc(arr)}{f"<sup>+{plus}</sup>" if plus > 0 else ""}</span><span class="code">{esc(s["destination"])}</span></div>
      </div>"""


def render_option(index: int, offer: dict, role: str, reason: str, seats: int) -> str:
    labels = {"recommended": "Recomendação da casa", "cheapest": "A mais econômica", "fastest": "A mais rápida", "alternative": "Alternativa"}
    s = offer["slices"][0]
    amount, currency = offer["price"]["amount"], offer["price"]["currency"]
    per = f'<div class="per">{esc(money_q(amount / seats, currency))} por pessoa</div>' if seats > 1 else ""
    stops = "Direto" if s["stops"] == 0 else f"{s['stops']} conexão em {city_of(s['segments'][0]['to'])}" if s["stops"] == 1 else f"{s['stops']} conexões"
    flights = " · ".join(seg["flight_number"] for seg in s["segments"] if seg.get("flight_number"))
    aircraft = next((seg["aircraft"] for seg in s["segments"] if seg.get("aircraft")), None)
    comfort = amenities_pt(s["segments"][0])[:2]
    facts = [f"<span><b>{esc(stops)}</b></span>", f'<span class="mono">{esc(flights)}</span>']
    if aircraft:
        facts.append(f"<span>{esc(aircraft)}</span>")
    facts += [f"<span>{esc(c)}</span>" for c in comfort]
    ret = (offer.get("search_dates") or {}).get("return")
    return_line = (f'<div class="return-line"><b>Volta</b> · {esc(date_pt(ret))} · voos e horários escolhidos com você na emissão</div>'
                   if ret else "")
    return f"""
    <article class="option{' featured' if role == 'recommended' else ''}">
      <div class="option-head">
        <div class="numeral">{ROMAN[index]}</div>
        <div class="option-title"><span class="eyebrow">{esc(labels[role])}</span><h3>{esc(' & '.join(a for a in offer['airlines'] if a))}</h3></div>
        <div class="price"><div class="amount"><small>{esc(CURRENCY_SYMBOL.get(currency, currency))}</small>{esc(money(amount, currency).split(' ', 1)[1])}</div>{per}</div>
      </div>
      <p class="why">{esc(reason)}</p>
      <div class="leg">
        <div class="leg-label"><span class="eyebrow">Ida · {esc(date_pt(s['departure']))}</span></div>
        {render_leg(s)}
        <div class="facts">{''.join(facts)}</div>
      </div>
      {return_line}
    </article>"""


def render_market(insights: dict | None, price: float, currency: str) -> str:
    if not insights or not insights.get("typical_range") or len(insights["typical_range"]) != 2:
        return ""
    lo, hi = insights["typical_range"]
    level = insights.get("level")
    reading = {
        "low": ("abaixo do usual", "É um momento favorável para emitir."),
        "typical": ("dentro da faixa típica", "Não há sinal de queda iminente; sugerimos decidir dentro da validade desta proposta."),
        "high": ("acima do usual", "Se houver flexibilidade de datas, podemos acompanhar a tarifa e avisar quando baixar."),
    }.get(level, ("sem referência suficiente", ""))
    start, end = min(lo, price) * 0.85, max(hi, price) * 1.08

    def pos(v):
        return 100 * (v - start) / (end - start)

    return f"""
  <section class="market">
    <div class="eyebrow">Leitura de mercado</div>
    <div>
      <p>Pelo histórico do Google Flights para esta rota e estas datas, a tarifa recomendada está <b>{esc(reading[0])}</b>, que vai de {esc(money_q(lo, currency))} a {esc(money_q(hi, currency))}. {esc(reading[1])}</p>
      <div class="scale" role="img" aria-label="Faixa típica de {esc(money_q(lo, currency))} a {esc(money_q(hi, currency))}; tarifa recomendada {esc(money_q(price, currency))}">
        <div class="base"></div>
        <div class="band" style="left:{pos(lo):.1f}%;width:{pos(hi) - pos(lo):.1f}%"></div>
        <span class="tick" style="left:{pos(lo):.1f}%">{esc(money_q(lo, currency))}</span>
        <span class="tick" style="left:{pos(hi):.1f}%">{esc(money_q(hi, currency))}</span>
        <span class="band-label" style="left:{(pos(lo) + pos(hi)) / 2:.1f}%">faixa típica</span>
        <div class="marker" style="left:{pos(price):.1f}%"><span>Nossa recomendação</span><i></i></div>
      </div>
    </div>
  </section>"""


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
        sargs = parse_search_argv(argv + ["--limit", "50"])
        result = cmd_search(sargs)
    q, offers = result["query"], result["offers"]
    if not offers:
        raise FlightSearchError("A busca não trouxe ofertas para montar a cotação.", "no_results")

    picks = pick_options(offers, max(1, min(a.options, len(ROMAN))))
    recommended = picks[0][0]
    cheapest = sort_offers(offers, "price")[0]
    currency = recommended["price"]["currency"]
    seats = q["adults"] + len(q.get("children_ages") or [])
    options_html = "".join(
        render_option(i, o, role, option_reason(o, role, cheapest, recommended, currency), seats)
        for i, (o, role) in enumerate(picks)
    )

    brand = a.brand or os.environ.get("FLIGHTS_BRAND_NAME") or "Private Travel Office"
    words = [w for w in re.split(r"\s+", brand) if w]
    monogram = "".join(w[0] for w in words[:2]).upper() if len(words) > 1 else brand[:2].upper()
    now = dt.datetime.now()
    valid = now + dt.timedelta(hours=a.valid_hours)
    reference = f"FS-{now:%Y%m%d}-{q['origin']}{q['destination']}-{secrets.token_hex(2).upper()}"
    client = a.client or "Cliente"
    first_name = client.split()[0]
    pax = [f"{q['adults']} adulto{'s' if q['adults'] > 1 else ''}"]
    if q.get("children_ages"):
        pax.append(f"{len(q['children_ages'])} criança{'s' if len(q['children_ages']) > 1 else ''}")
    if q.get("infants"):
        pax.append(f"{q['infants']} bebê{'s' if q['infants'] > 1 else ''}")
    pax_line = ", ".join(pax)
    dates_line = date_pt(q["depart"]) + (f" — {date_pt(q['return'])}" if q.get("return") else "")
    trip_kind = "Ida e volta" if q.get("return") else "Somente ida"
    if q.get("provider") == "mock":
        trip_kind = "Amostra com dados fictícios · " + trip_kind

    if a.note:
        paragraphs = [p.strip() for p in a.note.split("\n") if p.strip()]
    else:
        paragraphs = [
            f"Analisamos {result['count']} tarifas entre {city_of(q['origin'])} e {city_of(q['destination'])} para {dates_line.replace(' — ', ' a ')} "
            f"e reunimos aqui as que valem a sua atenção.",
            "A primeira é a nossa recomendação; as demais estão aqui para que a decisão seja sua, com tudo à vista.",
        ]
    note_html = "".join(f"<p>{esc(p)}</p>" for p in paragraphs)

    contact = [x for x in (a.email or os.environ.get("FLIGHTS_CONTACT_EMAIL"), a.phone or os.environ.get("FLIGHTS_CONTACT_PHONE"),
                           os.environ.get("FLIGHTS_CONTACT_WEB")) if x]
    return_term = ("<li>Em ida e volta, o valor corresponde à viagem completa. Os voos de volta são escolhidos e confirmados com você na emissão.</li>"
                   if q.get("return") else "")
    values = {
        "title": f"Proposta {q['origin']}–{q['destination']} · {client}",
        "brand": esc(brand),
        "monogram": esc(monogram),
        "tagline": esc(a.tagline or os.environ.get("FLIGHTS_BRAND_TAGLINE") or "Viagens sob medida"),
        "reference": esc(reference),
        "issued": esc(f"{now.day} {MONTHS[now.month - 1]} {now.year}, {now:%H:%M}"),
        "valid_until": esc(f"{valid.day} {MONTHS[valid.month - 1]} {valid.year}, {valid:%H:%M}"),
        "trip_kind": esc(trip_kind),
        "cabin": esc(CABIN_PT.get(q["cabin"], q["cabin"])),
        "origin_city": esc(city_of(q["origin"])),
        "destination_city": esc(city_of(q["destination"])),
        "origin_code": esc(q["origin"]),
        "destination_code": esc(q["destination"]),
        "dates_line": esc(dates_line),
        "passengers_line": esc(pax_line),
        "passengers_short": esc(pax_line),
        "client": esc(client),
        "salutation": esc(f"{first_name},"),
        "note_html": note_html,
        "options_count": esc(len(picks)),
        "offers_considered": esc(result["count"]),
        "options_html": options_html,
        "market_html": render_market(result.get("price_insights"), recommended["price"]["amount"], currency),
        "currency_name": esc(CURRENCY_PT.get(currency, currency)),
        "return_term": return_term,
        "advisor": esc(a.advisor or os.environ.get("FLIGHTS_ADVISOR_NAME") or brand),
        "advisor_title": esc(a.advisor_title or os.environ.get("FLIGHTS_ADVISOR_TITLE") or "Consultoria de viagens"),
        "contact_html": "<br>".join(esc(c) for c in contact),
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
    response = {
        "kind": "quote", "reference": reference, "html_path": os.path.abspath(out), "client": client,
        "valid_until": valid.isoformat(timespec="minutes"),
        "options": [{"label": ROMAN[i], "role": role, "airlines": o["airlines"], "price": o["price"], "offer_id": o["id"]} for i, (o, role) in enumerate(picks)],
    }
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
    stops = "direto" if s["stops"] == 0 else f"{s['stops']} parada(s) via {','.join(seg['to'] for seg in s['segments'][:-1])}"
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
        lines = [f"Cotação {result['reference']} para {result['client']} (válida até {result['valid_until']})",
                 f"HTML: {result['html_path']}"]
        if result.get("pdf_path"):
            lines.append(f"PDF: {result['pdf_path']}")
        if result.get("pdf_error"):
            lines.append(f"PDF não gerado: {result['pdf_error']}")
        for o in result["options"]:
            lines.append(f"  {o['label']}. {money(o['price']['amount'], o['price']['currency'])} | {', '.join(o['airlines'])} ({o['role']})")
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
    s.add_argument("--from", dest="origin", required=True, help="IATA de origem (ex.: GRU)")
    s.add_argument("--to", dest="destination", required=True, help="IATA de destino (ex.: LIS)")
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

    qt = sub.add_parser("quote", help="Gerar cotação em HTML (e PDF) para o cliente")
    qt.add_argument("--from-json", help="Saída JSON de um 'search' já feito (não gasta nova busca)")
    qt.add_argument("--client", help="Nome do cliente")
    qt.add_argument("--note", help="Texto da carta ao cliente (parágrafos separados por quebra de linha)")
    qt.add_argument("--options", type=int, default=3, help="Quantas opções apresentar (1-5)")
    qt.add_argument("--valid-hours", type=int, default=24, help="Validade da proposta em horas")
    qt.add_argument("--brand", help="Nome da agência (ou FLIGHTS_BRAND_NAME)")
    qt.add_argument("--tagline", help="Assinatura da marca (ou FLIGHTS_BRAND_TAGLINE)")
    qt.add_argument("--advisor", help="Nome do consultor (ou FLIGHTS_ADVISOR_NAME)")
    qt.add_argument("--advisor-title", help="Cargo do consultor (ou FLIGHTS_ADVISOR_TITLE)")
    qt.add_argument("--email", help="Contato (ou FLIGHTS_CONTACT_EMAIL)")
    qt.add_argument("--phone", help="Telefone (ou FLIGHTS_CONTACT_PHONE)")
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
