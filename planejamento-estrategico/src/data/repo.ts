/**
 * Camada de acesso a dados. As páginas NUNCA falam com o Supabase diretamente:
 * usam este repositório (via hooks em ./hooks.ts). Isso permite:
 *   - modo demonstração (LocalRepo, dados no navegador) sem backend;
 *   - trocar/ampliar o backend (API da firma, outra base) sem tocar nas telas.
 */
import { supabase } from '../lib/supabase';
import type { TableName, Tables } from './types';

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

/**
 * Escolha do backend. A condição usa a variável de build diretamente: quando o
 * Supabase está configurado, o Vite a substitui por um texto fixo e o bundler
 * elimina o ramo do modo demo — os dados de exemplo NÃO vão para o site.
 */
let local: Promise<import('./repo-local').LocalRepo> | null = null;
function carregarLocal() {
  if (!local) local = import('./repo-local').then((m) => new m.LocalRepo());
  return local;
}

function criarRepo(): DataRepo {
  if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) return new SupabaseRepo();
  return {
    list: (t, f) => carregarLocal().then((r) => r.list(t, f)),
    get: (t, id) => carregarLocal().then((r) => r.get(t, id)),
    save: (t, row) => carregarLocal().then((r) => r.save(t, row)),
    remove: (t, id) => carregarLocal().then((r) => r.remove(t, id)),
  };
}

export const repo: DataRepo = criarRepo();

export async function resetDemo() {
  if (import.meta.env.VITE_SUPABASE_URL) return;
  (await carregarLocal()).reset();
}
