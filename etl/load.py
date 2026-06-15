from pathlib import Path

import pandas as pd
from sqlalchemy import text

from .conexion import get_engine


STAGING_TABLE = "stg_colocaciones_mivivienda"


def reset_datamart() -> None:
    statements = [
        "SET FOREIGN_KEY_CHECKS = 0",
        "TRUNCATE TABLE fact_credito",
        "TRUNCATE TABLE dim_tiempo",
        "TRUNCATE TABLE dim_geografia",
        "TRUNCATE TABLE dim_producto",
        "TRUNCATE TABLE dim_ifi",
        "TRUNCATE TABLE dim_plazo",
        "SET FOREIGN_KEY_CHECKS = 1",
    ]
    with get_engine().begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
    print("[LOAD] Datamart reiniciado para carga inicial")


def load_staging(df: pd.DataFrame, source_path: str | Path) -> None:
    staging = df.copy()
    staging["fuente_archivo"] = Path(source_path).name

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {STAGING_TABLE}"))
        staging.to_sql(
            STAGING_TABLE,
            conn,
            if_exists="append",
            index=False,
            chunksize=1000,
            method="multi",
        )
    print(f"[LOAD] Staging cargado: {len(staging):,} filas")


def _dimension_statements() -> list[str]:
    return [
        """
        INSERT IGNORE INTO dim_tiempo (
            fecha_desembolso, anio, semestre, trimestre,
            mes_numero, mes_nombre, dia
        )
        SELECT DISTINCT
            fecha_desembolso,
            YEAR(fecha_desembolso),
            IF(MONTH(fecha_desembolso) <= 6, 1, 2),
            QUARTER(fecha_desembolso),
            MONTH(fecha_desembolso),
            ELT(
                MONTH(fecha_desembolso),
                'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
                'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE',
                'DICIEMBRE'
            ),
            DAY(fecha_desembolso)
        FROM stg_colocaciones_mivivienda
        """,
        """
        INSERT IGNORE INTO dim_geografia (
            ubigeo, departamento, provincia, distrito
        )
        SELECT DISTINCT ubigeo, departamento, provincia, distrito
        FROM stg_colocaciones_mivivienda
        """,
        """
        INSERT IGNORE INTO dim_producto (
            codigo_producto, nombre_producto, descripcion
        )
        SELECT DISTINCT
            producto,
            CASE producto
                WHEN 'NMIV' THEN 'NUEVO CREDITO MIVIVIENDA'
                WHEN 'FCTP' THEN 'FINANCIAMIENTO COMPLEMENTARIO TECHO PROPIO'
                ELSE CONCAT('PRODUCTO ', producto)
            END,
            CONCAT('CODIGO DE PRODUCTO PUBLICADO POR FONDO MIVIVIENDA: ', producto)
        FROM stg_colocaciones_mivivienda
        """,
        """
        INSERT IGNORE INTO dim_ifi (nombre_ifi, tipo_ifi)
        SELECT DISTINCT ifi, tipo_ifi
        FROM stg_colocaciones_mivivienda
        """,
        """
        INSERT IGNORE INTO dim_plazo (
            plazo_meses, plazo_anios, rango_plazo, categoria_plazo
        )
        SELECT DISTINCT
            plazo_meses,
            ROUND(plazo_meses / 12, 2),
            CASE
                WHEN plazo_meses <= 60 THEN 'HASTA 60 MESES'
                WHEN plazo_meses <= 180 THEN '61 A 180 MESES'
                ELSE 'MAS DE 180 MESES'
            END,
            CASE
                WHEN plazo_meses <= 60 THEN 'CORTO'
                WHEN plazo_meses <= 180 THEN 'MEDIANO'
                ELSE 'LARGO'
            END
        FROM stg_colocaciones_mivivienda
        """,
    ]


def load_datamart() -> int:
    fact_insert = """
        INSERT IGNORE INTO fact_credito (
            record_hash,
            id_tiempo,
            id_geografia,
            id_producto,
            id_ifi,
            id_plazo,
            monto_credito,
            monto_cuota_inicial,
            monto_valor_vivienda,
            tasa_interes,
            cantidad_creditos,
            fecha_corte
        )
        SELECT
            s.record_hash,
            t.id_tiempo,
            g.id_geografia,
            p.id_producto,
            i.id_ifi,
            pl.id_plazo,
            s.monto_credito,
            s.monto_cuota_inicial,
            s.monto_valor_vivienda,
            s.tasa,
            1,
            s.fecha_corte
        FROM stg_colocaciones_mivivienda s
        JOIN dim_tiempo t
          ON t.fecha_desembolso = s.fecha_desembolso
        JOIN dim_geografia g
          ON g.ubigeo = s.ubigeo
        JOIN dim_producto p
          ON p.codigo_producto = s.producto
        JOIN dim_ifi i
          ON i.nombre_ifi = s.ifi AND i.tipo_ifi = s.tipo_ifi
        JOIN dim_plazo pl
          ON pl.plazo_meses = s.plazo_meses
    """

    with get_engine().begin() as conn:
        for statement in _dimension_statements():
            conn.execute(text(statement))
        before = conn.execute(text("SELECT COUNT(*) FROM fact_credito")).scalar_one()
        conn.execute(text(fact_insert))
        after = conn.execute(text("SELECT COUNT(*) FROM fact_credito")).scalar_one()

    inserted = after - before
    print(f"[LOAD] Hechos nuevos insertados: {inserted:,}")
    print(f"[LOAD] Total en fact_credito: {after:,}")
    return inserted


def record_execution(
    mode: str,
    source_path: str | Path,
    metrics: dict[str, int],
    inserted_rows: int,
    status: str = "OK",
    detail: str | None = None,
) -> None:
    statement = text(
        """
        INSERT INTO etl_ejecucion (
            modo_carga, archivo_origen, filas_origen, filas_vacias,
            filas_invalidas, duplicados_eliminados, filas_transformadas,
            filas_insertadas, estado, detalle
        ) VALUES (
            :modo_carga, :archivo_origen, :filas_origen, :filas_vacias,
            :filas_invalidas, :duplicados_eliminados, :filas_transformadas,
            :filas_insertadas, :estado, :detalle
        )
        """
    )
    params = {
        "modo_carga": mode,
        "archivo_origen": Path(source_path).name,
        **metrics,
        "filas_insertadas": inserted_rows,
        "estado": status,
        "detalle": detail,
    }
    with get_engine().begin() as conn:
        conn.execute(statement, params)

