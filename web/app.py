from pathlib import Path
import sys

from flask import Flask, jsonify, render_template, request
from sqlalchemy.exc import SQLAlchemyError


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from web.services.dashboard_service import DashboardService


app = Flask(__name__)
service = DashboardService()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    try:
        service.check_connection()
        return jsonify({"status": "ok", "database": "connected"})
    except SQLAlchemyError:
        return jsonify({"status": "error", "database": "disconnected"}), 503


@app.get("/api/filtros")
def filters():
    return jsonify(service.get_filters())


@app.get("/api/dashboard")
def dashboard():
    filters = {
        "departamento": request.args.get("departamento", "").strip(),
        "producto": request.args.get("producto", "").strip(),
        "tipo_ifi": request.args.get("tipo_ifi", "").strip(),
    }
    return jsonify(service.get_dashboard(filters))


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
