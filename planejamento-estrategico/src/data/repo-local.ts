/**
 * Modo demonstração: dados no navegador. Este módulo (e os dados de exemplo)
 * só entra no site quando o Supabase NÃO está configurado — ver repo.ts.
 */
import type { DataRepo, Filtro, Gravavel } from './repo';
import type { TableName, Tables } from './types';
import { dadosExemplo } from './seed';

function limparFiltro(filtro?: Filtro) {
  return Object.fromEntries(Object.entries(filtro ?? {}).filter(([, v]) => v !== undefined));
}

const CHAVE = 'pe-demo-v5';

/** Exclusão em cascata no modo demo (espelha os ON DELETE CASCADE do schema.sql). */
const CASCATA: Partial<Record<TableName, [TableName, string][]>> = {
  pe_pilares: [['pe_objetivos', 'pilar_id']],
  pe_objetivos: [['pe_iniciativas', 'objetivo_id'], ['pe_indicadores', 'objetivo_id'], ['pe_swot_objetivos', 'objetivo_id']],
  pe_swot: [['pe_swot_objetivos', 'swot_id']],
  pe_iniciativas: [['pe_acoes', 'iniciativa_id']],
  pe_acoes: [['pe_acao_atualizacoes', 'acao_id']],
  pe_indicadores: [['pe_indicador_metas', 'indicador_id'], ['pe_indicador_medicoes', 'indicador_id']],
  pe_cargos: [['pe_faixas_salariais', 'cargo_id']],
  pe_valuation_cenarios: [['pe_valuation_projecoes', 'cenario_id']],
};
type Store = { [K in TableName]?: Tables[K][] };

export class LocalRepo implements DataRepo {
  private store: Store;
  constructor() {
    let s: Store | null = null;
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) s = JSON.parse(raw);
    } catch { /* storage indisponível: segue em memória */ }
    this.store = s ?? dadosExemplo();
  }
  private persistir() {
    try { localStorage.setItem(CHAVE, JSON.stringify(this.store)); } catch { /* ignora */ }
  }
  private rows<T extends TableName>(t: T): Tables[T][] {
    return (this.store[t] ??= [] as never) as Tables[T][];
  }
  async list<T extends TableName>(tabela: T, filtro?: Filtro) {
    const f = limparFiltro(filtro);
    return this.rows(tabela).filter((r) =>
      Object.entries(f).every(([k, v]) => ((r as unknown as Record<string, unknown>)[k] ?? null) === v),
    );
  }
  async get<T extends TableName>(tabela: T, id: string) {
    return this.rows(tabela).find((r) => r.id === id) ?? null;
  }
  async save<T extends TableName>(tabela: T, row: Gravavel<T>) {
    const lista = this.rows(tabela);
    const agora = new Date().toISOString();
    const i = row.id ? lista.findIndex((r) => r.id === row.id) : -1;
    let salvo: Tables[T];
    if (i >= 0) {
      salvo = { ...lista[i], ...row, updated_at: agora } as Tables[T];
      lista[i] = salvo;
    } else {
      salvo = { ...row, id: row.id ?? crypto.randomUUID(), created_at: agora, updated_at: agora } as Tables[T];
      lista.push(salvo);
    }
    this.persistir();
    return salvo;
  }
  async remove(tabela: TableName, id: string) {
    this.removerRec(tabela, id);
    this.persistir();
  }
  private removerRec(tabela: TableName, id: string) {
    for (const [filha, fk] of CASCATA[tabela] ?? []) {
      for (const r of this.rows(filha)) {
        if ((r as unknown as Record<string, unknown>)[fk] === id) this.removerRec(filha, r.id);
      }
    }
    this.store[tabela] = this.rows(tabela).filter((r) => r.id !== id) as never;
  }
  /** Volta aos dados de exemplo (apenas modo demonstração). */
  reset() {
    this.store = dadosExemplo();
    this.persistir();
  }
}

