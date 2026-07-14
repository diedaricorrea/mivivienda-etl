-- Indices de dimensiones para filtros del dashboard
-- y tabla agregada (patron tipico de DataMart / OLAP).

CREATE TABLE IF NOT EXISTS agg_colocaciones (
    anio                SMALLINT NOT NULL,
    mes_numero          TINYINT NOT NULL,
    mes_nombre          VARCHAR(15) NOT NULL,
    trimestre           TINYINT NOT NULL,
    departamento        VARCHAR(100) NOT NULL,
    codigo_producto     VARCHAR(10) NOT NULL,
    tipo_ifi            VARCHAR(80) NOT NULL,
    nombre_ifi          VARCHAR(150) NOT NULL,
    categoria_plazo     VARCHAR(20) NOT NULL,
    plazo_min           INT NOT NULL,
    cantidad_creditos   INT NOT NULL,
    monto_total         DECIMAL(18,2) NOT NULL,
    suma_tasa           DECIMAL(18,4) NOT NULL,
    suma_plazo          DECIMAL(18,2) NOT NULL,
    PRIMARY KEY (
        anio,
        mes_numero,
        departamento,
        codigo_producto,
        tipo_ifi,
        nombre_ifi,
        categoria_plazo
    ),
    INDEX idx_agg_anio (anio),
    INDEX idx_agg_depto (departamento),
    INDEX idx_agg_producto (codigo_producto),
    INDEX idx_agg_tipo_ifi (tipo_ifi),
    INDEX idx_agg_anio_mes (anio, mes_numero)
);
