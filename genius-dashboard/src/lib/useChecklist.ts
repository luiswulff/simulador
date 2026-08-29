"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectGenius } from "./types";

const STORAGE_KEY = "argos-genius:checklist:v1";

/** { [projectId]: { [texto do passo]: concluído } } — a chave é o texto do passo,
 *  então reordenar ou reescrever o GENIUS.md não embaralha o que já foi marcado. */
export type ChecklistState = Record<string, Record<string, boolean>>;

function readStorage(): ChecklistState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChecklistState) : {};
  } catch {
    return {};
  }
}

export function useChecklist(projects: ProjectGenius[]) {
  const [state, setState] = useState<ChecklistState>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota cheia ou storage bloqueado — o painel segue funcionando em memória.
    }
  }, [state, hydrated]);

  const toggle = useCallback((projectId: string, stepText: string) => {
    setState((previous) => {
      const project = { ...(previous[projectId] ?? {}) };
      project[stepText] = !project[stepText];
      return { ...previous, [projectId]: project };
    });
  }, []);

  const resetProject = useCallback((projectId: string) => {
    setState((previous) => ({ ...previous, [projectId]: {} }));
  }, []);

  const isDone = useCallback(
    (projectId: string, stepText: string, fallback = false) =>
      state[projectId]?.[stepText] ?? fallback,
    [state],
  );

  const doneSetFor = useCallback(
    (project: ProjectGenius) =>
      new Set(
        project.nextSteps
          .filter((step) => state[project.id]?.[step.text] ?? step.done)
          .map((step) => step.text),
      ),
    [state],
  );

  const progressFor = useCallback(
    (project: ProjectGenius) => {
      const total = project.nextSteps.length;
      const done = project.nextSteps.filter(
        (step) => state[project.id]?.[step.text] ?? step.done,
      ).length;
      return { done, total, pending: total - done };
    },
    [state],
  );

  const pendingTotal = useMemo(
    () => projects.reduce((sum, project) => sum + progressFor(project).pending, 0),
    [projects, progressFor],
  );

  return { hydrated, toggle, resetProject, isDone, doneSetFor, progressFor, pendingTotal };
}
