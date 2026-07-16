"""
Dados financeiros simulados para o Dashboard do Conselho TaxCo.
Estrutura de DRE por BU com dados mensais para 2025/2026.
"""

import pandas as pd
import random

# Business Units da TaxCo
BUS = ["AFD", "REP", "TCF", "SDT", "LOG", "RTI", "RET"]

BU_NOMES = {
    "AFD": "Análise Fiscal Digital",
    "REP": "Revisão Encargos Previd.",
    "TCF": "Tratamento Cadastro Fiscal",
    "SDT": "Service Desk Tributário",
    "LOG": "Tax Log",
    "RTI": "Reforma Tributária Intel.",
    "RET": "Regimes Especiais Tribut.",
}

MESES = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]


def _gerar_dre_bu(bu: str, ano: int, seed: int = 42) -> pd.DataFrame:
    """Gera DRE mensal simulado para uma BU."""
    rng = random.Random(seed + hash(bu) + ano)

    # Faixas de receita bruta mensal por BU (em R$ mil)
    faixas = {
        "AFD": (800, 1400),
        "REP": (400, 800),
        "TCF": (300, 600),
        "SDT": (600, 1100),
        "LOG": (200, 450),
        "RTI": (500, 900),
        "RET": (350, 700),
    }

    lo, hi = faixas.get(bu, (300, 700))
    rows = []

    for i, mes in enumerate(MESES):
        # Sazonalidade: Q1 mais fraco, Q4 mais forte
        sazonal = 1.0 + 0.05 * (i - 5)
        receita_bruta = rng.uniform(lo, hi) * sazonal

        # Deduções ~8-12% da receita bruta
        deducoes = receita_bruta * rng.uniform(0.08, 0.12)
        receita_liquida = receita_bruta - deducoes

        # CPV (Custo dos serviços) ~45-60% da receita líquida
        cpv = receita_liquida * rng.uniform(0.45, 0.60)
        lucro_bruto = receita_liquida - cpv

        # Despesas com pessoal ~15-22% da receita líquida
        desp_pessoal = receita_liquida * rng.uniform(0.15, 0.22)

        # Despesas administrativas ~5-10% da receita líquida
        desp_admin = receita_liquida * rng.uniform(0.05, 0.10)

        # Despesas comerciais ~3-7% da receita líquida
        desp_comercial = receita_liquida * rng.uniform(0.03, 0.07)

        desp_operacionais = desp_pessoal + desp_admin + desp_comercial

        ebitda = lucro_bruto - desp_operacionais

        # D&A ~2-4% da receita líquida
        depreciacao = receita_liquida * rng.uniform(0.02, 0.04)
        ebit = ebitda - depreciacao

        # Resultado financeiro: pode ser negativo ou positivo
        resultado_financeiro = rng.uniform(-30, 20)

        lair = ebit + resultado_financeiro

        # IR/CSLL ~34% sobre LAIR positivo
        ir_csll = max(0, lair * 0.34)

        lucro_liquido = lair - ir_csll

        rows.append({
            "Mês": mes,
            "Mês_Num": i + 1,
            "Receita Bruta": round(receita_bruta, 1),
            "(-) Deduções": round(-deducoes, 1),
            "Receita Líquida": round(receita_liquida, 1),
            "(-) CPV": round(-cpv, 1),
            "Lucro Bruto": round(lucro_bruto, 1),
            "(-) Desp. Pessoal": round(-desp_pessoal, 1),
            "(-) Desp. Administrativas": round(-desp_admin, 1),
            "(-) Desp. Comerciais": round(-desp_comercial, 1),
            "Total Desp. Operacionais": round(-desp_operacionais, 1),
            "EBITDA": round(ebitda, 1),
            "(-) D&A": round(-depreciacao, 1),
            "EBIT": round(ebit, 1),
            "Resultado Financeiro": round(resultado_financeiro, 1),
            "LAIR": round(lair, 1),
            "(-) IR/CSLL": round(-ir_csll, 1),
            "Lucro Líquido": round(lucro_liquido, 1),
        })

    return pd.DataFrame(rows)


def gerar_orcamento_bu(bu: str, ano: int) -> pd.DataFrame:
    """Gera orçamento (budget) como base de comparação."""
    # Orçamento é gerado com seed diferente, tendendo a ser ~5-15% acima do realizado
    df_real = _gerar_dre_bu(bu, ano, seed=42)
    df_orc = _gerar_dre_bu(bu, ano, seed=99)

    # Ajusta orçamento para ser ligeiramente mais otimista
    colunas_valor = [c for c in df_orc.columns if c not in ("Mês", "Mês_Num")]
    for col in colunas_valor:
        if "Receita" in col and "(-)" not in col:
            df_orc[col] = df_orc[col] * 1.10
        elif "Lucro" in col or "EBITDA" in col or "EBIT" in col or "LAIR" in col:
            df_orc[col] = df_orc[col] * 1.12

    return df_orc


def carregar_dados(ano: int = 2026) -> dict:
    """Carrega todos os dados DRE por BU."""
    dados = {}
    for bu in BUS:
        dados[bu] = {
            "realizado": _gerar_dre_bu(bu, ano, seed=42),
            "orcamento": gerar_orcamento_bu(bu, ano),
            "nome": BU_NOMES[bu],
        }
    return dados


def consolidar_dre(dados: dict) -> pd.DataFrame:
    """Consolida DRE de todas as BUs (soma)."""
    dfs = [dados[bu]["realizado"] for bu in BUS]
    consolidado = dfs[0].copy()
    colunas_valor = [c for c in consolidado.columns if c not in ("Mês", "Mês_Num")]

    for df in dfs[1:]:
        for col in colunas_valor:
            consolidado[col] = consolidado[col] + df[col]

    return consolidado


def consolidar_orcamento(dados: dict) -> pd.DataFrame:
    """Consolida orçamento de todas as BUs."""
    dfs = [dados[bu]["orcamento"] for bu in BUS]
    consolidado = dfs[0].copy()
    colunas_valor = [c for c in consolidado.columns if c not in ("Mês", "Mês_Num")]

    for df in dfs[1:]:
        for col in colunas_valor:
            consolidado[col] = consolidado[col] + df[col]

    return consolidado


# Indicadores operacionais por BU
def indicadores_operacionais(bu: str, ano: int = 2026, seed: int = 42) -> dict:
    """Retorna KPIs operacionais simulados por BU."""
    rng = random.Random(seed + hash(bu) + ano)

    return {
        "headcount": rng.randint(8, 35),
        "projetos_ativos": rng.randint(3, 18),
        "projetos_entregues_mes": rng.randint(1, 8),
        "taxa_utilizacao": round(rng.uniform(0.65, 0.92), 2),
        "ticket_medio": round(rng.uniform(80, 350), 1),
        "nps": rng.randint(55, 95),
        "inadimplencia_pct": round(rng.uniform(0.01, 0.08), 3),
        "churn_pct": round(rng.uniform(0.02, 0.12), 3),
    }
