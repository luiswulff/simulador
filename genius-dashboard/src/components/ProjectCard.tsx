"use client";

import { forwardRef } from "react";
import { CheckCircle2, Sparkles, UserRound } from "lucide-react";
import { OriginBadge, StatusPill, Tag } from "./ui/badges";
import type { ProjectGenius } from "@/lib/types";

interface ProjectCardProps {
  project: ProjectGenius;
  selected: boolean;
  progress: { done: number; total: number };
  onSelect: (id: string) => void;
}

const ProjectCard = forwardRef<HTMLButtonElement, ProjectCardProps>(function ProjectCard(
  { project, selected, progress, onSelect },
  ref,
) {
  const complete = progress.total > 0 && progress.done === progress.total;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(project.id)}
      aria-current={selected}
      className={`group w-full rounded-xl border p-3.5 text-left transition-all duration-150 ${
        selected
          ? "border-gold/60 bg-ink-800 shadow-glow"
          : "border-ink-700 bg-ink-800/45 hover:border-ink-600 hover:bg-ink-800/80"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`tabular mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
            selected ? "border-gold/50 bg-gold/15 text-gold" : "border-ink-700 bg-ink-900 text-slate-500"
          }`}
        >
          {project.number}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={`line-clamp-2 text-sm font-semibold leading-snug ${selected ? "text-white" : "text-slate-200 group-hover:text-white"}`}
              title={project.title}
            >
              {project.title}
            </h3>
            <StatusPill status={project.status} />
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{project.partner}</span>
          </p>

          {project.highlightMetric ? (
            <p className="tabular mt-2 inline-flex items-center gap-1.5 rounded-md border border-gold/25 bg-gold/[0.06] px-2 py-1 text-[11px] font-semibold text-gold-soft">
              <Sparkles className="h-3 w-3" aria-hidden />
              {project.highlightMetric}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Tag>{project.vertical}</Tag>
            <OriginBadge origin={project.origin} />
            {progress.total ? (
              <span
                className={`tabular ml-auto inline-flex items-center gap-1 text-[11px] font-medium ${
                  complete ? "text-emeraldx-soft" : "text-slate-500"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {progress.done}/{progress.total}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
});

export default ProjectCard;
