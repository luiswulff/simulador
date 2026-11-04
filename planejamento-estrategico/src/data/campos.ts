/**
 * Definição dos formulários por tabela. Um único formulário genérico
 * (components/EntityForm.tsx) renderiza qualquer entidade a partir daqui —
 * para adicionar um campo: crie a coluna no schema.sql, o tipo em types.ts e
 * a linha correspondente abaixo.
 */
import { STATUS_OPCOES } from '../lib/format';
import type { TableName } from './types';

export type Campo =
  | { nome: string; label: string; tipo: 'text' | 'textarea' | 'date' | 'color'; obrigatorio?: boolean; ajuda?: string }
  | { nome: string; label: string; tipo: 'number'; obrigatorio?: boolean; ajuda?: string; passo?: number }
  | { nome: string; label: string; tipo: 'checkbox'; ajuda?: string; obrigatorio?: never }
  | { nome: string; label: string; tipo: 'select'; opcoes: { value: string; label: string }[]; obrigatorio?: boolean; ajuda?: string }
  | { nome: string; label: string; tipo: 'ref'; tabela: TableName; rotulo: string; obrigatorio?: boolean; ajuda?: string };

const pessoa = (nome: string, label: string): Campo => ({ nome, label, tipo: 'ref', tabela: 'org_pessoas', rotulo: 'nome' });
const area: Campo = { nome: 'area_id', label: 'Área', tipo: 'ref', tabela: 'org_areas', rotulo: 'nome' };
const status: Campo = { nome: 'status', label: 'Status', tipo: 'select', opcoes: STATUS_OPCOES, obrigatorio: true };
const ordem: Campo = { nome: 'ordem', label: 'Ordem de exibição', tipo: 'number' };

export const CAMPOS: Partial<Record<TableName, Campo[]>> = {
  pe_ciclos: [
    { nome: 'nome', label: 'Nome do ciclo', tipo: 'text', obrigatorio: true },
    { nome: 'ambicao', label: 'Ambição (frase-síntese)', tipo: 'textarea' },
    { nome: 'ano_inicio', label: 'Ano inicial', tipo: 'number', obrigatorio: true },
    { nome: 'ano_fim', label: 'Ano final', tipo: 'number', obrigatorio: true },
  ],
  pe_identidade: [
    { nome: 'tipo', label: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: [
      { value: 'missao', label: 'Missão' }, { value: 'visao', label: 'Visão' }, { value: 'proposito', label: 'Propósito' },
      { value: 'valor', label: 'Valor' }, { value: 'cultura', label: 'Cultura' },
    ] },
    { nome: 'titulo', label: 'Título', tipo: 'text', obrigatorio: true },
    { nome: 'descricao', label: 'Descrição', tipo: 'textarea' },
    { nome: 'comportamentos', label: 'Comportamentos esperados (um por linha)', tipo: 'textarea' },
    ordem,
  ],
  pe_marcos: [
    { nome: 'ano', label: 'Ano', tipo: 'number', obrigatorio: true },
    { nome: 'titulo', label: 'Marco', tipo: 'text', obrigatorio: true },
    { nome: 'descricao', label: 'Descrição', tipo: 'textarea' },
    status,
  ],
  pe_pilares: [
    { nome: 'nome', label: 'Pilar / Perspectiva', tipo: 'text', obrigatorio: true },
    { nome: 'descricao', label: 'Descrição', tipo: 'textarea' },
    { nome: 'cor', label: 'Cor', tipo: 'color' },
    ordem,
  ],
  pe_objetivos: [
    { nome: 'pilar_id', label: 'Pilar', tipo: 'ref', tabela: 'pe_pilares', rotulo: 'nome', obrigatorio: true },
    { nome: 'codigo', label: 'Código', tipo: 'text', ajuda: 'Ex.: OE-01' },
    { nome: 'titulo', label: 'Objetivo estratégico', tipo: 'text', obrigatorio: true },
    { nome: 'descricao', label: 'Descrição', tipo: 'textarea' },
    area,
    pessoa('responsavel_id', 'Responsável (sponsor)'),
    ordem,
  ],
  pe_iniciativas: [
    { nome: 'objetivo_id', label: 'Objetivo', tipo: 'ref', tabela: 'pe_objetivos', rotulo: 'titulo', obrigatorio: true },
    { nome: 'codigo', label: 'Código', tipo: 'text', ajuda: 'Ex.: IN-01.1' },
    { nome: 'titulo', label: 'Iniciativa / Projeto', tipo: 'text', obrigatorio: true },
    { nome: 'descricao', label: 'Descrição e escopo', tipo: 'textarea' },
    area,
    pessoa('responsavel_id', 'Responsável'),
    { nome: 'inicio', label: 'Início', tipo: 'date' },
    { nome: 'fim', label: 'Término', tipo: 'date' },
    status,
    { nome: 'prioridade', label: 'Prioridade', tipo: 'select', opcoes: [
      { value: 'alta', label: 'Alta' }, { value: 'media', label: 'Média' }, { value: 'baixa', label: 'Baixa' },
    ] },
    { nome: 'orcamento', label: 'Orçamento (R$)', tipo: 'number' },
  ],
  pe_acoes: [
    { nome: 'iniciativa_id', label: 'Iniciativa', tipo: 'ref', tabela: 'pe_iniciativas', rotulo: 'titulo', obrigatorio: true },
    { nome: 'o_que', label: 'O quê? (What)', tipo: 'text', obrigatorio: true },
    { nome: 'por_que', label: 'Por quê? (Why)', tipo: 'textarea' },
    { nome: 'onde', label: 'Onde? (Where)', tipo: 'text' },
    pessoa('responsavel_id', 'Quem? (Who)'),
    { nome: 'prazo', label: 'Quando? (When — prazo)', tipo: 'date' },
    { nome: 'como', label: 'Como? (How)', tipo: 'textarea' },
    { nome: 'quanto', label: 'Quanto? (How much — R$)', tipo: 'number' },
    area,
    status,
    { nome: 'percentual', label: '% concluído', tipo: 'number', passo: 5 },
  ],
  pe_acao_atualizacoes: [
    { nome: 'data', label: 'Data', tipo: 'date', obrigatorio: true },
    { nome: 'texto', label: 'O que avançou / bloqueios', tipo: 'textarea', obrigatorio: true },
    { nome: 'percentual', label: 'Novo % concluído', tipo: 'number', passo: 5 },
  ],
  pe_indicadores: [
    { nome: 'nome', label: 'Indicador (KPI)', tipo: 'text', obrigatorio: true },
    { nome: 'escopo', label: 'Nível', tipo: 'select', obrigatorio: true, opcoes: [
      { value: 'ambicao', label: 'Ambição (firma)' }, { value: 'objetivo', label: 'Objetivo estratégico' }, { value: 'area', label: 'Área' },
    ] },
    { nome: 'objetivo_id', label: 'Objetivo (se nível = objetivo)', tipo: 'ref', tabela: 'pe_objetivos', rotulo: 'titulo' },
    area,
    { nome: 'descricao', label: 'Fórmula / fonte do dado', tipo: 'textarea' },
    { nome: 'unidade', label: 'Unidade', tipo: 'text', ajuda: 'Ex.: R$ mi, %, nº, pessoas' },
    { nome: 'polaridade', label: 'Polaridade', tipo: 'select', obrigatorio: true, opcoes: [
      { value: 'maior', label: 'Quanto maior, melhor' }, { value: 'menor', label: 'Quanto menor, melhor' },
    ] },
    { nome: 'frequencia', label: 'Frequência de medição', tipo: 'select', opcoes: [
      { value: 'mensal', label: 'Mensal' }, { value: 'trimestral', label: 'Trimestral' }, { value: 'anual', label: 'Anual' },
    ] },
    { nome: 'linha_base', label: 'Linha de base (2026)', tipo: 'number' },
    pessoa('responsavel_id', 'Responsável'),
  ],
  pe_indicador_medicoes: [
    { nome: 'data_ref', label: 'Data de referência', tipo: 'date', obrigatorio: true },
    { nome: 'valor', label: 'Valor apurado', tipo: 'number', obrigatorio: true },
    { nome: 'comentario', label: 'Comentário', tipo: 'textarea' },
  ],
  org_areas: [
    { nome: 'nome', label: 'Nome da área', tipo: 'text', obrigatorio: true },
    { nome: 'sigla', label: 'Sigla', tipo: 'text' },
    { nome: 'descricao', label: 'Descrição / escopo', tipo: 'textarea' },
    { nome: 'area_pai_id', label: 'Área superior', tipo: 'ref', tabela: 'org_areas', rotulo: 'nome' },
    pessoa('lider_id', 'Líder'),
    ordem,
  ],
  org_pessoas: [
    { nome: 'nome', label: 'Nome', tipo: 'text', obrigatorio: true },
    { nome: 'email', label: 'E-mail corporativo', tipo: 'text', ajuda: 'Usado para vincular o login à pessoa' },
    area,
    { nome: 'cargo_id', label: 'Cargo', tipo: 'ref', tabela: 'pe_cargos', rotulo: 'nome' },
    { nome: 'degrau_id', label: 'Degrau na carreira societária', tipo: 'ref', tabela: 'pe_carreira_degraus', rotulo: 'nome' },
    pessoa('gestor_id', 'Gestor direto'),
    { nome: 'data_admissao', label: 'Data de admissão', tipo: 'date' },
    { nome: 'is_socio', label: 'É sócio', tipo: 'checkbox' },
    { nome: 'ativo', label: 'Ativo', tipo: 'checkbox' },
  ],
  pe_cargos: [
    { nome: 'nome', label: 'Cargo', tipo: 'text', obrigatorio: true },
    { nome: 'familia', label: 'Família / trilha', tipo: 'text' },
    { nome: 'descricao', label: 'Responsabilidades', tipo: 'textarea' },
    { nome: 'requisitos', label: 'Requisitos', tipo: 'textarea' },
    ordem,
  ],
  pe_faixas_salariais: [
    { nome: 'nivel', label: 'Nível', tipo: 'text', obrigatorio: true, ajuda: 'Ex.: I, II, III' },
    { nome: 'minimo', label: 'Mínimo (R$)', tipo: 'number' },
    { nome: 'medio', label: 'Médio (R$)', tipo: 'number' },
    { nome: 'maximo', label: 'Máximo (R$)', tipo: 'number' },
    { nome: 'vigencia', label: 'Ano de vigência', tipo: 'number' },
  ],
  pe_carreira_degraus: [
    { nome: 'ordem', label: 'Ordem (degrau)', tipo: 'number', obrigatorio: true },
    { nome: 'nome', label: 'Nome do degrau', tipo: 'text', obrigatorio: true },
    { nome: 'trilha', label: 'Trilha', tipo: 'select', obrigatorio: true, opcoes: [
      { value: 'societaria', label: 'Societária' }, { value: 'profissional', label: 'Profissional' },
    ] },
    { nome: 'descricao', label: 'Descrição', tipo: 'textarea' },
    { nome: 'criterios', label: 'Critérios de acesso', tipo: 'textarea' },
    { nome: 'tempo_minimo_meses', label: 'Tempo mínimo no degrau anterior (meses)', tipo: 'number' },
    { nome: 'participacao_pct', label: 'Participação societária de referência (%)', tipo: 'number', passo: 0.1 },
    { nome: 'direitos', label: 'Direitos', tipo: 'textarea' },
    { nome: 'obrigacoes', label: 'Obrigações', tipo: 'textarea' },
  ],
  pe_valuation_cenarios: [
    { nome: 'nome', label: 'Cenário', tipo: 'text', obrigatorio: true },
    { nome: 'descricao', label: 'Premissas qualitativas', tipo: 'textarea' },
    { nome: 'multiplo_ebitda', label: 'Múltiplo EV/EBITDA', tipo: 'number', passo: 0.1 },
    { nome: 'taxa_desconto_pct', label: 'Taxa de desconto — WACC (% a.a.)', tipo: 'number', passo: 0.1 },
    { nome: 'crescimento_perpetuo_pct', label: 'Crescimento na perpetuidade (% a.a.)', tipo: 'number', passo: 0.1 },
    ordem,
  ],
  pe_valuation_projecoes: [
    { nome: 'ano', label: 'Ano', tipo: 'number', obrigatorio: true },
    { nome: 'receita', label: 'Receita (R$)', tipo: 'number' },
    { nome: 'ebitda', label: 'EBITDA (R$)', tipo: 'number' },
    { nome: 'lucro_liquido', label: 'Lucro líquido (R$)', tipo: 'number' },
    { nome: 'headcount', label: 'Headcount', tipo: 'number' },
    { nome: 'socios', label: 'Nº de sócios', tipo: 'number' },
  ],
};
