import type { Acao, Status } from '../data/types';

export const STATUS: Record<Status, { label: string; cor: string }> = {
  nao_iniciado: { label: 'Não iniciado', cor: 'bg-ink-100 text-ink-700' },
  em_andamento: { label: 'Em andamento', cor: 'bg-blue-100 text-blue-800' },
  concluido: { label: 'Concluído', cor: 'bg-emerald-100 text-emerald-800' },
  pausado: { label: 'Pausado', cor: 'bg-amber-100 text-amber-800' },
  cancelado: { label: 'Cancelado', cor: 'bg-ink-200 text-ink-500 line-through' },
};

export const STATUS_OPCOES = Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }));

export function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function acaoAtrasada(a: Pick<Acao, 'prazo' | 'status'>) {
  return Boolean(a.prazo && a.prazo < hojeISO() && a.status !== 'concluido' && a.status !== 'cancelado');
}

export function fmtData(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtNum(v?: number | null, casas = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function fmtMoeda(v?: number | null) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** R$ em milhões, compacto: "R$ 12,4 mi" */
export function fmtMi(v?: number | null) {
  if (v === null || v === undefined) return '—';
  return `R$ ${fmtNum(v / 1e6, 1)} mi`;
}

export function fmtValor(v: number | null | undefined, unidade?: string | null) {
  if (v === null || v === undefined) return '—';
  const u = unidade ?? '';
  if (u === '%') return `${fmtNum(v, 1)}%`;
  if (u.startsWith('R$')) {
    const resto = u.slice(2).trim();
    return `R$ ${fmtNum(v, 1)}${resto ? ' ' + resto : ''}`;
  }
  return `${fmtNum(v, Number.isInteger(v) ? 0 : 1)}${u ? ' ' + u : ''}`;
}
