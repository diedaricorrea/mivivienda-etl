# Rendimiento del Datamart y del dashboard

Documento técnico sobre el problema de latencia al ampliar el histórico de colocaciones de **2018–2024** y la solución aplicada siguiendo prácticas habituales de DataMart / OLAP.

---

## 1. Contexto

Con un solo año (~9 300 créditos) el dashboard respondía bien consultando la vista `vw_creditos_analitica`.

Al integrar 2018–2024 el hecho creció a ~**76 000 filas**. Cada apertura del dashboard ejecutaba **múltiples agregaciones** (KPIs, series, rankings, mapa, conteo de detalle) sobre esa vista, que además hace **5 JOINs** (tiempo, geografía, producto, IFI, plazo).

Resultado: el request `/api/dashboard` se volvía notablemente más lento, sobre todo al consultar “Todos” los años.

---

## 2. Diagnóstico

| Observación | Implicancia |
|---|---|
| ~12 consultas por request | Muchos round-trips a MySQL |
| Cada consulta leía `vw_creditos_analitica` | Escaneo/joins sobre ~76k hechos |
| Filtros por año/departamento/producto | Sin índices dedicados en dimensiones de filtro |
| `COUNT(*)` del detalle sobre la vista | Costo alto solo para paginación |
| Agregar años no cambiaba el modelo estrella | El cuello de botella era de **consumo**, no de modelado |

Conclusión: el modelo dimensional era correcto; faltaba una **capa de lectura analítica** y **índices de filtro**.

---

## 3. Principios aplicados (buenas prácticas)

1. **Separar carga (ETL) de consulta (BI)**  
   El batch escribe hechos; el dashboard no debe recalcular todo desde el grano más fino si no es necesario.

2. **Agregar una vez, consultar muchas**  
   Patrón clásico de DataMart: materializar agregados en el grano útil para filtros y gráficos.

3. **Índices alineados a predicados reales**  
   Indexar columnas usadas en `WHERE` / `GROUP BY` del dashboard.

4. **Detalle fino solo cuando hace falta**  
   La tabla paginada sigue leyendo la vista detallada, pero limitada (`LIMIT`/`OFFSET`).

5. **Caché corta de metadatos**  
   Totales globales y listas de filtros cambian solo tras un ETL; se pueden cachear unos segundos en memoria.

---

## 4. Solución implementada

### 4.1 Tabla agregada `agg_colocaciones`

Definida en `sql/05_rendimiento.sql`.

Grano aproximado:

```text
anio + mes + departamento + producto + tipo_ifi + nombre_ifi + categoria_plazo
```

Métricas almacenadas:

- `cantidad_creditos`
- `monto_total`
- `suma_tasa` (para promedio ponderado)
- `suma_plazo` / `plazo_min`

Efecto práctico observado en este proyecto:

| Capa | Filas aprox. |
|---|---|
| `fact_credito` | ~76 000 |
| `agg_colocaciones` | ~12 000 |

Los KPIs y gráficos del dashboard leen **`agg_colocaciones`**.  
El detalle analítico sigue leyendo **`vw_creditos_analitica`** (paginado).

### 4.2 Refresh automático en el ETL

Al terminar la carga (`etl/main.py` → `etl/load.py`):

1. se aseguran índices de rendimiento  
2. se hace `TRUNCATE` + `INSERT … SELECT … GROUP BY` sobre la vista  
3. queda lista la tabla agregada para el dashboard  

Así, cada `initial` o `incremental` deja consistente la capa analítica.

### 4.3 Índices

**Dimensiones (filtros del UI)**

| Tabla | Índice | Columna |
|---|---|---|
| `dim_tiempo` | `idx_dim_tiempo_anio` | `anio` |
| `dim_geografia` | `idx_dim_geo_depto` | `departamento` |
| `dim_producto` | `idx_dim_producto_codigo` | `codigo_producto` |
| `dim_ifi` | `idx_dim_ifi_tipo` | `tipo_ifi` |

**Tabla agregada**

- PK por el grano analítico  
- `idx_agg_anio`  
- `idx_agg_depto`  
- `idx_agg_producto`  
- `idx_agg_tipo_ifi`  
- `idx_agg_anio_mes`

Los índices de dimensiones se crean de forma **idempotente** desde Python (`ensure_performance_indexes`), para no fallar si ya existen.

### 4.4 Ajustes en el servicio web

En `web/services/dashboard_service.py`:

- KPIs, series, rankings y mapa → `agg_colocaciones`
- Conteo de páginas del detalle → `SUM(cantidad_creditos)` sobre el agregado (equivalente y más barato que `COUNT(*)` en la vista)
- Detalle filas → vista detallada con `LIMIT`
- Meta/filtros → caché en memoria (~45 s)

Si el agregado está vacío pero hay hechos, el servicio puede reconstruirlo automáticamente (autosanación).

---

## 5. Flujo resultante

```text
ETL carga CSV
   -> inserta dimensiones / fact_credito
   -> refresh agg_colocaciones
        |
        v
Dashboard
   -> graficos/KPIs: agg_colocaciones   (rapido)
   -> detalle: vw_creditos_analitica    (preciso, paginado)
```

---

## 6. Cómo verificarlo

```powershell
# Crear/actualizar estructura (incluye 05_rendimiento.sql)
python -m etl.setup_database

# Recargar datos y refrescar agregados
python -m etl.main --mode initial

# O solo refrescar agregados si ya hay hechos
python -c "from etl.load import refresh_aggregates; refresh_aggregates()"
```

En MySQL:

```sql
SELECT COUNT(*) FROM fact_credito;
SELECT COUNT(*) FROM agg_colocaciones;
SHOW INDEX FROM agg_colocaciones;
SHOW INDEX FROM dim_tiempo;
```

---

## 7. Qué no se hizo (y por qué)

| Alternativa | Motivo de no priorizarla ahora |
|---|---|
| Redis / caché distribuida | Exceso para un proyecto local académico |
| Materialized views nativas de MySQL | MySQL no las ofrece como en PostgreSQL; la tabla `agg_*` cumple el mismo rol |
| Denormalizar todo en una sola tabla ancha | Rompe el diseño dimensional enseñado en el curso |
| ORM pesado para el dashboard | El DataMart ya es SQL-first; SQLAlchemy como acceso directo es suficiente |

---

## 8. Aprendizaje clave

Escalar de 1 año a 7 años **no exigió rediseñar la estrella**.  
Exigió aplicar una práctica estándar de BI:

> **modelar en grano fino para verdad y auditoría; servir en grano agregado para análisis interactivo.**

Eso es exactamente lo que hacen `fact_credito` + `agg_colocaciones` en este proyecto.
