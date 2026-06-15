import re
from pathlib import Path

from sqlalchemy import text

from .conexion import DB_NAME, get_engine, get_server_engine


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SQL_FILES = [
    PROJECT_ROOT / "sql" / "01_staging.sql",
    PROJECT_ROOT / "sql" / "02_datamart.sql",
]


def _validate_database_name(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise ValueError(
            "DB_NAME solo puede contener letras, numeros y guion bajo."
        )
    return name


def _read_statements(path: Path) -> list[str]:
    sql = path.read_text(encoding="utf-8")
    statements = []
    for fragment in sql.split(";"):
        lines = [
            line for line in fragment.splitlines()
            if not line.strip().startswith("--")
        ]
        statement = "\n".join(lines).strip()
        if statement:
            statements.append(statement)
    return statements


def setup_database() -> None:
    database = _validate_database_name(DB_NAME)
    with get_server_engine().begin() as conn:
        conn.execute(
            text(
                f"CREATE DATABASE IF NOT EXISTS `{database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
            )
        )
    print(f"[SETUP] Base disponible: {database}")

    with get_engine().begin() as conn:
        for sql_file in SQL_FILES:
            for statement in _read_statements(sql_file):
                conn.exec_driver_sql(statement)
            print(f"[SETUP] Ejecutado: {sql_file.name}")

    print("[SETUP] Estructura del Datamart lista")


if __name__ == "__main__":
    setup_database()

