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
        env = {"FLIGHTS_CACHE_DIR": os.path.join(self.tmp.name, "cache"), "FLIGHTS_STATE_DIR": os.path.join(self.tmp.name, "state")}
        self.env = mock.patch.dict(os.environ, env, clear=False)
        self.env.start()
        for k in ("DUFFEL_ACCESS_TOKEN", "SERPAPI_API_KEY", "FLIGHTS_PROVIDER", "FLIGHTS_BOOKING_ENABLED",
                  "FLIGHTS_ALLOW_LIVE_BOOKING", "FLIGHTS_MAX_BOOKING_AMOUNT"):
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


OFFER = {
    "id": "off_abc",
    "total_amount": "1500.00",
    "total_currency": "BRL",
    "expires_at": "2099-01-01T00:00:00Z",
    "passengers": [{"id": "pas_1", "type": "adult"}, {"id": "pas_2", "type": "infant_without_seat"}],
    "slices": DUFFEL_RESPONSE["data"]["offers"][0]["slices"],
    "owner": {"name": "TAP Air Portugal"},
}
PAX = [
    {"given_name": "Ana", "family_name": "Silva", "born_on": "1990-05-01", "gender": "f", "title": "ms",
     "email": "ana@example.com", "phone_number": "+5511999998888"},
    {"given_name": "Leo", "family_name": "Silva", "born_on": "2025-08-01", "gender": "m", "title": "mr",
     "email": "ana@example.com", "phone_number": "+5511999998888"},
]


class FakeDuffel:
    """Substitui http_json: nenhuma chamada sai para a rede."""

    def __init__(self, price="1500.00"):
        self.price = price
        self.orders = []

    def __call__(self, method, url, headers, body=None, retries=3):
        if method == "GET" and "/air/offers/" in url:
            return {"data": {**OFFER, "total_amount": self.price}}
        if method == "POST" and url.endswith("/air/orders"):
            assert retries == 0
            self.orders.append(body)
            return {"data": {"id": "ord_1", "booking_reference": "ABC123"}}
        raise AssertionError(url)


class TestBooking(Base):
    def setUp(self):
        super().setUp()
        os.environ["DUFFEL_ACCESS_TOKEN"] = "duffel_test_x"
        self.pax_file = os.path.join(self.tmp.name, "pax.json")
        with open(self.pax_file, "w") as f:
            json.dump(PAX, f)

    def prepare(self, fake):
        with mock.patch.object(flights, "http_json", fake):
            return run("book", "prepare", "--offer-id", "off_abc", "--passengers-file", self.pax_file)

    def confirm(self, fake, booking_id, code):
        with mock.patch.object(flights, "http_json", fake):
            return run("book", "confirm", "--booking-id", booking_id, "--approval-code", code)

    @staticmethod
    def wrong_code(code):
        return "000000" if code != "000000" else "111111"

    def test_disabled_by_default(self):
        self.assertEqual(self.prepare(FakeDuffel())[1]["error"]["code"], "booking_disabled")

    def test_live_token_blocked(self):
        os.environ.update({"FLIGHTS_BOOKING_ENABLED": "1", "DUFFEL_ACCESS_TOKEN": "duffel_live_x"})
        self.assertEqual(self.prepare(FakeDuffel())[1]["error"]["code"], "live_booking_blocked")

    def test_over_limit(self):
        os.environ.update({"FLIGHTS_BOOKING_ENABLED": "1", "FLIGHTS_MAX_BOOKING_AMOUNT": "1000"})
        self.assertEqual(self.prepare(FakeDuffel())[1]["error"]["code"], "over_limit")

    def test_happy_path(self):
        os.environ["FLIGHTS_BOOKING_ENABLED"] = "1"
        fake = FakeDuffel()
        code, prep = self.prepare(fake)
        self.assertEqual(code, 0, prep)
        self.assertEqual(prep["price"], {"amount": 1500.0, "currency": "BRL"})
        bid = prep["booking_id"]

        self.assertEqual(self.confirm(fake, bid, self.wrong_code(prep["approval_code"]))[1]["error"]["code"], "approval_mismatch")
        self.assertEqual(fake.orders, [])

        code, res = self.confirm(fake, bid, prep["approval_code"])
        self.assertEqual(code, 0, res)
        self.assertEqual(res["booking_reference"], "ABC123")
        self.assertTrue(res["test_mode"])
        order = fake.orders[0]["data"]
        self.assertEqual(order["payments"], [{"type": "balance", "currency": "BRL", "amount": "1500.00"}])
        self.assertEqual(order["passengers"][0]["id"], "pas_1")
        self.assertEqual(order["passengers"][0]["infant_passenger_id"], "pas_2")

        # não confirma duas vezes, e dados pessoais foram apagados
        self.assertEqual(self.confirm(fake, bid, prep["approval_code"])[1]["error"]["code"], "invalid_state")
        with open(os.path.join(os.environ["FLIGHTS_STATE_DIR"], "bookings.json")) as f:
            stored = f.read()
        self.assertNotIn("1990-05-01", stored)
        self.assertNotIn("+5511999998888", stored)

    def test_price_changed_aborts(self):
        os.environ["FLIGHTS_BOOKING_ENABLED"] = "1"
        _, prep = self.prepare(FakeDuffel())
        fake = FakeDuffel(price="1700.00")
        self.assertEqual(self.confirm(fake, prep["booking_id"], prep["approval_code"])[1]["error"]["code"], "price_changed")
        self.assertEqual(fake.orders, [])

    def test_three_wrong_codes_cancel(self):
        os.environ["FLIGHTS_BOOKING_ENABLED"] = "1"
        fake = FakeDuffel()
        _, prep = self.prepare(fake)
        for _ in range(3):
            self.confirm(fake, prep["booking_id"], self.wrong_code(prep["approval_code"]))
        self.assertEqual(self.confirm(fake, prep["booking_id"], prep["approval_code"])[1]["error"]["code"], "invalid_state")
        self.assertEqual(fake.orders, [])

    def test_passenger_validation(self):
        os.environ["FLIGHTS_BOOKING_ENABLED"] = "1"
        with open(self.pax_file, "w") as f:
            json.dump([{**PAX[0], "phone_number": "11 9999"}, PAX[1]], f)
        self.assertEqual(self.prepare(FakeDuffel())[1]["error"]["code"], "invalid_request")
        with open(self.pax_file, "w") as f:
            json.dump(PAX[:1], f)
        self.assertIn("2 passageiro", self.prepare(FakeDuffel())[1]["error"]["message"])


if __name__ == "__main__":
    unittest.main()
