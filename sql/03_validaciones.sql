USE dm_mivivienda;

-- 1. Conteos de la ultima ejecucion ETL.
SELECT *
FROM etl_ejecucion
ORDER BY id_ejecucion DESC
LIMIT 5;

-- 2. Conciliacion staging vs hechos cargados desde el lote actual.
SELECT
    (SELECT COUNT(*) FROM stg_colocaciones_mivivienda) AS filas_staging,
    (
        SELECT COUNT(*)
        FROM stg_colocaciones_mivivienda s
        JOIN fact_credito f ON f.record_hash = s.record_hash
    ) AS filas_en_fact,
    (
        SELECT COUNT(*)
        FROM stg_colocaciones_mivivienda s
        LEFT JOIN fact_credito f ON f.record_hash = s.record_hash
        WHERE f.id_fact_credito IS NULL
    ) AS filas_no_cargadas;

-- 3. Duplicados por la clave tecnica usada para carga incremental.
SELECT record_hash, COUNT(*) AS repeticiones
FROM fact_credito
GROUP BY record_hash
HAVING COUNT(*) > 1;

-- 4. Nulos en claves foraneas y medidas criticas.
SELECT
    SUM(id_tiempo IS NULL) AS nulos_tiempo,
    SUM(id_geografia IS NULL) AS nulos_geografia,
    SUM(id_producto IS NULL) AS nulos_producto,
    SUM(id_ifi IS NULL) AS nulos_ifi,
    SUM(id_plazo IS NULL) AS nulos_plazo,
    SUM(monto_credito IS NULL OR monto_credito <= 0) AS montos_invalidos
FROM fact_credito;

-- 5. Integridad: hechos sin correspondencia en dimensiones.
SELECT COUNT(*) AS hechos_huerfanos
FROM fact_credito f
LEFT JOIN dim_tiempo t ON t.id_tiempo = f.id_tiempo
LEFT JOIN dim_geografia g ON g.id_geografia = f.id_geografia
LEFT JOIN dim_producto p ON p.id_producto = f.id_producto
LEFT JOIN dim_ifi i ON i.id_ifi = f.id_ifi
LEFT JOIN dim_plazo pl ON pl.id_plazo = f.id_plazo
WHERE t.id_tiempo IS NULL
   OR g.id_geografia IS NULL
   OR p.id_producto IS NULL
   OR i.id_ifi IS NULL
   OR pl.id_plazo IS NULL;

-- 6. Comprobacion de carga incremental:
-- ejecutar el ETL por segunda vez y verificar filas_insertadas = 0.
SELECT modo_carga, filas_transformadas, filas_insertadas, estado, fecha_inicio
FROM etl_ejecucion
ORDER BY id_ejecucion DESC
LIMIT 2;

-- 7. Perfil general para comparar con el sistema origen.
SELECT
    SUM(cantidad_creditos) AS cantidad_creditos,
    ROUND(SUM(monto_credito), 2) AS monto_total,
    ROUND(AVG(monto_credito), 2) AS monto_promedio,
    ROUND(AVG(tasa_interes), 2) AS tasa_promedio,
    MIN(tasa_interes) AS tasa_minima,
    MAX(tasa_interes) AS tasa_maxima,
    MIN(plazo_meses) AS plazo_minimo,
    MAX(plazo_meses) AS plazo_maximo
FROM vw_creditos_analitica;

