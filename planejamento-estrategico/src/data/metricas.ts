/**
 * Indicadores com valores CALCULADOS já resolvidos.
 * Para cada indicador com `formula`, gera linha de base, metas por ano e uma
 * "medição" sintética do ano (a partir das últimas medições dos indicadores
 * referenciados). As telas usam este hook em vez de ler as tabelas direto,
 * para que lançados e calculados se comportem igual.
 */
import { useMemo } from 'react';
import { useList } from './hooks';
import { useCiclo } from './ciclo';
import { avaliar } from '../lib/formula';
import type { Indicador, IndicadorMedicao, IndicadorMeta } from './types';

export interface Metricas {
  inds: Indicador[];
  metas: IndicadorMeta[];
  meds: IndicadorMedicao[];
  erros: Map<string, string>;
  carregando: boolean;
}

export function useMetricas(): Metricas {
  const qi = useList('pe_indicadores');
  const qm = useList('pe_indicador_metas');
  const qd = useList('pe_indicador_medicoes');
  const { anos } = useCiclo();

  return useMemo(() => {
    const brutos = qi.data ?? [];
    const metasBase = qm.data ?? [];
    const medsBase = qd.data ?? [];
    const erros = new Map<string, string>();
    const porCodigo = new Map(brutos.filter((i) => i.codigo).map((i) => [i.codigo!.toLowerCase(), i]));

    const ultimaMed = (indId: string, ano: number) =>
      medsBase.filter((m) => m.indicador_id === indId && m.data_ref.startsWith(String(ano)))
        .sort((a, b) => b.data_ref.localeCompare(a.data_ref))[0];

    // Resolução recursiva com memória (calculado pode depender de outro calculado)
    type Chave = string; // `${codigo}|${periodo}` periodo = 'base' | 'meta:2027' | 'real:2027'
    const memo = new Map<Chave, number | null>();
    const resolver = (codigo: string, periodo: string, pilha: string[] = []): number | null => {
      const k = `${codigo}|${periodo}`;
      if (memo.has(k)) return memo.get(k)!;
      const ind = porCodigo.get(codigo);
      if (!ind) { memo.set(k, null); return null; }
      if (pilha.includes(codigo)) throw new Error(`Referência circular: ${[...pilha, codigo].join(' → ')}`);
      let v: number | null;
      if (ind.formula) {
        v = avaliar(ind.formula, (c) => resolver(c, periodo, [...pilha, codigo]));
      } else if (periodo === 'base') {
        v = ind.linha_base ?? null;
      } else {
        const [tipo, a] = periodo.split(':');
        const ano = Number(a);
        v = tipo === 'meta'
          ? metasBase.find((m) => m.indicador_id === ind.id && m.ano === ano)?.meta ?? null
          : ultimaMed(ind.id, ano)?.valor ?? null;
      }
      memo.set(k, v);
      return v;
    };

    const inds: Indicador[] = [];
    const metas: IndicadorMeta[] = metasBase.filter((m) => !brutos.find((i) => i.id === m.indicador_id)?.formula);
    const meds: IndicadorMedicao[] = medsBase.filter((m) => !brutos.find((i) => i.id === m.indicador_id)?.formula);

    for (const ind of brutos) {
      if (!ind.formula) { inds.push(ind); continue; }
      try {
        const cod = ind.codigo?.toLowerCase() ?? `__${ind.id}`;
        if (!ind.codigo) porCodigo.set(cod, ind);
        inds.push({ ...ind, linha_base: resolver(cod, 'base') });
        for (const ano of anos) {
          const meta = resolver(cod, `meta:${ano}`);
          if (meta !== null) metas.push({ id: `calc-${ind.id}-${ano}`, indicador_id: ind.id, ano, meta });
          const real = resolver(cod, `real:${ano}`);
          if (real !== null) meds.push({ id: `calc-${ind.id}-r${ano}`, indicador_id: ind.id, data_ref: `${ano}-12-31`, valor: real, comentario: 'Calculado pela fórmula' });
        }
      } catch (e) {
        erros.set(ind.id, e instanceof Error ? e.message : 'Erro na fórmula');
        inds.push({ ...ind, linha_base: null });
      }
    }
    return { inds, metas, meds, erros, carregando: qi.isLoading || qm.isLoading || qd.isLoading };
  }, [qi.data, qm.data, qd.data, anos.join(',')]);
}

/** Agrupa preservando a ordem de exibição. */
export function agrupar(inds: Indicador[]) {
  const grupos = new Map<string, Indicador[]>();
  for (const i of [...inds].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) {
    const g = i.grupo || 'Outros indicadores';
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(i);
  }
  return [...grupos.entries()];
}

/** Crescimento anual composto entre dois valores. */
export function cagr(inicio: number | null | undefined, fim: number | null | undefined, anos: number) {
  if (!inicio || fim === null || fim === undefined || inicio <= 0 || fim <= 0 || anos <= 0) return null;
  return (Math.pow(fim / inicio, 1 / anos) - 1) * 100;
}
