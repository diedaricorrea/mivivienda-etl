(function () {
    function currentTheme() {
        return document.documentElement.getAttribute("data-theme") || "light";
    }

    function syncThemeLabel() {
        const label = document.querySelector("#theme-toggle-label");
        if (label) {
            label.textContent = currentTheme() === "dark" ? "Modo claro" : "Modo oscuro";
        }
    }

    function initTheme() {
        syncThemeLabel();
        document.querySelector("#theme-toggle")?.addEventListener("click", () => {
            const next = currentTheme() === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("mivivienda-theme", next);
            syncThemeLabel();
            window.dispatchEvent(new CustomEvent("mivivienda:theme", { detail: { theme: next } }));
        });
    }

    async function loadMeta() {
        try {
            const response = await fetch("/api/health");
            if (!response.ok) {
                throw new Error("offline");
            }
            const payload = await response.json();
            document.querySelector("#status-dot")?.classList.add("connected");
            const status = document.querySelector("#status-text");
            if (status) {
                status.textContent = "MySQL conectado";
            }
            const meta = payload.meta || {};
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
            const status = document.querySelector("#status-text");
            if (status) {
                status.textContent = "Sin conexion";
            }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        initTheme();
        loadMeta();
    });
})();
