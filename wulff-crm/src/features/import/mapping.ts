// ---------------------------------------------------------------------------
// Mapeamento de colunas — auto-detecção CALIBRADA com os cabeçalhos reais das
// 4 bases analisadas (export Google Contacts/Mesh, 1.649 colunas):
//   Name / Given Name / Family Name / Birthday / Notes / Group Membership /
//   Organization Name / Organization Title / "E-mail N - Value" /
//   "Phone N - Value" / "Website N - Type|Value" (Instagram, Facebook,
//   LinkedIn, Twitter) / "Address N - City|Region|Country" / External ID.
// Também reconhece cabeçalhos em português, Outlook e CRMs comuns.
// ---------------------------------------------------------------------------

import { fold } from '../../lib/normalize';

export const CRM_FIELDS = [
  { key: '', label: '— Ignorar coluna —' },
  { key: 'full_name', label: 'Nome completo' },
  { key: 'given_name', label: 'Primeiro nome' },
  { key: 'family_name', label: 'Sobrenome' },
  { key: 'preferred_name', label: 'Nome preferencial' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefone' },
  { key: 'whatsapp', label: 'WhatsApp / celular' },
  { key: 'job_title', label: 'Cargo' },
  { key: 'company_name', label: 'Empresa' },
  { key: 'department', label: 'Departamento' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'Estado' },
  { key: 'country', label: 'País' },
  { key: 'birthday', label: 'Aniversário' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'twitter', label: 'X / Twitter' },
  { key: 'website', label: 'Site' },
  { key: 'observations', label: 'Observações' },
  { key: 'interests', label: 'Assuntos de interesse' },
  { key: 'how_we_met', label: 'Como conheci' },
  { key: 'origin_context', label: 'Evento / contexto de origem' },
  { key: 'tags', label: 'Tags / grupos' },
  { key: 'internal_code', label: 'Código interno / ID externo' },
  { key: 'segment', label: 'Segmento' },
  { key: 'profession', label: 'Profissão' },
] as const;

export type CrmFieldKey = (typeof CRM_FIELDS)[number]['key'];

interface Rule {
  test: (folded: string, original: string) => boolean;
  field: CrmFieldKey;
}

const RULES: Rule[] = [
  // --- Formato Google Contacts / Mesh (bases reais) ---
  { test: (f) => f === 'name' || f === 'nome' || f === 'nome completo' || f === 'full name' || f === 'nome (n)', field: 'full_name' },
  { test: (f) => f === 'given name' || f === 'first name' || f === 'primeiro nome', field: 'given_name' },
  { test: (f) => f === 'family name' || f === 'last name' || f === 'sobrenome', field: 'family_name' },
  { test: (f) => f === 'additional name' || f === 'middle name', field: '' },
  { test: (f) => /^e-?mail( \d+)?( - value)?$/.test(f) || f === 'e-mail address' || f === 'email address' || f === 'e-mail principal', field: 'email' },
  { test: (f) => /^e-?mail \d+ - type$/.test(f), field: '' },
  { test: (f) => /^phone \d+ - value$/.test(f) || f === 'phone' || f === 'telefone' || f === 'telefone comercial' || f === 'business phone' || f === 'home phone' || f === 'primary phone', field: 'phone' },
  { test: (f) => /^phone \d+ - type$/.test(f), field: '' },
  { test: (f) => f === 'mobile phone' || f === 'celular' || f === 'whatsapp' || f === 'mobile' || f === 'cell phone', field: 'whatsapp' },
  { test: (f) => f === 'birthday' || f === 'aniversario' || f === 'data de nascimento' || f === 'nascimento' || f === 'birth date', field: 'birthday' },
  { test: (f) => f === 'notes' || f === 'observacoes' || f === 'obs' || f === 'anotacoes', field: 'observations' },
  { test: (f) => f === 'group membership' || f === 'groups' || f === 'grupos' || f === 'tags' || f === 'labels' || f === 'etiquetas', field: 'tags' },
  { test: (f) => f === 'organization name' || f === 'organization 1 - name' || f === 'empresa' || f === 'company' || f === 'organizacao', field: 'company_name' },
  { test: (f) => f === 'organization title' || f === 'organization 1 - title' || f === 'cargo' || f === 'job title' || f === 'title' || f === 'funcao', field: 'job_title' },
  { test: (f) => f === 'organization department' || f === 'departamento' || f === 'department', field: 'department' },
  { test: (f) => /^address \d+ - city$/.test(f) || f === 'cidade' || f === 'city' || f === 'home city' || f === 'business city' || f === 'municipio', field: 'city' },
  { test: (f) => /^address \d+ - region$/.test(f) || f === 'estado' || f === 'state' || f === 'uf' || f === 'home state' || f === 'business state' || f === 'regiao', field: 'state' },
  { test: (f) => /^address \d+ - country$/.test(f) || f === 'pais' || f === 'country' || f === 'country/region' || f === 'home country' || f === 'business country', field: 'country' },
  { test: (f) => /^address \d+ - (formatted|street|po box|postal code|extended address|type)$/.test(f), field: '' },
  // Websites do export real vêm com Type separado (Instagram/Facebook/LinkedIn) —
  // o processador usa a coluna "- Type" irmã; aqui mapeamos o Value como site genérico.
  { test: (f) => /^website \d+ - value$/.test(f) || f === 'site' || f === 'website' || f === 'web page' || f === 'url', field: 'website' },
  { test: (f) => /^website \d+ - type$/.test(f), field: '' },
  { test: (f) => f.includes('linkedin'), field: 'linkedin' },
  { test: (f) => f.includes('instagram'), field: 'instagram' },
  { test: (f) => f.includes('facebook'), field: 'facebook' },
  { test: (f) => f === 'twitter' || f === 'x' || f.includes('twitter'), field: 'twitter' },
  { test: (f) => /^external id( \d+)? - value$/.test(f) || f === 'codigo interno' || f === 'codigo' || f === 'id externo' || f === 'external id', field: 'internal_code' },
  { test: (f) => /^external id( \d+)? - type$/.test(f), field: '' },
  { test: (f) => f === 'nickname' || f === 'apelido' || f === 'nome preferencial', field: 'preferred_name' },
  { test: (f) => f === 'segmento' || f === 'industry' || f === 'setor', field: 'segment' },
  { test: (f) => f === 'profissao' || f === 'profession' || f === 'occupation', field: 'profession' },
  { test: (f) => f === 'como conheci' || f === 'origem' || f === 'source' || f === 'lead source', field: 'how_we_met' },
  { test: (f) => f === 'evento' || f === 'contexto' || f === 'event', field: 'origin_context' },
  { test: (f) => f === 'interesses' || f === 'assuntos de interesse' || f === 'interests', field: 'interests' },
];

export function autoDetectField(header: string): CrmFieldKey {
  const f = fold(header);
  for (const rule of RULES) {
    if (rule.test(f, header)) return rule.field;
  }
  // fallback heurístico
  if (f.includes('mail')) return 'email';
  if (f.includes('fone') || f.includes('phone') || f.includes('tel')) return 'phone';
  if (f.includes('empresa') || f.includes('company')) return 'company_name';
  if (f.includes('nome') || f.includes('name')) return 'full_name';
  return '';
}

export interface ColumnInfo {
  header: string;
  filledCount: number;
  samples: string[];
  suggested: CrmFieldKey;
}

/**
 * Analisa as colunas do arquivo: preenchimento, exemplos e sugestão de mapeamento.
 * Colunas 100% vazias são ocultadas do assistente (os exports do Google trazem
 * até 800 pares "Phone N" quase todos vazios — visto nas bases reais).
 */
export function analyzeColumns(headers: string[], rows: Record<string, string>[]): ColumnInfo[] {
  return headers.map((h) => {
    let filled = 0;
    const samples: string[] = [];
    for (const r of rows) {
      const v = (r[h] ?? '').trim();
      if (v) {
        filled++;
        if (samples.length < 3 && !samples.includes(v)) samples.push(v.length > 60 ? v.slice(0, 57) + '…' : v);
      }
    }
    return { header: h, filledCount: filled, samples, suggested: autoDetectField(h) };
  });
}
