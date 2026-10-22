"""Leitura do config.yaml (com valores padrão) e dos segredos via variáveis de ambiente."""
import copy
import os
from pathlib import Path

import yaml

BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULTS = {
    "marca": "Tax Group",
    "fuso": "America/Sao_Paulo",
    "crm": {
        "provedor": "arquivo",            # hubspot | pipedrive | arquivo
        "pipeline_padrao": "",            # nome ou id do pipeline usado no /funil
        "periodo_padrao_dias": 90,
        "hubspot": {"campo_solucao": "", "campo_segmento": "industry", "campo_uf": "state"},
        "pipedrive": {"dominio": "", "campo_solucao": ""},
        "arquivo": {"caminho": "dados/crm.csv",
                    "etapas": ["Leads captados", "Qualificados", "Reunião realizada", "Proposta enviada", "Negociação"],
                    "etapa_ganho": "Ganho"},
    },
    "pastas": {"dados": "dados", "saidas": "saidas"},
    "logos": {"provedor": "favicon", "timeout_s": 5},   # favicon | logodev | desligado
    "feira": {
        "pontuacao": {"captura": 1, "quente": 2, "reuniao": 5},
        "campos_obrigatorios": ["nome", "empresa", "contato", "temperatura", "consentimento"],
        "envio_crm": "imediato",          # imediato | manual | desligado
        "pipeline_crm": "",               # pipeline onde as capturas entram (vazio = pipeline_padrao)
        "etapa_crm": "",                  # etapa inicial (vazio = primeira etapa)
    },
    "mapa": {"cards_por_pagina": 20},
    "vendedores": [],
}

SECRET_ENV = {"hubspot": "HUBSPOT_TOKEN", "pipedrive": "PIPEDRIVE_API_TOKEN", "logodev": "LOGO_DEV_TOKEN"}


def _merge(base, extra):
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _merge(base[k], v)
        else:
            base[k] = v
    return base


class Config(dict):
    def path(self, key):
        p = Path(os.path.expanduser(self["pastas"][key]))
        p = p if p.is_absolute() else BASE_DIR / p
        p.mkdir(parents=True, exist_ok=True)
        return p

    @staticmethod
    def secret(name):
        return os.environ.get(SECRET_ENV[name], "").strip()

    def vendedor(self, ident):
        """Localiza o vendedor pelo telefone (WhatsApp), e-mail ou nome."""
        if not ident:
            return None
        digits = "".join(ch for ch in str(ident) if ch.isdigit())
        for v in self["vendedores"]:
            vd = "".join(ch for ch in str(v.get("telefone", "")) if ch.isdigit())
            if digits and vd and (digits.endswith(vd[-10:]) or vd.endswith(digits[-10:])) and len(digits) >= 10:
                return v
            if str(ident).strip().lower() in (str(v.get("email", "")).lower(), str(v.get("nome", "")).lower()):
                return v
        return None


def load(path=None):
    path = Path(path or os.environ.get("TAXFUNIL_CONFIG") or BASE_DIR / "config.yaml")
    cfg = copy.deepcopy(DEFAULTS)
    if path.exists():
        with open(path, encoding="utf-8") as f:
            _merge(cfg, yaml.safe_load(f) or {})
    return Config(cfg)
