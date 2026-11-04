import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { config } from '../config';
import { useList } from '../data/hooks';
import type { Acao, Papel } from '../data/types';

interface AuthState {
  carregando: boolean;
  logado: boolean;
  email?: string;
  papel: Papel | null;
  pessoaId: string | null;
  sair: () => Promise<void>;
  /** só no modo demo: alterna o papel para simular permissões */
  simularPapel?: (p: Papel) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(!config.modoDemo);
  const [papel, setPapel] = useState<Papel | null>(config.modoDemo ? 'diretoria' : null);
  const [pessoaId, setPessoaId] = useState<string | null>(config.modoDemo ? 'p-01' : null);

  useEffect(() => {
    if (config.modoDemo) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (config.modoDemo || !session) return;
    setCarregando(true);
    supabase
      .from('pe_perfis')
      .select('papel, pessoa_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setPapel((data?.papel as Papel) ?? null);
        setPessoaId(data?.pessoa_id ?? null);
        setCarregando(false);
      });
  }, [session]);

  const valor: AuthState = {
    carregando,
    logado: config.modoDemo || Boolean(session),
    email: config.modoDemo ? 'demo@local' : session?.user.email,
    papel,
    pessoaId,
    sair: async () => {
      if (!config.modoDemo) await supabase.auth.signOut();
    },
    simularPapel: config.modoDemo
      ? (p) => {
          setPapel(p);
          setPessoaId(p === 'diretoria' ? 'p-01' : p === 'lider' ? 'p-02' : 'p-09');
        }
      : undefined,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}

/**
 * Permissões na interface. Espelham as policies de RLS do schema.sql — a
 * segurança real é no banco; aqui só escondemos botões que dariam erro.
 */
export function usePode() {
  const { papel, pessoaId } = useAuth();
  const areas = useList('org_areas');
  const minhasAreas = useMemo(() => {
    const lideradas = (areas.data ?? []).filter((a) => a.lider_id && a.lider_id === pessoaId).map((a) => a.id);
    const filhas = (areas.data ?? []).filter((a) => a.area_pai_id && lideradas.includes(a.area_pai_id)).map((a) => a.id);
    return new Set([...lideradas, ...filhas]);
  }, [areas.data, pessoaId]);

  const dir = papel === 'diretoria';
  return {
    papel,
    pessoaId,
    diretoria: dir,
    verConfidencial: dir,
    editarEstrutura: dir,
    editarDaArea: (areaId?: string | null) => dir || (papel === 'lider' && Boolean(areaId && minhasAreas.has(areaId))),
    editarAcao: (a: Pick<Acao, 'area_id' | 'responsavel_id'>) =>
      dir ||
      (papel === 'lider' && Boolean(a.area_id && minhasAreas.has(a.area_id))) ||
      Boolean(pessoaId && a.responsavel_id === pessoaId),
    registrar: papel !== null,
  };
}
