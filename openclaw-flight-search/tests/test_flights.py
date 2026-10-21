"""Testes offline: python3 -m unittest discover -s tests"""

import contextlib
import datetime as dt
import io
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "skills", "flight-search", "scripts"))
import flights  # noqa: E402

FUTURE = (dt.date.today() + dt.timedelta(days=30)).isoformat()
FUTURE_RET = (dt.date.today() + dt.timedelta(days=40)).isoformat()

SERPAPI_RESPONSE = {
    "search_metadata": {"google_flights_url": "https://www.google.com/travel/flights?x"},
    "price_insights": {"lowest_price": 350, "price_level": "low", "typical_price_range": [400, 900], "price_history": [[1, 2]]},
    "best_flights": [
        {
            "flights": [
                {
                    "departure_airport": {"id": "CGH", "time": f"{FUTURE} 07:00"},
                    "arrival_airport": {"id": "SDU", "time": f"{FUTURE} 08:05"},
                    "duration": 65,
                    "airline": "LATAM",
                    "flight_number": "LA 3000",
                    "airplane": "Airbus A320",
                    "extensions": ["Average legroom (76 cm)", "Wi-Fi for a fee", "Carbon emissions estimate: 68 kg"],
                }
            ],
            "total_duration": 65,
            "price": 489,
            "booking_token": "tok",
        }
    ],
    "other_flights": [
        {
            "flights": [
                {"departure_airport": {"id": "CGH", "time": f"{FUTURE} 09:00"}, "arrival_airport": {"id": "BSB", "time": f"{FUTURE} 10:40"},
                 "duration": 100, "airline": "GOL", "flight_number": "G3 1000"},
                {"departure_airport": {"id": "BSB", "time": f"{FUTURE} 12:00"}, "arrival_airport": {"id": "SDU", "time": f"{FUTURE} 13:45"},
                 "duration": 105, "airline": "GOL", "flight_number": "G3 1001"},
            ],
            "total_duration": 285,
            "price": 350,
        }
    ],
}


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = flights.main(list(argv))
    text = out.getvalue()
    try:
        return code, json.loads(text)
    except ValueError:
        return code, text


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        env = {"FLIGHTS_CACHE_DIR": os.path.join(self.tmp.name, "cache"), "FLIGHTS_STATE_DIR": os.path.join(self.tmp.name, "state"),
               "FLIGHTS_ENV_FILE": os.path.join(self.tmp.name, "nao-existe.env")}
        self.env = mock.patch.dict(os.environ, env, clear=False)
        self.env.start()
        for k in ("SERPAPI_API_KEY", "FLIGHTS_PROVIDER"):
            os.environ.pop(k, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()


class TestHelpers(unittest.TestCase):
    def test_money(self):
        self.assertEqual(flights.money(4532.1, "BRL"), "BRL 4.532,10")


class TestSerpApi(Base):
    def test_normalization_filters_and_sort(self):
        os.environ["SERPAPI_API_KEY"] = "k"
        with mock.patch.object(flights, "http_json", return_value=SERPAPI_RESPONSE) as http:
            code, res = run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE)
        self.assertEqual(code, 0)
        self.assertIn("engine=google_flights", http.call_args.args[1])
        self.assertEqual([o["price"]["amount"] for o in res["offers"]], [350.0, 489.0])
        self.assertEqual(res["offers"][0]["slices"][0]["stops"], 1)
        self.assertEqual(res["offers"][1]["slices"][0]["segments"][0]["amenities"], ["Average legroom (76 cm)", "Wi-Fi for a fee"])
        self.assertEqual(res["summary"]["fastest_minutes"], 65)
        self.assertTrue(res["summary"]["direct_available"])
        self.assertEqual(res["price_insights"], {"level": "low", "typical_range": [400, 900], "lowest_price": 350})

        with mock.patch.object(flights, "http_json", return_value=SERPAPI_RESPONSE):
            _, direct = run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE, "--max-stops", "0", "--no-cache")
            _, fast = run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE, "--sort", "duration")
            _, nogol = run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE, "--exclude-airlines", "g3")
            _, late = run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE, "--depart-after", "08:00")
        self.assertEqual(direct["count"], 1)
        self.assertEqual(fast["offers"][0]["airlines"], ["LATAM"])
        self.assertEqual(nogol["offers"][0]["airlines"], ["LATAM"])
        self.assertEqual(late["offers"][0]["airlines"], ["GOL"])
        self.assertEqual(late["count"], 1)


class TestValidationAndMisc(Base):
    def test_no_provider(self):
        code, res = run("search", "--from", "GRU", "--to", "LIS", "--depart", FUTURE)
        self.assertEqual(res["error"]["code"], "missing_credentials")

    def test_invalid_inputs(self):
        past = (dt.date.today() - dt.timedelta(days=1)).isoformat()
        cases = [
            ("--from", "GR", "--to", "LIS", "--depart", FUTURE),
            ("--from", "GRU", "--to", "GRU", "--depart", FUTURE),
            ("--from", "GRU", "--to", "LIS", "--depart", past),
            ("--from", "GRU", "--to", "LIS", "--depart", FUTURE_RET, "--return", FUTURE),
            ("--from", "GRU", "--to", "LIS", "--depart", FUTURE, "--adults", "1", "--infants", "2"),
            ("--from", "GRU", "--to", "LIS", "--depart", FUTURE, "--flex-days", "9"),
            ("--from", "GRU", "--to", "LIS", "--depart", FUTURE, "--depart-after", "25:00"),
        ]
        for argv in cases:
            code, res = run("search", "--provider", "mock", *argv)
            self.assertNotEqual(code, 0, argv)
            self.assertEqual(res["error"]["code"], "invalid_request", argv)

    def test_mock_flex_and_text(self):
        code, res = run("search", "--provider", "mock", "--from", "GRU", "--to", "LIS", "--depart", FUTURE, "--flex-days", "2")
        self.assertEqual(code, 0)
        self.assertEqual(len(res["by_date"]), 5)
        self.assertIn("warning", res)
        ids = [o["id"] for o in res["offers"]]
        self.assertEqual(len(ids), len(set(ids)))
        code, text = run("search", "--provider", "mock", "--from", "GRU", "--to", "LIS", "--depart", FUTURE, "--format", "text")
        self.assertTrue(text.startswith("GRU→LIS"))

    def test_airports_offline(self):
        code, res = run("airports", "Sao Paulo")
        self.assertEqual({a["iata"] for a in res["airports"]}, {"GRU", "CGH"})
        _, res = run("airports", "lis")
        self.assertEqual(res["airports"][0]["iata"], "LIS")


def serp_with_price(price):
    data = json.loads(json.dumps(SERPAPI_RESPONSE))
    data["other_flights"][0]["price"] = price
    data["best_flights"][0]["price"] = price + 100
    return data


class TestWatch(Base):
    def test_alert_flow(self):
        os.environ["SERPAPI_API_KEY"] = "k"
        code, res = run("watch", "add", "--target-price", "300", "--drop-percent", "10", "--",
                        "--from", "CGH", "--to", "SDU", "--depart", FUTURE)
        self.assertEqual(code, 0)
        wid = res["watch"]["id"]

        def check(price):
            with mock.patch.object(flights, "http_json", return_value=serp_with_price(price)):
                return run("watch", "check")[1]

        first = check(350)            # acima do alvo, sem histórico
        self.assertEqual(first["alerts"], [])
        self.assertEqual(first["checked"][0]["price"], 350.0)
        drop = check(310)             # queda de 11%
        self.assertEqual(drop["alerts"][0]["reason"], "price_drop")
        hit = check(290)              # atingiu o alvo
        self.assertEqual(hit["alerts"][0]["reason"], "target_reached")
        self.assertEqual(len(hit["alerts"][0]["top_offers"]), 2)
        again = check(290)            # mesmo preço: não repete
        self.assertEqual(again["alerts"], [])
        lower = check(250)            # mais barato ainda: alerta de novo
        self.assertEqual(lower["alerts"][0]["reason"], "target_reached")

        _, listing = run("watch", "list")
        w = listing["watches"][0]
        self.assertEqual((w["best_price"], w["last_price"]), (250.0, 250.0))
        self.assertEqual(run("watch", "remove", wid)[0], 0)
        self.assertEqual(run("watch", "list")[1]["count"], 0)

    def test_invalid_watch(self):
        code, res = run("watch", "add", "--target-price", "1", "--", "--from", "GRU", "--to", "XX", "--depart", FUTURE)
        self.assertEqual(res["error"]["code"], "invalid_request")
        code, res = run("watch", "add", "--", "--from", "GRU", "--to", "LIS", "--depart", FUTURE, "--provider", "mock")
        self.assertEqual(res["error"]["code"], "invalid_request")


class TestEnvFile(Base):
    def test_key_from_env_file(self):
        path = os.environ["FLIGHTS_ENV_FILE"]
        with open(path, "w") as f:
            f.write("# comentário\nSERPAPI_API_KEY=\"chave-do-arquivo\"\n")
        with mock.patch.object(flights, "http_json", return_value=SERPAPI_RESPONSE) as http:
            code, res = run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE)
        self.assertEqual(code, 0)
        self.assertEqual(res["query"]["provider"], "serpapi")
        self.assertIn("api_key=chave-do-arquivo", http.call_args.args[1])

    def test_environment_wins_over_file(self):
        with open(os.environ["FLIGHTS_ENV_FILE"], "w") as f:
            f.write("SERPAPI_API_KEY=do-arquivo\n")
        os.environ["SERPAPI_API_KEY"] = "do-ambiente"
        with mock.patch.object(flights, "http_json", return_value=SERPAPI_RESPONSE) as http:
            run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE)
        self.assertIn("api_key=do-ambiente", http.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
