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
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY mes_numero, mes_nombre
                ORDER BY mes_numero
            """,
            "productos": f"""
                SELECT
                    codigo_producto AS nombre,
                    SUM(cantidad_creditos) AS cantidad
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY codigo_producto
                ORDER BY cantidad DESC
            """,
            "departamentos": f"""
                SELECT
                    departamento AS nombre,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY departamento
                ORDER BY monto_total DESC
                LIMIT 10
            """,
            "instituciones": f"""
                SELECT
                    nombre_ifi AS nombre,
                    ROUND(SUM(monto_credito), 2) AS monto_total
                FROM vw_creditos_analitica
                {where_sql}
                GROUP BY nombre_ifi
                ORDER BY monto_total DESC
                LIMIT 10
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
            kpis = connection.execute(
                text(queries["kpis"]), params
            ).mappings().one()
            response = {
                "kpis": self._serialize_row(kpis),
                "mensual": self._fetch_rows(
                    connection, queries["mensual"], params
                ),
                "productos": self._fetch_rows(
                    connection, queries["productos"], params
                ),
                "departamentos": self._fetch_rows(
                    connection, queries["departamentos"], params
                ),
                "instituciones": self._fetch_rows(
                    connection, queries["instituciones"], params
                ),
                "detalle": self._fetch_rows(
                    connection, queries["detalle"], params
                ),
                "filtros_aplicados": {
                    key: value for key, value in filters.items() if value
                },
            }
        return response

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
