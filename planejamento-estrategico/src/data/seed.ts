/**
 * DADOS DE EXEMPLO — usados apenas no modo demonstração (sem Supabase).
 * Todo conteúdo aqui é ILUSTRATIVO: textos, números e nomes são placeholders para
 * mostrar a navegação e o drill-down. Substitua pelo conteúdo real do planejamento.
 */
import type { Tables, TableName, Status } from './types';
import scorecard from './scorecard-2026.json';

type Store = { [K in TableName]?: Tables[K][] };

export function dadosExemplo(): Store {
  const C = 'ciclo-2027';
  const ANOS = [2027, 2028, 2029, 2030];

  const areas: Tables['org_areas'][] = [
    { id: 'ar-dir', nome: 'Diretoria Executiva', sigla: 'DIR', ordem: 0, lider_id: 'p-01' },
    { id: 'ar-trib', nome: 'Consultoria Tributária', sigla: 'TRIB', ordem: 1, lider_id: 'p-02' },
    { id: 'ar-cred', nome: 'Recuperação de Créditos', sigla: 'CRED', ordem: 2, lider_id: 'p-03' },
    { id: 'ar-com', nome: 'Comercial & Marca', sigla: 'COM', ordem: 3, lider_id: 'p-04' },
    { id: 'ar-pes', nome: 'Pessoas & Cultura', sigla: 'PES', ordem: 4, lider_id: 'p-05' },
    { id: 'ar-fin', nome: 'Finanças & Controladoria', sigla: 'FIN', ordem: 5, lider_id: 'p-06' },
    { id: 'ar-tec', nome: 'Tecnologia & Dados', sigla: 'TEC', ordem: 6, lider_id: 'p-07' },
  ];

  const pessoa = (id: string, nome: string, area_id: string, cargo_id: string, extra: Partial<Tables['org_pessoas']> = {}) =>
    ({ id, nome, area_id, cargo_id, ativo: true, is_socio: false, ...extra });
  const pessoas: Tables['org_pessoas'][] = [
    pessoa('p-01', 'Sócio-Diretor (exemplo)', 'ar-dir', 'cg-dir', { is_socio: true, degrau_id: 'dg-5' }),
    pessoa('p-02', 'Líder Tributário (exemplo)', 'ar-trib', 'cg-dir', { is_socio: true, degrau_id: 'dg-3', gestor_id: 'p-01' }),
    pessoa('p-03', 'Líder de Créditos (exemplo)', 'ar-cred', 'cg-ger-sr', { is_socio: true, degrau_id: 'dg-2', gestor_id: 'p-01' }),
    pessoa('p-04', 'Líder Comercial (exemplo)', 'ar-com', 'cg-ger-sr', { degrau_id: 'dg-1', gestor_id: 'p-01' }),
    pessoa('p-05', 'Líder de Pessoas (exemplo)', 'ar-pes', 'cg-ger', { gestor_id: 'p-01' }),
    pessoa('p-06', 'Controller (exemplo)', 'ar-fin', 'cg-ger', { gestor_id: 'p-01' }),
    pessoa('p-07', 'Líder de Tecnologia (exemplo)', 'ar-tec', 'cg-ger', { gestor_id: 'p-01' }),
    pessoa('p-08', 'Consultor Sênior (exemplo)', 'ar-trib', 'cg-sr', { gestor_id: 'p-02' }),
    pessoa('p-09', 'Analista Tributário (exemplo)', 'ar-trib', 'cg-ana', { gestor_id: 'p-08' }),
    pessoa('p-10', 'Analista de Créditos (exemplo)', 'ar-cred', 'cg-ana', { gestor_id: 'p-03' }),
  ];

  const identidade: Tables['pe_identidade'][] = [
    { id: 'id-mis', ciclo_id: C, tipo: 'missao', ordem: 0, titulo: 'Missão',
      descricao: '[Exemplo — substitua] Gerar valor real e mensurável para os nossos clientes por meio de inteligência tributária e empresarial, com ética, técnica e proximidade.' },
    { id: 'id-vis', ciclo_id: C, tipo: 'visao', ordem: 0, titulo: 'Visão 2030',
      descricao: '[Exemplo — substitua] Ser reconhecida, até 2030, como uma das cinco maiores firmas brasileiras de consultoria tributária e empresarial — a Big Five brasileira.' },
    { id: 'id-pro', ciclo_id: C, tipo: 'proposito', ordem: 0, titulo: 'Propósito',
      descricao: '[Exemplo — substitua] Simplificar o complexo para que as empresas brasileiras cresçam com segurança.' },
    ...['Ética inegociável', 'Excelência técnica', 'Foco no resultado do cliente', 'Mentalidade de dono', 'Colaboração'].map((t, i) => ({
      id: `id-val-${i}`, ciclo_id: C, tipo: 'valor' as const, ordem: i, titulo: t,
      descricao: '[Exemplo] O que este valor significa para a firma.',
      comportamentos: '[Exemplo] Comportamento observável 1\nComportamento observável 2',
    })),
    ...['Meritocracia transparente', 'Aprendizado contínuo', 'Decisão baseada em dados'].map((t, i) => ({
      id: `id-cul-${i}`, ciclo_id: C, tipo: 'cultura' as const, ordem: i, titulo: t,
      descricao: '[Exemplo] Como este traço cultural aparece no dia a dia.',
    })),
  ];

  const marcos: Tables['pe_marcos'][] = [
    { id: 'mc-1', ciclo_id: C, ano: 2027, titulo: '[Exemplo] Governança societária e plano de carreira implantados', status: 'em_andamento' },
    { id: 'mc-2', ciclo_id: C, ano: 2027, titulo: '[Exemplo] Novo modelo de precificação e CRM integrados', status: 'nao_iniciado' },
    { id: 'mc-3', ciclo_id: C, ano: 2028, titulo: '[Exemplo] Abertura de 2 novas praças regionais', status: 'nao_iniciado' },
    { id: 'mc-4', ciclo_id: C, ano: 2029, titulo: '[Exemplo] Aquisição/fusão com firma complementar', status: 'nao_iniciado' },
    { id: 'mc-5', ciclo_id: C, ano: 2030, titulo: '[Exemplo] Top 5 em receita entre firmas brasileiras independentes', status: 'nao_iniciado' },
  ];

  const pilares: Tables['pe_pilares'][] = [
    { id: 'pl-1', ciclo_id: C, nome: 'Crescimento & Mercado', cor: '#a98445', ordem: 0, descricao: 'Receita, novas praças, novos serviços e M&A.' },
    { id: 'pl-2', ciclo_id: C, nome: 'Clientes & Marca', cor: '#4f8a64', ordem: 1, descricao: 'Experiência, retenção e reconhecimento de mercado.' },
    { id: 'pl-3', ciclo_id: C, nome: 'Excelência Operacional & Tecnologia', cor: '#5b6fa8', ordem: 2, descricao: 'Processos, produtividade, dados e automação.' },
    { id: 'pl-4', ciclo_id: C, nome: 'Pessoas & Partnership', cor: '#b5573f', ordem: 3, descricao: 'Atração, carreira, sucessão e modelo societário.' },
  ];

  const objetivos: Tables['pe_objetivos'][] = [
    { id: 'ob-1', pilar_id: 'pl-1', codigo: 'OE-01', titulo: 'Multiplicar a receita recorrente até 2030', area_id: 'ar-dir', responsavel_id: 'p-01', ordem: 0 },
    { id: 'ob-2', pilar_id: 'pl-1', codigo: 'OE-02', titulo: 'Expandir presença nacional', area_id: 'ar-com', responsavel_id: 'p-04', ordem: 1 },
    { id: 'ob-3', pilar_id: 'pl-2', codigo: 'OE-03', titulo: 'Ser referência de marca em consultoria tributária', area_id: 'ar-com', responsavel_id: 'p-04', ordem: 0 },
    { id: 'ob-4', pilar_id: 'pl-3', codigo: 'OE-04', titulo: 'Escalar a entrega com tecnologia e dados', area_id: 'ar-tec', responsavel_id: 'p-07', ordem: 0 },
    { id: 'ob-5', pilar_id: 'pl-4', codigo: 'OE-05', titulo: 'Implantar carreira e partnership de padrão Big Four', area_id: 'ar-pes', responsavel_id: 'p-05', ordem: 0 },
  ];

  const ini = (id: string, objetivo_id: string, codigo: string, titulo: string, area_id: string, responsavel_id: string, status: Status, inicio: string, fim: string): Tables['pe_iniciativas'] =>
    ({ id, objetivo_id, codigo, titulo, area_id, responsavel_id, status, inicio, fim, prioridade: 'alta' });
  const iniciativas: Tables['pe_iniciativas'][] = [
    ini('in-1', 'ob-1', 'IN-01.1', 'Programa de contas-chave (key accounts)', 'ar-com', 'p-04', 'em_andamento', '2027-01-01', '2027-12-31'),
    ini('in-2', 'ob-1', 'IN-01.2', 'Novas linhas de serviço (Reforma Tributária)', 'ar-trib', 'p-02', 'em_andamento', '2027-01-01', '2028-06-30'),
    ini('in-3', 'ob-2', 'IN-02.1', 'Plano de abertura de praças regionais', 'ar-dir', 'p-01', 'nao_iniciado', '2027-07-01', '2028-12-31'),
    ini('in-4', 'ob-3', 'IN-03.1', 'Programa de conteúdo e autoridade de marca', 'ar-com', 'p-04', 'em_andamento', '2027-02-01', '2027-12-31'),
    ini('in-5', 'ob-4', 'IN-04.1', 'Plataforma integrada (CRM + propostas + PE)', 'ar-tec', 'p-07', 'em_andamento', '2027-01-01', '2027-09-30'),
    ini('in-6', 'ob-5', 'IN-05.1', 'Plano de cargos e salários', 'ar-pes', 'p-05', 'em_andamento', '2027-01-01', '2027-06-30'),
    ini('in-7', 'ob-5', 'IN-05.2', 'Acordo de sócios e trilha societária', 'ar-dir', 'p-01', 'nao_iniciado', '2027-03-01', '2027-12-31'),
  ];

  const acao = (id: string, iniciativa_id: string, o_que: string, responsavel_id: string, prazo: string, status: Status, percentual: number, area_id: string): Tables['pe_acoes'] =>
    ({ id, iniciativa_id, o_que, responsavel_id, prazo, status, percentual, area_id, por_que: '[Exemplo] Justificativa da ação', como: '[Exemplo] Método de execução' });
  const acoes: Tables['pe_acoes'][] = [
    acao('ac-1', 'in-1', 'Definir carteira das 30 contas-chave', 'p-04', '2027-02-28', 'concluido', 100, 'ar-com'),
    acao('ac-2', 'in-1', 'Nomear sócio responsável por conta', 'p-01', '2027-03-31', 'em_andamento', 60, 'ar-dir'),
    acao('ac-3', 'in-2', 'Desenhar portfólio de serviços da Reforma', 'p-02', '2027-04-30', 'em_andamento', 40, 'ar-trib'),
    acao('ac-4', 'in-2', 'Treinar equipe técnica (IBS/CBS)', 'p-08', '2027-06-30', 'nao_iniciado', 0, 'ar-trib'),
    acao('ac-5', 'in-3', 'Estudo de mercado das praças candidatas', 'p-01', '2027-09-30', 'nao_iniciado', 0, 'ar-dir'),
    acao('ac-6', 'in-4', 'Calendário editorial e porta-vozes', 'p-04', '2027-03-15', 'em_andamento', 50, 'ar-com'),
    acao('ac-7', 'in-5', 'Unificar cadastro de pessoas e áreas (org_*)', 'p-07', '2027-02-15', 'concluido', 100, 'ar-tec'),
    acao('ac-8', 'in-5', 'Integrar CRM às metas comerciais', 'p-07', '2027-05-31', 'em_andamento', 30, 'ar-tec'),
    acao('ac-9', 'in-6', 'Mapear e descrever todos os cargos', 'p-05', '2027-02-28', 'em_andamento', 70, 'ar-pes'),
    acao('ac-10', 'in-6', 'Pesquisa salarial de mercado', 'p-05', '2027-04-30', 'nao_iniciado', 0, 'ar-pes'),
    acao('ac-11', 'in-7', 'Minuta do acordo de sócios', 'p-01', '2027-06-30', 'nao_iniciado', 0, 'ar-dir'),
  ];

  const ind = (id: string, nome: string, unidade: string, linha_base: number, metas: number[], extra: Partial<Tables['pe_indicadores']> = {}) => ({
    indicador: { id, ciclo_id: C, escopo: 'ambicao' as const, nome, unidade, linha_base, polaridade: 'maior' as const, frequencia: 'anual', ...extra },
    metas: metas.map((meta, i) => ({ id: `${id}-m${ANOS[i]}`, indicador_id: id, ano: ANOS[i], meta })),
  });
  // Scorecard 2026–2030: estrutura e ano-base 2026 do quadro da diretoria (dados reais);
  // metas 2027–2030 ainda em branco, a definir. Fonte única: scorecard-2026.json
  const scorecardInds = (scorecard as Partial<Tables['pe_indicadores']>[]).map((s, n) => ({
    indicador: { ciclo_id: C, escopo: 'ambicao' as const, polaridade: 'maior' as const, frequencia: 'anual', ...s,
      id: `sc-${s.codigo}`, ordem: n, nome: s.nome! } as Tables['pe_indicadores'],
    metas: [] as Tables['pe_indicador_metas'][],
  }));
  const inds = [
    ...scorecardInds,
    ind('kpi-nps', 'NPS de clientes (exemplo)', 'pontos', 55, [60, 65, 70, 75], { escopo: 'objetivo', objetivo_id: 'ob-3', area_id: 'ar-com' }),
    ind('kpi-ccl', 'Clientes com 2+ linhas de serviço (exemplo)', '%', 15, [22, 30, 38, 45], { escopo: 'objetivo', objetivo_id: 'ob-1', area_id: 'ar-com' }),
  ];

  const cargos: Tables['pe_cargos'][] = [
    ['cg-tra', 'Trainee'], ['cg-ass', 'Assistente'], ['cg-ana', 'Analista'], ['cg-sr', 'Consultor Sênior'],
    ['cg-sup', 'Supervisor'], ['cg-ger', 'Gerente'], ['cg-ger-sr', 'Gerente Sênior'], ['cg-dir', 'Diretor'],
  ].map(([id, nome], i) => ({ id, nome, familia: 'Consultoria', ordem: i, descricao: '[Exemplo] Responsabilidades do cargo.', requisitos: '[Exemplo] Formação, experiência e competências.' }));

  const faixas: Tables['pe_faixas_salariais'][] = cargos.flatMap((c, i) => {
    const base = 3000 * Math.pow(1.45, i); // valores ilustrativos
    return ['I', 'II', 'III'].map((nivel, j) => {
      const med = Math.round((base * (1 + j * 0.15)) / 100) * 100;
      return { id: `fx-${c.id}-${nivel}`, cargo_id: c.id, nivel, minimo: Math.round(med * 0.85), medio: med, maximo: Math.round(med * 1.15), vigencia: 2027 };
    });
  });

  const degraus: Tables['pe_carreira_degraus'][] = [
    { id: 'dg-1', trilha: 'societaria', ordem: 1, nome: 'Elegível a Sócio', tempo_minimo_meses: 24, participacao_pct: 0,
      criterios: '[Exemplo] Gerente Sênior com 2 anos no cargo, carteira própria e avaliação 360° acima da meta.', direitos: '[Exemplo] Participa do programa de preparação societária.', obrigacoes: '[Exemplo] Plano de desenvolvimento aprovado pelo comitê.' },
    { id: 'dg-2', trilha: 'societaria', ordem: 2, nome: 'Sócio de Serviço (Non-equity)', tempo_minimo_meses: 24, participacao_pct: 0,
      criterios: '[Exemplo] Aprovação do comitê de sócios; originação mínima anual.', direitos: '[Exemplo] Bônus sobre resultado da área.', obrigacoes: '[Exemplo] Metas de originação e formação de equipe.' },
    { id: 'dg-3', trilha: 'societaria', ordem: 3, nome: 'Sócio de Capital (Equity)', tempo_minimo_meses: 36, participacao_pct: 2,
      criterios: '[Exemplo] Votação da assembleia; aporte/vesting conforme acordo.', direitos: '[Exemplo] Participação nos lucros e voto.', obrigacoes: '[Exemplo] Não concorrência e dedicação exclusiva.' },
    { id: 'dg-4', trilha: 'societaria', ordem: 4, nome: 'Sócio Sênior', tempo_minimo_meses: 48, participacao_pct: 5,
      criterios: '[Exemplo] Liderança de área e sucessor formado.', direitos: '[Exemplo] Assento no comitê executivo.', obrigacoes: '[Exemplo] Mentoria de novos sócios.' },
    { id: 'dg-5', trilha: 'societaria', ordem: 5, nome: 'Sócio-Diretor (Managing Partner)', participacao_pct: 15,
      criterios: '[Exemplo] Eleito pela assembleia de sócios para mandato definido.', direitos: '[Exemplo] Condução executiva da firma.', obrigacoes: '[Exemplo] Prestação de contas trimestral à assembleia.' },
  ];

  // Valuation: ano-base 2026 com receita (R$ 175 mi) e LL (R$ 15 mi) do quadro; crescimento,
  // EBITDA e múltiplos são ILUSTRATIVOS (CAGR 20% / 30% / 35% — sensibilidade, não meta aprovada).
  const premissa = '[Exemplo] Premissas ilustrativas. EBITDA ainda não informado: valores estimados apenas para demonstrar o cálculo.';
  const cenarios: Tables['pe_valuation_cenarios'][] = [
    { id: 'vc-pes', ciclo_id: C, nome: 'Pessimista', descricao: `${premissa} Receita cresce 20% a.a.`, multiplo_ebitda: 6, taxa_desconto_pct: 16, crescimento_perpetuo_pct: 3, ordem: 0 },
    { id: 'vc-base', ciclo_id: C, nome: 'Base', descricao: `${premissa} Receita cresce 30% a.a.`, multiplo_ebitda: 8, taxa_desconto_pct: 14, crescimento_perpetuo_pct: 4, ordem: 1 },
    { id: 'vc-oti', ciclo_id: C, nome: 'Otimista', descricao: `${premissa} Receita cresce 35% a.a.`, multiplo_ebitda: 10, taxa_desconto_pct: 13, crescimento_perpetuo_pct: 5, ordem: 2 },
  ];
  const crescimento: Record<string, number> = { 'vc-pes': 0.2, 'vc-base': 0.3, 'vc-oti': 0.35 };
  const margemLL = [15 / 175, 0.1, 0.12, 0.135, 0.15];
  const projecoes: Tables['pe_valuation_projecoes'][] = cenarios.flatMap((c) =>
    [2026, ...ANOS].map((ano, i) => {
      const receita = 175e6 * Math.pow(1 + crescimento[c.id], i);
      const lucro = i === 0 ? 15e6 : receita * margemLL[i];
      return { id: `vp-${c.id}-${ano}`, cenario_id: c.id, ano, receita, ebitda: receita * (0.2 + i * 0.01), lucro_liquido: lucro };
    }),
  );


  return {
    pe_ciclos: [{ id: C, nome: 'Planejamento Estratégico 2027–2030', ano_inicio: 2027, ano_fim: 2030, status: 'ativo',
      ambicao: '[Exemplo — substitua] Transformar a firma na Big Five brasileira de consultoria tributária e empresarial.' }],
    org_areas: areas,
    org_pessoas: pessoas,
    pe_identidade: identidade,
    pe_marcos: marcos,
    pe_pilares: pilares,
    pe_objetivos: objetivos,
    pe_iniciativas: iniciativas,
    pe_acoes: acoes,
    pe_acao_atualizacoes: [
      { id: 'up-1', acao_id: 'ac-2', data: '2027-02-20', texto: '[Exemplo] 18 de 30 contas já com sócio definido.', percentual: 60, autor_id: 'p-01' },
    ],
    pe_indicadores: inds.map((i) => i.indicador),
    pe_indicador_metas: inds.flatMap((i) => i.metas),
    pe_indicador_medicoes: [],
    pe_cargos: cargos,
    pe_faixas_salariais: faixas,
    pe_carreira_degraus: degraus,
    pe_valuation_cenarios: cenarios,
    pe_valuation_projecoes: projecoes,
  };
}
