const charts = {};

const currency = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 0,
});

document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    await checkHealth();
    await loadFilters();
    await loadDashboard();
});

function bindEvents() {
    document
        .querySelector("#apply-filters")
        .addEventListener("click", loadDashboard);

    document.querySelector("#clear-filters").addEventListener("click", () => {
        ["departamento", "producto", "tipo_ifi"].forEach((id) => {
            document.querySelector(`#${id}`).value = "";
        });
        loadDashboard();
    });
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

async function loadDashboard() {
    setLoading(true);
    try {
        const params = new URLSearchParams();
        ["departamento", "producto", "tipo_ifi"].forEach((id) => {
            const value = document.querySelector(`#${id}`).value;
            if (value) {
                params.set(id, value);
            }
        });

        const response = await fetch(`/api/dashboard?${params.toString()}`);
        if (!response.ok) {
            throw new Error("No se pudo consultar el dashboard");
        }
        const data = await response.json();
        updateKpis(data.kpis);
        updateCharts(data);
        updateTable(data.detalle);
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
}

function updateCharts(data) {
    renderChart("monthly", "monthly-chart", {
        type: "line",
        data: {
            labels: data.mensual.map((item) => item.mes_nombre),
            datasets: [{
                label: "Monto colocado",
                data: data.mensual.map((item) => item.monto_total),
                borderColor: "#1f6feb",
                backgroundColor: "rgba(31, 111, 235, 0.12)",
                fill: true,
                tension: 0.35,
                pointBackgroundColor: "#ffffff",
                pointBorderColor: "#1f6feb",
                pointBorderWidth: 2,
                pointRadius: 4,
            }],
        },
        options: chartOptions(false),
    });

    renderChart("product", "product-chart", {
        type: "doughnut",
        data: {
            labels: data.productos.map((item) => item.nombre),
            datasets: [{
                data: data.productos.map((item) => item.cantidad),
                backgroundColor: ["#1f6feb", "#23a6d5", "#18a999"],
                borderColor: "#ffffff",
                borderWidth: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "66%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true, boxWidth: 8 },
                },
            },
        },
    });

    renderHorizontalBar(
        "department",
        "department-chart",
        data.departamentos,
        "#23a6d5",
    );
    renderHorizontalBar(
        "ifi",
        "ifi-chart",
        data.instituciones,
        "#18a999",
    );
}

function renderHorizontalBar(key, canvasId, rows, color) {
    renderChart(key, canvasId, {
        type: "bar",
        data: {
            labels: rows.map((item) => item.nombre),
            datasets: [{
                label: "Monto total",
                data: rows.map((item) => item.monto_total),
                backgroundColor: color,
                borderRadius: 6,
                barThickness: 14,
            }],
        },
        options: chartOptions(true),
    });
}

function chartOptions(horizontal) {
    return {
        responsive: true,
        maintainAspectRatio: false,
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
                grid: { color: "#eef2f7" },
                ticks: {
                    callback: (value) => compactMoney(value),
                },
            },
            y: {
                grid: { display: !horizontal, color: "#eef2f7" },
            },
        },
    };
}

function renderChart(key, canvasId, config) {
    if (charts[key]) {
        charts[key].destroy();
    }
    charts[key] = new Chart(document.querySelector(`#${canvasId}`), config);
}

function updateTable(rows) {
    const body = document.querySelector("#detail-body");
    body.innerHTML = "";

    if (!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="8">No existen registros para estos filtros.</td>
            </tr>
        `;
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${escapeHtml(row.fecha_desembolso)}</td>
            <td>${escapeHtml(row.codigo_producto)}</td>
            <td>${escapeHtml(row.departamento)}</td>
            <td>${escapeHtml(row.distrito)}</td>
            <td>${escapeHtml(row.nombre_ifi)}</td>
            <td>${integer.format(row.plazo_meses)} meses</td>
            <td>${currency.format(row.monto_credito)}</td>
            <td>${Number(row.tasa_interes).toFixed(2)}%</td>
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
