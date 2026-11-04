/**
 * DADOS DO MODO DEMONSTRAÇÃO — conteúdo REAL da TaxCo consolidado a partir de:
 * PEN 2024, Cultura Argos (abr/2026), Diretriz Gente "Sonho Grande", Brand OS,
 * Acordo de Sócios (jun/2026), PCS 2025-2026, RH Briefing v3, Gestão de
 * Diretrizes e Gaps, DRE Modelo BU, quadro da diretoria 2026 e OnePage (04/11/2026).
 * Ver docs/PEN-MESTRE (confidencial, fora do git) para fontes e pendências.
 *
 * Marcações nos textos: [VALIDAR] = conflito ou lacuna a decidir;
 * [PROPOSTA] = sugestão para discussão. Pessoas aparecem só por CARGO.
 * Este módulo nunca entra no build de produção (com Supabase) — ver repo.ts.
 */
import type { Tables, TableName, Status } from './types';
import scorecard from './scorecard-2026.json';
import swotRascunho from './swot-rascunho.json';

type Store = { [K in TableName]?: Tables[K][] };

export function dadosExemplo(): Store {
  const C = 'ciclo-2027';

  // ── Marcas / BUs (Cultura Argos, Mapeamento Organizacional) ───────────────────
  const areas: Tables['org_areas'][] = [
    { id: 'ar-hq', nome: 'TaxCo HQ (Presidência e áreas-meio)', sigla: 'HQ', ordem: 0, lider_id: 'p-pres',
      descricao: 'Presidência, Financeiro/Controladoria, Pessoas, TI/IA, Marketing e Jurídico. Comitê orçamentário quinzenal com DRE por BU.' },
    { id: 'ar-tax', nome: 'Tax Group', sigla: 'TAX', ordem: 1, lider_id: 'p-tax',
      descricao: '"Motor técnico-comercial… BU âncora do ecossistema": recuperação tributária (AFD, ROT, RTI), auditoria, consultoria e gestão de franqueados (rede).' },
    { id: 'ar-drf', nome: 'Dr. Fiscal', sigla: 'DRF', ordem: 2, lider_id: 'p-drf',
      descricao: 'Contabilidade estratégica e inteligência fiscal, reposicionada em torno da Reforma Tributária (LC 214/2025).' },
    { id: 'ar-bf', nome: 'Banco Fiscal', sigla: 'BF', ordem: 3, lider_id: 'p-bf',
      descricao: 'Liquidez via precatórios, antecipação de crédito tributário, transação na PGFN e estruturação financeira.' },
    { id: 'ar-sw', nome: 'SW Advogados', sigla: 'SW', ordem: 4, lider_id: 'p-sw',
      descricao: 'Braço legal do grupo: estruturação jurídica, societária e patrimonial.' },
    { id: 'ar-nx', nome: 'NX Business School', sigla: 'NX', ordem: 5, lider_id: 'p-nx',
      descricao: '"Educação que gera receita": educação executiva, treinamento comercial e liderança (CPL ≤ R$ 80, ROAS ≥ 3x, NPS ≥ 9).' },
    { id: 'ar-val', nome: 'Valora', sigla: 'VAL', ordem: 6,
      descricao: 'Plataforma patrimonial e financeira "de dono para dono", com expansão internacional planejada.' },
    { id: 'ar-gua', nome: 'Guahyba Vinhos', sigla: 'GUA', ordem: 7, descricao: 'Vinho premium gaúcho.' },
  ];

  // ── Pessoas: apenas cargos (sem nomes) ────────────────────────────────────────
  const p = (id: string, nome: string, area_id: string, cargo_id: string, extra: Partial<Tables['org_pessoas']> = {}) =>
    ({ id, nome, area_id, cargo_id, ativo: true, is_socio: false, ...extra });
  const pessoas: Tables['org_pessoas'][] = [
    p('p-pres', 'Presidente (Sócio Classe I)', 'ar-hq', 'cg-dir3', { is_socio: true, degrau_id: 'dg-8' }),
    p('p-cho', 'CHO — Gente & Cultura', 'ar-hq', 'cg-dir1', { gestor_id: 'p-pres' }),
    p('p-cfo', 'CFO — Financeiro e Controladoria', 'ar-hq', 'cg-dir1', { gestor_id: 'p-pres' }),
    p('p-ti', 'Líder de TI e AI Lab', 'ar-hq', 'cg-ger2', { gestor_id: 'p-cfo' }),
    p('p-tax', 'Sócio líder — Tax Group', 'ar-tax', 'cg-dir2', { is_socio: true, degrau_id: 'dg-7', gestor_id: 'p-pres' }),
    p('p-rede', 'Coordenador de Franqueados', 'ar-tax', 'cg-coord-sr', { gestor_id: 'p-tax' }),
    p('p-drf', 'Sócio líder — Dr. Fiscal', 'ar-drf', 'cg-dir1', { is_socio: true, degrau_id: 'dg-6', gestor_id: 'p-pres' }),
    p('p-bf', 'Sócio líder — Banco Fiscal', 'ar-bf', 'cg-dir1', { is_socio: true, degrau_id: 'dg-6', gestor_id: 'p-pres' }),
    p('p-sw', 'Sócio líder — SW Advogados', 'ar-sw', 'cg-dir2', { is_socio: true, degrau_id: 'dg-7', gestor_id: 'p-pres' }),
    p('p-nx', 'Coordenador — NX Business School', 'ar-nx', 'cg-coord-pl', { gestor_id: 'p-pres' }),
    p('p-mkt', 'Coordenador de Marketing', 'ar-hq', 'cg-coord-pl', { gestor_id: 'p-cho' }),
  ];

  // ── Identidade (Cultura Argos, Brand OS, Diretriz Gente) ──────────────────────
  const identidade: Tables['pe_identidade'][] = [
    { id: 'id-pro', ciclo_id: C, tipo: 'proposito', ordem: 0, titulo: 'Propósito',
      descricao: 'Empoderar as pessoas para vencerem nos negócios.\n\nEmpoderar e inspirar confiança, gerar autoconhecimento e dar às pessoas ferramentas para agirem com protagonismo.' },
    { id: 'id-mis', ciclo_id: C, tipo: 'missao', ordem: 0, titulo: 'Missão',
      descricao: 'Revolucionar o mercado corporativo entregando resultados excepcionais nas áreas contábil, tributária, financeira e jurídica.\n\n[VALIDAR] Versão da marca (Brand OS): "Revolucionar o mercado corporativo com entregas fora da curva."' },
    { id: 'id-vis', ciclo_id: C, tipo: 'visao', ordem: 0, titulo: 'Visão 2030',
      descricao: '[PROPOSTA] Ser, até 2030, o líder do ecossistema tributário e de negócios do Brasil — a Big Five brasileira.\n\n[VALIDAR] Versões existentes: "Ser reconhecida como a mais abrangente plataforma de soluções em gestão tributária, fiscal, jurídica, financeira e negócios" (Cultura Argos) · "Ser o maior e melhor ecossistema de soluções de negócios do Brasil" (Brand OS).' },
    { id: 'id-val-0', ciclo_id: C, tipo: 'valor', ordem: 0, titulo: 'Dream Big — Sonhe grande',
      descricao: 'Mira além e não aceita menos que excelência. "Meta arrojada sem sonho pessoal é obrigação."',
      comportamentos: 'Metas arrojadas — "nunca metas vagabundas"\nAntecipar tendências e expandir para novos mercados e BUs\nAcompanhar indicadores "com obsessão"\nCelebrar conquistas é obrigação do líder\nAssumir risco com estrutura' },
    { id: 'id-val-1', ciclo_id: C, tipo: 'valor', ordem: 1, titulo: 'Work Hard — Trabalhe duro',
      descricao: 'Determinação, autonomia e responsabilidade. "Eficiência cresce com o tempo, mas o volume de entrega não cai."',
      comportamentos: 'Atitude de dono\nMeritocracia real: "mérito vem de suor, não de tempo de casa"\nSair da zona de conforto\nAusteridade\nProfundidade técnica, velocidade e disciplina' },
    { id: 'id-val-2', ciclo_id: C, tipo: 'valor', ordem: 2, titulo: 'Build Trust — Construa confiança',
      descricao: '"Confiança é a base da pirâmide." Simplicidade, integridade, transparência, ética e segurança.',
      comportamentos: 'Cumprir a palavra: "prometeu para sexta, entrega na sexta"\nTransparência radical; combate à fofoca e à rádio peão\nPresença\nFeedback honesto\nProteger a reputação' },
    { id: 'id-cul-0', ciclo_id: C, tipo: 'cultura', ordem: 0, titulo: 'Empresa → Equipe → Indivíduo',
      descricao: 'Regra de ouro. A firma vem antes do indivíduo. "A cultura não é um apoio à estratégia; a cultura é a estratégia."' },
    { id: 'id-cul-1', ciclo_id: C, tipo: 'cultura', ordem: 1, titulo: 'Gestão sem número é opinião',
      descricao: 'KPIs como bússola. Liderança em três pilares: Pessoas, Performance e Cultura. Máximo de 5 metas por líder de BU por semestre.' },
    { id: 'id-cul-2', ciclo_id: C, tipo: 'cultura', ordem: 2, titulo: 'Meritocracia sem negociação',
      descricao: '"A passagem entre camadas não é negociada. É conquistada por resultado." Avaliação semestral 360° por KPIs e comportamento cultural.' },
    { id: 'id-cul-3', ciclo_id: C, tipo: 'cultura', ordem: 3, titulo: 'Missão dada é missão cumprida',
      descricao: 'Mobilidade entre BUs e marcas faz parte do contrato cultural. "Fanáticos, não funcionários."' },
    { id: 'id-cul-4', ciclo_id: C, tipo: 'cultura', ordem: 4, titulo: 'Austeridade',
      descricao: 'Controle de custos permanente, overhead base zero. Contratação acima da Camada 1 só com business case de uma página aprovado pelo CEO.' },
    { id: 'id-cul-5', ciclo_id: C, tipo: 'cultura', ordem: 5, titulo: 'O que não toleramos',
      descricao: 'Fofoca e discórdia; omitir responsabilidade pelo fracasso; aceitar a mediocridade; "alta performance com cultura tóxica"; falar mal de colegas; não acompanhar os indicadores da própria área.' },
  ];

  // ── Roadmap 2027–2030 [PROPOSTA] ──────────────────────────────────────────────
  const marcos: Tables['pe_marcos'][] = [
    { id: 'mc-1', ciclo_id: C, ano: 2027, titulo: 'Base única de dados (CRM + BI + OnePage) e scorecard mensal', status: 'em_andamento' },
    { id: 'mc-2', ciclo_id: C, ano: 2027, titulo: 'P&L por marca/BU e Partnership em operação plena', status: 'em_andamento' },
    { id: 'mc-3', ciclo_id: C, ano: 2027, titulo: 'Reforma Tributária estruturada como BU', status: 'nao_iniciado' },
    { id: 'mc-4', ciclo_id: C, ano: 2028, titulo: 'Rede com produtividade comprovada (contratos/unidade e saídas sob controle)', status: 'nao_iniciado' },
    { id: 'mc-5', ciclo_id: C, ano: 2028, titulo: 'Cross-sell do ecossistema como motor de crescimento', status: 'nao_iniciado' },
    { id: 'mc-6', ciclo_id: C, ano: 2029, titulo: 'Aquisições/alianças regionais; créditos < 60% da receita', status: 'nao_iniciado' },
    { id: 'mc-7', ciclo_id: C, ano: 2030, titulo: 'Liderança do ecossistema tributário — a Big Five brasileira', status: 'nao_iniciado' },
  ];

  // ── Pilares = 4 perspectivas do PEN 2024 (roadmap BSC) ───────────────────────
  const pilares: Tables['pe_pilares'][] = [
    { id: 'pl-fin', ciclo_id: C, nome: 'Econômico-Financeira', cor: '#a98445', ordem: 0, descricao: 'Receita, margem ROL, lucro, caixa e diversificação de receita.' },
    { id: 'pl-mer', ciclo_id: C, nome: 'Mercado & Clientes', cor: '#4a67a8', ordem: 1, descricao: 'Rede, ecossistema, cross-sell, ICP e experiência do cliente.' },
    { id: 'pl-pro', ciclo_id: C, nome: 'Processos & Inovação', cor: '#4f8a64', ordem: 2, descricao: 'Dados, IA, produtividade e portfólio para a Reforma Tributária.' },
    { id: 'pl-pes', ciclo_id: C, nome: 'Pessoas & Aprendizado', cor: '#b5573f', ordem: 3, descricao: 'Cultura de alta performance, retenção, partnership e liderança.' },
  ];

  // ── Objetivos 2027–2030 [PROPOSTA] ────────────────────────────────────────────
  const o = (id: string, pilar_id: string, codigo: string, titulo: string, area_id: string, responsavel_id: string, ordem: number, descricao: string): Tables['pe_objetivos'] =>
    ({ id, pilar_id, codigo, titulo, area_id, responsavel_id, ordem, descricao: `[PROPOSTA] ${descricao}` });
  const objetivos: Tables['pe_objetivos'][] = [
    o('oe-01', 'pl-fin', 'OE-01', 'Crescer a receita do ecossistema rumo à liderança', 'ar-hq', 'p-pres', 0, 'Projeção existente por produto: R$ 102,4 mi (2026) → R$ 178,3 mi (2030). Meta de vendas 2026: R$ 132 mi.'),
    o('oe-02', 'pl-fin', 'OE-02', 'Recuperar a margem ROL e explicar a ponte até o lucro', 'ar-hq', 'p-cfo', 1, 'Margem ROL de 25,7% (2026) contra 56–58% em 2020–21 e meta > 35%. Abrir os R$ 30 mi entre ROL e LL.'),
    o('oe-03', 'pl-fin', 'OE-03', 'Diversificar a receita além de créditos tributários', 'ar-hq', 'p-pres', 2, 'Créditos ≈ 72,5% da receita 2025. Levar a menos de 60% até 2029 com Reforma, Banco Fiscal, recorrência e educação.'),
    o('oe-04', 'pl-mer', 'OE-04', 'Escalar a rede com produtividade', 'ar-tax', 'p-tax', 0, '355 unidades ativas vs meta de 800; 1,3 contrato por unidade; controlar saídas da rede.'),
    o('oe-05', 'pl-mer', 'OE-05', 'Fazer do cross-sell o motor do crescimento', 'ar-tax', 'p-tax', 1, '"Cada BU é uma porta de entrada." Hoje, 1,3 contrato por cliente.'),
    o('oe-06', 'pl-mer', 'OE-06', 'Conquistar o ICP A–D com venda baseada em contas', 'ar-tax', 'p-tax', 2, '14,2 mil leads A+B mapeados; tickets de R$ 188 mil a R$ 415 mil nas categorias A–C; NPS > 90.'),
    o('oe-07', 'pl-pro', 'OE-07', 'Uma única verdade de dados para gestão', 'ar-hq', 'p-ti', 0, 'CRM único, BI do Art. 35 e índice de saúde com 8 de 8 drivers com fonte.'),
    o('oe-08', 'pl-pro', 'OE-08', 'Escalar produtividade com IA', 'ar-hq', 'p-ti', 1, 'AI Lab com 141 projetos; Activity Survey liberou ~32 h/semana no piloto.'),
    o('oe-09', 'pl-pro', 'OE-09', 'Liderar a Reforma Tributária como produto', 'ar-drf', 'p-drf', 2, 'Dr. Fiscal reposicionada em LC 214/2025; transição 2026–2033.'),
    o('oe-10', 'pl-pes', 'OE-10', 'Cultura de alta performance e retenção', 'ar-hq', 'p-cho', 0, 'Turnover > 30% e ~50% no 1º ano; meta de 25% no 1º ano; pesquisa de clima e GPTW.'),
    o('oe-11', 'pl-pes', 'OE-11', 'Partnership meritocrática como motor de retenção', 'ar-hq', 'p-pres', 1, 'Acordo de Sócios, steps 1–5 e patrimonial, mínimo de 5 KPIs por sócio por ano.'),
    o('oe-12', 'pl-pes', 'OE-12', 'Formar a liderança da Big Five', 'ar-hq', 'p-cho', 2, 'Escola de Líderes (NX), mapa dos top 10 talentos e sucessão.'),
  ];

  // Objetivo ↔ SWOT ("responde a")
  const vinc: [string, string][] = [
    ['oe-01', 'f-ecossistema'], ['oe-01', 'f-caixa'], ['oe-01', 'o-crosssell'], ['oe-01', 'o-ma'],
    ['oe-02', 'w-margem'], ['oe-02', 'w-ponte'],
    ['oe-03', 'w-recorrencia'], ['oe-03', 't-teses'], ['oe-03', 'o-reforma'], ['oe-03', 'o-precatorios'], ['oe-03', 'o-educacao'],
    ['oe-04', 'f-rede'], ['oe-04', 'w-comercial'], ['oe-04', 't-rede'],
    ['oe-05', 'o-crosssell'], ['oe-05', 'w-ticket'], ['oe-05', 'f-ecossistema'],
    ['oe-06', 'o-universo'], ['oe-06', 'w-comercial'], ['oe-06', 't-concorrencia'], ['oe-06', 'f-marca'],
    ['oe-07', 'w-dados'], ['oe-07', 'f-dados-ia'],
    ['oe-08', 'o-ia'], ['oe-08', 'f-dados-ia'],
    ['oe-09', 'o-reforma'], ['oe-09', 't-teses'],
    ['oe-10', 'w-turnover'], ['oe-10', 't-talentos'], ['oe-10', 't-bonanca'], ['oe-10', 'f-cultura'],
    ['oe-11', 'f-governanca'], ['oe-11', 't-talentos'],
    ['oe-12', 'w-gestao'], ['oe-12', 't-bonanca'],
  ];

  // ── Iniciativas e ações reais em andamento (RH Briefing, Diretrizes) ─────────
  const ini = (id: string, objetivo_id: string, codigo: string, titulo: string, area_id: string, responsavel_id: string, status: Status, inicio: string, fim: string, descricao: string): Tables['pe_iniciativas'] =>
    ({ id, objetivo_id, codigo, titulo, area_id, responsavel_id, status, inicio, fim, prioridade: 'alta', descricao });
  const iniciativas: Tables['pe_iniciativas'][] = [
    ini('in-crm', 'oe-07', 'IN-07.1', 'CRM único e "one page" do cliente', 'ar-hq', 'p-ti', 'em_andamento', '2025-11-17', '2027-03-31', 'Acabar com dados dispersos (Tribus, Pipe). Fonte: Parking Lot de diretrizes (Q1 urgente).'),
    ini('in-bi', 'oe-07', 'IN-07.2', 'Painel BI de metas e PPR (Art. 35)', 'ar-hq', 'p-cfo', 'em_andamento', '2026-04-15', '2027-06-30', 'Exigido pela política de PPR até o 30º dia de cada período. Fonte: RH Briefing #16.'),
    ini('in-ia', 'oe-08', 'IN-08.1', 'Produtividade com IA (Activity Survey e AI Lab)', 'ar-hq', 'p-ti', 'em_andamento', '2026-04-15', '2027-12-31', 'Piloto na Auditoria liberou ~32 h/semana; ondas 2 (Marketing e Vendas) e 3 (corporativo). ATS com economia de R$ 54 mil/ano. Fonte: RH Briefing #05, #17, #19.'),
    ini('in-backoffice', 'oe-02', 'IN-02.1', 'Back-office −10% e auditoria de ROI das áreas-meio', 'ar-hq', 'p-cfo', 'em_andamento', '2026-04-15', '2027-03-31', 'Corte de 10% nas 6 áreas-meio e ROI levado ao Conselho. Fonte: RH Briefing #04, #18.'),
    ini('in-precatorios', 'oe-03', 'IN-03.1', 'Originação própria de precatórios', 'ar-bf', 'p-bf', 'em_andamento', '2025-11-17', '2027-12-31', 'Aumentar o spread com originação própria. Fonte: Parking Lot de diretrizes.'),
    ini('in-onboarding', 'oe-10', 'IN-10.1', 'Onboarding por BU e gestão do turnover', 'ar-hq', 'p-cho', 'em_andamento', '2026-04-15', '2027-06-30', 'Turnover do 1º ano de ~50% para 25%. Piloto na Auditoria. Fonte: RH Briefing #12, #13.'),
    ini('in-clima', 'oe-10', 'IN-10.2', 'Pesquisa e ações de clima', 'ar-hq', 'p-cho', 'nao_iniciado', '2026-05-01', '2027-06-30', 'Primeira onda segmentada por BU e líder; reconhecimento mensal; pulse semestral. Fonte: RH Briefing #08, #09.'),
    ini('in-partnership', 'oe-11', 'IN-11.1', 'Partnership: ritos, PLR e migração para a sociedade', 'ar-hq', 'p-pres', 'em_andamento', '2026-04-15', '2027-06-30', 'Calendário de ritos dos sócios, PPR adequado à Lei 10.101/2000 e migração CLT → Sociedade. Fonte: RH Briefing #02, #03, #07.'),
    ini('in-pdl', 'oe-12', 'IN-12.1', 'Escola de Líderes (PDL)', 'ar-nx', 'p-cho', 'em_andamento', '2026-05-01', '2027-12-31', 'Pelo menos 2 turmas por ano para coordenadores e supervisores, com a NX. Fonte: RH Briefing #14.'),
  ];

  const nota = 'Status real a atualizar no check-in.';
  const acao = (id: string, iniciativa_id: string, o_que: string, responsavel_id: string, prazo: string, area_id: string, por_que: string, status: Status = 'em_andamento', percentual = 0): Tables['pe_acoes'] =>
    ({ id, iniciativa_id, o_que, responsavel_id, prazo, status, percentual, area_id, por_que, como: nota });
  const acoes: Tables['pe_acoes'][] = [
    acao('ac-crm-1', 'in-crm', 'Centralizar o CRM em plataforma única', 'p-ti', '2026-02-15', 'ar-hq', 'Dados dispersos impedem a visão única do cliente.'),
    acao('ac-crm-2', 'in-crm', 'Configurar o CRM e treinar os sócios da rede', 'p-rede', '2027-03-31', 'ar-tax', '"72% da rede performa, mas faltam dados."'),
    acao('ac-bi-1', 'in-bi', 'Publicar o painel BI de metas até o 30º dia do período', 'p-cfo', '2026-06-30', 'ar-hq', 'Obrigação do Art. 35 da política de PPR.'),
    acao('ac-ia-1', 'in-ia', 'Activity Survey — onda 2 (Marketing e Vendas Externas)', 'p-cho', '2026-09-30', 'ar-hq', 'Repetir o ganho de ~32 h/semana do piloto.'),
    acao('ac-ia-2', 'in-ia', 'Implantar portal de R&S/ATS', 'p-ti', '2026-07-31', 'ar-hq', 'Economia estimada de R$ 54 mil/ano com custo de R$ 1 mil.'),
    acao('ac-bo-1', 'in-backoffice', 'Reduzir 10% do custo das 6 áreas-meio', 'p-cfo', '2026-05-31', 'ar-hq', 'Recuperar margem ROL.'),
    acao('ac-bo-2', 'in-backoffice', 'Auditoria de ROI das áreas-meio para o Conselho', 'p-cfo', '2026-07-31', 'ar-hq', 'Decidir investimento com base em retorno.'),
    acao('ac-pr-1', 'in-precatorios', 'Divulgar semanalmente o estoque de precatórios', 'p-bf', '2025-12-15', 'ar-bf', 'Evitar estoque parado.'),
    acao('ac-pr-2', 'in-precatorios', 'Campanhas locais de compra de precatórios (SP, PR, GO, BA)', 'p-bf', '2027-06-30', 'ar-bf', 'Aumentar o spread com originação própria.'),
    acao('ac-on-1', 'in-onboarding', '20 entrevistas de saída e painel de turnover (gatilhos 20%/30%)', 'p-cho', '2026-06-30', 'ar-hq', 'Entender as causas do turnover.'),
    acao('ac-on-2', 'in-onboarding', 'Onboarding piloto na Auditoria', 'p-cho', '2026-07-31', 'ar-tax', 'Turnover do 1º ano de ~50% para 25%.'),
    acao('ac-cl-1', 'in-clima', 'Primeira pesquisa de clima por BU e líder', 'p-cho', '2026-06-30', 'ar-hq', 'Hoje as decisões de gente são "por percepção".'),
    acao('ac-pa-1', 'in-partnership', 'Calendário anual de ritos dos sócios com SLA de presença', 'p-pres', '2026-05-15', 'ar-hq', 'Presença dos sócios ainda informal.'),
    acao('ac-pa-2', 'in-partnership', 'Adequar a Política de PPR à Lei 10.101/2000', 'p-cho', '2026-05-15', 'ar-hq', 'Segurança jurídica da remuneração variável.'),
    acao('ac-pa-3', 'in-partnership', 'Migração CLT → Sociedade para coordenadores com 1+ ano', 'p-pres', '2026-05-15', 'ar-hq', 'Retenção via partnership (split 30/70, vesting e buyback).'),
    acao('ac-pdl-1', 'in-pdl', 'Turma 1 da Escola de Líderes', 'p-nx', '2026-06-30', 'ar-nx', 'Formar coordenadores e supervisores.'),
    acao('ac-pdl-2', 'in-pdl', 'Turma 2 da Escola de Líderes', 'p-nx', '2026-11-30', 'ar-nx', 'Meta de pelo menos 2 turmas em 2026.'),
  ];

  // ── Indicadores: scorecard do quadro + KPIs de objetivo ───────────────────────
  const scorecardInds = (scorecard as Partial<Tables['pe_indicadores']>[]).map((s, n) => ({
    indicador: { ciclo_id: C, escopo: 'ambicao' as const, polaridade: 'maior' as const, frequencia: 'anual', ...s,
      id: `sc-${s.codigo}`, ordem: n, nome: s.nome! } as Tables['pe_indicadores'],
    metas: [] as Tables['pe_indicador_metas'][],
  }));
  const kpi = (id: string, objetivo_id: string, nome: string, unidade: string, linha_base: number | null, extra: Partial<Tables['pe_indicadores']>, metas: Record<number, number> = {}) => ({
    indicador: { id, ciclo_id: C, escopo: 'objetivo' as const, objetivo_id, nome, unidade, linha_base, polaridade: 'maior' as const, frequencia: 'trimestral', ...extra } as Tables['pe_indicadores'],
    metas: Object.entries(metas).map(([ano, meta]) => ({ id: `${id}-m${ano}`, indicador_id: id, ano: Number(ano), meta })),
  });
  const kpis = [
    kpi('kpi-creditos', 'oe-03', '% da receita vinda de créditos tributários', '%', 72.5,
      { polaridade: 'menor', descricao: 'Créditos (AFD, ROT, DT, RTI, RPC) ÷ receita total. Base 2025 (DRE, Planejamento de Produto).', pendencia: '[PROPOSTA] meta < 60% em 2029.' }, { 2029: 60 }),
    kpi('kpi-turnover', 'oe-10', 'Turnover no 1º ano', '%', 50,
      { polaridade: 'menor', area_id: 'ar-hq', descricao: 'Desligamentos de pessoas com até 12 meses ÷ admitidos. Base ~50% (RH Briefing).', pendencia: 'Meta do RH: 25% até dez/2026. Confirmar a base.' }, { 2027: 25 }),
    kpi('kpi-nps', 'oe-06', 'NPS de clientes', 'pontos', null,
      { descricao: 'Meta 2026 declarada na Cultura Argos: NPS > 90.', pendencia: 'Não há medição encontrada. Definir pesquisa e base.' }),
    kpi('kpi-ativas', 'oe-04', 'Unidades ativas na rede', 'unidades', 355,
      { area_id: 'ar-tax', descricao: 'OnePage (04/11/2026): 355 unidades ativas. Meta 2026 declarada na Cultura Argos: 800.', pendencia: 'Definir o critério de "unidade ativa".' }),
  ];
  const inds = [...scorecardInds, ...kpis];

  // ── Cargos e faixas (PCS 2025-2026; P1 = mínimo, P6 = topo; R$/mês) ──────────
  const pcs: [string, string, string, number, number][] = [
    ['cg-ass', 'Assistente', 'Staff', 2100, 4100],
    ['cg-cjr', 'Consultor Júnior', 'Staff', 4100, 5000],
    ['cg-cpl1', 'Consultor Pleno I', 'Staff', 5000, 6100],
    ['cg-cpl2', 'Consultor Pleno II', 'Staff', 6100, 7100],
    ['cg-csr1', 'Consultor Sênior I', 'Staff', 7100, 8000],
    ['cg-csr2', 'Consultor Sênior II', 'Staff', 8000, 8600],
    ['cg-sup-pl', 'Supervisor Pleno', 'Staff', 8600, 9100],
    ['cg-sup-sr', 'Supervisor Sênior', 'Staff', 9100, 10500],
    ['cg-coord-pl', 'Coordenador Pleno', 'Liderança', 10500, 12200],
    ['cg-coord-sr', 'Coordenador Sênior', 'Liderança', 12200, 13100],
    ['cg-ger1', 'Gerente I', 'Liderança', 13100, 14500],
    ['cg-ger2', 'Gerente II', 'Liderança', 14500, 16400],
    ['cg-gsr1', 'Gerente Sênior I', 'Liderança', 16400, 18100],
    ['cg-gsr2', 'Gerente Sênior II', 'Liderança', 18100, 21000],
    ['cg-dir1', 'Diretor Executivo I', 'Liderança', 21000, 24300],
    ['cg-dir2', 'Diretor Executivo II', 'Liderança', 24300, 28200],
    ['cg-dir3', 'Diretor Executivo III', 'Liderança', 28200, 29600],
  ];
  const cargos: Tables['pe_cargos'][] = pcs.map(([id, nome, familia], i) => ({
    id, nome, familia, ordem: i,
    descricao: 'Trilhas: Técnica (Auditoria, EPP, RPC, Oportunidades, Consultivo), Administrativa, Jurídica e Comercial. Carreira em Y técnica: Líder Técnico I–IV, Gerente Técnico, Head Técnico I–III.',
    requisitos: familia === 'Liderança' ? 'Faixas de retenção P7–P10 a partir de Coordenador Sênior.' : null,
  }));
  const faixas: Tables['pe_faixas_salariais'][] = pcs.map(([id, , , min, max]) => ({
    id: `fx-${id}`, cargo_id: id, nivel: 'P1–P6', minimo: min, medio: Math.round((min + max) / 2 / 100) * 100, maximo: max, vigencia: 2026,
  }));

  // ── Carreira societária (Diretriz Gente, Acordo de Sócios, PCS) ──────────────
  const degraus: Tables['pe_carreira_degraus'][] = [
    { id: 'dg-1', trilha: 'societaria', ordem: 1, nome: 'Executivo Sênior (elegível)', tempo_minimo_meses: 12,
      criterios: 'Entrega em 2+ semestres consecutivos. Coordenador ou acima com 1+ ano pode migrar para a sociedade (vedado CLT → PJ direto).',
      direitos: 'Salário base + comissão proporcional ao resultado da BU.', obrigacoes: 'Avaliação semestral 360° (KPIs + cultura).' },
    { id: 'dg-2', trilha: 'societaria', ordem: 2, nome: 'Sócio de Serviço', criterios: 'Aporte apenas de trabalho, por decisão do Conselho.',
      direitos: 'Participa dos resultados conforme plano; sem voto e sem direito ao patrimônio líquido.', obrigacoes: 'Plano de trabalho com no mínimo 5 KPIs por ano.' },
    { id: 'dg-3', trilha: 'societaria', ordem: 3, nome: 'Sócio Step 1 — Pleno', participacao_pct: null,
      criterios: 'Matriz de avaliação e performance aprovada pelo Conselho. [VALIDAR] critérios objetivos de passagem.',
      direitos: 'R$ 21,0k–24,3k/mês · 10 units. Bônus sobre o ROL: Meta 100%, Super 110%.', obrigacoes: 'Mínimo de 5 KPIs por ano; não concorrência e não aliciamento.' },
    { id: 'dg-4', trilha: 'societaria', ordem: 4, nome: 'Sócio Step 2 — Sênior', criterios: 'Matriz do Conselho.', direitos: 'R$ 24,3k–28,2k/mês · 20 units.', obrigacoes: 'Idem.' },
    { id: 'dg-5', trilha: 'societaria', ordem: 5, nome: 'Sócio Step 3 — C-Level', criterios: 'Matriz do Conselho.', direitos: 'R$ 28,2k–32,7k/mês · 30 units.', obrigacoes: 'Idem.' },
    { id: 'dg-6', trilha: 'societaria', ordem: 6, nome: 'Sócio Step 4 — VP', criterios: 'Matriz do Conselho.', direitos: 'R$ 32,7k–37,0k/mês · 40 units.', obrigacoes: 'Idem.' },
    { id: 'dg-7', trilha: 'societaria', ordem: 7, nome: 'Sócio Step 5 — Sócio de BU (Classe IV)', criterios: 'Matriz do Conselho; liderança de BU.',
      direitos: 'R$ 37,0k–40,8k/mês · 50 units.', obrigacoes: 'Resultado da BU; mentoria e sucessão.' },
    { id: 'dg-8', trilha: 'societaria', ordem: 8, nome: 'Sócio Patrimonial (Classes III → I)',
      criterios: 'Classe II: mais de 2% do capital, elegível ao Conselho (5+ anos de sociedade). Classe I: fundador, mais de 50%.',
      direitos: 'Steps 6–20, de 500 a 3.560 units, com ganho sobre o ROL. Distribuição trimestral condicionada ao caixa.',
      obrigacoes: 'Saída: Good Leaver 100% do valor em 60 parcelas; Bad Leaver 50%. Idade-limite de 70 anos para função executiva.' },
  ];

  // ── Valuation ────────────────────────────────────────────────────────────────
  // Ano-base 2026 do quadro (receita R$ 175 mi, LL R$ 15 mi). Crescimento, EBITDA e múltiplos
  // são ILUSTRATIVOS. Método contratual do Acordo de Sócios descrito no cenário "Contratual".
  const premissa = '[Ilustrativo] EBITDA ainda não informado: valores estimados apenas para demonstrar o cálculo.';
  const cenarios: Tables['pe_valuation_cenarios'][] = [
    { id: 'vc-pes', ciclo_id: C, nome: 'Pessimista', descricao: `${premissa} Receita cresce 20% a.a.`, multiplo_ebitda: 6, taxa_desconto_pct: 16, crescimento_perpetuo_pct: 3, ordem: 0 },
    { id: 'vc-base', ciclo_id: C, nome: 'Base', descricao: `${premissa} Receita cresce 30% a.a.`, multiplo_ebitda: 8, taxa_desconto_pct: 14, crescimento_perpetuo_pct: 4, ordem: 1 },
    { id: 'vc-oti', ciclo_id: C, nome: 'Otimista', descricao: `${premissa} Receita cresce 35% a.a.`, multiplo_ebitda: 10, taxa_desconto_pct: 13, crescimento_perpetuo_pct: 5, ordem: 2 },
  ];
  const crescimento: Record<string, number> = { 'vc-pes': 0.2, 'vc-base': 0.3, 'vc-oti': 0.35 };
  const margemLL = [15 / 175, 0.1, 0.12, 0.135, 0.15];
  const projecoes: Tables['pe_valuation_projecoes'][] = cenarios.flatMap((c) =>
    [2026, 2027, 2028, 2029, 2030].map((ano, i) => {
      const receita = 175e6 * Math.pow(1 + crescimento[c.id], i);
      const lucro = i === 0 ? 15e6 : receita * margemLL[i];
      return { id: `vp-${c.id}-${ano}`, cenario_id: c.id, ano, receita, ebitda: receita * (0.2 + i * 0.01), lucro_liquido: lucro };
    }),
  );

  // ── SWOT atualizada (PEN 2024 → 2026), em rascunho até validação ──────────────
  const swot: Tables['pe_swot'][] = (swotRascunho as (Partial<Tables['pe_swot']> & { chave: string })[]).map(({ chave, ...s }, n) => ({
    ...s, id: `sw-${chave}`, ciclo_id: C, rascunho: true, ordem: n, quadrante: s.quadrante!, titulo: s.titulo!,
  }));
  const swotObjetivos: Tables['pe_swot_objetivos'][] = vinc.map(([ob, sw]) => ({ id: `so-${sw}-${ob}`, swot_id: `sw-${sw}`, objetivo_id: ob }));

  return {
    pe_ciclos: [{ id: C, nome: 'Planejamento Estratégico 2027–2030', ano_inicio: 2027, ano_fim: 2030, status: 'ativo',
      ambicao: 'Ser o líder do ecossistema tributário e de negócios do Brasil até 2030 — a Big Five brasileira.' }],
    org_areas: areas,
    org_pessoas: pessoas,
    pe_identidade: identidade,
    pe_marcos: marcos,
    pe_pilares: pilares,
    pe_objetivos: objetivos,
    pe_iniciativas: iniciativas,
    pe_acoes: acoes,
    pe_acao_atualizacoes: [],
    pe_indicadores: inds.map((i) => i.indicador),
    pe_indicador_metas: inds.flatMap((i) => i.metas),
    pe_indicador_medicoes: [],
    pe_cargos: cargos,
    pe_faixas_salariais: faixas,
    pe_carreira_degraus: degraus,
    pe_valuation_cenarios: cenarios,
    pe_valuation_projecoes: projecoes,
    pe_swot: swot,
    pe_swot_objetivos: swotObjetivos,
  };
}
