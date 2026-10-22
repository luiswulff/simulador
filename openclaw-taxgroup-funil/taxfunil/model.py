"""Modelo comum de dados. Todo conector de CRM devolve um Funil; toda captura de feira vira uma Captura."""
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional


@dataclass
class Etapa:
    id: str
    nome: str
    ganho: bool = False


@dataclass
class Negocio:
    id: str
    empresa: str
    etapa_idx: int                 # etapa mais avançada alcançada (índice em Funil.etapas)
    status: str = "aberto"         # aberto | ganho | perdido
    valor: float = 0.0
    leads: int = 1                 # contatos/pessoas ligadas ao negócio
    contato: str = ""
    cargo: str = ""
    email: str = ""
    telefone: str = ""
    responsavel: str = ""
    solucao: str = ""
    segmento: str = ""
    uf: str = ""
    dominio: str = ""
    criado_em: Optional[datetime] = None
    dias_na_etapa: Optional[int] = None
    dias_para_fechar: Optional[int] = None
    ultima_interacao: Optional[date] = None
    motivo_perda: str = ""


@dataclass
class Funil:
    pipeline: str
    fonte: str                     # HubSpot, Pipedrive, Arquivo...
    etapas: list                   # list[Etapa]; a última é sempre a etapa de ganho
    negocios: list = field(default_factory=list)


@dataclass
class Captura:
    id: int
    evento_id: int
    seq: int
    vendedor: str
    nome: str
    empresa: str
    temperatura: str
    cargo: str = ""
    telefone: str = ""
    email: str = ""
    dominio: str = ""
    interesse: str = ""
    reuniao: Optional[datetime] = None
    origem: str = "Texto"
    observacao: str = ""
    consentimento: bool = False
    criado_em: Optional[datetime] = None
    crm_status: str = "pendente"
    pendencias: list = field(default_factory=list)
