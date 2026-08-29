/**
 * Sincroniza data/projects.json com o GENIUS.md do Módulo Genius.
 *
 * Uso:
 *   npm run sync:genius                       # usa a ordem padrão de resolução
 *   npm run sync:genius -- --check            # não escreve, apenas relata o diff
 *   npm run sync:genius -- --file <caminho>   # aponta para um GENIUS.md específico
 *   GENIUS_MD_PATH=... npm run sync:genius
 *
 * Ordem de resolução: --file → GENIUS_MD_PATH → workspace do OpenClaw → data/GENIUS.md.
 * Rodado com o type stripping nativo do Node 22 (nenhum build necessário).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeProjects, parseGeniusMarkdown } from "../src/lib/genius-parser.ts";
import type { ProjectGenius } from "../src/lib/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPENCLAW_GENIUS_PATH = "/Users/luiswulff/.openclaw/workspace/GENIUS.md";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const fileFlagIndex = args.indexOf("--file");
const explicitFile = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined;

const candidates = [
  explicitFile,
  process.env.GENIUS_MD_PATH,
  OPENCLAW_GENIUS_PATH,
  path.join(root, "data", "GENIUS.md"),
].filter((candidate): candidate is string => Boolean(candidate));

const geniusPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!geniusPath) {
  console.error("✖ Nenhum GENIUS.md encontrado. Tentados:\n  - " + candidates.join("\n  - "));
  process.exit(1);
}

const curatedPath = path.join(root, "data", "projects.json");
const curatedFile = JSON.parse(fs.readFileSync(curatedPath, "utf-8")) as {
  meta: Record<string, string>;
  projects: ProjectGenius[];
};

const markdown = fs.readFileSync(geniusPath, "utf-8");
const parsed = parseGeniusMarkdown(markdown);
if (!parsed.projects.length) {
  console.error(`✖ Nenhum one-pager reconhecido em ${geniusPath}.`);
  process.exit(1);
}

const merged = mergeProjects(curatedFile.projects, parsed.projects);
const warnings = [...parsed.warnings, ...merged.warnings];

/** Serialização estável (chaves ordenadas) para comparar conteúdo, não ordem de chaves. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

const before = stable(curatedFile.projects);
const after = stable(merged.projects);
const changed = merged.projects.filter((project) => {
  const previous = curatedFile.projects.find((item) => item.number === project.number);
  return !previous || stable(previous) !== stable(project);
});

console.log(`GENIUS.md  : ${geniusPath}`);
console.log(`projects   : ${curatedPath}`);
console.log(`one-pagers : ${parsed.projects.length} lidos • ${merged.projects.length} após o merge`);
console.log(`alterados  : ${changed.length}${changed.length ? " → " + changed.map((p) => p.number).join(", ") : ""}`);
for (const warning of warnings) console.warn(`⚠ ${warning}`);

if (before === after) {
  console.log("✔ data/projects.json já está em dia com o GENIUS.md.");
  process.exit(0);
}

if (checkOnly) {
  console.log("ℹ --check ativo: nada foi escrito.");
  process.exit(1);
}

const output = {
  meta: {
    ...curatedFile.meta,
    syncedFrom: geniusPath,
    syncedAt: new Date().toISOString(),
  },
  projects: merged.projects,
};
fs.writeFileSync(curatedPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
console.log("✔ data/projects.json atualizado a partir do GENIUS.md.");
