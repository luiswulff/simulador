import { useList } from './hooks';

/** Ciclo de planejamento ativo (hoje: 2027–2030). Preparado para ciclos futuros. */
export function useCiclo() {
  const q = useList('pe_ciclos');
  const ciclo = (q.data ?? []).find((c) => c.status === 'ativo') ?? q.data?.[0];
  const anos = ciclo ? Array.from({ length: ciclo.ano_fim - ciclo.ano_inicio + 1 }, (_, i) => ciclo.ano_inicio + i) : [];
  const atual = new Date().getFullYear();
  const anoRef = ciclo ? Math.min(Math.max(atual, ciclo.ano_inicio), ciclo.ano_fim) : atual;
  return { ciclo, anos, anoRef, carregando: q.isLoading };
}
