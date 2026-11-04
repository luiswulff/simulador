-- ============================================================================
-- RASCUNHO DA ANÁLISE SWOT — gerado por gerar-carga-swot.py
-- Montado a partir do quadro 2026 e das telas do OnePage (04/11/2026).
-- Entra marcado como RASCUNHO (a validar pelos sócios). Idempotente: não
-- duplica itens com o mesmo título e não altera itens já editados.
-- Rode depois do schema.sql e da carga do scorecard (que cria o ciclo).
-- ============================================================================
with ciclo as (select id from pe_ciclos where ano_inicio = 2027 and ano_fim = 2030 limit 1),
dados (quadrante, titulo, descricao, evidencia, impacto, ordem) as (values
  ('forca', 'Rede capilar de unidades', 'Presença nacional por meio de unidades, que leva a oferta a empresas fora dos grandes centros.', 'OnePage (04/11/2026): 355 unidades ativas, +4,1% em 12 meses. Quadro 2026: 200 novas unidades no ano.', 5, 0),
  ('forca', 'Portfólio multimarcas com base ampla de clientes', 'Cinco marcas com papéis diferentes: a líder em carteira não é a líder em operação nem em capilaridade.', 'OnePage › Marcas (2026): Tax Group 18.273 clientes, Dr Fiscal 4.440, Banco Fiscal 4.255, SW 507, NX Business School 190 (soma ≈ 27,7 mil; pode haver cliente em mais de uma marca).', 4, 1),
  ('forca', 'Geração de caixa operacional', 'O negócio gera caixa para financiar expansão, tecnologia e aquisições.', 'OnePage: caixa operacional 12m R$ 115,9 mi, +16,6% vs 12m anteriores. Quadro 2026: ROL R$ 45 mi (25,7% da receita global).', 4, 2),
  ('forca', 'Inteligência de mercado própria', 'Motor que ranqueia o universo de empresas por aderência de produto e orienta a prospecção.', 'OnePage › Mercado: 123.061 matrizes Lucro Real qualificadas; 14.192 leads classe A+B.', 3, 3),
  ('fraqueza', 'Distância grande entre ROL e lucro líquido', 'Boa parte do resultado operacional não chega ao lucro. Sem entender a composição, não há como gerenciar margem.', 'Quadro 2026: margem ROL 25,7% vs margem líquida 8,6%; R$ 30 mi a reconciliar entre ROL e LL.', 5, 4),
  ('fraqueza', 'Dados de gestão incompletos', 'Indicadores-chave ainda não têm fonte consolidada, o que limita metas e cobrança por resultado.', 'OnePage: índice de saúde da rede parcial (5 de 8 drivers; RH e crescimento temporal sem fonte); EBITDA sem fonte de despesa consolidada; cobertura de dados de mercado 56,2%.', 4, 5),
  ('fraqueza', 'Baixa produtividade por unidade', 'Cada unidade gera poucos contratos e a receita da mesma unidade cresce pouco.', 'Quadro 2026: 1,3 contrato por unidade. OnePage: same-unit revenue growth 12m de 6,3% (152 unidades).', 4, 6),
  ('fraqueza', 'Conversão comercial baixa e instável', 'O funil converte pouco e oscilou muito no último mês.', 'OnePage › Motor comercial: taxa de ganho 8,1% (−95,8% MoM — a verificar se é efeito de mês em fechamento); conversão SDR 7%.', 3, 7),
  ('fraqueza', 'Carteira concentrada em clientes de baixo valor', 'A maior parte da carteira tem receita histórica pequena; poucos clientes têm adesão estratégica.', 'OnePage › GCC: maioria das empresas abaixo de R$ 30 mil de receita histórica acumulada; 227 empresas no dígito 1 (adesão estratégica).', 3, 8),
  ('oportunidade', 'Reforma Tributária (IBS/CBS)', 'A transição do sistema cria demanda por diagnóstico, adaptação de processos, planejamento e revisão de créditos durante vários anos.', 'Transição prevista entre 2026 e 2033 (a detalhar com a área técnica).', 5, 9),
  ('oportunidade', 'Venda cruzada na base atual', 'Clientes compram pouco além do primeiro serviço, e as marcas são complementares entre si.', 'Quadro 2026: 1,3 contrato por cliente na GCC. OnePage: ≈ 27,7 mil clientes somando as marcas.', 5, 10),
  ('oportunidade', 'Grande universo qualificado ainda não atendido', 'Há milhares de empresas com alta aderência mapeadas e fora da carteira.', 'OnePage › Mercado: 14.192 leads A+B (8.510 classe A); receita potencial estimada R$ 79,8 bi (proxy, não é meta).', 4, 11),
  ('oportunidade', 'Consolidação do mercado por aquisições', 'Mercado fragmentado em firmas regionais permite crescer por M&A — caminho natural para a ambição Big Five.', 'A verificar: mapear alvos e múltiplos praticados.', 4, 12),
  ('ameaca', 'Perda de relevância de teses tributárias atuais', 'Com a extinção gradual de tributos na Reforma, parte das teses de recuperação de créditos perde espaço no médio prazo.', 'OnePage › Mercado: teses mais aderentes hoje incluem PIS/COFINS. A verificar: peso dessas teses na receita.', 5, 13),
  ('ameaca', 'Concorrência de Big Four, boutiques e tecnologia', 'Grandes firmas e boutiques disputam os clientes maiores; software e IA reduzem o preço de serviços de compliance.', 'A verificar: perdas recentes por concorrente no CRM.', 4, 14),
  ('ameaca', 'Saída de unidades da rede', 'Se muitas unidades saem, a abertura de novas só repõe perdas e o custo de aquisição sobe.', 'A verificar: 200 novas unidades no ano (quadro) vs crescimento líquido de 4,1% em 12m (OnePage) sugere saídas relevantes.', 4, 15),
  ('ameaca', 'Risco regulatório e reputacional', 'Contestação de créditos pelo Fisco, responsabilidade técnica em teses e LGPD sobre a base de dados de prospecção.', 'A verificar com o jurídico.', 3, 16)
)
insert into pe_swot (ciclo_id, quadrante, titulo, descricao, evidencia, impacto, ordem, rascunho)
select ciclo.id, d.quadrante, d.titulo, d.descricao, d.evidencia, d.impacto, d.ordem, true
from dados d cross join ciclo
where not exists (select 1 from pe_swot s where s.ciclo_id = ciclo.id and s.titulo = d.titulo);
