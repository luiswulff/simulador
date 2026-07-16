import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  fileType: 'csv' | 'xlsx' | 'json' | 'vcf';
  encodingNote?: string;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(file);
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsx(file);
  if (name.endsWith('.json')) return parseJson(file);
  if (name.endsWith('.vcf') || name.endsWith('.vcard')) return parseVcf(file);
  throw new Error('Formato não suportado. Use CSV, XLSX, JSON ou VCF.');
}

function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        if (headers.length === 0) {
          reject(new Error('Não foi possível identificar o cabeçalho do CSV.'));
          return;
        }
        resolve({
          headers,
          rows: res.data,
          fileType: 'csv',
          encodingNote: res.errors.length ? `${res.errors.length} linha(s) com problemas de leitura` : undefined,
        });
      },
      error: (err) => reject(new Error(`Falha ao ler o CSV: ${err.message}`)),
    });
  });
}

async function parseXlsx(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('A planilha está vazia.');
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (json.length === 0) throw new Error('Nenhuma linha de dados encontrada na planilha.');
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k.trim()] = String(v ?? '').trim();
    return out;
  });
  return { headers: Object.keys(rows[0]), rows, fileType: 'xlsx' };
}

async function parseJson(file: File): Promise<ParsedFile> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const arr = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as Record<string, unknown>).contacts)
      ? ((data as Record<string, unknown>).contacts as unknown[])
      : null;
  if (!arr || arr.length === 0) throw new Error('O JSON deve conter uma lista de contatos (array ou campo "contacts").');
  const rows = arr.map((item) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      out[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    }
    return out;
  });
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return { headers, rows, fileType: 'json' };
}

// ---------------------------------------------------------------------------
// Parser de vCard (VCF) — implementação própria e robusta para os formatos
// exportados por iPhone, Android e Google Contacts:
//  - dobra de linhas (RFC 6350: continuação com espaço/tab);
//  - parâmetros TYPE=CELL / type=HOME etc.;
//  - QUOTED-PRINTABLE (exports antigos de Android) e CHARSET=UTF-8;
//  - múltiplos TEL/EMAIL/URL por cartão.
// ---------------------------------------------------------------------------
async function parseVcf(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/\r/g, '');
  const lines = unfolded.split('\n');
  const cards: Record<string, string>[] = [];
  let current: Record<string, string[]> | null = null;

  const push = (obj: Record<string, string[]>, key: string, value: string) => {
    if (!value) return;
    (obj[key] ??= []).push(value);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD/i.test(line)) {
      current = {};
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      if (current) {
        const flat: Record<string, string> = {};
        for (const [k, vals] of Object.entries(current)) {
          vals.forEach((v, i) => {
            flat[i === 0 ? k : `${k} ${i + 1}`] = v;
          });
        }
        if (Object.keys(flat).length) cards.push(flat);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    let lhs = line.slice(0, colon);
    let value = line.slice(colon + 1);

    // remove grupo (item1.TEL → TEL)
    lhs = lhs.replace(/^[^.;:]+\./, '');
    const [propRaw, ...paramParts] = lhs.split(';');
    const prop = propRaw.toUpperCase();
    const params = paramParts.join(';').toUpperCase();

    if (params.includes('QUOTED-PRINTABLE')) value = decodeQuotedPrintable(value);
    value = value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
    if (!value) continue;

    switch (prop) {
      case 'FN':
        push(current, 'Nome completo', value);
        break;
      case 'N': {
        const [family, given, middle] = value.split(';');
        const assembled = [given, middle, family].filter(Boolean).join(' ').trim();
        if (assembled) push(current, 'Nome (N)', assembled);
        break;
      }
      case 'ORG':
        push(current, 'Empresa', value.split(';')[0]);
        break;
      case 'TITLE':
        push(current, 'Cargo', value);
        break;
      case 'TEL': {
        const label = params.includes('CELL') ? 'Celular' : params.includes('WORK') ? 'Telefone comercial' : 'Telefone';
        push(current, label, value);
        break;
      }
      case 'EMAIL':
        push(current, 'E-mail', value);
        break;
      case 'BDAY':
        push(current, 'Aniversário', value);
        break;
      case 'ADR': {
        const parts = value.split(';');
        // ADR: pobox;ext;street;city;region;postal;country
        if (parts[3]) push(current, 'Cidade', parts[3]);
        if (parts[4]) push(current, 'Estado', parts[4]);
        if (parts[6]) push(current, 'País', parts[6]);
        break;
      }
      case 'URL':
        push(current, 'Site', value);
        break;
      case 'NOTE':
        push(current, 'Observações', value);
        break;
      case 'X-SOCIALPROFILE': {
        const net = params.includes('LINKEDIN') ? 'LinkedIn' : params.includes('INSTAGRAM') ? 'Instagram' : 'Rede social';
        push(current, net, value);
        break;
      }
      default:
        break;
    }
  }

  if (cards.length === 0) throw new Error('Nenhum cartão vCard válido encontrado no arquivo.');
  const headers = Array.from(new Set(cards.flatMap((c) => Object.keys(c))));
  const rows = cards.map((c) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = c[h] ?? '';
    return out;
  });
  return { headers, rows, fileType: 'vcf' };
}

function decodeQuotedPrintable(s: string): string {
  try {
    const bytes: number[] = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === '=' && /[0-9A-Fa-f]{2}/.test(s.slice(i + 1, i + 3))) {
        bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
        i += 3;
      } else {
        bytes.push(s.charCodeAt(i));
        i += 1;
      }
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}
