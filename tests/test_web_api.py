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
        self.assertIn(b"kpi-ai-btn", response.data)
        self.assertIn(b"Evolucion anual", response.data)
        self.assertIn(b"Monto y ticket por producto", response.data)
        self.assertIn(b"Detalle analitico", response.data)
        self.assertIn(b"Tendencias", response.data)
        self.assertIn(b"Diccionario", response.data)
        self.assertIn(b"Proyecto", response.data)

    def test_dashboard_routes_render(self):
        for path, needle in [
            ("/tendencias", b"Evolucion anual"),
            ("/tendencias", b"Lectura IA"),
            ("/mapa", b"Mapa interactivo"),
            ("/mapa", b"Relieve"),
            ("/mapa", b"Lectura IA"),
            ("/analisis", b"Monto y ticket por producto"),
            ("/analisis", b"FCTP"),
            ("/analisis", b"Lectura IA"),
            ("/detalle", b"Detalle analitico"),
        ]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertIn(needle, response.data, path)

    def test_proyecto_page_renders(self):
        response = self.client.get("/proyecto")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Proyecto academico", response.data)
        self.assertIn(b"Oscar Eduardo Balcazar Chumacero", response.data)
        self.assertIn(b"76,338", response.data)
        self.assertIn(b"83,122", response.data)
        self.assertIn(b"fact_credito", response.data)
        self.assertIn(b"Modelo estrella del DataMart", response.data)
        self.assertIn(b"Stack tecnologico", response.data)
        self.assertIn(b"img/stack/python.svg", response.data)
        self.assertIn(b"img/evidencias/etl_embudo_multianio.png", response.data)
        self.assertIn(b"Conocimientos aplicados", response.data)
        self.assertIn(b"Proceso ETL", response.data)
        self.assertIn(b"vw_creditos_analitica", response.data)
        self.assertIn(b"Indicadores del dashboard", response.data)
        self.assertIn(b"Innovaciones analiticas e asistencia de IA", response.data)
        self.assertIn(b"gpt-4.1-mini", response.data)
        self.assertIn(b"Como funciona la asistencia de IA", response.data)
        self.assertIn(b"ia_yoy_deltas_2018_2024.png", response.data)
        self.assertIn(b"Armado del JSON", response.data)
        self.assertIn(b"kpi_focus", response.data)
        self.assertIn(b"contexto_universo", response.data)
        self.assertIn(b"resumen_serie", response.data)
        self.assertIn(b"En resumen:", response.data)
        self.assertIn(b"existe una API en el backend", response.data)

    def test_yoy_supports_custom_year_pair(self):
        response = self.client.get("/api/dashboard?anio=2024&anio_comp=2018")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        yoy = payload["yoy"]
        self.assertTrue(yoy["available"])
        self.assertEqual(yoy["anio_actual"], 2024)
        self.assertEqual(yoy["anio_previo"], 2018)
        self.assertEqual(yoy["modo"], "manual")
        self.assertEqual(yoy["etiqueta"], "2018 vs 2024")
        self.assertIn("monto_total_pct", yoy["deltas"])
        self.assertTrue(payload["insights"])

    def test_interpretar_requires_kpis(self):
        response = self.client.post(
            "/api/interpretar",
            json={"modulo": "resumen"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("KPIs", response.get_json()["error"])

        streamed = self.client.post(
            "/api/interpretar/stream",
            json={"modulo": "resumen"},
        )
        self.assertEqual(streamed.status_code, 400)

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
        self.assertTrue(payload["anual"])
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

    def test_dictionary_page_and_api(self):
        page = self.client.get("/diccionario")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b"Diccionario de datos", page.data)

        response = self.client.get("/api/diccionario")
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertGreater(payload["total_campos"], 10)
        self.assertTrue(
            any(row["variable"] == "FECHA_DESEMBOLSO" for row in payload["campos"])
        )

    def test_filters_include_years(self):
        response = self.client.get("/api/filtros")
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertIn("anios", payload)
        self.assertIn("meta", payload)

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
