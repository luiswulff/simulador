import type { ProjectOrigin, ProjectStatus } from "@/lib/types";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  Ativo: "border-emeraldx/40 bg-emeraldx/10 text-emeraldx-soft",
  Homologação: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  "Em Proposta": "border-exec/40 bg-exec/10 text-exec-soft",
  Estruturação: "border-gold/40 bg-gold/10 text-gold-soft",
  Concluído: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

const STATUS_DOT: Record<ProjectStatus, string> = {
  Ativo: "bg-emeraldx",
  Homologação: "bg-amber-400",
  "Em Proposta": "bg-exec",
  Estruturação: "bg-gold",
  Concluído: "bg-slate-400",
};

const ORIGIN_STYLES: Record<ProjectOrigin, string> = {
  "EO Ícones 2026": "border-gold/35 bg-gold/[0.07] text-gold-soft",
  "Expert XP 2026": "border-exec/35 bg-exec/[0.07] text-exec-soft",
  "Parceria Estratégica": "border-violet-400/35 bg-violet-400/[0.07] text-violet-300",
  "Rotina Executiva": "border-slate-500/35 bg-slate-500/[0.07] text-slate-300",
};

export function StatusPill({ status, className = "" }: { status: ProjectStatus; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
      {status}
    </span>
  );
}

export function OriginBadge({ origin, className = "" }: { origin: ProjectOrigin; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${ORIGIN_STYLES[origin]} ${className}`}
    >
      {origin}
    </span>
  );
}

export function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border border-ink-700 bg-ink-900/70 px-2 py-0.5 text-[11px] font-medium text-slate-400 ${className}`}
    >
      {children}
    </span>
  );
}

export const statusDotClass = (status: ProjectStatus) => STATUS_DOT[status];
