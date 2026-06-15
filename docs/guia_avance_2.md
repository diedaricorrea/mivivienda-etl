# Guia del Avance 2

## Que pide realmente el avance

El trabajo debe demostrar que el modelo conceptual del Avance 1 ya existe
fisicamente y funciona. El dashboard es una evidencia adicional, pero no
reemplaza la base de datos, el ETL ni las pruebas.

## Correspondencia entre requisitos y proyecto

| Requisito | Evidencia en el proyecto |
|---|---|
| Creacion de tablas | `sql/01_staging.sql` y `sql/02_datamart.sql` |
| Relaciones | Cinco claves foraneas en `fact_credito` |
| Indices | Indices de staging, hechos y claves unicas |
| Restricciones | PK, FK, UNIQUE, NOT NULL y CHECK |
| Extraccion | `etl/extract.py` lee el CSV separado por punto y coma |
| Limpieza | Eliminacion de filas vacias y normalizacion de textos |
| Conversion | Fechas `aaaammdd`, importes, tasas, plazo y ubigeo |
| Duplicados | `drop_duplicates` y clave tecnica `record_hash` |
| Integracion | Carga de cinco dimensiones y una tabla de hechos |
| Carga inicial | `python -m etl.main --mode initial` |
| Carga incremental | `python -m etl.main --mode incremental` |
| Integridad y calidad | `sql/03_validaciones.sql` |
| Verificacion de KPIs | `sql/04_consultas_kpi.sql` y dashboard |

## Arquitectura

```text
CSV origen
   |
   v
Python: extract.py
   |
   v
Python: transform.py
   |
   v
MySQL: stg_colocaciones_mivivienda
   |
   v
MySQL: dimensiones + fact_credito
   |
   +--> Consultas SQL de validacion
   |
   +--> Streamlit / Plotly
```

## Resultados esperados de la primera carga

El archivo contiene 13,507 filas fisicas. El ETL debe reportar:

- 4,160 filas vacias eliminadas.
- 11 duplicados exactos eliminados.
- 9,336 filas transformadas y cargadas.
- Cero claves foraneas nulas.
- Cero hechos huerfanos.

La segunda ejecucion incremental sobre el mismo archivo debe insertar cero
filas nuevas.

## Orden recomendado para la demostracion

1. Mostrar el diagrama estrella en MySQL Workbench.
2. Ejecutar la carga inicial y mostrar el resumen de consola.
3. Consultar `etl_ejecucion`.
4. Ejecutar nuevamente en modo incremental.
5. Ejecutar las consultas de validacion.
6. Comparar conteos y KPIs con el CSV.
7. Abrir el dashboard y aplicar filtros.

## Nota sobre MySQL y Python

La combinacion es tecnicamente adecuada para el avance: Python implementa el
proceso ETL y MySQL implementa fisicamente el Datamart. La lista de herramientas
del enunciado parece referencial, pero como MySQL no aparece escrita de forma
explicita, conviene confirmar con el docente que acepta una herramienta
equivalente. El Avance 1 ya declara MySQL, por lo que mantenerlo conserva la
coherencia del proyecto.

