-- Sustituir <DB_NAME> por el nombre configurado en .env.
-- Normalmente no es necesario ejecutar este archivo:
-- `python -m etl.setup_database` crea la base automaticamente.
CREATE DATABASE IF NOT EXISTS <DB_NAME>
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;
