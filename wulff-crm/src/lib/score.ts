import type { Contact } from '../types/db';

// Relationship Score 0–100 — fatores e pesos exibidos na interface.
export const SCORE_FACTORS = [
  { key: 'closeness', label: 'Grau de proximidade', weight: 20 },
  { key: 'importance', label: 'Importância', weight: 15 },
  { key: 'influence', label: 'Influência', weight: 10 },
  { key: 'recency', label: 'Recência do último contato', weight: 25 },
  { key: 'interactions', label: 'Quantidade de interações', weight: 15 },
  { key: 'business', label: 'Potencial / negócios', weight: 5 },
  { key: 'connections', label: 'Conexões em comum', weight: 5 },
  { key: 'completeness', label: 'Completude do cadastro', weight: 5 },
] as const;

export interface ScoreBreakdown {
  total: number;
  parts: { key: string; label: string; weight: number; value: number }[];
}

export function completeness(c: Contact): number {
  const fields = [
    c.full_name, c.job_title, c.company_name, c.city, c.email, c.phone,
    c.linkedin, c.photo_url, c.closeness, c.how_we_met,
    c.birth_date ?? c.birth_day, c.interests,
  ];
  const filled = fields.filter((f) => f !== null && f !== undefined && f !== '').length;
  return filled / fields.length;
}

export function relationshipScore(c: Contact, connectionsCount = 0): ScoreBreakdown {
  const parts: ScoreBreakdown['parts'] = [];

  // Proximidade: grau 1 (estratégico) = 1.0 … grau 7 = 0
  const closeness = c.closeness ? (7 - c.closeness) / 6 : 0.3;
  parts.push({ key: 'closeness', label: 'Grau de proximidade', weight: 20, value: closeness });

  const importance = c.importance ? c.importance / 5 : 0.3;
  parts.push({ key: 'importance', label: 'Importância', weight: 15, value: importance });

  const influence = c.influence ? c.influence / 5 : 0.3;
  parts.push({ key: 'influence', label: 'Influência', weight: 10, value: influence });

  // Recência: 1.0 até 30 dias, decaindo até 0 em 365+ dias
  let recency = 0;
  if (c.last_interaction_at) {
    const days = (Date.now() - new Date(c.last_interaction_at).getTime()) / 86_400_000;
    recency = days <= 30 ? 1 : days >= 365 ? 0 : 1 - (days - 30) / 335;
  }
  parts.push({ key: 'recency', label: 'Recência do último contato', weight: 25, value: recency });

  const inter = Math.min(1, (c.interactions_count ?? 0) / 10);
  parts.push({ key: 'interactions', label: 'Quantidade de interações', weight: 15, value: inter });

  const business = c.business_potential ? c.business_potential / 5 : c.opportunities ? 0.6 : 0;
  parts.push({ key: 'business', label: 'Potencial / negócios', weight: 5, value: business });

  const conn = Math.min(1, connectionsCount / 5);
  parts.push({ key: 'connections', label: 'Conexões em comum', weight: 5, value: conn });

  parts.push({ key: 'completeness', label: 'Completude do cadastro', weight: 5, value: completeness(c) });

  const total = Math.round(parts.reduce((acc, p) => acc + p.weight * p.value, 0));
  return { total, parts };
}

export const CLOSENESS_LEVELS = [
  { value: 1, label: 'Estratégico' },
  { value: 2, label: 'Muito próximo' },
  { value: 3, label: 'Próximo' },
  { value: 4, label: 'Relacionamento ativo' },
  { value: 5, label: 'Conhecido' },
  { value: 6, label: 'Contato distante' },
  { value: 7, label: 'Sem relacionamento recente' },
];

export function closenessLabel(v: number | null): string {
  return CLOSENESS_LEVELS.find((l) => l.value === v)?.label ?? '—';
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'bg-accent-100 text-accent-800';
  if (score >= 40) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-700';
}
