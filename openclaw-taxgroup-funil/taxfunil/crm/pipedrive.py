"""Conector Pipedrive (API v1, api_token pessoal). No Pipedrive, 'ganho' e 'perdido' são status do negócio,
não etapas: o funil usa as etapas do pipeline e acrescenta a etapa final "Ganho"."""
import time
from datetime import datetime

import requests

from . import CRMError
from ..model import Etapa, Funil, Negocio
from ..util import dominio_do_email, normaliza_telefone, now


def _dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace(" ", "T"))
    except ValueError:
        return None


def _val(field, key="value"):
    return field.get(key) if isinstance(field, dict) else field


def _first(items):
    if isinstance(items, list) and items:
        item = next((i for i in items if i.get("primary")), items[0])
        return item.get("value") or ""
    return items if isinstance(items, str) else ""


class Pipedrive:
    nome = "Pipedrive"

    def __init__(self, cfg):
        self.cfg = cfg
        self.pcfg = cfg["crm"]["pipedrive"]
        self.token = cfg.secret("pipedrive")
        if not self.token:
            raise CRMError("Defina PIPEDRIVE_API_TOKEN (Configurações pessoais → API no Pipedrive).")
        dom = (self.pcfg.get("dominio") or "").strip()
        self.api = f"https://{dom}.pipedrive.com/api/v1" if dom else "https://api.pipedrive.com/v1"
        self.s = requests.Session()

    def _req(self, method, path, params=None, **kw):
        params = {**(params or {}), "api_token": self.token}
        for tentativa in range(5):
            r = self.s.request(method, self.api + path, params=params, timeout=30, **kw)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(1.5 * (tentativa + 1))
                continue
            if r.status_code >= 400:
                raise CRMError(f"Pipedrive {method} {path} → {r.status_code}: {r.text[:300]}")
            body = r.json()
            if not body.get("success", True):
                raise CRMError(f"Pipedrive {path}: {body.get('error')}")
            return body
        raise CRMError(f"Pipedrive {method} {path}: limite de tentativas excedido")

    def _paged(self, path, params=None):
        start, out = 0, []
        while True:
            body = self._req("GET", path, params={**(params or {}), "start": start, "limit": 500})
            out += body.get("data") or []
            pag = (body.get("additional_data") or {}).get("pagination") or {}
            if not pag.get("more_items_in_collection"):
                return out
            start = pag.get("next_start", start + 500)

    def _pipeline(self, ref):
        pls = self._req("GET", "/pipelines").get("data") or []
        if not pls:
            raise CRMError("Nenhum pipeline encontrado no Pipedrive.")
        if not ref:
            return pls[0]
        for p in pls:
            if str(p["id"]) == str(ref) or p["name"].strip().lower() == str(ref).strip().lower():
                return p
        raise CRMError(f"Pipeline '{ref}' não encontrado. Disponíveis: {', '.join(p['name'] for p in pls)}")

    def _stages(self, pipeline_id):
        st = self._req("GET", "/stages", params={"pipeline_id": pipeline_id}).get("data") or []
        return sorted(st, key=lambda s: s.get("order_nr", 0))

    def carregar_funil(self, pipeline_ref, inicio, fim):
        pl = self._pipeline(pipeline_ref)
        stages = self._stages(pl["id"])
        etapas = [Etapa(str(s["id"]), s["name"]) for s in stages] + [Etapa("won", "Ganho", ganho=True)]
        idx = {e.id: i for i, e in enumerate(etapas)}
        campo_sol = self.pcfg.get("campo_solucao") or ""
        hoje = now(self.cfg["fuso"])
        negocios = []
        for d in self._paged("/deals", {"status": "all_not_deleted"}):
            if d.get("pipeline_id") != pl["id"]:
                continue
            criado = _dt(d.get("add_time"))
            if not criado or not (inicio <= criado <= fim):
                continue
            status = {"won": "ganho", "lost": "perdido"}.get(d.get("status"), "aberto")
            etapa_idx = len(etapas) - 1 if status == "ganho" else idx.get(str(d.get("stage_id")), 0)
            pessoa = d.get("person_id") if isinstance(d.get("person_id"), dict) else {}
            email = _first(pessoa.get("email")).lower()
            mudou = _dt(d.get("stage_change_time")) or criado
            ganho_em = _dt(d.get("won_time"))
            ult = _dt(d.get("last_activity_date")) or _dt(d.get("update_time"))
            negocios.append(Negocio(
                id=str(d["id"]), empresa=_val(d.get("org_id"), "name") or d.get("org_name") or d.get("title") or "(sem empresa)",
                etapa_idx=etapa_idx, status=status, valor=float(d.get("value") or 0),
                leads=max(1, int(d.get("participants_count") or 0)),
                contato=pessoa.get("name") or d.get("person_name") or "", email=email,
                telefone=normaliza_telefone(_first(pessoa.get("phone"))),
                responsavel=_val(d.get("user_id"), "name") or d.get("owner_name") or "",
                solucao=str(d.get(campo_sol) or "") if campo_sol else "",
                dominio=dominio_do_email(email), criado_em=criado,
                dias_na_etapa=(hoje - mudou).days if status == "aberto" else None,
                dias_para_fechar=(ganho_em - criado).days if status == "ganho" and ganho_em else None,
                ultima_interacao=ult.date() if ult else None,
                motivo_perda=d.get("lost_reason") or ""))
        return Funil(pipeline=pl["name"], fonte=self.nome, etapas=etapas, negocios=negocios)

    # ------------------------------------------------------------------ captura de feira → CRM
    def _search(self, path, term, fields=None):
        if not term:
            return None
        params = {"term": term, "exact_match": "true", "limit": 1, **({"fields": fields} if fields else {})}
        items = ((self._req("GET", path, params=params).get("data") or {}).get("items")) or []
        return items[0]["item"]["id"] if items else None

    def enviar_captura(self, c, evento, vendedor):
        org_id = self._search("/organizations/search", c.empresa, "name") or \
            self._req("POST", "/organizations", json={"name": c.empresa})["data"]["id"]
        pessoa_id = self._search("/persons/search", c.email, "email") if c.email else None
        if not pessoa_id:
            body = {"name": c.nome, "org_id": org_id}
            if c.email:
                body["email"] = [{"value": c.email, "primary": True, "label": "work"}]
            if c.telefone:
                body["phone"] = [{"value": c.telefone, "primary": True, "label": "work"}]
            pessoa_id = self._req("POST", "/persons", json=body)["data"]["id"]
        pl = self._pipeline(evento.get("pipeline") or self.cfg["feira"]["pipeline_crm"] or self.cfg["crm"]["pipeline_padrao"])
        stages = self._stages(pl["id"])
        ref = (self.cfg["feira"].get("etapa_crm") or "").lower()
        etapa = next((s for s in stages if ref and ref in (str(s["id"]), s["name"].lower())), stages[0])
        negocio = self._req("POST", "/deals", json={"title": f"{c.empresa} — {evento['nome']}", "org_id": org_id,
                                                     "person_id": pessoa_id, "pipeline_id": pl["id"],
                                                     "stage_id": etapa["id"]})["data"]
        nota = [f"Captado na feira {evento['nome']} por {c.vendedor} ({c.origem}).", f"Temperatura: {c.temperatura}."]
        if c.cargo:
            nota.append(f"Cargo: {c.cargo}.")
        if c.interesse:
            nota.append(f"Interesse: {c.interesse}.")
        if c.reuniao:
            nota.append(f"Reunião agendada: {c.reuniao.strftime('%d/%m/%Y %H:%M')}.")
        if c.observacao:
            nota.append(f"Obs.: {c.observacao}")
        self._req("POST", "/notes", json={"content": "<br>".join(nota), "deal_id": negocio["id"]})
        return {"empresa": org_id, "contato": pessoa_id, "negocio": negocio["id"]}
