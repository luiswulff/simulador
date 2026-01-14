import streamlit as st
from engine import precificar, DEMAND_LIBRARY
from proposal import gerar_proposta_docx

st.set_page_config(page_title="Simulador Tax Group", layout="wide")
st.image("logo.png", width=220)
st.title("Simulador de Precificação — Consultoria")

st.subheader("Dados da Proposta")
cliente = st.text_input("Nome do Cliente", value="(preencha aqui)")
cnpj = st.text_input("CNPJ (opcional)", value="")
responsavel = st.text_input("Responsável (opcional)", value="")

col1, col2, col3 = st.columns(3)

with col1:
    praca = st.selectbox("Praça", ["RS", "SP"])
    perfil = st.selectbox("Perfil do Cliente (A–H)", list("ABCDEFGH"))

with col2:
    demand_code = st.selectbox("Tipo de Demanda", list(DEMAND_LIBRARY.keys()))
    complexidade = st.selectbox("Complexidade", ["baixa", "media", "alta", "altissima"])

with col3:
    amplitude = st.selectbox("Amplitude do escopo", ["super_fechado", "fechado", "aberto"])
    prazo = st.number_input("Prazo desejado (dias)", min_value=1, value=30)

descricao = st.text_area("Descrição detalhada da demanda", height=140)

if st.button("Calcular"):
    out = precificar(
        praca=praca,
        profile=perfil,
        demand_code=demand_code,
        complexity=complexidade,
        amplitude=amplitude,
        requested_days=int(prazo),
        description=descricao,
    )

    st.subheader("Resultado")
    c1, c2, c3 = st.columns(3)
    c1.metric("Custo de Entrega (R$)", f"{out['custo_entrega']:,.2f}".replace(",", "X").replace(".", ",").replace("X","."))
    c2.metric("Preço de Venda (R$)", f"{out['preco_venda']:,.2f}".replace(",", "X").replace(".", ",").replace("X","."))
    c3.metric("Horas Totais", f"{out['horas_totais']:.1f}h")

    st.subheader("Horas por cargo")
    st.json(out["horas_por_cargo"])

    st.subheader("Escopo para colar na proposta")
    st.text_area("Texto", out["escopo_para_proposta"], height=260)

    filename = gerar_proposta_docx(out, cliente=cliente, cnpj=cnpj, responsavel=responsavel)
    with open(filename, "rb") as f:
        st.download_button(
            "Baixar Proposta (Word)",
            data=f,
            file_name=filename,
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
