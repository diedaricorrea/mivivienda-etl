import unittest

from web.app import app


class WebApiTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_index_serves_dashboard(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Mivivienda", response.data)
        self.assertIn(b"Colocaciones del periodo", response.data)

    def test_proyecto_page_renders(self):
        response = self.client.get("/proyecto")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Exposicion final", response.data)
        self.assertIn(b"fact_credito", response.data)
        self.assertIn(b"Modelo estrella del DataMart", response.data)
        self.assertIn(b"por que se eligieron", response.data)
        self.assertIn(b"vw_creditos_analitica", response.data)
        self.assertIn(b"Componentes del DataMart", response.data)
        self.assertIn(b"16 metricas visuales", response.data)
        self.assertIn(b"Que consume el dashboard", response.data)

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
        self.assertIn("crecimiento_mensual_pct", payload["kpis"])
        self.assertIn("concentracion_lima_pct", payload["kpis"])
        self.assertTrue(payload["mensual"])
        self.assertTrue(payload["trimestres"])
        self.assertTrue(payload["plazos"])
        self.assertTrue(payload["tasas"])
        self.assertTrue(payload["concentracion"])
        self.assertTrue(payload["mapa"])
        self.assertEqual(payload["detalle_meta"]["page_size"], 50)
        self.assertLessEqual(len(payload["detalle"]), 50)
        self.assertGreater(payload["detalle_meta"]["total"], 0)
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
        self.assertEqual(
            payload["concentracion"][0]["nombre"],
            "LIMA",
        )

    def test_export_excel_download(self):
        response = self.client.get("/api/export?formato=xlsx&departamento=LIMA")

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "spreadsheetml",
            response.headers.get("Content-Type", ""),
        )
        self.assertTrue(response.data.startswith(b"PK"))


if __name__ == "__main__":
    unittest.main()
