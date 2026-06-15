import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

let artifactTool;
try {
  artifactTool = await import("@oai/artifact-tool");
} catch {
  const bundledEntry = path.join(
    os.homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules",
    "@oai",
    "artifact-tool",
    "dist",
    "artifact_tool.mjs",
  );
  artifactTool = await import(pathToFileURL(bundledEntry).href);
}

const { Presentation, PresentationFile } = artifactTool;

const ROOT = path.resolve(import.meta.dirname, "..");
const EVIDENCE = path.join(ROOT, "docs", "evidencias_avance2");
const OUTPUT = path.join(ROOT, "docs", "AVANCE 02 - PRESENTACION.pptx");
const SCRATCH = path.join(os.tmpdir(), "mivivienda-avance2-ppt");

const C = {
  navy: "#10233F",
  navy2: "#17385F",
  blue: "#1F6FEB",
  cyan: "#23A6D5",
  mint: "#18A999",
  orange: "#FF9F43",
  red: "#E05252",
  ink: "#172033",
  muted: "#5F6B7A",
  pale: "#F4F7FB",
  paleBlue: "#EAF2FF",
  paleMint: "#E8F8F3",
  paleOrange: "#FFF2E3",
  line: "#D9E2EC",
  white: "#FFFFFF",
};

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

async function imageBytes(file) {
  const bytes = await fs.readFile(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function shape(slide, geometry, x, y, w, h, fill, line = "none", radius) {
  return slide.shapes.add({
    geometry,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: line === "none" ? 0 : 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function text(slide, value, x, y, w, h, opts = {}) {
  const box = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  box.text = value;
  box.text.style = {
    fontSize: opts.size ?? 24,
    fontFamily: opts.font ?? "Aptos",
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "middle",
    ...(opts.italic ? { italic: true } : {}),
  };
  return box;
}

function title(slide, eyebrow, heading, page, dark = false) {
  text(slide, eyebrow.toUpperCase(), 64, 35, 470, 24, {
    size: 12,
    bold: true,
    color: dark ? "#A9C6F4" : C.blue,
  });
  text(slide, heading, 64, 62, 1050, 54, {
    size: 32,
    bold: true,
    color: dark ? C.white : C.navy,
  });
  text(slide, String(page).padStart(2, "0"), 1170, 52, 46, 30, {
    size: 14,
    bold: true,
    align: "right",
    color: dark ? "#A9C6F4" : "#8795A8",
  });
  shape(slide, "rect", 64, 122, 1152, 2, dark ? "#335A88" : C.line);
}

function footer(slide, source, dark = false) {
  text(slide, source, 64, 681, 940, 18, {
    size: 9,
    color: dark ? "#B9CAE0" : "#7A8798",
  });
  text(slide, "Inteligencia de Negocios | Avance 2", 1000, 681, 216, 18, {
    size: 9,
    align: "right",
    color: dark ? "#B9CAE0" : "#7A8798",
  });
}

function card(slide, x, y, w, h, fill = C.white, border = C.line) {
  const s = shape(slide, "roundRect", x, y, w, h, fill, border, "rounded-xl");
  s.shadow = "shadow-sm";
  return s;
}

function pill(slide, label, x, y, w, fill, color = C.navy) {
  shape(slide, "roundRect", x, y, w, 30, fill, "none", "rounded-full");
  text(slide, label, x + 8, y + 2, w - 16, 26, {
    size: 12,
    bold: true,
    color,
    align: "center",
  });
}

function metric(slide, value, label, x, y, w, color = C.blue, fill = C.white) {
  card(slide, x, y, w, 112, fill);
  shape(slide, "roundRect", x + 16, y + 18, 8, 76, color, "none", "rounded-full");
  text(slide, value, x + 40, y + 15, w - 54, 48, {
    size: 28,
    bold: true,
    color: C.navy,
  });
  text(slide, label, x + 40, y + 62, w - 54, 32, {
    size: 13,
    color: C.muted,
  });
}

async function addImage(slide, filename, x, y, w, h, fit = "contain") {
  return slide.images.add({
    blob: await imageBytes(path.join(EVIDENCE, filename)),
    contentType: "image/png",
    alt: filename.replace(".png", ""),
    fit,
    position: { left: x, top: y, width: w, height: h },
  });
}

function phase(slide, number, name, detail, x, y, color) {
  card(slide, x, y, 248, 185);
  shape(slide, "ellipse", x + 18, y + 18, 40, 40, color, "none");
  text(slide, number, x + 18, y + 20, 40, 34, {
    size: 16,
    bold: true,
    color: C.white,
    align: "center",
  });
  text(slide, name, x + 72, y + 18, 154, 34, {
    size: 19,
    bold: true,
    color: C.navy,
  });
  text(slide, detail, x + 18, y + 70, 212, 94, {
    size: 14,
    color: C.muted,
  });
}

// 1. Portada
{
  const s = deck.slides.add();
  s.background.fill = C.navy;
  shape(s, "ellipse", 910, -150, 520, 520, "#173D69", "none");
  shape(s, "ellipse", 1040, 430, 300, 300, C.blue, "none");
  shape(s, "roundRect", 72, 67, 150, 34, "#214A78", "none", "rounded-full");
  text(s, "AVANCE 02", 85, 71, 124, 25, {
    size: 13,
    bold: true,
    color: "#C7DCFF",
    align: "center",
  });
  text(s, "Implementación del ETL\ny construcción del DataMart", 72, 150, 760, 170, {
    size: 48,
    bold: true,
    color: C.white,
  });
  text(s, "Colocaciones de créditos Mivivienda 2024", 75, 342, 700, 42, {
    size: 23,
    color: "#BFD5F4",
  });
  shape(s, "rect", 75, 407, 110, 5, C.orange, "none");
  text(s, "Daniel Alonso Correa Chanta\nJose Carlo Castro Franco", 75, 443, 560, 64, {
    size: 18,
    bold: true,
    color: C.white,
  });
  text(s, "Universidad Tecnológica del Perú\nInteligencia de Negocios | Docente: Oscar Eduardo Balcazar Chumacero\nPiura, Perú · 2026", 75, 540, 690, 82, {
    size: 14,
    color: "#B9CAE0",
  });
  text(s, "PYTHON", 962, 188, 170, 44, { size: 18, bold: true, color: C.white, align: "center" });
  pill(s, "MYSQL", 962, 250, 170, "#1B5A82", C.white);
  pill(s, "FLASK + WEB", 962, 299, 170, "#168A84", C.white);
}

// 2. Objetivo y transición
{
  const s = deck.slides.add();
  s.background.fill = C.pale;
  title(s, "Contexto", "Del diseño conceptual a una solución funcionando", 2);
  text(s, "El Avance 1 definió qué analizar. El Avance 2 demuestra que el flujo completo ya opera.", 64, 142, 1110, 42, {
    size: 19,
    color: C.muted,
  });
  phase(s, "01", "Origen", "Archivo CSV público con una sola tabla y 14 columnas.", 64, 224, C.cyan);
  phase(s, "02", "ETL", "Python extrae, limpia, convierte, deduplica e integra.", 326, 224, C.blue);
  phase(s, "03", "DataMart", "MySQL implementa staging, 5 dimensiones y 1 tabla de hechos.", 588, 224, C.mint);
  phase(s, "04", "Consumo", "Flask entrega APIs; HTML, CSS y JavaScript presentan el dashboard.", 850, 224, C.orange);
  shape(s, "rightArrow", 278, 292, 42, 38, C.line, "none");
  shape(s, "rightArrow", 540, 292, 42, 38, C.line, "none");
  shape(s, "rightArrow", 802, 292, 42, 38, C.line, "none");
  card(s, 64, 455, 1034, 146, C.navy, C.navy);
  text(s, "Objetivo del avance", 92, 478, 260, 30, { size: 16, bold: true, color: "#9FC3F7" });
  text(s, "Construir físicamente el DataMart y comprobar su integridad, calidad, rendimiento y utilidad analítica.", 92, 518, 910, 52, {
    size: 25,
    bold: true,
    color: C.white,
  });
  pill(s, "SOLUCIÓN END-TO-END", 1080, 500, 145, C.paleBlue, C.blue);
  footer(s, "Fuente: elaboración propia a partir del Avance 1 y los entregables implementados.");
}

// 3. Arquitectura
{
  const s = deck.slides.add();
  s.background.fill = C.pale;
  title(s, "Arquitectura", "Una sola solución: datos, backend y dashboard web", 3);
  card(s, 64, 148, 830, 490);
  await addImage(s, "arquitectura.png", 88, 170, 782, 440, "contain");
  card(s, 920, 148, 296, 490, C.navy, C.navy);
  text(s, "Flujo técnico", 946, 174, 230, 34, { size: 20, bold: true, color: C.white });
  const steps = [
    ["1", "CSV", "Fuente origen"],
    ["2", "Python ETL", "Procesamiento"],
    ["3", "MySQL", "DataMart"],
    ["4", "Flask API", "Backend"],
    ["5", "HTML + JS", "Visualización"],
  ];
  steps.forEach(([n, a, b], i) => {
    const yy = 230 + i * 72;
    shape(s, "ellipse", 946, yy, 36, 36, i === 4 ? C.orange : C.blue, "none");
    text(s, n, 946, yy + 2, 36, 30, { size: 14, bold: true, color: C.white, align: "center" });
    text(s, a, 996, yy - 2, 180, 24, { size: 15, bold: true, color: C.white });
    text(s, b, 996, yy + 23, 180, 20, { size: 11, color: "#B9CAE0" });
  });
  text(s, "No se requiere Angular ni un backend separado: Flask sirve la API y también los archivos web.", 946, 590, 238, 38, {
    size: 12,
    color: "#D8E4F3",
  });
  footer(s, "Evidencia: arquitectura implementada en el repositorio.");
}

// 4. Modelo físico
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "DataMart", "Modelo estrella implementado en MySQL", 4);
  card(s, 64, 148, 790, 486, C.pale);
  await addImage(s, "modelo_estrella.png", 84, 168, 750, 446, "contain");
  const dims = [
    ["DIM_TIEMPO", "204 registros", C.blue],
    ["DIM_GEOGRAFÍA", "222 registros", C.cyan],
    ["DIM_PRODUCTO", "3 registros", C.mint],
    ["DIM_IFI", "16 registros", C.orange],
    ["DIM_PLAZO", "121 registros", "#8C6FE8"],
  ];
  dims.forEach(([name, count, color], i) => {
    card(s, 886, 148 + i * 78, 330, 64, C.white);
    shape(s, "roundRect", 900, 163 + i * 78, 8, 34, color, "none", "rounded-full");
    text(s, name, 922, 154 + i * 78, 174, 25, { size: 14, bold: true, color: C.navy });
    text(s, count, 922, 179 + i * 78, 174, 18, { size: 11, color: C.muted });
  });
  card(s, 886, 554, 330, 80, C.navy, C.navy);
  text(s, "FACT_CRÉDITO", 906, 566, 190, 24, { size: 15, bold: true, color: C.white });
  text(s, "9,336 créditos · grano: 1 desembolso", 906, 592, 280, 22, { size: 12, color: "#C5D7ED" });
  footer(s, "PK, FK, NOT NULL, UNIQUE, CHECK e índices implementados mediante scripts SQL.");
}

// 5. ETL
{
  const s = deck.slides.add();
  s.background.fill = C.pale;
  title(s, "Proceso ETL", "De 13,507 filas de origen a 9,336 hechos válidos", 5);
  const journey = [
    ["13,507", "filas leídas", C.blue],
    ["−4,160", "filas vacías", C.red],
    ["−11", "duplicados", C.orange],
    ["9,336", "filas cargadas", C.mint],
  ];
  journey.forEach(([v, l, color], i) => {
    const x = 64 + i * 288;
    card(s, x, 154, 254, 112, C.white);
    text(s, v, x + 18, 168, 218, 44, { size: 30, bold: true, color });
    text(s, l, x + 18, 214, 218, 25, { size: 13, color: C.muted });
    if (i < 3) shape(s, "rightArrow", x + 258, 190, 24, 26, C.line, "none");
  });
  phase(s, "E", "Extract", "Lectura del CSV con separador ; y validación de las 14 columnas.", 64, 310, C.cyan);
  phase(s, "T", "Transform", "Normalización, fechas, tipos numéricos, reglas de calidad y SHA-256.", 326, 310, C.blue);
  phase(s, "L", "Load", "Staging → dimensiones → hechos, respetando claves y dependencias.", 588, 310, C.mint);
  card(s, 850, 310, 366, 185, C.navy, C.navy);
  text(s, "Clave técnica", 874, 330, 280, 30, { size: 18, bold: true, color: C.white });
  text(s, "record_hash = SHA-256\nsobre los 14 campos normalizados", 874, 370, 300, 58, { size: 18, bold: true, color: "#BFD5F4" });
  text(s, "Permite deduplicación e incrementalidad aunque la fuente no tenga ID de crédito.", 874, 438, 302, 40, {
    size: 12,
    color: "#D1DEEF",
  });
  pill(s, "0 FILAS INVÁLIDAS", 64, 535, 186, C.paleMint, C.mint);
  pill(s, "FECHAS → DATE", 264, 535, 170, C.paleBlue, C.blue);
  pill(s, "UBIGEO → CHAR(6)", 448, 535, 190, "#EAF7FB", C.cyan);
  pill(s, "TEXTOS NORMALIZADOS", 652, 535, 224, C.paleOrange, C.orange);
  footer(s, "Resultados obtenidos con el dataset Colocaciones de crédito Mivivienda 2024.");
}

// 6. Código Python
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Código", "Responsabilidad de los módulos Python", 6);
  const modules = [
    ["conexion.py", "Configuración", ".env, rutas y motores SQLAlchemy", C.cyan],
    ["setup_database.py", "Implementación", "Crea la base y ejecuta los scripts SQL", C.orange],
    ["extract.py", "Extract", "Lee el CSV y valida su estructura", C.blue],
    ["transform.py", "Transform", "Limpia, convierte, valida y genera el hash", "#8C6FE8"],
    ["load.py", "Load", "Carga staging, dimensiones y hechos", C.mint],
    ["main.py", "Orquestación", "Ejecuta initial o incremental y registra métricas", C.navy2],
  ];
  modules.forEach(([file, role, desc, color], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 64 + col * 384;
    const y = 158 + row * 218;
    card(s, x, y, 352, 188, C.pale);
    pill(s, role.toUpperCase(), x + 20, y + 18, 156, color, C.white);
    text(s, file, x + 20, y + 61, 306, 32, { size: 19, bold: true, color: C.navy });
    text(s, desc, x + 20, y + 103, 306, 53, { size: 14, color: C.muted });
  });
  card(s, 64, 606, 1120, 48, C.navy, C.navy);
  text(s, "Equivalencia con Spring Boot: app.py ≈ Controller · DashboardService ≈ Service/Repository · tablas SQL ≈ entidades persistidas", 82, 614, 1084, 30, {
    size: 14,
    bold: true,
    color: C.white,
    align: "center",
  });
  footer(s, "El diseño separa responsabilidades para facilitar pruebas, mantenimiento y explicación.");
}

// 7. Cargas
{
  const s = deck.slides.add();
  s.background.fill = C.pale;
  title(s, "Carga de datos", "Carga inicial e incremental comprobadas", 7);
  card(s, 64, 150, 760, 470);
  await addImage(s, "ejecucion_etl.png", 82, 168, 724, 434, "contain");
  metric(s, "9,336", "insertados en la carga inicial", 856, 150, 360, C.mint, C.white);
  metric(s, "0", "nuevos registros al repetir incremental", 856, 282, 360, C.blue, C.white);
  card(s, 856, 414, 360, 206, C.navy, C.navy);
  text(s, "¿Qué demuestra?", 882, 434, 300, 30, { size: 18, bold: true, color: C.white });
  text(s, "• La carga inicial reconstruye el DataMart.\n• La incremental conserva lo existente.\n• El hash evita volver a insertar el mismo crédito.", 882, 479, 300, 105, {
    size: 14,
    color: "#D2DEEE",
  });
  footer(s, "Evidencia de ejecución: modos initial e incremental.");
}

// 8. Validación y pruebas
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Calidad", "Integridad, consistencia y rendimiento verificados", 8);
  card(s, 64, 150, 550, 310, C.pale);
  await addImage(s, "validaciones.png", 82, 168, 514, 274, "contain");
  card(s, 638, 150, 578, 310, C.pale);
  await addImage(s, "pruebas.png", 656, 168, 542, 274, "contain");
  const checks = [
    ["9,336", "hechos = hashes únicos", C.mint],
    ["0", "claves foráneas nulas", C.blue],
    ["0", "montos inválidos", C.orange],
    ["5/5", "pruebas automatizadas aprobadas", "#8C6FE8"],
  ];
  checks.forEach(([v, l, color], i) => metric(s, v, l, 64 + i * 288, 488, 254, color, C.pale));
  text(s, "20 consultas al DashboardService: 186.91 ms promedio · 181.67 ms mediana", 64, 624, 1152, 28, {
    size: 15,
    bold: true,
    color: C.navy,
    align: "center",
  });
  footer(s, "Pruebas: integridad, consistencia, calidad de información y rendimiento.");
}

// 9. KPIs
{
  const s = deck.slides.add();
  s.background.fill = C.pale;
  title(s, "Resultados", "Indicadores que ya responde el DataMart", 9);
  metric(s, "9,336", "créditos colocados", 64, 150, 262, C.blue);
  metric(s, "S/ 1,695.9 M", "monto total colocado", 346, 150, 300, C.mint);
  metric(s, "S/ 181,649.95", "monto promedio", 666, 150, 270, C.orange);
  metric(s, "10.03%", "tasa promedio", 956, 150, 260, "#8C6FE8");
  card(s, 64, 294, 730, 328, C.white);
  text(s, "Monto colocado por producto", 88, 316, 450, 28, { size: 18, bold: true, color: C.navy });
  const products = [
    ["NMIV", 1557.1, C.blue],
    ["S-CRC", 121.3, C.cyan],
    ["FCTP", 17.5, C.orange],
  ];
  products.forEach(([label, value, color], i) => {
    const y = 372 + i * 74;
    text(s, label, 88, y, 82, 26, { size: 14, bold: true, color: C.navy });
    shape(s, "roundRect", 178, y + 2, 520, 22, "#E8EEF5", "none", "rounded-full");
    shape(s, "roundRect", 178, y + 2, Math.max(18, (value / 1557.1) * 520), 22, color, "none", "rounded-full");
    text(s, `S/ ${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} M`, 566, y + 30, 132, 20, {
      size: 11,
      bold: true,
      color: C.muted,
      align: "right",
    });
  });
  card(s, 818, 294, 398, 328, C.navy, C.navy);
  text(s, "Hallazgos clave", 844, 318, 330, 30, { size: 19, bold: true, color: C.white });
  text(s, "SEPTIEMBRE", 844, 374, 160, 20, { size: 11, bold: true, color: "#91BDF8" });
  text(s, "S/ 227.5 M", 844, 396, 300, 35, { size: 27, bold: true, color: C.white });
  text(s, "mes de mayor colocación", 844, 433, 300, 20, { size: 12, color: "#C8D7E9" });
  shape(s, "rect", 844, 474, 324, 1, "#395C84", "none");
  text(s, "LIMA", 844, 497, 160, 20, { size: 11, bold: true, color: "#91BDF8" });
  text(s, "5,789 créditos", 844, 520, 300, 32, { size: 23, bold: true, color: C.white });
  text(s, "S/ 1,236.8 M colocados", 844, 557, 300, 22, { size: 12, color: "#C8D7E9" });
  footer(s, "KPIs calculados sobre fact_credito y las dimensiones del DataMart.");
}

// 10. Web y APIs
{
  const s = deck.slides.add();
  s.background.fill = C.white;
  title(s, "Aplicación web", "Flask conecta MySQL con HTML, CSS y JavaScript", 10);
  const items = [
    ["NAVEGADOR", "HTML + CSS + JS\nChart.js", C.orange],
    ["FLASK", "Rutas web y API\napp.py", C.blue],
    ["SERVICIO", "Consultas KPI\nDashboardService", C.cyan],
    ["MYSQL", "Vista analítica\nvw_creditos_analitico", C.mint],
  ];
  items.forEach(([name, detail, color], i) => {
    const x = 64 + i * 288;
    card(s, x, 176, 254, 154, C.pale);
    shape(s, "roundRect", x + 18, 194, 8, 48, color, "none", "rounded-full");
    text(s, name, x + 42, 192, 180, 26, { size: 15, bold: true, color: C.navy });
    text(s, detail, x + 42, 226, 180, 55, { size: 13, color: C.muted });
    if (i < 3) shape(s, "rightArrow", x + 258, 232, 24, 28, C.line, "none");
  });
  card(s, 64, 382, 550, 224, C.navy, C.navy);
  text(s, "Rutas principales", 90, 405, 470, 28, { size: 18, bold: true, color: C.white });
  const routes = [
    ["/", "Interfaz del dashboard"],
    ["/api/health", "Estado de la aplicación"],
    ["/api/filtros", "Opciones para los filtros"],
    ["/api/dashboard", "KPIs y series analíticas"],
  ];
  routes.forEach(([route, desc], i) => {
    const yy = 449 + i * 34;
    text(s, route, 90, yy, 150, 22, { size: 13, bold: true, color: "#8FC0FF" });
    text(s, desc, 245, yy, 320, 22, { size: 13, color: "#D4E1F0" });
  });
  card(s, 640, 382, 576, 224, C.paleBlue, "#C7DAF5");
  text(s, "Comparación con Spring Boot", 668, 405, 500, 30, { size: 18, bold: true, color: C.navy });
  text(s, "Controller", 668, 454, 120, 24, { size: 14, bold: true, color: C.blue });
  text(s, "→ web/app.py", 800, 454, 300, 24, { size: 14, color: C.ink });
  text(s, "Service / Repository", 668, 492, 170, 24, { size: 14, bold: true, color: C.blue });
  text(s, "→ DashboardService", 850, 492, 300, 24, { size: 14, color: C.ink });
  text(s, "Entity / JPA", 668, 530, 140, 24, { size: 14, bold: true, color: C.blue });
  text(s, "→ tablas, vistas y SQL", 820, 530, 300, 24, { size: 14, color: C.ink });
  text(s, "Flask funciona como backend y servidor web dentro del mismo proyecto.", 668, 570, 490, 24, {
    size: 13,
    bold: true,
    color: C.navy,
  });
  footer(s, "Arquitectura web implementada sin Angular ni frontend separado.");
}

// 11. Dashboard
{
  const s = deck.slides.add();
  s.background.fill = C.pale;
  title(s, "Dashboard", "Consumo interactivo de los datos del DataMart", 11);
  card(s, 64, 146, 1152, 486, C.white);
  await addImage(s, "dashboard.png", 82, 164, 1116, 450, "contain");
  pill(s, "FILTROS", 84, 602, 92, C.paleBlue, C.blue);
  pill(s, "KPIs", 188, 602, 82, C.paleMint, C.mint);
  pill(s, "GRÁFICOS", 282, 602, 108, C.paleOrange, C.orange);
  pill(s, "API JSON", 402, 602, 104, "#EEEAFB", "#7559C7");
  text(s, "Demo sugerida: cambiar producto o departamento y mostrar cómo se recalculan los indicadores.", 540, 603, 642, 28, {
    size: 13,
    bold: true,
    color: C.navy,
    align: "right",
  });
  footer(s, "Captura real del dashboard web ejecutándose sobre Flask y MySQL.");
}

// 12. Cumplimiento y cierre
{
  const s = deck.slides.add();
  s.background.fill = C.navy;
  title(s, "Cierre", "El Avance 2 quedó implementado y verificable", 12, true);
  const done = [
    "Base de datos implementada",
    "Scripts SQL y restricciones",
    "ETL funcional en Python",
    "Carga inicial e incremental",
    "Tabla de hechos y dimensiones",
    "Validaciones y pruebas",
    "Dashboard web con filtros",
    "Evidencias técnicas",
  ];
  done.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 64 + col * 576;
    const y = 160 + row * 76;
    card(s, x, y, 540, 58, "#17385F", "#335A88");
    shape(s, "ellipse", x + 18, y + 14, 30, 30, C.mint, "none");
    text(s, "✓", x + 18, y + 14, 30, 27, { size: 16, bold: true, color: C.white, align: "center" });
    text(s, item, x + 62, y + 11, 450, 34, { size: 15, bold: true, color: C.white });
  });
  card(s, 64, 494, 1116, 118, C.white, C.white);
  text(s, "Conclusión", 90, 513, 180, 26, { size: 16, bold: true, color: C.blue });
  text(s, "Una fuente de una sola tabla sí puede convertirse en una solución de Inteligencia de Negocios completa cuando se aplican modelado dimensional, ETL, calidad de datos y una capa de consumo.", 90, 547, 1040, 50, {
    size: 20,
    bold: true,
    color: C.navy,
  });
  text(s, "Gracias", 64, 642, 280, 28, { size: 18, bold: true, color: C.white });
  text(s, "Demostración: ETL → MySQL → dashboard", 730, 642, 450, 28, { size: 14, color: "#B9CAE0", align: "right" });
  footer(s, "Fuente general: elaboración propia con datos de Fondo MIVIVIENDA S.A. (2025).", true);
}

async function writeBlob(file, blob) {
  await fs.writeFile(file, new Uint8Array(await blob.arrayBuffer()));
}

await fs.mkdir(SCRATCH, { recursive: true });
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });

await fs.writeFile(
  path.join(SCRATCH, "source-notes.txt"),
  [
    "Presentación Avance 2 - DataMart Mivivienda",
    "Fuente principal: documentos y evidencias del repositorio.",
    "Dataset: Fondo MIVIVIENDA S.A. (2025), Colocaciones de créditos Mivivienda 2024.",
    "Métricas verificadas: 13,507 origen; 4,160 vacías; 11 duplicadas; 9,336 hechos.",
  ].join("\n"),
);

for (const [i, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(i + 1).padStart(2, "0")}`;
  await writeBlob(path.join(SCRATCH, `${stem}.png`), await deck.export({ slide, format: "png", scale: 1 }));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(SCRATCH, `${stem}.layout.json`), await layout.text());
}

await writeBlob(
  path.join(SCRATCH, "deck-montage.webp"),
  await deck.export({ format: "webp", montage: true, scale: 1 }),
);

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(OUTPUT);

console.log(JSON.stringify({ output: OUTPUT, scratch: SCRATCH, slides: deck.slides.items.length }, null, 2));
