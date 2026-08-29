"use client";

import { Briefcase, CheckSquare, Handshake, Lightbulb, RefreshCw, Search, TrendingUp } from "lucide-react";
import MetricTile from "./MetricTile";
import { formatDateTime } from "@/lib/format";
import type { ProjectsPayload } from "@/lib/types";

export interface DashboardMetrics {
  total: number;
  declaredValueLabel: string;
  declaredValueHint: string;
  activeCount: number;
  activeHint: string;
  pendingLabel: string;
}

export default function TopBar({
  metrics,
  source,
  onOpenPalette,
}: {
  metrics: DashboardMetrics;
  source: ProjectsPayload["source"];
  onOpenPalette: () => void;
}) {
  const synced = source.kind === "genius-md";

  return (
    <header className="no-print sticky top-0 z-30 border-b border-ink-700 bg-ink-950/85 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 pt-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/40 bg-gradient-to-br from-gold/25 to-transparent shadow-glow">
            <Lightbulb className="h-5 w-5 text-gold" aria-hidden />
          </span>
          <div>
            <h1 className="text-[17px] font-extrabold uppercase tracking-[0.18em] text-white">
              ARGOS <span className="text-gold">GENIUS</span>
            </h1>
            <p className="text-[11px] tracking-wide text-slate-500">
              Executive Project Dashboard · Ecossistema TaxCo
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
          <button
            type="button"
            onClick={onOpenPalette}
            className="group flex w-full items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/70 px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:border-gold/40 hover:text-slate-300 sm:w-64"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="flex-1 truncate">Buscar projeto, parceiro, tese…</span>
            <kbd className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-5 pb-3 pt-3 sm:gap-3 xl:grid-cols-4">
        <MetricTile icon={Briefcase} label="Total de Projetos" value={String(metrics.total)} hint="Catalogados pelo Módulo Genius" accent="gold" />
        <MetricTile icon={TrendingUp} label="VGV / Volume Mapeado" value={metrics.declaredValueLabel} hint={metrics.declaredValueHint} accent="exec" />
        <MetricTile icon={Handshake} label="JVs & Parcerias Ativas" value={String(metrics.activeCount)} hint={metrics.activeHint} accent="emerald" />
        <MetricTile icon={CheckSquare} label="Follow-ups Pendentes" value={metrics.pendingLabel} hint="Checklist do painel (salvo neste dispositivo)" accent="slate" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-3 text-[11px] text-slate-500">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${
            synced
              ? "border-emeraldx/35 bg-emeraldx/10 text-emeraldx-soft"
              : "border-amber-400/35 bg-amber-400/10 text-amber-300"
          }`}
          title={source.path}
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          {source.label}
        </span>
        <span className="truncate" title={source.path}>
          {source.path}
        </span>
        <span>· leitura em {formatDateTime(source.syncedAt)}</span>
        {source.warnings.length ? (
          <span className="text-amber-400/80" title={source.warnings.join("\n")}>
            · {source.warnings.length} aviso(s) de sincronia
          </span>
        ) : null}
      </div>
    </header>
  );
}
