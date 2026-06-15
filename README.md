# Datamart Mivivienda 2024

Implementacion del Avance 2 de Inteligencia de Negocios usando:

- Python y pandas para Extract, Transform y Load.
- MySQL 8 para staging, dimensiones, hechos, indices y restricciones.
- Streamlit y Plotly para la explotacion visual del Datamart.

## Modelo estrella

El grano de `fact_credito` es un credito desembolsado. El modelo contiene:

- `dim_tiempo`
- `dim_geografia`
- `dim_producto`
- `dim_ifi`
- `dim_plazo`
- `fact_credito`

Como el CSV no incluye un identificador de transaccion, el ETL crea
`record_hash` con los 14 campos normalizados. Esta clave permite eliminar
duplicados exactos y evitar que una carga incremental inserte dos veces la
misma fila.

## Calidad detectada en el archivo entregado

- Filas leidas: 13,507
- Filas completamente vacias: 4,160
- Filas no vacias: 9,347
- Duplicados exactos sobrantes: 11
- Filas esperadas tras limpieza y deduplicacion: 9,336

## Preparacion

1. Crear un entorno virtual e instalar dependencias:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Copiar `.env.example` como `.env` y configurar MySQL.

3. Ejecutar en MySQL, en este orden:

```text
sql/00_crear_base.sql
sql/01_staging.sql
sql/02_datamart.sql
```

## ETL

Carga inicial, reiniciando dimensiones y hechos:

```powershell
python -m etl.main --mode initial
```

Carga incremental, sin repetir registros existentes:

```powershell
python -m etl.main --mode incremental
```

Para demostrar la carga incremental, ejecutar el segundo comando dos veces.
En la segunda ejecucion, `filas_insertadas` debe ser cero.

## Pruebas

Pruebas unitarias de transformacion:

```powershell
python -m unittest discover -s tests -v
```

Pruebas SQL de integridad, conciliacion y calidad:

```text
sql/03_validaciones.sql
```

Consultas de verificacion de KPIs:

```text
sql/04_consultas_kpi.sql
```

## Dashboard

```powershell
streamlit run dashboard/app.py
```

El dashboard consume la vista `vw_creditos_analitica` e incluye filtros por
departamento, producto y tipo de IFI.

## Evidencias sugeridas

1. Tablas y relaciones del esquema en MySQL Workbench.
2. Consola de la carga inicial.
3. Consola de una carga incremental con cero filas nuevas.
4. Contenido de `etl_ejecucion`.
5. Resultado de las consultas de `03_validaciones.sql`.
6. Resultado de los KPIs de `04_consultas_kpi.sql`.
7. Capturas del dashboard con sus filtros y graficos.

