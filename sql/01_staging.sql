USE dm_mivivienda;

CREATE TABLE IF NOT EXISTS stg_colocaciones_mivivienda (
    id_staging              BIGINT AUTO_INCREMENT PRIMARY KEY,
    fecha_desembolso        DATE NOT NULL,
    producto                VARCHAR(10) NOT NULL,
    departamento            VARCHAR(100) NOT NULL,
    provincia               VARCHAR(100) NOT NULL,
    distrito                VARCHAR(120) NOT NULL,
    ubigeo                  CHAR(6) NOT NULL,
    ifi                     VARCHAR(150) NOT NULL,
    tipo_ifi                VARCHAR(80) NOT NULL,
    monto_credito           DECIMAL(18,2) NOT NULL,
    monto_cuota_inicial     DECIMAL(18,2),
    plazo_meses             INT NOT NULL,
    tasa                    DECIMAL(8,4) NOT NULL,
    monto_valor_vivienda    DECIMAL(18,2) NOT NULL,
    fecha_corte             DATE NOT NULL,
    record_hash             CHAR(64) NOT NULL,
    fuente_archivo          VARCHAR(255) NOT NULL,
    fecha_carga             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stg_record_hash UNIQUE (record_hash),
    CONSTRAINT chk_stg_monto_credito CHECK (monto_credito > 0),
    CONSTRAINT chk_stg_plazo CHECK (plazo_meses > 0),
    CONSTRAINT chk_stg_tasa CHECK (tasa > 0),
    INDEX idx_stg_fecha (fecha_desembolso),
    INDEX idx_stg_ubigeo (ubigeo),
    INDEX idx_stg_producto (producto)
);
