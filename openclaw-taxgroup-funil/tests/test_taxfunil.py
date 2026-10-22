"""Testes: python3 -m unittest discover -s tests -v   (não acessam nenhum CRM real)."""
import copy
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from taxfunil import config as config_mod, demo, feira, funil, mapa, util  # noqa: E402
from taxfunil.crm.hubspot import HubSpot  # noqa: E402
from taxfunil.crm.pipedrive import Pipedrive  # noqa: E402


def cfg_tmp(tmp, **feira_over):
    cfg = config_mod.Config(copy.deepcopy(config_mod.DEFAULTS))
    cfg["pastas"] = {"dados": str(Path(tmp) / "dados"), "saidas": str(Path(tmp) / "saidas")}
    cfg["vendedores"] = copy.deepcopy(demo.VENDEDORES)
    cfg["feira"]["envio_crm"] = "desligado"
    cfg["feira"].update(feira_over)
    cfg["logos"]["provedor"] = "demo"
    return cfg


class FakeResp:
    def __init__(self, data, status=200):
        self._d, self.status_code = data, status
        self.content = b"x"
        self.text = json.dumps(data)
        self.headers = {"content-type": "application/json"}

    def json(self):
        return self._d


class UtilTest(unittest.TestCase):
    def test_telefone(self):
        self.assertEqual(util.normaliza_telefone("+55 51 99812-4821"), "(51) 99812-4821")
        self.assertEqual(util.normaliza_telefone("5133334444"), "(51) 3333-4444")

    def test_temperatura(self):
        self.assertEqual(util.normaliza_temperatura("bem quente"), "Quente")
        self.assertEqual(util.normaliza_temperatura("MORNA"), "Morno")
        self.assertEqual(util.normaliza_temperatura("frio"), "Frio")
        self.assertEqual(util.normaliza_temperatura("xyz"), "")

    def test_reuniao(self):
        ref = datetime(2026, 10, 22, 10)
        self.assertEqual(util.parse_reuniao("28/10 10h", ref), datetime(2026, 10, 28, 10))
        self.assertEqual(util.parse_reuniao("28/10/2026 14:30", ref), datetime(2026, 10, 28, 14, 30))
        self.assertEqual(util.parse_reuniao("05/01 9h", ref), datetime(2027, 1, 5, 9))

    def test_dominio(self):
        self.assertEqual(util.dominio_do_email("joao@metalfa.com.br"), "metalfa.com.br")
        self.assertEqual(util.dominio_do_email("joao@gmail.com"), "")

    def test_empresa_chave(self):
        self.assertEqual(util.empresa_chave("Grupo Horizonte Ltda."), util.empresa_chave("horizonte"))


class FeiraTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cfg = cfg_tmp(self.tmp)
        feira.evento_criar(self.cfg, "Expo Teste", "POA", "2026-10-20", "2026-10-22")
        self.bruno, self.ana = demo.VENDEDORES[1]["telefone"], demo.VENDEDORES[0]["telefone"]

    def test_captura_completa_e_ranking(self):
        r = feira.capturar(self.cfg, self.bruno, {"nome": "João Pereira", "empresa": "Metalúrgica Alfa",
                                                  "telefone": "51 99812 4821", "temperatura": "quente",
                                                  "reuniao": "28/10 10h", "consentimento": "sim"})
        self.assertEqual(r["status"], "completa")
        self.assertEqual(r["captura"], 1)
        self.assertEqual(r["vendedor"]["pontos"], 1 + 2 + 5)
        self.assertEqual(r["vendedor"]["posicao"], 1)

    def test_pendencias(self):
        r = feira.capturar(self.cfg, self.bruno, {"nome": "Marina", "empresa": "Grupo Horizonte"})
        self.assertEqual(r["status"], "pendente")
        self.assertTrue(any("telefone" in p for p in r["pendencias"]))
        r2 = feira.corrigir(self.cfg, self.bruno, r["captura"], {"email": "marina@horizonte.com.br",
                                                                 "temperatura": "morno", "consentimento": True})
        self.assertEqual(r2["status"], "completa")

    def test_duplicado_mescla(self):
        feira.capturar(self.cfg, self.bruno, {"nome": "João", "empresa": "Alfa", "email": "j@alfa.com.br"})
        r = feira.capturar(self.cfg, self.ana, {"nome": "João", "empresa": "Alfa", "email": "J@alfa.com.br",
                                                "temperatura": "quente"})
        self.assertTrue(r["duplicado"])
        self.assertEqual(r["captura"], 1)

    def test_mesma_empresa(self):
        feira.capturar(self.cfg, self.ana, {"nome": "A", "empresa": "Grupo Horizonte", "email": "a@horizonte.com.br"})
        r = feira.capturar(self.cfg, self.bruno, {"nome": "B", "empresa": "Horizonte Ltda", "email": "b@horizonte.com.br"})
        self.assertEqual(len(r["mesma_empresa"]), 1)

    def test_permissoes(self):
        r = feira.capturar(self.cfg, self.ana, {"nome": "A", "empresa": "X"})
        with self.assertRaises(feira.FeiraError):
            feira.corrigir(self.cfg, self.bruno, r["captura"], {"cargo": "CFO"})
        with self.assertRaises(feira.FeiraError):
            feira.relatorio(self.cfg, self.bruno)
        with self.assertRaises(feira.FeiraError):
            feira.capturar(self.cfg, "+55 11 90000-0000", {"nome": "A", "empresa": "X"})

    def test_envio_crm_imediato_e_falha_nao_bloqueia(self):
        cfg = cfg_tmp(self.tmp, envio_crm="imediato")
        fake = mock.Mock()
        fake.enviar_captura.side_effect = RuntimeError("CRM fora do ar")
        with mock.patch("taxfunil.feira.conector", return_value=fake):
            r = feira.capturar(cfg, self.bruno, {"nome": "C", "empresa": "Y", "email": "c@y.com.br",
                                                 "temperatura": "frio", "consentimento": 1})
        self.assertEqual(r["crm"], "erro")
        fake.enviar_captura.side_effect = None
        fake.enviar_captura.return_value = {"negocio": "1"}
        with mock.patch("taxfunil.feira.conector", return_value=fake):
            s = feira.sincronizar(cfg)
        self.assertEqual(s["enviados"], 1)


class HubSpotTest(unittest.TestCase):
    def setUp(self):
        self.cfg = cfg_tmp(tempfile.mkdtemp())
        os.environ["HUBSPOT_TOKEN"] = "teste"
        self.pipeline = {"id": "p1", "label": "Eventos 2026", "displayOrder": 0, "stages": [
            {"id": "s1", "label": "Lead", "displayOrder": 0, "metadata": {"isClosed": "false", "probability": "0.1"}},
            {"id": "s2", "label": "Proposta", "displayOrder": 1, "metadata": {"isClosed": "false", "probability": "0.5"}},
            {"id": "won", "label": "Fechado ganho", "displayOrder": 2, "metadata": {"isClosed": "true", "probability": "1.0"}},
            {"id": "lost", "label": "Fechado perdido", "displayOrder": 3, "metadata": {"isClosed": "true", "probability": "0.0"}}]}

    def _router(self, method, url, **kw):
        if url.endswith("/crm/v3/pipelines/deals"):
            return FakeResp({"results": [self.pipeline]})
        if url.endswith("/crm/v3/objects/deals/search"):
            return FakeResp({"results": [
                {"id": "d1", "properties": {"dealname": "D1", "amount": "1000", "dealstage": "s2", "createdate": "2026-10-01T10:00:00Z",
                                            "hs_v2_date_entered_s1": "2026-10-01T10:00:00Z", "hs_v2_date_entered_s2": "2026-10-05T10:00:00Z",
                                            "hubspot_owner_id": "o1"}},
                {"id": "d2", "properties": {"dealname": "D2", "amount": "5000", "dealstage": "won", "createdate": "2026-09-01T10:00:00Z",
                                            "closedate": "2026-09-21T10:00:00Z"}},
                {"id": "d3", "properties": {"dealname": "D3", "dealstage": "lost", "createdate": "2026-09-10T10:00:00Z",
                                            "hs_date_entered_s2": "2026-09-12T10:00:00Z", "closed_lost_reason": "Preço"}}]})
        if "/associations/deals/companies/batch/read" in url:
            return FakeResp({"results": [{"from": {"id": "d1"}, "to": [{"toObjectId": 10}]}]})
        if "/associations/deals/contacts/batch/read" in url:
            return FakeResp({"results": [{"from": {"id": "d1"}, "to": [{"toObjectId": 20}, {"toObjectId": 21}]}]})
        if url.endswith("/crm/v3/objects/companies/batch/read"):
            return FakeResp({"results": [{"id": "10", "properties": {"name": "Metalúrgica Alfa", "domain": "www.metalfa.com.br", "state": "RS"}}]})
        if url.endswith("/crm/v3/objects/contacts/batch/read"):
            return FakeResp({"results": [{"id": "20", "properties": {"firstname": "João", "lastname": "Pereira", "email": "j@metalfa.com.br", "jobtitle": "CFO"}}]})
        if url.endswith("/crm/v3/owners"):
            return FakeResp({"results": [{"id": "o1", "firstName": "Ana", "lastName": "Ribeiro"}]})
        raise AssertionError(f"URL inesperada: {method} {url}")

    def test_carregar_funil(self):
        hs = HubSpot(self.cfg)
        with mock.patch.object(hs.s, "request", side_effect=self._router):
            f = hs.carregar_funil("Eventos 2026", datetime(2026, 1, 1), datetime(2026, 12, 31))
        self.assertEqual([e.nome for e in f.etapas], ["Lead", "Proposta", "Fechado ganho"])
        d1, d2, d3 = f.negocios
        self.assertEqual((d1.empresa, d1.etapa_idx, d1.leads, d1.responsavel, d1.dominio), ("Metalúrgica Alfa", 1, 2, "Ana Ribeiro", "metalfa.com.br"))
        self.assertEqual((d2.status, d2.etapa_idx, d2.dias_para_fechar), ("ganho", 2, 20))
        self.assertEqual((d3.status, d3.etapa_idx, d3.motivo_perda), ("perdido", 1, "Preço"))
        m = funil.metricas(f)
        self.assertEqual([s["emp"] for s in m["etapas"]], [3, 3, 1])

    def test_enviar_captura(self):
        hs = HubSpot(self.cfg)
        chamadas = []

        def router(method, url, **kw):
            chamadas.append((method, url.split("hubapi.com")[1]))
            if url.endswith("/search"):
                return FakeResp({"results": []})
            if url.endswith("/crm/v3/pipelines/deals"):
                return FakeResp({"results": [self.pipeline]})
            if method == "POST":
                return FakeResp({"id": str(len(chamadas))})
            if method == "GET" and "owners" in url:
                return FakeResp({"results": []})
            return FakeResp({})
        c = feira.Captura(id=1, evento_id=1, seq=1, vendedor="Bruno", nome="João Pereira", empresa="Metalúrgica Alfa",
                          temperatura="Quente", email="j@metalfa.com.br", dominio="metalfa.com.br",
                          criado_em=datetime(2026, 10, 22, 10))
        with mock.patch.object(hs.s, "request", side_effect=router):
            ids = hs.enviar_captura(c, {"nome": "Expo", "pipeline": "Eventos 2026"}, {"nome": "Bruno"})
        self.assertEqual(set(ids), {"empresa", "contato", "negocio"})
        self.assertIn(("POST", "/crm/v3/objects/deals"), chamadas)
        self.assertEqual(sum(1 for m, u in chamadas if m == "PUT"), 3)


class PipedriveTest(unittest.TestCase):
    def test_carregar_funil(self):
        cfg = cfg_tmp(tempfile.mkdtemp())
        os.environ["PIPEDRIVE_API_TOKEN"] = "teste"
        pd = Pipedrive(cfg)

        def router(method, url, params=None, **kw):
            if url.endswith("/pipelines"):
                return FakeResp({"success": True, "data": [{"id": 1, "name": "Comercial"}]})
            if url.endswith("/stages"):
                return FakeResp({"success": True, "data": [{"id": 11, "name": "Lead", "order_nr": 1}, {"id": 12, "name": "Proposta", "order_nr": 2}]})
            if url.endswith("/deals"):
                return FakeResp({"success": True, "data": [
                    {"id": 1, "pipeline_id": 1, "stage_id": 12, "status": "open", "value": 900, "add_time": "2026-10-01 10:00:00",
                     "org_id": {"name": "Alfa", "value": 5}, "person_id": {"name": "João", "email": [{"value": "j@alfa.com.br", "primary": True}]},
                     "user_id": {"name": "Ana"}, "participants_count": 2, "stage_change_time": "2026-10-03 10:00:00"},
                    {"id": 2, "pipeline_id": 1, "stage_id": 12, "status": "won", "value": 3000, "add_time": "2026-09-01 10:00:00", "won_time": "2026-09-11 10:00:00", "org_name": "Beta"},
                    {"id": 3, "pipeline_id": 1, "stage_id": 11, "status": "lost", "add_time": "2026-09-02 10:00:00", "lost_reason": "Sem verba"},
                    {"id": 4, "pipeline_id": 9, "stage_id": 99, "status": "open", "add_time": "2026-09-02 10:00:00"}],
                    "additional_data": {"pagination": {"more_items_in_collection": False}}})
            raise AssertionError(url)
        with mock.patch.object(pd.s, "request", side_effect=router):
            f = pd.carregar_funil("Comercial", datetime(2026, 1, 1), datetime(2026, 12, 31))
        self.assertEqual([e.nome for e in f.etapas], ["Lead", "Proposta", "Ganho"])
        self.assertEqual(len(f.negocios), 3)
        a, b, c = f.negocios
        self.assertEqual((a.empresa, a.etapa_idx, a.leads, a.dominio, a.responsavel), ("Alfa", 1, 2, "alfa.com.br", "Ana"))
        self.assertEqual((b.status, b.etapa_idx, b.dias_para_fechar), ("ganho", 2, 10))
        self.assertEqual((c.status, c.motivo_perda), ("perdido", "Sem verba"))


class ArquivoTest(unittest.TestCase):
    def test_csv_exemplo(self):
        cfg = cfg_tmp(tempfile.mkdtemp())
        cfg["crm"]["provedor"] = "arquivo"
        cfg["crm"]["arquivo"]["caminho"] = str(ROOT / "exemplos" / "crm_exemplo.csv")
        from taxfunil.crm import conector
        f = conector(cfg).carregar_funil("", datetime(2000, 1, 1), datetime(2100, 1, 1))
        self.assertGreater(len(f.negocios), 5)
        self.assertTrue(f.etapas[-1].ganho)


class PDFTest(unittest.TestCase):
    """Gera os três relatórios com dados fictícios e exige layout sem nada estourando a borda."""

    def test_relatorios(self):
        tmp = tempfile.mkdtemp()
        cfg = cfg_tmp(tmp)
        r1 = funil.gerar(cfg, funil=demo.funil_demo())
        r2 = funil.gerar(cfg, funil=demo.funil_demo(["A", "B", "C", "D", "E", "F", "G", "H"],
                                                     [200, 150, 120, 90, 70, 50, 40, 30, 10], [.1] * 8))
        demo.popular_feira(cfg, feira)
        r3 = feira.relatorio(cfg, demo.VENDEDORES[0]["telefone"])
        r4 = mapa.gerar(cfg, fonte="feira", por_pagina=20)
        r5 = mapa.gerar(cfg, fonte="feira", por_pagina=16)
        for r in (r1, r2, r3, r4, r5):
            self.assertTrue(Path(r["arquivo"]).stat().st_size > 10000, r["arquivo"])
            self.assertTrue(r["layout_ok"], f'{r["arquivo"]}: páginas com problema {r["paginas_com_problema"]}')


if __name__ == "__main__":
    unittest.main()
