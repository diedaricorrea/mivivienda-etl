# Guion de exposicion - Avance 2

## 1. Introduccion

> En el Avance 1 definimos el problema de negocio y un modelo estrella para
> analizar las colocaciones de creditos Mivivienda 2024. En este segundo
> avance implementamos fisicamente el Datamart en MySQL, desarrollamos el ETL
> con Python y construimos un dashboard con Streamlit.

## 2. Arquitectura

Mostrar las carpetas `datos`, `etl`, `sql` y `dashboard`.

> La fuente es un CSV de una sola tabla. Python realiza la extraccion,
> limpieza y transformacion. Los datos limpios pasan a staging y luego se
> integran en cinco dimensiones y una tabla de hechos en MySQL. Finalmente,
> el dashboard consulta una vista analitica del Datamart.

## 3. Modelo fisico

Mostrar el diagrama de MySQL Workbench.

- `dim_tiempo`: fechas y jerarquia temporal.
- `dim_geografia`: ubigeo, departamento, provincia y distrito.
- `dim_producto`: codigo y nombre del producto.
- `dim_ifi`: institucion financiera y tipo.
- `dim_plazo`: meses, rangos y categorias.
- `fact_credito`: montos, tasa, cantidad y claves foraneas.

> El grano de la tabla de hechos es un credito desembolsado.

Destacar las claves primarias, foraneas, restricciones `NOT NULL`, `UNIQUE`,
`CHECK` e indices.

## 4. Proceso ETL

Ejecutar:

```powershell
.\.venv\Scripts\python.exe -m etl.main --mode initial
```

Explicar el resultado:

- 13,507 filas leidas.
- 4,160 filas completamente vacias eliminadas.
- 11 duplicados exactos eliminados.
- 9,336 filas validas cargadas.

> Como el archivo no contiene un identificador unico de credito, generamos un
> hash SHA-256 con los 14 campos normalizados. Esta clave permite controlar
> duplicados y cargas incrementales.

## 5. Explicacion del codigo Python

### 5.1 `etl/conexion.py`

> Este archivo centraliza la configuracion de acceso a MySQL y la ruta del
> archivo CSV. Lee las variables de entorno desde `.env`, por lo que las
> credenciales no se escriben directamente en el codigo.

Elementos importantes:

- `PROJECT_ROOT` identifica la carpeta principal del proyecto.
- `load_dotenv()` carga la configuracion de `.env`.
- `CSV_PATH` resuelve la ruta del archivo de origen.
- `DATABASE_URL` construye la conexion `mysql+pymysql`.
- `get_engine()` devuelve la conexion al Datamart.
- `get_server_engine()` permite conectarse al servidor antes de crear la base.

Fragmento que se puede mostrar:

```python
DATABASE_URL = URL.create(
    drivername="mysql+pymysql",
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=DB_PORT,
    database=DB_NAME,
)
```

> Usamos SQLAlchemy para que los demas modulos compartan una sola forma de
> conectarse y no repitan credenciales ni configuraciones.

### 5.2 `etl/setup_database.py`

> Este modulo automatiza la implementacion fisica. Primero crea la base
> indicada en `.env` y luego ejecuta los scripts de staging y del modelo
> estrella.

Elementos importantes:

- Valida que el nombre de la base sea seguro.
- Lee `01_staging.sql` y `02_datamart.sql`.
- Ejecuta las sentencias SQL en el orden correcto.
- Puede ejecutarse varias veces porque utiliza `IF NOT EXISTS`.

Comando:

```powershell
.\.venv\Scripts\python.exe -m etl.setup_database
```

> Este archivo demuestra la creacion automatizada de tablas, relaciones,
> indices, restricciones y vistas.

### 5.3 `etl/extract.py`

> Corresponde a la fase Extract. Lee el CSV separado por punto y coma y
> conserva inicialmente las columnas como texto para evitar conversiones
> incorrectas, especialmente en fechas y ubigeo.

Elementos importantes:

- `EXPECTED_COLUMNS` define las 14 columnas esperadas.
- Comprueba que no falten ni sobren columnas.
- Usa `encoding="utf-8-sig"` para manejar correctamente el archivo.
- Informa la cantidad total de filas leidas.

Fragmento que se puede mostrar:

```python
df = pd.read_csv(
    path,
    sep=";",
    dtype="string",
    skip_blank_lines=False,
)
```

> `skip_blank_lines=False` es importante porque permite contar y demostrar
> que el archivo contenia 4,160 filas vacias.

### 5.4 `etl/transform.py`

> Corresponde a la fase Transform y concentra las reglas de calidad. Elimina
> filas vacias, normaliza textos, convierte tipos, valida reglas de negocio,
> elimina duplicados y crea la clave tecnica del registro.

Transformaciones realizadas:

- Reemplazo de textos vacios por valores nulos.
- Eliminacion de filas completamente vacias.
- Aplicacion de `TRIM`, espacios uniformes y mayusculas.
- Conversion de fechas `aaaammdd` a tipo fecha.
- Conservacion del ubigeo como texto de seis digitos.
- Conversion de montos, tasa y plazo a tipos numericos.
- Validacion de montos, tasas y plazos mayores que cero.
- Eliminacion de duplicados exactos.
- Generacion de `record_hash` mediante SHA-256.

Fragmento que se puede mostrar:

```python
data["record_hash"] = data.apply(_build_record_hash, axis=1)
```

> El hash funciona como clave tecnica porque la fuente no incluye un
> identificador unico del credito. Dos filas iguales producen el mismo hash,
> lo que evita duplicados en la carga incremental.

Resultado obtenido:

```text
Vacias: 4,160
Invalidas: 0
Duplicadas: 11
Finales: 9,336
```

### 5.5 `etl/load.py`

> Corresponde a la fase Load. Carga primero staging, luego las dimensiones y
> finalmente la tabla de hechos respetando las relaciones del modelo estrella.

Funciones principales:

- `reset_datamart()` limpia dimensiones y hechos para una carga inicial.
- `load_staging()` carga las 9,336 filas transformadas.
- `_dimension_statements()` prepara las cinco dimensiones.
- `load_datamart()` relaciona staging con las dimensiones e inserta los hechos.
- `record_execution()` registra las metricas de cada ejecucion.

Orden de carga:

```text
staging
  -> dim_tiempo
  -> dim_geografia
  -> dim_producto
  -> dim_ifi
  -> dim_plazo
  -> fact_credito
```

Fragmento que se puede mostrar:

```sql
INSERT IGNORE INTO fact_credito (...)
SELECT ...
FROM stg_colocaciones_mivivienda s
JOIN dim_tiempo t ...
JOIN dim_geografia g ...
JOIN dim_producto p ...
JOIN dim_ifi i ...
JOIN dim_plazo pl ...
```

> `INSERT IGNORE` junto con la restriccion unica de `record_hash` permite que
> una carga incremental no vuelva a insertar datos ya existentes.

### 5.6 `etl/main.py`

> Es el orquestador del ETL. No contiene reglas de limpieza ni SQL complejo;
> su responsabilidad es ejecutar Extract, Transform y Load en el orden
> correcto.

Flujo principal:

```python
df_raw = extract_colocaciones(source_path)
df_clean, metrics = transform(df_raw)
load_staging(df_clean, source_path)
inserted_rows = load_datamart()
record_execution(mode, source_path, metrics, inserted_rows)
```

Modos disponibles:

- `initial`: reinicia dimensiones y hechos antes de cargar.
- `incremental`: conserva lo existente e inserta solo registros nuevos.

> La separacion por modulos facilita las pruebas, el mantenimiento y la
> identificacion de cada etapa ETL.

### 5.7 `dashboard/app.py`

> Este archivo implementa la capa de visualizacion. Streamlit consulta la
> vista `vw_creditos_analitica`, calcula los indicadores y construye los
> graficos interactivos con Plotly.

Elementos importantes:

- `load_data()` consulta la vista analitica de MySQL.
- `st.cache_data()` evita consultar la base en cada interaccion.
- La barra lateral contiene filtros de departamento, producto y tipo de IFI.
- Las tarjetas muestran cantidad, monto total, promedio y tasa promedio.
- Los graficos presentan evolucion mensual, producto, departamento e IFI.

Fragmento que se puede mostrar:

```python
@st.cache_data(ttl=300)
def load_data() -> pd.DataFrame:
    return pd.read_sql(
        "SELECT * FROM vw_creditos_analitica",
        get_engine(),
    )
```

> El dashboard no consulta directamente el CSV. Consume el Datamart ya
> transformado, lo cual demuestra que la visualizacion es la ultima capa del
> flujo de Inteligencia de Negocios.

### 5.8 `tests/test_transform.py`

> Este archivo contiene pruebas unitarias para comprobar las reglas de
> transformacion antes de ejecutar una carga real.

Pruebas implementadas:

- Una fila vacia debe eliminarse.
- Un duplicado exacto debe eliminarse.
- Los textos deben quedar normalizados.
- El hash debe tener 64 caracteres.
- Un monto negativo debe considerarse invalido.

Comando:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

> Las pruebas separan la validacion del codigo de la validacion de los datos
> almacenados en MySQL.

### 5.9 Resumen del flujo entre archivos

```text
setup_database.py
        |
        v
conexion.py <------------------------------+
        |                                  |
        v                                  |
extract.py -> transform.py -> load.py      |
        ^                   ^              |
        |                   |              |
        +------ main.py ----+              |
                                           |
MySQL -> vw_creditos_analitica -> dashboard/app.py

tests/test_transform.py -> verifica transform.py
```

Frase de cierre de la explicacion tecnica:

> El codigo aplica separacion de responsabilidades. Cada archivo se concentra
> en una etapa concreta, mientras `main.py` coordina todo el proceso. Esto
> hace que el ETL sea repetible, comprobable y facil de mantener.

## 6. Carga incremental

Ejecutar:

```powershell
.\.venv\Scripts\python.exe -m etl.main --mode incremental
```

Mostrar que se insertan cero filas:

> La segunda ejecucion procesa el archivo, pero no duplica registros porque
> los hashes ya existen en la tabla de hechos.

## 7. Pruebas y validaciones

Ejecutar `sql/03_validaciones.sql` en MySQL Workbench.

Resultados esperados:

| Validacion | Resultado |
|---|---:|
| Filas staging | 9,336 |
| Filas tabla de hechos | 9,336 |
| Hashes unicos | 9,336 |
| Claves foraneas nulas | 0 |
| Montos invalidos | 0 |
| Hechos huerfanos | 0 |
| Segunda carga incremental | 0 filas nuevas |

## 8. Resultados de negocio

Presentar los KPIs generales:

- Cantidad de creditos: 9,336.
- Monto total colocado: S/ 1,695,883,888.67.
- Monto promedio: S/ 181,649.95.
- Tasa promedio: 10.03%.
- Tasa minima y maxima: 5.99% y 23.89%.
- Plazo minimo y maximo: 14 y 300 meses.

Hallazgos para comentar:

- Septiembre tuvo el mayor monto mensual: S/ 227,511,659.94.
- NMIV concentro 8,565 creditos.
- Lima concentro 5,789 creditos.
- Credito lidero el ranking de IFI con S/ 691,272,883.09.

## 9. Dashboard

Abrir:

```text
http://localhost:8501
```

Demostrar:

1. Tarjetas de cantidad, monto total, monto promedio y tasa promedio.
2. Evolucion mensual.
3. Participacion por producto.
4. Ranking de departamentos e IFI.
5. Filtros por departamento, producto y tipo de IFI.

Aplicar al menos un filtro para demostrar que todos los indicadores y graficos
se actualizan.

## 10. Cierre

> El avance demuestra la implementacion completa del flujo de Inteligencia de
> Negocios: extraccion desde la fuente, limpieza y transformacion, carga
> inicial e incremental, modelo dimensional, validaciones de calidad y
> explotacion mediante dashboard. El Datamart ya permite responder las
> preguntas de negocio definidas en el Avance 1.

## Capturas recomendadas

1. Estructura de carpetas del proyecto.
2. Diagrama del modelo estrella en MySQL Workbench.
3. Tablas creadas y cantidad de registros.
4. Consola de carga inicial.
5. Consola de carga incremental con cero inserciones.
6. Consultas de integridad y calidad.
7. Consultas de KPIs.
8. Dashboard completo.
9. Dashboard con un filtro aplicado.
