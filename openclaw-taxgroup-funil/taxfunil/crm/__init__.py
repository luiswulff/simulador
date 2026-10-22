"""Conectores de CRM. Cada um implementa:
    carregar_funil(pipeline, inicio, fim) -> model.Funil
    enviar_captura(captura, evento, vendedor) -> dict com ids criados no CRM
"""


def conector(cfg):
    prov = cfg["crm"]["provedor"].lower()
    if prov == "hubspot":
        from .hubspot import HubSpot
        return HubSpot(cfg)
    if prov == "pipedrive":
        from .pipedrive import Pipedrive
        return Pipedrive(cfg)
    if prov in ("arquivo", "csv", "connect"):
        from .arquivo import Arquivo
        return Arquivo(cfg)
    raise ValueError(f"Provedor de CRM desconhecido: {prov}. Use hubspot, pipedrive ou arquivo.")


class CRMError(RuntimeError):
    pass
