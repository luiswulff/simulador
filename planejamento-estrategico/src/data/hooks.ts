import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repo, type Filtro, type Gravavel } from './repo';
import type { TableName, Tables } from './types';

export function useList<T extends TableName>(tabela: T, filtro?: Filtro) {
  return useQuery({ queryKey: [tabela, 'list', filtro ?? {}], queryFn: () => repo.list(tabela, filtro) });
}

export function useRow<T extends TableName>(tabela: T, id: string | undefined) {
  return useQuery({
    queryKey: [tabela, 'row', id],
    queryFn: () => repo.get(tabela, id!),
    enabled: Boolean(id),
  });
}

export function useSave<T extends TableName>(tabela: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: Gravavel<T>) => repo.save(tabela, row),
    onSuccess: () => qc.invalidateQueries({ queryKey: [tabela] }),
  });
}

export function useRemove(tabela: TableName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.remove(tabela, id),
    // cascata pode afetar outras tabelas: invalida tudo
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Índice id → linha, para resolver referências (responsável, área, cargo…). */
export function useIndex<T extends TableName>(tabela: T) {
  const q = useList(tabela);
  const map = new Map<string, Tables[T]>();
  for (const r of q.data ?? []) map.set(r.id, r);
  return map;
}
