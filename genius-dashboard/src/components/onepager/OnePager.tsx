"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Copy, Printer } from "lucide-react";
import { EconomicSection, FollowUpSection, StakeholdersSection, ThesisSection } from "./sections";
import { OriginBadge, StatusPill, Tag } from "@/components/ui/badges";
import { buildShareText, formatDate } from "@/lib/format";
import type { ProjectGenius } from "@/lib/types";

const TABS = [
  { id: "tese", label: "Tese de Negócio" },
  { id: "modelo", label: "Modelo Financeiro" },
  { id: "stakeholders", label: "Stakeholders" },
  { id: "followup", label: "Follow-up" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function OnePager({
  project,
  isDone,
  onToggleStep,
  onResetSteps,
  onClose,
}: {
  project: ProjectGenius | null;
  isDone: (projectId: string, stepText: string, fallback?: boolean) => boolean;
  onToggleStep: (projectId: string, stepText: string) => void;
  onResetSteps: (projectId: string) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<TabId>("tese");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTab("tese");
    setCopied(false);
  }, [project?.id]);

  const doneSet = useMemo(() => {
    if (!project) return new Set<string>();
    return new Set(
      project.nextSteps.filter((step) => isDone(project.id, step.text, step.done)).map((step) => step.text),
    );
  }, [project, isDone]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-600">
        Selecione um projeto na lista para abrir o One-Pager executivo.
      </div>
    );
  }

  const stepState = (stepText: string, fallback: boolean) => isDone(project.id, stepText, fallback);

  const handleCopy = async () => {
    const text = buildShareText(project, doneSet);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback para navegadores sem permissão de clipboard (ex.: http em rede local).
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="flex h-full flex-col">
      {/* ---- Cabeçalho executivo ---- */}
      <div className="no-print border-b border-ink-700 bg-ink-900/60 px-6 pt-5 backdrop-blur">
        <div className="flex flex-wrap items-start gap-3">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-lg border border-ink-700 p-1.5 text-slate-400 hover:text-white lg:hidden"
              aria-label="Voltar para a lista"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : null}

          <span className="tabular mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/45 bg-gold/12 text-sm font-bold text-gold">
            {project.number}
          </span>

          <div className="min-w-[220px] flex-1">
            <h2 className="text-xl font-bold leading-tight text-white">{project.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={project.status} />
              <OriginBadge origin={project.origin} />
              <Tag>{project.vertical}</Tag>
              <span className="text-xs text-slate-500">
                Parceiro: <span className="text-slate-300">{project.partner}</span>
              </span>
              <span className="text-xs text-slate-600">· atualizado em {formatDate(project.updatedAt)}</span>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                copied
                  ? "border-emeraldx/50 bg-emeraldx/10 text-emeraldx-soft"
                  : "border-gold/45 bg-gold/10 text-gold-soft hover:bg-gold/15"
              }`}
              title="Copiar o One-Pager formatado para WhatsApp / Telegram"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copiado!" : "Copiar resumo"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-ink-600 hover:text-white"
              title="Exportar o One-Pager em PDF / impressão"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              PDF
            </button>
          </div>
        </div>

        <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" aria-label="Seções do One-Pager">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id}
              className={`relative whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                tab === item.id
                  ? "border-gold text-gold-soft"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {item.label}
              {item.id === "followup" && project.nextSteps.length ? (
                <span className="tabular ml-1.5 text-[10px] text-slate-500">
                  {doneSet.size}/{project.nextSteps.length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {/* ---- Conteúdo ---- */}
      <div className="no-print flex-1 overflow-y-auto px-6 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${project.id}-${tab}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {tab === "tese" ? <ThesisSection project={project} /> : null}
            {tab === "modelo" ? <EconomicSection project={project} /> : null}
            {tab === "stakeholders" ? <StakeholdersSection project={project} /> : null}
            {tab === "followup" ? (
              <FollowUpSection
                project={project}
                isDone={stepState}
                onToggle={(stepText) => onToggleStep(project.id, stepText)}
                onReset={() => onResetSteps(project.id)}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- Folha de impressão / PDF: One-Pager completo ---- */}
      <div className="print-sheet hidden print:block">
        <div className="mb-5 border-b border-slate-300 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
            ARGOS GENIUS · One-Pager Executivo · Projeto {project.number}
          </p>
          <h1 className="mt-1 text-2xl font-bold">{project.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {project.status} · {project.vertical} · {project.origin} · Parceiro: {project.partner}
          </p>
        </div>
        <div className="flex flex-col gap-6">
          <ThesisSection project={project} />
          <EconomicSection project={project} />
          <StakeholdersSection project={project} />
          <FollowUpSection project={project} isDone={stepState} readOnly />
        </div>
        <p className="mt-6 border-t border-slate-300 pt-3 text-[11px] text-slate-500">
          Fonte: Módulo Genius — Argos Core · atualizado em {formatDate(project.updatedAt)}
        </p>
      </div>
    </div>
  );
}
