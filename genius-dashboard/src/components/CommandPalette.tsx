"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { StatusPill } from "./ui/badges";
import { matchesQuery } from "@/lib/filters";
import type { ProjectGenius } from "@/lib/types";

export default function CommandPalette({
  open,
  projects,
  onClose,
  onSelect,
}: {
  open: boolean;
  projects: ProjectGenius[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => projects.filter((project) => matchesQuery(project, query)).slice(0, 12),
    [projects, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  const commit = (id: string) => {
    onSelect(id);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => (results.length ? (value + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => (results.length ? (value - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter" && results[cursor]) {
      event.preventDefault();
      commit(results[cursor].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Busca global de projetos"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-panel animate-fade-in"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-ink-700 px-4">
          <Search className="h-4 w-4 text-slate-500" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por projeto, parceiro, vertical, tese, número…"
            className="w-full bg-transparent py-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-0"
          />
          <kbd className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            ESC
          </kbd>
        </div>

        <ul className="max-h-[52vh] overflow-y-auto p-2">
          {results.length ? (
            results.map((project, index) => (
              <li key={project.id}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => commit(project.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    index === cursor ? "bg-gold/10 ring-1 ring-inset ring-gold/35" : "hover:bg-ink-700/50"
                  }`}
                >
                  <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-600 bg-ink-900 text-[11px] font-bold text-slate-400">
                    {project.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-100">{project.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {project.partner} · {project.vertical} · {project.origin}
                    </span>
                  </span>
                  <StatusPill status={project.status} />
                  {index === cursor ? (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-8 text-center text-sm text-slate-600">Nenhum projeto encontrado.</li>
          )}
        </ul>

        <div className="flex items-center gap-4 border-t border-ink-700 px-4 py-2.5 text-[11px] text-slate-600">
          <span>↑ ↓ navegar</span>
          <span>↵ abrir One-Pager</span>
          <span className="ml-auto">{results.length} resultado(s)</span>
        </div>
      </div>
    </div>
  );
}
