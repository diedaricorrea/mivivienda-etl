import hashlib

import pandas as pd


TEXT_COLUMNS = [
    "PRODUCTO",
    "DEPARTAMENTO",
    "PROVINCIA",
    "DISTRITO",
    "UBIGEO",
    "IFI",
    "TIPO_IFI",
]
NUMERIC_COLUMNS = [
    "MONTO_CREDITO",
    "MONTO_CUOTA_INICIAL",
    "PLAZOS",
    "TASA",
    "MONTO_VALOR_VIVIENDA",
]
HASH_COLUMNS = [
    "fecha_desembolso",
    "producto",
    "departamento",
    "provincia",
    "distrito",
    "ubigeo",
    "ifi",
    "tipo_ifi",
    "monto_credito",
    "monto_cuota_inicial",
    "plazo_meses",
    "tasa",
    "monto_valor_vivienda",
    "fecha_corte",
]


def _normalize_text(series: pd.Series) -> pd.Series:
    return (
        series.astype("string")
        .str.strip()
        .str.replace(r"\s+", " ", regex=True)
        .str.upper()
    )


def _build_record_hash(row: pd.Series) -> str:
    values = []
    for column in HASH_COLUMNS:
        value = row[column]
        if pd.isna(value):
            values.append("")
        elif isinstance(value, pd.Timestamp):
            values.append(value.strftime("%Y-%m-%d"))
        else:
            values.append(str(value))
    return hashlib.sha256("|".join(values).encode("utf-8")).hexdigest()


def transform(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    data = df.copy()
    source_rows = len(data)

    data = data.replace(r"^\s*$", pd.NA, regex=True)
    empty_rows = int(data.isna().all(axis=1).sum())
    data = data.dropna(how="all").copy()

    for column in TEXT_COLUMNS:
        data[column] = _normalize_text(data[column])

    data["UBIGEO"] = data["UBIGEO"].str.replace(r"\.0$", "", regex=True).str.zfill(6)
    data["FECHA_DESEMBOLSO"] = pd.to_datetime(
        data["FECHA_DESEMBOLSO"].str.replace(r"\.0$", "", regex=True),
        format="%Y%m%d",
        errors="coerce",
    )
    data["FECHA_CORTE"] = pd.to_datetime(
        data["FECHA_CORTE"].str.replace(r"\.0$", "", regex=True),
        format="%Y%m%d",
        errors="coerce",
    )

    for column in NUMERIC_COLUMNS:
        data[column] = pd.to_numeric(data[column], errors="coerce")
    data["PLAZOS"] = data["PLAZOS"].astype("Int64")

    required = [
        "FECHA_DESEMBOLSO",
        "PRODUCTO",
        "DEPARTAMENTO",
        "PROVINCIA",
        "DISTRITO",
        "UBIGEO",
        "IFI",
        "TIPO_IFI",
        "MONTO_CREDITO",
        "PLAZOS",
        "TASA",
        "MONTO_VALOR_VIVIENDA",
        "FECHA_CORTE",
    ]
    valid_mask = data[required].notna().all(axis=1)
    valid_mask &= data["UBIGEO"].str.fullmatch(r"\d{6}", na=False)
    valid_mask &= data["FECHA_DESEMBOLSO"].dt.year.eq(2024)
    valid_mask &= data["MONTO_CREDITO"].gt(0)
    valid_mask &= data["MONTO_CUOTA_INICIAL"].fillna(0).ge(0)
    valid_mask &= data["MONTO_VALOR_VIVIENDA"].gt(0)
    valid_mask &= data["PLAZOS"].gt(0)
    valid_mask &= data["TASA"].gt(0)

    invalid_rows = int((~valid_mask).sum())
    data = data.loc[valid_mask].copy()

    duplicate_rows = int(data.duplicated().sum())
    data = data.drop_duplicates().copy()
    data.columns = data.columns.str.lower()
    data = data.rename(columns={"plazos": "plazo_meses"})
    data["record_hash"] = data.apply(_build_record_hash, axis=1)

    metrics = {
        "filas_origen": source_rows,
        "filas_vacias": empty_rows,
        "filas_invalidas": invalid_rows,
        "duplicados_eliminados": duplicate_rows,
        "filas_transformadas": len(data),
    }
    print(
        "[TRANSFORM] "
        f"Vacias: {empty_rows:,} | Invalidas: {invalid_rows:,} | "
        f"Duplicadas: {duplicate_rows:,} | Finales: {len(data):,}"
    )
    return data, metrics

