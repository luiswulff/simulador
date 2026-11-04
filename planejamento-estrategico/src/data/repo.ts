/**
 * Camada de acesso a dados. As páginas NUNCA falam com o Supabase diretamente:
 * usam este repositório (via hooks em ./hooks.ts). Isso permite:
 *   - modo demonstração (LocalRepo, dados no navegador) sem backend;
 *   - trocar/ampliar o backend (API da firma, outra base) sem tocar nas telas.
 */
import { supabase } from '../lib/supabase';
import { config } from '../config';
import type { TableName, Tables } from './types';
import { dadosExemplo } from './seed';

export type Filtro = Record<string, string | number | boolean | null | undefined>;
export type Gravavel<T extends TableName> = Partial<Tables[T]> & { id?: string };

export interface DataRepo {
  list<T extends TableName>(tabela: T, filtro?: Filtro): Promise<Tables[T][]>;
  get<T extends TableName>(tabela: T, id: string): Promise<Tables[T] | null>;
  save<T extends TableName>(tabela: T, row: Gravavel<T>): Promise<Tables[T]>;
  remove(tabela: TableName, id: string): Promise<void>;
}

function limparFiltro(filtro?: Filtro) {
  return Object.fromEntries(Object.entries(filtro ?? {}).filter(([, v]) => v !== undefined));
}

class SupabaseRepo implements DataRepo {
  async list<T extends TableName>(tabela: T, filtro?: Filtro) {
    let q = supabase.from(tabela).select('*');
    for (const [k, v] of Object.entries(limparFiltro(filtro))) {
      q = v === null ? q.is(k, null) : q.eq(k, v as string);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Tables[T][];
  }
  async get<T extends TableName>(tabela: T, id: string) {
    const { data, error } = await supabase.from(tabela).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as Tables[T]) ?? null;
  }
  async save<T extends TableName>(tabela: T, row: Gravavel<T>) {
    const { id, created_at: _c, updated_at: _u, ...resto } = row as Record<string, unknown>;
    const q = id
      ? supabase.from(tabela).update(resto).eq('id', id as string).select().single()
      : supabase.from(tabela).insert(resto).select().single();
    const { data, error } = await q;
    if (error) throw error;
    return data as Tables[T];
  }
  async remove(tabela: TableName, id: string) {
    const { error } = await supabase.from(tabela).delete().eq('id', id);
    if (error) throw error;
  }
}

const CHAVE = 'pe-demo-v1';

/** Exclusão em cascata no modo demo (espelha os ON DELETE CASCADE do schema.sql). */
const CASCATA: Partial<Record<TableName, [TableName, string][]>> = {
  pe_pilares: [['pe_objetivos', 'pilar_id']],
  pe_objetivos: [['pe_iniciativas', 'objetivo_id'], ['pe_indicadores', 'objetivo_id']],
  pe_iniciativas: [['pe_acoes', 'iniciativa_id']],
  pe_acoes: [['pe_acao_atualizacoes', 'acao_id']],
  pe_indicadores: [['pe_indicador_metas', 'indicador_id'], ['pe_indicador_medicoes', 'indicador_id']],
  pe_cargos: [['pe_faixas_salariais', 'cargo_id']],
  pe_valuation_cenarios: [['pe_valuation_projecoes', 'cenario_id']],
};
type Store = { [K in TableName]?: Tables[K][] };

class LocalRepo implements DataRepo {
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

export const repo: DataRepo = config.modoDemo ? new LocalRepo() : new SupabaseRepo();

export function resetDemo() {
  if (repo instanceof LocalRepo) repo.reset();
}
