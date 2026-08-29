"use client";

import { useEffect, useRef } from "react";
import { SearchX } from "lucide-react";
import ProjectCard from "./ProjectCard";
import type { ProjectGenius } from "@/lib/types";

export default function ProjectList({
  projects,
  selectedId,
  onSelect,
  progressFor,
}: {
  projects: ProjectGenius[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  progressFor: (project: ProjectGenius) => { done: number; total: number };
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (!projects.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-500">
        <SearchX className="h-8 w-8" aria-hidden />
        <p className="text-sm">Nenhum projeto corresponde aos filtros aplicados.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5 p-4">
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectCard
            ref={project.id === selectedId ? selectedRef : undefined}
            project={project}
            selected={project.id === selectedId}
            progress={progressFor(project)}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}
