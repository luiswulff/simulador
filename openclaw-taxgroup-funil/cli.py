#!/usr/bin/env python3
"""Tax Group · CLI chamada pelo Argos OpenClaw. Toda saída é JSON em stdout: {"ok": true, ...} ou {"ok": false, "erro": "..."}.

Exemplos:
  python3 cli.py funil --pipeline "Eventos 2026" --dias 60
  python3 cli.py feira evento criar --nome "Expo Tributos 2026" --local "Porto Alegre/RS" --inicio 2026-11-10 --fim 2026-11-12
  python3 cli.py feira capturar --remetente "+5551999990002" --dados '{"nome":"João Pereira","empresa":"Metalúrgica Alfa",...}'
  python3 cli.py feira ranking
  python3 cli.py mapa --fonte feira --cards 20
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
_VENV_PY = HERE / ".venv" / "bin" / "python"
if _VENV_PY.exists() and Path(sys.prefix).resolve() != (HERE / ".venv").resolve():
    import os
    os.execv(str(_VENV_PY), [str(_VENV_PY), __file__, *sys.argv[1:]])   # usa o ambiente criado pelo instalar.sh
sys.path.insert(0, str(HERE))

from taxfunil import config as config_mod  # noqa: E402


def _data(s, fim=False):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            d = datetime.strptime(s, fmt)
            return d.replace(hour=23, minute=59, second=59) if fim else d
        except ValueError:
            continue
    raise ValueError(f"Data inválida: {s} (use AAAA-MM-DD ou DD/MM/AAAA)")


def _json_arg(s):
    if not s:
        return {}
    if s.startswith("@"):
        s = Path(s[1:]).read_text(encoding="utf-8")
    return json.loads(s)


def cmd_funil(cfg, a):
    from taxfunil import funil
    return funil.gerar(cfg, pipeline=a.pipeline, inicio=_data(a.inicio), fim=_data(a.fim, True), dias=a.dias,
                       titulo=a.titulo, subtitulo=a.subtitulo, tipo=a.tipo)


def cmd_pipelines(cfg, a):
    from taxfunil.crm import conector
    c = conector(cfg)
    if hasattr(c, "pipelines"):
        return {"pipelines": [{"id": p["id"], "nome": p.get("label") or p.get("name")} for p in c.pipelines()]}
    if hasattr(c, "_req"):
        return {"pipelines": [{"id": p["id"], "nome": p["name"]} for p in c._req("GET", "/pipelines").get("data") or []]}
    return {"pipelines": [], "obs": "O conector por arquivo não tem lista de pipelines."}


def cmd_feira(cfg, a):
    from taxfunil import feira
    ac = a.acao
    if ac == "evento":
        if a.sub == "criar":
            return feira.evento_criar(cfg, a.nome, a.local or "", a.inicio or "", a.fim or "", a.pipeline or "")
        if a.sub == "listar":
            return feira.evento_listar(cfg)
        if a.sub == "ativar":
            return feira.evento_ativar(cfg, a.evento)
        if a.sub == "encerrar":
            return feira.evento_encerrar(cfg, a.evento)
    if ac == "capturar":
        return feira.capturar(cfg, a.remetente, _json_arg(a.dados), a.evento)
    if ac == "corrigir":
        return feira.corrigir(cfg, a.remetente, a.captura, _json_arg(a.dados), a.evento)
    if ac == "excluir":
        return feira.excluir(cfg, a.remetente, a.captura, a.evento)
    if ac == "ranking":
        return feira.ranking(cfg, a.evento)
    if ac == "relatorio":
        return feira.relatorio(cfg, a.remetente, a.evento)
    if ac == "minhalista":
        return feira.minha_lista(cfg, a.remetente, a.evento, a.vendedor)
    if ac == "sincronizar":
        return feira.sincronizar(cfg, a.evento)
    if ac == "exportar":
        return feira.exportar_csv(cfg, a.remetente, a.evento)
    raise ValueError(f"Ação desconhecida: {ac}")


def cmd_mapa(cfg, a):
    from taxfunil import mapa
    return mapa.gerar(cfg, fonte=a.fonte, evento=a.evento, pipeline=a.pipeline, dias=a.dias, vendedor=a.vendedor,
                      temperatura=a.temperatura, etapa=a.etapa, por_pagina=a.cards)


def cmd_demo(cfg, a):
    """Gera os 3 relatórios com dados fictícios numa pasta isolada (não toca no CRM nem na base real)."""
    import copy
    from taxfunil import demo, feira, funil, mapa
    saida = Path(a.saida or (config_mod.BASE_DIR / "saidas" / "demo")).resolve()
    saida.mkdir(parents=True, exist_ok=True)
    dcfg = config_mod.Config(copy.deepcopy(dict(cfg)))
    dcfg["pastas"] = {"dados": str(saida / "dados"), "saidas": str(saida)}
    dcfg["vendedores"] = demo.VENDEDORES
    dcfg["feira"]["envio_crm"] = "desligado"
    dcfg["logos"]["provedor"] = "demo"
    (saida / "dados" / "feira.db").unlink(missing_ok=True)
    gestor = demo.VENDEDORES[0]["telefone"]
    out = {}
    out["funil"] = funil.gerar(dcfg, funil=demo.funil_demo(), titulo="Tax Summit 2026",
                               subtitulo="Captação de Negócios — Reforma Tributária", tipo="Evento",
                               saida=saida / "1_Funil_de_Vendas.pdf")
    out["funil_4_etapas"] = funil.gerar(
        dcfg, funil=demo.funil_demo(["Lead qualificado", "Diagnóstico", "Proposta"], [96, 54, 31, 12], [.15, .3, .4], seed=11),
        titulo="Pipeline Comercial", subtitulo="Novos Negócios", saida=saida / "2_Funil_4_etapas.pdf")
    demo.popular_feira(dcfg, feira)
    out["feira"] = feira.relatorio(dcfg, gestor, saida=saida / "3_Feira_Dashboard_e_Listas.pdf")
    out["minhalista"] = feira.minha_lista(dcfg, demo.VENDEDORES[1]["telefone"], saida=saida / "4_Minha_Lista_Bruno.pdf")
    out["mapa_20"] = mapa.gerar(dcfg, fonte="feira", por_pagina=20, saida=saida / "5_Mapa_de_Leads_20.pdf")
    out["mapa_16"] = mapa.gerar(dcfg, fonte="feira", por_pagina=16, temperatura="quente", saida=saida / "6_Mapa_de_Leads_16_quentes.pdf")
    out["ranking"] = feira.ranking(dcfg)
    return {"pasta": str(saida), "relatorios": out,
            "layout_ok": all(v.get("layout_ok", True) for v in out.values() if isinstance(v, dict))}


def cmd_verificar(cfg, a):
    """Checa configuração, Chromium e acesso ao CRM."""
    import shutil
    res = {"config": str(Path(config_mod.os.environ.get("TAXFUNIL_CONFIG") or config_mod.BASE_DIR / "config.yaml")),
           "crm": cfg["crm"]["provedor"], "vendedores": len(cfg["vendedores"])}
    try:
        import playwright  # noqa: F401
        res["renderizador"] = "playwright"
    except ImportError:
        from taxfunil.render import _chrome_path
        res["renderizador"] = _chrome_path() or "NÃO ENCONTRADO"
    try:
        r = cmd_pipelines(cfg, a)
        res["crm_ok"] = True
        res["pipelines"] = r.get("pipelines")
    except Exception as e:
        res["crm_ok"] = False
        res["crm_erro"] = str(e)
    res["python"] = sys.version.split()[0]
    res["chromium_no_path"] = bool(shutil.which("chromium") or shutil.which("google-chrome"))
    return res


def build_parser():
    p = argparse.ArgumentParser(prog="taxfunil", description="Tax Group · Funil, Feiras e Mapa de Leads (Argos OpenClaw)")
    p.add_argument("--config", help="caminho do config.yaml")
    sp = p.add_subparsers(dest="cmd", required=True)

    f = sp.add_parser("funil", help="PDF do funil de vendas + lista de empresas por etapa")
    f.add_argument("--pipeline"); f.add_argument("--dias", type=int)
    f.add_argument("--inicio"); f.add_argument("--fim")
    f.add_argument("--titulo"); f.add_argument("--subtitulo"); f.add_argument("--tipo", default="Negócios")

    sp.add_parser("pipelines", help="lista os pipelines do CRM conectado")

    fe = sp.add_parser("feira", help="captação em feiras e eventos")
    fa = fe.add_subparsers(dest="acao", required=True)
    ev = fa.add_parser("evento"); ev.add_argument("sub", choices=["criar", "listar", "ativar", "encerrar"])
    ev.add_argument("--nome"); ev.add_argument("--local"); ev.add_argument("--inicio"); ev.add_argument("--fim")
    ev.add_argument("--pipeline"); ev.add_argument("--evento")
    for nome in ("capturar", "corrigir", "excluir", "ranking", "relatorio", "minhalista", "sincronizar", "exportar"):
        x = fa.add_parser(nome)
        x.add_argument("--evento", help="id ou nome da feira (padrão: a feira ativa)")
        if nome not in ("ranking", "sincronizar"):
            x.add_argument("--remetente", required=True, help="telefone do WhatsApp de quem pediu")
        if nome in ("capturar", "corrigir"):
            x.add_argument("--dados", required=True, help="JSON com os campos (ou @arquivo.json)")
        if nome in ("corrigir", "excluir"):
            x.add_argument("--captura", required=True, help="número da captura (#)")
        if nome == "minhalista":
            x.add_argument("--vendedor", help="(gestor) gerar a lista de outro vendedor")

    m = sp.add_parser("mapa", help="mapa de leads em cards")
    m.add_argument("--fonte", choices=["feira", "crm"], default="feira")
    m.add_argument("--evento"); m.add_argument("--pipeline"); m.add_argument("--dias", type=int)
    m.add_argument("--vendedor"); m.add_argument("--temperatura"); m.add_argument("--etapa")
    m.add_argument("--cards", type=int, choices=[16, 20])

    d = sp.add_parser("demo", help="gera todos os relatórios com dados fictícios")
    d.add_argument("--saida")
    sp.add_parser("verificar", help="checa instalação, configuração e CRM")
    return p


def main(argv=None):
    a = build_parser().parse_args(argv)
    try:
        cfg = config_mod.load(a.config)
        handler = {"funil": cmd_funil, "pipelines": cmd_pipelines, "feira": cmd_feira, "mapa": cmd_mapa,
                   "demo": cmd_demo, "verificar": cmd_verificar}[a.cmd]
        res = {"ok": True, **handler(cfg, a)}
        code = 0
    except Exception as e:  # o agente precisa de uma resposta legível, nunca de um traceback
        res, code = {"ok": False, "erro": str(e), "tipo": type(e).__name__}, 1
    print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
    return code


if __name__ == "__main__":
    sys.exit(main())
