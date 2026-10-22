"""Conector por arquivo (CSV ou XLSX exportado de qualquer CRM). Útil para CRMs sem API conectada
(ex.: Connect) até o conector dedicado existir. As etapas vêm do config (crm.arquivo.etapas) ou,
se vazio, da ordem em que aparecem no arquivo.

Colunas aceitas (cabeçalho, sem diferenciar maiúsculas/acentos):
  empresa*, etapa*, status (aberto|ganho|perdido), valor, contato, cargo, email, telefone, responsavel,
  solucao, segmento, uf, site, criado_em (AAAA-MM-DD ou DD/MM/AAAA), dias_na_etapa, ultima_interacao,
  motivo_perda, leads, pipeline
"""
import csv
from datetime import datetime
from pathlib import Path

from . import CRMError
from ..config import BASE_DIR
from ..model import Etapa, Funil, Negocio
from ..util import dominio_do_email, normaliza_dominio, normaliza_telefone, slug

STATUS = {"ganho": "ganho", "won": "ganho", "fechado": "ganho", "perdido": "perdido", "lost": "perdido"}


def _date(v):
    v = (v or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(v[:19], fmt)
        except ValueError:
            continue
    return None


def _num(v):
    v = str(v or "").replace("R$", "").strip()
    if "," in v:
        v = v.replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return 0.0


def _rows(path):
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        try:
            import openpyxl
        except ImportError as e:
            raise CRMError("Para ler XLSX instale openpyxl (pip install openpyxl) ou exporte em CSV.") from e
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
        it = ws.iter_rows(values_only=True)
        head = [slug(str(h or "")).replace(" ", "_") for h in next(it)]
        return [{h: ("" if v is None else str(v)) for h, v in zip(head, r)} for r in it]
    raw = path.read_text(encoding="utf-8-sig")
    dialect = csv.Sniffer().sniff(raw[:4096], delimiters=",;\t")
    reader = csv.DictReader(raw.splitlines(), dialect=dialect)
    return [{slug(k or "").replace(" ", "_"): (v or "") for k, v in r.items()} for r in reader]


class Arquivo:
    nome = "Arquivo"

    def __init__(self, cfg, caminho=None):
        self.cfg = cfg
        acfg = cfg["crm"]["arquivo"]
        p = Path(caminho or acfg["caminho"]).expanduser()
        self.path = p if p.is_absolute() else BASE_DIR / p
        self.acfg = acfg

    def carregar_funil(self, pipeline_ref, inicio, fim):
        if not self.path.exists():
            raise CRMError(f"Arquivo do CRM não encontrado: {self.path}")
        rows = _rows(self.path)
        if pipeline_ref:
            rows = [r for r in rows if not r.get("pipeline") or r["pipeline"].strip().lower() == pipeline_ref.lower()]
        ganho_nome = self.acfg.get("etapa_ganho") or "Ganho"
        nomes = list(self.acfg.get("etapas") or [])
        for r in rows:   # etapas que só existem no arquivo entram no fim, antes do ganho
            e = r.get("etapa", "").strip()
            if e and slug(e) != slug(ganho_nome) and slug(e) not in map(slug, nomes):
                nomes.append(e)
        etapas = [Etapa(slug(n), n) for n in nomes] + [Etapa("ganho", ganho_nome, ganho=True)]
        idx = {e.id: i for i, e in enumerate(etapas)}
        negocios = []
        for i, r in enumerate(rows):
            criado = _date(r.get("criado_em"))
            if criado and not (inicio <= criado <= fim):
                continue
            status = STATUS.get(slug(r.get("status")), "aberto")
            etapa = slug(r.get("etapa"))
            if etapa == slug(ganho_nome):
                status = "ganho"
            etapa_idx = len(etapas) - 1 if status == "ganho" else idx.get(etapa, 0)
            email = (r.get("email") or "").strip().lower()
            ult = _date(r.get("ultima_interacao"))
            negocios.append(Negocio(
                id=str(i + 1), empresa=r.get("empresa") or "(sem empresa)", etapa_idx=etapa_idx, status=status,
                valor=_num(r.get("valor")), leads=max(1, int(_num(r.get("leads")) or 1)),
                contato=r.get("contato", ""), cargo=r.get("cargo", ""), email=email,
                telefone=normaliza_telefone(r.get("telefone")), responsavel=r.get("responsavel", ""),
                solucao=r.get("solucao", ""), segmento=r.get("segmento", ""), uf=r.get("uf", ""),
                dominio=normaliza_dominio(r.get("site")) or dominio_do_email(email), criado_em=criado,
                dias_na_etapa=int(_num(r.get("dias_na_etapa"))) if r.get("dias_na_etapa") else None,
                ultima_interacao=ult.date() if ult else None, motivo_perda=r.get("motivo_perda", "")))
        return Funil(pipeline=pipeline_ref or self.path.stem, fonte=self.nome, etapas=etapas, negocios=negocios)

    def enviar_captura(self, c, evento, vendedor):
        """Sem API: acrescenta a captura num CSV de saída, para importar no CRM depois."""
        out = self.cfg.path("dados") / "capturas_para_crm.csv"
        novo = not out.exists()
        with open(out, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f, delimiter=";")
            if novo:
                w.writerow(["evento", "empresa", "contato", "cargo", "email", "telefone", "interesse", "temperatura",
                            "reuniao", "vendedor", "origem", "observacao", "captado_em"])
            w.writerow([evento["nome"], c.empresa, c.nome, c.cargo, c.email, c.telefone, c.interesse, c.temperatura,
                        c.reuniao.strftime("%d/%m/%Y %H:%M") if c.reuniao else "", c.vendedor, c.origem, c.observacao,
                        c.criado_em.strftime("%d/%m/%Y %H:%M") if c.criado_em else ""])
        return {"arquivo": str(out)}
