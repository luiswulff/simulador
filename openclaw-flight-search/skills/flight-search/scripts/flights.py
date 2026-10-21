#!/usr/bin/env python3
"""Pesquisa de voos para agentes autônomos (skill do OpenClaw).

Somente biblioteca padrão. Provedores: duffel, serpapi (Google Flights) e mock.
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

VERSION = "1.1.0"
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


def iso_duration_minutes(value: str | None) -> int | None:
    """Converte duração ISO 8601 (ex.: P1DT2H30M) em minutos."""
    if not value:
        return None
    m = re.fullmatch(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?", value)
    if not m:
        return None
    days, hours, minutes = (int(g) if g else 0 for g in m.groups())
    return days * 1440 + hours * 60 + minutes


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


def cache_get(key: str) -> list | None:
    path = os.path.join(cache_dir(), key + ".json")
    try:
        if time.time() - os.path.getmtime(path) > cache_ttl():
            return None
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def cache_put(key: str, offers: list) -> None:
    try:
        os.makedirs(cache_dir(), exist_ok=True)
        tmp = os.path.join(cache_dir(), key + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(offers, f)
        os.replace(tmp, os.path.join(cache_dir(), key + ".json"))
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Provedores. Cada um recebe a consulta normalizada e devolve ofertas normalizadas:
# {id, provider, price:{amount,currency}, airlines[], slices[{origin,destination,
#  departure,arrival,duration_minutes,stops,segments[]}], total_duration_minutes,
#  checked_bags, refundable, changeable, booking{}}

CABIN_SERPAPI = {"economy": 1, "premium_economy": 2, "business": 3, "first": 4}


def search_duffel(q: dict) -> list:
    token = os.environ.get("DUFFEL_ACCESS_TOKEN")
    if not token:
        raise FlightSearchError("Defina DUFFEL_ACCESS_TOKEN para usar o provedor duffel.", "missing_credentials")
    slices = [{"origin": q["origin"], "destination": q["destination"], "departure_date": q["depart"]}]
    if q.get("return"):
        slices.append({"origin": q["destination"], "destination": q["origin"], "departure_date": q["return"]})
    passengers = [{"type": "adult"} for _ in range(q["adults"])]
    passengers += [{"age": age} for age in q["children_ages"]]
    passengers += [{"type": "infant_without_seat"} for _ in range(q["infants"])]
    data = {"slices": slices, "passengers": passengers, "cabin_class": q["cabin"]}
    if q.get("max_stops") is not None:
        data["max_connections"] = q["max_stops"]
    url = "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000"
    resp = http_json("POST", url, {"Authorization": f"Bearer {token}", "Duffel-Version": "v2"}, {"data": data})
    return [normalize_duffel(o) for o in resp.get("data", {}).get("offers", [])]


def normalize_duffel(offer: dict) -> dict:
    slices, airlines, bags = [], [], None
    for s in offer.get("slices", []):
        segments = []
        for seg in s.get("segments", []):
            carrier = seg.get("marketing_carrier") or {}
            code = carrier.get("iata_code") or ""
            if carrier.get("name") and carrier["name"] not in airlines:
                airlines.append(carrier["name"])
            if bags is None:
                for p in seg.get("passengers", [])[:1]:
                    bags = sum(b.get("quantity", 0) for b in p.get("baggages", []) if b.get("type") == "checked")
            segments.append({
                "from": (seg.get("origin") or {}).get("iata_code"),
                "to": (seg.get("destination") or {}).get("iata_code"),
                "departure": seg.get("departing_at"),
                "arrival": seg.get("arriving_at"),
                "carrier": code,
                "carrier_name": carrier.get("name"),
                "flight_number": f"{code}{seg.get('marketing_carrier_flight_number') or ''}",
                "operating_carrier": (seg.get("operating_carrier") or {}).get("name"),
                "aircraft": (seg.get("aircraft") or {}).get("name"),
                "duration_minutes": iso_duration_minutes(seg.get("duration")),
            })
        slices.append(build_slice(segments, iso_duration_minutes(s.get("duration"))))
    conditions = offer.get("conditions") or {}
    return {
        "id": offer.get("id"),
        "provider": "duffel",
        "price": {"amount": float(offer.get("total_amount", 0)), "currency": offer.get("total_currency")},
        "airlines": airlines or [(offer.get("owner") or {}).get("name")],
        "slices": slices,
        "total_duration_minutes": sum_durations(slices),
        "checked_bags": bags,
        "refundable": bool((conditions.get("refund_before_departure") or {}).get("allowed")),
        "changeable": bool((conditions.get("change_before_departure") or {}).get("allowed")),
        "booking": {"offer_id": offer.get("id"), "expires_at": offer.get("expires_at"), "how": "Duffel Orders API (requer aprovação humana)"},
    }


def search_serpapi(q: dict) -> list:
    key = os.environ.get("SERPAPI_API_KEY")
    if not key:
        raise FlightSearchError("Defina SERPAPI_API_KEY para usar o provedor serpapi.", "missing_credentials")
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
            return []
        raise FlightSearchError(f"SerpApi: {resp['error']}", "provider_error")
    url = (resp.get("search_metadata") or {}).get("google_flights_url")
    items = (resp.get("best_flights") or []) + (resp.get("other_flights") or [])
    return [normalize_serpapi(item, q, url, i) for i, item in enumerate(items)]


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
        })
    outbound = build_slice(segments, item.get("total_duration"))
    offer = {
        "id": f"serpapi-{q['depart']}-{index}",
        "provider": "serpapi",
        "price": {"amount": float(item["price"]) if item.get("price") is not None else None, "currency": q["currency"]},
        "airlines": airlines,
        "slices": [outbound],
        "total_duration_minutes": outbound["duration_minutes"],
        "checked_bags": None,
        "refundable": None,
        "changeable": None,
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
            "checked_bags": rng.choice([0, 1]), "refundable": rng.random() < 0.3, "changeable": rng.random() < 0.6,
            "booking": {"note": "dados fictícios"},
        })
    return offers


PROVIDERS = {"duffel": search_duffel, "serpapi": search_serpapi, "mock": search_mock}


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
    if os.environ.get("DUFFEL_ACCESS_TOKEN"):
        return "duffel"
    if os.environ.get("SERPAPI_API_KEY"):
        return "serpapi"
    raise FlightSearchError(
        "Nenhum provedor configurado. Defina DUFFEL_ACCESS_TOKEN ou SERPAPI_API_KEY "
        "(ou use --provider mock para dados fictícios).",
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
        if a.refundable and o["refundable"] is False:
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
    all_offers, by_date, errors = [], [], []
    for shift in range(-a.flex_days, a.flex_days + 1):
        q = dict(base)
        d = dt.date.fromisoformat(base["depart"]) + dt.timedelta(days=shift)
        if d < today:
            continue
        q["depart"] = d.isoformat()
        if base["return"]:
            q["return"] = (dt.date.fromisoformat(base["return"]) + dt.timedelta(days=shift)).isoformat()
        key = cache_key(provider, q)
        offers = None if a.no_cache else cache_get(key)
        cached = offers is not None
        if offers is None:
            try:
                offers = PROVIDERS[provider](q)
            except FlightSearchError as e:
                if a.flex_days == 0:
                    raise
                errors.append({"depart": q["depart"], "code": e.code, "message": str(e)})
                continue
            cache_put(key, offers)
        for o in offers:
            o["search_dates"] = {"depart": q["depart"], "return": q["return"]}
        filtered = apply_filters(offers, a)
        if a.flex_days:
            cheapest = min((o["price"]["amount"] for o in filtered), default=None)
            by_date.append({"depart": q["depart"], "return": q["return"], "cheapest": cheapest, "offers": len(filtered), "cached": cached})
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
    token = os.environ.get("DUFFEL_ACCESS_TOKEN")
    if token and not a.offline and len(term) >= 2:
        url = "https://api.duffel.com/places/suggestions?" + urllib.parse.urlencode({"query": a.query})
        try:
            resp = http_json("GET", url, {"Authorization": f"Bearer {token}", "Duffel-Version": "v2"}, retries=1)
            seen = {m["iata"] for m in matches}
            for p in resp.get("data", []):
                code = p.get("iata_code")
                if code and code not in seen:
                    seen.add(code)
                    matches.append({"iata": code, "city": p.get("city_name") or p.get("name"), "name": p.get("name"),
                                    "country": p.get("iata_country_code"), "type": p.get("type"), "source": "duffel"})
        except FlightSearchError:
            pass
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
# Reserva (Duffel). Desligada por padrão; fluxo em duas etapas com aprovação humana:
#   book prepare  -> confere preço atual, guarda a reserva pendente e gera um código
#   book confirm  -> só com o código que o usuário repetiu; aborta se o preço mudou

BOOKINGS_FILE = "bookings.json"
APPROVAL_TTL_MINUTES = 30
PASSENGER_FIELDS = ("given_name", "family_name", "born_on", "gender", "title", "email", "phone_number")


def duffel_headers() -> dict:
    token = os.environ.get("DUFFEL_ACCESS_TOKEN")
    if not token:
        raise FlightSearchError("Defina DUFFEL_ACCESS_TOKEN para reservar.", "missing_credentials")
    return {"Authorization": f"Bearer {token}", "Duffel-Version": "v2"}


def booking_guard(amount: float | None = None) -> None:
    if os.environ.get("FLIGHTS_BOOKING_ENABLED") != "1":
        raise FlightSearchError("Reserva desativada. O dono do agente precisa definir FLIGHTS_BOOKING_ENABLED=1.", "booking_disabled")
    token = os.environ.get("DUFFEL_ACCESS_TOKEN", "")
    if token.startswith("duffel_live") and os.environ.get("FLIGHTS_ALLOW_LIVE_BOOKING") != "1":
        raise FlightSearchError("Token de produção bloqueado para reserva. Defina FLIGHTS_ALLOW_LIVE_BOOKING=1 para emitir bilhetes reais.", "live_booking_blocked")
    limit = os.environ.get("FLIGHTS_MAX_BOOKING_AMOUNT")
    if amount is not None and limit:
        try:
            limit_value = float(limit)
        except ValueError:
            raise FlightSearchError(f"FLIGHTS_MAX_BOOKING_AMOUNT inválido: {limit}.", "invalid_request") from None
        if amount > limit_value:
            raise FlightSearchError(f"Valor {amount:.2f} acima do limite FLIGHTS_MAX_BOOKING_AMOUNT={limit}.", "over_limit")


def validate_passenger(p: dict, index: int) -> dict:
    missing = [f for f in PASSENGER_FIELDS if not str(p.get(f) or "").strip()]
    if missing:
        raise FlightSearchError(f"Passageiro {index + 1}: faltam {', '.join(missing)}.", "invalid_request")
    clean = {f: str(p[f]).strip() for f in PASSENGER_FIELDS}
    try:
        dt.date.fromisoformat(clean["born_on"])
    except ValueError:
        raise FlightSearchError(f"Passageiro {index + 1}: born_on deve ser AAAA-MM-DD.", "invalid_request") from None
    clean["gender"] = clean["gender"].lower()
    clean["title"] = clean["title"].lower()
    if clean["gender"] not in ("m", "f"):
        raise FlightSearchError(f"Passageiro {index + 1}: gender deve ser 'm' ou 'f'.", "invalid_request")
    if clean["title"] not in ("mr", "ms", "mrs", "miss", "dr"):
        raise FlightSearchError(f"Passageiro {index + 1}: title deve ser mr, ms, mrs, miss ou dr.", "invalid_request")
    if not re.fullmatch(r"\+\d{8,15}", clean["phone_number"]):
        raise FlightSearchError(f"Passageiro {index + 1}: phone_number no formato internacional, ex.: +5511999998888.", "invalid_request")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", clean["email"]):
        raise FlightSearchError(f"Passageiro {index + 1}: e-mail inválido.", "invalid_request")
    return clean


def fetch_offer(offer_id: str) -> dict:
    if not re.fullmatch(r"off_[A-Za-z0-9]+", offer_id or ""):
        raise FlightSearchError("offer_id inválido (esperado off_...). Reserva só funciona com ofertas da Duffel.", "invalid_request")
    resp = http_json("GET", f"https://api.duffel.com/air/offers/{offer_id}", duffel_headers())
    return resp.get("data") or {}


def cmd_book_prepare(a: argparse.Namespace) -> dict:
    booking_guard()
    try:
        with open(a.passengers_file, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError) as e:
        raise FlightSearchError(f"Não consegui ler {a.passengers_file}: {e}", "invalid_request") from None
    if not isinstance(raw, list) or not raw:
        raise FlightSearchError("O arquivo de passageiros deve ser uma lista JSON.", "invalid_request")
    passengers = [validate_passenger(p, i) for i, p in enumerate(raw)]

    offer = fetch_offer(a.offer_id)
    offer_pax = offer.get("passengers") or []
    if len(offer_pax) != len(passengers):
        raise FlightSearchError(
            f"A oferta tem {len(offer_pax)} passageiro(s) e o arquivo tem {len(passengers)}. "
            f"Ordem esperada: {[p.get('type') or ('child, ' + str(p.get('age')) + ' anos') for p in offer_pax]}.",
            "invalid_request",
        )
    amount = float(offer["total_amount"])
    booking_guard(amount)

    adults = [i for i, p in enumerate(offer_pax) if p.get("type") == "adult"]
    infants = [i for i, p in enumerate(offer_pax) if (p.get("type") or "").startswith("infant")]
    payload_pax = []
    for p, op in zip(passengers, offer_pax):
        payload_pax.append({**p, "id": op["id"]})
    for adult_idx, infant_idx in zip(adults, infants):
        payload_pax[adult_idx]["infant_passenger_id"] = offer_pax[infant_idx]["id"]

    expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=APPROVAL_TTL_MINUTES)
    offer_exp = offer.get("expires_at")
    if offer_exp:
        try:
            expires = min(expires, dt.datetime.fromisoformat(offer_exp.replace("Z", "+00:00")))
        except ValueError:
            pass
    booking = {
        "id": "bk_" + secrets.token_hex(4),
        "status": "pending_approval",
        "offer_id": offer["id"],
        "amount": offer["total_amount"],
        "currency": offer["total_currency"],
        "passengers": payload_pax,
        "approval_code": f"{secrets.randbelow(10**6):06d}",
        "created_at": now_iso(),
        "expires_at": expires.replace(microsecond=0).isoformat(),
        "summary": normalize_duffel(offer),
    }
    bookings = load_state(BOOKINGS_FILE, [])
    bookings.append(booking)
    save_state(BOOKINGS_FILE, bookings)
    return {
        "kind": "booking_prepared",
        "booking_id": booking["id"],
        "approval_code": booking["approval_code"],
        "expires_at": booking["expires_at"],
        "price": {"amount": amount, "currency": booking["currency"]},
        "passengers": [f"{p['given_name']} {p['family_name']}" for p in passengers],
        "offer": booking["summary"],
        "instructions": "Mostre o resumo ao usuário e peça que ele responda com o código de aprovação. "
                        "Só execute 'book confirm' se o usuário repetir o código em uma mensagem própria.",
    }


def cmd_book_confirm(a: argparse.Namespace) -> dict:
    booking_guard()
    bookings = load_state(BOOKINGS_FILE, [])
    booking = next((b for b in bookings if b["id"] == a.booking_id), None)
    if not booking:
        raise FlightSearchError(f"Reserva pendente não encontrada: {a.booking_id}.", "not_found")
    if booking["status"] != "pending_approval":
        raise FlightSearchError(f"Reserva {a.booking_id} está com status '{booking['status']}'.", "invalid_state")
    if dt.datetime.now(dt.timezone.utc) > dt.datetime.fromisoformat(booking["expires_at"]):
        booking["status"] = "expired"
        save_state(BOOKINGS_FILE, bookings)
        raise FlightSearchError("Aprovação expirada. Busque e prepare de novo.", "expired")
    if not secrets.compare_digest(str(a.approval_code).strip(), booking["approval_code"]):
        booking["failed_attempts"] = booking.get("failed_attempts", 0) + 1
        if booking["failed_attempts"] >= 3:
            booking["status"] = "cancelled"
        save_state(BOOKINGS_FILE, bookings)
        raise FlightSearchError("Código de aprovação incorreto.", "approval_mismatch")

    offer = fetch_offer(booking["offer_id"])
    if (offer.get("total_amount"), offer.get("total_currency")) != (booking["amount"], booking["currency"]):
        booking["status"] = "price_changed"
        save_state(BOOKINGS_FILE, bookings)
        raise FlightSearchError(
            f"Preço mudou de {booking['currency']} {booking['amount']} para {offer.get('total_currency')} {offer.get('total_amount')}. "
            "Nada foi reservado; prepare novamente e peça nova aprovação.",
            "price_changed",
        )
    booking_guard(float(booking["amount"]))

    body = {"data": {
        "type": "instant",
        "selected_offers": [booking["offer_id"]],
        "payments": [{"type": "balance", "currency": booking["currency"], "amount": booking["amount"]}],
        "passengers": booking["passengers"],
    }}
    booking["status"] = "submitting"
    save_state(BOOKINGS_FILE, bookings)
    try:
        # sem novas tentativas: repetir um POST de pedido pode emitir dois bilhetes
        order = http_json("POST", "https://api.duffel.com/air/orders", duffel_headers(), body, retries=0).get("data") or {}
    except FlightSearchError:
        booking["status"] = "failed"
        save_state(BOOKINGS_FILE, bookings)
        raise
    booking.update({
        "status": "booked",
        "order_id": order.get("id"),
        "booking_reference": order.get("booking_reference"),
        "booked_at": now_iso(),
        # dados pessoais não ficam guardados depois da emissão
        "passengers": [{"given_name": p["given_name"], "family_name": p["family_name"]} for p in booking["passengers"]],
        "approval_code": None,
    })
    save_state(BOOKINGS_FILE, bookings)
    return {
        "kind": "booking_confirmed",
        "booking_id": booking["id"],
        "order_id": booking["order_id"],
        "booking_reference": booking["booking_reference"],
        "price": {"amount": float(booking["amount"]), "currency": booking["currency"]},
        "passengers": [f"{p['given_name']} {p['family_name']}" for p in booking["passengers"]],
        "test_mode": not os.environ.get("DUFFEL_ACCESS_TOKEN", "").startswith("duffel_live"),
    }


def cmd_book_cancel(a: argparse.Namespace) -> dict:
    bookings = load_state(BOOKINGS_FILE, [])
    booking = next((b for b in bookings if b["id"] == a.booking_id), None)
    if not booking:
        raise FlightSearchError(f"Reserva não encontrada: {a.booking_id}.", "not_found")
    if booking["status"] != "pending_approval":
        raise FlightSearchError(f"Só reservas pendentes podem ser descartadas aqui (status: {booking['status']}).", "invalid_state")
    booking.update({"status": "cancelled", "passengers": [], "approval_code": None})
    save_state(BOOKINGS_FILE, bookings)
    return {"kind": "booking_cancelled", "booking_id": a.booking_id}


def cmd_book_list(a: argparse.Namespace) -> dict:
    bookings = load_state(BOOKINGS_FILE, [])
    fields = ("id", "status", "offer_id", "amount", "currency", "created_at", "expires_at", "order_id", "booking_reference")
    return {"kind": "booking_list", "bookings": [{k: b.get(k) for k in fields} for b in bookings]}


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


def booking_text(result: dict) -> str:
    kind = result["kind"]
    if kind == "booking_prepared":
        o = result["offer"]
        return "\n".join([
            f"Reserva {result['booking_id']} PENDENTE de aprovação (expira {result['expires_at']})",
            f"Total: {money(result['price']['amount'], result['price']['currency'])} · {', '.join(a for a in o['airlines'] if a)}",
            *(f"  {describe_slice(s)}" for s in o["slices"]),
            f"Passageiros: {', '.join(result['passengers'])}",
            f"Código de aprovação: {result['approval_code']}",
            result["instructions"],
        ])
    if kind == "booking_confirmed":
        mode = " (MODO TESTE — nenhum bilhete real)" if result["test_mode"] else ""
        return (f"Reserva confirmada{mode}: localizador {result['booking_reference']} · pedido {result['order_id']} · "
                f"{money(result['price']['amount'], result['price']['currency'])} · {', '.join(result['passengers'])}")
    if kind == "booking_cancelled":
        return f"Reserva pendente {result['booking_id']} descartada."
    return "\n".join(f"{b['id']} [{b['status']}] {b['currency']} {b['amount']} · {b['booking_reference'] or b['offer_id']}" for b in result["bookings"]) or "Nenhuma reserva."


def to_text(result: dict) -> str:
    if result.get("kind", "").startswith("watch"):
        return watch_text(result)
    if result.get("kind", "").startswith("booking"):
        return booking_text(result)
    if "airports" in result:
        return "\n".join(f"{x['iata']} — {x['city']} ({x['name']}, {x['country']})" for x in result["airports"]) or "Nenhum aeroporto encontrado."
    q = result["query"]
    trip = f"ida e volta {q['depart']}/{q['return']}" if q["return"] else f"só ida {q['depart']}"
    pax = f"{q['adults']} adulto(s)" + (f", {len(q['children_ages'])} criança(s)" if q["children_ages"] else "") + (f", {q['infants']} bebê(s)" if q["infants"] else "")
    lines = [f"{q['origin']}→{q['destination']} · {trip} · {pax} · {q['cabin']} · {q['provider']} · {result['count']} ofertas (mostrando {result['returned']})"]
    if result.get("warning"):
        lines.append("⚠ " + result["warning"])
    for i, o in enumerate(result["offers"], 1):
        extras = []
        if o["checked_bags"] is not None:
            extras.append(f"{o['checked_bags']} mala(s)")
        if o["refundable"] is not None:
            extras.append("reembolsável" if o["refundable"] else "não reembolsável")
        lines.append(f"{i}. {money(o['price']['amount'], o['price']['currency'])} | {', '.join(a for a in o['airlines'] if a)} | " + " || ".join(describe_slice(s) for s in o["slices"]) + (f" | {', '.join(extras)}" if extras else "") + f" | id={o['id']}")
    for d in result.get("by_date", []):
        cheapest = money(d["cheapest"], q["currency"]) if d["cheapest"] is not None else "—"
        lines.append(f"  data {d['depart']}{'/' + d['return'] if d['return'] else ''}: menor {cheapest} ({d['offers']} ofertas)")
    for e in result.get("errors", []):
        lines.append(f"  erro em {e['depart']}: {e['message']}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="flights.py", description="Pesquisa e monitoramento de voos; reserva opcional com aprovação humana.")
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
    s.add_argument("--currency", default=os.environ.get("FLIGHTS_CURRENCY", "BRL"), help="Moeda (serpapi; duffel usa a moeda da conta)")
    s.add_argument("--max-stops", type=int, choices=[0, 1, 2])
    s.add_argument("--max-price", type=float)
    s.add_argument("--max-duration", type=float, help="Duração máxima por trecho, em horas")
    s.add_argument("--airlines", help="Somente estas cias (nomes ou códigos IATA, separados por vírgula)")
    s.add_argument("--exclude-airlines", help="Excluir estas cias")
    s.add_argument("--depart-after", help="Partida da ida a partir de HH:MM (hora local)")
    s.add_argument("--depart-before", help="Partida da ida até HH:MM (hora local)")
    s.add_argument("--refundable", action="store_true", help="Somente tarifas reembolsáveis (quando o provedor informa)")
    s.add_argument("--flex-days", type=int, default=0, help=f"Buscar também ±N dias (0-{MAX_FLEX_DAYS}); cada dia é uma chamada")
    s.add_argument("--sort", choices=["price", "duration", "departure", "stops", "best"], default="price")
    s.add_argument("--limit", type=int, default=10)
    s.add_argument("--provider", choices=list(PROVIDERS), help="Padrão: FLIGHTS_PROVIDER, ou duffel/serpapi conforme a chave disponível")
    s.add_argument("--no-cache", action="store_true")
    s.add_argument("--format", choices=["json", "text"], default="json")
    s.set_defaults(func=cmd_search)

    ap = sub.add_parser("airports", help="Descobrir códigos IATA por cidade/aeroporto")
    ap.add_argument("query")
    ap.add_argument("--offline", action="store_true", help="Usar só a lista local")
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

    b = sub.add_parser("book", help="Reserva Duffel com aprovação humana (desligada por padrão)")
    bsub = b.add_subparsers(dest="book_command", required=True)
    bp = bsub.add_parser("prepare", help="Conferir preço e gerar código de aprovação")
    bp.add_argument("--offer-id", required=True)
    bp.add_argument("--passengers-file", required=True, help="JSON: lista com given_name, family_name, born_on, gender, title, email, phone_number")
    bp.set_defaults(func=cmd_book_prepare)
    bc = bsub.add_parser("confirm", help="Emitir após o usuário repetir o código")
    bc.add_argument("--booking-id", required=True)
    bc.add_argument("--approval-code", required=True)
    bc.set_defaults(func=cmd_book_confirm)
    bx = bsub.add_parser("cancel", help="Descartar reserva pendente")
    bx.add_argument("booking_id")
    bx.set_defaults(func=cmd_book_cancel)
    bl = bsub.add_parser("list")
    bl.set_defaults(func=cmd_book_list)

    for parser in (wa, wl, wr, wc, bp, bc, bx, bl):
        parser.add_argument("--format", choices=["json", "text"], default="json")
    return p


def main(argv: list | None = None) -> int:
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
