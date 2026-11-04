-- ============================================================================
-- RASCUNHO DA ANÁLISE SWOT — gerado por gerar-carga-swot.py
-- Montado a partir do quadro 2026 e das telas do OnePage (04/11/2026).
-- Entra marcado como RASCUNHO (a validar pelos sócios). Idempotente: não
-- duplica itens com o mesmo título e não altera itens já editados.
-- Rode depois do schema.sql e da carga do scorecard (que cria o ciclo).
-- ============================================================================
with ciclo as (select id from pe_ciclos where ano_inicio = 2027 and ano_fim = 2030 limit 1),
dados (quadrante, titulo, descricao, evidencia, impacto, ordem) as (values
  ('forca', 'Rede capilar de unidades e parceiros', 'Presença nacional por unidades e parceiros, que levam a oferta a empresas fora dos grandes centros. [Mantida em relação ao PEN 2024]', 'OnePage (04/11/2026): 355 unidades ativas, +4,1% em 12m. Cultura Argos: mais de 350 escritórios em 25 estados. Diretrizes: "72% da rede performa".
PEN 2024: capilaridade de mercado das redes; sistema de rede e parceiros', 5, 0),
  ('forca', 'Ecossistema multimarcas com base ampla de clientes', 'Sete marcas complementares: cada BU é uma porta de entrada para as demais. [Nova em relação ao PEN 2024]', 'Cultura Argos: 7 marcas, 36 BUs. OnePage: Tax Group 18.273 clientes, Dr Fiscal 4.440, Banco Fiscal 4.255, SW 507, NX 190 (≈ 27,7 mil somados).
PEN 2024: capacidade de novas frentes', 5, 1),
  ('forca', 'Marca, reputação e qualidade técnica', 'Track record desde 2011, posicionamento premium e entrega técnica reconhecida. [Mantida em relação ao PEN 2024]', 'Brand OS v1.0 (jun/2026); fundação em 2011 (Cultura Argos).
PEN 2024: marca forte; reputação positiva; qualidade técnica; credibilidade; presença na mídia', 4, 2),
  ('forca', 'Geração de caixa e saúde financeira', 'O negócio gera caixa para financiar expansão, tecnologia e aquisições. [Mantida em relação ao PEN 2024]', 'OnePage: caixa operacional 12m R$ 115,9 mi (+16,6%). Quadro 2026: ROL R$ 45 mi.
PEN 2024: saúde financeira', 4, 3),
  ('forca', 'Governança societária formal', 'Acordo de Sócios, Conselho de Administração mensal, Comitê de Remuneração e Programa de Partnership. [Nova em relação ao PEN 2024]', 'Acordo de Sócios — versão final (jun/2026).
PEN 2024: era fraqueza: alçadas/organograma', 4, 4),
  ('forca', 'Cultura explícita e valores claros', 'Dream Big, Work Hard e Build Trust, com código de conduta e mandamentos do líder. [Nova em relação ao PEN 2024]', 'Cultura Argos v1 (abr/2026); Diretriz Gente "Sonho Grande".
PEN 2024: cultura de qualidade', 3, 5),
  ('forca', 'Dados e IA aplicados à gestão', 'Plataforma OnePage, motor de mercado e laboratório de IA já em operação. [Nova em relação ao PEN 2024]', 'OnePage; motor Compass (123 mil empresas Lucro Real); AI Lab com 141 projetos; Activity Survey liberou ~32 h/semana (RH Briefing).
PEN 2024: item novo.', 3, 6),
  ('fraqueza', 'Margem ROL caiu muito', 'A rentabilidade operacional está bem abaixo do histórico e da meta declarada. [Nova em relação ao PEN 2024]', 'Quadro 2026: margem ROL 25,7%. Histórico (DRE): 56,0% em 2020 e 58,2% em 2021. Meta 2026 (Cultura Argos): margem > 35%. Diretrizes: despesa mensal de 150–170% das vendas em uma BU.
PEN 2024: item novo.', 5, 7),
  ('fraqueza', 'Ponte ROL → lucro líquido não explicada', 'Sem abrir a diferença entre ROL e lucro, não há como gerenciar a margem final. [Nova em relação ao PEN 2024]', 'Quadro 2026: R$ 30 mi entre ROL (R$ 45 mi) e LL (R$ 15 mi). DRE: ROL distribuído em Trabalho 41,5% / Reservas 17% / Dividendos 41,5%.
PEN 2024: item novo.', 4, 8),
  ('fraqueza', 'Dados e indicadores dispersos', 'Sistemas e bases fragmentados limitam metas, cobrança e decisões. [Atenuada, ainda crítica em relação ao PEN 2024]', 'Diretrizes: CRM fragmentado (Tribus, Pipe). OnePage: índice de saúde com 5 de 8 drivers; EBITDA sem fonte de despesa consolidada. RH: painel BI (Art. 35) pendente.
PEN 2024: ausência de indicadores claros; KPI por área/pessoa; números/indicadores sistêmicos', 5, 9),
  ('fraqueza', 'Imprevisibilidade e baixa conversão comercial', 'O funil converte pouco e a produção por unidade é baixa. [Mantida em relação ao PEN 2024]', 'OnePage: taxa de ganho 8,1%; conversão SDR 7%. Quadro 2026: 1,3 contrato por unidade.
PEN 2024: imprevisibilidade do processo comercial; agressividade comercial (venda passiva); venda interna', 4, 10),
  ('fraqueza', 'Turnover alto e onboarding frágil', 'Perda de gente no primeiro ano compromete capacidade de entrega e custo. [Nova em relação ao PEN 2024]', 'RH Briefing: turnover > 30% (2023 e 2025); ~50% no 1º ano; sem pesquisa de clima; sem onboarding formal.
PEN 2024: perda de colaboradores por falta de liderança (era ameaça)', 4, 11),
  ('fraqueza', 'Gestão e processos ainda imaturos', 'Papéis executivos acumulados e ritos informais. [Atenuada em relação ao PEN 2024]', 'RH Briefing: CHO acumulando Adm/TI; CFO a contratar; presença dos sócios nos ritos informal.
PEN 2024: gestão jovem/imatura; processos cruzados; falta de processos estruturados; sedes separadas', 3, 12),
  ('fraqueza', 'Pouca receita recorrente e dependência de créditos', 'A receita depende de teses de crédito tributário; a parcela recorrente é pequena. [Mantida em relação ao PEN 2024]', 'DRE (Planejamento de Produto): créditos ≈ 72,5% e mensalidade ≈ 3,9% da receita 2025.
PEN 2024: venda recorrente (ausência); gestão da intangibilidade das receitas', 4, 13),
  ('fraqueza', 'Carteira concentrada em clientes de baixo valor', 'A maior parte da carteira tem receita histórica pequena; poucos clientes têm adesão estratégica. [Nova em relação ao PEN 2024]', 'OnePage GCC: maioria abaixo de R$ 30 mil acumulados; 227 empresas no dígito 1.
PEN 2024: customer success', 3, 14),
  ('oportunidade', 'Reforma Tributária como linha de negócio', 'A transição do sistema cria demanda de diagnóstico, adaptação e planejamento por vários anos. [Mantida e ampliada em relação ao PEN 2024]', 'Dr. Fiscal reposicionada em LC 214/2025 (Cultura Argos, Mapeamento). Transição 2026–2033. RH Briefing: Reforma como BU.
PEN 2024: reforma tributária (era ameaça de produto)', 5, 15),
  ('oportunidade', 'Cross-sell e up-sell no ecossistema', 'Clientes compram pouco além do primeiro serviço, e as marcas são complementares. [Mantida em relação ao PEN 2024]', 'Quadro 2026: 1,3 contrato por cliente. Cultura Argos: "cada BU é uma porta de entrada".
PEN 2024: cross sell e up sell; amplitude de novos produtos', 5, 16),
  ('oportunidade', 'Universo qualificado ainda não atendido', 'Milhares de empresas com alta aderência mapeadas e fora da carteira. [Nova em relação ao PEN 2024]', 'OnePage Mercado: 14.192 leads A+B (8.510 classe A); 123.061 matrizes Lucro Real.
PEN 2024: linhas de negócio não exploradas', 4, 17),
  ('oportunidade', 'Originação própria de precatórios (Banco Fiscal)', 'Comprar e originar diretamente aumenta o spread em vez de depender de terceiros. [Nova em relação ao PEN 2024]', 'Diretrizes: campanhas locais SP, PR, GO, BA. OnePage: Banco Fiscal lidera em OS ativas (6.829).
PEN 2024: item novo.', 4, 18),
  ('oportunidade', 'Educação e conteúdo como receita', 'A NX transforma conhecimento em receita e em canal de atração. [Mantida em relação ao PEN 2024]', 'Diretrizes: NX Education, cursos digitais; RH Briefing: distribuição "Viver de IA".
PEN 2024: universidade corporativa; venda acadêmica', 3, 19),
  ('oportunidade', 'Consolidação do mercado por M&A e alianças', 'Mercado fragmentado permite ganhar escala comprando ou aliando firmas regionais. [Mantida em relação ao PEN 2024]', 'Pasta "Valuation M&A TaxCo" (abr/2026). Norteador 2026 do PEN: venture capital e M&A.
PEN 2024: ser a maior do mercado', 4, 20),
  ('oportunidade', 'IA para escalar produtividade', 'Automação libera horas e aumenta receita por pessoa. [Nova em relação ao PEN 2024]', 'RH Briefing: AI Lab com 141 projetos; ATS economiza R$ 54 mil/ano; Activity Survey liberou ~32 h/semana.
PEN 2024: capacidade produtiva a otimizar', 4, 21),
  ('oportunidade', 'Agronegócio', 'Segmento com demanda tributária específica e crescente. [Mantida em relação ao PEN 2024]', '[A verificar] situação atual da oferta para o agro.
PEN 2024: foco no agronegócio (intenção do comandante 2024)', 2, 22),
  ('ameaca', 'Teses de crédito perdem relevância com a Reforma', 'A extinção gradual de tributos reduz o espaço das teses de recuperação no médio prazo. [Agravada em relação ao PEN 2024]', 'DRE: créditos ≈ 72,5% da receita 2025; extinção gradual de PIS/COFINS.
PEN 2024: reforma tributária (produto)', 5, 23),
  ('ameaca', 'Concorrência, guerra de preços e novos players', 'Big Four, boutiques e software/IA disputam clientes e pressionam preço. [Mantida em relação ao PEN 2024]', '[A verificar] perdas recentes por concorrente no CRM.
PEN 2024: entrada de concorrência em clientes consolidados; guerra de preços; novos players e aventureiros; modelos de negócio concorrentes', 4, 24),
  ('ameaca', 'Saída de unidades da rede', 'Se muitas unidades saem, a abertura de novas só repõe perdas. [Nova em relação ao PEN 2024]', 'Quadro 2026: 200 novas unidades no ano vs OnePage: +4,1% líquido em 12m. Meta 2026 (Cultura Argos): 800 unidades ativas vs 355.
PEN 2024: item novo.', 4, 25),
  ('ameaca', 'Disputa por talentos e risco trabalhista', 'Capital humano disputado e desligamentos elevam custo e passivo. [Agravada em relação ao PEN 2024]', 'RH Briefing: turnover > 30%; desligamentos de maio/2026; passivo trabalhista.
PEN 2024: capital humano complexo e disputado', 4, 26),
  ('ameaca', 'Cultura da bonança e estagnação', 'O sucesso passado pode reduzir a urgência por resultado. [Mantida em relação ao PEN 2024]', '[A verificar] ritmo de crescimento recente (histórico 2022–2025 a extrair).
PEN 2024: cultura da bonança; acreditar na riqueza perpétua; estagnação de receita; cultura não voltada a resultados', 3, 27),
  ('ameaca', 'Risco regulatório, fiscal e reputacional', 'Contestação de créditos, responsabilidade técnica em teses e LGPD sobre a base de prospecção. [Mantida em relação ao PEN 2024]', '[A verificar com o jurídico].
PEN 2024: item novo.', 3, 28)
)
insert into pe_swot (ciclo_id, quadrante, titulo, descricao, evidencia, impacto, ordem, rascunho)
select ciclo.id, d.quadrante, d.titulo, d.descricao, d.evidencia, d.impacto, d.ordem, true
from dados d cross join ciclo
where not exists (select 1 from pe_swot s where s.ciclo_id = ciclo.id and s.titulo = d.titulo);
