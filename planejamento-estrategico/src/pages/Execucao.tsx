import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useIndex, useList, useRow, useSave } from '../data/hooks';
import { useAuth, usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { Carregando, PageHeader, Progresso, Secao, StatusBadge, Texto, Vazio } from '../components/ui';
import { TabelaAcoes } from './Estrategia';
import { STATUS_OPCOES, acaoAtrasada, fmtData, fmtMoeda, hojeISO } from '../lib/format';

/** Todas as ações da firma, com filtros — a "mesa de execução". */
export function ExecucaoPage() {
  const [params, setParams] = useSearchParams();
  const acoes = useList('pe_acoes');
  const areas = useList('org_areas');
  const pessoas = useList('org_pessoas');
  const { pessoaId } = useAuth();
  if (acoes.isLoading) return <Carregando />;

  const f = {
    filtro: params.get('filtro') ?? '',
    area: params.get('area') ?? '',
    pessoa: params.get('pessoa') ?? '',
    status: params.get('status') ?? '',
  };
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };
  const lista = (acoes.data ?? []).filter((a) =>
    (!f.area || a.area_id === f.area) &&
    (!f.pessoa || a.responsavel_id === f.pessoa) &&
    (!f.status || a.status === f.status) &&
    (f.filtro !== 'atrasadas' || acaoAtrasada(a)) &&
    (f.filtro !== 'minhas' || a.responsavel_id === pessoaId),
  );

  return (
    <>
      <PageHeader sobretitulo="Desdobramento" titulo="Planos de ação" subtitulo="Todas as ações (5W2H) de todas as iniciativas. Filtre por área, pessoa e situação." />
      <div className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select className="input" value={f.filtro} onChange={(e) => set('filtro', e.target.value)}>
          <option value="">Todas as ações</option>
          <option value="minhas">Minhas ações</option>
          <option value="atrasadas">Somente atrasadas</option>
        </select>
        <select className="input" value={f.area} onChange={(e) => set('area', e.target.value)}>
          <option value="">Todas as áreas</option>
          {(areas.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <select className="input" value={f.pessoa} onChange={(e) => set('pessoa', e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {(pessoas.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OPCOES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <p className="mb-2 text-xs text-ink-500">{lista.length} ação(ões)</p>
      <TabelaAcoes acoes={lista} mostrarIniciativa />
    </>
  );
}

/** Nível 4 — Ação: 5W2H completo + histórico de atualizações (check-ins). */
export function AcaoPage() {
  const { id } = useParams();
  const acao = useRow('pe_acoes', id);
  const ini = useRow('pe_iniciativas', acao.data?.iniciativa_id);
  const obj = useRow('pe_objetivos', ini.data?.objetivo_id);
  const ups = useList('pe_acao_atualizacoes', { acao_id: id });
  const pessoas = useIndex('org_pessoas');
  const areas = useIndex('org_areas');
  const pode = usePode();
  const ed = useEditor('pe_acoes', 'ação');
  const salvarAcao = useSave('pe_acoes');
  const salvarUp = useSave('pe_acao_atualizacoes');
  const [texto, setTexto] = useState('');
  const [pct, setPct] = useState<number | ''>('');
  if (!acao.data) return <Carregando />;
  const a = acao.data;
  const podeEditar = pode.editarAcao(a);

  async function registrar() {
    if (!texto.trim()) return;
    await salvarUp.mutateAsync({ acao_id: a.id, data: hojeISO(), texto, percentual: pct === '' ? null : pct, autor_id: pode.pessoaId });
    if (pct !== '' && podeEditar) {
      await salvarAcao.mutateAsync({ id: a.id, percentual: pct, status: pct >= 100 ? 'concluido' : a.status === 'nao_iniciado' ? 'em_andamento' : a.status });
    }
    setTexto(''); setPct('');
  }

  const w = [
    ['O quê?', a.o_que], ['Por quê?', a.por_que], ['Onde?', a.onde],
    ['Quem?', pessoas.get(a.responsavel_id ?? '')?.nome], ['Quando?', fmtData(a.prazo)],
    ['Como?', a.como], ['Quanto?', fmtMoeda(a.quanto)],
  ];

  return (
    <>
      <PageHeader
        migalhas={[
          { label: 'Mapa estratégico', to: '/estrategia' },
          { label: obj.data?.codigo ?? '…', to: `/estrategia/objetivos/${obj.data?.id}` },
          { label: ini.data?.codigo ?? ini.data?.titulo ?? '…', to: `/estrategia/iniciativas/${a.iniciativa_id}` },
          { label: 'Ação' },
        ]}
        sobretitulo="Ação" titulo={a.o_que}
        subtitulo={<>Área: <Link className="underline" to={`/areas/${a.area_id}`}>{areas.get(a.area_id ?? '')?.nome ?? '—'}</Link></>}
        acoes={podeEditar && <button className="btn-secondary text-xs" onClick={() => ed.editar(a)}>Editar</button>} />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            {w.map(([k, v]) => (
              <div key={k as string}><dt className="label">{k}</dt><dd className="whitespace-pre-line text-sm">{v || '—'}</dd></div>
            ))}
          </dl>
        </div>
        <div className="card">
          <p className="label">Situação</p>
          <StatusBadge status={a.status} prazo={a.prazo} />
          <div className="mt-4"><Progresso valor={a.status === 'concluido' ? 100 : a.percentual} /></div>
          {acaoAtrasada(a) && <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-800">Prazo vencido em {fmtData(a.prazo)}.</p>}
        </div>
      </div>

      <Secao titulo="Atualizações (check-ins)">
        {pode.registrar && (
          <div className="card mb-4 grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
            <label><span className="label">O que avançou / bloqueios</span>
              <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: reunião com sócios realizada, falta validar…" /></label>
            <label><span className="label">Novo %</span>
              <input className="input" type="number" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <button className="btn-primary" onClick={registrar} disabled={!texto.trim() || salvarUp.isPending}>Registrar</button>
          </div>
        )}
        <ol className="space-y-3 border-l-2 border-ink-100 pl-4">
          {[...(ups.data ?? [])].sort((x, y) => (y.data + (y.created_at ?? '')).localeCompare(x.data + (x.created_at ?? ''))).map((u) => (
            <li key={u.id} className="relative">
              <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-accent-600" />
              <p className="text-xs text-ink-500">{fmtData(u.data)} · {pessoas.get(u.autor_id ?? '')?.nome ?? '—'}{u.percentual != null && ` · ${u.percentual}%`}</p>
              <Texto>{u.texto}</Texto>
            </li>
          ))}
          {!ups.data?.length && <Vazio>Nenhuma atualização registrada.</Vazio>}
        </ol>
      </Secao>
      {ed.modal}
    </>
  );
}

