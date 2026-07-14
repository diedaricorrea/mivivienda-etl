import argparse
from pathlib import Path

from .extract import discover_csv_files, extract_colocaciones
from .load import (
    ensure_performance_indexes,
    load_datamart,
    load_staging,
    record_execution,
    refresh_aggregates,
    reset_datamart,
)
from .transform import transform


def run_one(
    mode: str,
    csv_path: str | Path,
    reset: bool = False,
    refresh_agg: bool = True,
) -> None:
    source_path = str(csv_path)
    print(f"=== INICIO ETL MIVIVIENDA ({mode.upper()}) ===")
    print(f"=== Archivo: {Path(source_path).name} ===")

    df_raw = extract_colocaciones(source_path)
    df_clean, metrics = transform(df_raw)

    if reset:
        reset_datamart()

    load_staging(df_clean, source_path)
    inserted_rows = load_datamart()
    record_execution(mode, source_path, metrics, inserted_rows)

    if refresh_agg:
        ensure_performance_indexes()
        refresh_aggregates()

    print("=== ETL FINALIZADO ===\n")


def run_many(mode: str, files: list[Path]) -> None:
    print(f"[ETL] Carga multi-archivo: {len(files)} CSV en datos/")
    for index, path in enumerate(files):
        file_mode = mode if index == 0 else "incremental"
        run_one(
            mode=file_mode,
            csv_path=path,
            reset=(mode == "initial" and index == 0),
            refresh_agg=False,
        )
    ensure_performance_indexes()
    refresh_aggregates()


def run(
    mode: str = "incremental",
    csv_path: str | None = None,
) -> None:
    """Sin --csv carga todos los archivos de datos/. Con --csv, solo ese archivo."""
    if csv_path:
        run_one(mode=mode, csv_path=csv_path, reset=(mode == "initial"))
        return

    files = discover_csv_files()
    run_many(mode=mode, files=files)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ETL del Datamart Mivivienda")
    parser.add_argument(
        "--mode",
        choices=("initial", "incremental"),
        default="incremental",
        help="initial reinicia el Datamart; incremental solo inserta registros nuevos",
    )
    parser.add_argument(
        "--csv",
        help="Ruta a un CSV concreto. Si se omite, carga todos los CSV de datos/",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(mode=args.mode, csv_path=args.csv)
