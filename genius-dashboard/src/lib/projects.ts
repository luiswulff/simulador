import fs from "node:fs";
import path from "node:path";
import { mergeProjects, parseGeniusMarkdown } from "./genius-parser";
import type { ProjectGenius, ProjectsPayload } from "./types";

/**
 * Caminho padrão do GENIUS.md no workspace do OpenClaw/Argos. Quando o
 * dashboard roda na mesma máquina do CEO, o painel lê o arquivo original e
 * fica em sincronia com o Módulo Genius sem nenhum passo manual.
 */
const OPENCLAW_GENIUS_PATH = "/Users/luiswulff/.openclaw/workspace/GENIUS.md";

export function curatedProjectsPath(): string {
  return path.join(process.cwd(), "data", "projects.json");
}

/** Ordem de resolução do GENIUS.md: env → workspace OpenClaw → cópia local. */
export function geniusMarkdownCandidates(): string[] {
  const candidates = [
    process.env.GENIUS_MD_PATH,
    OPENCLAW_GENIUS_PATH,
    path.join(process.cwd(), "data", "GENIUS.md"),
  ];
  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

export function resolveGeniusMarkdown(): { path: string; content: string } | null {
  for (const candidate of geniusMarkdownCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        return { path: candidate, content: fs.readFileSync(candidate, "utf-8") };
      }
    } catch {
      // Caminho inacessível (permissão / rede) — segue para o próximo candidato.
    }
  }
  return null;
}

export function readCuratedProjects(): ProjectGenius[] {
  const raw = fs.readFileSync(curatedProjectsPath(), "utf-8");
  const parsed = JSON.parse(raw) as { projects: ProjectGenius[] };
  return parsed.projects;
}

/**
 * Carrega os projetos com fallback inteligente:
 * 1. GENIUS.md (env → OpenClaw → data/GENIUS.md), fundido sobre o JSON curado;
 * 2. apenas o JSON curado, caso nenhum GENIUS.md esteja acessível ou legível.
 */
export function loadProjects(): ProjectsPayload {
  const curated = readCuratedProjects();
  const syncedAt = new Date().toISOString();
  const markdown = resolveGeniusMarkdown();

  if (!markdown) {
    return {
      projects: curated,
      source: {
        kind: "projects-json",
        path: curatedProjectsPath(),
        label: "Base curada (data/projects.json)",
        syncedAt,
        warnings: ["Nenhum GENIUS.md acessível — exibindo a base curada local."],
      },
    };
  }

  try {
    const parsed = parseGeniusMarkdown(markdown.content);
    if (!parsed.projects.length) {
      throw new Error("Nenhum one-pager reconhecido no GENIUS.md.");
    }
    const merged = mergeProjects(curated, parsed.projects);
    return {
      projects: merged.projects,
      source: {
        kind: "genius-md",
        path: markdown.path,
        label: `Sincronizado com ${path.basename(markdown.path)}`,
        syncedAt,
        warnings: [...parsed.warnings, ...merged.warnings],
      },
    };
  } catch (error) {
    return {
      projects: curated,
      source: {
        kind: "projects-json",
        path: curatedProjectsPath(),
        label: "Base curada (data/projects.json)",
        syncedAt,
        warnings: [
          `Falha ao interpretar ${markdown.path}: ${error instanceof Error ? error.message : String(error)}`,
        ],
      },
    };
  }
}
