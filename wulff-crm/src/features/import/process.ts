// Normalização, deduplicação e gravação da importação (Etapas 4–8 da Seção 9).

import { supabase } from '../../lib/supabase';
import {
  cleanSpaces, titleCaseName, isEmail, normalizeEmail, nameFromEmail,
  normalizePhone, isMobileBR, parseBirthday, normalizeState, normalizeCountry,
  fold, trigramSimilarity,
} from '../../lib/normalize';
import type { CrmFieldKey } from './mapping';

// Proteção contra registros anômalos (uma das bases reais tem uma linha com
// 800 telefones): limita valores múltiplos por contato e registra aviso.
const MAX_PHONES = 10;
const MAX_EMAILS = 10;

export interface Candidate {
  rowNumber: number;
  raw: Record<string, string>;
  name: string | null;
  emails: string[];
  phones: string[]; // normalizados
  rawPhones: string[];
  whatsapp: string | null;
  socials: { network: string; url: string }[];
  fields: Record<string, string>; // demais campos do contato
  tags: string[];
  birth: { birth_date: string | null; birth_day: number | null; birth_month: number | null };
  warnings: string[];
  valid: boolean;
  invalidReason?: string;
}

export interface DuplicateMatch {
  contactId: string;
  contactName: string;
  reason: string;
}

export type DupAction = 'ignorar' | 'criar' | 'substituir' | 'complementar' | 'mesclar';

export interface ExistingIndex {
  byEmail: Map<string, { id: string; name: string }>;
  byPhone: Map<string, { id: string; name: string }>;
  byNameCompany: Map<string, { id: string; name: string }>;
  byName: Map<string, { id: string; name: string }[]>;
  byLinkedin: Map<string, { id: string; name: string }>;
  names: { id: string; name: string; folded: string }[];
}

/** Constrói o candidato a contato a partir de uma linha + mapeamento. */
export function buildCandidate(
  raw: Record<string, string>,
  rowNumber: number,
  mapping: Record<string, CrmFieldKey>,
): Candidate {
  const warnings: string[] = [];
  const emails = new Set<string>();
  const phonesNorm: string[] = [];
  const rawPhones: string[] = [];
  const socials: { network: string; url: string }[] = [];
  const fields: Record<string, string> = {};
  const tags: string[] = [];
  let name: string | null = null;
  let given = '';
  let family = '';
  let birthdayRaw = '';
  let whatsapp: string | null = null;

  const splitMulti = (v: string) => v.split(/\s*:::\s*/).map((s) => s.trim()).filter(Boolean);

  for (const [col, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = (raw[col] ?? '').trim();
    if (!value) continue;

    switch (field) {
      case 'full_name': {
        // Nas bases reais, milhares de "Name" são na verdade e-mails.
        if (isEmail(value)) {
          emails.add(normalizeEmail(value));
          warnings.push('Nome era um e-mail; nome derivado do endereço.');
          if (!name) name = nameFromEmail(value);
        } else if (!name) {
          name = titleCaseName(value);
        }
        break;
      }
      case 'given_name':
        given = given || value;
        break;
      case 'family_name':
        family = family || value;
        break;
      case 'email':
        for (const e of splitMulti(value)) {
          if (isEmail(e)) emails.add(normalizeEmail(e));
          else warnings.push(`E-mail inválido descartado: ${e}`);
        }
        break;
      case 'phone':
      case 'whatsapp': {
        for (const p of splitMulti(value)) {
          const norm = normalizePhone(p);
          if (norm && !phonesNorm.includes(norm)) {
            if (phonesNorm.length >= MAX_PHONES) {
              if (phonesNorm.length === MAX_PHONES) warnings.push(`Contato com mais de ${MAX_PHONES} telefones; excedentes ignorados.`);
              phonesNorm.push('__overflow__');
              break;
            }
            phonesNorm.push(norm);
            rawPhones.push(p);
            if (field === 'whatsapp' && !whatsapp) whatsapp = norm;
          }
        }
        break;
      }
      case 'birthday':
        birthdayRaw = birthdayRaw || value;
        break;
      case 'linkedin':
        socials.push({ network: 'linkedin', url: value });
        break;
      case 'instagram':
        socials.push({ network: 'instagram', url: value });
        break;
      case 'facebook':
        socials.push({ network: 'facebook', url: value });
        break;
      case 'twitter':
        socials.push({ network: 'x', url: value });
        break;
      case 'website': {
        // Export real: "Website N - Value" com coluna irmã "- Type" indicando a rede.
        const typeCol = col.replace(/- value$/i, '- Type');
        const t = (raw[typeCol] ?? '').toLowerCase();
        if (t.includes('linkedin')) socials.push({ network: 'linkedin', url: value });
        else if (t.includes('instagram')) socials.push({ network: 'instagram', url: value });
        else if (t.includes('facebook')) socials.push({ network: 'facebook', url: value });
        else if (t.includes('twitter') || t === 'x') socials.push({ network: 'x', url: value });
        else fields.website = fields.website || value;
        break;
      }
      case 'tags':
        for (const g of value.split(/\s*:::\s*|;|,/)) {
          const t = cleanSpaces(g).replace(/^\*\s*/, '');
          // "myContacts" é grupo padrão do Google — não vira tag.
          if (t && !/^mycontacts$/i.test(t) && !tags.includes(t)) tags.push(t);
        }
        break;
      case 'city':
        fields.city = fields.city || cleanSpaces(value);
        break;
      case 'state':
        fields.state = fields.state || normalizeState(value);
        break;
      case 'country':
        fields.country = fields.country || normalizeCountry(value);
        break;
      default:
        fields[field] = fields[field] || value;
    }
  }

  const cleanPhones = phonesNorm.filter((p) => p !== '__overflow__');
  if (!name) {
    const assembled = cleanSpaces(`${given} ${family}`);
    if (assembled) name = titleCaseName(assembled);
    else if (emails.size > 0) {
      name = nameFromEmail(Array.from(emails)[0]);
      warnings.push('Sem nome; derivado do e-mail.');
    }
  }

  // WhatsApp: primeiro celular BR identificado
  if (!whatsapp) whatsapp = cleanPhones.find((p) => isMobileBR(p)) ?? null;

  const valid = Boolean(name || emails.size > 0 || cleanPhones.length > 0);

  return {
    rowNumber,
    raw,
    name,
    emails: Array.from(emails).slice(0, MAX_EMAILS),
    phones: cleanPhones,
    rawPhones,
    whatsapp,
    socials,
    fields,
    tags,
    birth: parseBirthday(birthdayRaw),
    warnings,
    valid,
    invalidReason: valid ? undefined : 'Linha sem nome, e-mail ou telefone.',
  };
}

/** Carrega os contatos existentes e monta índices para deduplicação. */
export async function loadExistingIndex(): Promise<ExistingIndex> {
  const idx: ExistingIndex = {
    byEmail: new Map(),
    byPhone: new Map(),
    byNameCompany: new Map(),
    byName: new Map(),
    byLinkedin: new Map(),
    names: [],
  };
  const CHUNK = 1000;
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, full_name, email, whatsapp, phone, company_name, linkedin')
      .is('deleted_at', null)
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const entry = { id: c.id, name: c.full_name };
      if (c.email) idx.byEmail.set(c.email.toLowerCase(), entry);
      for (const p of [c.phone, c.whatsapp]) {
        const norm = p ? normalizePhone(p) : null;
        if (norm) idx.byPhone.set(norm, entry);
      }
      if (c.linkedin) idx.byLinkedin.set(fold(c.linkedin), entry);
      const nameFolded = fold(c.full_name);
      if (c.company_name) idx.byNameCompany.set(`${nameFolded}|${fold(c.company_name)}`, entry);
      const list = idx.byName.get(nameFolded) ?? [];
      list.push(entry);
      idx.byName.set(nameFolded, list);
      idx.names.push({ ...entry, folded: nameFolded });
    }
    if (!data || data.length < CHUNK) break;
  }
  // e-mails e telefones adicionais
  for (let from = 0; ; from += CHUNK) {
    const { data } = await supabase.from('contact_emails').select('email, contact_id, contacts(full_name)').range(from, from + CHUNK - 1);
    for (const r of data ?? []) {
      idx.byEmail.set(r.email.toLowerCase(), { id: r.contact_id, name: (r.contacts as unknown as { full_name: string })?.full_name ?? '' });
    }
    if (!data || data.length < CHUNK) break;
  }
  for (let from = 0; ; from += CHUNK) {
    const { data } = await supabase.from('contact_phones').select('phone_normalized, contact_id, contacts(full_name)').range(from, from + CHUNK - 1);
    for (const r of data ?? []) {
      if (r.phone_normalized)
        idx.byPhone.set(r.phone_normalized, { id: r.contact_id, name: (r.contacts as unknown as { full_name: string })?.full_name ?? '' });
    }
    if (!data || data.length < CHUNK) break;
  }
  return idx;
}

/** Detecta duplicidade de um candidato contra a base existente. */
export function findDuplicate(c: Candidate, idx: ExistingIndex, fuzzy = true): DuplicateMatch | null {
  for (const e of c.emails) {
    const hit = idx.byEmail.get(e);
    if (hit) return { contactId: hit.id, contactName: hit.name, reason: `mesmo e-mail (${e})` };
  }
  for (const p of c.phones) {
    const hit = idx.byPhone.get(p);
    if (hit) return { contactId: hit.id, contactName: hit.name, reason: `mesmo telefone (${p})` };
  }
  for (const s of c.socials) {
    if (s.network === 'linkedin') {
      const hit = idx.byLinkedin.get(fold(s.url));
      if (hit) return { contactId: hit.id, contactName: hit.name, reason: 'mesmo LinkedIn' };
    }
  }
  if (c.name) {
    const nameFolded = fold(c.name);
    if (c.fields.company_name) {
      const hit = idx.byNameCompany.get(`${nameFolded}|${fold(c.fields.company_name)}`);
      if (hit) return { contactId: hit.id, contactName: hit.name, reason: 'mesmo nome + empresa' };
    }
    const sameName = idx.byName.get(nameFolded);
    if (sameName?.length) {
      return { contactId: sameName[0].id, contactName: sameName[0].name, reason: 'nome idêntico' };
    }
    if (fuzzy && nameFolded.length >= 8) {
      for (const n of idx.names) {
        if (Math.abs(n.folded.length - nameFolded.length) <= 4 && trigramSimilarity(n.folded, nameFolded) >= 0.82) {
          return { contactId: n.id, contactName: n.name, reason: 'nome muito parecido (fuzzy)' };
        }
      }
    }
  }
  return null;
}

export interface PreparedRow {
  candidate: Candidate;
  duplicate: DuplicateMatch | null;
  action: DupAction; // ação escolhida (para novos: 'criar')
}

export interface CommitProgress {
  done: number;
  total: number;
}

export interface CommitResult {
  created: number;
  updated: number;
  merged: number;
  skipped: number;
  errors: { rowNumber: number; message: string }[];
}

function candidateToContactPayload(c: Candidate, userId: string, jobId: string) {
  return {
    user_id: userId,
    full_name: c.name ?? c.emails[0] ?? c.phones[0] ?? 'Sem nome',
    email: c.emails[0] ?? null,
    phone: c.phones[0] ?? null,
    whatsapp: c.whatsapp,
    job_title: c.fields.job_title ?? null,
    company_name: c.fields.company_name ?? null,
    department: c.fields.department ?? null,
    profession: c.fields.profession ?? null,
    segment: c.fields.segment ?? null,
    city: c.fields.city ?? null,
    state: c.fields.state ?? null,
    country: c.fields.country ?? null,
    preferred_name: c.fields.preferred_name ?? null,
    linkedin: c.socials.find((s) => s.network === 'linkedin')?.url ?? null,
    instagram: c.socials.find((s) => s.network === 'instagram')?.url ?? null,
    twitter: c.socials.find((s) => s.network === 'x')?.url ?? null,
    website: c.fields.website ?? null,
    birth_date: c.birth.birth_date,
    birth_day: c.birth.birth_day,
    birth_month: c.birth.birth_month,
    observations: c.fields.observations ?? null,
    interests: c.fields.interests ?? null,
    how_we_met: c.fields.how_we_met ?? null,
    origin_context: c.fields.origin_context ?? null,
    internal_code: c.fields.internal_code ?? null,
    source: 'import',
    import_job_id: jobId,
    source_row: compactRaw(c.raw),
  };
}

// Guarda apenas os campos preenchidos da linha original (as bases reais têm
// 1.649 colunas, quase todas vazias — armazenar tudo estouraria o banco).
function compactRaw(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && v.trim()) out[k] = v;
  }
  return out;
}

async function insertRelated(c: Candidate, contactId: string, userId: string, tagCache: Map<string, string>) {
  const extraEmails = c.emails.slice(1);
  if (extraEmails.length) {
    await supabase.from('contact_emails').insert(
      extraEmails.map((e) => ({ user_id: userId, contact_id: contactId, email: e })),
    );
  }
  const extraPhones = c.phones.slice(1);
  if (extraPhones.length) {
    await supabase.from('contact_phones').insert(
      extraPhones.map((p, i) => ({
        user_id: userId,
        contact_id: contactId,
        phone: c.rawPhones[i + 1] ?? p,
        phone_normalized: p,
        is_whatsapp: p === c.whatsapp,
      })),
    );
  }
  const extraSocials = c.socials.filter((s, i) => c.socials.findIndex((x) => x.network === s.network) !== i);
  if (extraSocials.length) {
    await supabase.from('contact_social_profiles').insert(
      extraSocials.map((s) => ({ user_id: userId, contact_id: contactId, network: s.network, url: s.url })),
    );
  }
  for (const tagName of c.tags) {
    let tagId = tagCache.get(tagName.toLowerCase());
    if (!tagId) {
      const { data } = await supabase
        .from('tags')
        .upsert({ user_id: userId, name: tagName }, { onConflict: 'user_id,name' })
        .select('id')
        .single();
      if (data) {
        tagId = data.id;
        tagCache.set(tagName.toLowerCase(), tagId!);
      }
    }
    if (tagId) {
      await supabase.from('contact_tags').upsert({ contact_id: contactId, tag_id: tagId, user_id: userId });
    }
  }
}

/** Grava a importação confirmada. Incremental: nunca apaga o que já existe. */
export async function commitImport(
  rows: PreparedRow[],
  userId: string,
  jobId: string,
  onProgress: (p: CommitProgress) => void,
): Promise<CommitResult> {
  const result: CommitResult = { created: 0, updated: 0, merged: 0, skipped: 0, errors: [] };
  const tagCache = new Map<string, string>();
  const importRowRecords: Record<string, unknown>[] = [];
  let done = 0;

  // 1) Criações em lote (rápido para bases de milhares de registros)
  const toCreate = rows.filter((r) => r.action === 'criar');
  const BATCH = 200;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    const payloads = batch.map((r) => candidateToContactPayload(r.candidate, userId, jobId));
    const { data, error } = await supabase.from('contacts').insert(payloads).select('id');
    if (error) {
      // fallback: tenta um a um para isolar a linha com problema
      for (const r of batch) {
        const { data: one, error: oneErr } = await supabase
          .from('contacts')
          .insert(candidateToContactPayload(r.candidate, userId, jobId))
          .select('id')
          .single();
        if (oneErr) {
          result.errors.push({ rowNumber: r.candidate.rowNumber, message: oneErr.message });
          importRowRecords.push(rowRecord(r, userId, jobId, 'erro', oneErr.message, null));
        } else {
          result.created++;
          await insertRelated(r.candidate, one.id, userId, tagCache);
          importRowRecords.push(rowRecord(r, userId, jobId, 'criado', null, one.id));
        }
        done++;
        onProgress({ done, total: rows.length });
      }
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      const id = data![j].id as string;
      result.created++;
      await insertRelated(batch[j].candidate, id, userId, tagCache);
      importRowRecords.push(rowRecord(batch[j], userId, jobId, 'criado', null, id));
      done++;
    }
    onProgress({ done, total: rows.length });
  }

  // 2) Ações sobre duplicados
  for (const r of rows) {
    if (r.action === 'criar') continue;
    const c = r.candidate;
    try {
      if (r.action === 'ignorar' || !r.duplicate) {
        result.skipped++;
        importRowRecords.push(rowRecord(r, userId, jobId, 'ignorado', null, r.duplicate?.contactId ?? null));
      } else if (r.action === 'substituir') {
        const payload = candidateToContactPayload(c, userId, jobId);
        const { error } = await supabase.from('contacts').update(payload).eq('id', r.duplicate.contactId);
        if (error) throw new Error(error.message);
        result.updated++;
        importRowRecords.push(rowRecord(r, userId, jobId, 'atualizado', null, r.duplicate.contactId));
      } else {
        // complementar / mesclar: preenche apenas campos vazios e agrega múltiplos
        const { data: existing } = await supabase.from('contacts').select('*').eq('id', r.duplicate.contactId).single();
        if (!existing) throw new Error('Contato duplicado não encontrado.');
        const payload = candidateToContactPayload(c, userId, jobId);
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(payload)) {
          if (['user_id', 'source', 'import_job_id', 'source_row'].includes(k)) continue;
          if ((existing[k] === null || existing[k] === '') && v !== null && v !== '') patch[k] = v;
        }
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('contacts').update(patch).eq('id', r.duplicate.contactId);
          if (error) throw new Error(error.message);
        }
        await insertRelated({ ...c, emails: c.emails.filter((e) => e !== existing.email) }, r.duplicate.contactId, userId, tagCache);
        result.merged++;
        importRowRecords.push(rowRecord(r, userId, jobId, 'mesclado', null, r.duplicate.contactId));
      }
    } catch (e) {
      result.errors.push({ rowNumber: c.rowNumber, message: e instanceof Error ? e.message : String(e) });
      importRowRecords.push(rowRecord(r, userId, jobId, 'erro', e instanceof Error ? e.message : String(e), null));
    }
    done++;
    if (done % 20 === 0) onProgress({ done, total: rows.length });
  }
  onProgress({ done: rows.length, total: rows.length });

  // 3) Registra as linhas da importação (histórico/auditoria — Seção 24)
  for (let i = 0; i < importRowRecords.length; i += 500) {
    await supabase.from('import_rows').insert(importRowRecords.slice(i, i + 500));
  }

  return result;
}

function rowRecord(
  r: PreparedRow,
  userId: string,
  jobId: string,
  outcome: string,
  errorMessage: string | null,
  contactId: string | null,
) {
  return {
    user_id: userId,
    import_job_id: jobId,
    row_number: r.candidate.rowNumber,
    raw_data: compactRaw(r.candidate.raw),
    outcome,
    error_message: errorMessage,
    contact_id: contactId,
  };
}
