from decimal import Decimal

from sqlalchemy import text

from etl.conexion import get_engine


class DashboardService:
    def __init__(self):
        self.engine = get_engine()

    def check_connection(self) -> None:
        with self.engine.connect() as connection:
            connection.execute(text("SELECT 1"))

    def get_filters(self) -> dict:
        queries = {
            "departamentos": (
                "SELECT DISTINCT departamento AS value "
                "FROM vw_creditos_analitica ORDER BY departamento"
            ),
            "productos": (
                "SELECT DISTINCT codigo_producto AS value "
                "FROM vw_creditos_analitica ORDER BY codigo_producto"
            ),
            "tipos_ifi": (
                "SELECT DISTINCT tipo_ifi AS value "
                "FROM vw_creditos_analitica ORDER BY tipo_ifi"
            ),
        }
        result = {}
        with self.engine.connect() as connection:
            for key, query in queries.items():
                result[key] = [
                    row.value for row in connection.execute(text(query))
                ]
        return result

    def get_dashboard(self, filters: dict[str, str]) -> dict:
        where_sql, params = self._build_where(filters)

        queries = {
            "kpis": f"""
                SELECT
                    COALESCE(SUM(cantidad_creditos), 0) AS cantidad,
                    COALESCE(SUM(monto_credito), 0) AS monto_total,
                    COALESCE(AVG(monto_credito), 0) AS monto_promedio,
                    COALESCE(AVG(tasa_interes), 0) AS tasa_promedio
                FROM vw_creditos_analitica
                {where_sql}
            """,
            "mensual": f"""
                SELECT
                    mes_numero,
                    mes_nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY mes_numero, mes_nombre
                ORDER BY mes_numero
            """,
            "productos": f"""
                SELECT
                    codigo_producto AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total,
                    ROUND(AVG(monto_credito), 2) AS monto_promedio
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY codigo_producto
                ORDER BY monto_total DESC
            """,
            "departamentos": f"""
                SELECT
                    departamento AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY departamento
                ORDER BY monto_total DESC
                LIMIT 10
            """,
            "mapa": f"""
                SELECT
                    departamento AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY departamento
                ORDER BY monto_total DESC
            """,
            "instituciones": f"""
                SELECT
                    nombre_ifi AS nombre,
                    tipo_ifi,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY nombre_ifi, tipo_ifi
                ORDER BY monto_total DESC
                LIMIT 10
            """,
            "trimestres": f"""
                SELECT
                    trimestre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY trimestre
                ORDER BY trimestre
            """,
            "plazos": f"""
                SELECT
                    categoria_plazo AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total,
                    ROUND(AVG(plazo_meses), 1) AS plazo_promedio
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY categoria_plazo
                ORDER BY MIN(plazo_meses)
            """,
            "tasas": f"""
                SELECT
                    codigo_producto AS producto,
                    tipo_ifi,
                    ROUND(AVG(tasa_interes), 2) AS tasa_promedio,
                    SUM(cantidad_creditos) AS cantidad
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY codigo_producto, tipo_ifi
                ORDER BY codigo_producto, tipo_ifi
            """,
            "concentracion": f"""
                SELECT
                    CASE
                        WHEN departamento = 'LIMA' THEN 'LIMA'
                        ELSE 'RESTO DEL PAIS'
                    END AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY
                    CASE
                        WHEN departamento = 'LIMA' THEN 'LIMA'
                        ELSE 'RESTO DEL PAIS'
                    END
                ORDER BY monto_total DESC
            """,
            "detalle": f"""
                SELECT
                    fecha_desembolso,
                    codigo_producto,
                    departamento,
                    provincia,
                    distrito,
                    nombre_ifi,
                    tipo_ifi,
                    plazo_meses,
                    monto_credito,
                    tasa_interes
                FROM vw_creditos_analitica
                {where_sql}
                ORDER BY fecha_desembolso DESC, monto_credito DESC
                LIMIT 100
            """,
        }

        with self.engine.connect() as connection:
            kpis = self._serialize_row(
                connection.execute(text(queries["kpis"]), params).mappings().one()
            )
            mensual = self._fetch_rows(
                connection, queries["mensual"], params
            )
            productos = self._fetch_rows(
                connection, queries["productos"], params
            )
            concentracion = self._fetch_rows(
                connection, queries["concentracion"], params
            )

            response = {
                "kpis": self._enrich_kpis(kpis, mensual, productos, concentracion),
                "mensual": mensual,
                "productos": productos,
                "departamentos": self._fetch_rows(
                    connection, queries["departamentos"], params
                ),
                "mapa": self._fetch_rows(
                    connection, queries["mapa"], params
                ),
                "instituciones": self._fetch_rows(
                    connection, queries["instituciones"], params
                ),
                "trimestres": self._fetch_rows(
                    connection, queries["trimestres"], params
                ),
                "plazos": self._fetch_rows(
                    connection, queries["plazos"], params
                ),
                "tasas": self._fetch_rows(
                    connection, queries["tasas"], params
                ),
                "concentracion": concentracion,
                "detalle": self._fetch_rows(
                    connection, queries["detalle"], params
                ),
                "filtros_aplicados": {
                    key: value for key, value in filters.items() if value
                },
            }
        return response

    @staticmethod
    def _enrich_kpis(
        kpis: dict,
        mensual: list[dict],
        productos: list[dict],
        concentracion: list[dict],
    ) -> dict:
        enriched = dict(kpis)

        if len(mensual) >= 2:
            previous = mensual[-2]["monto_total"] or 0
            current = mensual[-1]["monto_total"] or 0
            if previous:
                enriched["crecimiento_mensual_pct"] = round(
                    ((current - previous) / previous) * 100, 2
                )
            else:
                enriched["crecimiento_mensual_pct"] = None
            enriched["mes_actual"] = mensual[-1]["mes_nombre"]
            enriched["mes_anterior"] = mensual[-2]["mes_nombre"]
        else:
            enriched["crecimiento_mensual_pct"] = None
            enriched["mes_actual"] = mensual[-1]["mes_nombre"] if mensual else None
            enriched["mes_anterior"] = None

        if mensual:
            best = max(mensual, key=lambda row: row["monto_total"] or 0)
            enriched["mejor_mes"] = best["mes_nombre"]
            enriched["mejor_mes_monto"] = best["monto_total"]
        else:
            enriched["mejor_mes"] = None
            enriched["mejor_mes_monto"] = 0

        total_monto = enriched.get("monto_total") or 0
        nmiv = next(
            (row for row in productos if row["nombre"] == "NMIV"),
            None,
        )
        lima = next(
            (row for row in concentracion if row["nombre"] == "LIMA"),
            None,
        )

        enriched["participacion_nmiv_pct"] = (
            round((nmiv["monto_total"] / total_monto) * 100, 2)
            if nmiv and total_monto
            else 0
        )
        enriched["concentracion_lima_pct"] = (
            round((lima["monto_total"] / total_monto) * 100, 2)
            if lima and total_monto
            else 0
        )
        return enriched

    @staticmethod
    def _build_where(filters: dict[str, str]) -> tuple[str, dict]:
        column_map = {
            "departamento": "departamento",
            "producto": "codigo_producto",
            "tipo_ifi": "tipo_ifi",
        }
        clauses = []
        params = {}
        for key, column in column_map.items():
            value = filters.get(key)
            if value:
                clauses.append(f"{column} = :{key}")
                params[key] = value
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return where_sql, params

    def _fetch_rows(self, connection, query: str, params: dict) -> list[dict]:
        rows = connection.execute(text(query), params).mappings()
        return [self._serialize_row(row) for row in rows]

    @staticmethod
    def _serialize_row(row) -> dict:
        result = {}
        for key, value in dict(row).items():
            if isinstance(value, Decimal):
                result[key] = float(value)
            elif hasattr(value, "isoformat"):
                result[key] = value.isoformat()
            else:
                result[key] = value
        return result
