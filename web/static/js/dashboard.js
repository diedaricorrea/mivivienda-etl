const charts = {};
let peruMap = null;
let peruLayer = null;
let mapTiles = null;
let latestDashboard = null;
let latestMapRows = [];
let detailPage = 1;
const DETAIL_PAGE_SIZE = 50;

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
    await checkHealth();
    await loadFilters();
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
    document.querySelector("#theme-toggle").addEventListener("click", async () => {
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
    label.textContent = currentTheme() === "dark" ? "Modo claro" : "Modo oscuro";
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
            loadDashboard();
        });

    document.querySelector("#clear-filters")?.addEventListener("click", () => {
        ["departamento", "producto", "tipo_ifi"].forEach((id) => {
            document.querySelector(`#${id}`).value = "";
        });
        detailPage = 1;
        loadDashboard();
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
    ["departamento", "producto", "tipo_ifi"].forEach((id) => {
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

async function checkHealth() {
    try {
        const response = await fetch("/api/health");
        if (!response.ok) {
            throw new Error("MySQL no disponible");
        }
        document.querySelector("#status-dot").classList.add("connected");
        document.querySelector("#status-text").textContent = "MySQL conectado";
    } catch (error) {
        document.querySelector("#status-text").textContent = "Sin conexion";
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
        populateSelect("departamento", data.departamentos);
        populateSelect("producto", data.productos);
        populateSelect("tipo_ifi", data.tipos_ifi);
    } catch (error) {
        showError(error.message);
    }
}

function populateSelect(id, values) {
    const select = document.querySelector(`#${id}`);
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
        const params = new URLSearchParams();
        ["departamento", "producto", "tipo_ifi"].forEach((id) => {
            const value = document.querySelector(`#${id}`).value;
            if (value) {
                params.set(id, value);
            }
        });
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
    document.querySelector("#kpi-cantidad").textContent =
        integer.format(kpis.cantidad);
    document.querySelector("#kpi-total").textContent =
        currency.format(kpis.monto_total);
    document.querySelector("#kpi-promedio").textContent =
        currency.format(kpis.monto_promedio);
    document.querySelector("#kpi-tasa").textContent =
        `${Number(kpis.tasa_promedio).toFixed(2)}%`;

    const growthEl = document.querySelector("#kpi-crecimiento");
    const growthNote = document.querySelector("#kpi-crecimiento-note");
    growthEl.classList.remove("positive", "negative");

    if (kpis.crecimiento_mensual_pct === null || kpis.crecimiento_mensual_pct === undefined) {
        growthEl.textContent = "N/D";
        growthNote.textContent = "Sin mes comparable";
    } else {
        growthEl.textContent = `${percent.format(kpis.crecimiento_mensual_pct)}%`;
        growthEl.classList.add(
            kpis.crecimiento_mensual_pct >= 0 ? "positive" : "negative",
        );
        growthNote.textContent =
            `${kpis.mes_actual || "Mes actual"} vs ${kpis.mes_anterior || "anterior"}`;
    }

    document.querySelector("#kpi-mejor-mes").textContent =
        kpis.mejor_mes || "N/D";
    document.querySelector("#kpi-mejor-mes-note").textContent = kpis.mejor_mes_monto
        ? currency.format(kpis.mejor_mes_monto)
        : "Mayor colocacion";

    const nmiv = `${Number(kpis.participacion_nmiv_pct || 0).toFixed(1)}%`;
    const lima = `${Number(kpis.concentracion_lima_pct || 0).toFixed(1)}%`;
    document.querySelector("#kpi-nmiv").textContent = nmiv;
    document.querySelector("#kpi-lima").textContent = lima;
    setText("kpi-nmiv-footer", nmiv);
    setText("kpi-lima-footer", lima);
}

function updateCharts(data) {
    const colors = themeColors();
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

function renderMonthlyChart(rows, colors) {
    const maxMonto = Math.max(...rows.map((item) => item.monto_total || 0), 1);
    const highlightIndex = rows.findIndex(
        (item) => item.monto_total === maxMonto,
    );

    renderChart("monthly", "monthly-chart", {
        type: "bar",
        data: {
            labels: rows.map((item) => item.mes_nombre),
            datasets: [
                {
                    type: "bar",
                    label: "Monto colocado",
                    data: rows.map((item) => item.monto_total),
                    backgroundColor: rows.map((_, index) =>
                        index === highlightIndex ? colors.copper : colors.primary,
                    ),
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
                    tension: 0.35,
                    pointRadius: 3,
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
                    title: {
                        display: true,
                        text: "Monto (S/)",
                        color: colors.primary,
                    },
                },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: colors.text,
                        callback: (value) => integer.format(value),
                    },
                    title: {
                        display: true,
                        text: "Creditos",
                        color: colors.coral,
                    },
                },
            },
        }),
    });
}

function renderQuarterChart(rows, colors) {
    const maxMonto = Math.max(...rows.map((item) => item.monto_total || 0), 1);

    renderChart("quarter", "quarter-chart", {
        type: "bar",
        data: {
            labels: rows.map((item) => `T${item.trimestre}`),
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
                    ticks: { color: colors.text },
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
                    title: {
                        display: true,
                        text: "Monto",
                        color: colors.primary,
                    },
                },
                y1: {
                    position: "right",
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: colors.text,
                        callback: (value) => compactMoney(value),
                    },
                    title: {
                        display: true,
                        text: "Ticket",
                        color: colors.mint,
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
                    title: {
                        display: true,
                        text: "Tasa promedio anual",
                        color: colors.text,
                    },
                },
            },
        }),
    });
}

async function updateMap(rows, forceTiles = false) {
    const colors = themeColors();
    const values = Object.fromEntries(
        rows.map((item) => [normalizeName(item.nombre), item]),
    );
    const amounts = rows.map((item) => item.monto_total || 0);
    const maxAmount = Math.max(...amounts, 1);
    const tileUrl = currentTheme() === "dark"
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    if (!peruMap) {
        peruMap = L.map("peru-map", {
            zoomControl: true,
            scrollWheelZoom: false,
        }).setView([-9.2, -75.0], 5);
        mapTiles = L.tileLayer(tileUrl, {
            attribution: "&copy; OpenStreetMap &copy; CARTO",
            maxZoom: 12,
        }).addTo(peruMap);
    } else if (forceTiles && mapTiles) {
        peruMap.removeLayer(mapTiles);
        mapTiles = L.tileLayer(tileUrl, {
            attribution: "&copy; OpenStreetMap &copy; CARTO",
            maxZoom: 12,
        }).addTo(peruMap);
    }

    if (peruLayer) {
        peruMap.removeLayer(peruLayer);
    }

    const response = await fetch("/static/geo/peru_departamentos.geojson");
    if (!response.ok) {
        throw new Error("No se pudo cargar el mapa geografico");
    }
    const geojson = await response.json();

    peruLayer = L.geoJSON(geojson, {
        style: (feature) => {
            const key = normalizeName(feature.properties.NOMBDEP);
            const amount = values[key]?.monto_total || 0;
            return {
                fillColor: colorScale(amount, maxAmount, colors),
                weight: 1,
                opacity: 1,
                color: colors.surface,
                fillOpacity: amount > 0 ? 0.86 : 0.22,
            };
        },
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
        },
    }).addTo(peruMap);

    peruMap.invalidateSize();
    window.setTimeout(() => peruMap && peruMap.invalidateSize(), 120);
    renderMapLegend(maxAmount, colors);
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
    if (charts[key]) {
        charts[key].destroy();
    }
    charts[key] = new Chart(document.querySelector(`#${canvasId}`), config);
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
                <td colspan="9">No existen registros para estos filtros.</td>
            </tr>
        `;
        return;
    }

    rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${startIndex + index + 1}</td>
            <td>${escapeHtml(row.fecha_desembolso)}</td>
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
        .classList.toggle("visible", visible);
}

function showError(message) {
    const toast = document.querySelector("#error-toast");
    toast.textContent = message;
    toast.classList.add("visible");
    window.setTimeout(() => toast.classList.remove("visible"), 4500);
}
