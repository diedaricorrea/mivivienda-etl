from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from etl.conexion import get_engine


OUTPUT = ROOT / "docs" / "evidencias_avance2"
OUTPUT.mkdir(parents=True, exist_ok=True)

NAVY = "#10233F"
BLUE = "#1F6FEB"
CYAN = "#23A6D5"
MINT = "#18A999"
ORANGE = "#FF9F43"
INK = "#172033"
MUTED = "#6B778C"
LINE = "#DDE5EF"
BG = "#F4F7FB"
WHITE = "#FFFFFF"
GREEN = "#178A63"


def font(size: int, bold: bool = False, mono: bool = False):
    candidates = []
    if mono:
        candidates.extend(
            [
                "C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf",
                "C:/Windows/Fonts/lucon.ttf",
            ]
        )
    else:
        candidates.extend(
            [
                "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
                "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
            ]
        )
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def canvas(title: str, subtitle: str):
    image = Image.new("RGB", (1600, 900), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((55, 45, 1545, 855), radius=24, fill=WHITE, outline=LINE, width=2)
    draw.text((95, 78), title, fill=NAVY, font=font(36, bold=True))
    draw.text((95, 130), subtitle, fill=MUTED, font=font(20))
    return image, draw


def rounded_box(draw, xy, title, rows, fill=WHITE, accent=BLUE, width=340):
    x, y = xy
    height = 74 + len(rows) * 34
    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=16,
        fill=fill,
        outline=LINE,
        width=2,
    )
    draw.rounded_rectangle(
        (x, y, x + width, y + 52),
        radius=16,
        fill=accent,
    )
    draw.rectangle((x, y + 36, x + width, y + 52), fill=accent)
    draw.text((x + 18, y + 13), title, fill=WHITE, font=font(20, bold=True))
    for index, row in enumerate(rows):
        draw.text(
            (x + 18, y + 68 + index * 34),
            row,
            fill=INK,
            font=font(16, mono=True),
        )
    return (x, y, x + width, y + height)


def arrow(draw, start, end, color=MUTED):
    draw.line((start, end), fill=color, width=4)
    x, y = end
    draw.polygon([(x, y), (x - 14, y - 8), (x - 14, y + 8)], fill=color)


def build_model():
    image, draw = canvas(
        "Modelo fisico del DataMart",
        "Esquema estrella implementado en MySQL: cinco dimensiones y una tabla de hechos.",
    )

    fact = rounded_box(
        draw,
        (620, 210),
        "FACT_CREDITO",
        [
            "PK id_fact_credito",
            "FK id_tiempo",
            "FK id_geografia",
            "FK id_producto",
            "FK id_ifi",
            "FK id_plazo",
            "monto_credito",
            "monto_cuota_inicial",
            "monto_valor_vivienda",
            "tasa_interes",
            "UQ record_hash",
        ],
        fill="#F8FBFF",
        accent=NAVY,
        width=360,
    )

    dimensions = [
        ((120, 195), "DIM_TIEMPO", ["PK id_tiempo", "fecha_desembolso", "anio", "semestre", "trimestre", "mes", "dia"], BLUE),
        ((1100, 195), "DIM_GEOGRAFIA", ["PK id_geografia", "ubigeo", "departamento", "provincia", "distrito"], CYAN),
        ((105, 555), "DIM_PRODUCTO", ["PK id_producto", "codigo_producto", "nombre_producto", "descripcion"], MINT),
        ((1120, 555), "DIM_IFI", ["PK id_ifi", "nombre_ifi", "tipo_ifi", "regulador"], ORANGE),
        ((620, 675), "DIM_PLAZO", ["PK id_plazo", "plazo_meses", "rango_plazo", "categoria_plazo"], "#7B61B3"),
    ]

    boxes = []
    for position, title, rows, color in dimensions:
        boxes.append(rounded_box(draw, position, title, rows, accent=color, width=360))

    fact_left = (fact[0], (fact[1] + fact[3]) // 2)
    fact_right = (fact[2], (fact[1] + fact[3]) // 2)
    fact_bottom = ((fact[0] + fact[2]) // 2, fact[3])
    arrow(draw, (boxes[0][2], (boxes[0][1] + boxes[0][3]) // 2), fact_left)
    arrow(draw, (boxes[1][0], (boxes[1][1] + boxes[1][3]) // 2), fact_right)
    arrow(draw, (boxes[2][2], (boxes[2][1] + boxes[2][3]) // 2), (fact[0], fact[3] - 55))
    arrow(draw, (boxes[3][0], (boxes[3][1] + boxes[3][3]) // 2), (fact[2], fact[3] - 55))
    arrow(draw, ((boxes[4][0] + boxes[4][2]) // 2, boxes[4][1]), fact_bottom)

    draw.text((1080, 805), "Cardinalidad: dimensiones 1 : N hechos", fill=MUTED, font=font(17))
    image.save(OUTPUT / "modelo_estrella.png")


def build_architecture():
    image, draw = canvas(
        "Arquitectura de la solucion",
        "Un solo proyecto integra ETL, DataMart, APIs REST y dashboard web.",
    )
    boxes = [
        (100, 325, 330, 500, "CSV ORIGEN", ["13,507 filas", "14 columnas"], CYAN),
        (390, 280, 650, 545, "ETL PYTHON", ["extract.py", "transform.py", "load.py", "main.py"], BLUE),
        (720, 250, 1010, 575, "MYSQL", ["staging", "5 dimensiones", "fact_credito", "vistas BI"], NAVY),
        (1080, 275, 1350, 550, "FLASK API", ["/api/health", "/api/filtros", "/api/dashboard"], MINT),
        (1400, 325, 1520, 500, "WEB", ["HTML", "CSS", "JS"], ORANGE),
    ]
    for x1, y1, x2, y2, title, rows, color in boxes:
        draw.rounded_rectangle((x1, y1, x2, y2), radius=18, fill="#FAFCFF", outline=LINE, width=2)
        draw.rounded_rectangle((x1, y1, x2, y1 + 58), radius=18, fill=color)
        draw.rectangle((x1, y1 + 40, x2, y1 + 58), fill=color)
        title_width = draw.textbbox((0, 0), title, font=font(19, bold=True))[2]
        draw.text(((x1 + x2 - title_width) / 2, y1 + 17), title, fill=WHITE, font=font(19, bold=True))
        for index, row in enumerate(rows):
            row_width = draw.textbbox((0, 0), row, font=font(17))[2]
            draw.text(
                ((x1 + x2 - row_width) / 2, y1 + 85 + index * 38),
                row,
                fill=INK,
                font=font(17),
            )
    for index in range(len(boxes) - 1):
        current = boxes[index]
        following = boxes[index + 1]
        arrow(
            draw,
            (current[2] + 10, (current[1] + current[3]) // 2),
            (following[0] - 12, (following[1] + following[3]) // 2),
            color=BLUE,
        )
    draw.text(
        (390, 675),
        "Flujo: Extract -> Transform -> Load -> consulta API -> visualizacion interactiva",
        fill=NAVY,
        font=font(25, bold=True),
    )
    draw.text(
        (475, 725),
        "El navegador nunca consulta directamente el CSV: consume datos consolidados del DataMart.",
        fill=MUTED,
        font=font(19),
    )
    image.save(OUTPUT / "arquitectura.png")


def build_etl():
    engine = get_engine()
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                SELECT modo_carga, filas_origen, filas_vacias,
                       duplicados_eliminados, filas_transformadas,
                       filas_insertadas, estado
                FROM etl_ejecucion
                ORDER BY id_ejecucion DESC
                LIMIT 2
                """
            )
        ).mappings().all()
    rows = list(reversed(rows))

    image, draw = canvas(
        "Evidencia de ejecucion ETL",
        "Comparacion de carga inicial e incremental registrada en MySQL.",
    )
    draw.rounded_rectangle((95, 190, 1505, 795), radius=18, fill="#0B1322")
    draw.ellipse((120, 215, 138, 233), fill="#FF5F57")
    draw.ellipse((148, 215, 166, 233), fill="#FFBD2E")
    draw.ellipse((176, 215, 194, 233), fill="#28C840")
    draw.text((220, 207), "PowerShell - ETL Mivivienda", fill="#AFC2DB", font=font(18, mono=True))

    y = 270
    for row in rows:
        mode = str(row["modo_carga"]).upper()
        lines = [
            f"> python -m etl.main --mode {str(row['modo_carga']).lower()}",
            f"=== INICIO ETL MIVIVIENDA ({mode}) ===",
            f"[EXTRACT] Filas leidas: {row['filas_origen']:,}",
            (
                "[TRANSFORM] "
                f"Vacias: {row['filas_vacias']:,} | "
                f"Duplicadas: {row['duplicados_eliminados']:,} | "
                f"Finales: {row['filas_transformadas']:,}"
            ),
            f"[LOAD] Hechos nuevos insertados: {row['filas_insertadas']:,}",
            f"=== ETL FINALIZADO - ESTADO {row['estado']} ===",
        ]
        for line_index, line in enumerate(lines):
            color = "#7DE2A7" if "[LOAD]" in line or "ESTADO OK" in line else "#E6EDF7"
            if line.startswith(">"):
                color = "#65C7FF"
            draw.text((130, y), line, fill=color, font=font(20, mono=True))
            y += 42
        y += 38
    image.save(OUTPUT / "ejecucion_etl.png")


def draw_table(draw, origin, headers, rows, widths, row_height=58):
    x, y = origin
    total_width = sum(widths)
    draw.rounded_rectangle(
        (x, y, x + total_width, y + row_height * (len(rows) + 1)),
        radius=14,
        fill=WHITE,
        outline=LINE,
        width=2,
    )
    draw.rounded_rectangle(
        (x, y, x + total_width, y + row_height),
        radius=14,
        fill=NAVY,
    )
    draw.rectangle((x, y + row_height - 16, x + total_width, y + row_height), fill=NAVY)
    current_x = x
    for index, header in enumerate(headers):
        draw.text((current_x + 14, y + 18), header, fill=WHITE, font=font(16, bold=True))
        current_x += widths[index]
    for row_index, row in enumerate(rows):
        row_y = y + row_height * (row_index + 1)
        if row_index % 2:
            draw.rectangle((x, row_y, x + total_width, row_y + row_height), fill="#F7FAFD")
        current_x = x
        for col_index, value in enumerate(row):
            draw.text(
                (current_x + 14, row_y + 18),
                str(value),
                fill=INK,
                font=font(16),
            )
            current_x += widths[col_index]
        draw.line((x, row_y, x + total_width, row_y), fill=LINE, width=1)


def build_validations():
    engine = get_engine()
    with engine.connect() as connection:
        counts = connection.execute(
            text(
                """
                SELECT
                    (SELECT COUNT(*) FROM stg_colocaciones_mivivienda) staging,
                    (SELECT COUNT(*) FROM dim_tiempo) tiempo,
                    (SELECT COUNT(*) FROM dim_geografia) geografia,
                    (SELECT COUNT(*) FROM dim_producto) producto,
                    (SELECT COUNT(*) FROM dim_ifi) ifi,
                    (SELECT COUNT(*) FROM dim_plazo) plazo,
                    (SELECT COUNT(*) FROM fact_credito) hechos
                """
            )
        ).mappings().one()
        quality = connection.execute(
            text(
                """
                SELECT
                    COUNT(*) total,
                    COUNT(DISTINCT record_hash) hashes_unicos,
                    SUM(
                        id_tiempo IS NULL OR id_geografia IS NULL
                        OR id_producto IS NULL OR id_ifi IS NULL
                        OR id_plazo IS NULL
                    ) fk_nulas,
                    SUM(monto_credito <= 0) montos_invalidos
                FROM fact_credito
                """
            )
        ).mappings().one()

    image, draw = canvas(
        "Validaciones de integridad y calidad",
        "Resultados obtenidos directamente de las tablas del DataMart.",
    )
    headers = ["Tabla", "Registros", "Validacion"]
    rows = [
        ("stg_colocaciones", f"{counts['staging']:,}", "Carga conciliada"),
        ("dim_tiempo", f"{counts['tiempo']:,}", "Fechas unicas"),
        ("dim_geografia", f"{counts['geografia']:,}", "Ubigeos unicos"),
        ("dim_producto", f"{counts['producto']:,}", "3 productos"),
        ("dim_ifi", f"{counts['ifi']:,}", "16 instituciones"),
        ("dim_plazo", f"{counts['plazo']:,}", "Plazos clasificados"),
        ("fact_credito", f"{counts['hechos']:,}", "Grano: un credito"),
    ]
    draw_table(draw, (105, 200), headers, rows, [430, 250, 610], row_height=56)

    cards = [
        ("HASHES UNICOS", f"{quality['hashes_unicos']:,}", BLUE),
        ("CLAVES FK NULAS", f"{int(quality['fk_nulas'] or 0):,}", GREEN),
        ("MONTOS INVALIDOS", f"{int(quality['montos_invalidos'] or 0):,}", GREEN),
        ("HECHOS CARGADOS", f"{quality['total']:,}", CYAN),
    ]
    for index, (label, value, color) in enumerate(cards):
        x = 105 + index * 330
        draw.rounded_rectangle((x, 680, x + 300, 805), radius=16, fill="#F8FBFF", outline=LINE, width=2)
        draw.text((x + 20, 704), label, fill=MUTED, font=font(15, bold=True))
        draw.text((x + 20, 740), value, fill=color, font=font(34, bold=True))
    image.save(OUTPUT / "validaciones.png")


def build_tests():
    image, draw = canvas(
        "Pruebas automatizadas",
        "Pruebas unitarias del ETL y pruebas de integracion de las APIs Flask.",
    )
    draw.rounded_rectangle((105, 195, 1495, 795), radius=18, fill="#0B1322")
    lines = [
        "> python -m unittest discover -s tests -v",
        "",
        "test_transform_rejects_invalid_business_values ... ok",
        "test_transform_removes_empty_and_duplicate_rows ... ok",
        "test_dashboard_returns_kpis_and_filtered_data ... ok",
        "test_health_connects_to_database ... ok",
        "test_index_serves_dashboard ... ok",
        "",
        "----------------------------------------------------------------------",
        "Ran 5 tests",
        "",
        "OK",
    ]
    y = 235
    for line in lines:
        color = "#7DE2A7" if line.endswith("ok") or line == "OK" else "#E6EDF7"
        if line.startswith(">"):
            color = "#65C7FF"
        draw.text((135, y), line, fill=color, font=font(23, mono=True))
        y += 43
    image.save(OUTPUT / "pruebas.png")


def main():
    build_model()
    build_architecture()
    build_etl()
    build_validations()
    build_tests()
    print(f"Evidencias generadas en: {OUTPUT}")


if __name__ == "__main__":
    main()
