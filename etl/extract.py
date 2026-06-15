from pathlib import Path

import pandas as pd # Mira para q entiendas, pandas = libreria de python para traabajar con datos en forma de tablas.

from .conexion import CSV_PATH


EXPECTED_COLUMNS = [
    "FECHA_DESEMBOLSO",
    "PRODUCTO",
    "DEPARTAMENTO",
    "PROVINCIA",
    "DISTRITO",
    "UBIGEO",
    "IFI",
    "TIPO_IFI",
    "MONTO_CREDITO",
    "MONTO_CUOTA_INICIAL",
    "PLAZOS",
    "TASA",
    "MONTO_VALOR_VIVIENDA",
    "FECHA_CORTE",
]

# Mano esto es para que lea el csv y valide que tenga las columnas esperadas y devolverlo como un dataFrame de pandas
def extract_colocaciones(csv_path: str | Path | None = None) -> pd.DataFrame:
    path = Path(csv_path) if csv_path else CSV_PATH
    if not path.exists():
        raise FileNotFoundError(f"No se encontro el CSV origen: {path}")

    df = pd.read_csv(
        path,
        sep=";",
        dtype="string",
        encoding="utf-8-sig",
        keep_default_na=True,
        skip_blank_lines=False,
    )
    df.columns = df.columns.str.strip().str.upper()

    missing = sorted(set(EXPECTED_COLUMNS) - set(df.columns))
    extra = sorted(set(df.columns) - set(EXPECTED_COLUMNS))
    if missing or extra:
        raise ValueError(
            "El esquema del CSV no coincide. "
            f"Faltantes: {missing or 'ninguna'}; extras: {extra or 'ninguna'}"
        )

    print(f"[EXTRACT] Archivo: {path.name}")
    print(f"[EXTRACT] Filas leidas: {len(df):,}")
    return df[EXPECTED_COLUMNS]

