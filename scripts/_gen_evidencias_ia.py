# -*- coding: utf-8 -*-
"""Genera figura de evidencia YoY (deltas) para /proyecto."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sqlalchemy import text

from config.conexion import get_engine

OUT = ROOT / "web/static/img/evidencias"
OUT.mkdir(parents=True, exist_ok=True)

# Estilo academico claro (legible en impresion / proyector)
BG = "#ffffff"
INK = "#1f2937"
MUTED = "#4b5563"
GRID = "#e5e7eb"
UP = "#0f766e"
DOWN = "#b91c1c"
NEUTRAL = "#334155"


def fetch_yoy(anio_a: int = 2018, anio_b: int = 2024):
    sql = text(
        """
        SELECT
            anio,
            COUNT(*) AS cantidad,
            SUM(monto_credito) AS monto_total,
            AVG(monto_credito) AS monto_promedio,
            AVG(tasa_interes) AS tasa_promedio
        FROM vw_creditos_analitica
        WHERE anio IN (:a, :b)
        GROUP BY anio
        ORDER BY anio
        """
    )
    engine = get_engine()
    with engine.connect() as conn:
        rows = [dict(r) for r in conn.execute(sql, {"a": anio_a, "b": anio_b}).mappings()]
    by_year = {int(r["anio"]): r for r in rows}
    return by_year.get(anio_a), by_year.get(anio_b)


def pct(curr: float, prev: float) -> float:
    if not prev:
        return 0.0
    return ((curr - prev) / prev) * 100.0


def fig_yoy_deltas(path: Path, prev: dict, curr: dict):
    anio_a = int(prev["anio"])
    anio_b = int(curr["anio"])
    rows = [
        (
            "Cantidad de creditos",
            float(prev["cantidad"]),
            float(curr["cantidad"]),
            "{:,.0f}",
        ),
        (
            "Monto total (S/)",
            float(prev["monto_total"]),
            float(curr["monto_total"]),
            "{:,.0f}",
        ),
        (
            "Ticket promedio (S/)",
            float(prev["monto_promedio"]),
            float(curr["monto_promedio"]),
            "{:,.0f}",
        ),
        (
            "Tasa promedio (%)",
            float(prev["tasa_promedio"]),
            float(curr["tasa_promedio"]),
            "{:,.2f}",
        ),
    ]

    labels = [r[0] for r in rows]
    deltas = [pct(r[2], r[1]) for r in rows]
    colors = [UP if d >= 0 else DOWN for d in deltas]

    fig, ax = plt.subplots(figsize=(11.2, 5.8), facecolor=BG)
    ax.set_facecolor(BG)
    y = list(range(len(labels) - 1, -1, -1))
    bars = ax.barh(y, deltas, color=colors, height=0.62, edgecolor="#cbd5e1")
    ax.axvline(0, color="#94a3b8", linewidth=1.2)
    ax.set_yticks(y)
    ax.set_yticklabels(labels, color=INK, fontsize=11)
    ax.set_xlabel(f"Variacion porcentual {anio_a} → {anio_b} (%)", color=MUTED)
    ax.tick_params(colors=MUTED)
    ax.grid(axis="x", color=GRID, linestyle="--", linewidth=0.8)
    for spine in ax.spines.values():
        spine.set_color("#cbd5e1")

    ax.set_title(
        f"Comparativo anual nacional: variacion {anio_a} vs {anio_b}",
        color=INK,
        fontsize=14,
        fontweight="bold",
        pad=12,
    )

    xmax = max(abs(d) for d in deltas) * 1.55
    ax.set_xlim(-xmax, xmax)

    for bar, delta, (title, v_prev, v_curr, fmt) in zip(bars, deltas, rows):
        detail = (
            f"{delta:+.1f}%   "
            f"{anio_a}: {fmt.format(v_prev).replace(',', ' ')} → "
            f"{anio_b}: {fmt.format(v_curr).replace(',', ' ')}"
        )
        # Etiqueta siempre al lado exterior de la barra, con margen.
        if delta >= 0:
            x = bar.get_width() + xmax * 0.02
            ha = "left"
        else:
            x = bar.get_width() - xmax * 0.02
            ha = "right"
        ax.text(
            x,
            bar.get_y() + bar.get_height() / 2,
            detail,
            va="center",
            ha=ha,
            color=NEUTRAL,
            fontsize=8.2,
            clip_on=False,
        )

    ax.text(
        0.0,
        -0.18,
        "Fuente: vw_creditos_analitica (DataMart). El grafico muestra el mismo tipo de delta "
        "que calcula el filtro Periodo + Comparar con en el dashboard.",
        transform=ax.transAxes,
        color=MUTED,
        fontsize=8,
    )
    fig.tight_layout()
    fig.savefig(path, dpi=170, facecolor=BG, bbox_inches="tight")
    plt.close(fig)


def main():
    prev, curr = fetch_yoy(2018, 2024)
    if not prev or not curr:
        raise SystemExit("No se pudieron leer KPIs 2018/2024.")
    out = OUT / "ia_yoy_deltas_2018_2024.png"
    fig_yoy_deltas(out, prev, curr)
    # Mantener nombre anterior por compatibilidad de plantilla
    legacy = OUT / "ia_yoy_ejemplo_2018_2024.png"
    legacy.write_bytes(out.read_bytes())
    print("OK", out)


if __name__ == "__main__":
    main()
