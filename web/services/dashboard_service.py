from decimal import Decimal
from pathlib import Path
import time

import pandas as pd
from sqlalchemy import text

from config.conexion import PROJECT_ROOT, get_engine


NUEVO_CREDITO_CODES = {"NMIV", "NCMV", "CMV"}
AGG_TABLE = "agg_colocaciones"
DETAIL_VIEW = "vw_creditos_analitica"
DICTIONARY_PATH = (
    PROJECT_ROOT / "datos" / "DiccionarioDatos_Colocaciones_Credito_Mivivienda_0.xlsx"
)
META_CACHE_SECONDS = 45


class DashboardService:
    def __init__(self):
        self.engine = get_engine()
        self._meta_cache: dict | None = None
        self._meta_cache_at = 0.0
        self._agg_ready = False

    def check_connection(self) -> None:
        with self.engine.connect() as connection:
            connection.execute(text("SELECT 1"))

    def _ensure_aggregates(self) -> None:
        """Si la tabla agregada esta vacia pero hay hechos, la reconstruye."""
        if self._agg_ready:
            return
        from etl.load import refresh_aggregates

        with self.engine.connect() as connection:
            try:
                agg_count = connection.execute(
                    text(f"SELECT COUNT(*) FROM {AGG_TABLE}")
                ).scalar_one()
            except Exception:
                agg_count = 0

            fact_count = connection.execute(
                text("SELECT COUNT(*) FROM fact_credito")
            ).scalar_one()

        if fact_count and not agg_count:
            refresh_aggregates()
        elif agg_count == 0 and fact_count == 0:
            from etl.load import ensure_aggregate_table

            ensure_aggregate_table()
        self._agg_ready = True
        self._meta_cache = None

    def get_meta(self, *, force: bool = False) -> dict:
        self._ensure_aggregates()
        now = time.monotonic()
        if (
            not force
            and self._meta_cache is not None
            and (now - self._meta_cache_at) < META_CACHE_SECONDS
        ):
            return self._meta_cache

        query = f"""
            SELECT
                COALESCE(SUM(cantidad_creditos), 0) AS total_creditos,
                COALESCE(SUM(monto_total), 0) AS monto_total,
                MIN(anio) AS anio_min,
                MAX(anio) AS anio_max
            FROM {AGG_TABLE}
        """
        with self.engine.connect() as connection:
            row = self._serialize_row(
                connection.execute(text(query)).mappings().one()
            )
            anios = [
                int(item["anio"])
                for item in connection.execute(
                    text(f"SELECT DISTINCT anio FROM {AGG_TABLE} ORDER BY anio")
                ).mappings()
            ]

        anio_min = row.get("anio_min")
        anio_max = row.get("anio_max")
        if anio_min and anio_max and anio_min != anio_max:
            periodo = f"{anio_min} - {anio_max}"
        elif anio_max:
            periodo = str(anio_max)
        else:
            periodo = "Sin datos"

        meta = {
            "total_creditos": int(row.get("total_creditos") or 0),
            "monto_total": row.get("monto_total") or 0,
            "anio_min": anio_min,
            "anio_max": anio_max,
            "anios": anios,
            "periodo": periodo,
            "fuente": "DataMart Mivivienda",
        }
        self._meta_cache = meta
        self._meta_cache_at = now
        return meta

    def get_filters(self) -> dict:
        self._ensure_aggregates()
        queries = {
            "anios": f"SELECT DISTINCT anio AS value FROM {AGG_TABLE} ORDER BY anio",
            "departamentos": (
                f"SELECT DISTINCT departamento AS value "
                f"FROM {AGG_TABLE} ORDER BY departamento"
            ),
            "productos": (
                f"SELECT DISTINCT codigo_producto AS value "
                f"FROM {AGG_TABLE} ORDER BY codigo_producto"
            ),
            "tipos_ifi": (
                f"SELECT DISTINCT tipo_ifi AS value "
                f"FROM {AGG_TABLE} ORDER BY tipo_ifi"
            ),
        }
        result = {}
        with self.engine.connect() as connection:
            for key, query in queries.items():
                values = [
                    row.value for row in connection.execute(text(query))
                ]
                if key == "anios":
                    result[key] = [str(int(value)) for value in values]
                else:
                    result[key] = values
        result["meta"] = self.get_meta()
        return result

    def get_dictionary(self) -> dict:
        if not DICTIONARY_PATH.exists():
            raise FileNotFoundError(
                f"No se encontro el diccionario: {DICTIONARY_PATH.name}"
            )

        def cell_text(value) -> str:
            if value is None or (isinstance(value, float) and pd.isna(value)):
                return ""
            text = str(value).strip()
            if text.lower() in {"nan", "<na>", "none"}:
                return ""
            return text

        raw = pd.read_excel(DICTIONARY_PATH, header=None)
        header_idx = None
        for index, row in raw.iterrows():
            first = cell_text(row.iloc[0]).lower()
            if first == "variable":
                header_idx = index
                break

        if header_idx is None:
            raise ValueError("No se encontro la cabecera Variable en el diccionario")

        dataset_name = "COLOCACIONES DE CREDITOS MIVIVIENDA"
        notes = []
        for _, row in raw.iloc[:header_idx].iterrows():
            label = cell_text(row.iloc[0])
            value = cell_text(row.iloc[1])
            if "dataset" in label.lower() and value:
                dataset_name = value

        fields = []
        for _, row in raw.iloc[header_idx + 1 :].iterrows():
            variable = cell_text(row.iloc[0])
            if not variable:
                note = " ".join(
                    cell_text(cell)
                    for cell in row.tolist()
                    if cell_text(cell)
                )
                if note:
                    notes.append(note)
                continue
            if variable.startswith("1/"):
                notes.append(variable)
                continue

            fields.append(
                {
                    "variable": variable,
                    "descripcion": cell_text(row.iloc[1]),
                    "tipo_dato": cell_text(row.iloc[2]),
                    "tamano": cell_text(row.iloc[3]),
                    "recurso": cell_text(row.iloc[4]),
                    "info_adicional": cell_text(row.iloc[5]),
                }
            )

        return {
            "dataset": dataset_name,
            "archivo": DICTIONARY_PATH.name,
            "campos": fields,
            "notas": notes,
            "total_campos": len(fields),
        }

    def get_dashboard(
        self,
        filters: dict[str, str],
        page: int = 1,
        page_size: int = 50,
    ) -> dict:
        self._ensure_aggregates()
        where_sql, params = self._build_where(filters)
        page = max(1, int(page or 1))
        page_size = max(1, min(int(page_size or 50), 100))
        offset = (page - 1) * page_size
        detalle_params = {
            **params,
            "limit": page_size,
            "offset": offset,
        }

        queries = {
            "kpis": f"""
                SELECT
                    COALESCE(SUM(cantidad_creditos), 0) AS cantidad,
                    COALESCE(SUM(monto_total), 0) AS monto_total,
                    COALESCE(
                        SUM(monto_total) / NULLIF(SUM(cantidad_creditos), 0),
                        0
                    ) AS monto_promedio,
                    COALESCE(
                        SUM(suma_tasa) / NULLIF(SUM(cantidad_creditos), 0),
                        0
                    ) AS tasa_promedio
                FROM {AGG_TABLE}
                {where_sql}
            """,
            "mensual": f"""
                SELECT
                    anio,
                    mes_numero,
                    mes_nombre,
                    CONCAT(anio, '-', LPAD(mes_numero, 2, '0')) AS periodo,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY anio, mes_numero, mes_nombre
                ORDER BY anio, mes_numero
            """,
            "anual": f"""
                SELECT
                    anio,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total,
                    ROUND(
                        SUM(monto_total) / NULLIF(SUM(cantidad_creditos), 0),
                        2
                    ) AS monto_promedio,
                    ROUND(
                        SUM(suma_tasa) / NULLIF(SUM(cantidad_creditos), 0),
                        2
                    ) AS tasa_promedio
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY anio
                ORDER BY anio
            """,
            "productos": f"""
                SELECT
                    codigo_producto AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total,
                    ROUND(
                        SUM(monto_total) / NULLIF(SUM(cantidad_creditos), 0),
                        2
                    ) AS monto_promedio
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY codigo_producto
                ORDER BY monto_total DESC
            """,
            "departamentos": f"""
                SELECT
                    departamento AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY departamento
                ORDER BY monto_total DESC
                LIMIT 10
            """,
            "mapa": f"""
                SELECT
                    departamento AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY departamento
                ORDER BY monto_total DESC
            """,
            "instituciones": f"""
                SELECT
                    nombre_ifi AS nombre,
                    tipo_ifi,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY nombre_ifi, tipo_ifi
                ORDER BY monto_total DESC
                LIMIT 10
            """,
            "trimestres": f"""
                SELECT
                    anio,
                    trimestre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY anio, trimestre
                ORDER BY anio, trimestre
            """,
            "plazos": f"""
                SELECT
                    categoria_plazo AS nombre,
                    SUM(cantidad_creditos) AS cantidad,
                    ROUND(SUM(monto_total), 2) AS monto_total,
                    ROUND(
                        SUM(suma_plazo) / NULLIF(SUM(cantidad_creditos), 0),
                        1
                    ) AS plazo_promedio
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY categoria_plazo
                ORDER BY MIN(plazo_min)
            """,
            "tasas": f"""
                SELECT
                    codigo_producto AS producto,
                    tipo_ifi,
                    ROUND(
                        SUM(suma_tasa) / NULLIF(SUM(cantidad_creditos), 0),
                        2
                    ) AS tasa_promedio,
                    SUM(cantidad_creditos) AS cantidad
                FROM {AGG_TABLE}
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
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY
                    CASE
                        WHEN departamento = 'LIMA' THEN 'LIMA'
                        ELSE 'RESTO DEL PAIS'
                    END
                ORDER BY monto_total DESC
            """,
            "detalle_count": f"""
                SELECT COALESCE(SUM(cantidad_creditos), 0) AS total
                FROM {AGG_TABLE}
                {where_sql}
            """,
            "detalle": f"""
                SELECT
                    fecha_desembolso,
                    anio,
                    codigo_producto,
                    departamento,
                    provincia,
                    distrito,
                    nombre_ifi,
                    tipo_ifi,
                    plazo_meses,
                    monto_credito,
                    tasa_interes
                FROM {DETAIL_VIEW}
                {where_sql}
                ORDER BY fecha_desembolso DESC, monto_credito DESC
                LIMIT :limit OFFSET :offset
            """,
        }

        with self.engine.connect() as connection:
            kpis = self._serialize_row(
                connection.execute(text(queries["kpis"]), params).mappings().one()
            )
            mensual = self._fetch_rows(connection, queries["mensual"], params)
            anual = self._fetch_rows(connection, queries["anual"], params)
            productos = self._fetch_rows(connection, queries["productos"], params)
            concentracion = self._fetch_rows(
                connection, queries["concentracion"], params
            )
            detalle_total = int(
                connection.execute(
                    text(queries["detalle_count"]), params
                ).scalar()
                or 0
            )
            total_pages = max(1, (detalle_total + page_size - 1) // page_size)
            if page > total_pages:
                page = total_pages
                offset = (page - 1) * page_size
                detalle_params["offset"] = offset

            response = {
                "kpis": self._enrich_kpis(kpis, mensual, productos, concentracion),
                "mensual": mensual,
                "anual": anual,
                "productos": productos,
                "departamentos": self._fetch_rows(
                    connection, queries["departamentos"], params
                ),
                "mapa": self._fetch_rows(connection, queries["mapa"], params),
                "instituciones": self._fetch_rows(
                    connection, queries["instituciones"], params
                ),
                "trimestres": self._fetch_rows(
                    connection, queries["trimestres"], params
                ),
                "plazos": self._fetch_rows(connection, queries["plazos"], params),
                "tasas": self._fetch_rows(connection, queries["tasas"], params),
                "concentracion": concentracion,
                "detalle": self._fetch_rows(
                    connection, queries["detalle"], detalle_params
                ),
                "detalle_meta": {
                    "page": page,
                    "page_size": page_size,
                    "total": detalle_total,
                    "total_pages": total_pages,
                },
                "filtros_aplicados": {
                    key: value for key, value in filters.items() if value
                },
                "meta": self.get_meta(),
            }

        from web.services.insights_service import build_rule_insights

        yoy = self._build_yoy(filters)
        response["yoy"] = yoy
        response["insights"] = build_rule_insights(
            response["kpis"],
            response["productos"],
            response["concentracion"],
            yoy=yoy,
            filtros=response["filtros_aplicados"],
        )
        return response

    def _snapshot_kpis(self, filters: dict[str, str]) -> dict:
        where_sql, params = self._build_where(filters)
        queries = {
            "kpis": f"""
                SELECT
                    COALESCE(SUM(cantidad_creditos), 0) AS cantidad,
                    COALESCE(SUM(monto_total), 0) AS monto_total,
                    COALESCE(
                        SUM(monto_total) / NULLIF(SUM(cantidad_creditos), 0),
                        0
                    ) AS monto_promedio,
                    COALESCE(
                        SUM(suma_tasa) / NULLIF(SUM(cantidad_creditos), 0),
                        0
                    ) AS tasa_promedio
                FROM {AGG_TABLE}
                {where_sql}
            """,
            "productos": f"""
                SELECT
                    codigo_producto AS nombre,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY codigo_producto
            """,
            "concentracion": f"""
                SELECT
                    CASE
                        WHEN departamento = 'LIMA' THEN 'LIMA'
                        ELSE 'RESTO DEL PAIS'
                    END AS nombre,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY
                    CASE
                        WHEN departamento = 'LIMA' THEN 'LIMA'
                        ELSE 'RESTO DEL PAIS'
                    END
            """,
            "mensual": f"""
                SELECT
                    anio,
                    mes_numero,
                    mes_nombre,
                    CONCAT(anio, '-', LPAD(mes_numero, 2, '0')) AS periodo,
                    ROUND(SUM(monto_total), 2) AS monto_total
                FROM {AGG_TABLE}
                {where_sql}
                GROUP BY anio, mes_numero, mes_nombre
                ORDER BY anio, mes_numero
            """,
        }
        with self.engine.connect() as connection:
            kpis = self._serialize_row(
                connection.execute(text(queries["kpis"]), params).mappings().one()
            )
            productos = self._fetch_rows(connection, queries["productos"], params)
            concentracion = self._fetch_rows(
                connection, queries["concentracion"], params
            )
            mensual = self._fetch_rows(connection, queries["mensual"], params)
        return self._enrich_kpis(kpis, mensual, productos, concentracion)

    def _build_yoy(self, filters: dict[str, str]) -> dict:
        from web.services.insights_service import build_yoy_payload

        meta = self.get_meta()
        anio_min = int(meta.get("anio_min") or 0)
        anio_max = int(meta.get("anio_max") or 0)
        if not anio_min or not anio_max or anio_max <= anio_min:
            return {
                "available": False,
                "motivo": "Se requieren al menos dos anios en el DataMart.",
            }

        if filters.get("anio"):
            try:
                anio_actual = int(filters["anio"])
            except ValueError:
                return {"available": False, "motivo": "Anio de filtro invalido."}
        else:
            anio_actual = anio_max

        if filters.get("anio_comp"):
            try:
                anio_previo = int(filters["anio_comp"])
            except ValueError:
                return {"available": False, "motivo": "Anio de comparacion invalido."}
            modo = "manual"
        else:
            anio_previo = anio_actual - 1
            modo = "auto"

        if anio_previo == anio_actual:
            return {
                "available": False,
                "motivo": "El anio de comparacion debe ser distinto al periodo analizado.",
                "anio_actual": anio_actual,
                "anio_previo": anio_previo,
            }

        if anio_previo < anio_min or anio_previo > anio_max:
            return {
                "available": False,
                "motivo": (
                    f"El anio de comparacion {anio_previo} esta fuera del "
                    f"rango disponible ({anio_min}-{anio_max})."
                ),
                "anio_actual": anio_actual,
            }

        if anio_actual < anio_min or anio_actual > anio_max:
            return {
                "available": False,
                "motivo": f"El periodo {anio_actual} esta fuera del rango disponible.",
            }

        base = {
            key: value
            for key, value in filters.items()
            if key not in {"anio", "anio_comp"} and value
        }
        current = self._snapshot_kpis({**base, "anio": str(anio_actual)})
        previous = self._snapshot_kpis({**base, "anio": str(anio_previo)})
        return {
            "available": True,
            "modo": modo,
            "anio_actual": anio_actual,
            "anio_previo": anio_previo,
            "actual": {
                "cantidad": current.get("cantidad"),
                "monto_total": current.get("monto_total"),
                "monto_promedio": current.get("monto_promedio"),
                "tasa_promedio": current.get("tasa_promedio"),
                "participacion_nmiv_pct": current.get("participacion_nmiv_pct"),
                "concentracion_lima_pct": current.get("concentracion_lima_pct"),
            },
            "previo": {
                "cantidad": previous.get("cantidad"),
                "monto_total": previous.get("monto_total"),
                "monto_promedio": previous.get("monto_promedio"),
                "tasa_promedio": previous.get("tasa_promedio"),
                "participacion_nmiv_pct": previous.get("participacion_nmiv_pct"),
                "concentracion_lima_pct": previous.get("concentracion_lima_pct"),
            },
            "deltas": build_yoy_payload(current, previous),
            "etiqueta": f"{anio_previo} vs {anio_actual}",
        }

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
            enriched["mes_actual"] = (
                mensual[-1].get("periodo")
                or mensual[-1].get("mes_nombre")
            )
            enriched["mes_anterior"] = (
                mensual[-2].get("periodo")
                or mensual[-2].get("mes_nombre")
            )
        else:
            enriched["crecimiento_mensual_pct"] = None
            enriched["mes_actual"] = (
                (mensual[-1].get("periodo") or mensual[-1].get("mes_nombre"))
                if mensual
                else None
            )
            enriched["mes_anterior"] = None

        if mensual:
            best = max(mensual, key=lambda row: row["monto_total"] or 0)
            enriched["mejor_mes"] = best.get("periodo") or best.get("mes_nombre")
            enriched["mejor_mes_monto"] = best["monto_total"]
        else:
            enriched["mejor_mes"] = None
            enriched["mejor_mes_monto"] = 0

        total_monto = enriched.get("monto_total") or 0
        nuevo_monto = sum(
            row["monto_total"] or 0
            for row in productos
            if row["nombre"] in NUEVO_CREDITO_CODES
        )
        lima = next(
            (row for row in concentracion if row["nombre"] == "LIMA"),
            None,
        )

        enriched["participacion_nmiv_pct"] = (
            round((nuevo_monto / total_monto) * 100, 2) if total_monto else 0
        )
        enriched["concentracion_lima_pct"] = (
            round((lima["monto_total"] / total_monto) * 100, 2)
            if lima and total_monto
            else 0
        )
        return enriched

    def build_export(self, filters: dict[str, str], formato: str = "xlsx") -> dict:
        """Prepara datasets para exportar (Excel o CSV)."""
        data = self.get_dashboard(filters, page=1, page_size=1000)
        applied = data.get("filtros_aplicados") or {}
        kpis = data["kpis"]

        resumen_rows = [
            {"indicador": "Cantidad de creditos", "valor": kpis.get("cantidad")},
            {"indicador": "Monto total", "valor": kpis.get("monto_total")},
            {"indicador": "Ticket promedio", "valor": kpis.get("monto_promedio")},
            {"indicador": "Tasa promedio (%)", "valor": kpis.get("tasa_promedio")},
            {
                "indicador": "Crecimiento periodo (%)",
                "valor": kpis.get("crecimiento_mensual_pct"),
            },
            {"indicador": "Mejor periodo", "valor": kpis.get("mejor_mes")},
            {"indicador": "Monto mejor periodo", "valor": kpis.get("mejor_mes_monto")},
            {
                "indicador": "Participacion nuevo credito (%)",
                "valor": kpis.get("participacion_nmiv_pct"),
            },
            {
                "indicador": "Concentracion Lima (%)",
                "valor": kpis.get("concentracion_lima_pct"),
            },
            {
                "indicador": "Filtro anio",
                "valor": applied.get("anio", "Todos"),
            },
            {
                "indicador": "Filtro departamento",
                "valor": applied.get("departamento", "Todos"),
            },
            {
                "indicador": "Filtro producto",
                "valor": applied.get("producto", "Todos"),
            },
            {
                "indicador": "Filtro tipo IFI",
                "valor": applied.get("tipo_ifi", "Todos"),
            },
        ]

        return {
            "formato": formato,
            "resumen": resumen_rows,
            "mensual": data["mensual"],
            "anual": data["anual"],
            "productos": data["productos"],
            "departamentos": data["departamentos"],
            "instituciones": data["instituciones"],
            "trimestres": data["trimestres"],
            "detalle": data["detalle"],
            "detalle_total": data["detalle_meta"]["total"],
            "filtros": applied,
        }

    @staticmethod
    def _build_where(filters: dict[str, str]) -> tuple[str, dict]:
        column_map = {
            "anio": "anio",
            "departamento": "departamento",
            "producto": "codigo_producto",
            "tipo_ifi": "tipo_ifi",
        }
        clauses = []
        params = {}
        for key, column in column_map.items():
            value = filters.get(key)
            if value:
                if key == "anio":
                    clauses.append(f"{column} = :{key}")
                    params[key] = int(value)
                else:
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
