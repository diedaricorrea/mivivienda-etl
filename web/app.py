from io import BytesIO, StringIO
from pathlib import Path
import sys
from datetime import datetime

import pandas as pd
from flask import Flask, jsonify, render_template, request, send_file
from sqlalchemy.exc import SQLAlchemyError


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from web.services.dashboard_service import DashboardService


app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
service = DashboardService()


def _request_filters() -> dict[str, str]:
    return {
        "anio": request.args.get("anio", "").strip(),
        "departamento": request.args.get("departamento", "").strip(),
        "producto": request.args.get("producto", "").strip(),
        "tipo_ifi": request.args.get("tipo_ifi", "").strip(),
    }


@app.get("/")
def index():
    return render_template("index.html", module="resumen")


@app.get("/tendencias")
def tendencias():
    return render_template("tendencias.html", module="tendencias")


@app.get("/mapa")
def mapa():
    return render_template("mapa.html", module="mapa")


@app.get("/analisis")
def analisis():
    return render_template("analisis.html", module="analisis")


@app.get("/detalle")
def detalle():
    return render_template("detalle.html", module="detalle")


@app.get("/proyecto")
def proyecto():
    return render_template("proyecto.html")


@app.get("/diccionario")
def diccionario():
    return render_template("diccionario.html")


@app.get("/api/health")
def health():
    try:
        service.check_connection()
        meta = service.get_meta()
        return jsonify({"status": "ok", "database": "connected", "meta": meta})
    except SQLAlchemyError:
        return jsonify({"status": "error", "database": "disconnected"}), 503


@app.get("/api/meta")
def meta():
    return jsonify(service.get_meta())


@app.get("/api/filtros")
def filters():
    return jsonify(service.get_filters())


@app.get("/api/diccionario")
def api_diccionario():
    try:
        return jsonify(service.get_dictionary())
    except FileNotFoundError as error:
        return jsonify({"error": str(error)}), 404
    except Exception as error:
        app.logger.exception("Error al leer diccionario", exc_info=error)
        return jsonify({"error": "No se pudo leer el diccionario de datos."}), 500


@app.get("/api/dashboard")
def dashboard():
    filters = _request_filters()
    page = request.args.get("page", 1, type=int) or 1
    page_size = request.args.get("page_size", 50, type=int) or 50
    return jsonify(
        service.get_dashboard(filters, page=page, page_size=page_size)
    )


@app.get("/api/export")
def export_dashboard():
    filters = _request_filters()
    formato = (request.args.get("formato", "xlsx") or "xlsx").lower()
    payload = service.build_export(filters, formato=formato)
    stamp = datetime.now().strftime("%Y%m%d_%H%M")

    if formato == "csv":
        buffer = StringIO()
        pd.DataFrame(payload["detalle"]).to_csv(buffer, index=False)
        mem = BytesIO(buffer.getvalue().encode("utf-8-sig"))
        mem.seek(0)
        return send_file(
            mem,
            as_attachment=True,
            download_name=f"mivivienda_detalle_{stamp}.csv",
            mimetype="text/csv",
        )

    mem = BytesIO()
    with pd.ExcelWriter(mem, engine="openpyxl") as writer:
        pd.DataFrame(payload["resumen"]).to_excel(
            writer, sheet_name="Resumen_KPI", index=False
        )
        pd.DataFrame(payload["anual"]).to_excel(
            writer, sheet_name="Anual", index=False
        )
        pd.DataFrame(payload["mensual"]).to_excel(
            writer, sheet_name="Mensual", index=False
        )
        pd.DataFrame(payload["trimestres"]).to_excel(
            writer, sheet_name="Trimestres", index=False
        )
        pd.DataFrame(payload["productos"]).to_excel(
            writer, sheet_name="Productos", index=False
        )
        pd.DataFrame(payload["departamentos"]).to_excel(
            writer, sheet_name="Departamentos", index=False
        )
        pd.DataFrame(payload["instituciones"]).to_excel(
            writer, sheet_name="Instituciones", index=False
        )
        pd.DataFrame(payload["detalle"]).to_excel(
            writer, sheet_name="Detalle", index=False
        )
    mem.seek(0)
    return send_file(
        mem,
        as_attachment=True,
        download_name=f"mivivienda_dashboard_{stamp}.xlsx",
        mimetype=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
    )


@app.errorhandler(SQLAlchemyError)
def handle_database_error(error):
    app.logger.exception("Error al consultar MySQL", exc_info=error)
    return jsonify(
        {
            "error": "No se pudo consultar MySQL.",
            "detail": "Verifica el .env y que el Datamart este cargado.",
        }
    ), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
