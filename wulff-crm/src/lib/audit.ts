import { supabase } from './supabase';

export async function logAudit(
  entity: string,
  entityId: string | null,
  action: string,
  details?: Record<string, unknown>,
) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from('audit_logs').insert({
    user_id: data.user.id,
    entity,
    entity_id: entityId,
    action,
    details: details ?? null,
  });
}
