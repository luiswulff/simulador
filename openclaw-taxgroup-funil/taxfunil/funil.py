"""Comando /funil: funil de vendas one page + lista de empresas por etapa (página 2 em diante)."""
from datetime import timedelta

from .crm import CRMError, conector
from .render import build_pdf
from .util import LOST, brl_short, fmt_periodo, now, pct, stage_colors, stage_ramp

# paginação da lista (mm)
BODY_MM, GROUP_MM, THEAD_MM, ROW_MM, GRID_ROW_MM, GRID_COLS = 172, 10.5, 5.2, 4.95, 4.8, 4


def metricas(funil):
    N = len(funil.etapas)
    if N < 2:
        raise CRMError("O pipeline precisa ter ao menos uma etapa aberta além do ganho.")
    negs = funil.negocios
    cores, rampa = stage_colors(N), stage_ramp(N)
    etapas = []
    for i, e in enumerate(funil.etapas):
        alcancou = [n for n in negs if n.etapa_idx >= i]
        aqui = [n for n in negs if n.etapa_idx == i and n.status != "perdido"]
        dias = [n.dias_na_etapa for n in aqui if n.dias_na_etapa is not None]
        etapas.append(dict(
            i=i, nome=e.nome, cor=cores[i], faixa=rampa[i], emp=len({n.empresa for n in alcancou}),
            leads=sum(n.leads for n in alcancou), aqui=aqui, valor=sum(n.valor for n in aqui),
            dias=round(sum(dias) / len(dias)) if dias and i < N - 1 else None,
            top=sorted(aqui, key=lambda n: -n.valor)[:3]))
    topo = etapas[0]["leads"]
    for i, s in enumerate(etapas):
        s["pct_topo"] = pct(s["leads"], topo)
        s["conv"] = pct(s["leads"], etapas[i - 1]["leads"]) if i else None
        s["conv_v"] = s["leads"] / etapas[i - 1]["leads"] if i and etapas[i - 1]["leads"] else 1
        s["valor_s"] = brl_short(s["valor"]) if s["valor"] else "—"
    ganho = etapas[-1]
    perdidos = [n for n in negs if n.status == "perdido"]
    pior = min(etapas[1:], key=lambda s: s["conv_v"])
    finais = [n for s in etapas[max(0, N - 3):N - 1] for n in s["aqui"]]
    parados = [n for n in finais if (n.dias_na_etapa or 0) > 15]

    def ranking(chave):
        d = {}
        for n in ganho["aqui"]:
            k = getattr(n, chave) or ""
            if k:
                r = d.setdefault(k, [0, 0.0]); r[0] += 1; r[1] += n.valor
        if not d:
            return []
        mx = max(v[1] for v in d.values()) or 1
        return [dict(n=k, q=v[0], v=brl_short(v[1]), w=round(100 * v[1] / mx))
                for k, v in sorted(d.items(), key=lambda kv: (-kv[1][1], -kv[1][0]))][:4]

    maiores = sorted(ganho["aqui"], key=lambda n: -n.valor)[:4]
    mx = (maiores[0].valor if maiores else 0) or 1
    return dict(
        etapas=etapas, N=N, perdidos=perdidos, ganho=ganho, pior=pior, topo=topo, q1=etapas[1],
        conv_total=pct(ganho["leads"], topo), valor_aberto=brl_short(sum(s["valor"] for s in etapas[:-1])),
        valor_ganho=brl_short(ganho["valor"]), ticket=brl_short(ganho["valor"] / max(1, len(ganho["aqui"]))),
        parados=parados, parados_valor=brl_short(sum(n.valor for n in parados)),
        por_resp=ranking("responsavel"), por_sol=ranking("solucao"),
        maiores=[dict(n=n.empresa, q=1, v=brl_short(n.valor), w=round(100 * n.valor / mx)) for n in maiores],
        perdidos_por_etapa=[(e.nome, sum(1 for n in perdidos if n.etapa_idx == i)) for i, e in enumerate(funil.etapas)])


def paginar(m):
    grupos = []
    for s in reversed(m["etapas"]):
        if s["aqui"]:
            rows = sorted(s["aqui"], key=lambda n: (-n.valor, n.empresa))
            grupos.append(dict(titulo=s["nome"], cor=s["cor"], rows=rows,
                               compacto=(s["i"] == 0 and not s["valor"]) or len(rows) > 70,
                               tipo="ganho" if s is m["ganho"] else "aberto",
                               sub=f'{len(rows)} empresas · {sum(n.leads for n in rows)} leads'
                                   + (f' · R$ {brl_short(s["valor"])}' if s["valor"] else '')))
    if m["perdidos"]:
        rows = sorted(m["perdidos"], key=lambda n: (-n.etapa_idx, -n.valor))
        grupos.append(dict(titulo="Perdidos", cor=LOST, rows=rows, compacto=False, tipo="perdido",
                           sub=f'{len(rows)} empresas · R$ {brl_short(sum(n.valor for n in rows))} não convertidos'))
    paginas, atual, resta = [], [], BODY_MM
    for g in grupos:
        rows, primeiro = g["rows"], True
        while rows:
            por = GRID_ROW_MM if g["compacto"] else ROW_MM
            precisa = GROUP_MM + (0 if g["compacto"] else THEAD_MM)
            cabe = int((resta - precisa) // por) * (GRID_COLS if g["compacto"] else 1)
            if cabe < (GRID_COLS * 2 if g["compacto"] else 3):
                paginas.append(atual); atual, resta = [], BODY_MM
                continue
            parte, rows = rows[:cabe], rows[cabe:]
            atual.append(dict(g, rows=parte, cont=not primeiro))
            usadas = -(-len(parte) // GRID_COLS) if g["compacto"] else len(parte)
            resta -= precisa + usadas * por + 3
            primeiro = False
    if atual:
        paginas.append(atual)
    return paginas


def geometria(m):
    N, H, gap, top_w, bot_w, cx = m["N"], 356, 4, 340, 110, 175
    bh = (H - gap * (N - 1)) / N
    for i, s in enumerate(m["etapas"]):
        y0 = 4 + i * (bh + gap); y1 = y0 + bh
        w0 = top_w - (top_w - bot_w) * (y0 - 4) / H
        w1 = top_w - (top_w - bot_w) * (y1 - 4) / H
        s.update(y0=y0, y1=y1, ym=(y0 + y1) / 2, xr=cx + (w0 + w1) / 4 + 4,
                 pts=f"{cx - w0 / 2:.1f},{y0:.1f} {cx + w0 / 2:.1f},{y0:.1f} {cx + w1 / 2:.1f},{y1:.1f} {cx - w1 / 2:.1f},{y1:.1f}")
    return bh


def gerar(cfg, pipeline=None, inicio=None, fim=None, dias=None, titulo=None, subtitulo=None, tipo="Negócios",
          funil=None, saida=None):
    agora = now(cfg["fuso"])
    fim = fim or agora
    inicio = inicio or fim - timedelta(days=dias or cfg["crm"]["periodo_padrao_dias"])
    pipeline = pipeline or cfg["crm"]["pipeline_padrao"]
    funil = funil or conector(cfg).carregar_funil(pipeline, inicio, fim)
    if not funil.negocios:
        raise CRMError(f"Nenhum negócio no pipeline '{funil.pipeline}' entre {fmt_periodo(inicio, fim)}.")
    m = metricas(funil)
    paginas = paginar(m)
    bh = geometria(m)
    nome = f"Funil_{funil.pipeline}_{agora:%Y%m%d_%H%M}".replace(" ", "_").replace("/", "-")
    out = saida or cfg.path("saidas") / f"{nome}.pdf"
    res = build_pdf(cfg, "funil.html", out, m=m, pages=paginas, total=1 + len(paginas), bh=bh, LOST=LOST,
                    cab=dict(titulo=titulo or funil.pipeline, subtitulo=subtitulo or f"Pipeline {funil.pipeline}",
                             tipo=tipo, periodo=fmt_periodo(inicio, fim), atualizado=agora.strftime("%d/%m/%Y · %H:%M"),
                             fonte=funil.fonte, pipeline=funil.pipeline))
    res["resumo"] = {
        "pipeline": funil.pipeline, "fonte": funil.fonte, "periodo": fmt_periodo(inicio, fim),
        "leads_topo": m["topo"], "empresas_topo": m["etapas"][0]["emp"], "ganhos": m["ganho"]["emp"],
        "conversao_total": m["conv_total"], "pipeline_aberto": "R$ " + m["valor_aberto"],
        "receita_fechada": "R$ " + m["valor_ganho"], "perdidos": len(m["perdidos"]),
        "gargalo": f'{m["pior"]["nome"]} ({m["pior"]["conv"]})',
        "etapas": [{"etapa": s["nome"], "leads": s["leads"], "empresas": s["emp"], "conversao": s["conv"]} for s in m["etapas"]],
    }
    return res
