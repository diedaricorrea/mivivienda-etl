# -*- coding: utf-8 -*-
"""Genera evidencias PNG + metricas.json desde etl_ejecucion."""
from __future__ import annotations

import json
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from sqlalchemy import text

from config.conexion import get_engine

OUT = Path("web/static/img/evidencias")
OUT.mkdir(parents=True, exist_ok=True)

FACT_ESPERADO = 76338


def year_from_name(name: str) -> int | None:
    m = re.search(r"(20\d{2})", name)
    return int(m.group(1)) if m else None


def fetch_rows():
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT e.*
                FROM etl_ejecucion e
                INNER JOIN (
                    SELECT archivo_origen, MAX(id_ejecucion) AS id
                    FROM etl_ejecucion
                    WHERE estado = 'OK'
                    GROUP BY archivo_origen
                ) t ON e.id_ejecucion = t.id
                ORDER BY e.archivo_origen
                """
            )
        ).mappings().all()
        fact_n = conn.execute(text("SELECT COUNT(*) FROM fact_credito")).scalar()
    return [dict(r) for r in rows], int(fact_n)


def enrich(rows, fact_n):
    items = []
    for r in rows:
        anio = year_from_name(r["archivo_origen"] or "")
        # incremental OK con 0 insertadas: la contribucion al fact es transformadas
        insertadas = int(r["filas_insertadas"] or 0)
        transformadas = int(r["filas_transformadas"] or 0)
        if insertadas == 0 and transformadas > 0:
            insertadas_mostrar = transformadas
        else:
            insertadas_mostrar = insertadas
        items.append(
            {
                "anio": anio,
                "archivo": r["archivo_origen"],
                "id_ejecucion": r["id_ejecucion"],
                "origen": int(r["filas_origen"] or 0),
                "vacias": int(r["filas_vacias"] or 0),
                "invalidas": int(r["filas_invalidas"] or 0),
                "duplicados": int(r["duplicados_eliminados"] or 0),
                "transformadas": transformadas,
                "insertadas": insertadas,
                "insertadas_mostrar": insertadas_mostrar,
            }
        )
    items.sort(key=lambda x: (x["anio"] is None, x["anio"] or 0, x["archivo"]))
    totals = {
        "filas_origen": sum(i["origen"] for i in items),
        "filas_vacias": sum(i["vacias"] for i in items),
        "filas_invalidas": sum(i["invalidas"] for i in items),
        "duplicados_eliminados": sum(i["duplicados"] for i in items),
        "filas_transformadas": sum(i["transformadas"] for i in items),
        "filas_insertadas_log": sum(i["insertadas"] for i in items),
        "filas_insertadas_efectivas": sum(i["insertadas_mostrar"] for i in items),
        "hechos_fact_credito": fact_n,
        "archivos": len(items),
    }
    # embudo
    o = totals["filas_origen"]
    sin_vacias = o - totals["filas_vacias"]
    sin_invalidas = sin_vacias - totals["filas_invalidas"]
    unicas = sin_invalidas - totals["duplicados_eliminados"]
    totals["embudo"] = {
        "origen": o,
        "sin_vacias": sin_vacias,
        "sin_invalidas": sin_invalidas,
        "unicas_tras_dups": unicas,
        "hechos_cargados": fact_n,
    }
    return items, totals


def fig_resumen_consola(items, totals, path: Path):
    fig, ax = plt.subplots(figsize=(12, 8.5), facecolor="#0d1117")
    ax.set_facecolor("#0d1117")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    green = "#3fb950"
    cyan = "#58a6ff"
    muted = "#8b949e"
    white = "#e6edf3"
    yellow = "#d29922"

    y = 0.94
    ax.text(0.04, y, "ETL Mivivienda · carga multi-anio 2018-2024",
            color=green, fontsize=16, fontweight="bold", fontfamily="monospace",
            va="top")
    y -= 0.055
    ax.text(0.04, y, "$ resumen · ultimas ejecuciones OK por archivo_origen",
            color=muted, fontsize=10, fontfamily="monospace", va="top")
    y -= 0.06

    lines = [
        (f"filas origen .............. {totals['filas_origen']:>8,}", white),
        (f"filas vacias .............. {totals['filas_vacias']:>8,}", muted),
        (f"filas invalidas ........... {totals['filas_invalidas']:>8,}", muted),
        (f"duplicados eliminados ..... {totals['duplicados_eliminados']:>8,}", muted),
        (f"filas transformadas ....... {totals['filas_transformadas']:>8,}", cyan),
        (f"hechos en fact_credito .... {totals['hechos_fact_credito']:>8,}", green),
    ]
    for text_line, color in lines:
        ax.text(0.06, y, text_line.replace(",", " "), color=color, fontsize=12,
                fontfamily="monospace", va="top")
        y -= 0.045

    y -= 0.02
    ax.text(0.04, y, "─" * 72, color="#21262d", fontsize=10, fontfamily="monospace", va="top")
    y -= 0.045
    ax.text(0.04, y, "por archivo (insertadas efectivas → fact)",
            color=yellow, fontsize=11, fontfamily="monospace", va="top")
    y -= 0.045

    for i in items:
        anio = i["anio"] or "?"
        ax.text(
            0.06, y,
            f"  {anio}  {i['archivo'][:42]:<42}  {i['insertadas_mostrar']:>6}",
            color=white, fontsize=10, fontfamily="monospace", va="top",
        )
        y -= 0.038

    y -= 0.02
    ax.text(
        0.04, y,
        f"OK · {totals['archivos']} archivos · suma transformadas = {totals['filas_transformadas']}",
        color=green, fontsize=10, fontfamily="monospace", va="top",
    )
    fig.tight_layout(pad=0.8)
    fig.savefig(path, dpi=160, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close(fig)


def fig_calidad_tabla(items, path: Path):
    fig, ax = plt.subplots(figsize=(14, 5.5), facecolor="#f6f8fa")
    ax.set_facecolor("#f6f8fa")
    ax.axis("off")
    ax.set_title("Calidad ETL por anio (ultimas ejecuciones OK)", fontsize=14,
                 fontweight="bold", color="#24292f", pad=12)

    col_labels = [
        "Anio", "Archivo", "Origen", "Vacias", "Invalidas",
        "Duplicados", "Transformadas", "Insertadas",
    ]
    cell_text = []
    for i in items:
        cell_text.append([
            str(i["anio"] or ""),
            i["archivo"][:36] + ("…" if len(i["archivo"]) > 36 else ""),
            f"{i['origen']:,}".replace(",", " "),
            f"{i['vacias']:,}".replace(",", " "),
            f"{i['invalidas']:,}".replace(",", " "),
            f"{i['duplicados']:,}".replace(",", " "),
            f"{i['transformadas']:,}".replace(",", " "),
            f"{i['insertadas_mostrar']:,}".replace(",", " "),
        ])

    # totales
    cell_text.append([
        "",
        "TOTAL",
        f"{sum(i['origen'] for i in items):,}".replace(",", " "),
        f"{sum(i['vacias'] for i in items):,}".replace(",", " "),
        f"{sum(i['invalidas'] for i in items):,}".replace(",", " "),
        f"{sum(i['duplicados'] for i in items):,}".replace(",", " "),
        f"{sum(i['transformadas'] for i in items):,}".replace(",", " "),
        f"{sum(i['insertadas_mostrar'] for i in items):,}".replace(",", " "),
    ])

    table = ax.table(
        cellText=cell_text,
        colLabels=col_labels,
        loc="center",
        cellLoc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.scale(1.0, 1.45)

    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor("#d0d7de")
        if row == 0:
            cell.set_facecolor("#0969da")
            cell.set_text_props(color="white", fontweight="bold")
        elif row == len(cell_text):
            cell.set_facecolor("#ddf4ff")
            cell.set_text_props(fontweight="bold")
        elif row % 2 == 0:
            cell.set_facecolor("#ffffff")
        else:
            cell.set_facecolor("#f6f8fa")
        if col == 1 and row > 0:
            cell.set_text_props(ha="left")

    fig.tight_layout()
    fig.savefig(path, dpi=160, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)


def fig_embudo(totals, path: Path):
    emb = totals["embudo"]
    labels = [
        "Origen",
        "Sin vacias",
        "Sin invalidas",
        "Unicas (tras dups)",
        "Hechos cargados",
    ]
    values = [
        emb["origen"],
        emb["sin_vacias"],
        emb["sin_invalidas"],
        emb["unicas_tras_dups"],
        emb["hechos_cargados"],
    ]
    colors = ["#1f6feb", "#388bfd", "#58a6ff", "#79c0ff", "#3fb950"]

    fig, ax = plt.subplots(figsize=(11, 6), facecolor="#0d1117")
    ax.set_facecolor("#0d1117")
    y_pos = list(range(len(labels) - 1, -1, -1))
    bars = ax.barh(y_pos, values, color=colors, height=0.65, edgecolor="#21262d")
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, color="#e6edf3", fontsize=11, fontfamily="sans-serif")
    ax.set_xlabel("Filas", color="#8b949e")
    ax.tick_params(colors="#8b949e")
    for spine in ax.spines.values():
        spine.set_color("#30363d")
    ax.set_title(
        "Embudo ETL multi-anio 2018-2024",
        color="#e6edf3",
        fontsize=14,
        fontweight="bold",
        pad=12,
    )
    xmax = max(values) * 1.18
    ax.set_xlim(0, xmax)
    for bar, val in zip(bars, values):
        ax.text(
            bar.get_width() + xmax * 0.01,
            bar.get_y() + bar.get_height() / 2,
            f"{val:,}".replace(",", " "),
            va="center",
            color="#e6edf3",
            fontsize=11,
            fontfamily="monospace",
        )
    # flechas conceptuales
    ax.text(
        0.98, 0.02,
        "Origen → Sin vacias → Sin invalidas → Unicas → Hechos",
        transform=ax.transAxes,
        ha="right",
        color="#8b949e",
        fontsize=8,
    )
    fig.tight_layout()
    fig.savefig(path, dpi=160, facecolor=fig.get_facecolor())
    plt.close(fig)


def main():
    rows, fact_n = fetch_rows()
    items, totals = enrich(rows, fact_n)

    print("=" * 60)
    print("METRICAS AGREGADAS (ultimas OK por archivo_origen)")
    print("=" * 60)
    for i in items:
        print(
            f"  {i['anio']} | {i['archivo']}\n"
            f"      origen={i['origen']} vacias={i['vacias']} invalidas={i['invalidas']} "
            f"dups={i['duplicados']} transformadas={i['transformadas']} "
            f"insertadas_log={i['insertadas']} insertadas_efectivas={i['insertadas_mostrar']}"
        )
    print("-" * 60)
    for k, v in totals.items():
        if k != "embudo":
            print(f"  {k}: {v}")
    print("  embudo:")
    for k, v in totals["embudo"].items():
        print(f"    {k}: {v}")
    print("=" * 60)

    p1 = OUT / "etl_resumen_consola.png"
    p2 = OUT / "etl_calidad_por_anio.png"
    p3 = OUT / "etl_embudo_multianio.png"
    pjson = OUT / "metricas.json"

    fig_resumen_consola(items, totals, p1)
    fig_calidad_tabla(items, p2)
    fig_embudo(totals, p3)

    payload = {
        "titulo": "ETL Mivivienda · carga multi-anio 2018-2024",
        "por_archivo": items,
        "totales": {k: v for k, v in totals.items() if k != "embudo"},
        "embudo": totals["embudo"],
        "nota": (
            "Filas desde MAX(id_ejecucion) por archivo_origen con estado=OK. "
            "insertadas_mostrar usa transformadas cuando insertadas_log=0 (carga incremental)."
        ),
    }
    # datetime-safe: items already plain ints/str
    pjson.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Saved: {p1}")
    print(f"Saved: {p2}")
    print(f"Saved: {p3}")
    print(f"Saved: {pjson}")
    if fact_n != FACT_ESPERADO:
        print(f"WARN: fact_credito={fact_n} (esperado {FACT_ESPERADO})")
    else:
        print(f"OK: fact_credito={fact_n}")


if __name__ == "__main__":
    main()
