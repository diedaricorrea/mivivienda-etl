document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    await loadDictionary();
    document
        .querySelector("#dictionary-search")
        ?.addEventListener("input", filterDictionary);
});

let dictionaryRows = [];

function initTheme() {
    syncThemeLabel();
    document.querySelector("#theme-toggle")?.addEventListener("click", () => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("mivivienda-theme", next);
        syncThemeLabel();
    });
}

function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
}

function syncThemeLabel() {
    const label = document.querySelector("#theme-toggle-label");
    if (label) {
        label.textContent = currentTheme() === "dark" ? "Modo claro" : "Modo oscuro";
    }
}

async function loadDictionary() {
    try {
        const response = await fetch("/api/diccionario");
        if (!response.ok) {
            throw new Error("No se pudo cargar el diccionario de datos");
        }
        const data = await response.json();
        dictionaryRows = data.campos || [];
        document.querySelector("#dictionary-title").textContent = data.dataset;
        document.querySelector("#dictionary-subtitle").textContent =
            `${data.total_campos} variables oficiales del dataset de colocaciones.`;
        document.querySelector("#dictionary-count").textContent = data.total_campos;
        document.querySelector("#dictionary-file").textContent = data.archivo;
        renderRows(dictionaryRows);
        renderNotes(data.notas || []);
        updateMetaSidebar();
    } catch (error) {
        showError(error.message);
        document.querySelector("#dictionary-body").innerHTML = `
            <tr><td colspan="5">${escapeHtml(error.message)}</td></tr>
        `;
    }
}

async function updateMetaSidebar() {
    try {
        const response = await fetch("/api/meta");
        if (!response.ok) {
            return;
        }
        const meta = await response.json();
        const periodo = meta.periodo || "Sin datos";
        const total = new Intl.NumberFormat("es-PE").format(meta.total_creditos || 0);
        const fuente = document.querySelector("#meta-fuente");
        const periodoEl = document.querySelector("#meta-periodo");
        if (fuente) {
            fuente.textContent = meta.fuente || "DataMart Mivivienda";
        }
        if (periodoEl) {
            periodoEl.textContent = `${periodo} · ${total} creditos`;
        }
    } catch (_error) {
        // La pagina del diccionario puede vivir sin meta.
    }
}

function renderRows(rows) {
    const body = document.querySelector("#dictionary-body");
    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="5">No hay variables para mostrar.</td></tr>`;
        return;
    }
    body.innerHTML = rows
        .map(
            (row) => `
            <tr>
                <td><code>${escapeHtml(row.variable)}</code></td>
                <td>${escapeHtml(row.descripcion)}</td>
                <td>${escapeHtml(row.tipo_dato)}</td>
                <td>${escapeHtml(row.tamano)}</td>
                <td>${escapeHtml(row.info_adicional)}</td>
            </tr>
        `,
        )
        .join("");
}

function renderNotes(notes) {
    const panel = document.querySelector("#dictionary-notes-panel");
    const list = document.querySelector("#dictionary-notes");
    if (!notes.length) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    list.innerHTML = notes
        .map((note) => `<li>${escapeHtml(note)}</li>`)
        .join("");
}

function filterDictionary(event) {
    const term = String(event.target.value || "").trim().toLowerCase();
    if (!term) {
        renderRows(dictionaryRows);
        return;
    }
    const filtered = dictionaryRows.filter((row) =>
        [row.variable, row.descripcion, row.tipo_dato, row.info_adicional]
            .join(" ")
            .toLowerCase()
            .includes(term),
    );
    renderRows(filtered);
}

function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value ?? "";
    return element.innerHTML;
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
