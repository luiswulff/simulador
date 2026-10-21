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

DUFFEL_RESPONSE = {
    "data": {
        "offers": [
            {
                "id": "off_123",
                "total_amount": "3120.55",
                "total_currency": "BRL",
                "expires_at": "2026-11-01T10:00:00Z",
                "owner": {"name": "TAP Air Portugal", "iata_code": "TP"},
                "conditions": {"refund_before_departure": {"allowed": False}, "change_before_departure": {"allowed": True}},
                "slices": [
                    {
                        "duration": "PT10H35M",
                        "segments": [
                            {
                                "origin": {"iata_code": "GRU"},
                                "destination": {"iata_code": "LIS"},
                                "departing_at": f"{FUTURE}T22:05:00",
                                "arriving_at": f"{FUTURE}T11:40:00",
                                "duration": "PT10H35M",
                                "marketing_carrier": {"iata_code": "TP", "name": "TAP Air Portugal"},
                                "marketing_carrier_flight_number": "88",
                                "operating_carrier": {"name": "TAP Air Portugal"},
                                "aircraft": {"name": "Airbus A330-900"},
                                "passengers": [{"baggages": [{"type": "checked", "quantity": 1}, {"type": "carry_on", "quantity": 1}]}],
                            }
                        ],
                    }
                ],
            }
        ]
    }
}

SERPAPI_RESPONSE = {
    "search_metadata": {"google_flights_url": "https://www.google.com/travel/flights?x"},
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
        env = {"FLIGHTS_CACHE_DIR": self.tmp.name}
        self.env = mock.patch.dict(os.environ, env, clear=False)
        self.env.start()
        for k in ("DUFFEL_ACCESS_TOKEN", "SERPAPI_API_KEY", "FLIGHTS_PROVIDER"):
            os.environ.pop(k, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()


class TestHelpers(unittest.TestCase):
    def test_iso_duration(self):
        self.assertEqual(flights.iso_duration_minutes("PT10H35M"), 635)
        self.assertEqual(flights.iso_duration_minutes("P1DT2H"), 1560)
        self.assertEqual(flights.iso_duration_minutes("PT45M"), 45)
        self.assertIsNone(flights.iso_duration_minutes("bogus"))

    def test_money(self):
        self.assertEqual(flights.money(4532.1, "BRL"), "BRL 4.532,10")


class TestDuffel(Base):
    def test_request_and_normalization(self):
        os.environ["DUFFEL_ACCESS_TOKEN"] = "duffel_test_x"
        with mock.patch.object(flights, "http_json", return_value=DUFFEL_RESPONSE) as http:
            code, res = run("search", "--from", "gru", "--to", "lis", "--depart", FUTURE, "--return", FUTURE_RET,
                            "--adults", "2", "--children-ages", "7", "--max-stops", "0")
        self.assertEqual(code, 0)
        method, url, headers, body = http.call_args.args
        self.assertEqual(method, "POST")
        self.assertEqual(headers["Duffel-Version"], "v2")
        self.assertEqual(len(body["data"]["slices"]), 2)
        self.assertEqual(body["data"]["passengers"], [{"type": "adult"}, {"type": "adult"}, {"age": 7}])
        self.assertEqual(body["data"]["max_connections"], 0)
        offer = res["offers"][0]
        self.assertEqual(res["query"]["provider"], "duffel")
        self.assertEqual(offer["price"], {"amount": 3120.55, "currency": "BRL"})
        self.assertEqual(offer["slices"][0]["segments"][0]["flight_number"], "TP88")
        self.assertEqual(offer["slices"][0]["duration_minutes"], 635)
        self.assertEqual(offer["checked_bags"], 1)
        self.assertFalse(offer["refundable"])
        self.assertTrue(offer["changeable"])

    def test_cache_avoids_second_call(self):
        os.environ["DUFFEL_ACCESS_TOKEN"] = "duffel_test_x"
        with mock.patch.object(flights, "http_json", return_value=DUFFEL_RESPONSE) as http:
            run("search", "--from", "GRU", "--to", "LIS", "--depart", FUTURE)
            run("search", "--from", "GRU", "--to", "LIS", "--depart", FUTURE)
            self.assertEqual(http.call_count, 1)
            run("search", "--from", "GRU", "--to", "LIS", "--depart", FUTURE, "--no-cache")
            self.assertEqual(http.call_count, 2)

    def test_provider_error_is_json(self):
        os.environ["DUFFEL_ACCESS_TOKEN"] = "bad"
        err = flights.FlightSearchError("HTTP 401", "auth_error", 401)
        with mock.patch.object(flights, "http_json", side_effect=err):
            code, res = run("search", "--from", "GRU", "--to", "LIS", "--depart", FUTURE)
        self.assertEqual(code, 1)
        self.assertEqual(res["error"]["code"], "auth_error")


class TestSerpApi(Base):
    def test_normalization_filters_and_sort(self):
        os.environ["SERPAPI_API_KEY"] = "k"
        with mock.patch.object(flights, "http_json", return_value=SERPAPI_RESPONSE) as http:
            code, res = run("search", "--from", "CGH", "--to", "SDU", "--depart", FUTURE)
        self.assertEqual(code, 0)
        self.assertIn("engine=google_flights", http.call_args.args[1])
        self.assertEqual([o["price"]["amount"] for o in res["offers"]], [350.0, 489.0])
        self.assertEqual(res["offers"][0]["slices"][0]["stops"], 1)
        self.assertEqual(res["summary"]["fastest_minutes"], 65)
        self.assertTrue(res["summary"]["direct_available"])

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
        code, res = run("airports", "Sao Paulo", "--offline")
        self.assertEqual({a["iata"] for a in res["airports"]}, {"GRU", "CGH"})
        _, res = run("airports", "lis", "--offline")
        self.assertEqual(res["airports"][0]["iata"], "LIS")


if __name__ == "__main__":
    unittest.main()
