import unittest

from web.app import app


class WebApiTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_index_serves_dashboard(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Colocaciones Mivivienda 2024", response.data)

    def test_health_connects_to_database(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_dashboard_returns_kpis_and_filtered_data(self):
        response = self.client.get(
            "/api/dashboard?departamento=LIMA&producto=NMIV"
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertGreater(payload["kpis"]["cantidad"], 0)
        self.assertEqual(
            payload["filtros_aplicados"],
            {"departamento": "LIMA", "producto": "NMIV"},
        )
        self.assertTrue(
            all(row["departamento"] == "LIMA" for row in payload["detalle"])
        )
        self.assertTrue(
            all(row["codigo_producto"] == "NMIV" for row in payload["detalle"])
        )


if __name__ == "__main__":
    unittest.main()
