"""Testes offline da skill de hotéis: python3 -m unittest discover -s tests"""

import contextlib
import datetime as dt
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "skills", "hotel-search", "scripts"))
import hotels  # noqa: E402

CHECK_IN = (dt.date.today() + dt.timedelta(days=30)).isoformat()
CHECK_OUT = (dt.date.today() + dt.timedelta(days=32)).isoformat()


def prop(token, name, stars, night, rating=4.2, reviews=500, loc=4.6, amenities=(), deal=None, kind="hotel", gps=(-23.56, -46.656)):
    p = {"type": kind, "name": name, "property_token": token, "overall_rating": rating, "reviews": reviews,
         "location_rating": loc, "rate_per_night": {"extracted_lowest": night, "extracted_before_taxes_fees": night},
         "total_rate": {"extracted_lowest": night * 2}, "amenities": list(amenities),
         "gps_coordinates": {"latitude": gps[0], "longitude": gps[1]},
         "nearby_places": [{"name": "Museu de Arte de São Paulo Assis Chateaubriand", "transportations": [{"type": "Walking", "duration": "5 min"}]},
                           {"name": "Aeroporto Internacional de Guarulhos", "transportations": [{"type": "Taxi", "duration": "40 min"}]}]}
    if stars:
        p["extracted_hotel_class"] = stars
    if deal:
        p["deal"] = deal
    return p


SEARCH = {
    "search_metadata": {"google_hotels_url": "https://www.google.com/travel/search?q=x"},
    "search_information": {"total_results": 99},
    "properties": [
        prop("t-hostel", "Hostel Barato", 2, 90, rating=4.5),
        prop("t-econ", "Hotel Econômico", 3, 250, amenities=["Free Wi-Fi", "Free breakfast"]),
        prop("t-mid", "Hotel Central", 4, 480, rating=4.4, reviews=3000, amenities=["Wi-Fi", "Breakfast ($)", "Fitness center", "Parking ($)"]),
        prop("t-lux", "Grand Luxo", 5, 950, rating=4.8, reviews=2500, amenities=["Free Wi-Fi", "Indoor pool", "Spa"]),
        prop("t-deal", "Hotel Promo", 3, 300, deal="25% abaixo da média", amenities=["Wi-Fi gratuito", "Café da manhã grátis"]),
        prop("t-flat", "Flat Paulista", None, 200, kind="vacation rental"),
    ],
}
DETAILS = {
    "typical_price_range": {"extracted_lowest": 400, "extracted_highest": 700},
    "check_in_time": "14:00", "check_out_time": "12:00", "address": "Rua X, 1", "phone": "+55 11 0000-0000",
    "link": "https://hotel.example.com",
    "featured_prices": [{"source": "Hotels.com", "rate_per_night": {"extracted_lowest": 520}, "total_rate": {"extracted_lowest": 1040},
                         "free_cancellation": True, "link": "https://www.google.com/aclk?hotels"}],
    "prices": [{"source": "Hotel Central", "official": True, "rate_per_night": {"extracted_lowest": 470}, "link": "https://g/official"},
               {"source": "Booking.com", "rate_per_night": {"extracted_lowest": 455}, "link": "https://g/booking"}],
}


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = hotels.main(list(argv))
    try:
        return code, json.loads(out.getvalue())
    except ValueError:
        return code, out.getvalue()


def fake_http(url, retries=3):
    return DETAILS if "property_token=" in url else SEARCH


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"HOTELS_CACHE_DIR": os.path.join(self.tmp.name, "c"),
                                                "HOTELS_ENV_FILE": os.path.join(self.tmp.name, "none.env"),
                                                "SERPAPI_API_KEY": "k"})
        self.env.start()
        os.environ.pop("HOTELS_BUDGET_PER_NIGHT", None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def search(self, *extra):
        with mock.patch.object(hotels, "http_json", side_effect=fake_http) as http:
            code, res = run("search", "--where", "hotéis perto da Avenida Paulista", "--check-in", CHECK_IN, "--check-out", CHECK_OUT, *extra)
        self.assertEqual(code, 0, res)
        return res, http


class TestSearch(Base):
    def test_normalization_and_filters(self):
        res, http = self.search("--sort", "price")
        names = [h["name"] for h in res["hotels"]]
        self.assertNotIn("Flat Paulista", names)                       # só hotéis por padrão
        self.assertEqual(names[0], "Hostel Barato")
        econ = next(h for h in res["hotels"] if h["name"] == "Hotel Econômico")
        self.assertEqual(econ["amenities"], ["wifi_free", "breakfast_free"])
        self.assertEqual(econ["price"], {"night": 250, "total": 500, "night_before_taxes": 250, "currency": "BRL", "nights": 2})
        promo = next(h for h in res["hotels"] if h["name"] == "Hotel Promo")
        self.assertEqual(promo["deal"]["pct_below_average"], 25)
        self.assertEqual(promo["amenities"], ["wifi_free", "breakfast_free"])     # rótulos em português também
        url = http.call_args.args[0]
        self.assertIn("engine=google_hotels", url)

    def test_filters(self):
        res, _ = self.search("--min-stars", "4", "--amenities", "academia")
        self.assertEqual([h["name"] for h in res["hotels"]], ["Hotel Central"])
        res, _ = self.search("--include-rentals", "--max-price", "220")
        self.assertEqual({h["name"] for h in res["hotels"]}, {"Hostel Barato", "Flat Paulista"})

    def test_budget_signal_and_distance(self):
        res, _ = self.search("--budget", "450", "--near=-23.5614,-46.6559", "--sort", "price")
        sig = {h["name"]: h["signal"]["level"] for h in res["hotels"]}
        self.assertEqual(sig["Hotel Econômico"], "green")
        self.assertEqual(sig["Hotel Central"], "yellow")       # 480 ≤ 450 × 1,10
        self.assertEqual(sig["Grand Luxo"], "red")
        self.assertTrue(all(h["distance_km"] < 1 for h in res["hotels"]))
        self.assertEqual(res["summary"]["within_budget"], 3)

    def test_validation(self):
        for argv in (("--where", "x", "--check-in", "2020-01-01", "--nights", "2"),
                     ("--where", "x", "--check-in", CHECK_IN, "--check-out", CHECK_IN),
                     ("--where", "x", "--check-in", CHECK_IN, "--nights", "2", "--amenities", "sauna"),
                     ("--where", "x", "--check-in", CHECK_IN, "--nights", "2", "--near", "paulista")):
            code, res = run("search", "--provider", "mock", *argv)
            self.assertEqual(res["error"]["code"], "invalid_request", argv)


class TestSignalAndHelpers(unittest.TestCase):
    def h(self, night, typical=None, deal=None):
        return {"price": {"night": night}, "details": {"typical_range": typical} if typical else None, "deal": deal}

    def test_price_signal_order(self):
        self.assertEqual(hotels.price_signal(self.h(500, [400, 700]), 450, 300)["basis"], "budget")
        self.assertEqual(hotels.price_signal(self.h(450, [400, 700]), None, 300)["level"], "green")    # 1º terço
        self.assertEqual(hotels.price_signal(self.h(650, [400, 700]), None, 300)["level"], "yellow")
        self.assertEqual(hotels.price_signal(self.h(701, [400, 700]), None, 300)["level"], "red")
        self.assertEqual(hotels.price_signal(self.h(999, deal={"pct_below_average": 20}), None, 300)["level"], "green")
        self.assertEqual(hotels.price_signal(self.h(400), None, 300)["level"], "red")                 # > mediana × 1,15

    def test_text_helpers(self):
        self.assertEqual(hotels.place_title("hotéis perto da Avenida Paulista, São Paulo"), "Avenida Paulista, São Paulo")
        self.assertEqual(hotels.shorten("Museu de Arte de São Paulo Assis Chateaubriand", 34), "Museu de Arte de São Paulo Assis…")
        self.assertIn("startDate=", hotels.hotels_com_search_url("Hotel X", {"check_in": "2026-11-16", "check_out": "2026-11-18", "adults": 1}))


class TestQuote(Base):
    def test_quote_curation_and_links(self):
        res, _ = self.search("--budget", "500")
        src = os.path.join(self.tmp.name, "busca.json")
        with open(src, "w") as f:
            json.dump(res, f)
        out = os.path.join(self.tmp.name, "cotacao.html")
        with mock.patch.object(hotels, "http_json", side_effect=fake_http):
            code, q = run("quote", "--from-json", src, "--client", "Ana <B>", "--options", "4", "--output", out)
        self.assertEqual(code, 0, q)
        names = [o["name"] for o in q["options"]]
        self.assertNotIn("Hostel Barato", names)                      # categoria mínima 3★
        self.assertIn("Grand Luxo", names)                            # opção superior, fora da política
        lux = next(o for o in q["options"] if o["name"] == "Grand Luxo")
        self.assertEqual(lux["signal"]["level"], "red")
        self.assertIn("Fora da política", lux["tags"])
        prices = [o["price"]["night"] for o in q["options"]]
        self.assertEqual(prices, sorted(prices))
        self.assertEqual(q["options"][0]["hotels_com"]["night"], 520)
        self.assertEqual(q["options"][0]["best_offer"]["source"], "Booking.com")
        self.assertEqual(q["options"][0]["booking"]["night"], 455)
        with open(out, encoding="utf-8") as f:
            page = f.read()
        self.assertNotIn("{{", page)
        self.assertIn("Ana &lt;B&gt;", page)
        self.assertIn("Hotels.com", page)
        self.assertIn('class="signal red"', page)
        self.assertIn("Avenida Paulista", page)

    def test_quote_without_details(self):
        res, _ = self.search()
        src = os.path.join(self.tmp.name, "b.json")
        with open(src, "w") as f:
            json.dump(res, f)
        with mock.patch.object(hotels, "http_json", side_effect=fake_http) as http:
            code, q = run("quote", "--from-json", src, "--no-details", "--output", os.path.join(self.tmp.name, "c.html"))
        http.assert_not_called()
        self.assertEqual(q["detail_lookups"], 0)
        self.assertIn("search_link", q["options"][0]["hotels_com"])     # sem detalhe: link de busca no Hotels.com
        self.assertIn("booking.com/searchresults.html?ss=", q["options"][0]["booking"]["search_link"])
        with open(os.path.join(self.tmp.name, "c.html"), encoding="utf-8") as f:
            page = f.read()
        self.assertIn("booking.com/searchresults.html", page)
        self.assertIn("checkin=" + CHECK_IN, page)


if __name__ == "__main__":
    unittest.main()
