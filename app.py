import streamlit as st

st.set_page_config(page_title="TaxCo — Plataforma", layout="wide")
st.image("logo.png", width=220)
st.title("TaxCo — Plataforma de Gestão")

st.markdown("""
### Bem-vindo à plataforma TaxCo

Utilize o menu lateral para navegar entre as ferramentas:

- **Simulador** — Precificação de propostas de consultoria tributária
- **Dashboard Conselho** — Painel gerencial com DRE por BU, indicadores e medidores para reunião mensal de conselho
""")
