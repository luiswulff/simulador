"""Comando /feira: captação de contatos no corredor via WhatsApp, ranking dos vendedores e relatórios.
As capturas ficam num SQLite local (dados/feira.db) e são enviadas ao CRM conforme feira.envio_crm."""
import atexit
import csv
import json
import sqlite3
from datetime import datetime

from .crm import CRMError, conector
from .model import Captura
from .render import build_pdf
from .util import (TEMP, dominio_do_email, empresa_chave, iniciais, lerp, normaliza_email, normaliza_telefone,
                   normaliza_temperatura, now, parse_reuniao)

SCHEMA = """
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, local TEXT DEFAULT '', inicio TEXT, fim TEXT,
  pipeline TEXT DEFAULT '', ativo INTEGER DEFAULT 0, criado_em TEXT);
CREATE TABLE IF NOT EXISTS capturas (
  id INTEGER PRIMARY KEY, evento_id INTEGER NOT NULL, seq INTEGER NOT NULL, vendedor TEXT NOT NULL,
  vendedor_ref TEXT DEFAULT '', nome TEXT DEFAULT '', cargo TEXT DEFAULT '', empresa TEXT DEFAULT '',
  empresa_chave TEXT DEFAULT '', telefone TEXT DEFAULT '', email TEXT DEFAULT '', dominio TEXT DEFAULT '',
  interesse TEXT DEFAULT '', temperatura TEXT DEFAULT '', reuniao TEXT, origem TEXT DEFAULT 'Texto',
  observacao TEXT DEFAULT '', consentimento INTEGER DEFAULT 0, criado_em TEXT, atualizado_em TEXT,
  mesclagens INTEGER DEFAULT 0, crm_status TEXT DEFAULT 'pendente', crm_ids TEXT DEFAULT '',
  crm_erro TEXT DEFAULT '', excluida INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_cap_evento ON capturas(evento_id, excluida);
"""
CAMPOS = ["nome", "cargo", "empresa", "telefone", "email", "site", "interesse", "temperatura", "reuniao", "origem",
          "observacao", "consentimento"]
ORIGENS = {"texto": "Texto", "foto": "Foto do crachá", "cracha": "Foto do crachá", "crachá": "Foto do crachá",
           "cartao": "Foto do cartão", "cartão": "Foto do cartão", "audio": "Áudio", "áudio": "Áudio"}


class FeiraError(RuntimeError):
    pass


_CONS = {}


def _db(cfg):
    """Uma conexão por arquivo de banco no processo (a CLI roda um comando por processo)."""
    path = str(cfg.path("dados") / "feira.db")
    if path not in _CONS:
        con = sqlite3.connect(path, timeout=15)
        con.row_factory = sqlite3.Row
        con.executescript(SCHEMA)
        _CONS[path] = con
    return _CONS[path]


@atexit.register
def _fechar():
    for con in _CONS.values():
        con.close()


def _bool(v):
    return str(v).strip().lower() in ("1", "true", "sim", "s", "yes", "y", "autorizou", "ok")


def _cap(r):
    return Captura(
        id=r["id"], evento_id=r["evento_id"], seq=r["seq"], vendedor=r["vendedor"], nome=r["nome"],
        empresa=r["empresa"], temperatura=r["temperatura"], cargo=r["cargo"], telefone=r["telefone"],
        email=r["email"], dominio=r["dominio"], interesse=r["interesse"],
        reuniao=datetime.fromisoformat(r["reuniao"]) if r["reuniao"] else None, origem=r["origem"],
        observacao=r["observacao"], consentimento=bool(r["consentimento"]),
        criado_em=datetime.fromisoformat(r["criado_em"]), crm_status=r["crm_status"])


# ------------------------------------------------------------------ vendedores e permissões
def _vendedor(cfg, remetente):
    v = cfg.vendedor(remetente)
    if v:
        return v
    if cfg["vendedores"]:
        raise FeiraError(f"Remetente {remetente} não está cadastrado em 'vendedores' no config.yaml. "
                         "Peça ao gestor para incluir seu nome e telefone.")
    return {"nome": str(remetente or "Vendedor"), "papel": "", "gestor": True}


def _gestor(cfg, remetente):
    return bool(_vendedor(cfg, remetente).get("gestor"))


# ------------------------------------------------------------------ eventos
def evento_criar(cfg, nome, local="", inicio="", fim="", pipeline=""):
    con = _db(cfg)
    hoje = now(cfg["fuso"])
    con.execute("UPDATE eventos SET ativo = 0")
    cur = con.execute("INSERT INTO eventos (nome, local, inicio, fim, pipeline, ativo, criado_em) VALUES (?,?,?,?,?,1,?)",
                      (nome, local, inicio or hoje.date().isoformat(), fim or inicio or hoje.date().isoformat(),
                       pipeline, hoje.isoformat(timespec="seconds")))
    con.commit()
    return {"evento_id": cur.lastrowid, "nome": nome, "ativo": True,
            "mensagem": f"Feira ativa: {nome}. Pode mandar as capturas."}


def evento_listar(cfg):
    con = _db(cfg)
    rows = con.execute("""SELECT e.*, (SELECT COUNT(*) FROM capturas c WHERE c.evento_id = e.id AND c.excluida = 0) n
                          FROM eventos e ORDER BY e.id DESC""").fetchall()
    return {"eventos": [dict(id=r["id"], nome=r["nome"], local=r["local"], inicio=r["inicio"], fim=r["fim"],
                             ativo=bool(r["ativo"]), capturas=r["n"]) for r in rows]}


def evento_ativar(cfg, ref):
    con = _db(cfg)
    ev = _evento(con, ref)
    con.execute("UPDATE eventos SET ativo = (id = ?)", (ev["id"],))
    con.commit()
    return {"evento_id": ev["id"], "nome": ev["nome"], "ativo": True}


def evento_encerrar(cfg, ref=None):
    con = _db(cfg)
    ev = _evento(con, ref)
    con.execute("UPDATE eventos SET ativo = 0 WHERE id = ?", (ev["id"],))
    con.commit()
    return {"evento_id": ev["id"], "nome": ev["nome"], "ativo": False}


def _evento(con, ref=None):
    if ref:
        r = con.execute("SELECT * FROM eventos WHERE id = ? OR lower(nome) = lower(?) ORDER BY id DESC",
                        (ref if str(ref).isdigit() else -1, str(ref))).fetchone()
        if not r:
            r = con.execute("SELECT * FROM eventos WHERE lower(nome) LIKE lower(?) ORDER BY id DESC", (f"%{ref}%",)).fetchone()
    else:
        r = con.execute("SELECT * FROM eventos WHERE ativo = 1 ORDER BY id DESC").fetchone()
    if not r:
        raise FeiraError("Nenhuma feira ativa. Crie uma com: feira evento criar --nome \"...\"" if not ref
                         else f"Feira '{ref}' não encontrada.")
    return dict(r)


# ------------------------------------------------------------------ captura
def _normalizar(dados, ref):
    d = {k: v for k, v in (dados or {}).items() if k in CAMPOS and v not in (None, "")}
    out = {}
    if "nome" in d: out["nome"] = " ".join(str(d["nome"]).split()).title() if str(d["nome"]).isupper() or str(d["nome"]).islower() else " ".join(str(d["nome"]).split())
    if "cargo" in d: out["cargo"] = str(d["cargo"]).strip()
    if "empresa" in d:
        out["empresa"] = " ".join(str(d["empresa"]).split())
        out["empresa_chave"] = empresa_chave(out["empresa"])
    if "telefone" in d: out["telefone"] = normaliza_telefone(str(d["telefone"]))
    if "email" in d:
        out["email"] = normaliza_email(str(d["email"]))
        if out["email"]:
            out["dominio"] = dominio_do_email(out["email"])
    if "site" in d:
        from .util import normaliza_dominio
        out["dominio"] = normaliza_dominio(str(d["site"]))
    if "interesse" in d: out["interesse"] = str(d["interesse"]).strip()
    if "temperatura" in d: out["temperatura"] = normaliza_temperatura(str(d["temperatura"]))
    if "reuniao" in d:
        dt = parse_reuniao(d["reuniao"], ref)
        out["reuniao"] = dt.isoformat(timespec="minutes") if dt else None
    if "origem" in d: out["origem"] = ORIGENS.get(str(d["origem"]).strip().lower(), str(d["origem"]).strip().capitalize())
    if "observacao" in d: out["observacao"] = str(d["observacao"]).strip()
    if "consentimento" in d: out["consentimento"] = 1 if _bool(d["consentimento"]) else 0
    return out


def _pendencias(cfg, r):
    falta = []
    for campo in cfg["feira"]["campos_obrigatorios"]:
        if campo == "contato":
            if not (r.get("telefone") or r.get("email")):
                falta.append("telefone ou e-mail")
        elif campo == "consentimento":
            if not r.get("consentimento"):
                falta.append("consentimento LGPD (o contato autorizou ser contatado?)")
        elif not r.get(campo):
            falta.append({"temperatura": "temperatura (quente, morno ou frio)"}.get(campo, campo))
    return falta


def capturar(cfg, remetente, dados, evento=None):
    con = _db(cfg)
    ev = _evento(con, evento)
    vend = _vendedor(cfg, remetente)
    agora = now(cfg["fuso"])
    novo = _normalizar(dados, agora)
    if not (novo.get("nome") or novo.get("empresa")):
        raise FeiraError("Captura sem nome e sem empresa. Mande ao menos o nome do contato e a empresa.")

    # duplicidade: mesmo e-mail ou telefone já captado nesta feira → mescla
    dup = None
    if novo.get("email"):
        dup = con.execute("SELECT * FROM capturas WHERE evento_id=? AND excluida=0 AND email=?", (ev["id"], novo["email"])).fetchone()
    if not dup and novo.get("telefone"):
        dup = con.execute("SELECT * FROM capturas WHERE evento_id=? AND excluida=0 AND telefone=?", (ev["id"], novo["telefone"])).fetchone()
    if dup:
        upd = {k: v for k, v in novo.items() if v and (not dup[k] or k in ("temperatura", "reuniao", "observacao"))}
        upd.update(atualizado_em=agora.isoformat(timespec="seconds"))
        con.execute(f"UPDATE capturas SET {', '.join(f'{k}=?' for k in upd)}, mesclagens = mesclagens + 1 WHERE id=?",
                    (*upd.values(), dup["id"]))
        con.commit()
        row = dict(con.execute("SELECT * FROM capturas WHERE id=?", (dup["id"],)).fetchone())
        res = _resposta(cfg, con, ev, row, vend)
        res.update(duplicado=True, captado_antes_por=dup["vendedor"],
                   mensagem_dica=f"Esse contato já tinha sido captado por {dup['vendedor']} "
                                 f"às {datetime.fromisoformat(dup['criado_em']).strftime('%H:%M')}; os dados foram mesclados na captura #{dup['seq']}.")
        return res

    mesma_empresa = []
    if novo.get("empresa_chave"):
        for r in con.execute("SELECT vendedor, nome, criado_em FROM capturas WHERE evento_id=? AND excluida=0 AND empresa_chave=?",
                             (ev["id"], novo["empresa_chave"])):
            mesma_empresa.append({"vendedor": r["vendedor"], "contato": r["nome"],
                                  "hora": datetime.fromisoformat(r["criado_em"]).strftime("%d/%m %H:%M")})
    seq = (con.execute("SELECT COALESCE(MAX(seq), 0) FROM capturas WHERE evento_id=?", (ev["id"],)).fetchone()[0]) + 1
    row = dict(evento_id=ev["id"], seq=seq, vendedor=vend["nome"], vendedor_ref=str(remetente or ""), origem="Texto",
               criado_em=agora.isoformat(timespec="seconds"), atualizado_em=agora.isoformat(timespec="seconds"))
    row.update(novo)
    cur = con.execute(f"INSERT INTO capturas ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})", tuple(row.values()))
    con.commit()
    row = dict(con.execute("SELECT * FROM capturas WHERE id=?", (cur.lastrowid,)).fetchone())
    res = _resposta(cfg, con, ev, row, vend)
    res.update(duplicado=False, mesma_empresa=mesma_empresa)
    return res


def _sync_um(cfg, con, ev, row, vend):
    modo = cfg["feira"]["envio_crm"]
    if modo != "imediato" or _pendencias(cfg, row) or row["crm_status"] == "enviado":
        return
    try:
        ids = conector(cfg).enviar_captura(_cap(row), ev, vend)
        con.execute("UPDATE capturas SET crm_status='enviado', crm_ids=?, crm_erro='' WHERE id=?", (json.dumps(ids), row["id"]))
    except Exception as e:   # o CRM fora do ar não pode impedir a captura no corredor
        con.execute("UPDATE capturas SET crm_status='erro', crm_erro=? WHERE id=?", (str(e)[:500], row["id"]))
    con.commit()


def _resposta(cfg, con, ev, row, vend):
    _sync_um(cfg, con, ev, row, vend)
    row = dict(con.execute("SELECT * FROM capturas WHERE id=?", (row["id"],)).fetchone())
    rk = ranking(cfg, ev["id"], con=con)
    eu = next((s for s in rk["ranking"] if s["vendedor"] == vend["nome"]), None)
    falta = _pendencias(cfg, row)
    return {
        "captura": row["seq"], "evento": ev["nome"],
        "dados": {k: row[k] for k in ("nome", "cargo", "empresa", "telefone", "email", "interesse", "temperatura",
                                      "reuniao", "origem", "observacao") if row[k]}
        | ({"reuniao": datetime.fromisoformat(row["reuniao"]).strftime("%d/%m/%Y %H:%M")} if row["reuniao"] else {}),
        "consentimento": bool(row["consentimento"]),
        "pendencias": falta, "status": "pendente" if falta else "completa",
        "crm": row["crm_status"], "crm_erro": row["crm_erro"] or None,
        "vendedor": {"nome": vend["nome"], "capturas": eu["capturas"] if eu else 0, "pontos": eu["pontos"] if eu else 0,
                     "posicao": eu["posicao"] if eu else None, "total_vendedores": len(rk["ranking"]),
                     "pontos_para_subir": eu.get("pontos_para_subir") if eu else None},
    }


def _ref_captura(con, ev, ref):
    ref = str(ref).lstrip("#")
    r = con.execute("SELECT * FROM capturas WHERE evento_id=? AND seq=? AND excluida=0", (ev["id"], int(ref))).fetchone()
    if not r:
        raise FeiraError(f"Captura #{ref} não encontrada na feira {ev['nome']}.")
    return r


def corrigir(cfg, remetente, ref, dados, evento=None):
    con = _db(cfg)
    ev = _evento(con, evento)
    vend = _vendedor(cfg, remetente)
    r = _ref_captura(con, ev, ref)
    if r["vendedor"] != vend["nome"] and not vend.get("gestor"):
        raise FeiraError("Você só pode corrigir as suas próprias capturas.")
    upd = _normalizar(dados, now(cfg["fuso"]))
    if not upd:
        raise FeiraError("Nada para corrigir: informe ao menos um campo.")
    if r["crm_status"] == "enviado":
        upd["crm_status"] = "alterado"
    upd["atualizado_em"] = now(cfg["fuso"]).isoformat(timespec="seconds")
    con.execute(f"UPDATE capturas SET {', '.join(f'{k}=?' for k in upd)} WHERE id=?", (*upd.values(), r["id"]))
    con.commit()
    row = dict(con.execute("SELECT * FROM capturas WHERE id=?", (r["id"],)).fetchone())
    dono = cfg.vendedor(row["vendedor_ref"]) or {"nome": row["vendedor"]}
    res = _resposta(cfg, con, ev, row, dono)
    res["corrigido"] = sorted(k for k in upd if k not in ("atualizado_em", "empresa_chave", "crm_status"))
    if r["crm_status"] == "enviado":
        res["aviso"] = "Essa captura já estava no CRM; a correção ficou registrada aqui e deve ser ajustada no CRM."
    return res


def excluir(cfg, remetente, ref, evento=None):
    con = _db(cfg)
    ev = _evento(con, evento)
    vend = _vendedor(cfg, remetente)
    r = _ref_captura(con, ev, ref)
    if r["vendedor"] != vend["nome"] and not vend.get("gestor"):
        raise FeiraError("Você só pode excluir as suas próprias capturas.")
    con.execute("UPDATE capturas SET excluida=1 WHERE id=?", (r["id"],))
    con.commit()
    return {"excluida": r["seq"], "contato": r["nome"], "empresa": r["empresa"]}


def sincronizar(cfg, evento=None):
    con = _db(cfg)
    ev = _evento(con, evento)
    crm = conector(cfg)
    enviados, erros, incompletas = 0, [], 0
    for r in con.execute("SELECT * FROM capturas WHERE evento_id=? AND excluida=0 AND crm_status IN ('pendente','erro')",
                         (ev["id"],)).fetchall():
        if _pendencias(cfg, dict(r)):
            incompletas += 1
            continue
        try:
            ids = crm.enviar_captura(_cap(r), ev, cfg.vendedor(r["vendedor_ref"]) or {"nome": r["vendedor"]})
            con.execute("UPDATE capturas SET crm_status='enviado', crm_ids=?, crm_erro='' WHERE id=?", (json.dumps(ids), r["id"]))
            enviados += 1
        except (CRMError, Exception) as e:
            con.execute("UPDATE capturas SET crm_status='erro', crm_erro=? WHERE id=?", (str(e)[:500], r["id"]))
            erros.append({"captura": r["seq"], "erro": str(e)[:200]})
        con.commit()
    return {"evento": ev["nome"], "enviados": enviados, "erros": erros, "incompletas_nao_enviadas": incompletas}


# ------------------------------------------------------------------ ranking e métricas
def _linhas(con, evento_id, vendedor=None):
    q = "SELECT * FROM capturas WHERE evento_id=? AND excluida=0"
    args = [evento_id]
    if vendedor:
        q += " AND vendedor=?"
        args.append(vendedor)
    return [dict(r) for r in con.execute(q + " ORDER BY criado_em", args).fetchall()]


def _vendedores_stats(cfg, rows):
    pts = cfg["feira"]["pontuacao"]
    papeis = {v["nome"]: v.get("papel", "") for v in cfg["vendedores"]}
    nomes = list(dict.fromkeys([r["vendedor"] for r in rows] + list(papeis)))
    out = []
    for nome in nomes:
        mine = [r for r in rows if r["vendedor"] == nome]
        q = sum(r["temperatura"] == "Quente" for r in mine)
        rr = sum(bool(r["reuniao"]) for r in mine)
        out.append(dict(name=nome, role=papeis.get(nome, ""), caps=mine, n=len(mine), quentes=q, reunioes=rr,
                        empresas=len({r["empresa_chave"] or r["empresa"] for r in mine}),
                        taxa=f"{100 * rr / len(mine):.0f}%" if mine else "—",
                        pts=len(mine) * pts["captura"] + q * pts["quente"] + rr * pts["reuniao"], ini=iniciais(nome)))
    out.sort(key=lambda s: (-s["pts"], -s["n"], s["name"]))
    top = (out[0]["pts"] if out else 0) or 1
    for i, s in enumerate(out):
        s["rank"] = i + 1
        s["w"] = round(100 * s["pts"] / top)
    return out


def ranking(cfg, evento=None, con=None):
    con = con or _db(cfg)
    ev = _evento(con, evento) if not isinstance(evento, int) else dict(con.execute("SELECT * FROM eventos WHERE id=?", (evento,)).fetchone())
    vs = _vendedores_stats(cfg, _linhas(con, ev["id"]))
    lista = []
    for i, s in enumerate(vs):
        item = {"posicao": s["rank"], "vendedor": s["name"], "pontos": s["pts"], "capturas": s["n"],
                "quentes": s["quentes"], "reunioes": s["reunioes"]}
        if i > 0:
            item["pontos_para_subir"] = vs[i - 1]["pts"] - s["pts"] + 1
        lista.append(item)
    p = cfg["feira"]["pontuacao"]
    return {"evento": ev["nome"], "atualizado": now(cfg["fuso"]).strftime("%d/%m %H:%M"), "ranking": lista,
            "regra": f"captura {p['captura']} pt · quente +{p['quente']} · reunião +{p['reuniao']}"}


def metricas(cfg, ev, rows):
    sellers = [s for s in _vendedores_stats(cfg, rows) if s["n"]]
    for r in rows:
        r["ts"] = datetime.fromisoformat(r["criado_em"])
        r["reuniao_dt"] = datetime.fromisoformat(r["reuniao"]) if r["reuniao"] else None
    n = len(rows)
    temps = [dict(k=k, c=v, n=sum(r["temperatura"] == k for r in rows)) for k, v in TEMP.items()]
    for t in temps:
        t["p"] = round(100 * t["n"] / n) if n else 0
    qual = sum(r["temperatura"] in ("Quente", "Morno") for r in rows)
    meet = sum(bool(r["reuniao"]) for r in rows)
    funil = [("Contatos captados", n), ("Qualificados (quente + morno)", qual), ("Quentes", temps[0]["n"]), ("Reunião agendada", meet)]
    funil = [dict(name=a, v=b, w=max(8, round(100 * b / n)) if n else 8, p=f"{100 * b / n:.0f}%" if n else "0%") for a, b in funil]
    dias = sorted({r["ts"].date() for r in rows})
    hs = [r["ts"].hour for r in rows] or [9]
    hours = list(range(max(6, min(min(hs), 9)), min(23, max(max(hs), 18)) + 1))
    grid = [[sum(1 for r in rows if r["ts"].date() == d and r["ts"].hour == h) for d in dias] for h in hours]
    cores_dia = [lerp("#B4C3EA", "#16295F", i / max(1, len(dias) - 1)) for i in range(len(dias))] if len(dias) > 1 else ["#274397"]
    tot_h = [sum(g) for g in grid]
    peak_h = hours[max(range(len(hours)), key=lambda i: tot_h[i])] if rows else 9
    by_day = [sum(1 for r in rows if r["ts"].date() == d) for d in dias]
    inter, origem = {}, {}
    for r in rows:
        k = r["interesse"] or "Não informado"
        inter[k] = inter.get(k, 0) + 1
        origem[r["origem"] or "Texto"] = origem.get(r["origem"] or "Texto", 0) + 1
    inter = sorted(inter.items(), key=lambda kv: -kv[1])
    completos = sum(bool(r["telefone"] and r["email"]) for r in rows)
    enviados = sum(r["crm_status"] == "enviado" for r in rows)
    return dict(
        sellers=sellers, n=n, empresas=len({r["empresa_chave"] or r["empresa"] for r in rows}), temps=temps, funnel=funil,
        meet=meet, hours=hours, grid=grid, gmax=max(tot_h + [1]), peak_h=peak_h, by_day=by_day, dias=dias,
        cores_dia=cores_dia, best_day=max(range(len(dias)), key=lambda i: by_day[i]) if dias else 0,
        inter=[dict(k=k, v=v, w=round(100 * v / inter[0][1])) for k, v in inter[:5]],
        origem=sorted(origem.items(), key=lambda kv: -kv[1])[:4],
        hot_nomeet=sum(r["temperatura"] == "Quente" and not r["reuniao"] for r in rows),
        media=round(n / len(sellers)) if sellers else 0,
        qualidade=dict(completos=f"{100 * completos / n:.0f}%" if n else "—",
                       mesclados=sum(r["mesclagens"] for r in rows),
                       lgpd=f"{100 * sum(bool(r['consentimento']) for r in rows) / n:.0f}%" if n else "—",
                       pendentes=sum(bool(_pendencias(cfg, r)) for r in rows)),
        crm=dict(enviados=enviados, pct=f"{100 * enviados / n:.0f}%" if n else "—",
                 erros=sum(r["crm_status"] == "erro" for r in rows)))


ROWS_FIRST, ROWS_NEXT = 28, 31


def paginar(sellers):
    pages = []
    for s in sellers:
        rows, first = s["caps"], True
        while rows:
            k = ROWS_FIRST if first else ROWS_NEXT
            pages.append(dict(s=s, rows=rows[:k], first=first, start=len(s["caps"]) - len(rows)))
            rows, first = rows[k:], False
    return pages


def _periodo(ev):
    try:
        a, b = datetime.fromisoformat(ev["inicio"]), datetime.fromisoformat(ev["fim"])
        return a.strftime("%d/%m/%Y") if a == b else f"{a:%d/%m} a {b:%d/%m/%Y}"
    except (TypeError, ValueError):
        return ev.get("inicio") or ""


def _arquivo(cfg, prefixo, ev, sufixo=""):
    nome = f"{prefixo}_{ev['nome']}{sufixo}_{now(cfg['fuso']):%Y%m%d_%H%M}".replace(" ", "_").replace("/", "-")
    return cfg.path("saidas") / f"{nome}.pdf"


def relatorio(cfg, remetente, evento=None, saida=None):
    if not _gestor(cfg, remetente):
        raise FeiraError("O relatório completo da feira é restrito aos gestores. Use 'minha lista' para ver as suas capturas.")
    con = _db(cfg)
    ev = _evento(con, evento)
    rows = _linhas(con, ev["id"])
    if not rows:
        raise FeiraError(f"A feira {ev['nome']} ainda não tem capturas.")
    m = metricas(cfg, ev, rows)
    pages = paginar(m["sellers"])
    res = build_pdf(cfg, "feira.html", saida or _arquivo(cfg, "Feira", ev), m=m, pages=pages, total=1 + len(pages),
                    so_lista=False, ev=ev, periodo=_periodo(ev), TEMP=TEMP, PTS=cfg["feira"]["pontuacao"],
                    atualizado=now(cfg["fuso"]).strftime("%d/%m/%Y · %H:%M"), fonte_crm=cfg["crm"]["provedor"].title())
    res["resumo"] = {"evento": ev["nome"], "capturas": m["n"], "empresas": m["empresas"], "quentes": m["temps"][0]["n"],
                     "reunioes": m["meet"], "lider": m["sellers"][0]["name"] if m["sellers"] else None}
    return res


def minha_lista(cfg, remetente, evento=None, vendedor=None, saida=None):
    con = _db(cfg)
    ev = _evento(con, evento)
    eu = _vendedor(cfg, remetente)
    alvo = vendedor if (vendedor and eu.get("gestor")) else eu["nome"]
    if vendedor and not eu.get("gestor") and vendedor != eu["nome"]:
        raise FeiraError("Você só pode gerar a sua própria lista.")
    rows_all = _linhas(con, ev["id"])
    m = metricas(cfg, ev, rows_all)
    s = next((x for x in m["sellers"] if x["name"] == alvo), None)
    if not s:
        raise FeiraError(f"{alvo} ainda não tem capturas na feira {ev['nome']}.")
    pages = paginar([s])
    res = build_pdf(cfg, "feira.html", saida or _arquivo(cfg, "Capturas", ev, "_" + alvo), m=m, pages=pages,
                    total=len(pages), so_lista=True, ev=ev, periodo=_periodo(ev), TEMP=TEMP,
                    PTS=cfg["feira"]["pontuacao"], atualizado=now(cfg["fuso"]).strftime("%d/%m/%Y · %H:%M"),
                    fonte_crm=cfg["crm"]["provedor"].title())
    res["resumo"] = {"vendedor": alvo, "capturas": s["n"], "posicao": s["rank"], "pontos": s["pts"]}
    return res


def capturas_do_evento(cfg, evento=None):
    con = _db(cfg)
    ev = _evento(con, evento)
    return ev, [_cap(r) for r in con.execute("SELECT * FROM capturas WHERE evento_id=? AND excluida=0 ORDER BY criado_em",
                                             (ev["id"],)).fetchall()]


def exportar_csv(cfg, remetente, evento=None):
    if not _gestor(cfg, remetente):
        raise FeiraError("Exportação restrita aos gestores.")
    con = _db(cfg)
    ev = _evento(con, evento)
    out = _arquivo(cfg, "Capturas", ev).with_suffix(".csv")
    cols = ["seq", "vendedor", "nome", "cargo", "empresa", "telefone", "email", "dominio", "interesse", "temperatura",
            "reuniao", "origem", "observacao", "consentimento", "criado_em", "crm_status"]
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(cols)
        for r in _linhas(con, ev["id"]):
            w.writerow([r[c] for c in cols])
    return {"arquivo": str(out)}
