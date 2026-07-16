import { supabase } from './supabase';

// Contexto de workspace ativo: os logs pertencem à base (owner) e registram
// quem executou a ação (actor) — definido pelo WorkspaceProvider.
let auditOwnerId: string | null = null;
let auditActor: string | null = null;

export function setAuditContext(ownerId: string | null, actor: string | null) {
  auditOwnerId = ownerId;
  auditActor = actor;
}

export async function logAudit(
  entity: string,
  entityId: string | null,
  action: string,
  details?: Record<string, unknown>,
) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from('audit_logs').insert({
    user_id: auditOwnerId ?? data.user.id,
    entity,
    entity_id: entityId,
    action,
    details: { ...(details ?? {}), _por: auditActor ?? data.user.email },
  });
}
