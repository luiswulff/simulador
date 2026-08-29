import type { ProjectGenius } from "./types";

export function formatCompactBRL(value: number): string {
  if (value >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1).replace(".", ",")} B`;
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} k`;
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Formata o One-Pager como texto limpo para WhatsApp / Telegram.
 * `doneSteps` reflete o checklist marcado no painel.
 */
export function buildShareText(project: ProjectGenius, doneSteps: Set<string>): string {
  const lines: string[] = [];
  lines.push(`*ARGOS GENIUS | Projeto ${project.number} — ${project.title}*`);
  lines.push(`${project.status} · ${project.vertical} · ${project.origin}`);
  lines.push(`Parceiro: ${project.partner}`);
  if (project.highlightMetric) lines.push(`Destaque: ${project.highlightMetric}`);
  lines.push("");
  lines.push("*Tese de Negócio*");
  lines.push(project.thesis);

  if (project.pillarsOrScope.length) {
    lines.push("");
    lines.push("*Escopo / Pilares*");
    for (const item of project.pillarsOrScope) lines.push(`• ${item}`);
  }

  lines.push("");
  lines.push("*Modelo Econômico*");
  lines.push(project.economicModel);

  if (project.contacts?.length) {
    lines.push("");
    lines.push("*Stakeholders*");
    for (const contact of project.contacts) lines.push(`• ${contact.name} — ${contact.info}`);
  }

  if (project.nextSteps.length) {
    lines.push("");
    lines.push("*Próximos Passos*");
    for (const step of project.nextSteps) {
      lines.push(`${doneSteps.has(step.text) ? "[x]" : "[ ]"} ${step.text}`);
    }
  }

  lines.push("");
  lines.push(`_Fonte: Módulo Genius — Argos Core · atualizado em ${formatDate(project.updatedAt)}_`);
  return lines.join("\n");
}
