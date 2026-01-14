from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import math
import textwrap

# =========================
# 1) CONFIGURAÇÕES (EDITÁVEIS)
# =========================

BASE_HOURS_BY_COMPLEXITY = {
    "baixa": 60,
    "media": 120,
    "alta": 240,
    "altissima": 480,
}

SCOPE_MULT = {
    "super_fechado": 0.85,
    "fechado": 1.00,
    "aberto": 1.25,
}

# Perfil do cliente (A->H): multiplicador de valor (ajuste conforme sua estratégia comercial)
PROFILE_MULT = {
    "A": 1.35, "B": 1.25, "C": 1.15, "D": 1.05,
    "E": 1.00, "F": 0.95, "G": 0.90, "H": 0.85,
}

# Mix de equipe (percentuais) por complexidade - AJUSTE CONFORME SUA OPERAÇÃO
ROLE_MIX = {
    "baixa": {
        "Gerente I": 0.08,
        "Líder Técnico I": 0.17,
        "Consultor Pleno B": 0.40,
        "Consultor Junior": 0.25,
        "Assistente": 0.10,
    },
    "media": {
        "Gerente II": 0.10,
        "Líder Técnico II": 0.20,
        "Consultor Pleno A": 0.35,
        "Consultor Senior B": 0.15,
        "Consultor Junior": 0.15,
        "Assistente": 0.05,
    },
    "alta": {
        "Gerente Técnico I": 0.12,
        "Gerente II": 0.10,
        "Líder Técnico II": 0.18,
        "Consultor Senior A": 0.25,
        "Consultor Pleno A": 0.20,
        "Consultor Junior": 0.10,
        "Assistente": 0.05,
    },
    "altissima": {
        "Gerente Técnico II": 0.12,
        "Gerente Sr. I": 0.10,
        "Gerente Técnico I": 0.08,
        "Líder Técnico II": 0.18,
        "Consultor Senior A": 0.24,
        "Consultor Pleno A": 0.18,
        "Consultor Junior": 0.07,
        "Assistente": 0.03,
    },
}

# Preços/hora e custo/hora (com hora útil) conforme sua tabela (RS e SP)
# Observação: "custo" = coluna "Com hora útil"; "price" = "Preço Hora"
HOURLY = {
    "RS": {
        "Gerente Técnico II": {"cost": 314.71, "price": 1227.38},
        "Gerente Técnico I": {"cost": 278.34, "price": 1085.54},
        "Líder Técnico II":  {"cost": 246.97, "price": 963.19},
        "Líder Técnico I":   {"cost": 219.91, "price": 857.65},
        "Supervisor II":     {"cost": 196.57, "price": 766.61},
        "Supervisor I":      {"cost": 176.43, "price": 688.07},
        "Gerente Sr. II":    {"cost": 314.71, "price": 1227.38},
        "Gerente Sr. I":     {"cost": 278.34, "price": 1085.54},
        "Gerente II":        {"cost": 246.97, "price": 963.19},
        "Gerente I":         {"cost": 219.91, "price": 857.65},
        "Coordenador II":    {"cost": 196.57, "price": 766.61},
        "Coordenador I":     {"cost": 176.43, "price": 688.07},
        "Consultor Senior A":{"cost": 162.30, "price": 632.96},
        "Consultor Senior B":{"cost": 150.23, "price": 585.90},
        "Consultor Pleno A": {"cost": 137.31, "price": 535.49},
        "Consultor Pleno B": {"cost": 123.16, "price": 480.32},
        "Consultor Junior":  {"cost": 110.13, "price": 429.51},
        "Assistente":        {"cost": 87.52,  "price": 341.35},
    },
    "SP": {
        "Gerente Técnico II": {"cost": 367.66, "price": 1433.86},
        "Gerente Técnico I":  {"cost": 324.01, "price": 1263.65},
        "Líder Técnico II":   {"cost": 286.37, "price": 1116.83},
        "Líder Técnico I":    {"cost": 253.89, "price": 990.18},
        "Supervisor II":      {"cost": 225.88, "price": 880.93},
        "Supervisor I":       {"cost": 201.71, "price": 786.69},
        "Gerente Sr. II":     {"cost": 367.66, "price": 1433.86},
        "Gerente Sr. I":      {"cost": 324.01, "price": 1263.65},
        "Gerente II":         {"cost": 286.37, "price": 1116.83},
        "Gerente I":          {"cost": 253.89, "price": 990.18},
        "Coordenador II":     {"cost": 225.88, "price": 880.93},
        "Coordenador I":      {"cost": 201.71, "price": 786.69},
        "Consultor Senior A": {"cost": 184.76, "price": 720.55},
        "Consultor Senior B": {"cost": 170.28, "price": 664.08},
        "Consultor Pleno A":  {"cost": 154.77, "price": 603.59},
        "Consultor Pleno B":  {"cost": 137.79, "price": 537.38},
        "Consultor Junior":   {"cost": 122.16, "price": 476.41},
        "Assistente":         {"cost": 95.03,  "price": 370.62},
    }
}

@dataclass
class DemandType:
    code: str
    name: str
    billing_model: str  # "project" ou "retainer"
    scope: str
    applicability: str
    delivery_time: str
    deliverables: List[str]
    # Ajustes opcionais
    hours_mult: float = 1.0
    default_delivery_days: Optional[int] = None  # usado para estimar/urgência

DEMAND_LIBRARY: Dict[str, DemandType] = {
    # Baseados na descrição do site (você pode expandir sem mexer no motor)
    "AFD": DemandType(
        code="AFD",
        name="Análise Fiscal Digital",
        billing_model="project",
        scope="Tributos federais, estaduais, previdenciários.",
        applicability="Empresas do Lucro Real e Presumido (alguns segmentos).",
        delivery_time="Até 90 dias úteis (federais) e 180 dias úteis (ICMS).",
        deliverables=["Relatório de Ativos", "Relatório de Passivos (opcional)"],
        hours_mult=1.40,
        default_delivery_days=120,  # referência interna
    ),
    "REP": DemandType(
        code="REP",
        name="Revisão dos Encargos Previdenciários",
        billing_model="project",
        scope="INSS, CPRB, RAT, SAT, FAP.",
        applicability="Empresas do Lucro Real e Lucro Presumido.",
        delivery_time="Até 60 dias corridos.",
        deliverables=["Relatório de Ativos", "Relatórios de Passivos"],
        hours_mult=1.10,
        default_delivery_days=60,
    ),
    "TCF": DemandType(
        code="TCF",
        name="Tratamento de Cadastro Fiscal",
        billing_model="project",
        scope="Tributos federais, estaduais e previdenciários.",
        applicability="Empresas do Lucro Real, Presumido e Simples.",
        delivery_time="Até 60 dias úteis para o projeto.",
        deliverables=["Relatório com a base de dados revisada"],
        hours_mult=1.00,
        default_delivery_days=60,
    ),
    "SDT": DemandType(
        code="SDT",
        name="Service Desk Tributário",
        billing_model="retainer",
        scope="Assessoria tributária.",
        applicability="Todas as empresas.",
        delivery_time="Mensalmente.",
        deliverables=["Relatórios", "Contratos", "Minutas", "Dossiês"],
        hours_mult=1.00,
        default_delivery_days=30,
    ),
    "LOG": DemandType(
        code="LOG",
        name="Tax Log",
        billing_model="project",
        scope="Tributos federais e estaduais.",
        applicability="Empresas do Lucro Real e Presumido.",
        delivery_time="Até 30 dias úteis.",
        deliverables=["Relatório", "Dossiês"],
        hours_mult=0.90,
        default_delivery_days=30,
    ),
    "RTI": DemandType(
        code="RTI",
        name="Reforma Tributária Inteligente",
        billing_model="project",
        scope="IBS, CBS e IS.",
        applicability="Todas as empresas.",
        delivery_time="Até 60 dias.",
        deliverables=["Relatório", "Apresentação do projeto"],
        hours_mult=1.20,
        default_delivery_days=60,
    ),
    "RET": DemandType(
        code="RET",
        name="Regimes Especiais Tributários",
        billing_model="project",
        scope="Tributos federais, estaduais e previdenciários.",
        applicability="Empresas do Lucro Real e Lucro Presumido.",
        delivery_time="De 12 a 36 meses.",
        deliverables=["Relatório", "Dossiês"],
        hours_mult=1.60,
        default_delivery_days=365,  # referência interna (1 ano)
    ),
}

# =========================
# 2) FUNÇÕES DO MOTOR
# =========================

def _normalize_mix(mix: Dict[str, float]) -> Dict[str, float]:
    s = sum(mix.values())
    if s <= 0:
        raise ValueError("Mix inválido (soma = 0).")
    return {k: v / s for k, v in mix.items()}

def _apply_scope_shift(mix: Dict[str, float], amplitude: str) -> Dict[str, float]:
    """
    Ajuste simples: escopo 'aberto' puxa % para seniors; 'super_fechado' puxa % para plenos/juniores.
    """
    mix = dict(mix)
    seniors = [k for k in mix if "Gerente" in k or "Líder" in k or "Senior" in k]
    juniors = [k for k in mix if "Junior" in k or "Assistente" in k or "Pleno" in k]

    def move(frac: float):
        if not seniors or not juniors:
            return
        give = frac / max(len(juniors), 1)
        take = frac / max(len(seniors), 1)
        for j in juniors:
            mix[j] = max(0.0, mix.get(j, 0.0) - give)
        for s in seniors:
            mix[s] = mix.get(s, 0.0) + take

    if amplitude == "aberto":
        move(0.06)
    elif amplitude == "super_fechado":
        move(-0.06)  # inverso
    return _normalize_mix(mix)

def _urgency_multiplier(requested_days: Optional[int], reference_days: Optional[int]) -> float:
    if not requested_days or not reference_days or requested_days <= 0 or reference_days <= 0:
        return 1.0
    if requested_days >= reference_days:
        return 1.0
    ratio = reference_days / requested_days  # > 1 = mais urgente
    mult = 1.0 + 0.25 * (ratio - 1.0)
    return min(mult, 1.75)

def _round_hours(hours: float) -> float:
    # arredonda para 0,5h
    return round(hours * 2) / 2.0

def estimate_hours_by_role(
    complexity: str,
    amplitude: str,
    total_hours: float
) -> Dict[str, float]:
    base_mix = ROLE_MIX[complexity]
    mix = _apply_scope_shift(base_mix, amplitude)
    hours = {role: _round_hours(total_hours * pct) for role, pct in mix.items()}

    # Ajuste para bater exatamente o total (diferença por arredondamento)
    diff = total_hours - sum(hours.values())
    if abs(diff) >= 0.25:
        # joga a diferença no role com maior % (mais robusto)
        top_role = max(mix, key=lambda r: mix[r])
        hours[top_role] = _round_hours(hours[top_role] + diff)
    return hours

def compute_cost_and_price(
    praca: str,
    hours_by_role: Dict[str, float],
    profile: str,
    demand: DemandType,
    requested_days: Optional[int]
) -> Tuple[float, float, Dict[str, float]]:
    """Retorna (custo_entrega, preco_venda, detalhamento_por_role_em_reais)."""
    urgency = _urgency_multiplier(requested_days, demand.default_delivery_days)
    value_mult = PROFILE_MULT[profile] * urgency

    cost = 0.0
    base_price = 0.0
    by_role_reais = {}

    for role, h in hours_by_role.items():
        if role not in HOURLY[praca]:
            raise ValueError(f"Cargo '{role}' não existe na tabela de {praca}.")
        role_cost = h * HOURLY[praca][role]["cost"]
        role_price = h * HOURLY[praca][role]["price"]
        cost += role_cost
        base_price += role_price
        by_role_reais[role] = role_price

    final_price = base_price * value_mult
    return cost, final_price, by_role_reais

def render_scope_text(
    demand: DemandType,
    profile: str,
    complexity: str,
    amplitude: str,
    requested_days: Optional[int],
    description: str,
    hours_by_role: Dict[str, float]
) -> str:
    horas_txt = ", ".join([f"{r}: {h:.1f}h" for r, h in hours_by_role.items() if h > 0])
    prazo_txt = f"{requested_days} dias" if requested_days else demand.delivery_time

    blocks = [
        f"**Objeto / Demanda**: {demand.code} — {demand.name}",
        f"**Perfil do Cliente**: {profile}",
        f"**Complexidade**: {complexity} | **Amplitude**: {amplitude}",
        f"**Escopo (base)**: {demand.scope}",
        f"**Aplicabilidade (base)**: {demand.applicability}",
        "**Entregáveis**:\n" + "\n".join([f"- {x}" for x in demand.deliverables]),
        f"**Prazo estimado**: {prazo_txt}",
        "**Premissas de esforço (estimativa)**:\n" + f"- Total de horas estimadas e mix de equipe: {horas_txt}",
        "**Descrição detalhada informada pelo solicitante**:\n" + (description.strip() or "(não informado)"),
        "**Exclusões (padrão)**:\n- Implementação sistêmica/parametrização em ERP (salvo contratação adicional)\n- Atuação contenciosa judicial/administrativa (salvo escopo específico)\n- Obrigações acessórias recorrentes fora do escopo\n",
    ]
    return "\n\n".join(blocks)

def precificar(
    praca: str,                 # "RS" ou "SP"
    profile: str,               # "A"..."H"
    demand_code: str,           # ex: "RTI"
    complexity: str,            # "baixa/media/alta/altissima"
    amplitude: str,             # "super_fechado/fechado/aberto"
    requested_days: Optional[int],
    description: str,
    monthly_hours_if_retainer: Optional[int] = None
) -> Dict:
    if praca not in HOURLY:
        raise ValueError("Praça inválida. Use 'RS' ou 'SP'.")
    if profile not in PROFILE_MULT:
        raise ValueError("Perfil inválido. Use 'A' até 'H'.")
    if complexity not in BASE_HOURS_BY_COMPLEXITY:
        raise ValueError("Complexidade inválida.")
    if amplitude not in SCOPE_MULT:
        raise ValueError("Amplitude inválida.")
    if demand_code not in DEMAND_LIBRARY:
        raise ValueError("Tipo de demanda inválido (não encontrado na biblioteca).")

    demand = DEMAND_LIBRARY[demand_code]

    # Horas totais
    base_hours = BASE_HOURS_BY_COMPLEXITY[complexity]
    total_hours = base_hours * SCOPE_MULT[amplitude] * demand.hours_mult

    if demand.billing_model == "retainer":
        if not monthly_hours_if_retainer:
            monthly_hours_if_retainer = base_hours  # fallback: usa base da complexidade
        total_hours = float(monthly_hours_if_retainer)

    hours_by_role = estimate_hours_by_role(complexity, amplitude, total_hours)

    cost, price, by_role_reais = compute_cost_and_price(
        praca=praca,
        hours_by_role=hours_by_role,
        profile=profile,
        demand=demand,
        requested_days=requested_days
    )

    scope_text = render_scope_text(
        demand=demand,
        profile=profile,
        complexity=complexity,
        amplitude=amplitude,
        requested_days=requested_days,
        description=description,
        hours_by_role=hours_by_role
    )

    prazo_estimado = requested_days if requested_days else demand.default_delivery_days

    return {
        "demand": f"{demand.code} - {demand.name}",
        "billing_model": demand.billing_model,
        "praca": praca,
        "perfil": profile,
        "complexidade": complexity,
        "amplitude": amplitude,
        "prazo_estimado_dias": prazo_estimado,
        "horas_totais": round(sum(hours_by_role.values()), 1),
        "horas_por_cargo": hours_by_role,
        "custo_entrega": round(cost, 2),
        "preco_venda": round(price, 2),
        "receita_por_cargo_base": {k: round(v, 2) for k, v in by_role_reais.items()},
        "escopo_para_proposta": scope_text,
    }


# =========================
# 3) EXEMPLO DE USO
# =========================
if __name__ == "__main__":
    exemplo = precificar(
        praca="SP",
        profile="B",
        demand_code="RTI",
        complexity="alta",
        amplitude="aberto",
        requested_days=45,
        description="Simulação de impactos da reforma tributária (IBS/CBS/IS), incluindo avaliação de cadeia de créditos e impacto de caixa com split payment.",
    )
    print("Custo de Entrega:", exemplo["custo_entrega"])
    print("Preço de Venda:", exemplo["preco_venda"])
    print("Horas por cargo:", exemplo["horas_por_cargo"])
    print("\n--- ESCOPO (colar na proposta) ---\n")
    print(exemplo["escopo_para_proposta"])
