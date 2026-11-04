// Tipos espelhando supabase/schema.sql. Mantenha os dois em sincronia.

export type Papel = 'diretoria' | 'lider' | 'colaborador';
export type Status = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'pausado' | 'cancelado';

interface Base {
  id: string;
  created_at?: string;
  updated_at?: string;
}

export interface Area extends Base {
  nome: string;
  sigla?: string | null;
  descricao?: string | null;
  area_pai_id?: string | null;
  lider_id?: string | null;
  ordem?: number;
  ativo?: boolean;
}

export interface Pessoa extends Base {
  user_id?: string | null;
  nome: string;
  email?: string | null;
  area_id?: string | null;
  cargo_id?: string | null;
  degrau_id?: string | null;
  gestor_id?: string | null;
  data_admissao?: string | null;
  is_socio?: boolean;
  ativo?: boolean;
  foto_url?: string | null;
}

export interface Perfil {
  id: string; // = user_id (normalizado no app)
  user_id: string;
  papel: Papel;
  pessoa_id?: string | null;
}

export interface Ciclo extends Base {
  nome: string;
  ano_inicio: number;
  ano_fim: number;
  ambicao?: string | null;
  status: 'rascunho' | 'ativo' | 'encerrado';
}

export type TipoIdentidade = 'missao' | 'visao' | 'proposito' | 'valor' | 'cultura';
export interface Identidade extends Base {
  ciclo_id: string;
  tipo: TipoIdentidade;
  titulo: string;
  descricao?: string | null;
  comportamentos?: string | null;
  ordem?: number;
}

export interface Marco extends Base {
  ciclo_id: string;
  ano: number;
  titulo: string;
  descricao?: string | null;
  status: Status;
  ordem?: number;
}

export interface Pilar extends Base {
  ciclo_id: string;
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  ordem?: number;
}

export interface Objetivo extends Base {
  pilar_id: string;
  codigo?: string | null;
  titulo: string;
  descricao?: string | null;
  area_id?: string | null;
  responsavel_id?: string | null;
  ordem?: number;
}

export interface Iniciativa extends Base {
  objetivo_id: string;
  codigo?: string | null;
  titulo: string;
  descricao?: string | null;
  area_id?: string | null;
  responsavel_id?: string | null;
  inicio?: string | null;
  fim?: string | null;
  status: Status;
  prioridade?: 'alta' | 'media' | 'baixa' | null;
  orcamento?: number | null;
}

export interface Acao extends Base {
  iniciativa_id: string;
  o_que: string;
  por_que?: string | null;
  onde?: string | null;
  responsavel_id?: string | null;
  prazo?: string | null;
  como?: string | null;
  quanto?: number | null;
  area_id?: string | null;
  status: Status;
  percentual: number;
}

export interface AcaoAtualizacao extends Base {
  acao_id: string;
  data: string;
  texto: string;
  percentual?: number | null;
  autor_id?: string | null;
}

export interface Indicador extends Base {
  ciclo_id: string;
  escopo: 'ambicao' | 'objetivo' | 'area';
  objetivo_id?: string | null;
  area_id?: string | null;
  nome: string;
  descricao?: string | null;
  unidade?: string | null;
  polaridade: 'maior' | 'menor';
  frequencia?: string | null;
  linha_base?: number | null;
  responsavel_id?: string | null;
  ordem?: number;
}

export interface IndicadorMeta {
  id: string;
  indicador_id: string;
  ano: number;
  meta: number;
}

export interface IndicadorMedicao extends Base {
  indicador_id: string;
  data_ref: string;
  valor: number;
  comentario?: string | null;
  autor_id?: string | null;
}

export interface Cargo extends Base {
  nome: string;
  familia?: string | null;
  descricao?: string | null;
  requisitos?: string | null;
  ordem?: number;
}

export interface FaixaSalarial extends Base {
  cargo_id: string;
  nivel: string;
  minimo?: number | null;
  medio?: number | null;
  maximo?: number | null;
  vigencia?: number | null;
}

export interface Degrau extends Base {
  trilha: 'profissional' | 'societaria';
  ordem: number;
  nome: string;
  descricao?: string | null;
  criterios?: string | null;
  tempo_minimo_meses?: number | null;
  participacao_pct?: number | null;
  direitos?: string | null;
  obrigacoes?: string | null;
}

export interface ValuationCenario extends Base {
  ciclo_id: string;
  nome: string;
  descricao?: string | null;
  multiplo_ebitda?: number | null;
  taxa_desconto_pct?: number | null;
  crescimento_perpetuo_pct?: number | null;
  ordem?: number;
}

export interface ValuationProjecao {
  id: string;
  cenario_id: string;
  ano: number;
  receita?: number | null;
  ebitda?: number | null;
  lucro_liquido?: number | null;
  headcount?: number | null;
  socios?: number | null;
}

/** Mapa nome-da-tabela → tipo da linha. É o "contrato" do data layer. */
export interface Tables {
  org_areas: Area;
  org_pessoas: Pessoa;
  pe_ciclos: Ciclo;
  pe_identidade: Identidade;
  pe_marcos: Marco;
  pe_pilares: Pilar;
  pe_objetivos: Objetivo;
  pe_iniciativas: Iniciativa;
  pe_acoes: Acao;
  pe_acao_atualizacoes: AcaoAtualizacao;
  pe_indicadores: Indicador;
  pe_indicador_metas: IndicadorMeta;
  pe_indicador_medicoes: IndicadorMedicao;
  pe_cargos: Cargo;
  pe_faixas_salariais: FaixaSalarial;
  pe_carreira_degraus: Degrau;
  pe_valuation_cenarios: ValuationCenario;
  pe_valuation_projecoes: ValuationProjecao;
}

export type TableName = keyof Tables;
