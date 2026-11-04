import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '../config';
import { supabase } from '../lib/supabase';
import { resetDemo } from '../data/repo';
import { useList } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { PageHeader, Secao } from '../components/ui';
import type { Papel } from '../data/types';

interface PerfilLinha { user_id: string; papel: Papel; pessoa_id: string | null }

function GestaoPerfis() {
  const [perfis, setPerfis] = useState<PerfilLinha[]>([]);
  const pessoas = useList('org_pessoas');
  const carregar = () => supabase.from('pe_perfis').select('user_id, papel, pessoa_id').then(({ data }) => setPerfis((data as PerfilLinha[]) ?? []));
  useEffect(() => { carregar(); }, []);
  const atualizar = async (user_id: string, campos: Partial<PerfilLinha>) => {
    const { error } = await supabase.from('pe_perfis').update(campos).eq('user_id', user_id);
    if (error) alert(error.message); else carregar();
  };
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500"><tr><th className="px-4 py-3">Usuário (id)</th><th className="px-3">Pessoa vinculada</th><th className="px-3">Perfil</th></tr></thead>
        <tbody className="divide-y divide-ink-100">
          {perfis.map((p) => (
            <tr key={p.user_id}>
              <td className="px-4 py-2 font-mono text-xs text-ink-500">{p.user_id.slice(0, 8)}…</td>
              <td className="px-3 py-2">
                <select className="input" value={p.pessoa_id ?? ''} onChange={(e) => atualizar(p.user_id, { pessoa_id: e.target.value || null })}>
                  <option value="">—</option>
                  {(pessoas.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nome}{x.email ? ` (${x.email})` : ''}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <select className="input" value={p.papel} onChange={(e) => atualizar(p.user_id, { papel: e.target.value as Papel })}>
                  <option value="diretoria">Diretoria</option><option value="lider">Líder de área</option><option value="colaborador">Colaborador</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-4 text-xs text-ink-500">Novos usuários entram como Colaborador e são vinculados automaticamente à pessoa com o mesmo e-mail.</p>
    </div>
  );
}

export function ConfiguracoesPage() {
  const { ciclo } = useCiclo();
  const pode = usePode();
  const qc = useQueryClient();
  const ed = useEditor('pe_ciclos', 'ciclo');

  return (
    <>
      <PageHeader titulo="Configurações" />
      <Secao titulo="Ciclo de planejamento">
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-bold">{ciclo?.nome ?? '—'}</p><p className="text-sm text-ink-500">{ciclo?.ano_inicio}–{ciclo?.ano_fim} · {ciclo?.status}</p></div>
          {pode.diretoria && (ciclo
            ? <button className="btn-secondary text-xs" onClick={() => ed.editar(ciclo)}>Editar ciclo</button>
            : <button className="btn-primary text-xs" onClick={() => ed.novo({ nome: 'Planejamento Estratégico 2027–2030', ano_inicio: 2027, ano_fim: 2030, status: 'ativo' })}>Criar ciclo 2027–2030</button>)}
        </div>
      </Secao>

      {!config.modoDemo && pode.diretoria && <Secao titulo="Usuários e perfis de acesso"><GestaoPerfis /></Secao>}

      {config.modoDemo && (
        <Secao titulo="Modo demonstração">
          <div className="card space-y-3 text-sm">
            <p>Sem Supabase configurado, os dados ficam salvos apenas neste navegador. Para colocar online de verdade, siga o README (Supabase + Netlify).</p>
            <button className="btn-secondary" onClick={async () => { if (confirm('Restaurar os dados de exemplo? Suas alterações locais serão perdidas.')) { await resetDemo(); qc.invalidateQueries(); } }}>
              Restaurar dados de exemplo
            </button>
          </div>
        </Secao>
      )}

      <Secao titulo="Integração com outras aplicações">
        <div className="card space-y-2 text-sm text-ink-700">
          <p>As tabelas <code>org_areas</code> e <code>org_pessoas</code> são o cadastro mestre da firma e podem ser reutilizadas pelo CRM, propostas e demais sistemas no mesmo projeto Supabase.</p>
          <p>Outras aplicações devem ler o planejamento pelas views <code>vw_pe_acoes</code> e <code>vw_pe_indicadores</code> (contrato estável, respeita as permissões de quem consulta). Detalhes em <code>docs/ARQUITETURA.md</code>.</p>
        </div>
      </Secao>
      {ed.modal}
    </>
  );
}
