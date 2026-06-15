import sys
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from etl.conexion import get_engine


st.set_page_config(page_title="BI Mivivienda", layout="wide")
st.title("Dashboard de Colocaciones Mivivienda 2024")


@st.cache_data(ttl=300)
def load_data() -> pd.DataFrame:
    query = "SELECT * FROM vw_creditos_analitica"
    return pd.read_sql(query, get_engine())


try:
    data = load_data()
except Exception as exc:
    st.error(
        "No se pudo consultar MySQL. Verifica el .env, ejecuta los scripts SQL "
        "y realiza la carga ETL."
    )
    st.exception(exc)
    st.stop()

departments = sorted(data["departamento"].dropna().unique())
products = sorted(data["codigo_producto"].dropna().unique())
ifi_types = sorted(data["tipo_ifi"].dropna().unique())

selected_departments = st.sidebar.multiselect("Departamento", departments)
selected_products = st.sidebar.multiselect("Producto", products)
selected_ifi_types = st.sidebar.multiselect("Tipo de IFI", ifi_types)

filtered = data.copy()
if selected_departments:
    filtered = filtered[filtered["departamento"].isin(selected_departments)]
if selected_products:
    filtered = filtered[filtered["codigo_producto"].isin(selected_products)]
if selected_ifi_types:
    filtered = filtered[filtered["tipo_ifi"].isin(selected_ifi_types)]

if filtered.empty:
    st.warning("No hay datos para la combinacion de filtros seleccionada.")
    st.stop()

count = int(filtered["cantidad_creditos"].sum())
amount = filtered["monto_credito"].sum()
average = filtered["monto_credito"].mean()
rate = filtered["tasa_interes"].mean()

c1, c2, c3, c4 = st.columns(4)
c1.metric("Cantidad de creditos", f"{count:,}")
c2.metric("Monto total", f"S/ {amount:,.2f}")
c3.metric("Monto promedio", f"S/ {average:,.2f}")
c4.metric("Tasa promedio", f"{rate:.2f}%")

monthly = (
    filtered.groupby(["mes_numero", "mes_nombre"], as_index=False)["monto_credito"]
    .sum()
    .sort_values("mes_numero")
)
by_department = (
    filtered.groupby("departamento", as_index=False)["monto_credito"]
    .sum()
    .nlargest(10, "monto_credito")
)
by_product = filtered.groupby("codigo_producto", as_index=False)[
    "cantidad_creditos"
].sum()
by_ifi = (
    filtered.groupby("nombre_ifi", as_index=False)["monto_credito"]
    .sum()
    .nlargest(10, "monto_credito")
)

left, right = st.columns(2)
with left:
    st.subheader("Monto colocado por mes")
    st.plotly_chart(
        px.line(
            monthly,
            x="mes_nombre",
            y="monto_credito",
            markers=True,
            labels={"mes_nombre": "Mes", "monto_credito": "Monto (S/)"},
        ),
        use_container_width=True,
    )
with right:
    st.subheader("Participacion por producto")
    st.plotly_chart(
        px.pie(
            by_product,
            names="codigo_producto",
            values="cantidad_creditos",
        ),
        use_container_width=True,
    )

left, right = st.columns(2)
with left:
    st.subheader("Top 10 departamentos")
    st.plotly_chart(
        px.bar(
            by_department,
            x="monto_credito",
            y="departamento",
            orientation="h",
            labels={"monto_credito": "Monto (S/)", "departamento": ""},
        ),
        use_container_width=True,
    )
with right:
    st.subheader("Top 10 instituciones financieras")
    st.plotly_chart(
        px.bar(
            by_ifi,
            x="monto_credito",
            y="nombre_ifi",
            orientation="h",
            labels={"monto_credito": "Monto (S/)", "nombre_ifi": ""},
        ),
        use_container_width=True,
    )

st.subheader("Detalle analitico")
st.dataframe(filtered, use_container_width=True, hide_index=True)
