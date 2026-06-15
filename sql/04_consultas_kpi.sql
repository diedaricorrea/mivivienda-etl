-- KPI 1: monto total y cantidad por mes.
SELECT
    mes_numero,
    mes_nombre,
    SUM(cantidad_creditos) AS cantidad_creditos,
    ROUND(SUM(monto_credito), 2) AS monto_total
FROM vw_creditos_analitica
GROUP BY mes_numero, mes_nombre
ORDER BY mes_numero;

-- KPI 2: participacion por producto.
SELECT
    codigo_producto,
    SUM(cantidad_creditos) AS cantidad_creditos,
    ROUND(SUM(monto_credito), 2) AS monto_total
FROM vw_creditos_analitica
GROUP BY codigo_producto
ORDER BY monto_total DESC;

-- KPI 3: top departamentos.
SELECT
    departamento,
    SUM(cantidad_creditos) AS cantidad_creditos,
    ROUND(SUM(monto_credito), 2) AS monto_total
FROM vw_creditos_analitica
GROUP BY departamento
ORDER BY monto_total DESC
LIMIT 10;

-- KPI 4: ranking de IFI.
SELECT
    nombre_ifi,
    tipo_ifi,
    SUM(cantidad_creditos) AS cantidad_creditos,
    ROUND(SUM(monto_credito), 2) AS monto_total
FROM vw_creditos_analitica
GROUP BY nombre_ifi, tipo_ifi
ORDER BY monto_total DESC;

-- KPI 5: tasa promedio por producto y tipo de IFI.
SELECT
    codigo_producto,
    tipo_ifi,
    ROUND(AVG(tasa_interes), 2) AS tasa_promedio
FROM vw_creditos_analitica
GROUP BY codigo_producto, tipo_ifi
ORDER BY codigo_producto, tipo_ifi;

-- KPI 6: distribucion por categoria de plazo.
SELECT
    categoria_plazo,
    SUM(cantidad_creditos) AS cantidad_creditos,
    ROUND(AVG(plazo_meses), 2) AS plazo_promedio
FROM vw_creditos_analitica
GROUP BY categoria_plazo
ORDER BY MIN(plazo_meses);
