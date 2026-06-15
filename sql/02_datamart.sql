USE dm_mivivienda;

CREATE TABLE IF NOT EXISTS dim_tiempo (
    id_tiempo          INT AUTO_INCREMENT PRIMARY KEY,
    fecha_desembolso   DATE NOT NULL,
    anio               SMALLINT NOT NULL,
    semestre           TINYINT NOT NULL,
    trimestre          TINYINT NOT NULL,
    mes_numero         TINYINT NOT NULL,
    mes_nombre         VARCHAR(15) NOT NULL,
    dia                TINYINT NOT NULL,
    CONSTRAINT uq_dim_tiempo_fecha UNIQUE (fecha_desembolso),
    CONSTRAINT chk_dim_tiempo_mes CHECK (mes_numero BETWEEN 1 AND 12),
    CONSTRAINT chk_dim_tiempo_trimestre CHECK (trimestre BETWEEN 1 AND 4)
);

CREATE TABLE IF NOT EXISTS dim_geografia (
    id_geografia   INT AUTO_INCREMENT PRIMARY KEY,
    ubigeo         CHAR(6) NOT NULL,
    departamento   VARCHAR(100) NOT NULL,
    provincia      VARCHAR(100) NOT NULL,
    distrito       VARCHAR(120) NOT NULL,
    region_natural VARCHAR(50),
    CONSTRAINT uq_dim_geografia_ubigeo UNIQUE (ubigeo)
);

CREATE TABLE IF NOT EXISTS dim_producto (
    id_producto       INT AUTO_INCREMENT PRIMARY KEY,
    codigo_producto   VARCHAR(10) NOT NULL,
    nombre_producto   VARCHAR(120) NOT NULL,
    descripcion       VARCHAR(255),
    tipo_beneficiario VARCHAR(100),
    CONSTRAINT uq_dim_producto_codigo UNIQUE (codigo_producto)
);

CREATE TABLE IF NOT EXISTS dim_ifi (
    id_ifi      INT AUTO_INCREMENT PRIMARY KEY,
    nombre_ifi  VARCHAR(150) NOT NULL,
    tipo_ifi    VARCHAR(80) NOT NULL,
    categoria   VARCHAR(80),
    regulador   VARCHAR(100) DEFAULT 'SBS',
    CONSTRAINT uq_dim_ifi UNIQUE (nombre_ifi, tipo_ifi)
);

CREATE TABLE IF NOT EXISTS dim_plazo (
    id_plazo        INT AUTO_INCREMENT PRIMARY KEY,
    plazo_meses     INT NOT NULL,
    plazo_anios     DECIMAL(6,2) NOT NULL,
    rango_plazo     VARCHAR(50) NOT NULL,
    categoria_plazo VARCHAR(20) NOT NULL,
    CONSTRAINT uq_dim_plazo_meses UNIQUE (plazo_meses),
    CONSTRAINT chk_dim_plazo CHECK (plazo_meses > 0)
);

CREATE TABLE IF NOT EXISTS fact_credito (
    id_fact_credito       BIGINT AUTO_INCREMENT PRIMARY KEY,
    record_hash           CHAR(64) NOT NULL,
    id_tiempo             INT NOT NULL,
    id_geografia          INT NOT NULL,
    id_producto           INT NOT NULL,
    id_ifi                INT NOT NULL,
    id_plazo              INT NOT NULL,
    monto_credito         DECIMAL(18,2) NOT NULL,
    monto_cuota_inicial   DECIMAL(18,2),
    monto_valor_vivienda  DECIMAL(18,2) NOT NULL,
    tasa_interes          DECIMAL(8,4) NOT NULL,
    cantidad_creditos     TINYINT NOT NULL DEFAULT 1,
    fecha_corte           DATE NOT NULL,
    fecha_carga           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fact_record_hash UNIQUE (record_hash),
    CONSTRAINT fk_fact_tiempo
        FOREIGN KEY (id_tiempo) REFERENCES dim_tiempo (id_tiempo),
    CONSTRAINT fk_fact_geografia
        FOREIGN KEY (id_geografia) REFERENCES dim_geografia (id_geografia),
    CONSTRAINT fk_fact_producto
        FOREIGN KEY (id_producto) REFERENCES dim_producto (id_producto),
    CONSTRAINT fk_fact_ifi
        FOREIGN KEY (id_ifi) REFERENCES dim_ifi (id_ifi),
    CONSTRAINT fk_fact_plazo
        FOREIGN KEY (id_plazo) REFERENCES dim_plazo (id_plazo),
    CONSTRAINT chk_fact_monto CHECK (monto_credito > 0),
    CONSTRAINT chk_fact_cantidad CHECK (cantidad_creditos = 1),
    INDEX idx_fact_tiempo (id_tiempo),
    INDEX idx_fact_geografia (id_geografia),
    INDEX idx_fact_producto (id_producto),
    INDEX idx_fact_ifi (id_ifi),
    INDEX idx_fact_plazo (id_plazo),
    INDEX idx_fact_fecha_corte (fecha_corte)
);

CREATE TABLE IF NOT EXISTS etl_ejecucion (
    id_ejecucion             BIGINT AUTO_INCREMENT PRIMARY KEY,
    fecha_inicio             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modo_carga               VARCHAR(20) NOT NULL,
    archivo_origen           VARCHAR(255) NOT NULL,
    filas_origen             INT NOT NULL,
    filas_vacias             INT NOT NULL,
    filas_invalidas          INT NOT NULL,
    duplicados_eliminados    INT NOT NULL,
    filas_transformadas      INT NOT NULL,
    filas_insertadas         INT NOT NULL,
    estado                   VARCHAR(20) NOT NULL,
    detalle                  VARCHAR(500)
);

CREATE OR REPLACE VIEW vw_creditos_analitica AS
SELECT
    f.id_fact_credito,
    t.fecha_desembolso,
    t.anio,
    t.semestre,
    t.trimestre,
    t.mes_numero,
    t.mes_nombre,
    g.ubigeo,
    g.departamento,
    g.provincia,
    g.distrito,
    p.codigo_producto,
    p.nombre_producto,
    i.nombre_ifi,
    i.tipo_ifi,
    pl.plazo_meses,
    pl.rango_plazo,
    pl.categoria_plazo,
    f.monto_credito,
    f.monto_cuota_inicial,
    f.monto_valor_vivienda,
    f.tasa_interes,
    f.cantidad_creditos,
    f.fecha_corte,
    CASE
        WHEN f.monto_valor_vivienda > 0
        THEN f.monto_cuota_inicial / f.monto_valor_vivienda
        ELSE NULL
    END AS ratio_cuota_inicial
FROM fact_credito f
JOIN dim_tiempo t ON t.id_tiempo = f.id_tiempo
JOIN dim_geografia g ON g.id_geografia = f.id_geografia
JOIN dim_producto p ON p.id_producto = f.id_producto
JOIN dim_ifi i ON i.id_ifi = f.id_ifi
JOIN dim_plazo pl ON pl.id_plazo = f.id_plazo;

CREATE OR REPLACE VIEW vw_resumen_mensual AS
SELECT
    anio,
    mes_numero,
    mes_nombre,
    departamento,
    codigo_producto,
    tipo_ifi,
    SUM(cantidad_creditos) AS cantidad_creditos,
    SUM(monto_credito) AS monto_total,
    AVG(monto_credito) AS monto_promedio,
    AVG(tasa_interes) AS tasa_promedio
FROM vw_creditos_analitica
GROUP BY
    anio,
    mes_numero,
    mes_nombre,
    departamento,
    codigo_producto,
    tipo_ifi;
