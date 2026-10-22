"""Conector HubSpot (API v3/v4, token de Private App).
Escopos necessários: crm.objects.deals.read/write, crm.objects.companies.read/write,
crm.objects.contacts.read/write, crm.objects.owners.read (e crm.schemas.deals.read para pipelines)."""
import time
from datetime import datetime

import requests

from . import CRMError
from ..model import Etapa, Funil, Negocio
from ..util import dominio_do_email, normaliza_dominio, normaliza_telefone, now

API = "https://api.hubapi.com"


def _dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


class HubSpot:
    nome = "HubSpot"

    def __init__(self, cfg):
        self.cfg = cfg
        self.hcfg = cfg["crm"]["hubspot"]
        token = cfg.secret("hubspot")
        if not token:
            raise CRMError("Defina HUBSPOT_TOKEN (token da Private App do HubSpot).")
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

    # ------------------------------------------------------------------ HTTP
    def _req(self, method, path, **kw):
        for tentativa in range(5):
            r = self.s.request(method, API + path, timeout=30, **kw)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(1.5 * (tentativa + 1))
                continue
            if r.status_code >= 400:
                raise CRMError(f"HubSpot {method} {path} → {r.status_code}: {r.text[:300]}")
            return r.json() if r.content else {}
        raise CRMError(f"HubSpot {method} {path}: limite de tentativas excedido")

    # ------------------------------------------------------------------ pipelines
    def pipelines(self):
        return self._req("GET", "/crm/v3/pipelines/deals").get("results", [])

    def _pipeline(self, ref):
        pls = self.pipelines()
        if not pls:
            raise CRMError("Nenhum pipeline de negócios encontrado no HubSpot.")
        if not ref:
            return pls[0]
        for p in pls:
            if str(p["id"]) == str(ref) or p["label"].strip().lower() == str(ref).strip().lower():
                return p
        raise CRMError(f"Pipeline '{ref}' não encontrado. Disponíveis: {', '.join(p['label'] for p in pls)}")

    @staticmethod
    def _split_stages(pipeline):
        stages = sorted(pipeline["stages"], key=lambda s: s.get("displayOrder", 0))
        abertas, ganho, perdido = [], None, set()
        for s in stages:
            md = s.get("metadata", {})
            fechado = str(md.get("isClosed", "false")).lower() == "true"
            prob = float(md.get("probability", 0) or 0)
            if fechado and prob >= 1:
                ganho = ganho or s
            elif fechado:
                perdido.add(s["id"])
            else:
                abertas.append(s)
        return abertas, ganho, perdido

    # ------------------------------------------------------------------ funil
    def carregar_funil(self, pipeline_ref, inicio, fim):
        pl = self._pipeline(pipeline_ref)
        abertas, ganho, perdido_ids = self._split_stages(pl)
        etapas = [Etapa(s["id"], s["label"]) for s in abertas] + [
            Etapa(ganho["id"] if ganho else "won", ganho["label"] if ganho else "Ganho", ganho=True)]
        idx = {e.id: i for i, e in enumerate(etapas)}
        stage_ids = [s["id"] for s in abertas] + ([ganho["id"]] if ganho else [])

        campo_sol = self.hcfg.get("campo_solucao") or ""
        props = ["dealname", "amount", "dealstage", "pipeline", "createdate", "closedate", "hubspot_owner_id",
                 "notes_last_updated", "hs_lastmodifieddate", "closed_lost_reason", "num_associated_contacts"]
        props += [f"hs_v2_date_entered_{sid}" for sid in stage_ids] + [f"hs_date_entered_{sid}" for sid in stage_ids]
        if campo_sol:
            props.append(campo_sol)

        deals, after = [], None
        body = {"filterGroups": [{"filters": [
            {"propertyName": "pipeline", "operator": "EQ", "value": pl["id"]},
            {"propertyName": "createdate", "operator": "BETWEEN",
             "value": str(int(inicio.timestamp() * 1000)), "highValue": str(int(fim.timestamp() * 1000))}]}],
            "properties": props, "limit": 100, "sorts": [{"propertyName": "createdate", "direction": "ASCENDING"}]}
        while True:
            if after:
                body["after"] = after
            data = self._req("POST", "/crm/v3/objects/deals/search", json=body)
            deals += data.get("results", [])
            after = data.get("paging", {}).get("next", {}).get("after")
            if not after or len(deals) >= 10000:
                break

        ids = [d["id"] for d in deals]
        d2co = self._assoc("deals", "companies", ids)
        d2ct = self._assoc("deals", "contacts", ids)
        companies = self._batch_read("companies", {c[0] for c in d2co.values() if c},
                                     ["name", "domain", self.hcfg.get("campo_segmento") or "industry",
                                      self.hcfg.get("campo_uf") or "state"])
        contacts = self._batch_read("contacts", {c[0] for c in d2ct.values() if c},
                                    ["firstname", "lastname", "email", "phone", "mobilephone", "jobtitle"])
        owners = self._owners()
        hoje = now(self.cfg["fuso"])

        negocios = []
        for d in deals:
            p = d["properties"]
            st = p.get("dealstage")
            entered = {sid: _dt(p.get(f"hs_v2_date_entered_{sid}") or p.get(f"hs_date_entered_{sid}")) for sid in stage_ids}
            alcancadas = [idx[sid] for sid, dt in entered.items() if dt and sid in idx]
            if ganho and st == ganho["id"]:
                status, etapa_idx = "ganho", len(etapas) - 1
            elif st in perdido_ids:
                status = "perdido"
                etapa_idx = max([i for i in alcancadas if i < len(etapas) - 1], default=0)
            else:
                status = "aberto"
                etapa_idx = max([idx.get(st, 0)] + [i for i in alcancadas if i < len(etapas) - 1])
            co = companies.get((d2co.get(d["id"]) or [None])[0], {})
            ct = contacts.get((d2ct.get(d["id"]) or [None])[0], {})
            criado, fechado = _dt(p.get("createdate")), _dt(p.get("closedate"))
            ent_atual = entered.get(st)
            email = (ct.get("email") or "").lower()
            negocios.append(Negocio(
                id=d["id"], empresa=co.get("name") or p.get("dealname") or "(sem empresa)", etapa_idx=etapa_idx,
                status=status, valor=float(p.get("amount") or 0),
                leads=max(1, len(d2ct.get(d["id"]) or []) or int(float(p.get("num_associated_contacts") or 0))),
                contato=" ".join(x for x in (ct.get("firstname"), ct.get("lastname")) if x),
                cargo=ct.get("jobtitle") or "", email=email,
                telefone=normaliza_telefone(ct.get("phone") or ct.get("mobilephone") or ""),
                responsavel=owners.get(p.get("hubspot_owner_id"), ""),
                solucao=p.get(campo_sol) or "" if campo_sol else "",
                segmento=(co.get(self.hcfg.get("campo_segmento") or "industry") or "").replace("_", " ").title(),
                uf=co.get(self.hcfg.get("campo_uf") or "state") or "",
                dominio=normaliza_dominio(co.get("domain")) or dominio_do_email(email),
                criado_em=criado,
                dias_na_etapa=(hoje - ent_atual).days if status == "aberto" and ent_atual else None,
                dias_para_fechar=(fechado - criado).days if status == "ganho" and fechado and criado else None,
                ultima_interacao=(_dt(p.get("notes_last_updated")) or _dt(p.get("hs_lastmodifieddate")) or hoje).date(),
                motivo_perda=p.get("closed_lost_reason") or ""))
        return Funil(pipeline=pl["label"], fonte=self.nome, etapas=etapas, negocios=negocios)

    def _assoc(self, de, para, ids):
        out = {}
        for ch in _chunks(list(ids), 100):
            data = self._req("POST", f"/crm/v4/associations/{de}/{para}/batch/read",
                             json={"inputs": [{"id": i} for i in ch]})
            for r in data.get("results", []):
                out[str(r["from"]["id"])] = [str(t["toObjectId"]) for t in r.get("to", [])]
        return out

    def _batch_read(self, obj, ids, props):
        out = {}
        for ch in _chunks(sorted(ids), 100):
            data = self._req("POST", f"/crm/v3/objects/{obj}/batch/read",
                             json={"properties": props, "inputs": [{"id": i} for i in ch]})
            for r in data.get("results", []):
                out[str(r["id"])] = r.get("properties", {})
        return out

    def _owners(self):
        out, after = {}, None
        while True:
            params = {"limit": 500, **({"after": after} if after else {})}
            data = self._req("GET", "/crm/v3/owners", params=params)
            for o in data.get("results", []):
                out[str(o["id"])] = " ".join(x for x in (o.get("firstName"), o.get("lastName")) if x) or o.get("email", "")
            after = data.get("paging", {}).get("next", {}).get("after")
            if not after:
                return out

    # ------------------------------------------------------------------ captura de feira → CRM
    def _search_one(self, obj, prop, value):
        if not value:
            return None
        data = self._req("POST", f"/crm/v3/objects/{obj}/search", json={
            "filterGroups": [{"filters": [{"propertyName": prop, "operator": "EQ", "value": value}]}], "limit": 1})
        res = data.get("results", [])
        return res[0]["id"] if res else None

    def _associate(self, de, de_id, para, para_id):
        self._req("PUT", f"/crm/v4/objects/{de}/{de_id}/associations/default/{para}/{para_id}")

    def _owner_id(self, email):
        if not email:
            return None
        data = self._req("GET", "/crm/v3/owners", params={"email": email, "limit": 1})
        res = data.get("results", [])
        return res[0]["id"] if res else None

    def enviar_captura(self, c, evento, vendedor):
        dominio = c.dominio
        empresa_id = self._search_one("companies", "domain", dominio) if dominio else None
        empresa_id = empresa_id or self._search_one("companies", "name", c.empresa)
        if not empresa_id:
            props = {"name": c.empresa, **({"domain": dominio} if dominio else {})}
            empresa_id = self._req("POST", "/crm/v3/objects/companies", json={"properties": props})["id"]

        contato_id = self._search_one("contacts", "email", c.email) if c.email else None
        primeiro, _, resto = c.nome.partition(" ")
        cprops = {"firstname": primeiro, "lastname": resto, "company": c.empresa, "jobtitle": c.cargo,
                  "phone": c.telefone, **({"email": c.email} if c.email else {})}
        cprops = {k: v for k, v in cprops.items() if v}
        if contato_id:
            self._req("PATCH", f"/crm/v3/objects/contacts/{contato_id}", json={"properties": cprops})
        else:
            contato_id = self._req("POST", "/crm/v3/objects/contacts", json={"properties": cprops})["id"]
        self._associate("contacts", contato_id, "companies", empresa_id)

        pl = self._pipeline(evento.get("pipeline") or self.cfg["feira"]["pipeline_crm"] or self.cfg["crm"]["pipeline_padrao"])
        abertas, _, _ = self._split_stages(pl)
        etapa_ref = self.cfg["feira"].get("etapa_crm")
        etapa = next((s for s in abertas if etapa_ref and etapa_ref.lower() in (s["id"].lower(), s["label"].lower())), abertas[0])
        desc = [f"Captado na feira {evento['nome']} por {c.vendedor} ({c.origem}).", f"Temperatura: {c.temperatura}."]
        if c.interesse:
            desc.append(f"Interesse: {c.interesse}.")
        if c.reuniao:
            desc.append(f"Reunião agendada: {c.reuniao.strftime('%d/%m/%Y %H:%M')}.")
        if c.observacao:
            desc.append(f"Obs.: {c.observacao}")
        dprops = {"dealname": f"{c.empresa} — {evento['nome']}", "pipeline": pl["id"], "dealstage": etapa["id"],
                  "description": " ".join(desc)}
        owner = self._owner_id((vendedor or {}).get("email"))
        if owner:
            dprops["hubspot_owner_id"] = owner
        negocio_id = self._req("POST", "/crm/v3/objects/deals", json={"properties": dprops})["id"]
        self._associate("deals", negocio_id, "contacts", contato_id)
        self._associate("deals", negocio_id, "companies", empresa_id)
        return {"empresa": empresa_id, "contato": contato_id, "negocio": negocio_id}
