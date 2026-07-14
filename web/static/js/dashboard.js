const charts = {};
let peruMap = null;
let peruLayer = null;
let mapTiles = null;
let selectedDepartmentLayer = null;
let latestDashboard = null;
let latestMapRows = [];
let detailPage = 1;
const DETAIL_PAGE_SIZE = 50;
const FILTER_IDS = ["anio", "departamento", "producto", "tipo_ifi"];
const FILTER_STORAGE_KEY = "mivivienda-bi-filters";
const MAP_BASE_STORAGE_KEY = "mivivienda-map-base";
const MODULE = document.body?.dataset?.module || "resumen";
let mapBaseMode = localStorage.getItem(MAP_BASE_STORAGE_KEY) || "plano";

const currency = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 0,
});
const percent = new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
});

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    bindEvents();
    bindCodeHelp();
    restoreFilters();
    await checkHealth();
    await loadFilters();
    restoreFilters();
    await loadDashboard();
});

function cssVar(name) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
}

function themeColors() {
    return {
        primary: cssVar("--chart-1"),
        copper: cssVar("--chart-2"),
        mint: cssVar("--chart-3"),
        sky: cssVar("--chart-4"),
        amber: cssVar("--chart-5"),
        coral: cssVar("--chart-6"),
        grid: cssVar("--chart-grid"),
        text: cssVar("--chart-text"),
        surface: cssVar("--surface") || "#12182a",
        soft: [
            cssVar("--chart-1"),
            cssVar("--chart-2"),
            cssVar("--chart-3"),
            cssVar("--chart-4"),
            cssVar("--chart-5"),
            cssVar("--chart-6"),
        ],
        map: [
            cssVar("--map-empty"),
            cssVar("--map-1"),
            cssVar("--map-2"),
            cssVar("--map-3"),
            cssVar("--map-4"),
            cssVar("--map-5"),
        ],
    };
}

function initTheme() {
    syncThemeLabel();
    document.querySelector("#theme-toggle")?.addEventListener("click", async () => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("mivivienda-theme", next);
        syncThemeLabel();
        if (latestDashboard) {
            updateCharts(latestDashboard);
        }
        if (latestMapRows.length) {
            await updateMap(latestMapRows, true);
        }
    });
}

function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
}

function syncThemeLabel() {
    const label = document.querySelector("#theme-toggle-label");
    if (label) {
        label.textContent = currentTheme() === "dark" ? "Modo claro" : "Modo oscuro";
    }
}

function setText(id, value) {
    const el = document.querySelector(`#${id}`);
    if (el) {
        el.textContent = value;
    }
}

function bindEvents() {
    document
        .querySelector("#apply-filters")
        ?.addEventListener("click", () => {
            detailPage = 1;
            persistFilters();
            loadDashboard();
        });

    document.querySelector("#clear-filters")?.addEventListener("click", () => {
        FILTER_IDS.forEach((id) => {
            const el = document.querySelector(`#${id}`);
            if (el) {
                el.value = "";
            }
        });
        detailPage = 1;
        persistFilters();
        loadDashboard();
    });

    FILTER_IDS.forEach((id) => {
        document.querySelector(`#${id}`)?.addEventListener("change", () => {
            detailPage = 1;
            persistFilters();
            loadDashboard();
        });
    });

    document.querySelector("#detalle-prev")?.addEventListener("click", () => {
        if (detailPage > 1) {
            detailPage -= 1;
            loadDashboard({ preserveScroll: true });
        }
    });

    document.querySelector("#detalle-next")?.addEventListener("click", () => {
        const meta = latestDashboard?.detalle_meta;
        if (meta && detailPage < meta.total_pages) {
            detailPage += 1;
            loadDashboard({ preserveScroll: true });
        }
    });

    bindExportMenu();
    bindMapBasemapToggle();
}

function bindCodeHelp() {
    document.querySelectorAll(".code-help").forEach((help) => {
        const trigger = help.querySelector(".code-help-trigger");
        const panel = help.querySelector(".code-help-panel");
        if (!trigger || !panel) {
            return;
        }

        trigger.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const willOpen = panel.hasAttribute("hidden");
            closeAllCodeHelp();
            if (willOpen) {
                panel.removeAttribute("hidden");
                trigger.setAttribute("aria-expanded", "true");
            }
        });

        panel.addEventListener("click", (event) => event.stopPropagation());
    });

    document.addEventListener("click", () => closeAllCodeHelp());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAllCodeHelp();
        }
    });
}

function closeAllCodeHelp() {
    document.querySelectorAll(".code-help").forEach((help) => {
        help.querySelector(".code-help-panel")?.setAttribute("hidden", "");
        help.querySelector(".code-help-trigger")?.setAttribute("aria-expanded", "false");
    });
}

function persistFilters() {
    const values = {};
    FILTER_IDS.forEach((id) => {
        const value = document.querySelector(`#${id}`)?.value || "";
        if (value) {
            values[id] = value;
        }
    });
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(values));
}

function restoreFilters() {
    try {
        const raw = localStorage.getItem(FILTER_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const values = JSON.parse(raw);
        FILTER_IDS.forEach((id) => {
            const el = document.querySelector(`#${id}`);
            if (el && values[id]) {
                el.value = values[id];
            }
        });
    } catch (_error) {
        localStorage.removeItem(FILTER_STORAGE_KEY);
    }
}

function bindExportMenu() {
    const toggle = document.querySelector("#export-toggle");
    const menu = document.querySelector("#export-options");
    if (!toggle || !menu) {
        return;
    }

    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = menu.hasAttribute("hidden");
        menu.toggleAttribute("hidden", !open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", () => {
        menu.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
    });

    menu.addEventListener("click", (event) => event.stopPropagation());

    document.querySelector("#export-excel")?.addEventListener("click", () => {
        downloadExport("xlsx");
        menu.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
    });

    document.querySelector("#export-csv")?.addEventListener("click", () => {
        downloadExport("csv");
        menu.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
    });
}

function currentFilterParams() {
    const params = new URLSearchParams();
    FILTER_IDS.forEach((id) => {
        const value = document.querySelector(`#${id}`)?.value;
        if (value) {
            params.set(id, value);
        }
    });
    return params;
}

function downloadExport(formato) {
    const params = currentFilterParams();
    params.set("formato", formato);
    const link = document.createElement("a");
    link.href = `/api/export?${params.toString()}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function updateMeta(meta = {}) {
    const periodo = meta.periodo || "Sin datos";
    const total = integer.format(meta.total_creditos || 0);
    setText("meta-fuente", meta.fuente || "DataMart Mivivienda");
    setText("meta-periodo", `${periodo} · ${total} creditos`);
    setText("period-badge", periodo);

    const anioSelect = document.querySelector("#anio");
    if (anioSelect && meta.anios?.length) {
        const current = anioSelect.value;
        const placeholder = anioSelect.querySelector("option[value='']");
        if (placeholder) {
            const min = meta.anio_min;
            const max = meta.anio_max;
            placeholder.textContent = min && max && min !== max
                ? `Todos (${min}-${max})`
                : "Todos";
        }
        if (current && !meta.anios.map(String).includes(current)) {
            anioSelect.value = "";
        }
    }
}

async function checkHealth() {
    try {
        const response = await fetch("/api/health");
        if (!response.ok) {
            throw new Error("MySQL no disponible");
        }
        const payload = await response.json();
        document.querySelector("#status-dot")?.classList.add("connected");
        setText("status-text", "MySQL conectado");
        if (payload.meta) {
            updateMeta(payload.meta);
        }
    } catch (error) {
        setText("status-text", "Sin conexion");
        showError(error.message);
    }
}

async function loadFilters() {
    try {
        const response = await fetch("/api/filtros");
        if (!response.ok) {
            throw new Error("No se pudieron cargar los filtros");
        }
        const data = await response.json();
        populateSelect("anio", data.anios || []);
        populateSelect("departamento", data.departamentos);
        populateSelect("producto", data.productos);
        populateSelect("tipo_ifi", data.tipos_ifi);
        if (data.meta) {
            updateMeta(data.meta);
        }
    } catch (error) {
        showError(error.message);
    }
}

function populateSelect(id, values) {
    const select = document.querySelector(`#${id}`);
    if (!select) {
        return;
    }
    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

async function loadDashboard(options = {}) {
    setLoading(true);
    try {
        const params = currentFilterParams();
        params.set("page", String(detailPage));
        params.set("page_size", String(DETAIL_PAGE_SIZE));

        const response = await fetch(`/api/dashboard?${params.toString()}`);
        if (!response.ok) {
            throw new Error("No se pudo consultar el dashboard");
        }
        const data = await response.json();
        latestDashboard = data;
        latestMapRows = data.mapa || [];
        if (data.detalle_meta?.page) {
            detailPage = data.detalle_meta.page;
        }
        if (data.meta) {
            updateMeta(data.meta);
        }
        if (data.filtros_aplicados?.anio) {
            setText("period-badge", String(data.filtros_aplicados.anio));
        }
        updateKpis(data.kpis);
        updateCharts(data);
        await updateMap(latestMapRows);
        updateTable(data.detalle, data.detalle_meta);
        if (options.preserveScroll) {
            document.querySelector("#detalle")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

function updateKpis(kpis) {
    if (!kpis) {
        return;
    }
    setText("kpi-cantidad", integer.format(kpis.cantidad));
    setText("kpi-total", currency.format(kpis.monto_total));
    setText("kpi-promedio", currency.format(kpis.monto_promedio));
    setText("kpi-tasa", `${Number(kpis.tasa_promedio).toFixed(2)}%`);

    const growthEl = document.querySelector("#kpi-crecimiento");
    const growthNote = document.querySelector("#kpi-crecimiento-note");
    if (growthEl && growthNote) {
        growthEl.classList.remove("positive", "negative");

        if (kpis.crecimiento_mensual_pct === null || kpis.crecimiento_mensual_pct === undefined) {
            growthEl.textContent = "N/D";
            growthNote.textContent = "Sin periodo comparable";
        } else {
            growthEl.textContent = `${percent.format(kpis.crecimiento_mensual_pct)}%`;
            growthEl.classList.add(
                kpis.crecimiento_mensual_pct >= 0 ? "positive" : "negative",
            );
            growthNote.textContent =
                `${kpis.mes_actual || "Actual"} vs ${kpis.mes_anterior || "anterior"}`;
        }
    }

    setText("kpi-mejor-mes", kpis.mejor_mes || "N/D");
    setText(
        "kpi-mejor-mes-note",
        kpis.mejor_mes_monto
            ? currency.format(kpis.mejor_mes_monto)
            : "Mayor colocacion",
    );

    const nmiv = `${Number(kpis.participacion_nmiv_pct || 0).toFixed(1)}%`;
    const lima = `${Number(kpis.concentracion_lima_pct || 0).toFixed(1)}%`;
    setText("kpi-nmiv", nmiv);
    setText("kpi-lima", lima);
    setText("kpi-nmiv-footer", nmiv);
    setText("kpi-lima-footer", lima);
}

function updateCharts(data) {
    if (typeof Chart === "undefined") {
        return;
    }
    const colors = themeColors();
    renderAnnualChart(data.anual || [], colors);
    renderMonthlyChart(data.mensual, colors);
    renderQuarterChart(data.trimestres, colors);
    renderConcentrationChart(data.concentracion, colors);
    renderProductChart(data.productos, colors);
    renderTermChart(data.plazos, colors);
    renderRateChart(data.tasas, colors);
    renderHorizontalBar(
        "department",
        "department-chart",
        data.departamentos,
        colors.sky,
        colors,
    );
    renderHorizontalBar(
        "ifi",
        "ifi-chart",
        data.instituciones,
        colors.mint,
        colors,
    );
}

function baseChartOptions(colors, extra = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        color: colors.text,
        ...extra,
    };
}

function renderAnnualChart(rows, colors) {
    renderChart("annual", "annual-chart", {
        type: "bar",
        data: {
            labels: rows.map((item) => String(item.anio)),
            datasets: [
                {
                    type: "bar",
                    label: "Monto colocado",
                    data: rows.map((item) => item.monto_total),
                    backgroundColor: colors.primary,
                    borderRadius: 8,
                    yAxisID: "y",
                    order: 2,
                },
                {
                    type: "line",
                    label: "Cantidad de creditos",
                    data: rows.map((item) => item.cantidad),
                    borderColor: colors.coral,
                    backgroundColor: colors.coral,
                    borderWidth: 2.5,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: colors.surface,
                    pointBorderColor: colors.coral,
                    pointBorderWidth: 2,
                    yAxisID: "y1",
                    order: 1,
                },
            ],
        },
        options: baseChartOptions(colors, {
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "top",
                    labels: { usePointStyle: true, boxWidth: 8, color: colors.text },
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            if (context.dataset.yAxisID === "y1") {
                                return `${context.dataset.label}: ${integer.format(context.raw)}`;
                            }
                            return `${context.dataset.label}: ${currency.format(context.raw)}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text },
                },
                y: {
                    position: "left",
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: (value) => compactMoney(value),
                    },
                },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: colors.text,
                        callback: (value) => integer.format(value),
                    },
                },
            },
        }),
    });
}

function renderMonthlyChart(rows, colors) {
    const maxMonto = Math.max(...rows.map((item) => item.monto_total || 0), 1);
    const highlightIndex = rows.findIndex(
        (item) => item.monto_total === maxMonto,
    );
    const labels = rows.map((item) => item.periodo || item.mes_nombre);

    renderChart("monthly", "monthly-chart", {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    type: "bar",
                    label: "Monto colocado",
                    data: rows.map((item) => item.monto_total),
                    backgroundColor: rows.map((_, index) =>
                        index === highlightIndex ? colors.copper : colors.primary,
                    ),
                    borderRadius: 6,
                    yAxisID: "y",
                    order: 2,
                },
                {
                    type: "line",
                    label: "Cantidad de creditos",
                    data: rows.map((item) => item.cantidad),
                    borderColor: colors.coral,
                    backgroundColor: colors.coral,
                    borderWidth: 2,
                    tension: 0.25,
                    pointRadius: labels.length > 24 ? 0 : 2,
                    pointBackgroundColor: colors.surface,
                    pointBorderColor: colors.coral,
                    pointBorderWidth: 2,
                    yAxisID: "y1",
                    order: 1,
                },
            ],
        },
        options: baseChartOptions(colors, {
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "top",
                    labels: { usePointStyle: true, boxWidth: 8, color: colors.text },
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            if (context.dataset.yAxisID === "y1") {
                                return `${context.dataset.label}: ${integer.format(context.raw)}`;
                            }
                            return `${context.dataset.label}: ${currency.format(context.raw)}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: colors.text,
                        maxRotation: 60,
                        minRotation: labels.length > 18 ? 45 : 0,
                        autoSkip: true,
                        maxTicksLimit: 18,
                    },
                },
                y: {
                    position: "left",
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: (value) => compactMoney(value),
                    },
                },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: colors.text,
                        callback: (value) => integer.format(value),
                    },
                },
            },
        }),
    });
}

function renderQuarterChart(rows, colors) {
    const maxMonto = Math.max(...rows.map((item) => item.monto_total || 0), 1);
    const labels = rows.map((item) =>
        item.anio ? `${item.anio}-T${item.trimestre}` : `T${item.trimestre}`,
    );

    renderChart("quarter", "quarter-chart", {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Monto total",
                data: rows.map((item) => item.monto_total),
                backgroundColor: rows.map((item) =>
                    item.monto_total === maxMonto ? colors.copper : colors.primary,
                ),
                borderRadius: 8,
                barPercentage: 0.55,
            }],
        },
        options: baseChartOptions(colors, {
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => currency.format(context.raw),
                        afterLabel: (context) => {
                            const row = rows[context.dataIndex];
                            return `${integer.format(row.cantidad)} creditos`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: colors.text,
                        maxRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 16,
                    },
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: (value) => compactMoney(value),
                    },
                },
            },
        }),
    });
}

function renderConcentrationChart(rows, colors) {
    renderChart("concentration", "concentration-chart", {
        type: "doughnut",
        data: {
            labels: rows.map((item) => item.nombre),
            datasets: [{
                data: rows.map((item) => item.monto_total),
                backgroundColor: [colors.primary, colors.sky],
                borderColor: colors.surface,
                borderWidth: 3,
            }],
        },
        options: baseChartOptions(colors, {
            cutout: "68%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, boxWidth: 8, color: colors.text },
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const total = context.dataset.data.reduce(
                                (sum, value) => sum + value,
                                0,
                            );
                            const share = total
                                ? ((context.raw / total) * 100).toFixed(1)
                                : 0;
                            return `${context.label}: ${currency.format(context.raw)} (${share}%)`;
                        },
                    },
                },
            },
        }),
    });
}

function renderProductChart(rows, colors) {
    renderChart("product", "product-chart", {
        type: "bar",
        data: {
            labels: rows.map((item) => item.nombre),
            datasets: [
                {
                    label: "Monto total",
                    data: rows.map((item) => item.monto_total),
                    backgroundColor: colors.primary,
                    borderRadius: 8,
                    yAxisID: "y",
                },
                {
                    label: "Ticket promedio",
                    data: rows.map((item) => item.monto_promedio),
                    backgroundColor: colors.mint,
                    borderRadius: 8,
                    yAxisID: "y1",
                },
            ],
        },
        options: baseChartOptions(colors, {
            plugins: {
                legend: {
                    position: "top",
                    labels: { usePointStyle: true, boxWidth: 8, color: colors.text },
                },
                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `${context.dataset.label}: ${currency.format(context.raw)}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text },
                },
                y: {
                    position: "left",
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: (value) => compactMoney(value),
                    },
                },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: colors.text,
                        callback: (value) => compactMoney(value),
                    },
                },
            },
        }),
    });
}

function renderTermChart(rows, colors) {
    renderChart("term", "term-chart", {
        type: "bar",
        data: {
            labels: rows.map((item) => item.nombre),
            datasets: [{
                label: "Cantidad de creditos",
                data: rows.map((item) => item.cantidad),
                backgroundColor: rows.map(
                    (_, index) => colors.soft[index % colors.soft.length],
                ),
                borderRadius: 8,
            }],
        },
        options: baseChartOptions(colors, {
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const row = rows[context.dataIndex];
                            return [
                                `Creditos: ${integer.format(row.cantidad)}`,
                                `Monto: ${currency.format(row.monto_total)}`,
                                `Plazo prom.: ${row.plazo_promedio} meses`,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text },
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: (value) => integer.format(value),
                    },
                },
            },
        }),
    });
}

function renderRateChart(rows, colors) {
    const products = [...new Set(rows.map((item) => item.producto))];
    const tipos = [...new Set(rows.map((item) => item.tipo_ifi))];

    const datasets = tipos.map((tipo, index) => ({
        label: tipo,
        data: products.map((producto) => {
            const match = rows.find(
                (item) => item.producto === producto && item.tipo_ifi === tipo,
            );
            return match ? match.tasa_promedio : null;
        }),
        backgroundColor: colors.soft[index % colors.soft.length],
        borderRadius: 8,
        barPercentage: 0.7,
    }));

    renderChart("rate", "rate-chart", {
        type: "bar",
        data: {
            labels: products,
            datasets,
        },
        options: baseChartOptions(colors, {
            plugins: {
                legend: {
                    position: "top",
                    labels: { usePointStyle: true, boxWidth: 8, color: colors.text },
                },
                tooltip: {
                    callbacks: {
                        label: (context) =>
                            context.raw === null
                                ? `${context.dataset.label}: sin datos`
                                : `${context.dataset.label}: ${Number(context.raw).toFixed(2)}%`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.text },
                },
                y: {
                    beginAtZero: true,
                    grid: { color: colors.grid },
                    ticks: {
                        color: colors.text,
                        callback: (value) => `${value}%`,
                    },
                },
            },
        }),
    });
}

function bindMapBasemapToggle() {
    const buttons = [...document.querySelectorAll("[data-basemap]")];
    if (!buttons.length) {
        return;
    }

    const syncActive = () => {
        buttons.forEach((button) => {
            button.classList.toggle("active", button.dataset.basemap === mapBaseMode);
        });
    };
    syncActive();

    buttons.forEach((button) => {
        button.addEventListener("click", async () => {
            const next = button.dataset.basemap;
            if (!next || next === mapBaseMode) {
                return;
            }
            mapBaseMode = next;
            localStorage.setItem(MAP_BASE_STORAGE_KEY, mapBaseMode);
            syncActive();
            applyMapBasemap();
            if (latestMapRows.length) {
                await updateMap(latestMapRows);
            } else if (peruMap) {
                peruMap.invalidateSize();
            }
        });
    });
}

function getBasemapConfig() {
    if (mapBaseMode === "relieve") {
        return {
            url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
            attribution:
                '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
            maxZoom: 17,
        };
    }
    const dark = currentTheme() === "dark";
    return {
        url: dark
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 12,
    };
}

function applyMapBasemap() {
    if (!peruMap || typeof L === "undefined") {
        return;
    }
    const config = getBasemapConfig();
    if (mapTiles) {
        peruMap.removeLayer(mapTiles);
    }
    mapTiles = L.tileLayer(config.url, {
        attribution: config.attribution,
        maxZoom: config.maxZoom,
    }).addTo(peruMap);
    if (peruLayer) {
        peruLayer.bringToFront();
    }
}

function choroplethFillOpacity(amount) {
    if (!amount) {
        return mapBaseMode === "relieve" ? 0.12 : 0.22;
    }
    return mapBaseMode === "relieve" ? 0.58 : 0.86;
}

async function updateMap(rows, forceTiles = false) {
    if (!document.querySelector("#peru-map") || typeof L === "undefined") {
        return;
    }
    const colors = themeColors();
    const values = Object.fromEntries(
        rows.map((item) => [normalizeName(item.nombre), item]),
    );
    const amounts = rows.map((item) => item.monto_total || 0);
    const maxAmount = Math.max(...amounts, 1);

    if (!peruMap) {
        peruMap = L.map("peru-map", {
            zoomControl: true,
            scrollWheelZoom: MODULE === "mapa",
        }).setView([-9.2, -75.0], 5);
        applyMapBasemap();
    } else if (forceTiles) {
        applyMapBasemap();
    }

    if (peruLayer) {
        peruMap.removeLayer(peruLayer);
    }
    selectedDepartmentLayer = null;

    const response = await fetch("/static/geo/peru_departamentos.geojson");
    if (!response.ok) {
        throw new Error("No se pudo cargar el mapa geografico");
    }
    const geojson = await response.json();

    peruLayer = L.geoJSON(geojson, {
        style: (feature) => styleDepartment(feature, values, maxAmount, colors),
        onEachFeature: (feature, layer) => {
            const key = normalizeName(feature.properties.NOMBDEP);
            const row = values[key];
            const label = feature.properties.NOMBDEP;
            if (row) {
                layer.bindTooltip(
                    `<strong>${escapeHtml(label)}</strong><br>` +
                    `Monto: ${currency.format(row.monto_total)}<br>` +
                    `Creditos: ${integer.format(row.cantidad)}`,
                    { sticky: true, className: "map-tooltip" },
                );
            } else {
                layer.bindTooltip(
                    `<strong>${escapeHtml(label)}</strong><br>Sin colocaciones`,
                    { sticky: true, className: "map-tooltip" },
                );
            }

            layer.on({
                mouseover: (event) => highlightDepartment(event.target, true),
                mouseout: (event) => {
                    peruLayer.resetStyle(event.target);
                    if (selectedDepartmentLayer === event.target) {
                        highlightDepartment(event.target, false, true);
                    }
                },
                click: (event) => {
                    if (selectedDepartmentLayer && selectedDepartmentLayer !== event.target) {
                        peruLayer.resetStyle(selectedDepartmentLayer);
                    }
                    selectedDepartmentLayer = event.target;
                    highlightDepartment(event.target, false, true);
                    L.DomEvent.stopPropagation(event);
                },
                add: (event) => {
                    const el = event.target.getElement?.();
                    if (el) {
                        el.removeAttribute("tabindex");
                        el.style.outline = "none";
                    }
                },
            });
        },
    }).addTo(peruMap);

    peruMap.invalidateSize();
    window.setTimeout(() => peruMap && peruMap.invalidateSize(), 120);
    if (MODULE === "mapa") {
        window.setTimeout(() => peruMap && peruMap.invalidateSize(), 320);
    }
    renderMapLegend(maxAmount, colors);
}

function styleDepartment(feature, values, maxAmount, colors) {
    const key = normalizeName(feature.properties.NOMBDEP);
    const amount = values[key]?.monto_total || 0;
    return {
        fillColor: colorScale(amount, maxAmount, colors),
        weight: 1.2,
        opacity: 1,
        color: colors.surface,
        fillOpacity: choroplethFillOpacity(amount),
    };
}

function highlightDepartment(layer, hovering = false, selected = false) {
    if (!layer) {
        return;
    }
    const primary = cssVar("--primary") || "#5d5fef";
    layer.setStyle({
        weight: selected || hovering ? 2.8 : 1.2,
        color: selected || hovering ? primary : (cssVar("--surface") || "#ffffff"),
    });
    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }
}

window.addEventListener("resize", () => {
    if (peruMap) {
        peruMap.invalidateSize();
    }
});

function colorScale(value, maxValue, colors) {
    if (!value) {
        return colors.map[0];
    }
    const ratio = value / maxValue;
    if (ratio > 0.75) return colors.map[5];
    if (ratio > 0.5) return colors.map[4];
    if (ratio > 0.25) return colors.map[3];
    if (ratio > 0.1) return colors.map[2];
    return colors.map[1];
}

function renderMapLegend(maxAmount, colors) {
    const legend = document.querySelector("#map-legend");
    const steps = [
        { label: "Sin datos", color: colors.map[0] },
        { label: "Bajo", color: colors.map[1] },
        { label: "Medio", color: colors.map[3] },
        { label: "Alto", color: colors.map[4] },
        { label: `Max ${compactMoney(maxAmount)}`, color: colors.map[5] },
    ];
    legend.innerHTML = steps
        .map((step) => `<span><i style="background:${step.color}"></i>${step.label}</span>`)
        .join("");
}

function normalizeName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}

function renderHorizontalBar(key, canvasId, rows, color, colors) {
    renderChart(key, canvasId, {
        type: "bar",
        data: {
            labels: rows.map((item) => item.nombre),
            datasets: [{
                label: "Monto total",
                data: rows.map((item) => item.monto_total),
                backgroundColor: color,
                borderRadius: 8,
                barThickness: 14,
            }],
        },
        options: chartOptions(true, colors),
    });
}

function chartOptions(horizontal, colors) {
    return baseChartOptions(colors, {
        indexAxis: horizontal ? "y" : "x",
        plugins: {
            legend: { display: !horizontal },
            tooltip: {
                callbacks: {
                    label: (context) => currency.format(context.raw),
                },
            },
        },
        scales: {
            x: {
                grid: { color: colors.grid },
                ticks: {
                    color: colors.text,
                    callback: (value) => compactMoney(value),
                },
            },
            y: {
                grid: { display: !horizontal, color: colors.grid },
                ticks: { color: colors.text },
            },
        },
    });
}

function renderChart(key, canvasId, config) {
    const canvas = document.querySelector(`#${canvasId}`);
    if (!canvas) {
        return;
    }
    if (charts[key]) {
        charts[key].destroy();
    }
    charts[key] = new Chart(canvas, config);
}

function updateTable(rows, meta = {}) {
    const body = document.querySelector("#detail-body");
    const page = meta.page || 1;
    const pageSize = meta.page_size || DETAIL_PAGE_SIZE;
    const total = meta.total || 0;
    const totalPages = meta.total_pages || 1;
    const startIndex = (page - 1) * pageSize;
    body.innerHTML = "";

    const subtitle = document.querySelector("#detalle-subtitle");
    if (subtitle) {
        subtitle.textContent = total
            ? `${integer.format(total)} registros · ${pageSize} por pagina`
            : "Sin registros para estos filtros";
    }

    const pageInfo = document.querySelector("#detalle-page-info");
    if (pageInfo) {
        pageInfo.textContent = total
            ? `Pagina ${page} de ${totalPages}`
            : "Pagina 0";
    }

    const prev = document.querySelector("#detalle-prev");
    const next = document.querySelector("#detalle-next");
    if (prev) {
        prev.disabled = page <= 1 || total === 0;
    }
    if (next) {
        next.disabled = page >= totalPages || total === 0;
    }

    if (!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="10">No existen registros para estos filtros.</td>
            </tr>
        `;
        return;
    }

    rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${startIndex + index + 1}</td>
            <td>${escapeHtml(row.fecha_desembolso)}</td>
            <td>${escapeHtml(row.anio)}</td>
            <td>${escapeHtml(row.codigo_producto)}</td>
            <td>${escapeHtml(row.departamento)}</td>
            <td>${escapeHtml(row.distrito)}</td>
            <td>${escapeHtml(row.nombre_ifi)}</td>
            <td>${integer.format(row.plazo_meses)} meses</td>
            <td>${currency.format(row.monto_credito)}</td>
            <td><span class="badge-soft">${Number(row.tasa_interes).toFixed(2)}%</span></td>
        `;
        body.appendChild(tr);
    });
}

function compactMoney(value) {
    return new Intl.NumberFormat("es-PE", {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value ?? "";
    return element.innerHTML;
}

function setLoading(visible) {
    document
        .querySelector("#loading")
        ?.classList.toggle("visible", visible);
}

function showError(message) {
    const toast = document.querySelector("#error-toast");
    if (!toast) {
        return;
    }
    toast.textContent = message;
    toast.classList.add("visible");
    window.setTimeout(() => toast.classList.remove("visible"), 4500);
}
