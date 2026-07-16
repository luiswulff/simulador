import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { setAuditContext } from '../lib/audit';

export type WorkspaceRole = 'admin' | 'executivo' | 'assistente' | 'consulta';

export interface Workspace {
  ownerId: string;
  label: string;
  role: WorkspaceRole;
  own: boolean;
}

interface WorkspaceState {
  workspaces: Workspace[];
  active: Workspace;
  setActiveOwner: (ownerId: string) => void;
  /** user_id a usar em TODOS os INSERTs — a base ativa. */
  ownerId: string;
  role: WorkspaceRole;
  canWrite: boolean;
  isOwner: boolean;
}

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Administrador',
  executivo: 'Executivo',
  assistente: 'Assistente',
  consulta: 'Consulta',
};

const WorkspaceContext = createContext<WorkspaceState | null>(null);
const STORAGE_KEY = 'wulff-active-workspace';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeOwner, setActiveOwner] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  const { data: memberships = [] } = useQuery({
    queryKey: ['my-workspaces', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase.rpc('my_workspaces');
      return (data ?? []) as { owner_id: string; owner_name: string | null; owner_email: string | null; role: WorkspaceRole }[];
    },
  });

  const workspaces = useMemo<Workspace[]>(() => {
    if (!user) return [];
    return [
      { ownerId: user.id, label: 'Minha base', role: 'admin' as WorkspaceRole, own: true },
      ...memberships.map((m) => ({
        ownerId: m.owner_id,
        label: m.owner_name || m.owner_email || 'Base compartilhada',
        role: m.role,
        own: false,
      })),
    ];
  }, [user, memberships]);

  const active = useMemo<Workspace>(() => {
    const found = workspaces.find((w) => w.ownerId === activeOwner);
    return found ?? workspaces[0] ?? { ownerId: '', label: '', role: 'admin', own: true };
  }, [workspaces, activeOwner]);

  useEffect(() => {
    if (active.ownerId) {
      localStorage.setItem(STORAGE_KEY, active.ownerId);
      setAuditContext(active.ownerId, user?.email ?? null);
    }
  }, [active.ownerId, user?.email]);

  const value: WorkspaceState = {
    workspaces,
    active,
    setActiveOwner: (id) => setActiveOwner(id),
    ownerId: active.ownerId,
    role: active.role,
    canWrite: active.role !== 'consulta',
    isOwner: active.own,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace deve ser usado dentro de WorkspaceProvider');
  return ctx;
}
