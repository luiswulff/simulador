import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import type { Contact } from '../../types/db';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRows(rows: Record<string, unknown>[], format: ExportFormat, baseName: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    download(
      new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }),
      `${baseName}-${stamp}.json`,
    );
  } else if (format === 'csv') {
    const csv = Papa.unparse(rows);
    download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${baseName}-${stamp}.csv`);
  } else {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, baseName.slice(0, 31));
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    download(new Blob([out], { type: 'application/octet-stream' }), `${baseName}-${stamp}.xlsx`);
  }
}

export async function exportContacts(rowsPromise: Promise<Contact[]> | Contact[], format: ExportFormat) {
  const rows = await rowsPromise;
  const flat = rows.map((c) => ({
    nome_completo: c.full_name,
    nome_preferencial: c.preferred_name,
    cargo: c.job_title,
    empresa: c.company_name,
    email: c.email,
    telefone: c.phone,
    whatsapp: c.whatsapp,
    linkedin: c.linkedin,
    instagram: c.instagram,
    site: c.website,
    cidade: c.city,
    estado: c.state,
    pais: c.country,
    aniversario: c.birth_date ?? (c.birth_day && c.birth_month ? `${c.birth_day}/${c.birth_month}` : null),
    grau_relacionamento: c.closeness,
    status: c.relationship_status,
    importancia: c.importance,
    influencia: c.influence,
    potencial_comercial: c.business_potential,
    como_conheci: c.how_we_met,
    quem_apresentou: c.introduced_by,
    origem_contexto: c.origin_context,
    ultimo_contato: c.last_interaction_at,
    proximo_contato: c.next_contact_date,
    interesses: c.interests,
    observacoes: c.observations,
    origem_cadastro: c.source,
    criado_em: c.created_at,
  }));
  exportRows(flat, format, 'contatos');
}

const BACKUP_TABLES = [
  'categories', 'companies', 'contacts', 'contact_emails', 'contact_phones',
  'contact_social_profiles', 'contact_companies', 'contact_categories', 'tags',
  'contact_tags', 'interactions', 'reminders', 'notes', 'relationships',
  'events', 'contact_events', 'attachments', 'import_jobs', 'import_rows',
  'merge_history', 'saved_filters', 'custom_fields', 'custom_field_values',
] as const;

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const CHUNK = 1000;
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + CHUNK - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < CHUNK) break;
  }
  return out;
}

// Backup completo em JSON — restaurável pela própria aplicação (Seção 20).
export async function generateBackup(onProgress?: (msg: string) => void): Promise<void> {
  const backup: Record<string, unknown> = {
    app: 'wulff-relationship-crm',
    version: 1,
    generated_at: new Date().toISOString(),
  };
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of BACKUP_TABLES) {
    onProgress?.(`Exportando ${t}…`);
    tables[t] = await fetchAll(t);
  }
  backup.tables = tables;
  download(
    new Blob([JSON.stringify(backup)], { type: 'application/json' }),
    `wulff-crm-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
}

export interface RestoreResult {
  restored: Record<string, number>;
  errors: string[];
}

// Restauração: reinsere na ordem correta (respeitando FKs), remapeando user_id
// para o usuário logado — garante portabilidade entre projetos Supabase.
export async function restoreBackup(
  file: File,
  userId: string,
  onProgress?: (msg: string) => void,
): Promise<RestoreResult> {
  const text = await file.text();
  let parsed: { app?: string; tables?: Record<string, Record<string, unknown>[]> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (parsed.app !== 'wulff-relationship-crm' || !parsed.tables) {
    throw new Error('O arquivo não é um backup do Wulff Relationship CRM.');
  }
  const restored: Record<string, number> = {};
  const errors: string[] = [];
  for (const t of BACKUP_TABLES) {
    const rows = parsed.tables[t];
    if (!rows || rows.length === 0) continue;
    onProgress?.(`Restaurando ${t} (${rows.length})…`);
    const remapped = rows.map((r) => ({ ...r, user_id: userId }));
    for (let i = 0; i < remapped.length; i += 500) {
      const chunk = remapped.slice(i, i + 500);
      const { error } = await supabase.from(t).upsert(chunk);
      if (error) {
        errors.push(`${t}: ${error.message}`);
        break;
      }
      restored[t] = (restored[t] ?? 0) + chunk.length;
    }
  }
  return { restored, errors };
}
