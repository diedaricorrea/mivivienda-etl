const charts = {};
let peruMap = null;
let peruLayer = null;
let mapTiles = null;
let selectedDepartmentLayer = null;
let latestDashboard = null;
let latestMapRows = [];
let detailPage = 1;
const DETAIL_PAGE_SIZE = 50;
const FILTER_IDS = ["anio", "anio_comp", "departamento", "producto", "tipo_ifi"];
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
    bindAiInterpret();
    bindKpiAi();
    bindChartAi();
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
        populateSelect("anio_comp", data.anios || []);
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
        updateYoy(data.yoy);
        updateInsights(data.insights || []);
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

function formatYoyDelta(value, { points = false } = {}) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return null;
    }
    const num = Number(value);
    const sign = num > 0 ? "+" : "";
    const suffix = points ? " pp" : "%";
    return `${sign}${num.toFixed(1)}${suffix}`;
}

function setYoyDelta(id, value, { points = false } = {}) {
    const el = document.querySelector(`#${id}`);
    if (!el) {
        return;
    }
    const text = formatYoyDelta(value, { points });
    if (!text) {
        el.hidden = true;
        el.textContent = "";
        el.classList.remove("positive", "negative");
        return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("positive", Number(value) > 0);
    el.classList.toggle("negative", Number(value) < 0);
}

function updateYoy(yoy) {
    const banner = document.querySelector("#yoy-banner");
    const chip = document.querySelector("#yoy-chip");
    if (!yoy?.available) {
        ["kpi-total-yoy", "kpi-cantidad-yoy", "kpi-promedio-yoy", "kpi-tasa-yoy", "kpi-nmiv-yoy", "kpi-lima-yoy"]
            .forEach((id) => setYoyDelta(id, null));
        if (banner) {
            banner.hidden = true;
            banner.textContent = "";
        }
        if (chip) {
            chip.hidden = true;
            chip.textContent = "";
        }
        return;
    }

    const deltas = yoy.deltas || {};
    setYoyDelta("kpi-total-yoy", deltas.monto_total_pct);
    setYoyDelta("kpi-cantidad-yoy", deltas.cantidad_pct);
    setYoyDelta("kpi-promedio-yoy", deltas.monto_promedio_pct);
    setYoyDelta("kpi-tasa-yoy", deltas.tasa_promedio_pct);
    setYoyDelta("kpi-nmiv-yoy", deltas.participacion_nmiv_pct_pp, { points: true });
    setYoyDelta("kpi-lima-yoy", deltas.concentracion_lima_pct_pp, { points: true });

    const label = yoy.etiqueta || `${yoy.anio_previo} vs ${yoy.anio_actual}`;
    if (banner) {
        banner.hidden = false;
        if (yoy.kpi_universo === "todos_los_anios") {
            banner.textContent =
                `Los KPI muestran todos los anios. Los badges YoY comparan solo ` +
                `${label} (anio analizado ${yoy.anio_actual} vs referencia ${yoy.anio_previo}). ` +
                `“Comparar con” no cambia el universo de los KPI; eso lo hace Periodo.`;
        } else {
            const modo = yoy.modo === "manual" ? "comparacion elegida" : "anio previo automatico";
            banner.textContent =
                `KPI del periodo ${yoy.anio_actual}. Deltas YoY ${label} (${modo}). ` +
                `“Comparar con” solo afecta esos deltas y el insight/IA de comparativo.`;
        }
    }
    if (chip) {
        chip.hidden = false;
        chip.textContent = `YoY ${label}`;
    }
}

function updateInsights(insights) {
    const list = document.querySelector("#insights-list");
    if (!list) {
        return;
    }
    if (!insights?.length) {
        list.innerHTML = "<li>No hay hallazgos para el universo filtrado.</li>";
        return;
    }
    list.innerHTML = insights
        .map(
            (item) => `
            <li data-tipo="${escapeHtml(item.tipo || "")}">
                <strong>${escapeHtml(item.titulo || "Hallazgo")}</strong>
                <span>${escapeHtml(item.texto || "")}</span>
            </li>
        `,
        )
        .join("");
}

function buildAiPayload() {
    const data = latestDashboard;
    if (!data?.kpis) {
        return null;
    }

    const base = {
        modulo: MODULE,
        filtros: data.filtros_aplicados || {},
        kpis: data.kpis,
        yoy: data.yoy || {},
        insights_reglas: data.insights || [],
    };

    if (MODULE === "tendencias") {
        return {
            ...base,
            anual: data.anual || [],
            mensual: (data.mensual || []).slice(-24),
            trimestres: data.trimestres || [],
        };
    }

    if (MODULE === "mapa") {
        const top = [...(data.mapa || [])]
            .sort((a, b) => Number(b.monto_total || 0) - Number(a.monto_total || 0))
            .slice(0, 10);
        return {
            ...base,
            top_departamentos: top,
            concentracion: data.concentracion || [],
            insights_reglas: (data.insights || []).filter((item) =>
                ["geo", "alerta", "volumen", "yoy"].includes(item.tipo),
            ),
        };
    }

    if (MODULE === "analisis") {
        return {
            ...base,
            productos: data.productos || [],
            departamentos: (data.departamentos || []).slice(0, 10),
            instituciones: (data.instituciones || []).slice(0, 10),
            tasas: data.tasas || [],
        };
    }

    return base;
}

async function streamInterpret(context, handlers = {}) {
    const response = await fetch("/api/interpretar/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
    });
    if (!response.ok) {
        const raw = await response.text();
        let payload = {};
        try {
            payload = raw ? JSON.parse(raw) : {};
        } catch {
            /* HTML 404 u otro */
        }
        throw new Error(
            payload.error
                || (response.status === 404
                    ? "Endpoint de streaming no encontrado. Reinicia Flask."
                    : `No se pudo interpretar con IA (HTTP ${response.status}).`),
        );
    }
    if (!response.body) {
        throw new Error("El navegador no soporta streaming de respuesta.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
            const line = part
                .split("\n")
                .map((row) => row.trim())
                .find((row) => row.startsWith("data:"));
            if (!line) {
                continue;
            }
            let event;
            try {
                event = JSON.parse(line.slice(5).trim());
            } catch {
                continue;
            }
            if (event.tipo === "meta") {
                handlers.onMeta?.(event);
            } else if (event.tipo === "delta") {
                fullText += event.texto || "";
                handlers.onDelta?.(fullText, event.texto || "");
            } else if (event.tipo === "error") {
                throw new Error(event.error || "Error en la interpretacion con IA");
            }
        }
    }

    if (!fullText.trim()) {
        throw new Error("La IA no devolvio contenido util.");
    }
    return fullText;
}

function bindAiInterpret() {
    const button = document.querySelector("#ai-interpret");
    if (!button) {
        return;
    }
    button.addEventListener("click", async () => {
        const context = buildAiPayload();
        if (!context) {
            showError("Aun no hay datos del dashboard para interpretar.");
            return;
        }
        const box = document.querySelector("#ai-insights");
        const textEl = document.querySelector("#ai-insights-text");
        const modelEl = document.querySelector("#ai-insights-model");
        const noteEl = document.querySelector("#ai-insights-note");
        button.disabled = true;
        button.textContent = "Generando...";
        if (box) {
            box.hidden = false;
        }
        if (textEl) {
            textEl.textContent = "";
            textEl.classList.add("is-streaming");
        }
        if (modelEl) {
            modelEl.textContent = "Escribiendo...";
        }
        if (noteEl) {
            noteEl.textContent = "";
        }

        try {
            await streamInterpret(context, {
                onMeta(event) {
                    const bits = [];
                    if (event.modelo) {
                        bits.push(`Modelo: ${event.modelo}`);
                    }
                    if (event.modulo) {
                        bits.push(`Vista: ${event.modulo}`);
                    }
                    if (modelEl) {
                        modelEl.textContent = bits.join(" · ") || "Escribiendo...";
                    }
                    if (noteEl) {
                        noteEl.textContent = event.aviso || "";
                    }
                },
                onDelta(fullText) {
                    if (textEl) {
                        textEl.textContent = fullText;
                    }
                },
            });
        } catch (error) {
            showError(error.message);
            if (box && !textEl?.textContent) {
                box.hidden = true;
            }
        } finally {
            textEl?.classList.remove("is-streaming");
            button.disabled = false;
            button.textContent = "Explicar con IA";
        }
    });
}

let kpiAiIgnoreBackdropUntil = 0;

function closeKpiAiPopover() {
    const popover = document.querySelector("#kpi-ai-popover");
    if (popover) {
        popover.hidden = true;
        popover.setAttribute("hidden", "");
        popover.setAttribute("aria-hidden", "true");
    }
    document.querySelectorAll(".kpi-ai-btn.is-loading").forEach((btn) => {
        btn.classList.remove("is-loading");
    });
}

function openKpiAiPopover(anchor) {
    const popover = document.querySelector("#kpi-ai-popover");
    if (!popover) {
        return;
    }
    // Evita clipping/z-index de contenedores del dashboard.
    if (popover.parentElement !== document.body) {
        document.body.appendChild(popover);
    }
    popover.hidden = false;
    popover.removeAttribute("hidden");
    popover.setAttribute("aria-hidden", "false");
    // El mismo click que abre no debe cerrar por el backdrop.
    kpiAiIgnoreBackdropUntil = Date.now() + 450;
    positionKpiAiCard(anchor);
}

function positionKpiAiCard(anchor) {
    const card = document.querySelector("#kpi-ai-popover .kpi-ai-card");
    if (!card || !anchor) {
        return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    const margin = 10;
    let left = rect.right + margin;
    if (left + width > window.innerWidth - 12) {
        left = Math.max(12, rect.left - width - margin);
    }
    let top = rect.top;
    const estimatedHeight = Math.min(window.innerHeight * 0.7, 420);
    if (top + estimatedHeight > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }
    card.style.width = `${width}px`;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
}

function setThinkingVisible(thinkingEl, visible) {
    if (!thinkingEl) {
        return;
    }
    if (visible) {
        thinkingEl.hidden = false;
        thinkingEl.removeAttribute("hidden");
    } else {
        thinkingEl.hidden = true;
        thinkingEl.setAttribute("hidden", "");
    }
}

async function runAiPopover({
    anchor,
    title,
    context,
    loadingButton = null,
}) {
    const popover = document.querySelector("#kpi-ai-popover");
    const titleEl = document.querySelector("#kpi-ai-title");
    const thinkingEl = document.querySelector("#kpi-ai-thinking");
    const textEl = document.querySelector("#kpi-ai-text");
    const noteEl = document.querySelector("#kpi-ai-note");
    if (!popover) {
        return;
    }

    openKpiAiPopover(anchor);
    loadingButton?.classList.add("is-loading");
    if (titleEl) {
        titleEl.textContent = title;
    }
    setThinkingVisible(thinkingEl, true);
    if (textEl) {
        textEl.textContent = "";
        textEl.classList.add("is-streaming");
    }
    if (noteEl) {
        noteEl.textContent = "";
    }

    try {
        await streamInterpret(context, {
            onMeta(meta) {
                setThinkingVisible(thinkingEl, false);
                if (noteEl) {
                    noteEl.textContent = meta.aviso || "";
                }
            },
            onDelta(fullText) {
                setThinkingVisible(thinkingEl, false);
                if (textEl) {
                    textEl.textContent = fullText;
                }
            },
        });
    } catch (error) {
        showError(error.message);
        closeKpiAiPopover();
    } finally {
        textEl?.classList.remove("is-streaming");
        loadingButton?.classList.remove("is-loading");
        setThinkingVisible(thinkingEl, false);
    }
}

function bindKpiAi() {
    const popover = document.querySelector("#kpi-ai-popover");
    if (!popover) {
        return;
    }

    document.querySelector("#kpi-ai-close")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeKpiAiPopover();
    });
    document.querySelector("#kpi-ai-backdrop")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (Date.now() < kpiAiIgnoreBackdropUntil) {
            return;
        }
        closeKpiAiPopover();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !popover.hidden) {
            closeKpiAiPopover();
        }
    });

    document.querySelectorAll(".kpi-ai-btn").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!latestDashboard?.kpis) {
                showError("Aun no hay datos del dashboard para interpretar.");
                return;
            }

            const kpiId = button.dataset.kpi;
            const kpiLabel = button.dataset.label || kpiId;
            const kpis = latestDashboard.kpis;
            const yoy = latestDashboard.yoy || {};
            const focused = {
                [kpiId]: kpis[kpiId],
            };
            if (kpiId === "mejor_mes") {
                focused.mejor_mes_monto = kpis.mejor_mes_monto;
            }
            if (kpiId === "crecimiento_mensual_pct") {
                focused.mes_actual = kpis.mes_actual;
                focused.mes_anterior = kpis.mes_anterior;
            }

            const insightsRelacionados = (latestDashboard.insights || [])
                .filter((item) => insightMatchesKpi(kpiId, item))
                .slice(0, 3);

            await runAiPopover({
                anchor: button,
                title: kpiLabel,
                loadingButton: button,
                context: {
                    modulo: "kpi",
                    kpi_focus: {
                        id: kpiId,
                        label: kpiLabel,
                        definicion: KPI_DEFINITIONS[kpiId] || kpiLabel,
                        valor: kpis[kpiId],
                        valor_formato: button
                            .closest(".kpi-tile")
                            ?.querySelector(".kpi-value")
                            ?.textContent
                            ?.trim() || String(kpis[kpiId] ?? ""),
                        relacionados: focused,
                        yoy_etiqueta: yoy.etiqueta || null,
                        yoy_delta_relevante: pickYoyDeltaForKpi(kpiId, yoy.deltas || {}),
                    },
                    filtros: latestDashboard.filtros_aplicados || {},
                    // Universo filtrado (contexto minimo) + foco del indicador.
                    kpis: {
                        ...focused,
                        monto_total: kpis.monto_total,
                        cantidad: kpis.cantidad,
                        monto_promedio: kpis.monto_promedio,
                        tasa_promedio: kpis.tasa_promedio,
                    },
                    contexto_universo: {
                        monto_total: kpis.monto_total,
                        cantidad: kpis.cantidad,
                        monto_promedio: kpis.monto_promedio,
                        tasa_promedio: kpis.tasa_promedio,
                        participacion_nmiv_pct: kpis.participacion_nmiv_pct,
                        concentracion_lima_pct: kpis.concentracion_lima_pct,
                    },
                    insights_reglas: insightsRelacionados,
                    yoy: {
                        available: yoy.available,
                        etiqueta: yoy.etiqueta,
                        anio_actual: yoy.anio_actual,
                        anio_previo: yoy.anio_previo,
                        modo: yoy.modo,
                        deltas: pickYoyDeltaForKpi(kpiId, yoy.deltas || {}),
                        actual: yoy.actual || null,
                        previo: yoy.previo || null,
                    },
                },
            });
        });
    });
}

const KPI_DEFINITIONS = {
    monto_total: "Suma del capital colocado en el universo filtrado.",
    cantidad: "Numero de creditos desembolsados en el universo filtrado.",
    monto_promedio: "Ticket promedio = monto_total / cantidad.",
    tasa_promedio: "Tasa de interes promedio ponderada del universo filtrado.",
    crecimiento_mensual_pct: "Variacion porcentual del ultimo periodo comparable vs el anterior.",
    mejor_mes: "Periodo (anio-mes) con mayor monto colocado dentro del universo filtrado.",
    participacion_nmiv_pct: "Participacion de NMIV/NCMV sobre el monto total filtrado.",
    concentracion_lima_pct: "Participacion de Lima sobre el monto total filtrado.",
};

function insightMatchesKpi(kpiId, item) {
    const tipo = item?.tipo || "";
    const map = {
        monto_total: ["volumen", "yoy"],
        cantidad: ["volumen", "yoy"],
        monto_promedio: ["volumen", "yoy"],
        tasa_promedio: ["volumen", "yoy"],
        crecimiento_mensual_pct: ["tendencia", "yoy"],
        mejor_mes: ["pico", "volumen"],
        participacion_nmiv_pct: ["producto", "volumen"],
        concentracion_lima_pct: ["geo", "alerta", "volumen"],
    };
    return (map[kpiId] || []).includes(tipo);
}

function pickYoyDeltaForKpi(kpiId, deltas) {
    const map = {
        monto_total: ["monto_total_pct"],
        cantidad: ["cantidad_pct"],
        monto_promedio: ["monto_promedio_pct"],
        tasa_promedio: ["tasa_promedio_pct"],
        participacion_nmiv_pct: ["participacion_nmiv_pct_pp"],
        concentracion_lima_pct: ["concentracion_lima_pct_pp"],
    };
    const keys = map[kpiId];
    if (!keys) {
        return {};
    }
    const out = {};
    keys.forEach((key) => {
        if (deltas[key] != null) {
            out[key] = deltas[key];
        }
    });
    return out;
}

const CHART_AI_MAP = {
    "annual-chart": {
        id: "anual",
        label: "Evolucion anual",
        dataKey: "anual",
        limit: 12,
    },
    "monthly-chart": {
        id: "mensual",
        label: "Tendencia mensual",
        dataKey: "mensual",
        limit: 24,
    },
    "quarter-chart": {
        id: "trimestres",
        label: "Monto por trimestre",
        dataKey: "trimestres",
        limit: 16,
    },
    "concentration-chart": {
        id: "concentracion",
        label: "Lima vs resto del pais",
        dataKey: "concentracion",
        limit: 8,
    },
    "term-chart": {
        id: "plazos",
        label: "Distribucion por plazo",
        dataKey: "plazos",
        limit: 12,
    },
    "product-chart": {
        id: "productos",
        label: "Monto y ticket por producto",
        dataKey: "productos",
        limit: 12,
    },
    "department-chart": {
        id: "departamentos",
        label: "Top departamentos",
        dataKey: "departamentos",
        limit: 10,
    },
    "ifi-chart": {
        id: "instituciones",
        label: "Top IFI por monto",
        dataKey: "instituciones",
        limit: 10,
    },
    "rate-chart": {
        id: "tasas",
        label: "Tasa promedio por producto e IFI",
        dataKey: "tasas",
        limit: 16,
    },
};

function bindChartAi() {
    if (!document.querySelector("#kpi-ai-popover")) {
        return;
    }

    Object.entries(CHART_AI_MAP).forEach(([canvasId, meta]) => {
        const canvas = document.querySelector(`#${canvasId}`);
        if (!canvas) {
            return;
        }
        const panel = canvas.closest(".panel");
        const header = panel?.querySelector(".panel-header");
        if (!header || header.querySelector(".chart-ai-btn")) {
            return;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chart-ai-btn";
        button.textContent = "IA";
        button.title = `Interpretar ${meta.label} con IA`;
        button.setAttribute("aria-label", `Interpretar ${meta.label} con IA`);
        button.dataset.chart = meta.id;
        header.appendChild(button);

        button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!latestDashboard) {
                showError("Aun no hay datos del dashboard para interpretar.");
                return;
            }
            const rows = latestDashboard[meta.dataKey] || [];
            const serie = Array.isArray(rows) ? rows.slice(0, meta.limit) : rows;
            await runAiPopover({
                anchor: button,
                title: meta.label,
                loadingButton: button,
                context: {
                    modulo: "chart",
                    chart_focus: {
                        id: meta.id,
                        label: meta.label,
                        descripcion: `Serie '${meta.dataKey}' del universo filtrado.`,
                    },
                    filtros: latestDashboard.filtros_aplicados || {},
                    kpis: {
                        monto_total: latestDashboard.kpis?.monto_total,
                        cantidad: latestDashboard.kpis?.cantidad,
                        monto_promedio: latestDashboard.kpis?.monto_promedio,
                        tasa_promedio: latestDashboard.kpis?.tasa_promedio,
                        concentracion_lima_pct: latestDashboard.kpis?.concentracion_lima_pct,
                        participacion_nmiv_pct: latestDashboard.kpis?.participacion_nmiv_pct,
                    },
                    yoy: {
                        available: latestDashboard.yoy?.available,
                        etiqueta: latestDashboard.yoy?.etiqueta,
                        deltas: latestDashboard.yoy?.deltas || {},
                    },
                    resumen_serie: summarizeSerie(serie),
                    serie,
                },
            });
        });
    });
}

function summarizeSerie(serie) {
    if (!Array.isArray(serie) || !serie.length) {
        return { n: 0 };
    }
    const withMonto = serie
        .map((row) => ({
            ...row,
            _monto: Number(row.monto_total ?? row.monto ?? 0),
        }))
        .filter((row) => Number.isFinite(row._monto));
    if (!withMonto.length) {
        return { n: serie.length };
    }
    const sorted = [...withMonto].sort((a, b) => b._monto - a._monto);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const total = withMonto.reduce((acc, row) => acc + row._monto, 0);
    return {
        n: serie.length,
        monto_suma_serie: total,
        max: {
            etiqueta: top.nombre || top.periodo || top.anio || top.label || null,
            monto_total: top._monto,
        },
        min: {
            etiqueta: bottom.nombre || bottom.periodo || bottom.anio || bottom.label || null,
            monto_total: bottom._monto,
        },
        top3: sorted.slice(0, 3).map((row) => ({
            etiqueta: row.nombre || row.periodo || row.anio || row.label || null,
            monto_total: row._monto,
            cantidad: row.cantidad ?? null,
        })),
    };
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
    if (!legend) {
        return;
    }
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
    if (!body) {
        return;
    }
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
