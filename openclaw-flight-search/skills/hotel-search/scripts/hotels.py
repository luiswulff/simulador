#!/usr/bin/env python3
"""Pesquisa de hotéis para agentes autônomos (skill do OpenClaw).

Somente biblioteca padrão. Fonte: Google Hotels via SerpApi (mesma chave da skill de voos) ou mock.
Cada hotel sai com categoria, preço por noite e total (com taxas), semáforo de preço (dentro/fora do
orçamento ou da faixa típica), notas, localização, comodidades e links (site oficial, Hotels.com, Google).

Exemplos:
  hotels.py search --where "Avenida Paulista, São Paulo" --check-in 2026-11-16 --check-out 2026-11-18 --budget 600 --format text
  hotels.py details --token <property_token> --check-in 2026-11-16 --check-out 2026-11-18
  hotels.py quote --from-json busca.json --client "Helena Prado" --pdf
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import html
import json
import math
import os
import random
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

VERSION = "1.0.0"
USER_AGENT = f"openclaw-hotel-search/{VERSION}"
HTTP_TIMEOUT = 45
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class HotelSearchError(Exception):
    def __init__(self, message: str, code: str = "error", status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


# ---------------------------------------------------------------------------
# Utilitários


def load_env_file() -> None:
    """Lê KEY=VALOR do .env desta skill e, se existir, do .env da skill de voos (mesma chave SerpApi).
    Variáveis já definidas no ambiente têm prioridade."""
    paths = [os.environ.get("HOTELS_ENV_FILE") or os.path.join(SKILL_DIR, ".env")]
    if not os.environ.get("HOTELS_ENV_FILE"):
        paths.append(os.path.join(os.path.dirname(SKILL_DIR), "flight-search", ".env"))
    for path in paths:
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


def http_json(url: str, retries: int = 3) -> dict:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Encoding": "gzip"}
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=HTTP_TIMEOUT) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            raw = e.read()
            if e.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(2 ** attempt)
                continue
            code = {401: "auth_error", 403: "auth_error", 429: "rate_limited"}.get(e.code, "provider_error")
            raise HotelSearchError(f"HTTP {e.code} do provedor: {raw.decode(errors='replace')[:400]}", code, e.code) from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries:
                time.sleep(2 ** attempt)
                continue
            raise HotelSearchError(f"Falha de rede: {e}", "network_error") from None
    raise HotelSearchError("Falha após novas tentativas", "network_error")


def cache_dir() -> str:
    return os.environ.get("HOTELS_CACHE_DIR") or os.path.join(os.path.expanduser("~"), ".cache", "openclaw-hotel-search")


def cached(key_data, fetch, no_cache: bool = False):
    """Cache em disco (15 min): evita gastar cota repetindo a mesma consulta."""
    key = hashlib.sha256(json.dumps(key_data, sort_keys=True).encode()).hexdigest()[:32]
    path = os.path.join(cache_dir(), key + ".json")
    ttl = int(os.environ.get("HOTELS_CACHE_TTL", "900") or 900)
    if not no_cache:
        try:
            if time.time() - os.path.getmtime(path) <= ttl:
                with open(path, encoding="utf-8") as f:
                    return json.load(f)
        except (OSError, ValueError):
            pass
    value = fetch()
    try:
        os.makedirs(cache_dir(), exist_ok=True)
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            json.dump(value, f)
        os.replace(path + ".tmp", path)
    except OSError:
        pass
    return value


def money(amount: float, currency: str) -> str:
    symbol = {"BRL": "R$", "USD": "US$", "EUR": "€", "GBP": "£"}.get(currency, currency)
    return f"{symbol} " + f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def money_short(amount: float, currency: str) -> str:
    symbol = {"BRL": "R$", "USD": "US$", "EUR": "€", "GBP": "£"}.get(currency, currency)
    return f"{symbol} " + f"{amount:,.0f}".replace(",", ".")


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def haversine_km(a: tuple, b: tuple) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def date_pt(value: str) -> str:
    d = dt.date.fromisoformat(value[:10])
    return f"{WEEKDAYS[d.weekday()]}, {d.day} {MONTHS[d.month - 1]}"


# ---------------------------------------------------------------------------
# Comodidades: o Google mistura inglês e português; normalizamos para chaves e rótulos em PT

AMENITY_RULES = [
    ("breakfast_free", "Café da manhã incluso", r"free breakfast|café da manhã (incluído|grátis|gratuito)"),
    ("breakfast", "Café da manhã", r"breakfast|café da manhã"),
    ("wifi_free", "Wi-Fi grátis", r"free wi-?fi|wi-?fi (gratuito|grátis)"),
    ("wifi", "Wi-Fi", r"wi-?fi"),
    ("parking_free", "Estacionamento grátis", r"free parking|estacionamento (gratuito|grátis)"),
    ("parking", "Estacionamento", r"parking|estacionamento"),
    ("gym", "Academia", r"fitness|academia|\bgym\b"),
    ("pool", "Piscina", r"pool|piscina"),
    ("ac", "Ar-condicionado", r"air conditioning|ar-condicionado"),
    ("restaurant", "Restaurante", r"restaurant"),
    ("room_service", "Serviço de quarto", r"room service|serviço de quarto"),
    ("business", "Salas de reunião", r"business cent|meeting room|sala(s)? de reuni"),
    ("laundry", "Lavanderia", r"laundry|lavanderia|máquina de lavar"),
    ("airport_shuttle", "Traslado aeroporto", r"airport shuttle|traslado"),
    ("spa", "Spa", r"\bspa\b|hot tub"),
    ("kitchen", "Cozinha", r"kitchen|cozinha"),
    ("pet", "Aceita pets", r"pet|animais"),
    ("accessible", "Acessível", r"accessible|acessível"),
]
AMENITY_LABEL = {k: label for k, label, _ in AMENITY_RULES}
FILTER_KEYS = {  # --amenities aceita estes nomes
    "cafe": ("breakfast_free",), "breakfast": ("breakfast_free",), "wifi": ("wifi", "wifi_free"),
    "estacionamento": ("parking", "parking_free"), "parking": ("parking", "parking_free"), "academia": ("gym",),
    "gym": ("gym",), "piscina": ("pool",), "pool": ("pool",), "ar": ("ac",), "restaurante": ("restaurant",),
    "reuniao": ("business",), "business": ("business",), "lavanderia": ("laundry",), "traslado": ("airport_shuttle",),
    "pet": ("pet",), "acessivel": ("accessible",), "cozinha": ("kitchen",),
}


def normalize_amenities(raw: list) -> list:
    keys = []
    for item in raw or []:
        text = item.lower()
        for key, _, pattern in AMENITY_RULES:
            if re.search(pattern, text):
                if key not in keys:
                    keys.append(key)
                break
    # a versão "grátis" absorve a genérica
    for free, generic in (("breakfast_free", "breakfast"), ("wifi_free", "wifi"), ("parking_free", "parking")):
        if free in keys and generic in keys:
            keys.remove(generic)
    return keys


# ---------------------------------------------------------------------------
# Provedores


def serpapi_params(q: dict) -> dict:
    key = os.environ.get("SERPAPI_API_KEY")
    if not key:
        raise HotelSearchError("SERPAPI_API_KEY não configurada (ambiente ou .env da skill).", "missing_credentials")
    params = {
        "engine": "google_hotels", "q": q["where"], "check_in_date": q["check_in"], "check_out_date": q["check_out"],
        "adults": q["adults"], "currency": q["currency"], "gl": "br", "hl": "pt-br", "api_key": key,
    }
    if q["children_ages"]:
        params["children"] = len(q["children_ages"])
        params["children_ages"] = ",".join(str(a) for a in q["children_ages"])
    if q.get("min_stars"):
        params["hotel_class"] = ",".join(str(s) for s in range(q["min_stars"], 6))
    if q.get("min_rating"):
        params["rating"] = {3.5: 7, 4.0: 8, 4.5: 9}[q["min_rating"]]
    if q.get("free_cancellation"):
        params["free_cancellation"] = "true"
    if q.get("sort") == "price":
        params["sort_by"] = 3
    elif q.get("sort") == "rating":
        params["sort_by"] = 8
    return params


def nights_of(q: dict) -> int:
    return (dt.date.fromisoformat(q["check_out"]) - dt.date.fromisoformat(q["check_in"])).days


def normalize_property(p: dict, q: dict, search_url: str | None) -> dict:
    nights = nights_of(q)
    night = (p.get("rate_per_night") or {}).get("extracted_lowest")
    total = (p.get("total_rate") or {}).get("extracted_lowest") or (night * nights if night else None)
    deal_pct = None
    m = re.search(r"(\d+)\s*%", p.get("deal") or "")
    if m:
        deal_pct = int(m.group(1))
    nearby = []
    for n in (p.get("nearby_places") or [])[:6]:
        trans = (n.get("transportations") or [{}])[0]
        nearby.append({"name": n.get("name"), "mode": {"Walking": "a pé", "Taxi": "de táxi", "Public transport": "de transporte público"}.get(trans.get("type"), trans.get("type")),
                       "duration": trans.get("duration")})
    prices = [{"source": x.get("source"), "night": (x.get("rate_per_night") or {}).get("extracted_lowest"),
               "free_cancellation": x.get("free_cancellation")} for x in p.get("prices") or []]
    return {
        "id": p.get("property_token"),
        "name": p.get("name"),
        "type": p.get("type"),
        "stars": p.get("extracted_hotel_class"),
        "rating": round(p["overall_rating"], 1) if p.get("overall_rating") else None,
        "reviews": p.get("reviews"),
        "location_rating": p.get("location_rating"),
        "price": {"night": night, "total": total, "night_before_taxes": (p.get("rate_per_night") or {}).get("extracted_before_taxes_fees"),
                  "currency": q["currency"], "nights": nights},
        "deal": {"pct_below_average": deal_pct, "label": p.get("deal"), "description": p.get("deal_description")} if p.get("deal") else None,
        "amenities": normalize_amenities(p.get("amenities")),
        "check_in_time": p.get("check_in_time"),
        "check_out_time": p.get("check_out_time"),
        "gps": [p["gps_coordinates"]["latitude"], p["gps_coordinates"]["longitude"]] if p.get("gps_coordinates") else None,
        "nearby": nearby,
        "essential_info": p.get("essential_info"),
        "eco_certified": bool(p.get("eco_certified")),
        "prices": prices,
        "links": {"official": p.get("link"), "google": search_url},
        "provider": "serpapi",
    }


def search_serpapi(q: dict, pages: int, no_cache: bool) -> tuple:
    params = serpapi_params(q)
    props, insights_url, total = [], None, None
    token = None
    for _ in range(pages):
        page_params = dict(params, **({"next_page_token": token} if token else {}))
        resp = cached(["hotels", {k: v for k, v in page_params.items() if k != "api_key"}],
                      lambda: http_json("https://serpapi.com/search.json?" + urllib.parse.urlencode(page_params)), no_cache)
        if resp.get("error"):
            if "hasn't returned any results" in resp["error"]:
                break
            raise HotelSearchError(f"SerpApi: {resp['error']}", "provider_error")
        insights_url = insights_url or (resp.get("search_metadata") or {}).get("google_hotels_url")
        total = total or (resp.get("search_information") or {}).get("total_results")
        props += resp.get("properties") or []
        token = (resp.get("serpapi_pagination") or {}).get("next_page_token")
        if not token:
            break
    return [normalize_property(p, q, insights_url) for p in props], {"total_results": total, "google_url": insights_url}


def serpapi_details(q: dict, token: str, no_cache: bool = False) -> dict:
    """Detalhe do hotel (1 busca): preços por site (Hotels.com, oficial...), faixa típica, horários, endereço."""
    params = dict(serpapi_params(q), property_token=token)
    resp = cached(["hotel-details", {k: v for k, v in params.items() if k != "api_key"}],
                  lambda: http_json("https://serpapi.com/search.json?" + urllib.parse.urlencode(params)), no_cache)
    if resp.get("error"):
        raise HotelSearchError(f"SerpApi: {resp['error']}", "provider_error")
    offers = []
    seen = set()
    for x in (resp.get("featured_prices") or []) + (resp.get("prices") or []):
        src = x.get("source")
        if not src or src in seen:
            continue
        seen.add(src)
        offers.append({
            "source": src, "official": bool(x.get("official")),
            "night": (x.get("rate_per_night") or {}).get("extracted_lowest"),
            "total": (x.get("total_rate") or {}).get("extracted_lowest"),
            "free_cancellation": x.get("free_cancellation"), "link": x.get("link"),
        })
    tpr = resp.get("typical_price_range") or {}
    return {
        "typical_range": [tpr["extracted_lowest"], tpr["extracted_highest"]] if tpr.get("extracted_lowest") and tpr.get("extracted_highest") else None,
        "offers": offers,
        "hotels_com": next((o for o in offers if o["source"].lower().startswith("hotels.com")), None),
        "official": next((o for o in offers if o["official"]), None),
        "cheapest": min((o for o in offers if o["night"]), key=lambda o: o["night"], default=None),
        "check_in_time": resp.get("check_in_time"),
        "check_out_time": resp.get("check_out_time"),
        "address": resp.get("address"),
        "phone": resp.get("phone"),
        "official_link": resp.get("link"),
        "amenities": normalize_amenities(resp.get("amenities")),
    }


def search_mock(q: dict, pages: int, no_cache: bool) -> tuple:
    rng = random.Random(json.dumps(q, sort_keys=True))
    names = ["Grand Plaza", "Atrium Business", "Vila Jardins", "Metropolitan Suites", "Parque Hotel", "Central Inn",
             "Boulevard Executive", "Aurora Palace", "Estação Hotel", "Horizonte Flat", "Paulista Tower", "Solar Garden"]
    out = []
    for i, name in enumerate(names):
        stars = rng.choice([2, 3, 3, 4, 4, 5])
        night = round(rng.uniform(150, 260) * (stars - 0.6), 0)
        out.append({
            "id": f"mock-{i}", "name": f"{name} (fictício)", "type": "hotel", "stars": stars,
            "rating": round(rng.uniform(3.4, 4.9), 1), "reviews": rng.randint(40, 6000), "location_rating": round(rng.uniform(3.8, 4.9), 1),
            "price": {"night": night, "total": night * nights_of(q), "night_before_taxes": night, "currency": q["currency"], "nights": nights_of(q)},
            "deal": {"pct_below_average": 20, "label": "20% abaixo da média", "description": "Great deal"} if rng.random() < 0.2 else None,
            "amenities": rng.sample(["wifi_free", "breakfast_free", "gym", "parking", "ac", "restaurant", "business", "pool"], 4),
            "check_in_time": "14:00", "check_out_time": "12:00", "gps": [-23.56 + rng.uniform(-.02, .02), -46.65 + rng.uniform(-.02, .02)],
            "nearby": [{"name": "Ponto de referência", "mode": "a pé", "duration": f"{rng.randint(2, 20)} min"}],
            "essential_info": None, "eco_certified": False, "prices": [], "links": {"official": None, "google": None}, "provider": "mock",
        })
    return out, {"total_results": len(out), "google_url": None}


PROVIDERS = {"serpapi": search_serpapi, "mock": search_mock}


# ---------------------------------------------------------------------------
# Semáforo de preço e pontuação

SIGNAL_TEXT = {
    "budget": {"green": ("Dentro do orçamento", "Dentro"), "yellow": ("Até 10% acima do orçamento", "+10%"), "red": ("Fora do orçamento", "Fora")},
    "typical": {"green": ("Abaixo do típico do hotel", "Abaixo"), "yellow": ("Típico do hotel", "Típico"), "red": ("Acima do típico do hotel", "Acima")},
    "market": {"green": ("Abaixo da mediana da busca", "Abaixo"), "yellow": ("Na média da busca", "Média"), "red": ("Acima da mediana da busca", "Acima")},
}


def price_signal(h: dict, budget: float | None, median: float | None) -> dict:
    """Ordem de régua: 1) orçamento por noite (política); 2) faixa típica do próprio hotel (detalhe Google);
    3) desconto informado pelo Google ou mediana da categoria na busca."""
    night = h["price"]["night"]
    if night is None:
        return {"level": "unknown", "label": "Sem preço", "short": "—", "basis": "none"}
    if budget:
        level = "green" if night <= budget else "yellow" if night <= budget * 1.10 else "red"
        basis = "budget"
    elif (h.get("details") or {}).get("typical_range"):
        lo, hi = h["details"]["typical_range"]
        level = "green" if night <= lo + (hi - lo) / 3 else "yellow" if night <= hi else "red"
        basis = "typical"
    elif h.get("deal") and h["deal"].get("pct_below_average"):
        level, basis = "green", "market"
    elif median:
        level = "green" if night <= median * 0.9 else "yellow" if night <= median * 1.15 else "red"
        basis = "market"
    else:
        return {"level": "unknown", "label": "Sem referência", "short": "—", "basis": "none"}
    label, short = SIGNAL_TEXT[basis][level]
    return {"level": level, "label": label, "short": short, "basis": basis}


def score(h: dict, ref_price: float | None) -> float:
    """Recomendação: nota (35%), localização (25%), preço frente à referência (20%), volume de avaliações (10%), categoria (10%)."""
    rating = (h["rating"] or 3.5) / 5
    loc = (h["location_rating"] or 4.0) / 5
    reviews = min(1.0, math.log10((h["reviews"] or 1) + 1) / 4)
    stars = (h["stars"] or 3) / 5
    night = h["price"]["night"]
    price = 0.5 if not (night and ref_price) else max(0.0, min(1.0, 1.4 - night / ref_price * 0.8))
    if h.get("distance_km") is not None:
        loc = 0.6 * loc + 0.4 * max(0.0, 1 - h["distance_km"] / 5)
    return round(0.35 * rating + 0.25 * loc + 0.2 * price + 0.1 * reviews + 0.1 * stars, 4)


def median(values: list) -> float | None:
    values = sorted(v for v in values if v)
    if not values:
        return None
    mid = len(values) // 2
    return values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2


# ---------------------------------------------------------------------------
# Comandos


def validate(a: argparse.Namespace) -> dict:
    if not (a.where or "").strip():
        raise HotelSearchError("Informe --where (cidade, bairro, endereço ou nome do hotel).", "invalid_request")
    try:
        ci = dt.date.fromisoformat(a.check_in)
        co = dt.date.fromisoformat(a.check_out) if a.check_out else ci + dt.timedelta(days=a.nights or 1)
    except ValueError:
        raise HotelSearchError("Datas no formato AAAA-MM-DD.", "invalid_request") from None
    if ci < dt.date.today():
        raise HotelSearchError(f"Check-in no passado: {ci}.", "invalid_request")
    if co <= ci or (co - ci).days > 30:
        raise HotelSearchError("Check-out deve ser depois do check-in (máx. 30 noites).", "invalid_request")
    kids = [int(x) for x in (a.children_ages or "").split(",") if x.strip()]
    if any(not 1 <= k <= 17 for k in kids) or not 1 <= a.adults <= 8:
        raise HotelSearchError("Adultos de 1 a 8; idades de crianças de 1 a 17.", "invalid_request")
    near = None
    if a.near:
        m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*", a.near)
        if not m:
            raise HotelSearchError("--near deve ser 'latitude,longitude' (ex.: -23.5614,-46.6559).", "invalid_request")
        near = [float(m.group(1)), float(m.group(2))]
    if a.min_rating and a.min_rating not in (3.5, 4.0, 4.5):
        raise HotelSearchError("--min-rating aceita 3.5, 4 ou 4.5.", "invalid_request")
    amen = []
    for item in (a.amenities or "").split(","):
        key = item.strip().lower().replace("é", "e").replace("ã", "a").replace("í", "i")
        if not key:
            continue
        if key not in FILTER_KEYS:
            raise HotelSearchError(f"Comodidade desconhecida: {item}. Use: {', '.join(sorted(FILTER_KEYS))}.", "invalid_request")
        amen.append(key)
    return {
        "where": a.where.strip(), "check_in": ci.isoformat(), "check_out": co.isoformat(), "adults": a.adults,
        "children_ages": kids, "currency": a.currency.upper(), "min_stars": a.min_stars, "min_rating": a.min_rating,
        "free_cancellation": a.free_cancellation, "sort": a.sort, "budget": a.budget, "near": near, "amenities": amen,
        "include_rentals": a.include_rentals, "max_price": a.max_price,
    }


def cmd_search(a: argparse.Namespace) -> dict:
    q = validate(a)
    provider = a.provider or ("serpapi" if os.environ.get("SERPAPI_API_KEY") else None)
    if not provider:
        raise HotelSearchError("SERPAPI_API_KEY não configurada. Use --provider mock só para testes (dados fictícios).", "missing_credentials")
    hotels, meta = PROVIDERS[provider](q, max(1, min(a.pages, 3)), a.no_cache)

    out = []
    for h in hotels:
        if not q["include_rentals"] and h["type"] != "hotel":
            continue
        if q["min_stars"] and (h["stars"] or 0) < q["min_stars"]:
            continue
        if q["min_rating"] and (h["rating"] or 0) < q["min_rating"]:
            continue
        if q["max_price"] and h["price"]["night"] and h["price"]["night"] > q["max_price"]:
            continue
        if any(not set(FILTER_KEYS[k]) & set(h["amenities"]) for k in q["amenities"]):
            continue
        if h["price"]["night"] is None:
            continue
        h["distance_km"] = round(haversine_km(q["near"], h["gps"]), 2) if q["near"] and h.get("gps") else None
        out.append(h)

    # mediana por categoria (cai para a mediana geral quando a categoria tem poucos hotéis)
    overall = median([h["price"]["night"] for h in out])
    by_stars = {}
    for h in out:
        by_stars.setdefault(h["stars"], []).append(h["price"]["night"])
    for h in out:
        group = by_stars.get(h["stars"]) or []
        ref = median(group) if len(group) >= 3 else overall
        h["signal"] = price_signal(h, q["budget"], ref)
        h["score"] = score(h, q["budget"] or ref)

    sort = q["sort"]
    keys = {
        "price": lambda h: h["price"]["night"],
        "rating": lambda h: (-(h["rating"] or 0), -(h["reviews"] or 0)),
        "distance": lambda h: (h["distance_km"] if h["distance_km"] is not None else 1e9, h["price"]["night"]),
        "best": lambda h: -h["score"],
    }
    out.sort(key=keys.get(sort, keys["best"]))
    result = {
        "query": {**q, "provider": provider, "nights": nights_of(q)},
        "count": len(out), "returned": min(len(out), a.limit), "hotels": out[: a.limit],
        "summary": {
            "total_results": meta.get("total_results"), "google_url": meta.get("google_url"),
            "median_night": overall, "cheapest_night": min((h["price"]["night"] for h in out), default=None),
            "within_budget": sum(1 for h in out if h["signal"]["basis"] == "budget" and h["signal"]["level"] == "green") if q["budget"] else None,
        },
    }
    if provider == "mock":
        result["warning"] = "DADOS FICTÍCIOS (provedor mock). Não use para decisões reais."
    return result


def cmd_details(a: argparse.Namespace) -> dict:
    a.where = a.where or "hotel"
    q = validate(a)
    return {"kind": "details", "token": a.token, "details": serpapi_details(q, a.token, a.no_cache)}


# ---------------------------------------------------------------------------
# Cotação (uma página, padrão TaxCo)


def stars_html(n) -> str:
    if not n:
        return '<span class="stars none">Sem categoria</span>'
    return f'<span class="stars" title="{n} estrelas">{"★" * n}<span class="off">{"★" * (5 - n)}</span></span>'


def render_hotel(rank: int, h: dict, q: dict, tags: list) -> str:
    cur = h["price"]["currency"]
    d = h.get("details") or {}
    sig = h["signal"]
    amen_keys = d.get("amenities") or h["amenities"]
    priority = ["breakfast_free", "breakfast", "wifi_free", "wifi", "gym", "parking_free", "parking", "business", "ac", "pool", "restaurant", "airport_shuttle"]
    amen = [AMENITY_LABEL[k] for k in priority if k in amen_keys][:5]
    near = [n for n in h.get("nearby") or [] if n.get("duration")]
    airport = next((n for n in near if re.search(r"aeroporto|airport", n["name"] or "", re.I)), None)
    poi = next((n for n in near if n is not airport), None)
    line1 = []
    if h.get("distance_km") is not None:
        line1.append(f"<b>{h['distance_km']:.1f} km</b> do ponto de referência".replace(".", ","))
    if poi:
        line1.append(f"{esc(shorten(poi['name'], 34))} {esc(poi['duration'])} {esc(poi['mode'] or '')}")
    line2 = []
    if airport:
        line2.append(f"Aeroporto {esc(airport['duration'])} {esc(airport['mode'] or '')}")
    times = d.get("check_in_time") or h.get("check_in_time"), d.get("check_out_time") or h.get("check_out_time")
    if any(times):
        line2.append(f"Check-in {esc(times[0] or '—')} · saída {esc(times[1] or '—')}")
    line3 = []
    if d.get("typical_range"):
        lo, hi = d["typical_range"]
        line3.append(f"Típico deste hotel {esc(money_short(lo, cur))}–{esc(money_short(hi, cur).split(' ', 1)[1])}/noite")
    elif h.get("deal"):
        line3.append(esc(h["deal"]["label"]))
    facts = [" · ".join(x) for x in (line1, line2, line3) if x]

    links = []
    best = d.get("cheapest")
    if best and best.get("link") and not best.get("official"):
        links.append(f'<a href="{esc(best["link"])}" target="_blank" rel="noopener" title="Menor preço entre os sites">Melhor: {esc(best["source"])} {esc(money_short(best["night"], cur))}&nbsp;↗</a>')
    hc = d.get("hotels_com")
    if hc and hc.get("link") and hc is not best:
        links.append(f'<a href="{esc(hc["link"])}" target="_blank" rel="noopener">Hotels.com {esc(money_short(hc["night"], cur)) if hc.get("night") else ""}&nbsp;↗</a>')
    elif not hc:
        links.append(f'<a href="{esc(hotels_com_search_url(h["name"], q))}" target="_blank" rel="noopener" title="Buscar no Hotels.com com as datas (entre na sua conta para tarifas de membro)">Hotels.com&nbsp;↗</a>')
    off = d.get("official")
    official_link = (off or {}).get("link") or d.get("official_link") or h["links"].get("official")
    if official_link:
        price_off = f" {money_short(off['night'], cur)}" if off and off.get("night") else ""
        links.append(f'<a href="{esc(official_link)}" target="_blank" rel="noopener">Oficial{esc(price_off)}&nbsp;↗</a>')
    if h["links"].get("google"):
        links.append(f'<a href="{esc(h["links"]["google"])}" target="_blank" rel="noopener">Google&nbsp;↗</a>')
    cancel_txt = "Cancelamento grátis" if any(o.get("free_cancellation") for o in d.get("offers") or []) else ""

    tag_html = "".join(f'<span class="tag {esc(c)}">{esc(t)}</span>' for t, c in tags)
    if h.get("rating"):
        reviews = f" · {h['reviews']:,} avaliações".replace(",", ".") if h.get("reviews") else ""
        rating = f'Nota <b>{str(h["rating"]).replace(".", ",")}</b>{reviews}'
    else:
        rating = "Sem avaliações"
    loc = f' · localização <b>{str(h["location_rating"]).replace(".", ",")}</b>' if h.get("location_rating") else ""
    nights = h["price"]["nights"]
    return f"""
    <article class="card">
      <header class="card-head">
        <span class="rank">{rank:02d}</span>
        <span class="signal {esc(sig['level'])}" title="{esc(sig['label'])}"><i></i>{esc(sig['short'])}</span>
        <div class="title"><b>{esc(h['name'])}</b>{stars_html(h['stars'])}{tag_html}</div>
        <div class="price"><b>{esc(money(h['price']['night'], cur))}</b><span>/noite · {esc(money_short(h['price']['total'], cur))} em {nights} noite{'s' if nights > 1 else ''}</span></div>
      </header>
      <div class="body">
        <div class="col">
          <div class="rate">{rating}{loc}</div>
          <div class="facts">{''.join(f'<span>{f}</span>' for f in facts)}</div>
        </div>
        <div class="col">
          <div class="amen">{''.join(f'<span>{esc(x)}</span>' for x in amen) or '<span>Comodidades não informadas</span>'}</div>
          <div class="links">{'<span class="cancel">' + cancel_txt + '</span>' if cancel_txt else ''}{''.join(links)}</div>
        </div>
      </div>
    </article>"""


def shorten(text: str, limit: int) -> str:
    """Corta no fim de uma palavra: 'Museu de Arte de São Paulo Assis…'."""
    text = text or ""
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(",;·- ") + "…"


def place_title(where: str) -> str:
    """'hotéis perto da Avenida Paulista, São Paulo' -> 'Avenida Paulista, São Paulo'."""
    t = re.sub(r"^\s*(hot[eé]is|hotel|hotels|hospedagem)\s+(perto|pr[oó]ximos?|near|em|in|no|na)?\s*(d[aoe]s?|à|ao|of)?\s*", "", where, flags=re.I)
    t = t.strip() or where.strip()
    return t[:1].upper() + t[1:]


def select_hotels(hotels: list, q: dict, count: int) -> list:
    """Curadoria da cotação: recomendado (maior pontuação) + melhores dentro do orçamento + a mais barata
    com categoria mínima (evita hostel em viagem corporativa) + uma opção superior, mesmo fora do orçamento."""
    floor = q.get("min_stars") or 3
    qualified = [h for h in hotels if (h["stars"] or 0) >= floor] or hotels
    by_score = sorted(qualified, key=lambda h: -h["score"])
    budget = q.get("budget")
    in_budget = [h for h in by_score if not budget or h["price"]["night"] <= budget * 1.10]
    picks = []

    def add(h):
        if h and h not in picks and len(picks) < count:
            picks.append(h)

    add((in_budget or by_score)[0])
    premium = max((h for h in by_score if h not in picks[:1] and (h["stars"] or 0) >= max(4, floor + 1)),
                  key=lambda h: ((h["stars"] or 0), h["rating"] or 0, h["reviews"] or 0), default=None)
    cheapest = min(qualified, key=lambda h: h["price"]["night"])
    add(cheapest)
    for h in in_budget:
        if len(picks) >= count - (1 if premium and premium not in picks else 0):
            break
        add(h)
    add(premium)
    for h in by_score:
        add(h)
    return picks


def hotels_com_search_url(name: str, q: dict) -> str:
    """Busca do hotel no Hotels.com com as datas: logado, o usuário vê a tarifa de membro."""
    return "https://www.hotels.com/Hotel-Search?" + urllib.parse.urlencode({
        "destination": name, "startDate": q["check_in"], "endDate": q["check_out"], "rooms": 1, "adults": q["adults"]})


def find_browser() -> str | None:
    import shutil
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge"):
        if shutil.which(name):
            return shutil.which(name)
    for path in ("/opt/pw-browsers/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"):
        if os.path.exists(path):
            return path
    return None


def cmd_quote(a: argparse.Namespace) -> dict:
    try:
        with open(a.from_json, encoding="utf-8") as f:
            result = json.load(f)
    except (OSError, ValueError, TypeError) as e:
        raise HotelSearchError(f"Não consegui ler a busca (--from-json): {e}", "invalid_request") from None
    if "hotels" not in result or "query" not in result:
        raise HotelSearchError("O JSON precisa ser a saída de 'search'.", "invalid_request")
    q, hotels = result["query"], [h for h in result["hotels"] if h["price"]["night"]]
    if not hotels:
        raise HotelSearchError("A busca não trouxe hotéis com preço.", "no_results")

    chosen = [json.loads(json.dumps(h)) for h in select_hotels(hotels, q, max(3, min(a.options, 6)))]
    main_id = chosen[0]["id"]

    lookups = 0
    if not a.no_details and q.get("provider") == "serpapi":
        for h in chosen:
            try:
                h["details"] = serpapi_details(q, h["id"])
                lookups += 1
            except HotelSearchError:
                h["details"] = None
    # o semáforo pode mudar com a faixa típica do hotel (detalhe), salvo quando há orçamento
    ref = median([h["price"]["night"] for h in hotels])
    for h in chosen:
        h["signal"] = price_signal(h, q.get("budget"), ref)
    chosen.sort(key=lambda h: h["price"]["night"])

    cur = q["currency"]
    best_rated = max(chosen, key=lambda h: ((h["rating"] or 0), h["reviews"] or 0))
    cards, out_opts = [], []
    for rank, h in enumerate(chosen, 1):
        tags = []
        if rank == 1:
            tags.append(("Mais em conta", "accent"))
        if h["id"] == main_id:
            tags.append(("Recomendado", "dark"))
        if h is best_rated and len(chosen) > 1:
            tags.append(("Melhor avaliado", ""))
        if q.get("budget") and h["price"]["night"] > q["budget"] * 1.10:
            tags.append(("Fora da política", ""))
        cards.append(render_hotel(rank, h, q, tags))
        d = h.get("details") or {}
        out_opts.append({
            "rank": rank, "name": h["name"], "stars": h["stars"], "rating": h["rating"], "reviews": h["reviews"],
            "price": h["price"], "signal": h["signal"], "tags": [t for t, _ in tags],
            "hotels_com": d.get("hotels_com") or {"search_link": hotels_com_search_url(h["name"], q)},
            "best_offer": d.get("cheapest"),
            "official": d.get("official") or ({"link": h["links"].get("official")} if h["links"].get("official") else None),
            "typical_range": d.get("typical_range"), "distance_km": h.get("distance_km"),
        })

    now = dt.datetime.now()
    valid = now + dt.timedelta(hours=a.valid_hours)
    reference = f"AH-{now:%y%m%d}-{secrets.token_hex(2).upper()}"
    brand = a.brand or os.environ.get("FLIGHTS_BRAND_NAME") or "Argos Core"
    pax = f"{q['adults']} adulto{'s' if q['adults'] > 1 else ''}" + (f", {len(q['children_ages'])} criança(s)" if q.get("children_ages") else "")
    nights = q["nights"]
    meta = [f"{date_pt(q['check_in'])} – {date_pt(q['check_out'])} {q['check_in'][:4]}", f"{nights} noite{'s' if nights > 1 else ''}", pax]
    if q.get("min_stars"):
        meta.append(f"{q['min_stars']}+ estrelas")

    if q.get("budget"):
        legend_steps = [("green", "Dentro"), ("yellow", "Até +10%"), ("red", "Fora")]
        basis = f"Orçamento {money_short(q['budget'], cur)}/noite"
    else:
        legend_steps = [("green", "Abaixo"), ("yellow", "Típico"), ("red", "Acima")]
        basis = "Faixa típica de cada hotel (Google)" if lookups else "Comparado à mediana da busca"
    legend = "".join(f'<span class="signal {lvl}"><i></i>{esc(t)}</span>' for lvl, t in legend_steps) + f'<span class="label">{esc(basis)}</span>'

    floor = q.get("min_stars") or 3
    qualified = [h for h in hotels if (h["stars"] or 0) >= floor] or hotels
    within = sum(1 for h in hotels if q.get("budget") and h["price"]["night"] <= q["budget"])
    stats = [(f"A partir de · {floor}★ ou mais", money_short(min(h["price"]["night"] for h in qualified), cur) + "/noite", f"{len(chosen)} opções de {result['count']} analisadas"),
             ("Mediana da busca", money_short(ref, cur) + "/noite" if ref else "—", "hotéis com preço nas datas")]
    if q.get("budget"):
        stats.append(("Dentro do orçamento", f"{within} de {len(hotels)}", f"até {money_short(q['budget'], cur)} por noite"))
    else:
        top = max(hotels, key=lambda h: ((h["rating"] or 0), h["reviews"] or 0))
        stats.append(("Melhor nota", str(top["rating"]).replace(".", ",") if top["rating"] else "—", top["name"][:34]))
    stats_html = "".join(f'<div class="stat"><span class="label">{esc(k)}</span><b>{esc(v)}</b><small>{esc(n)}</small></div>' for k, v, n in stats)

    mock_note = "Amostra com dados fictícios. " if q.get("provider") == "mock" else ""
    footnote = (f"{mock_note}Diárias com impostos e taxas estimados, para {pax}, consultadas no Google Hotels em {now.day} {MONTHS[now.month - 1]} {now.year}, "
                f"{now:%H:%M}. Os preços mudam sem aviso: confirme no link antes de reservar. No Hotels.com, entre na sua conta para ver tarifas de membro. "
                "Categoria e notas conforme Google; recomendação pondera nota, localização, preço, avaliações e categoria.")
    values = {
        "title": f"Cotação de hotéis · {q['where'][:40]}",
        "brand": esc(brand),
        "place_title": esc(place_title(q["where"])),
        "meta": " · ".join(esc(m) for m in meta),
        "client_line": f'<p class="client">Para {esc(a.client)}</p>' if a.client else "",
        "stats_html": stats_html,
        "legend": legend,
        "options_html": "".join(cards),
        # cada hotel ocupa ~160 px impressos; acima de 4 a escala reduz para caber em uma página A4
        "print_zoom": {3: "1", 4: "0.98", 5: "0.92", 6: "0.82"}[len(chosen)],
        "footnote": esc(footnote),
        "reference": esc(reference),
        "valid_until": esc(f"{valid.day} {MONTHS[valid.month - 1]}, {valid:%H:%M}"),
    }
    with open(os.path.join(SKILL_DIR, "templates", "quote.html"), encoding="utf-8") as f:
        page = f.read()
    for key, value in values.items():
        page = page.replace("{{" + key + "}}", str(value))
    out = a.output or os.path.join(os.path.expanduser("~"), ".local", "state", "openclaw-hotel-search", "quotes", f"{reference}.html")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    response = {"kind": "quote", "reference": reference, "html_path": os.path.abspath(out), "client": a.client,
                "valid_until": valid.isoformat(timespec="minutes"), "detail_lookups": lookups, "options": out_opts}
    if a.pdf:
        browser = find_browser()
        if not browser:
            response["pdf_error"] = "Nenhum Chrome/Chromium encontrado; envie o HTML ou imprima em PDF pelo navegador."
        else:
            import subprocess
            pdf = os.path.splitext(os.path.abspath(out))[0] + ".pdf"
            proc = subprocess.run([browser, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                                   "--virtual-time-budget=8000", f"--print-to-pdf={pdf}", "file://" + os.path.abspath(out)],
                                  capture_output=True, text=True, timeout=90)
            if os.path.exists(pdf):
                response["pdf_path"] = pdf
            else:
                response["pdf_error"] = (proc.stderr or "falha ao gerar PDF")[-300:]
    return response


# ---------------------------------------------------------------------------
# Saída em texto (compacta, para o agente)

LIGHT = {"green": "🟢", "yellow": "🟡", "red": "🔴", "unknown": "⚪"}


def to_text(r: dict) -> str:
    if r.get("kind") == "quote":
        lines = [f"Cotação {r['reference']}" + (f" para {r['client']}" if r.get("client") else "") + f" (válida até {r['valid_until']})",
                 f"HTML: {r['html_path']}"]
        if r.get("pdf_path"):
            lines.append(f"PDF: {r['pdf_path']}")
        if r.get("pdf_error"):
            lines.append(f"PDF não gerado: {r['pdf_error']}")
        for o in r["options"]:
            hc, best = o.get("hotels_com") or {}, o.get("best_offer") or {}
            extra = f" | melhor oferta {best['source']} {money_short(best['night'], o['price']['currency'])}" if best.get("night") else ""
            extra += f" | Hotels.com {money_short(hc['night'], o['price']['currency'])}" if hc.get("night") else " | Hotels.com: buscar"
            tags = f" [{', '.join(o['tags'])}]" if o["tags"] else ""
            lines.append(f"  {o['rank']}. {LIGHT[o['signal']['level']]} {money(o['price']['night'], o['price']['currency'])}/noite | "
                         f"{o['name']} {('★' * o['stars']) if o['stars'] else 's/ categoria'} | nota {o['rating']}{tags}{extra}")
        return "\n".join(lines)
    if r.get("kind") == "details":
        d = r["details"]
        lines = [f"Faixa típica: {d['typical_range']}" if d["typical_range"] else "Faixa típica: não informada",
                 f"Check-in {d['check_in_time']} · check-out {d['check_out_time']} · {d['address'] or ''} · {d['phone'] or ''}"]
        for o in sorted(d["offers"], key=lambda o: o["night"] or 1e9):
            lines.append(f"  {o['source']}{' (oficial)' if o['official'] else ''}: {o['night']}/noite, total {o['total']}"
                         f"{' · cancelamento grátis' if o['free_cancellation'] else ''}")
        return "\n".join(lines)
    q = r["query"]
    lines = [f"{q['where']} · {q['check_in']} → {q['check_out']} ({q['nights']} noites) · {q['adults']} adulto(s) · {q['provider']} · {r['count']} hotéis (mostrando {r['returned']})"]
    if r.get("warning"):
        lines.append("⚠ " + r["warning"])
    for i, h in enumerate(r["hotels"], 1):
        amen = ", ".join(AMENITY_LABEL[k] for k in h["amenities"][:4])
        dist = f" | {h['distance_km']} km" if h.get("distance_km") is not None else ""
        deal = f" | {h['deal']['label']}" if h.get("deal") else ""
        lines.append(f"{i}. {LIGHT[h['signal']['level']]} {money(h['price']['night'], h['price']['currency'])}/noite (total {money_short(h['price']['total'], h['price']['currency'])}) | "
                     f"{h['name']} | {(str(h['stars']) + '★') if h['stars'] else 's/ cat.'} | nota {h['rating']} ({h['reviews']}) loc {h['location_rating']}"
                     f"{dist}{deal} | {h['signal']['label']} | {amen} | id={h['id']}")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="hotels.py", description="Pesquisa e cotação de hotéis (Google Hotels via SerpApi). Não reserva.")
    p.add_argument("--version", action="version", version=VERSION)
    sub = p.add_subparsers(dest="command", required=True)

    def common(sp):
        sp.add_argument("--where", help="Cidade, bairro, endereço ou nome do hotel (ex.: 'Avenida Paulista, São Paulo')")
        sp.add_argument("--check-in", required=True, help="AAAA-MM-DD")
        sp.add_argument("--check-out", help="AAAA-MM-DD (ou use --nights)")
        sp.add_argument("--nights", type=int, help="Noites, se não informar --check-out")
        sp.add_argument("--adults", type=int, default=1)
        sp.add_argument("--children-ages", default="")
        sp.add_argument("--currency", default=os.environ.get("HOTELS_CURRENCY", "BRL"))
        sp.add_argument("--no-cache", action="store_true")
        sp.add_argument("--format", choices=["json", "text"], default="json")

    s = sub.add_parser("search", help="Buscar hotéis")
    common(s)
    s.add_argument("--budget", type=float, default=float(os.environ["HOTELS_BUDGET_PER_NIGHT"]) if os.environ.get("HOTELS_BUDGET_PER_NIGHT") else None,
                   help="Orçamento/política por noite (com taxas). Define o semáforo dentro/fora")
    s.add_argument("--max-price", type=float, help="Excluir hotéis acima deste valor por noite")
    s.add_argument("--min-stars", type=int, choices=[2, 3, 4, 5])
    s.add_argument("--min-rating", type=float, help="3.5, 4 ou 4.5")
    s.add_argument("--amenities", help="Exigir: " + ", ".join(sorted(FILTER_KEYS)))
    s.add_argument("--free-cancellation", action="store_true")
    s.add_argument("--near", help="Ponto de referência 'lat,lng' para calcular distância")
    s.add_argument("--include-rentals", action="store_true", help="Incluir aluguéis por temporada (padrão: só hotéis)")
    s.add_argument("--sort", choices=["best", "price", "rating", "distance"], default="best")
    s.add_argument("--pages", type=int, default=1, help="Páginas de 20 resultados (1-3); cada página é 1 busca")
    s.add_argument("--limit", type=int, default=20)
    s.add_argument("--provider", choices=list(PROVIDERS))
    s.set_defaults(func=cmd_search)

    d = sub.add_parser("details", help="Preços por site (Hotels.com, oficial...) e faixa típica de um hotel (1 busca)")
    common(d)
    d.add_argument("--token", required=True, help="id (property_token) vindo do search")
    d.set_defaults(func=cmd_details, min_stars=None, min_rating=None, free_cancellation=False, sort="best", budget=None,
                   near=None, amenities=None, include_rentals=False, max_price=None)

    qt = sub.add_parser("quote", help="Cotação de uma página (HTML/PDF) a partir de um search")
    qt.add_argument("--from-json", required=True)
    qt.add_argument("--client")
    qt.add_argument("--options", type=int, default=5, help="Hotéis na cotação (3-6)")
    qt.add_argument("--no-details", action="store_true", help="Não consultar o detalhe de cada hotel (economiza 1 busca por hotel)")
    qt.add_argument("--valid-hours", type=int, default=24)
    qt.add_argument("--brand")
    qt.add_argument("--output")
    qt.add_argument("--pdf", action="store_true")
    qt.add_argument("--format", choices=["json", "text"], default="json")
    qt.set_defaults(func=cmd_quote)
    return p


def main(argv: list | None = None) -> int:
    load_env_file()
    args = build_parser().parse_args(argv)
    try:
        result = args.func(args)
    except HotelSearchError as e:
        print(json.dumps({"error": {"code": e.code, "message": str(e), "status": e.status}}, ensure_ascii=False))
        return 1
    print(to_text(result) if args.format == "text" else json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
