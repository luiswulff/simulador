import type {
  ProjectGenius,
  ProjectOrigin,
  ProjectStatus,
  ProjectVertical,
} from "./types";

/**
 * Parser do GENIUS.md (Módulo Genius / Argos Core).
 *
 * Este arquivo é carregado tanto pelo Next.js quanto pelo script de sync
 * (`node scripts/sync-genius.ts`), então ele não pode ter nenhum import em
 * runtime — apenas `import type`, que é apagado antes da resolução de módulos.
 */

export interface ParsedProject {
  number: string;
  title: string;
  partner?: string;
  originRaw?: string;
  verticals?: string[];
  statusRaw?: string;
  thesis?: string;
  pillarsOrScope?: string[];
  economicModel?: string;
  nextSteps?: string[];
  sourceEvent?: string;
}

export interface ParseResult {
  projects: ParsedProject[];
  warnings: string[];
}

const HEADING_RE = /^#{2,4}\s+.*?PROJETO\s+(\d{1,3})\s*\|\s*(.+?)\s*$/i;
const TOP_BULLET_RE = /^\*\s+\*\*(.+?)\*\*\s*(.*)$/;
const CHILD_BULLET_RE = /^\s{2,}(?:[*-]|\d+\.)\s+(.*)$/;
const TABLE_ROW_RE = /^\|\s*\*{0,2}(\d{1,3})\*{0,2}\s*\|(.+)\|\s*$/;

function stripMd(value: string): string {
  return value
    .replace(/^\s*[*-]\s+/, "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deburr(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Extrai o contexto entre parênteses no fim do campo Parceiro/Origem. */
function splitPartnerAndEvent(raw: string): { partner: string; sourceEvent?: string } {
  const match = raw.match(/^(.*?)\s*\(([^()]*(?:Alinhamento|EO|Expert|Jantar|Onboarding|Mandato|Agosto|Julho|Maio|\d{4})[^()]*)\)\s*\.?$/i);
  if (match) {
    return { partner: stripMd(match[1]).replace(/[.,;]$/, ""), sourceEvent: stripMd(match[2]) };
  }
  return { partner: stripMd(raw).replace(/[.,;]$/, "") };
}

const PILLAR_LABELS = [
  "escopo em 2 fases",
  "escopo",
  "os 3 pilares",
  "pilares",
  "estrutura do produto",
  "parametros",
  "publico-alvo",
  "publico alvo",
  "vantagem tributaria do cliente",
];

export function normalizeStatus(raw: string | undefined): ProjectStatus | undefined {
  if (!raw) return undefined;
  const value = deburr(raw);
  if (value.includes("homologa")) return "Homologação";
  if (value.includes("proposta") || value.includes("pauta alinhada")) return "Em Proposta";
  if (value.includes("concluid") || value.includes("lancad")) return "Concluído";
  if (value.includes("estrutura")) return "Estruturação";
  if (
    value.includes("ativo") ||
    value.includes("mapead") ||
    value.includes("posicionamento") ||
    value.includes("rotina") ||
    value.includes("pipeline")
  ) {
    return "Ativo";
  }
  return undefined;
}

export function normalizeOrigin(raw: string | undefined): ProjectOrigin | undefined {
  if (!raw) return undefined;
  const value = deburr(raw);
  if (value.includes("eo icones")) return "EO Ícones 2026";
  if (value.includes("expert xp")) return "Expert XP 2026";
  if (value.includes("jantar") || value.includes("onboarding") || value.includes("cafe journal")) {
    return "Parceria Estratégica";
  }
  if (value.includes("mandato") || value.includes("rotina") || value.includes("planejamento") || value.includes("lancamento") || value.includes("eventos")) {
    return "Rotina Executiva";
  }
  return undefined;
}

export function normalizeVertical(raw: string | undefined): ProjectVertical | undefined {
  if (!raw) return undefined;
  const value = deburr(raw);
  if (value.includes("werte corporate")) return "Werte Corporate";
  if (value.includes("werte private") || value.includes("werte wealth") || value.includes("wealth")) return "Werte Private";
  if (value.includes("taxpay")) return "TaxPay";
  if (value.includes("guahyba")) return "Guahyba Vinhos";
  if (value.includes("banco fiscal")) return "Banco Fiscal";
  if (value.includes("sw ")|| value.startsWith("sw")) return "SW Advogados";
  if (value.includes("nx")) return "NX Business School";
  if (value.includes("tax group") || value.includes("dr. fiscal")) return "Tax Group";
  if (value.includes("werte")) return "Werte Private";
  return undefined;
}

/** Lê o índice geral (tabela markdown) para status / origem / vertical de cada projeto. */
function parseIndexTable(lines: string[]): Map<string, { title: string; partner: string; originRaw: string; verticalRaw: string; statusRaw: string }> {
  const rows = new Map<string, { title: string; partner: string; originRaw: string; verticalRaw: string; statusRaw: string }>();
  for (const line of lines) {
    const match = line.match(TABLE_ROW_RE);
    if (!match) continue;
    const cells = match[2].split("|").map((cell) => stripMd(cell));
    if (cells.length < 5) continue;
    rows.set(match[1].padStart(2, "0"), {
      title: cells[0],
      partner: cells[1],
      originRaw: cells[2],
      verticalRaw: cells[3],
      statusRaw: cells[4],
    });
  }
  return rows;
}

export function parseGeniusMarkdown(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/);
  const indexRows = parseIndexTable(lines);
  const projects: ParsedProject[] = [];
  const warnings: string[] = [];

  let current: ParsedProject | null = null;
  let currentLabel: string | null = null;
  const buckets = new Map<string, { label: string; value: string; children: string[] }>();

  const flush = () => {
    const project = current;
    if (!project) return;
    const get = (labels: string[]) => {
      for (const label of labels) {
        const bucket = buckets.get(label);
        if (bucket) return bucket;
      }
      return undefined;
    };

    const partnerBucket = get(["parceiro / origem", "parceiro / provedor", "parceiro"]);
    if (partnerBucket) {
      const { partner, sourceEvent } = splitPartnerAndEvent(partnerBucket.value);
      project.partner = partner;
      if (sourceEvent) project.sourceEvent = sourceEvent;
    }

    const originBucket = get(["origem"]);
    if (originBucket) {
      project.originRaw = originBucket.value.replace(/\.$/, "");
      project.sourceEvent = project.sourceEvent ?? project.originRaw;
    }

    const verticalBucket = get(["verticais envolvidas", "vertical", "verticais"]);
    if (verticalBucket) {
      project.verticals = verticalBucket.value
        .replace(/\.$/, "")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    const thesisBucket = get(["a tese de negocio", "tese de negocio", "tese"]);
    const pillars: string[] = [];
    if (thesisBucket) {
      project.thesis = thesisBucket.value;
      pillars.push(...thesisBucket.children);
    }

    for (const label of PILLAR_LABELS) {
      const bucket = buckets.get(label);
      if (!bucket) continue;
      if (bucket.value) pillars.push(`${bucket.label}: ${bucket.value}`);
      pillars.push(...bucket.children);
    }
    if (pillars.length) project.pillarsOrScope = pillars;

    const economicBucket = get([
      "modelo economico",
      "modelo economico (rebate recorrente)",
      "modelo economico do cliente",
    ]);
    if (economicBucket) {
      project.economicModel = [economicBucket.value, ...economicBucket.children].filter(Boolean).join(" ");
    }

    const nextBucket = get(["proximos passos (follow-up)", "proximos passos", "follow-up"]);
    if (nextBucket) {
      const steps = [nextBucket.value, ...nextBucket.children].filter(Boolean);
      if (steps.length) project.nextSteps = steps;
    }

    if (!project.thesis && !pillars.length) {
      warnings.push(`Projeto ${project.number}: tese não encontrada no GENIUS.md.`);
    }

    projects.push(project);
    current = null;
    currentLabel = null;
    buckets.clear();
  };

  for (const line of lines) {
    const heading = line.match(HEADING_RE);
    if (heading) {
      flush();
      current = { number: heading[1].padStart(2, "0"), title: stripMd(heading[2]) };
      continue;
    }
    if (!current) continue;

    const topBullet = line.match(TOP_BULLET_RE);
    if (topBullet) {
      const rawLabel = stripMd(topBullet[1]).replace(/:$/, "");
      currentLabel = deburr(rawLabel);
      buckets.set(currentLabel, { label: rawLabel, value: stripMd(topBullet[2]), children: [] });
      continue;
    }

    const childBullet = line.match(CHILD_BULLET_RE);
    if (childBullet && currentLabel) {
      const text = stripMd(childBullet[1]).replace(/^\*\*(.+?):\*\*/, "$1:");
      if (text) buckets.get(currentLabel)?.children.push(text);
      continue;
    }

    if (/^#{1,4}\s/.test(line) || /^---\s*$/.test(line)) {
      currentLabel = null;
    }
  }
  flush();

  // Complementa com o índice geral (parceiro / origem / vertical / status).
  for (const project of projects) {
    const row = indexRows.get(project.number);
    if (!row) {
      warnings.push(`Projeto ${project.number}: ausente no índice geral do GENIUS.md.`);
      continue;
    }
    project.statusRaw = row.statusRaw;
    project.originRaw = project.originRaw ?? row.originRaw;
    project.partner = project.partner ?? row.partner;
    if (!project.verticals?.length) {
      project.verticals = row.verticalRaw.split("/").map((item) => item.trim()).filter(Boolean);
    }
  }

  return { projects, warnings };
}

/**
 * Funde o GENIUS.md (fonte de verdade do conteúdo) sobre o JSON curado
 * (fonte de verdade da taxonomia).
 *
 * - Texto — título, parceiro, tese, pilares, modelo econômico, próximos passos —
 *   vem do GENIUS.md quando presente.
 * - Taxonomia — vertical, verticais, origem e status — vem do JSON curado para
 *   projetos já catalogados, porque os rótulos da tabela são texto livre. Projetos novos
 *   (ainda sem curadoria) usam a normalização best-effort do parser.
 */
export function mergeProjects(curated: ProjectGenius[], parsed: ParsedProject[]): { projects: ProjectGenius[]; warnings: string[] } {
  const warnings: string[] = [];
  const byNumber = new Map(curated.map((project) => [project.number, project]));
  const merged: ProjectGenius[] = [];

  for (const item of parsed) {
    const base = byNumber.get(item.number);
    if (!base) {
      const status = normalizeStatus(item.statusRaw);
      const origin = normalizeOrigin(item.originRaw);
      const vertical = normalizeVertical(item.verticals?.[0]);
      if (!status || !origin || !vertical) {
        warnings.push(
          `Projeto ${item.number} (${item.title}) é novo no GENIUS.md e não pôde ser totalmente classificado — revise a curadoria em data/projects.json.`,
        );
      }
      merged.push({
        id: `p${item.number}`,
        number: item.number,
        title: item.title,
        partner: item.partner ?? "—",
        origin: origin ?? "Rotina Executiva",
        vertical: vertical ?? "Tax Group",
        verticals: item.verticals ?? [],
        status: status ?? "Estruturação",
        summary: item.thesis ?? "",
        thesis: item.thesis ?? "",
        pillarsOrScope: item.pillarsOrScope ?? [],
        economicModel: item.economicModel ?? "A definir.",
        nextSteps: (item.nextSteps ?? []).map((text) => ({ text, done: false })),
        sourceEvent: item.sourceEvent,
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      continue;
    }

    merged.push({
      ...base,
      title: item.title || base.title,
      partner: item.partner || base.partner,
      verticals: base.verticals,
      thesis: item.thesis || base.thesis,
      pillarsOrScope: item.pillarsOrScope?.length ? item.pillarsOrScope : base.pillarsOrScope,
      economicModel: item.economicModel || base.economicModel,
      nextSteps: item.nextSteps?.length
        ? item.nextSteps.map((text) => ({ text, done: false }))
        : base.nextSteps,
      nextStepsDerived: item.nextSteps?.length ? undefined : base.nextStepsDerived,
      sourceEvent: item.sourceEvent || base.sourceEvent,
    });
    byNumber.delete(item.number);
  }

  // Projetos curados que não aparecem no GENIUS.md lido continuam na lista.
  for (const leftover of byNumber.values()) {
    warnings.push(`Projeto ${leftover.number} não foi encontrado no GENIUS.md lido — exibindo a versão curada.`);
    merged.push(leftover);
  }

  merged.sort((a, b) => a.number.localeCompare(b.number));
  return { projects: merged, warnings };
}
