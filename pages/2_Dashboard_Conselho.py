import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dados_dre import (
    BUS, BU_NOMES, MESES,
    carregar_dados, consolidar_dre, consolidar_orcamento,
    indicadores_operacionais,
)

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Dashboard Conselho — TaxCo", layout="wide")

# ── CSS customizado ──────────────────────────────────────────────────────────
st.markdown("""
<style>
    .block-container {padding-top: 1rem;}
    [data-testid="stMetric"] {
        background: #f8f9fb; border-radius: 8px; padding: 12px 16px;
        border-left: 4px solid #1f77b4;
    }
    [data-testid="stMetric"] label {font-size: 0.78rem !important;}
    h1 {color: #1a3353;}
    h2, h3 {color: #2c5282;}
    .stTabs [data-baseweb="tab-list"] {gap: 8px;}
    .stTabs [data-baseweb="tab"] {
        padding: 8px 20px; font-weight: 600;
    }
</style>
""", unsafe_allow_html=True)

# ── Header ───────────────────────────────────────────────────────────────────
logo_path = os.path.join(os.path.dirname(__file__), "..", "logo.png")
if os.path.exists(logo_path):
    st.image(logo_path, width=180)

st.title("Dashboard — Reunião de Conselho")
st.caption("TaxCo | Demonstrativo de Resultados por Business Unit")

# ── Sidebar: filtros ─────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Filtros")
    ano = st.selectbox("Ano", [2026, 2025], index=0)
    mes_sel = st.selectbox("Mês de referência", MESES, index=1)  # Fev como default
    mes_idx = MESES.index(mes_sel)

    st.divider()
    bu_selecionadas = st.multiselect(
        "Business Units",
        BUS,
        default=BUS,
        format_func=lambda x: f"{x} — {BU_NOMES[x]}",
    )

# ── Carregar dados ───────────────────────────────────────────────────────────
dados = carregar_dados(ano)

# ── Helpers ──────────────────────────────────────────────────────────────────
def fmt_brl(valor):
    """Formata número como R$ brasileiro (em milhares)."""
    if abs(valor) >= 1000:
        return f"R$ {valor:,.0f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {valor:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(valor):
    return f"{valor:.1f}%"


def delta_pct(real, orc):
    if orc == 0:
        return 0
    return round((real / orc - 1) * 100, 1)


def cor_delta(val):
    return "normal" if val >= 0 else "inverse"


def gauge_chart(title, value, reference=100, suffix="%", range_max=None):
    """Cria um gauge (velocímetro) com Plotly."""
    if range_max is None:
        range_max = max(reference * 1.3, value * 1.2, 100)

    fig = go.Figure(go.Indicator(
        mode="gauge+number+delta",
        value=value,
        number={"suffix": suffix, "font": {"size": 28}},
        delta={"reference": reference, "suffix": suffix, "relative": False},
        title={"text": title, "font": {"size": 14}},
        gauge={
            "axis": {"range": [0, range_max], "ticksuffix": suffix},
            "bar": {"color": "#1f77b4"},
            "steps": [
                {"range": [0, reference * 0.7], "color": "#fee2e2"},
                {"range": [reference * 0.7, reference * 0.9], "color": "#fef9c3"},
                {"range": [reference * 0.9, range_max], "color": "#dcfce7"},
            ],
            "threshold": {
                "line": {"color": "#dc2626", "width": 3},
                "thickness": 0.8,
                "value": reference,
            },
        },
    ))
    fig.update_layout(height=220, margin=dict(t=40, b=10, l=30, r=30))
    return fig


# ══════════════════════════════════════════════════════════════════════════════
# VISÃO CONSOLIDADA
# ══════════════════════════════════════════════════════════════════════════════

# Filtrar apenas BUs selecionadas
dados_filtrado = {bu: dados[bu] for bu in bu_selecionadas}

df_consol = consolidar_dre(dados_filtrado)
df_orc_consol = consolidar_orcamento(dados_filtrado)

# Dados do mês selecionado
row = df_consol[df_consol["Mês"] == mes_sel].iloc[0]
row_orc = df_orc_consol[df_orc_consol["Mês"] == mes_sel].iloc[0]

# Acumulado YTD
ytd = df_consol[df_consol["Mês_Num"] <= mes_idx + 1]
ytd_orc = df_orc_consol[df_orc_consol["Mês_Num"] <= mes_idx + 1]

# ── KPIs Consolidados ────────────────────────────────────────────────────────
st.header(f"Visão Consolidada — {mes_sel}/{ano}")

k1, k2, k3, k4, k5, k6 = st.columns(6)

with k1:
    v, o = row["Receita Líquida"], row_orc["Receita Líquida"]
    st.metric("Receita Líquida", fmt_brl(v), f"{delta_pct(v, o):+.1f}% vs Orç.", delta_color=cor_delta(delta_pct(v, o)))

with k2:
    v, o = row["Lucro Bruto"], row_orc["Lucro Bruto"]
    st.metric("Lucro Bruto", fmt_brl(v), f"{delta_pct(v, o):+.1f}% vs Orç.", delta_color=cor_delta(delta_pct(v, o)))

with k3:
    v, o = row["EBITDA"], row_orc["EBITDA"]
    st.metric("EBITDA", fmt_brl(v), f"{delta_pct(v, o):+.1f}% vs Orç.", delta_color=cor_delta(delta_pct(v, o)))

with k4:
    v, o = row["Lucro Líquido"], row_orc["Lucro Líquido"]
    st.metric("Lucro Líquido", fmt_brl(v), f"{delta_pct(v, o):+.1f}% vs Orç.", delta_color=cor_delta(delta_pct(v, o)))

with k5:
    mg_bruta = (row["Lucro Bruto"] / row["Receita Líquida"] * 100) if row["Receita Líquida"] else 0
    mg_bruta_orc = (row_orc["Lucro Bruto"] / row_orc["Receita Líquida"] * 100) if row_orc["Receita Líquida"] else 0
    st.metric("Margem Bruta", pct(mg_bruta), f"{mg_bruta - mg_bruta_orc:+.1f} p.p.", delta_color=cor_delta(mg_bruta - mg_bruta_orc))

with k6:
    mg_ebitda = (row["EBITDA"] / row["Receita Líquida"] * 100) if row["Receita Líquida"] else 0
    mg_ebitda_orc = (row_orc["EBITDA"] / row_orc["Receita Líquida"] * 100) if row_orc["Receita Líquida"] else 0
    st.metric("Margem EBITDA", pct(mg_ebitda), f"{mg_ebitda - mg_ebitda_orc:+.1f} p.p.", delta_color=cor_delta(mg_ebitda - mg_ebitda_orc))

# ── Gauges ────────────────────────────────────────────────────────────────────
st.subheader("Medidores de Performance")
g1, g2, g3, g4 = st.columns(4)

with g1:
    ating_receita = (row["Receita Líquida"] / row_orc["Receita Líquida"] * 100) if row_orc["Receita Líquida"] else 0
    st.plotly_chart(gauge_chart("Atingimento Receita", round(ating_receita, 1), 100), use_container_width=True)

with g2:
    ating_ebitda = (row["EBITDA"] / row_orc["EBITDA"] * 100) if row_orc["EBITDA"] else 0
    st.plotly_chart(gauge_chart("Atingimento EBITDA", round(ating_ebitda, 1), 100), use_container_width=True)

with g3:
    st.plotly_chart(gauge_chart("Margem Bruta", round(mg_bruta, 1), round(mg_bruta_orc, 1), range_max=60), use_container_width=True)

with g4:
    mg_liq = (row["Lucro Líquido"] / row["Receita Líquida"] * 100) if row["Receita Líquida"] else 0
    mg_liq_orc = (row_orc["Lucro Líquido"] / row_orc["Receita Líquida"] * 100) if row_orc["Receita Líquida"] else 0
    st.plotly_chart(gauge_chart("Margem Líquida", round(mg_liq, 1), round(mg_liq_orc, 1), range_max=30), use_container_width=True)

# ── Gráficos de evolução ─────────────────────────────────────────────────────
st.subheader("Evolução Mensal")
tab_ev1, tab_ev2, tab_ev3 = st.tabs(["Receita x Orçamento", "EBITDA x Orçamento", "Margens"])

with tab_ev1:
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df_consol["Mês"], y=df_consol["Receita Líquida"],
        name="Realizado", marker_color="#1f77b4"
    ))
    fig.add_trace(go.Scatter(
        x=df_orc_consol["Mês"], y=df_orc_consol["Receita Líquida"],
        name="Orçamento", mode="lines+markers",
        line=dict(color="#dc2626", dash="dash", width=2)
    ))
    fig.update_layout(
        title="Receita Líquida Consolidada (R$ mil)",
        yaxis_title="R$ mil", height=380,
        legend=dict(orientation="h", y=1.12),
        margin=dict(t=60, b=40),
    )
    st.plotly_chart(fig, use_container_width=True)

with tab_ev2:
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df_consol["Mês"], y=df_consol["EBITDA"],
        name="Realizado", marker_color="#2ca02c"
    ))
    fig.add_trace(go.Scatter(
        x=df_orc_consol["Mês"], y=df_orc_consol["EBITDA"],
        name="Orçamento", mode="lines+markers",
        line=dict(color="#dc2626", dash="dash", width=2)
    ))
    fig.update_layout(
        title="EBITDA Consolidado (R$ mil)",
        yaxis_title="R$ mil", height=380,
        legend=dict(orientation="h", y=1.12),
        margin=dict(t=60, b=40),
    )
    st.plotly_chart(fig, use_container_width=True)

with tab_ev3:
    margens_real = pd.DataFrame({
        "Mês": df_consol["Mês"],
        "Margem Bruta (%)": (df_consol["Lucro Bruto"] / df_consol["Receita Líquida"] * 100).round(1),
        "Margem EBITDA (%)": (df_consol["EBITDA"] / df_consol["Receita Líquida"] * 100).round(1),
        "Margem Líquida (%)": (df_consol["Lucro Líquido"] / df_consol["Receita Líquida"] * 100).round(1),
    })
    fig = px.line(
        margens_real.melt(id_vars="Mês", var_name="Indicador", value_name="Valor"),
        x="Mês", y="Valor", color="Indicador",
        markers=True,
    )
    fig.update_layout(
        title="Evolução das Margens (%)",
        yaxis_title="%", height=380,
        legend=dict(orientation="h", y=1.12),
        margin=dict(t=60, b=40),
    )
    st.plotly_chart(fig, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# DRE CONSOLIDADO (TABELA)
# ══════════════════════════════════════════════════════════════════════════════

st.header("DRE Consolidado")

linhas_dre = [
    "Receita Bruta", "(-) Deduções", "Receita Líquida",
    "(-) CPV", "Lucro Bruto",
    "(-) Desp. Pessoal", "(-) Desp. Administrativas", "(-) Desp. Comerciais",
    "Total Desp. Operacionais", "EBITDA",
    "(-) D&A", "EBIT", "Resultado Financeiro",
    "LAIR", "(-) IR/CSLL", "Lucro Líquido",
]

# Tabela DRE - mês selecionado + YTD
dre_tab = pd.DataFrame({
    "Linha": linhas_dre,
    f"Real {mes_sel}": [row[l] for l in linhas_dre],
    f"Orç. {mes_sel}": [row_orc[l] for l in linhas_dre],
    "Δ Mês (%)": [delta_pct(row[l], row_orc[l]) if row_orc[l] != 0 else 0 for l in linhas_dre],
    "Real YTD": [ytd[l].sum() for l in linhas_dre],
    "Orç. YTD": [ytd_orc[l].sum() for l in linhas_dre],
    "Δ YTD (%)": [delta_pct(ytd[l].sum(), ytd_orc[l].sum()) if ytd_orc[l].sum() != 0 else 0 for l in linhas_dre],
})

# Destacar linhas-chave
def highlight_dre(row):
    destaque = ["Receita Líquida", "Lucro Bruto", "EBITDA", "EBIT", "Lucro Líquido"]
    if row["Linha"] in destaque:
        return ["font-weight: bold; background-color: #eef2ff"] * len(row)
    return [""] * len(row)

st.dataframe(
    dre_tab.style
    .apply(highlight_dre, axis=1)
    .format({
        f"Real {mes_sel}": "{:,.1f}",
        f"Orç. {mes_sel}": "{:,.1f}",
        "Δ Mês (%)": "{:+.1f}%",
        "Real YTD": "{:,.1f}",
        "Orç. YTD": "{:,.1f}",
        "Δ YTD (%)": "{:+.1f}%",
    }),
    use_container_width=True,
    hide_index=True,
    height=620,
)


# ══════════════════════════════════════════════════════════════════════════════
# ABERTURA POR BU
# ══════════════════════════════════════════════════════════════════════════════

st.header("Abertura por Business Unit")

# ── Comparativo de BUs ────────────────────────────────────────────────────────
st.subheader(f"Comparativo BUs — {mes_sel}/{ano}")

comp_data = []
for bu in bu_selecionadas:
    r = dados[bu]["realizado"]
    o = dados[bu]["orcamento"]
    r_mes = r[r["Mês"] == mes_sel].iloc[0]
    o_mes = o[o["Mês"] == mes_sel].iloc[0]

    comp_data.append({
        "BU": f"{bu}",
        "Nome": BU_NOMES[bu],
        "Receita Líq.": r_mes["Receita Líquida"],
        "Orç. Receita": o_mes["Receita Líquida"],
        "Δ Receita (%)": delta_pct(r_mes["Receita Líquida"], o_mes["Receita Líquida"]),
        "EBITDA": r_mes["EBITDA"],
        "Orç. EBITDA": o_mes["EBITDA"],
        "Δ EBITDA (%)": delta_pct(r_mes["EBITDA"], o_mes["EBITDA"]),
        "Mg. Bruta (%)": round(r_mes["Lucro Bruto"] / r_mes["Receita Líquida"] * 100, 1) if r_mes["Receita Líquida"] else 0,
        "Mg. EBITDA (%)": round(r_mes["EBITDA"] / r_mes["Receita Líquida"] * 100, 1) if r_mes["Receita Líquida"] else 0,
        "Lucro Líq.": r_mes["Lucro Líquido"],
    })

df_comp = pd.DataFrame(comp_data)
st.dataframe(
    df_comp.style.format({
        "Receita Líq.": "{:,.1f}",
        "Orç. Receita": "{:,.1f}",
        "Δ Receita (%)": "{:+.1f}%",
        "EBITDA": "{:,.1f}",
        "Orç. EBITDA": "{:,.1f}",
        "Δ EBITDA (%)": "{:+.1f}%",
        "Mg. Bruta (%)": "{:.1f}%",
        "Mg. EBITDA (%)": "{:.1f}%",
        "Lucro Líq.": "{:,.1f}",
    }),
    use_container_width=True,
    hide_index=True,
)

# ── Gráfico Receita por BU ───────────────────────────────────────────────────
col_chart1, col_chart2 = st.columns(2)

with col_chart1:
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df_comp["BU"], y=df_comp["Receita Líq."],
        name="Realizado", marker_color="#1f77b4"
    ))
    fig.add_trace(go.Bar(
        x=df_comp["BU"], y=df_comp["Orç. Receita"],
        name="Orçamento", marker_color="#aec7e8"
    ))
    fig.update_layout(
        title="Receita Líquida por BU (R$ mil)",
        barmode="group", height=350,
        margin=dict(t=50, b=40),
    )
    st.plotly_chart(fig, use_container_width=True)

with col_chart2:
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df_comp["BU"], y=df_comp["EBITDA"],
        name="Realizado", marker_color="#2ca02c"
    ))
    fig.add_trace(go.Bar(
        x=df_comp["BU"], y=df_comp["Orç. EBITDA"],
        name="Orçamento", marker_color="#98df8a"
    ))
    fig.update_layout(
        title="EBITDA por BU (R$ mil)",
        barmode="group", height=350,
        margin=dict(t=50, b=40),
    )
    st.plotly_chart(fig, use_container_width=True)

# ── Participação na Receita (treemap) ────────────────────────────────────────
st.subheader("Participação na Receita")
fig_tree = px.treemap(
    df_comp, path=["BU"], values="Receita Líq.",
    color="Mg. EBITDA (%)",
    color_continuous_scale="RdYlGn",
    title="Receita Líquida por BU (tamanho) e Margem EBITDA (cor)",
)
fig_tree.update_layout(height=400, margin=dict(t=50, b=20))
st.plotly_chart(fig_tree, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# DRE DETALHADO POR BU (ABAS)
# ══════════════════════════════════════════════════════════════════════════════

st.header("DRE Detalhado por BU")

tabs_bu = st.tabs([f"{bu} — {BU_NOMES[bu]}" for bu in bu_selecionadas])

for i, bu in enumerate(bu_selecionadas):
    with tabs_bu[i]:
        df_real = dados[bu]["realizado"]
        df_orc = dados[bu]["orcamento"]
        r_mes = df_real[df_real["Mês"] == mes_sel].iloc[0]
        o_mes = df_orc[df_orc["Mês"] == mes_sel].iloc[0]

        # KPIs da BU
        kpi = indicadores_operacionais(bu, ano)
        kc1, kc2, kc3, kc4 = st.columns(4)
        with kc1:
            st.metric("Headcount", kpi["headcount"])
        with kc2:
            st.metric("Projetos Ativos", kpi["projetos_ativos"])
        with kc3:
            st.metric("Taxa Utilização", pct(kpi["taxa_utilizacao"] * 100))
        with kc4:
            st.metric("NPS", kpi["nps"])

        kc5, kc6, kc7, kc8 = st.columns(4)
        with kc5:
            st.metric("Ticket Médio (R$ mil)", f"{kpi['ticket_medio']:,.1f}")
        with kc6:
            st.metric("Projetos Entregues/Mês", kpi["projetos_entregues_mes"])
        with kc7:
            st.metric("Inadimplência", pct(kpi["inadimplencia_pct"] * 100))
        with kc8:
            st.metric("Churn", pct(kpi["churn_pct"] * 100))

        # Gauges da BU
        g1, g2 = st.columns(2)
        with g1:
            ating = (r_mes["Receita Líquida"] / o_mes["Receita Líquida"] * 100) if o_mes["Receita Líquida"] else 0
            st.plotly_chart(gauge_chart("Ating. Receita", round(ating, 1), 100), use_container_width=True)
        with g2:
            ating_eb = (r_mes["EBITDA"] / o_mes["EBITDA"] * 100) if o_mes["EBITDA"] else 0
            st.plotly_chart(gauge_chart("Ating. EBITDA", round(ating_eb, 1), 100), use_container_width=True)

        # DRE da BU
        ytd_bu = df_real[df_real["Mês_Num"] <= mes_idx + 1]
        ytd_orc_bu = df_orc[df_orc["Mês_Num"] <= mes_idx + 1]

        dre_bu = pd.DataFrame({
            "Linha": linhas_dre,
            f"Real {mes_sel}": [r_mes[l] for l in linhas_dre],
            f"Orç. {mes_sel}": [o_mes[l] for l in linhas_dre],
            "Δ (%)": [delta_pct(r_mes[l], o_mes[l]) if o_mes[l] != 0 else 0 for l in linhas_dre],
            "Real YTD": [ytd_bu[l].sum() for l in linhas_dre],
            "Orç. YTD": [ytd_orc_bu[l].sum() for l in linhas_dre],
            "Δ YTD (%)": [delta_pct(ytd_bu[l].sum(), ytd_orc_bu[l].sum()) if ytd_orc_bu[l].sum() != 0 else 0 for l in linhas_dre],
        })

        st.dataframe(
            dre_bu.style
            .apply(highlight_dre, axis=1)
            .format({
                f"Real {mes_sel}": "{:,.1f}",
                f"Orç. {mes_sel}": "{:,.1f}",
                "Δ (%)": "{:+.1f}%",
                "Real YTD": "{:,.1f}",
                "Orç. YTD": "{:,.1f}",
                "Δ YTD (%)": "{:+.1f}%",
            }),
            use_container_width=True,
            hide_index=True,
            height=580,
        )

        # Evolução mensal da BU
        fig_bu = go.Figure()
        fig_bu.add_trace(go.Bar(
            x=df_real["Mês"], y=df_real["Receita Líquida"],
            name="Receita Real", marker_color="#1f77b4"
        ))
        fig_bu.add_trace(go.Scatter(
            x=df_orc["Mês"], y=df_orc["Receita Líquida"],
            name="Receita Orç.", mode="lines+markers",
            line=dict(color="#dc2626", dash="dash")
        ))
        fig_bu.add_trace(go.Bar(
            x=df_real["Mês"], y=df_real["EBITDA"],
            name="EBITDA Real", marker_color="#2ca02c", opacity=0.7
        ))
        fig_bu.update_layout(
            title=f"Evolução {bu} — Receita e EBITDA (R$ mil)",
            barmode="group", height=350,
            margin=dict(t=50, b=40),
            legend=dict(orientation="h", y=1.12),
        )
        st.plotly_chart(fig_bu, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# WATERFALL DRE
# ══════════════════════════════════════════════════════════════════════════════

st.header(f"Waterfall DRE Consolidado — {mes_sel}/{ano}")

waterfall_items = [
    ("Receita Bruta", row["Receita Bruta"], "absolute"),
    ("Deduções", row["(-) Deduções"], "relative"),
    ("CPV", row["(-) CPV"], "relative"),
    ("Desp. Pessoal", row["(-) Desp. Pessoal"], "relative"),
    ("Desp. Admin.", row["(-) Desp. Administrativas"], "relative"),
    ("Desp. Comerciais", row["(-) Desp. Comerciais"], "relative"),
    ("D&A", row["(-) D&A"], "relative"),
    ("Res. Financeiro", row["Resultado Financeiro"], "relative"),
    ("IR/CSLL", row["(-) IR/CSLL"], "relative"),
    ("Lucro Líquido", row["Lucro Líquido"], "total"),
]

fig_wf = go.Figure(go.Waterfall(
    x=[w[0] for w in waterfall_items],
    y=[w[1] for w in waterfall_items],
    measure=[w[2] for w in waterfall_items],
    textposition="outside",
    text=[f"{w[1]:,.0f}" for w in waterfall_items],
    connector={"line": {"color": "#94a3b8"}},
    increasing={"marker": {"color": "#22c55e"}},
    decreasing={"marker": {"color": "#ef4444"}},
    totals={"marker": {"color": "#1f77b4"}},
))
fig_wf.update_layout(
    title="Da Receita Bruta ao Lucro Líquido (R$ mil)",
    yaxis_title="R$ mil",
    height=450,
    margin=dict(t=60, b=40),
    showlegend=False,
)
st.plotly_chart(fig_wf, use_container_width=True)


# ── Rodapé ────────────────────────────────────────────────────────────────────
st.divider()
st.caption(
    f"Dashboard gerado com dados simulados para fins de apresentação. "
    f"Referência: {mes_sel}/{ano} | BUs: {', '.join(bu_selecionadas)}"
)
