import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  try {
    return formatDistanceToNow(parseISO(iso), { locale: ptBR, addSuffix: true });
  } catch {
    return iso;
  }
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function fmtBirthday(
  birth_date: string | null,
  birth_day: number | null,
  birth_month: number | null,
): string {
  if (birth_date) return fmtDate(birth_date);
  if (birth_day && birth_month)
    return `${String(birth_day).padStart(2, '0')}/${String(birth_month).padStart(2, '0')}`;
  return '—';
}

export const INTERACTION_KINDS: { value: string; label: string }[] = [
  { value: 'reuniao', label: 'Reunião' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'mensagem', label: 'Mensagem' },
  { value: 'email', label: 'E-mail' },
  { value: 'almoco', label: 'Almoço' },
  { value: 'jantar', label: 'Jantar' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'presente', label: 'Presente' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'evento', label: 'Evento' },
  { value: 'outro', label: 'Outro' },
];

export function interactionLabel(kind: string): string {
  return INTERACTION_KINDS.find((k) => k.value === kind)?.label ?? kind;
}
