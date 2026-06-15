import argparse

from .conexion import CSV_PATH
from .extract import extract_colocaciones
from .load import (
    load_datamart,
    load_staging,
    record_execution,
    reset_datamart,
)
from .transform import transform


def run(mode: str = "incremental", csv_path: str | None = None) -> None:
    source_path = csv_path or str(CSV_PATH)
    print(f"=== INICIO ETL MIVIVIENDA ({mode.upper()}) ===")

    df_raw = extract_colocaciones(source_path)
    df_clean, metrics = transform(df_raw)

    if mode == "initial":
        reset_datamart()

    load_staging(df_clean, source_path)
    inserted_rows = load_datamart()
    record_execution(mode, source_path, metrics, inserted_rows)
    print("=== ETL FINALIZADO ===")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ETL del Datamart Mivivienda")
    parser.add_argument(
        "--mode",
        choices=("initial", "incremental"),
        default="incremental",
        help="initial reinicia el Datamart; incremental solo inserta registros nuevos",
    )
    parser.add_argument("--csv", help="Ruta alternativa al CSV de origen")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(mode=args.mode, csv_path=args.csv)

