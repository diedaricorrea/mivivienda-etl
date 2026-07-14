"""Generacion de insights analiticos (reglas) e interpretacion con OpenAI."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


PRODUCT_LABELS = {
    "NMIV": "Nuevo Credito Mivivienda",
    "NCMV": "Nuevo Credito Mivivienda",
    "CMV": "Credito Mivivienda",
    "FCTP": "Financiamiento Complementario Techo Propio",
    "MT": "Mi Terreno",
    "SCRC": "Servicio CRC",
    "S-CRC": "Servicio CRC",
}


def _pct_delta(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None or previous == 0:
        return None
    return round(((current - previous) / previous) * 100, 2)


def _fmt_int(value: float | int) -> str:
    return f"{int(value):,}".replace(",", " ")


def _fmt_money(value: float) -> str:
    return f"S/ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def build_rule_insights(
    kpis: dict[str, Any],
    productos: list[dict],
    concentracion: list[dict],
    yoy: dict[str, Any] | None = None,
    filtros: dict[str, str] | None = None,
) -> list[dict[str, str]]:
    """Construye hallazgos deterministas a partir de KPIs del DataMart."""
    insights: list[dict[str, str]] = []
    filtros = filtros or {}

    monto = float(kpis.get("monto_total") or 0)
    cantidad = float(kpis.get("cantidad") or 0)
    ticket = float(kpis.get("monto_promedio") or 0)
    tasa = float(kpis.get("tasa_promedio") or 0)
    lima = float(kpis.get("concentracion_lima_pct") or 0)
    nmiv = float(kpis.get("participacion_nmiv_pct") or 0)
    crecimiento = kpis.get("crecimiento_mensual_pct")
    mejor = kpis.get("mejor_mes")

    periodo = filtros.get("anio")
    if periodo:
        periodo_txt = f"el periodo {periodo}"
    else:
        periodo_txt = "todos los anios del DataMart (2018-2024)"
    if filtros.get("departamento"):
        ambito = f"en {filtros['departamento']}"
    else:
        ambito = "a nivel nacional"

    insights.append(
        {
            "tipo": "volumen",
            "titulo": "Volumen del universo filtrado",
            "texto": (
                f"En {periodo_txt} {ambito} se observan "
                f"{_fmt_int(cantidad)} creditos por un monto total de "
                f"{_fmt_money(monto)}, con ticket promedio de {_fmt_money(ticket)} "
                f"y tasa promedio de {tasa:.2f}%."
            ),
        }
    )

    if lima >= 60:
        insights.append(
            {
                "tipo": "alerta",
                "titulo": "Alta concentracion geografica",
                "texto": (
                    f"Lima concentra {lima:.1f}% del monto colocado. "
                    "La colocacion muestra sesgo territorial relevante para "
                    "priorizar estrategias de desconcentracion."
                ),
            }
        )
    elif lima >= 40:
        insights.append(
            {
                "tipo": "geo",
                "titulo": "Concentracion moderada en Lima",
                "texto": (
                    f"Lima representa {lima:.1f}% del monto. El resto del pais "
                    "mantiene participacion significativa, aunque Lima sigue liderando."
                ),
            }
        )
    else:
        insights.append(
            {
                "tipo": "geo",
                "titulo": "Distribucion geografica mas dispersa",
                "texto": (
                    f"Lima aporta {lima:.1f}% del monto. La colocacion aparece "
                    "relativamente menos centralizada en la capital."
                ),
            }
        )

    if nmiv >= 75:
        insights.append(
            {
                "tipo": "producto",
                "titulo": "Dominio del Nuevo Credito Mivivienda",
                "texto": (
                    f"NMIV/NCMV concentran {nmiv:.1f}% del monto. "
                    "Las lineas complementarias (FCTP, MT, SCRC) tienen peso residual."
                ),
            }
        )
    else:
        top = productos[0] if productos else None
        if top:
            code = str(top.get("nombre") or "")
            label = PRODUCT_LABELS.get(code, code)
            share = (
                round((float(top.get("monto_total") or 0) / monto) * 100, 1)
                if monto
                else 0
            )
            insights.append(
                {
                    "tipo": "producto",
                    "titulo": "Producto lider por monto",
                    "texto": (
                        f"{label} ({code}) lidera con aproximadamente {share}% "
                        f"del monto en el universo filtrado."
                    ),
                }
            )

    if crecimiento is not None:
        sentido = "crecimiento" if crecimiento >= 0 else "contraccion"
        insights.append(
            {
                "tipo": "tendencia",
                "titulo": f"Senal de {sentido} reciente",
                "texto": (
                    f"La variacion del ultimo periodo comparable es "
                    f"{crecimiento:+.2f}% "
                    f"({kpis.get('mes_actual') or 'actual'} vs "
                    f"{kpis.get('mes_anterior') or 'anterior'})."
                ),
            }
        )

    if mejor:
        insights.append(
            {
                "tipo": "pico",
                "titulo": "Pico de colocacion",
                "texto": (
                    f"El mejor periodo del universo filtrado es {mejor}, "
                    f"con monto de {_fmt_money(float(kpis.get('mejor_mes_monto') or 0))}."
                ),
            }
        )

    if yoy and yoy.get("available"):
        d_monto = yoy.get("deltas", {}).get("monto_total_pct")
        d_cant = yoy.get("deltas", {}).get("cantidad_pct")
        actual = yoy.get("anio_actual")
        previo = yoy.get("anio_previo")
        if d_monto is not None:
            insights.append(
                {
                    "tipo": "yoy",
                    "titulo": f"Comparativo anual {previo} vs {actual}",
                    "texto": (
                        f"Comparando el anio {actual} contra {previo} "
                        f"(mismo resto de filtros), el monto varia "
                        f"{d_monto:+.1f}% y la cantidad de creditos "
                        f"{(d_cant if d_cant is not None else 0):+.1f}%. "
                        "Este hallazgo usa dos instantaneas anuales; no cambia "
                        "el universo de los KPI salvo que Periodo este filtrado."
                    ),
                }
            )

    # Prioriza el insight YoY para que un cambio de anio_comp siempre se refleje.
    yoy_items = [item for item in insights if item.get("tipo") == "yoy"]
    other_items = [item for item in insights if item.get("tipo") != "yoy"]
    max_other = max(0, 6 - len(yoy_items))
    return other_items[:max_other] + yoy_items


MODULE_PROMPTS = {
    "resumen": (
        "Enfoque: resumen ejecutivo de KPIs, concentracion y comparativo anual. "
        "Prioriza senales utiles para decision gerencial."
    ),
    "tendencias": (
        "Enfoque: evolucion temporal (anual/mensual/trimestral). "
        "Destaca crecimiento, contraccion, estacionalidad y puntos de inflexion."
    ),
    "mapa": (
        "Enfoque: concentracion geografica y ranking departamental. "
        "Senala sesgos territoriales y posibles priorizaciones regionales."
    ),
    "analisis": (
        "Enfoque: mix de productos, top departamentos, IFI y tasas. "
        "Compara segmentos y senala donde se concentra el monto o el precio."
    ),
}


def _openai_credentials(
    api_key: str | None = None,
    model: str | None = None,
) -> tuple[str, str]:
    key = api_key or os.getenv("OPENAI_API_KEY", "").strip()
    model_name = model or os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()
    if not key:
        raise RuntimeError("Falta OPENAI_API_KEY en el archivo .env.")
    return key, model_name


def _build_messages(payload: dict[str, Any], modulo: str) -> tuple[str, list[dict[str, str]]]:
    modulo_key = (modulo or "resumen").strip().lower()
    enfoque = MODULE_PROMPTS.get(modulo_key, MODULE_PROMPTS["resumen"])

    if modulo_key == "kpi":
        focus = payload.get("kpi_focus") or {}
        kpi_id = str(focus.get("id") or "indicador")
        kpi_label = str(focus.get("label") or kpi_id)
        system = (
            "Eres un analista de Inteligencia de Negocios del Fondo Mivivienda. "
            "Redacta en espanol formal, claro y util para decision. "
            "Usa EXCLUSIVAMENTE los numeros y hechos del JSON de entrada. "
            "No inventes cifras, fechas ni departamentos. "
            "No propongas predicciones numericas ni proyecciones futuras. "
            f"Enfocate SOLO en el indicador '{kpi_label}' (id: {kpi_id}). "
            "Ignora KPIs no relacionados salvo para dar contexto minimo. "
            "Si el indicador es 'mejor_mes' o 'Mejor periodo', habla del pico "
            "(periodo y monto) y no inventes que ese anio tiene todo el historico. "
            "Estructura la respuesta exactamente asi, con titulos cortos:\n"
            "Interpretacion:\n- ...\n"
            "Contexto:\n- ...\n"
            "Recomendaciones:\n- ...\n"
            "Maximo 130 palabras en total."
        )
        user = (
            f"Analiza el KPI '{kpi_label}' con este contexto del DataMart:\n"
            f"{json.dumps(payload, ensure_ascii=False, default=str)}"
        )
        return modulo_key, [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

    if modulo_key == "chart":
        focus = payload.get("chart_focus") or {}
        chart_id = str(focus.get("id") or "grafico")
        chart_label = str(focus.get("label") or chart_id)
        system = (
            "Eres un analista de Inteligencia de Negocios del Fondo Mivivienda. "
            "Redacta en espanol formal, claro y util para decision. "
            "Usa EXCLUSIVAMENTE los numeros y hechos del JSON de entrada. "
            "No inventes cifras, fechas ni departamentos. "
            "No propongas predicciones numericas ni proyecciones futuras. "
            f"Enfocate SOLO en el grafico '{chart_label}' (id: {chart_id}). "
            "Estructura la respuesta exactamente asi:\n"
            "Interpretacion:\n- ...\n"
            "Contexto:\n- ...\n"
            "Recomendaciones:\n- ...\n"
            "Maximo 140 palabras en total."
        )
        user = (
            f"Analiza el grafico '{chart_label}' con estos datos:\n"
            f"{json.dumps(payload, ensure_ascii=False, default=str)}"
        )
        return modulo_key, [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

    system = (
        "Eres un analista de Inteligencia de Negocios del Fondo Mivivienda. "
        "Redacta en espanol formal, claro y academico. "
        "Usa EXCLUSIVAMENTE los numeros y hechos del JSON de entrada. "
        "No inventes cifras, fechas ni departamentos. "
        "No propongas predicciones numericas ni proyecciones futuras. "
        "La asistencia de IA apoya la lectura de indicadores ya calculados "
        "para acelerar el analisis y la toma de decisiones. "
        f"Modulo activo: {modulo_key}. {enfoque} "
        "Devuelve exactamente 4 bullets cortos orientados a decision."
    )
    user = (
        f"Interpreta el modulo '{modulo_key}' del DataMart de colocaciones:\n"
        f"{json.dumps(payload, ensure_ascii=False, default=str)}"
    )
    return modulo_key, [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


AI_AVISO = (
    "Interpretacion asistida por IA. Los numeros provienen del DataMart; "
    "la IA solo redacta sobre el JSON enviado y no predice valores futuros."
)


def interpret_with_openai(
    payload: dict[str, Any],
    *,
    modulo: str = "resumen",
    api_key: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """
    Solicita interpretacion narrativa a OpenAI usando solo el payload numerico.
    No inventa cifras: el prompt exige basarse exclusivamente en los datos enviados.
    """
    key, model_name = _openai_credentials(api_key, model)
    modulo_key, messages = _build_messages(payload, modulo)

    body = {
        "model": model_name,
        "temperature": 0.2,
        "messages": messages,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"OpenAI respondio {error.code}: {detail[:300]}"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            f"No se pudo contactar OpenAI: {error.reason}"
        ) from error

    content = (
        raw.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )
    if not content:
        raise RuntimeError("OpenAI no devolvio contenido util.")

    return {
        "modelo": model_name,
        "modulo": modulo_key,
        "texto": content,
        "aviso": AI_AVISO,
    }


def stream_interpret_with_openai(
    payload: dict[str, Any],
    *,
    modulo: str = "resumen",
    api_key: str | None = None,
    model: str | None = None,
):
    """
    Genera eventos SSE: meta, delta (trozos de texto) y done/error.
    """
    key, model_name = _openai_credentials(api_key, model)
    modulo_key, messages = _build_messages(payload, modulo)

    yield {
        "tipo": "meta",
        "modelo": model_name,
        "modulo": modulo_key,
        "aviso": AI_AVISO,
    }

    body = {
        "model": model_name,
        "temperature": 0.2,
        "stream": True,
        "messages": messages,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            while True:
                line = response.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="ignore").strip()
                if not decoded or not decoded.startswith("data:"):
                    continue
                data = decoded[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                delta = (
                    chunk.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content")
                )
                if delta:
                    yield {"tipo": "delta", "texto": delta}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        yield {
            "tipo": "error",
            "error": f"OpenAI respondio {error.code}: {detail[:300]}",
        }
        return
    except urllib.error.URLError as error:
        yield {
            "tipo": "error",
            "error": f"No se pudo contactar OpenAI: {error.reason}",
        }
        return

    yield {"tipo": "done"}


def build_yoy_payload(current: dict, previous: dict) -> dict[str, Any]:
    return {
        "monto_total_pct": _pct_delta(
            float(current.get("monto_total") or 0),
            float(previous.get("monto_total") or 0),
        ),
        "cantidad_pct": _pct_delta(
            float(current.get("cantidad") or 0),
            float(previous.get("cantidad") or 0),
        ),
        "monto_promedio_pct": _pct_delta(
            float(current.get("monto_promedio") or 0),
            float(previous.get("monto_promedio") or 0),
        ),
        "tasa_promedio_pct": _pct_delta(
            float(current.get("tasa_promedio") or 0),
            float(previous.get("tasa_promedio") or 0),
        ),
        "participacion_nmiv_pct_pp": round(
            float(current.get("participacion_nmiv_pct") or 0)
            - float(previous.get("participacion_nmiv_pct") or 0),
            2,
        ),
        "concentracion_lima_pct_pp": round(
            float(current.get("concentracion_lima_pct") or 0)
            - float(previous.get("concentracion_lima_pct") or 0),
            2,
        ),
    }
