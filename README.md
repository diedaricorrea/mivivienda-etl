# Datamart Mivivienda

Proyecto academico del curso de **Inteligencia de Negocios**.

Solucion integral para analizar las **colocaciones de credito del Fondo Mivivienda** a partir de datos publicos: modelado dimensional (estrella), proceso ETL, DataMart en MySQL y dashboard web analitico.

| | |
|---|---|
| **Curso** | Inteligencia de Negocios |
| **Docente** | Ing. Oscar Eduardo Balcazar Chumacero |
| **Dominio** | Fondo Mivivienda (colocaciones multi-anio) |
| **Entregable** | DataMart + ETL + dashboard BI |

---

## Stack tecnologico

| Capa | Tecnologia | Uso |
|---|---|---|
| Lenguaje / datos | Python, pandas | Extraccion, transformacion y carga (ETL) |
| Base de datos | MySQL 8 | Staging, dimensiones, hechos, vistas, agregados |
| Backend | Flask, SQLAlchemy | Rutas HTML, APIs REST, consultas parametrizadas |
| Frontend BI | HTML, CSS, JavaScript | Tablero, filtros, paginacion, exportacion |
| Visualizacion | Chart.js, Leaflet | Graficos analiticos y mapa coropletico |
| Calidad | unittest | Pruebas de transformacion y de la API web |

---

## Arquitectura

```text
CSV (datos/)
    |
    v
etl/extract.py → etl/transform.py → etl/load.py
    |                                      |
    +------------- etl/main.py ------------+
                                           |
                                           v
                                  MySQL · DataMart
                                   (estrella + vistas
                                    + agg_colocaciones)
                                           |
                                           v
                         web/services/dashboard_service.py
                                           |
                                           v
                                    web/app.py (Flask)
                                      /           \
                                     v             v
                              HTML (Jinja)     /api/* (JSON)
                                     |
                                     v
                         Chart.js · Leaflet · dashboard.js
```

El ETL es un **proceso batch** independiente del servidor web. El dashboard solo consulta el DataMart ya cargado.

Organizacion en capas (equivalente conceptual a un backend tipico):

| Rol | Ubicacion |
|---|---|
| Rutas / controladores | `web/app.py` |
| Logica de consulta BI | `web/services/dashboard_service.py` |
| Configuracion | `.env` + `config/conexion.py` |
| Esquema fisico | `sql/` |
| Presentacion | `web/templates/` + `web/static/` |

---

## Modelo dimensional (estrella)

Grano de `fact_credito`: **un credito desembolsado**.

| Tipo | Tablas |
|---|---|
| Hechos | `fact_credito` |
| Dimensiones | `dim_tiempo`, `dim_geografia`, `dim_producto`, `dim_ifi`, `dim_plazo` |
| Staging / auditoria | `stg_colocaciones_mivivienda`, `etl_ejecucion` |
| Lectura analitica | `vw_creditos_analitica`, `agg_colocaciones` |

Como la fuente no trae un ID de transaccion, el ETL genera `record_hash` con los campos normalizados para deduplicar y soportar carga incremental.

Detalle de rendimiento (agregados e indices): `docs/rendimiento.md`.

---

## Estructura del repositorio

```text
mivivienda-etl/
|-- config/              Conexion MySQL y rutas compartidas
|-- datos/               CSV de origen (2018-2024)
|-- etl/                 Extract · Transform · Load
|-- sql/                 Esquema, validaciones, KPIs, rendimiento
|-- web/
|   |-- app.py           Flask (paginas + API)
|   |-- services/        Consultas del dashboard
|   |-- templates/       HTML (Resumen, Tendencias, Mapa, Analisis, Detalle, Proyecto…)
|   `-- static/          CSS, JS, GeoJSON, logos
|-- tests/               Pruebas automatizadas
|-- docs/                Documentacion tecnica y academica
|-- scripts/             Utilidades de documentacion (opcionales)
|-- .env.example
`-- requirements.txt
```

### Rutas del dashboard

| Ruta | Contenido |
|---|---|
| `/` | Resumen completo (KPIs, mapa, series, analisis, detalle) |
| `/tendencias` | Vista temporal enfocada |
| `/mapa` | Mapa interactivo (plano / relieve) |
| `/analisis` | Comparativos por producto, IFI y geografia |
| `/detalle` | Tabla analitica paginada |
| `/diccionario` | Diccionario de datos de la fuente |
| `/proyecto` | Ficha academica del proyecto |

API principal:

```text
GET /api/health
GET /api/filtros
GET /api/dashboard
GET /api/dashboard?anio=2024&departamento=LIMA&producto=NMIV
GET /api/export?formato=xlsx
GET /api/diccionario
```

---

## Requisitos previos

- Python 3.10+ (recomendado 3.12)
- MySQL 8 en ejecucion
- Usuario MySQL con permiso para crear la base configurada en `.env`

---

## Como ejecutar el proyecto

Todos los comandos se lanzan desde la **raiz del repositorio**.

### 1. Entorno virtual e instalacion

**Windows (PowerShell):**

```powershell
cd ruta\al\proyecto\mivivienda-etl
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Linux / macOS:**

```bash
cd ruta/al/proyecto/mivivienda-etl
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configuracion

```powershell
Copy-Item .env.example .env
```

Editar `.env`:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_NAME=dm_mivivienda
DB_USER=root
DB_PASSWORD=tu_clave
CSV_PATH=./datos/colocaciones_2024.csv
```

No versionar `.env` (contiene credenciales).

### 3. Crear base y modelo estrella

```powershell
python -m etl.setup_database
```

Ejecuta automaticamente `sql/01_staging.sql` y `sql/02_datamart.sql`.

### 4. Cargar datos (ETL)

Por defecto carga **todos** los CSV de `datos/` (historico multi-anio):

```powershell
python -m etl.main --mode initial
```

`initial` reinicia el Datamart y vuelve a cargar. Para agregar sin borrar:

```powershell
python -m etl.main --mode incremental
```

Un solo archivo:

```powershell
python -m etl.main --mode incremental --csv .\datos\Data_NCMV_2018.csv
```

Al finalizar, el ETL refresca agregados e indices de rendimiento.

### 5. Pruebas

```powershell
python -m unittest discover -s tests -v
```

### 6. Dashboard

```powershell
python -m web.app
```

Abrir:

```text
http://127.0.0.1:5000
```

Flask sirve plantillas, estaticos y API en el mismo proceso. No se requiere Node.js ni otro servidor frontend.

### Ejecuciones siguientes

Si la base ya esta creada y cargada:

```powershell
python -m web.app
```

Datos nuevos:

```powershell
python -m etl.main --mode incremental
python -m web.app
```

---

## Carpeta `sql/`

| Archivo | Uso |
|---|---|
| `00_crear_base.sql` | Ejemplo manual de creacion de base |
| `01_staging.sql` | Tabla de aterrizaje |
| `02_datamart.sql` | Modelo estrella, FKs y vistas |
| `03_validaciones.sql` | Conteo, duplicados, integridad (Workbench) |
| `04_consultas_kpi.sql` | KPIs y rankings de verificacion |
| `05_rendimiento.sql` | `agg_colocaciones` e indices |

`01` y `02` se aplican con `python -m etl.setup_database`.  
`03` y `04` se usan en MySQL Workbench para validacion y evidencias.

---

## Conocimientos aplicados

- Modelado dimensional (esquema estrella, grano, hechos y dimensiones)
- Procesos ETL (limpieza, tipado, deduplicacion, carga incremental)
- DataMart analitico en MySQL
- Definicion e interpretacion de KPIs
- Visualizacion BI (series, rankings, mapa, detalle)
- Arquitectura en capas (batch ETL / servicio / API / presentacion)

---

## Documentacion adicional

| Recurso | Contenido |
|---|---|
| `/proyecto` (en el dashboard) | Ficha academica, stack y modelo |
| `docs/rendimiento.md` | Agregados e indices del dashboard |
| `docs/guion_exposicion.md` | Guion sugerido de demostracion |
| `sql/03_validaciones.sql` | Evidencias de calidad e integridad |

---

## Licencia y datos

Proyecto con fines academicos. Los CSV de colocaciones provienen de fuentes publicas del Fondo Mivivienda; respetar las condiciones de uso de la fuente original.
