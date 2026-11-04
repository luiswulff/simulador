import type { Acao, Iniciativa, Indicador, IndicadorMedicao, IndicadorMeta, Objetivo } from '../data/types';

const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Progresso consolidado de baixo para cima: Ação → Iniciativa → Objetivo → Pilar. */
export function progressoIniciativa(ini: Iniciativa, acoes: Acao[]): number | null {
  const minhas = acoes.filter((a) => a.iniciativa_id === ini.id && a.status !== 'cancelado');
  if (!minhas.length) return ini.status === 'concluido' ? 100 : null;
  return media(minhas.map((a) => (a.status === 'concluido' ? 100 : a.percentual ?? 0)));
}

export function progressoObjetivo(obj: Objetivo, inis: Iniciativa[], acoes: Acao[]): number | null {
  const ps = inis
    .filter((i) => i.objetivo_id === obj.id && i.status !== 'cancelado')
    .map((i) => progressoIniciativa(i, acoes))
    .filter((p): p is number => p !== null);
  return media(ps);
}

export function progressoPilar(pilarId: string, objs: Objetivo[], inis: Iniciativa[], acoes: Acao[]) {
  const ps = objs
    .filter((o) => o.pilar_id === pilarId)
    .map((o) => progressoObjetivo(o, inis, acoes))
    .filter((p): p is number => p !== null);
  return media(ps);
}

/** Atingimento da meta do ano (0–100+), usando a medição mais recente do ano. */
export function atingimento(ind: Indicador, metas: IndicadorMeta[], medicoes: IndicadorMedicao[], ano: number) {
  const meta = metas.find((m) => m.indicador_id === ind.id && m.ano === ano)?.meta;
  const ultima = medicoes
    .filter((m) => m.indicador_id === ind.id && m.data_ref.startsWith(String(ano)))
    .sort((a, b) => b.data_ref.localeCompare(a.data_ref))[0];
  if (meta === undefined || !ultima) return { meta, valor: ultima?.valor, pct: null as number | null };
  const pct = ind.polaridade === 'menor' ? (meta / ultima.valor) * 100 : (ultima.valor / meta) * 100;
  return { meta, valor: ultima.valor, pct: Math.round(pct) };
}
