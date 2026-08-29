"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CommandPalette from "./CommandPalette";
import FilterBar from "./FilterBar";
import OnePager from "./onepager/OnePager";
import ProjectList from "./ProjectList";
import TopBar, { type DashboardMetrics } from "./TopBar";
import { applyFilters, EMPTY_FILTERS, type FilterState } from "@/lib/filters";
import { formatCompactBRL } from "@/lib/format";
import { useChecklist } from "@/lib/useChecklist";
import type { ProjectsPayload } from "@/lib/types";

export default function DashboardShell({ payload }: { payload: ProjectsPayload }) {
  const projects = payload.projects;
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(projects[0]?.id ?? null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [detailOpenOnMobile, setDetailOpenOnMobile] = useState(false);

  const { hydrated, toggle, resetProject, isDone, progressFor, pendingTotal } = useChecklist(projects);

  const filtered = useMemo(() => applyFilters(projects, filters), [projects, filters]);
  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );

  // Mantém a seleção coerente com a lista filtrada.
  useEffect(() => {
    if (!filtered.length) return;
    if (!filtered.some((project) => project.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setDetailOpenOnMobile(true);
      // A busca global tem prioridade sobre os filtros: se o projeto escolhido
      // está fora do recorte atual, os filtros são limpos para não perder a seleção.
      setFilters((current) => {
        const project = projects.find((item) => item.id === id);
        if (!project) return current;
        return applyFilters([project], current).length ? current : EMPTY_FILTERS;
      });
    },
    [projects],
  );

  // Atalhos globais: ⌘K / Ctrl+K abre a busca, "/" foca o filtro, Esc fecha.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.getElementById("genius-search")?.focus();
        return;
      }
      if (event.key === "Escape") {
        setDetailOpenOnMobile(false);
        return;
      }
      if (typing || paletteOpen || !filtered.length) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const index = filtered.findIndex((project) => project.id === selectedId);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (index + delta + filtered.length) % filtered.length;
        setSelectedId(filtered[next].id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, selectedId, paletteOpen]);

  const metrics: DashboardMetrics = useMemo(() => {
    const declared = projects.filter((project) => project.declaredValueBRL);
    const declaredSum = declared.reduce((sum, project) => sum + (project.declaredValueBRL ?? 0), 0);
    const active = projects.filter((project) => project.status === "Ativo");
    const homologation = projects.filter((project) => project.status === "Homologação").length;

    return {
      total: projects.length,
      declaredValueLabel: declaredSum ? formatCompactBRL(declaredSum) : "—",
      declaredValueHint: declared.length
        ? `${declared.length} projeto(s) com volume declarado no GENIUS.md`
        : "Nenhum volume declarado nos one-pagers",
      activeCount: active.length,
      activeHint: `${homologation} em homologação · ${projects.filter((p) => p.status === "Em Proposta").length} em proposta`,
      pendingLabel: hydrated ? String(pendingTotal) : "—",
    };
  }, [projects, hydrated, pendingTotal]);

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <TopBar metrics={metrics} source={payload.source} onOpenPalette={() => setPaletteOpen(true)} />
      <FilterBar projects={projects} filters={filters} onChange={setFilters} resultCount={filtered.length} />

      <main className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(340px,420px)_1fr]">
        <section
          className="no-print min-w-0 border-r border-ink-700 bg-ink-950/40 lg:min-h-0 lg:overflow-y-auto"
          aria-label="Lista de projetos"
        >
          <ProjectList
            projects={filtered}
            selectedId={selectedId}
            onSelect={select}
            progressFor={progressFor}
          />
        </section>

        <section
          className={`min-w-0 bg-ink-900/25 max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:bg-ink-950 lg:min-h-0 ${
            detailOpenOnMobile ? "max-lg:block" : "max-lg:hidden"
          }`}
          aria-label="One-Pager executivo"
        >
          <OnePager
            project={selected}
            isDone={isDone}
            onToggleStep={toggle}
            onResetSteps={resetProject}
            onClose={() => setDetailOpenOnMobile(false)}
          />
        </section>
      </main>

      <CommandPalette
        open={paletteOpen}
        projects={projects}
        onClose={() => setPaletteOpen(false)}
        onSelect={select}
      />
    </div>
  );
}
