"use client";

import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Circle,
  Coins,
  Quote,
  RotateCcw,
  Target,
  UserRound,
} from "lucide-react";
import { OriginBadge, Tag } from "@/components/ui/badges";
import { formatCompactBRL, formatDate } from "@/lib/format";
import type { ProjectGenius } from "@/lib/types";

export function SectionTitle({ icon: Icon, children }: { icon: typeof Target; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
      <Icon className="h-3.5 w-3.5 text-gold" aria-hidden />
      {children}
    </h3>
  );
}

export function ThesisSection({ project }: { project: ProjectGenius }) {
  return (
    <section>
      <SectionTitle icon={Quote}>Tese de Negócio &amp; Pitch</SectionTitle>

      <blockquote className="panel border-l-2 border-l-gold bg-gradient-to-r from-gold/[0.07] to-transparent p-4">
        <p className="text-[15px] leading-relaxed text-slate-100">{project.thesis}</p>
      </blockquote>

      {project.summary && project.summary !== project.thesis ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{project.summary}</p>
      ) : null}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <ImpactCard label="Destaque" value={project.highlightMetric ?? "—"} />
        <ImpactCard label="Vertical" value={project.vertical} />
        <ImpactCard label="Origem" value={project.sourceEvent ?? project.origin} />
      </div>

      {project.pillarsOrScope.length ? (
        <div className="mt-6">
          <SectionTitle icon={Target}>Escopo &amp; Pilares</SectionTitle>
          <ol className="flex flex-col gap-2.5">
            {project.pillarsOrScope.map((item, index) => (
              <li key={item} className="panel flex gap-3 p-3.5">
                <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-exec/35 bg-exec/10 text-[11px] font-bold text-exec-soft">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed text-slate-300">{item}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function ImpactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="tabular mt-1 text-sm font-semibold leading-snug text-slate-100">{value}</p>
    </div>
  );
}

export function EconomicSection({ project }: { project: ProjectGenius }) {
  return (
    <section>
      <SectionTitle icon={Coins}>Modelo Econômico</SectionTitle>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {project.highlightMetric ? (
          <div className="panel border-gold/35 bg-gold/[0.07] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold/80">Métrica de destaque</p>
            <p className="tabular mt-1 text-xl font-bold leading-tight text-gold-soft">{project.highlightMetric}</p>
          </div>
        ) : null}

        {project.declaredValueBRL ? (
          <div className="panel border-exec/35 bg-exec/[0.07] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-exec-soft/80">Volume declarado</p>
            <p className="tabular mt-1 text-xl font-bold leading-tight text-exec-soft">
              {formatCompactBRL(project.declaredValueBRL)}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">{project.declaredValueLabel}</p>
          </div>
        ) : null}
      </div>

      <div className="panel mt-2.5 p-4">
        <p className="text-sm leading-relaxed text-slate-300">{project.economicModel}</p>
      </div>
    </section>
  );
}

export function StakeholdersSection({ project }: { project: ProjectGenius }) {
  return (
    <section>
      <SectionTitle icon={UserRound}>Stakeholders &amp; Parceiros</SectionTitle>

      <div className="panel p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Parceiro / Provedor</p>
        <p className="mt-1 text-sm font-semibold text-slate-100">{project.partner}</p>
      </div>

      {project.contacts?.length ? (
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {project.contacts.map((contact) => (
            <li key={`${contact.name}-${contact.info}`} className="panel flex items-start gap-3 p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-900 text-xs font-bold text-gold">
                {contact.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-100">{contact.name}</p>
                <p className="text-xs leading-relaxed text-slate-400">{contact.info}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5">
        <SectionTitle icon={Building2}>Verticais Envolvidas</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {project.verticals.map((vertical) => (
            <Tag key={vertical}>{vertical}</Tag>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <SectionTitle icon={CalendarClock}>Origem &amp; Captura</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <OriginBadge origin={project.origin} />
          {project.sourceEvent ? <Tag>{project.sourceEvent}</Tag> : null}
          <Tag>Atualizado em {formatDate(project.updatedAt)}</Tag>
        </div>
      </div>
    </section>
  );
}

export function FollowUpSection({
  project,
  isDone,
  onToggle,
  onReset,
  readOnly = false,
}: {
  project: ProjectGenius;
  isDone: (stepText: string, fallback: boolean) => boolean;
  onToggle?: (stepText: string) => void;
  onReset?: () => void;
  readOnly?: boolean;
}) {
  const total = project.nextSteps.length;
  const done = project.nextSteps.filter((step) => isDone(step.text, step.done)).length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionTitle icon={CheckCircle2}>Próximos Passos &amp; Follow-up</SectionTitle>
        {!readOnly && onReset && done > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="no-print -mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-200"
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Reabrir todos
          </button>
        ) : null}
      </div>

      {total ? (
        <>
          <div className="mb-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emeraldx to-emeraldx-soft transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="tabular text-xs font-semibold text-slate-400">
              {done}/{total}
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {project.nextSteps.map((step) => {
              const checked = isDone(step.text, step.done);
              const content = (
                <>
                  {checked ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emeraldx" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                  )}
                  <span className={`text-sm leading-relaxed ${checked ? "text-slate-500 line-through" : "text-slate-300"}`}>
                    {step.text}
                  </span>
                </>
              );

              if (readOnly) {
                return (
                  <li key={step.text} className="panel flex items-start gap-3 p-3.5">
                    {content}
                  </li>
                );
              }

              return (
                <li key={step.text}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => onToggle?.(step.text)}
                    className="panel flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:border-ink-600 hover:bg-ink-800"
                  >
                    {content}
                  </button>
                </li>
              );
            })}
          </ul>

          {project.nextStepsDerived ? (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-400/70">
              Passos derivados da tese registrada no GENIUS.md — este one-pager ainda não traz um bloco
              “Próximos Passos” explícito. Revise antes de cobrar a entrega.
            </p>
          ) : null}

          <p className="mt-2 text-[11px] text-slate-600">
            O checklist é salvo neste dispositivo (localStorage) — não altera o GENIUS.md.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500">Nenhum próximo passo registrado para este projeto.</p>
      )}
    </section>
  );
}
