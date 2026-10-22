"""Comando /mapa: mapa de leads em cards (16 ou 20 por página), a partir da feira ou do funil do CRM."""
from datetime import timedelta

from . import feira as feira_mod
from .crm import CRMError, conector
from .logos import Logos
from .render import build_pdf
from .util import LOST, TEMP, WON, fmt_periodo, iniciais, now, slug, stage_colors

LAYOUTS = {16: dict(cols=4, rows=4), 20: dict(cols=5, rows=4)}
PRIO = {"Quente": 0, "Morno": 1, "Frio": 2, "": 3}


def _card(**kw):
    kw["ini"] = iniciais(kw.get("nome"))
    kw["emp_ini"] = iniciais(kw.get("empresa"))
    kw["seller_ini"] = iniciais(kw.get("vendedor")) if kw.get("vendedor") else ""
    kw["sub"] = " · ".join(x for x in (kw.get("segmento"), kw.get("uf"), kw.get("dominio")) if x)
    return kw


def _cards_feira(cfg, evento, vendedor, temperatura):
    ev, caps = feira_mod.capturas_do_evento(cfg, evento)
    cards = []
    for c in caps:
        if vendedor and slug(vendedor) not in slug(c.vendedor):
            continue
        if temperatura and c.temperatura != temperatura:
            continue
        cards.append(_card(nome=c.nome, cargo=c.cargo, empresa=c.empresa or "(empresa não informada)", dominio=c.dominio,
                           telefone=c.telefone, email=c.email, interesse=c.interesse, rotulo=c.temperatura or "Pendente",
                           cor=TEMP.get(c.temperatura, "#B1B1A7"), reuniao=c.reuniao, vendedor=c.vendedor,
                           alerta="Agendar reunião" if c.temperatura == "Quente" and not c.reuniao else "",
                           captado=f"{c.criado_em:%d/%m %H:%M} · {c.origem}", id=f"#{c.seq:03d}",
                           ordem=(PRIO.get(c.temperatura, 3), c.reuniao is None, -c.criado_em.timestamp())))
    cards.sort(key=lambda k: k["ordem"])
    temps = {t: sum(1 for c in caps if c.temperatura == t) for t in TEMP}
    legenda = [(t, TEMP[t], n) for t, n in temps.items()] + [("Com reunião", WON, sum(1 for c in caps if c.reuniao))]
    ordem = "prioridade (quente c/ reunião → quente → morno → frio)"
    return cards, legenda, ev["nome"], feira_mod._periodo(ev), f"Capturas da feira {ev['nome']}", ordem


def _cards_funil(cfg, pipeline, dias, vendedor, etapa):
    fim = now(cfg["fuso"])
    inicio = fim - timedelta(days=dias or cfg["crm"]["periodo_padrao_dias"])
    f = conector(cfg).carregar_funil(pipeline or cfg["crm"]["pipeline_padrao"], inicio, fim)
    cores = stage_colors(len(f.etapas))
    cards = []
    for n in f.negocios:
        if n.status == "perdido":
            continue
        e = f.etapas[n.etapa_idx]
        if vendedor and slug(vendedor) not in slug(n.responsavel):
            continue
        if etapa and slug(etapa) not in slug(e.nome):
            continue
        cards.append(_card(nome=n.contato, cargo=n.cargo, empresa=n.empresa, dominio=n.dominio, segmento=n.segmento,
                           uf=n.uf, telefone=n.telefone, email=n.email, interesse=n.solucao, rotulo=e.nome,
                           cor=cores[n.etapa_idx], reuniao=None, vendedor=n.responsavel,
                           valor=n.valor, alerta="Parado +15 dias" if (n.dias_na_etapa or 0) > 15 else "",
                           captado=(n.ultima_interacao.strftime("%d/%m/%Y") if n.ultima_interacao else ""),
                           id="", ordem=(-n.etapa_idx, -n.valor)))
    cards.sort(key=lambda k: k["ordem"])
    legenda = [(e.nome, cores[i], sum(1 for c in cards if c["rotulo"] == e.nome)) for i, e in enumerate(f.etapas)]
    return cards, legenda, f.pipeline, fmt_periodo(inicio, fim), f"Fonte: {f.fonte} — pipeline “{f.pipeline}”", \
        "etapa mais avançada → maior valor"


def gerar(cfg, fonte="feira", evento=None, pipeline=None, dias=None, vendedor=None, temperatura=None, etapa=None,
          por_pagina=None, saida=None):
    por_pagina = int(por_pagina or cfg["mapa"]["cards_por_pagina"])
    if por_pagina not in LAYOUTS:
        raise ValueError("Cards por página: use 16 ou 20.")
    if fonte == "feira":
        temp = None
        if temperatura:
            from .util import normaliza_temperatura
            temp = normaliza_temperatura(temperatura) or None
        cards, legenda, titulo, periodo, rodape, ordem = _cards_feira(cfg, evento, vendedor, temp)
        rotulo_cor = "Temperatura"
    else:
        cards, legenda, titulo, periodo, rodape, ordem = _cards_funil(cfg, pipeline, dias, vendedor, etapa)
        rotulo_cor = "Etapa"
    if not cards:
        raise CRMError("Nenhum lead encontrado com esses filtros.")
    logos = Logos(cfg).many(c["dominio"] for c in cards)
    for c in cards:
        c["logo"] = logos.get(c["dominio"])
    pages = [cards[i:i + por_pagina] for i in range(0, len(cards), por_pagina)]
    filtro = " · ".join(x for x in (vendedor and f"vendedor {vendedor}", temperatura and f"temperatura {temperatura}",
                                    etapa and f"etapa {etapa}") if x) or "todos"
    agora = now(cfg["fuso"])
    nome = f"Mapa_Leads_{titulo}_{agora:%Y%m%d_%H%M}".replace(" ", "_").replace("/", "-")
    res = build_pdf(cfg, "mapa.html", saida or cfg.path("saidas") / f"{nome}.pdf", pages=pages, total=len(pages),
                    per=por_pagina, L=LAYOUTS[por_pagina], n=len(cards), legenda=legenda, titulo=titulo,
                    periodo=periodo, rodape=rodape, filtro=filtro, ordem=ordem, rotulo_cor=rotulo_cor, LOST=LOST)
    res["resumo"] = {"leads": len(cards), "cards_por_pagina": por_pagina, "com_logo": sum(1 for c in cards if c["logo"]),
                     "filtro": filtro}
    return res
