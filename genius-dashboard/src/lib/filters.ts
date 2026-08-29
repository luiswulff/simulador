import type { ProjectGenius } from "./types";

export interface FilterState {
  query: string;
  verticals: string[];
  origins: string[];
  statuses: string[];
}

export const EMPTY_FILTERS: FilterState = { query: "", verticals: [], origins: [], statuses: [] };

function haystack(project: ProjectGenius): string {
  return [
    project.number,
    project.title,
    project.partner,
    project.vertical,
    project.verticals.join(" "),
    project.origin,
    project.status,
    project.highlightMetric ?? "",
    project.summary,
    project.thesis,
    project.economicModel,
    project.sourceEvent ?? "",
    project.pillarsOrScope.join(" "),
    project.nextSteps.map((step) => step.text).join(" "),
    (project.contacts ?? []).map((contact) => `${contact.name} ${contact.info}`).join(" "),
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function matchesQuery(project: ProjectGenius, query: string): boolean {
  const terms = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return true;
  const target = haystack(project);
  return terms.every((term) => target.includes(term));
}

export function applyFilters(projects: ProjectGenius[], filters: FilterState): ProjectGenius[] {
  return projects.filter((project) => {
    if (filters.verticals.length && !filters.verticals.includes(project.vertical)) return false;
    if (filters.origins.length && !filters.origins.includes(project.origin)) return false;
    if (filters.statuses.length && !filters.statuses.includes(project.status)) return false;
    return matchesQuery(project, filters.query);
  });
}

/**
 * Contadores exibidos nos chips. Cada dimensão é contada ignorando o próprio
 * filtro (as demais dimensões continuam valendo), para que o usuário veja
 * quantos itens ganharia ao marcar aquele chip.
 */
export function facetCounts(
  projects: ProjectGenius[],
  filters: FilterState,
  dimension: "vertical" | "origin" | "status",
): Record<string, number> {
  const scoped = applyFilters(projects, {
    ...filters,
    verticals: dimension === "vertical" ? [] : filters.verticals,
    origins: dimension === "origin" ? [] : filters.origins,
    statuses: dimension === "status" ? [] : filters.statuses,
  });
  const counts: Record<string, number> = {};
  for (const project of scoped) {
    const key = project[dimension];
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function hasActiveFilters(filters: FilterState): boolean {
  return Boolean(
    filters.query || filters.verticals.length || filters.origins.length || filters.statuses.length,
  );
}
