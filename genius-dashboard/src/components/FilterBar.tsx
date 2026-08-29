"use client";

import { useMemo } from "react";
import { Filter, Search, X } from "lucide-react";
import { facetCounts, hasActiveFilters, type FilterState } from "@/lib/filters";
import { ORIGINS, STATUSES, VERTICALS, type ProjectGenius } from "@/lib/types";

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function ChipGroup({
  label,
  options,
  selected,
  counts,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  counts: Record<string, number>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
      <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {options.map((option) => {
        const count = counts[option] ?? 0;
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option)}
            className={`chip shrink-0 ${active ? "chip-active" : ""} ${!active && count === 0 ? "opacity-40" : ""}`}
          >
            {option}
            <span className={`tabular text-[10px] ${active ? "text-gold" : "text-slate-500"}`}>({count})</span>
          </button>
        );
      })}
    </div>
  );
}

export default function FilterBar({
  projects,
  filters,
  onChange,
  resultCount,
}: {
  projects: ProjectGenius[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
  resultCount: number;
}) {
  const verticalCounts = useMemo(() => facetCounts(projects, filters, "vertical"), [projects, filters]);
  const originCounts = useMemo(() => facetCounts(projects, filters, "origin"), [projects, filters]);
  const statusCounts = useMemo(() => facetCounts(projects, filters, "status"), [projects, filters]);
  const active = hasActiveFilters(filters);

  return (
    <div className="no-print border-b border-ink-700 bg-ink-950/60 px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            id="genius-search"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Filtrar por projeto, parceiro, tese, número…"
            className="w-full rounded-lg border border-ink-700 bg-ink-800/70 py-2 pl-9 pr-8 text-sm text-slate-200 placeholder:text-slate-600 focus:border-gold/50"
          />
          {filters.query ? (
            <button
              type="button"
              onClick={() => onChange({ ...filters, query: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-200"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <span className="tabular inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          {resultCount} de {projects.length} projetos
        </span>

        {active ? (
          <button
            type="button"
            onClick={() => onChange({ query: "", verticals: [], origins: [], statuses: [] })}
            className="chip border-ink-600 text-slate-400 hover:text-white"
          >
            <X className="h-3 w-3" aria-hidden />
            Limpar filtros
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <ChipGroup
          label="Vertical"
          options={VERTICALS}
          selected={filters.verticals}
          counts={verticalCounts}
          onToggle={(value) => onChange({ ...filters, verticals: toggleValue(filters.verticals, value) })}
        />
        <ChipGroup
          label="Origem"
          options={ORIGINS}
          selected={filters.origins}
          counts={originCounts}
          onToggle={(value) => onChange({ ...filters, origins: toggleValue(filters.origins, value) })}
        />
        <ChipGroup
          label="Status"
          options={STATUSES}
          selected={filters.statuses}
          counts={statusCounts}
          onToggle={(value) => onChange({ ...filters, statuses: toggleValue(filters.statuses, value) })}
        />
      </div>
    </div>
  );
}
