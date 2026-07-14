from pathlib import Path

import pandas as pd

from config.conexion import CSV_PATH, PROJECT_ROOT


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


def detect_separator(path: Path) -> str:
    """Detecta ';' (2023-2024) o ',' (2018-2022) segun la cabecera."""
    sample = path.read_text(encoding="utf-8-sig", errors="replace")[:8192]
    first_line = sample.splitlines()[0] if sample else ""
    if first_line.count(";") >= first_line.count(","):
        return ";"
    return ","


def discover_csv_files(directory: str | Path | None = None) -> list[Path]:
    root = Path(directory) if directory else PROJECT_ROOT / "datos"
    files = sorted(
        (
            path
            for path in root.glob("*.csv")
            if path.is_file() and not path.name.startswith("~")
        ),
        key=lambda path: path.name.lower(),
    )
    if not files:
        raise FileNotFoundError(f"No se encontraron CSV en: {root}")
    return files


def extract_colocaciones(csv_path: str | Path | None = None) -> pd.DataFrame:
    path = Path(csv_path) if csv_path else CSV_PATH
    if not path.exists():
        raise FileNotFoundError(f"No se encontro el CSV origen: {path}")

    separator = detect_separator(path)
    df = pd.read_csv(
        path,
        sep=separator,
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

    print(f"[EXTRACT] Archivo: {path.name} (sep={separator!r})")
    print(f"[EXTRACT] Filas leidas: {len(df):,}")
    return df[EXPECTED_COLUMNS]
