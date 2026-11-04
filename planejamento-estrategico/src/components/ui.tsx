import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, X, Pencil, Trash2, Plus } from 'lucide-react';
import { STATUS, acaoAtrasada } from '../lib/format';
import type { Status } from '../data/types';

export interface Migalha {
  label: string;
  to?: string;
}

export function Breadcrumbs({ itens }: { itens: Migalha[] }) {
  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-500">
      {itens.map((m, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {m.to ? (
            <Link to={m.to} className="hover:text-accent-700 hover:underline">{m.label}</Link>
          ) : (
            <span className="text-ink-700">{m.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  titulo, subtitulo, migalhas, acoes, sobretitulo,
}: { titulo: ReactNode; subtitulo?: ReactNode; migalhas?: Migalha[]; acoes?: ReactNode; sobretitulo?: ReactNode }) {
  return (
    <header className="mb-6">
      {migalhas && <Breadcrumbs itens={migalhas} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {sobretitulo && <p className="text-xs font-semibold uppercase tracking-widest text-accent-600">{sobretitulo}</p>}
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-950">{titulo}</h1>
          {subtitulo && <p className="mt-1 max-w-3xl text-sm text-ink-600">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
    </header>
  );
}

export function Secao({ titulo, acoes, children, className = '' }: { titulo: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-8 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ status, prazo }: { status: Status; prazo?: string | null }) {
  const atrasada = acaoAtrasada({ status, prazo });
  if (atrasada) return <span className="chip bg-red-100 text-red-800">Atrasado</span>;
  const s = STATUS[status] ?? STATUS.nao_iniciado;
  return <span className={`chip ${s.cor}`}>{s.label}</span>;
}

export function Progresso({ valor, compacto = false }: { valor: number | null | undefined; compacto?: boolean }) {
  const v = valor ?? 0;
  const cor = valor === null || valor === undefined ? 'bg-ink-200' : v >= 100 ? 'bg-emerald-600' : v >= 50 ? 'bg-accent-600' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2" title={valor === null || valor === undefined ? 'Sem dados' : `${v}%`}>
      <div className={`w-full overflow-hidden rounded-full bg-ink-100 ${compacto ? 'h-1.5' : 'h-2'}`}>
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(v, 100)}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-600">
        {valor === null || valor === undefined ? '—' : `${v}%`}
      </span>
    </div>
  );
}

export function Stat({ label, valor, detalhe }: { label: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink-950">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-ink-500">{detalhe}</p>}
    </div>
  );
}

/** Card clicável que leva ao próximo nível do drill-down. */
export function DrillCard({ to, children, cor }: { to: string; children: ReactNode; cor?: string | null }) {
  return (
    <Link
      to={to}
      className="card group block border-l-4 transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderLeftColor: cor ?? '#1e3a5f' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-accent-600" />
      </div>
    </Link>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">{children}</div>;
}

export function Carregando() {
  return <div className="py-16 text-center text-sm text-ink-400">Carregando…</div>;
}

export function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 sm:p-10" onMouseDown={onClose}>
      <div className={`w-full ${largo ? 'max-w-3xl' : 'max-w-xl'} rounded-2xl bg-white shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h3 className="font-bold text-ink-900">{titulo}</h3>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function BotaoNovo({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="btn-primary px-3 py-1.5 text-xs" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

export function BotoesLinha({ onEditar, onExcluir }: { onEditar?: () => void; onExcluir?: () => void }) {
  return (
    <span className="inline-flex gap-1" onClick={(e) => e.preventDefault()}>
      {onEditar && (
        <button className="btn-ghost p-1.5" title="Editar" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditar(); }}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {onExcluir && (
        <button className="btn-ghost p-1.5 hover:text-red-700" title="Excluir" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExcluir(); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

export function Texto({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{children}</p>;
}

export function Avatar({ nome, tamanho = 'md' }: { nome: string; tamanho?: 'sm' | 'md' | 'lg' }) {
  const ini = nome.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const t = { sm: 'h-7 w-7 text-[10px]', md: 'h-10 w-10 text-xs', lg: 'h-16 w-16 text-lg' }[tamanho];
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent-100 font-bold text-accent-800 ${t}`}>{ini}</span>;
}
