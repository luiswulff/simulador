// Normalização de dados — calibrada com as 4 bases reais analisadas
// (export Google Contacts/Mesh: telefones +55 E.164 e variantes, datas
// ISO yyyy-mm-dd e "--MM-DD" sem ano, nomes contendo e-mails, etc.)

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'della', 'van', 'von', 'la', 'le']);

export function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function titleCaseName(raw: string): string {
  const s = cleanSpaces(raw);
  if (!s) return s;
  // Preserva siglas já em maiúsculas com 2-4 letras? Mantém simples: title case, exceto partículas.
  return s
    .split(' ')
    .map((w, i) => {
      const lower = w.toLocaleLowerCase('pt-BR');
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join(' ');
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** Deriva um nome legível do local-part de um e-mail (joao.silva → Joao Silva). */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return titleCaseName(local.replace(/[._\-+]+/g, ' ')) || email;
}

/**
 * Normaliza telefone para E.164 com heurística Brasil (+55).
 * Formatos reais encontrados nas bases: +5551999999999, 5551999999999,
 * 051999999999, (51) 99999-9999, 00495112345678 etc.
 */
export function normalizePhone(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return null;
  const hadPlus = raw.trim().startsWith('+');
  if (d.startsWith('00')) d = d.slice(2); // prefixo internacional 00
  if (hadPlus) return '+' + d;
  // remove zero de operadora/DDD à esquerda (0XX...)
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return '+' + d;
  if (d.length === 10 || d.length === 11) return '+55' + d; // DDD + número nacional
  if (d.length === 8 || d.length === 9) return d; // sem DDD: mantém dígitos para matching parcial
  return '+' + d; // internacional sem '+'
}

export function isMobileBR(normalized: string | null): boolean {
  if (!normalized) return false;
  const m = normalized.match(/^\+55(\d{2})(\d{8,9})$/);
  return Boolean(m && m[2].length === 9 && m[2].startsWith('9'));
}

export function waLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

/**
 * Interpreta datas de nascimento nos formatos reais das bases:
 * "1975-03-21" (ISO), "--03-21" (sem ano, padrão Google), "3-21-99",
 * além de dd/mm/aaaa e dd/mm.
 */
export function parseBirthday(raw: string): {
  birth_date: string | null;
  birth_day: number | null;
  birth_month: number | null;
} {
  const s = (raw || '').trim();
  const empty = { birth_date: null, birth_day: null, birth_month: null };
  if (!s) return empty;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return { birth_date: `${y}-${pad(mo)}-${pad(d)}`, birth_day: +d, birth_month: +mo };
  }
  m = s.match(/^--(\d{1,2})-(\d{1,2})$/);
  if (m) return { birth_date: null, birth_day: +m[2], birth_month: +m[1] };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { birth_date: `${m[3]}-${pad(m[2])}-${pad(m[1])}`, birth_day: +m[1], birth_month: +m[2] };
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { birth_date: null, birth_day: +m[1], birth_month: +m[2] };
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/); // M-D-YY (encontrado nas bases)
  if (m) {
    const yy = +m[3];
    const year = yy > 30 ? 1900 + yy : 2000 + yy;
    return { birth_date: `${year}-${pad(m[1])}-${pad(m[2])}`, birth_day: +m[2], birth_month: +m[1] };
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return {
      birth_date: dt.toISOString().slice(0, 10),
      birth_day: dt.getUTCDate(),
      birth_month: dt.getUTCMonth() + 1,
    };
  }
  return empty;
}

function pad(n: string | number): string {
  return String(n).padStart(2, '0');
}

/** Remove acentos e baixa caixa — para busca e comparação fuzzy. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Similaridade 0..1 por trigramas — usada na detecção fuzzy de duplicados. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(fold(a));
  const tb = trigrams(fold(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

const UF_MAP: Record<string, string> = {
  'rio grande do sul': 'RS', 'sao paulo': 'SP', 'rio de janeiro': 'RJ',
  'minas gerais': 'MG', 'parana': 'PR', 'santa catarina': 'SC', 'bahia': 'BA',
  'pernambuco': 'PE', 'ceara': 'CE', 'goias': 'GO', 'distrito federal': 'DF',
  'espirito santo': 'ES', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'amazonas': 'AM', 'para': 'PA', 'maranhao': 'MA', 'paraiba': 'PB',
  'rio grande do norte': 'RN', 'alagoas': 'AL', 'sergipe': 'SE', 'piaui': 'PI',
  'tocantins': 'TO', 'rondonia': 'RO', 'roraima': 'RR', 'acre': 'AC', 'amapa': 'AP',
};

export function normalizeState(raw: string): string {
  const s = cleanSpaces(raw);
  if (!s) return s;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return UF_MAP[fold(s)] ?? s;
}

const COUNTRY_MAP: Record<string, string> = {
  brasil: 'Brasil', brazil: 'Brasil', br: 'Brasil',
  'estados unidos': 'Estados Unidos', usa: 'Estados Unidos', 'united states': 'Estados Unidos', us: 'Estados Unidos', eua: 'Estados Unidos',
  argentina: 'Argentina', chile: 'Chile', uruguai: 'Uruguai', uruguay: 'Uruguai',
  portugal: 'Portugal', espanha: 'Espanha', spain: 'Espanha',
  alemanha: 'Alemanha', germany: 'Alemanha', deutschland: 'Alemanha',
  franca: 'França', france: 'França', italia: 'Itália', italy: 'Itália',
  'reino unido': 'Reino Unido', uk: 'Reino Unido', 'united kingdom': 'Reino Unido', inglaterra: 'Reino Unido',
};

export function normalizeCountry(raw: string): string {
  const s = cleanSpaces(raw);
  if (!s) return s;
  return COUNTRY_MAP[fold(s)] ?? titleCaseName(s);
}

/** Separa "Nome Sobrenome" em partes quando não vierem separadas. */
export function splitName(full: string): { given: string; family: string } {
  const parts = cleanSpaces(full).split(' ');
  if (parts.length <= 1) return { given: full, family: '' };
  return { given: parts[0], family: parts.slice(1).join(' ') };
}
