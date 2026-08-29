export type ProjectOrigin =
  | "EO Ícones 2026"
  | "Expert XP 2026"
  | "Parceria Estratégica"
  | "Rotina Executiva";

export type ProjectVertical =
  | "SW Advogados"
  | "Werte Private"
  | "Werte Corporate"
  | "Guahyba Vinhos"
  | "Banco Fiscal"
  | "Tax Group"
  | "TaxPay"
  | "NX Business School";

export type ProjectStatus =
  | "Estruturação"
  | "Em Proposta"
  | "Ativo"
  | "Homologação"
  | "Concluído";

export interface NextStep {
  text: string;
  done: boolean;
}

export interface ProjectContact {
  name: string;
  info: string;
}

export interface ProjectGenius {
  id: string;
  /** Número do projeto no índice do GENIUS.md. Ex: "01" */
  number: string;
  title: string;
  partner: string;
  origin: ProjectOrigin;
  /** Vertical primária — usada nos filtros. */
  vertical: ProjectVertical;
  /** Todas as verticais envolvidas, como descritas no GENIUS.md. */
  verticals: string[];
  status: ProjectStatus;
  /** Ex: "Ticket R$ 80k–150k", "VGV R$ 20M", "Rebate 30–50%" */
  highlightMetric?: string;
  summary: string;
  thesis: string;
  pillarsOrScope: string[];
  economicModel: string;
  nextSteps: NextStep[];
  contacts?: ProjectContact[];
  /**
   * Volume financeiro declarado explicitamente no GENIUS.md (em BRL).
   * Só é preenchido quando o próprio one-pager traz o número — alimenta o
   * card "VGV / Volume Mapeado" do header.
   */
  declaredValueBRL?: number;
  declaredValueLabel?: string;
  /** true quando os próximos passos foram derivados da tese (o one-pager de origem não os lista). */
  nextStepsDerived?: boolean;
  /** Evento / contexto onde o projeto foi capturado. */
  sourceEvent?: string;
  updatedAt: string;
}

export type ProjectSourceKind = "genius-md" | "projects-json";

export interface ProjectsPayload {
  projects: ProjectGenius[];
  source: {
    kind: ProjectSourceKind;
    /** Caminho efetivamente lido (absoluto quando disponível). */
    path: string;
    label: string;
    syncedAt: string;
    /** Avisos de parsing/fallback, exibidos no rodapé do header. */
    warnings: string[];
  };
}

export const VERTICALS: ProjectVertical[] = [
  "Werte Private",
  "Werte Corporate",
  "SW Advogados",
  "Guahyba Vinhos",
  "Banco Fiscal",
  "Tax Group",
  "TaxPay",
  "NX Business School",
];

export const ORIGINS: ProjectOrigin[] = [
  "EO Ícones 2026",
  "Expert XP 2026",
  "Parceria Estratégica",
  "Rotina Executiva",
];

export const STATUSES: ProjectStatus[] = [
  "Estruturação",
  "Em Proposta",
  "Ativo",
  "Homologação",
  "Concluído",
];
