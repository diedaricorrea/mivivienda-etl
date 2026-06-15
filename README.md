# Datamart Mivivienda 2024

Implementacion del Avance 2 de Inteligencia de Negocios usando:

- Python y pandas para Extract, Transform y Load.
- MySQL 8 para staging, dimensiones, hechos, indices y restricciones.
- Flask para el backend web y las APIs REST.
- HTML, CSS, JavaScript y Chart.js para el dashboard.

## Arquitectura del proyecto

```text
CSV de origen
    |
    v
etl/extract.py -> etl/transform.py -> etl/load.py
    |                                      |
    +------------ etl/main.py -------------+
                                           |
                                           v
                                  MySQL / DataMart
                                           |
                                           v
                              DashboardService (SQL)
                                           |
                                           v
                                Flask API / web/app.py
                                  /                \
                                 v                  v
                         Respuestas JSON       index.html
                                                   |
                                                   v
                                      dashboard.js + styles.css
```

### Equivalencia con Spring Boot

Flask no obliga a utilizar una estructura determinada. En este proyecto se
organizo de una forma similar a una aplicacion Spring Boot:

| Spring Boot | Proyecto Python | Responsabilidad |
|---|---|---|
| `Controller` | `web/app.py` | Define las rutas HTTP y devuelve HTML o JSON. |
| `Service` | `web/services/dashboard_service.py` | Contiene la logica del dashboard y aplica filtros. |
| `Repository` | `DashboardService` mediante SQLAlchemy | Ejecuta consultas parametrizadas contra MySQL. |
| `Entity` | Tablas y vistas definidas en `sql/` | El esquema se define con SQL; no se utiliza ORM. |
| `application.properties` | `.env` | Guarda host, puerto, base, usuario y clave. |
| `templates` | `web/templates/` | Contiene el HTML servido por Flask. |
| `static` | `web/static/` | Contiene CSS y JavaScript. |
| `RestController` | Rutas `/api/*` de Flask | Devuelve informacion JSON al navegador. |

No se crearon clases `Entity` porque el proyecto trabaja con un DataMart
analitico ya modelado en SQL. La aplicacion no realiza operaciones CRUD sobre
objetos individuales; principalmente ejecuta agregaciones, rankings y filtros
sobre la vista `vw_creditos_analitica`.

El modulo `etl/` tampoco forma parte del backend web. Es un proceso batch
independiente que prepara y carga los datos antes de iniciar el dashboard.

## Estructura de carpetas

```text
mivivienda_etl/
|-- datos/                  CSV de origen
|-- etl/                    Extraccion, transformacion y carga
|-- sql/                    Creacion y validacion del DataMart
|-- web/
|   |-- app.py              Controlador Flask y APIs
|   |-- services/           Logica y consultas del dashboard
|   |-- templates/          HTML
|   `-- static/
|       |-- css/            Estilos
|       `-- js/             fetch, filtros, graficos y tabla
|-- tests/                  Pruebas ETL y API
|-- dashboard/              Version alternativa en Streamlit
|-- docs/                   Informe, guion y evidencias
|-- .env.example            Ejemplo de configuracion
`-- requirements.txt        Dependencias Python
```

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

## Como iniciar el proyecto

Todos los comandos deben ejecutarse desde la carpeta raiz:

```powershell
cd ruta\al\proyecto\mivivienda_etl
```

### Primera ejecucion

#### 1. Verificar MySQL

MySQL debe estar instalado y su servicio debe encontrarse iniciado. Tambien se
necesita un usuario con permiso para crear la base configurada.

#### 2. Crear el entorno virtual

```powershell
python -m venv .venv
```

#### 3. Activar el entorno

```powershell
.\.venv\Scripts\Activate.ps1
```

Si PowerShell no permite activar scripts, los comandos tambien pueden
ejecutarse directamente con `.\.venv\Scripts\python.exe`.

#### 4. Instalar dependencias

```powershell
pip install -r requirements.txt
```

#### 5. Configurar la conexion

Crear `.env` a partir del ejemplo:

```powershell
Copy-Item .env.example .env
```

Completar los valores:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_NAME=dm_mivivienda
DB_USER=root
DB_PASSWORD=tu_clave
CSV_PATH=./datos/colocaciones_2024.csv
```

No se debe publicar `.env` porque contiene la contraseña.

#### 6. Crear la base y el modelo estrella

```powershell
.\.venv\Scripts\python.exe -m etl.setup_database
```

Este comando crea la base indicada por `DB_NAME` y ejecuta automáticamente:

```text
sql/01_staging.sql
sql/02_datamart.sql
```

#### 7. Ejecutar la carga inicial

La carga inicial limpia dimensiones y hechos antes de cargar el archivo:

```powershell
.\.venv\Scripts\python.exe -m etl.main --mode initial
```

El resultado esperado es:

```text
Filas leidas: 13,507
Filas vacias: 4,160
Duplicados eliminados: 11
Hechos insertados: 9,336
```

#### 8. Ejecutar las pruebas

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Las cinco pruebas deben finalizar con `OK`.

#### 9. Iniciar el backend y dashboard

```powershell
.\.venv\Scripts\python.exe -m web.app
```

Abrir en el navegador:

```text
http://localhost:5000
```

El mismo proceso Flask sirve:

- El backend Python.
- Las APIs REST.
- El HTML.
- Los archivos CSS y JavaScript.

No es necesario iniciar Angular, Node.js ni otro servidor.

### Ejecuciones posteriores

Cuando la base ya fue creada y cargada, solamente se necesita iniciar Flask:

```powershell
.\.venv\Scripts\python.exe -m web.app
```

Cuando se reciba un archivo con datos nuevos, ejecutar primero la carga
incremental:

```powershell
.\.venv\Scripts\python.exe -m etl.main --mode incremental
.\.venv\Scripts\python.exe -m web.app
```

La carga incremental no reinicia el DataMart y solo inserta hashes nuevos.

Para reconstruir completamente el DataMart:

```powershell
.\.venv\Scripts\python.exe -m etl.main --mode initial
```

## Uso de la carpeta `sql`

La carpeta `sql/` contiene la implementacion fisica y las consultas de
validacion. Los archivos se encuentran separados por responsabilidad:

| Archivo | Cuando se usa | Funcion |
|---|---|---|
| `00_crear_base.sql` | Opcional y manual | Ejemplo para crear la base desde MySQL Workbench. |
| `01_staging.sql` | Primera configuracion | Crea la tabla temporal de aterrizaje e indices. |
| `02_datamart.sql` | Primera configuracion | Crea dimensiones, hechos, relaciones, restricciones y vistas. |
| `03_validaciones.sql` | Despues de cargar el ETL | Verifica conteos, duplicados, nulos, integridad e incremental. |
| `04_consultas_kpi.sql` | Pruebas y exposicion | Obtiene los KPIs y rankings del DataMart. |

Normalmente no es necesario ejecutar manualmente `01_staging.sql` ni
`02_datamart.sql`, porque:

```powershell
.\.venv\Scripts\python.exe -m etl.setup_database
```

los lee y ejecuta automáticamente.

`03_validaciones.sql` y `04_consultas_kpi.sql` no se ejecutan durante el
arranque del sistema. Deben abrirse en MySQL Workbench cuando se quiera
validar la carga, obtener evidencias o demostrar los resultados durante la
exposicion.

## Proceso ETL

Carga incremental, sin repetir registros existentes:

```powershell
.\.venv\Scripts\python.exe -m etl.main --mode incremental
```

Para demostrar la carga incremental, ejecutar el comando dos veces. En la
segunda ejecucion, `filas_insertadas` debe ser cero.

## Pruebas

Pruebas unitarias de transformacion:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
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
.\.venv\Scripts\python.exe -m web.app
```

Abrir `http://localhost:5000`.

Flask sirve el frontend y tambien expone las APIs que consultan la vista
`vw_creditos_analitica`:

```text
GET /api/health
GET /api/filtros
GET /api/dashboard
GET /api/dashboard?departamento=LIMA&producto=NMIV
```

La interfaz incluye filtros por departamento, producto y tipo de IFI.
`dashboard/app.py` se conserva como una version alternativa en Streamlit.

El guion sugerido para la demostracion se encuentra en
`docs/guion_exposicion.md`.

## Evidencias sugeridas

1. Tablas y relaciones del esquema en MySQL Workbench.
2. Consola de la carga inicial.
3. Consola de una carga incremental con cero filas nuevas.
4. Contenido de `etl_ejecucion`.
5. Resultado de las consultas de `03_validaciones.sql`.
6. Resultado de los KPIs de `04_consultas_kpi.sql`.
7. Capturas del dashboard con sus filtros y graficos.
