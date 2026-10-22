"""Dados fictícios para demonstração e testes (comando: cli.py demo). Não acessa nenhum CRM."""
import base64
import hashlib
import random
from datetime import datetime, timedelta

from .model import Etapa, Funil, Negocio
from .util import empresa_chave

P1 = ["Metalúrgica", "Grupo", "Construtora", "Rede", "Indústrias", "Cooperativa", "Transportadora", "Distribuidora",
      "Laboratório", "Agro", "Comercial", "Hospital", "Usina", "Frigorífico", "Têxtil", "Química"]
P2 = ["Alfa", "Horizonte", "Vértice", "Pilar", "Nova Era", "Atlas", "Lumen", "Prisma", "Orion", "Delta", "Boreal",
      "Pampa", "Hidra", "Meridiano", "Solaris", "Ponte Alta", "Vale Verde", "Aurora", "Serra Azul", "Litoral",
      "Cordilheira", "Guaíba", "Itapuã", "Farroupilha", "Ipiranga Sul", "Canoas", "Tropeiro", "Missões", "Gaúcha",
      "Bandeirantes", "Paulista", "Riacho", "Cerrado", "Capim Dourado", "Araucária", "Jacuí", "Taquari", "Minuano"]
SEG = ["Indústria", "Agronegócio", "Varejo", "Logística", "Saúde", "Construção", "Energia", "Alimentos", "Tecnologia"]
UF = ["RS", "RS", "RS", "SP", "SP", "SC", "PR", "MG"]
NOMES = ["Ana", "Bruno", "Carla", "Diego", "Eduardo", "Fernanda", "Gustavo", "Helena", "Igor", "Juliana", "Marcos",
         "Patrícia", "Rafael", "Sílvia", "Tiago", "Vanessa", "Rodrigo", "Luciana", "Paulo", "Mariana"]
SOBR = ["Silva", "Souza", "Lima", "Pereira", "Rocha", "Martins", "Alves", "Becker", "Schmidt", "Fontana", "Moraes"]
CARGO = ["CFO", "Dir. Financeiro", "Gerente Fiscal", "Controller", "CEO", "Coord. Tributário", "Sócio"]
RESP = ["Ana Ribeiro", "Bruno Costa", "Carla Mendes", "Diego Farias"]
SOL = ["Reforma Tributária", "Recup. de Créditos", "Planej. Tributário", "Compliance Fiscal"]
MOTIVO = ["Sem orçamento", "Optou por concorrente", "Adiou para o próximo ano", "Sem retorno", "Fora do perfil (ICP)"]

VENDEDORES = [
    {"nome": "Ana Ribeiro", "telefone": "+55 51 99999-0001", "papel": "Vendedora", "gestor": True},
    {"nome": "Bruno Costa", "telefone": "+55 51 99999-0002", "papel": "SDR"},
    {"nome": "Carla Mendes", "telefone": "+55 51 99999-0003", "papel": "SDR"},
    {"nome": "Diego Farias", "telefone": "+55 51 99999-0004", "papel": "Vendedor"},
    {"nome": "Eduarda Lima", "telefone": "+55 51 99999-0005", "papel": "SDR"},
    {"nome": "Felipe Torres", "telefone": "+55 51 99999-0006", "papel": "Vendedor"},
]


def _slug(s):
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode() if ch.isalpha())


def _empresas(rnd, n):
    out = []
    while len(out) < n:
        nome = f"{rnd.choice(P1)} {rnd.choice(P2)}"
        if nome not in out:
            out.append(nome)
    return out


def funil_demo(etapas_abertas=None, alcance=None, perda=None, seed=7, fim=None):
    etapas_abertas = etapas_abertas or ["Leads captados", "Qualificados (MQL)", "Reunião realizada", "Proposta enviada", "Negociação"]
    alcance = alcance or [312, 181, 97, 58, 29, 14]
    perda = perda or [0.0, 0.12, 0.2, 0.3, 0.35]
    rnd = random.Random(seed)
    fim = fim or datetime.now()
    etapas = [Etapa(str(i), n) for i, n in enumerate(etapas_abertas)] + [Etapa("won", "Ganho", ganho=True)]
    nomes = _empresas(rnd, alcance[0])
    negs, k = [], 0
    for i in range(len(etapas)):
        aqui = alcance[i] - (alcance[i + 1] if i + 1 < len(alcance) else 0)
        for _ in range(aqui):
            ultimo = i == len(etapas) - 1
            perdido = (not ultimo) and rnd.random() < perda[i]
            nome = nomes[k]; k += 1
            criado = fim - timedelta(days=rnd.randint(5, 85))
            negs.append(Negocio(
                id=str(k), empresa=nome, etapa_idx=i, status="ganho" if ultimo else ("perdido" if perdido else "aberto"),
                valor=round(rnd.lognormvariate(11.9, 0.55), -3) if i >= 1 else 0,
                leads=rnd.choice([1, 1, 1, 2, 2, 3]) if i else rnd.choice([1, 1, 1, 2]),
                contato=f"{rnd.choice(NOMES)} {rnd.choice(SOBR)}", cargo=rnd.choice(CARGO),
                email=f"contato@{_slug(nome.split()[-1])}.com.br", telefone=f"(51) 9{rnd.randint(8000, 9999)}-{rnd.randint(1000, 9999)}",
                responsavel=rnd.choice(RESP), solucao=rnd.choice(SOL), segmento=rnd.choice(SEG), uf=rnd.choice(UF),
                dominio=f"{_slug(nome.split()[-1])}.com.br", criado_em=criado,
                dias_na_etapa=rnd.randint(1, 26) if not ultimo and not perdido else None,
                dias_para_fechar=rnd.randint(12, 70) if ultimo else None,
                ultima_interacao=(fim - timedelta(days=rnd.randint(0, 30))).date(),
                motivo_perda=rnd.choice(MOTIVO) if perdido else ""))
    return Funil(pipeline="Eventos 2026", fonte="Demonstração", etapas=etapas, negocios=negs)


def popular_feira(cfg, feira_mod, nome="Feira Gestão & Tributos Sul", seed=3, dias=3, inicio=None):
    """Cria uma feira fictícia usando o próprio fluxo de captura (o mesmo que o WhatsApp usa)."""
    rnd = random.Random(seed)
    inicio = inicio or datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=dias - 1)
    ev = feira_mod.evento_criar(cfg, f"{nome} {inicio.year}", "Centro de Eventos · Porto Alegre/RS",
                                inicio.date().isoformat(), (inicio + timedelta(days=dias - 1)).date().isoformat())
    perfil = [(VENDEDORES[0], 58, .42), (VENDEDORES[1], 49, .30), (VENDEDORES[2], 46, .33),
              (VENDEDORES[3], 37, .40), (VENDEDORES[4], 31, .22), (VENDEDORES[5], 20, .35)]
    pool = _empresas(rnd, 190)
    con = feira_mod._db(cfg)
    for vend, n, quente in perfil:
        for _ in range(n):
            r = rnd.random()
            temp = "quente" if r < quente else "morno" if r < quente + .35 else "frio"
            emp = rnd.choice(pool)
            nome_c = f"{rnd.choice(NOMES)} {rnd.choice(SOBR)}"
            ts = inicio + timedelta(days=rnd.randrange(dias), hours=rnd.choice([9, 10, 10, 11, 11, 11, 12, 13, 14, 14, 15, 15, 15, 16, 16, 17, 18]),
                                    minutes=rnd.randint(0, 59))
            reuniao = None
            if (temp == "quente" and rnd.random() < .5) or (temp == "morno" and rnd.random() < .12):
                d = inicio + timedelta(days=dias + rnd.randint(3, 16))
                reuniao = f"{d:%d/%m/%Y} {rnd.choice([9, 10, 14, 15, 16])}h"
            dados = {"nome": nome_c, "cargo": rnd.choice(CARGO), "empresa": emp,
                     "telefone": f"{rnd.choice([51, 51, 11, 48, 41])}9{rnd.randint(8000, 9999)}{rnd.randint(1000, 9999)}",
                     "email": f"{_slug(nome_c.split()[0])}.{_slug(nome_c.split()[1])}@{_slug(emp.split()[-1])}.com.br",
                     "interesse": rnd.choice(SOL + ["Reforma Tributária", "Reforma Tributária", "Outros"]),
                     "temperatura": temp, "reuniao": reuniao,
                     "origem": rnd.choice(["texto", "texto", "texto", "cracha", "cracha", "audio"]),
                     "consentimento": rnd.random() > .03}
            res = feira_mod.capturar(cfg, vend["telefone"], dados)
            con.execute("UPDATE capturas SET criado_em=? WHERE evento_id=? AND seq=?",
                        (ts.isoformat(timespec="seconds"), ev["evento_id"], res["captura"]))
            con.commit()
    return ev


LOGO_COLORS = ["#0B5FA5", "#C8102E", "#00843D", "#F28C00", "#5B2C83", "#00838F", "#1D1D1B", "#B5121B", "#2E7D32", "#004B87"]


def logo_ficticio(domain):
    """Logo inventado para a demonstração (nunca usado com dados reais)."""
    h = int(hashlib.md5(domain.encode()).hexdigest(), 16)
    if h % 7 == 0:
        return None
    c, c2 = LOGO_COLORS[h % 10], LOGO_COLORS[(h // 10) % 10]
    ini = domain[:2].upper()
    shape = (h // 100) % 5
    marks = [
        f'<circle cx="20" cy="20" r="17" fill="{c}"/><text x="20" y="25.5" font-size="15" font-weight="800" fill="#fff" text-anchor="middle">{ini}</text>',
        f'<rect x="3" y="3" width="34" height="34" rx="8" fill="{c}"/><path d="M3 29 L37 13 L37 37 L3 37Z" fill="{c2}" opacity=".9"/>',
        f'<polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="{c}" stroke-width="4"/><text x="20" y="25" font-size="13" font-weight="800" fill="{c}" text-anchor="middle">{ini}</text>',
        f'<path d="M4 34 L16 8 L24 22 L29 14 L37 34Z" fill="{c}"/><circle cx="31" cy="9" r="4" fill="{c2}"/>',
        f'<rect x="4" y="6" width="8" height="28" fill="{c}"/><rect x="16" y="12" width="8" height="22" fill="{c2}"/><rect x="28" y="18" width="8" height="16" fill="{c}"/>',
    ]
    svg = f'<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" font-family="Arial">{marks[shape]}</svg>'
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
