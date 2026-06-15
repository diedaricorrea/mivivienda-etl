import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_NAME = os.getenv("DB_NAME", "dm_mivivienda")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

_csv_path = Path(os.getenv("CSV_PATH", "./datos/colocaciones_2024.csv"))
CSV_PATH = _csv_path if _csv_path.is_absolute() else PROJECT_ROOT / _csv_path

DATABASE_URL = URL.create(
    drivername="mysql+pymysql",
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=DB_PORT,
    database=DB_NAME,
    query={"charset": "utf8mb4"},
)


def get_engine():
    return create_engine(DATABASE_URL, pool_pre_ping=True)

