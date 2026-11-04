import { Link, useParams } from 'react-router-dom';
import { useIndex, useList, useRow } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { useMetricas } from '../data/metricas';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, DrillCard, PageHeader, Progresso, Secao, StatusBadge, Texto, Vazio } from '../components/ui';
import { atingimento, progressoIniciativa, progressoObjetivo, progressoPilar } from '../lib/progresso';
import { fmtData, fmtMoeda, fmtValor, acaoAtrasada } from '../lib/format';

/** Nível 0 — Mapa estratégico: pilares × objetivos */
export function MapaEstrategicoPage() {
  const { ciclo } = useCiclo();
  const pilares = useList('pe_pilares');
  const objetivos = useList('pe_objetivos');
  const inis = useList('pe_iniciativas');
  const acoes = useList('pe_acoes');
  const pode = usePode();
  const edPilar = useEditor('pe_pilares', 'pilar');
  const edObj = useEditor('pe_objetivos', 'objetivo');
  if (!ciclo || pilares.isLoading) return <Carregando />;

  return (
    <>
      <PageHeader sobretitulo="Desdobramento" titulo="Mapa estratégico"
        subtitulo="Pilar → Objetivo → Iniciativa → Ação. Clique em qualquer nível para detalhar."
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => edPilar.novo({ ciclo_id: ciclo.id, ordem: pilares.data?.length ?? 0 })}>Pilar</BotaoNovo>} />
      <div className="space-y-4">
        {[...(pilares.data ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((p) => {
          const objs = (objetivos.data ?? []).filter((o) => o.pilar_id === p.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
          return (
            <div key={p.id} className="card border-l-4" style={{ borderLeftColor: p.cor ?? '#1e3a5f' }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Link to={`/estrategia/pilares/${p.id}`} className="text-lg font-extrabold hover:text-accent-700 hover:underline">{p.nome}</Link>
                <div className="flex items-center gap-2">
                  <div className="w-40"><Progresso valor={progressoPilar(p.id, objetivos.data ?? [], inis.data ?? [], acoes.data ?? [])} /></div>
                  {pode.editarEstrutura && <BotaoNovo onClick={() => edObj.novo({ pilar_id: p.id, ordem: objs.length })}>Objetivo</BotaoNovo>}
                  {pode.editarEstrutura && <BotoesLinha onEditar={() => edPilar.editar(p)} onExcluir={() => edPilar.excluir(p, p.nome)} />}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {objs.map((o) => (
                  <Link key={o.id} to={`/estrategia/objetivos/${o.id}`} className="rounded-lg border border-ink-100 p-3 transition hover:border-accent-300 hover:bg-accent-50">
                    <p className="text-xs font-bold text-ink-400">{o.codigo}</p>
                    <p className="mb-2 text-sm font-semibold leading-snug">{o.titulo}</p>
                    <Progresso valor={progressoObjetivo(o, inis.data ?? [], acoes.data ?? [])} compacto />
                  </Link>
                ))}
                {!objs.length && <p className="text-sm text-ink-400">Nenhum objetivo neste pilar.</p>}
              </div>
            </div>
          );
        })}
        {!pilares.data?.length && <Vazio>Comece cadastrando os pilares (perspectivas) da estratégia.</Vazio>}
      </div>
      {edPilar.modal}{edObj.modal}
    </>
  );
}

/** Nível 1 — Pilar */
export function PilarPage() {
  const { id } = useParams();
  const pilar = useRow('pe_pilares', id);
  const objetivos = useList('pe_objetivos', { pilar_id: id });
  const inis = useList('pe_iniciativas');
  const acoes = useList('pe_acoes');
  const pessoas = useIndex('org_pessoas');
  const pode = usePode();
  const ed = useEditor('pe_objetivos', 'objetivo');
  if (!pilar.data) return <Carregando />;
  const p = pilar.data;
  return (
    <>
      <PageHeader migalhas={[{ label: 'Mapa estratégico', to: '/estrategia' }, { label: p.nome }]} sobretitulo="Pilar" titulo={p.nome} subtitulo={p.descricao}
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => ed.novo({ pilar_id: p.id })}>Objetivo</BotaoNovo>} />
      <div className="grid gap-3 md:grid-cols-2">
        {[...(objetivos.data ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((o) => (
          <DrillCard key={o.id} to={`/estrategia/objetivos/${o.id}`} cor={p.cor}>
            <p className="text-xs font-bold text-ink-400">{o.codigo}</p>
            <p className="font-bold">{o.titulo}</p>
            <p className="mb-3 text-xs text-ink-500">Sponsor: {pessoas.get(o.responsavel_id ?? '')?.nome ?? '—'} · {(inis.data ?? []).filter((i) => i.objetivo_id === o.id).length} iniciativa(s)</p>
            <Progresso valor={progressoObjetivo(o, inis.data ?? [], acoes.data ?? [])} />
          </DrillCard>
        ))}
      </div>
      {ed.modal}
    </>
  );
}

/** Nível 2 — Objetivo estratégico */
export function ObjetivoPage() {
  const { id } = useParams();
  const obj = useRow('pe_objetivos', id);
  const pilar = useRow('pe_pilares', obj.data?.pilar_id);
  const inis = useList('pe_iniciativas', { objetivo_id: id });
  const acoes = useList('pe_acoes');
  const metr = useMetricas();
  const inds = { data: metr.inds.filter((x) => x.objetivo_id === id) };
  const pessoas = useIndex('org_pessoas');
  const areas = useIndex('org_areas');
  const { ciclo, anoRef } = useCiclo();
  const pode = usePode();
  const edObj = useEditor('pe_objetivos', 'objetivo');
  const edIni = useEditor('pe_iniciativas', 'iniciativa');
  const edInd = useEditor('pe_indicadores', 'indicador');
  if (!obj.data || !ciclo) return <Carregando />;
  const o = obj.data;

  return (
    <>
      <PageHeader
        migalhas={[{ label: 'Mapa estratégico', to: '/estrategia' }, { label: pilar.data?.nome ?? '…', to: `/estrategia/pilares/${o.pilar_id}` }, { label: o.codigo ?? o.titulo }]}
        sobretitulo={`Objetivo estratégico ${o.codigo ?? ''}`} titulo={o.titulo}
        subtitulo={<>Sponsor: <Link className="underline" to={`/pessoas/${o.responsavel_id}`}>{pessoas.get(o.responsavel_id ?? '')?.nome ?? '—'}</Link> · Área: {areas.get(o.area_id ?? '')?.nome ?? '—'}</>}
        acoes={pode.editarEstrutura && <button className="btn-secondary text-xs" onClick={() => edObj.editar(o)}>Editar</button>} />
      {o.descricao && <div className="card mb-6"><Texto>{o.descricao}</Texto></div>}

      <div className="mb-6 card"><p className="label">Progresso consolidado</p><Progresso valor={progressoObjetivo(o, inis.data ?? [], acoes.data ?? [])} /></div>

      <Secao titulo="Indicadores do objetivo"
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => edInd.novo({ ciclo_id: ciclo.id, escopo: 'objetivo', objetivo_id: o.id, area_id: o.area_id, polaridade: 'maior' })}>Indicador</BotaoNovo>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(inds.data ?? []).map((i) => {
            const at = atingimento(i, metr.metas, metr.meds, anoRef);
            return (
              <Link key={i.id} to={`/indicadores/${i.id}`} className="card block hover:shadow-md">
                <p className="text-sm font-semibold">{i.nome}</p>
                <p className="text-xs text-ink-500">Meta {anoRef}: {fmtValor(at.meta, i.unidade)} · Realizado: {fmtValor(at.valor, i.unidade)}</p>
                <div className="mt-2"><Progresso valor={at.pct} compacto /></div>
              </Link>
            );
          })}
          {!inds.data?.length && <Vazio>Sem indicadores vinculados.</Vazio>}
        </div>
      </Secao>

      <Secao titulo="Iniciativas"
        acoes={pode.registrar && pode.editarDaArea(o.area_id) && <BotaoNovo onClick={() => edIni.novo({ objetivo_id: o.id, area_id: o.area_id, status: 'nao_iniciado' })}>Iniciativa</BotaoNovo>}>
        <div className="grid gap-3 md:grid-cols-2">
          {(inis.data ?? []).map((i) => (
            <DrillCard key={i.id} to={`/estrategia/iniciativas/${i.id}`} cor={pilar.data?.cor}>
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-ink-400">{i.codigo}</p><StatusBadge status={i.status} prazo={i.fim} /></div>
              <p className="font-bold">{i.titulo}</p>
              <p className="mb-3 text-xs text-ink-500">{pessoas.get(i.responsavel_id ?? '')?.nome ?? '—'} · {fmtData(i.inicio)} → {fmtData(i.fim)}</p>
              <Progresso valor={progressoIniciativa(i, acoes.data ?? [])} />
            </DrillCard>
          ))}
          {!inis.data?.length && <Vazio>Sem iniciativas.</Vazio>}
        </div>
      </Secao>
      {edObj.modal}{edIni.modal}{edInd.modal}
    </>
  );
}

/** Nível 3 — Iniciativa com plano de ação 5W2H */
export function IniciativaPage() {
  const { id } = useParams();
  const ini = useRow('pe_iniciativas', id);
  const obj = useRow('pe_objetivos', ini.data?.objetivo_id);
  const pilar = useRow('pe_pilares', obj.data?.pilar_id);
  const acoes = useList('pe_acoes', { iniciativa_id: id });
  const todasAcoes = useList('pe_acoes');
  const pessoas = useIndex('org_pessoas');
  const areas = useIndex('org_areas');
  const pode = usePode();
  const edIni = useEditor('pe_iniciativas', 'iniciativa');
  const edAcao = useEditor('pe_acoes', 'ação');
  if (!ini.data) return <Carregando />;
  const i = ini.data;

  return (
    <>
      <PageHeader
        migalhas={[
          { label: 'Mapa estratégico', to: '/estrategia' },
          { label: pilar.data?.nome ?? '…', to: `/estrategia/pilares/${pilar.data?.id}` },
          { label: obj.data?.codigo ?? obj.data?.titulo ?? '…', to: `/estrategia/objetivos/${i.objetivo_id}` },
          { label: i.codigo ?? i.titulo },
        ]}
        sobretitulo={`Iniciativa ${i.codigo ?? ''}`} titulo={i.titulo}
        acoes={pode.editarDaArea(i.area_id) && <button className="btn-secondary text-xs" onClick={() => edIni.editar(i)}>Editar</button>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Status', <StatusBadge key="s" status={i.status} prazo={i.fim} />],
          ['Responsável', <Link key="r" className="hover:underline" to={`/pessoas/${i.responsavel_id}`}>{pessoas.get(i.responsavel_id ?? '')?.nome ?? '—'}</Link>],
          ['Área', <Link key="a" className="hover:underline" to={`/areas/${i.area_id}`}>{areas.get(i.area_id ?? '')?.nome ?? '—'}</Link>],
          ['Período', `${fmtData(i.inicio)} → ${fmtData(i.fim)}`],
          ['Orçamento', fmtMoeda(i.orcamento)],
        ].map(([k, v]) => (
          <div key={String(k)} className="card py-3"><p className="label">{k}</p><div className="text-sm font-semibold">{v}</div></div>
        ))}
      </div>
      {i.descricao && <div className="card mb-6"><Texto>{i.descricao}</Texto></div>}
      <div className="card mb-6"><p className="label">Progresso</p><Progresso valor={progressoIniciativa(i, todasAcoes.data ?? [])} /></div>

      <Secao titulo="Plano de ação (5W2H)"
        acoes={pode.editarDaArea(i.area_id) && <BotaoNovo onClick={() => edAcao.novo({ iniciativa_id: i.id, area_id: i.area_id, status: 'nao_iniciado', percentual: 0 })}>Ação</BotaoNovo>}>
        <TabelaAcoes acoes={acoes.data ?? []} />
      </Secao>
      {edIni.modal}{edAcao.modal}
    </>
  );
}

export function TabelaAcoes({ acoes, mostrarIniciativa }: { acoes: import('../data/types').Acao[]; mostrarIniciativa?: boolean }) {
  const pessoas = useIndex('org_pessoas');
  const inis = useIndex('pe_iniciativas');
  if (!acoes.length) return <Vazio>Nenhuma ação.</Vazio>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th className="px-4 py-3">O quê</th>
            {mostrarIniciativa && <th className="px-3 py-3">Iniciativa</th>}
            <th className="px-3 py-3">Quem</th>
            <th className="px-3 py-3">Quando</th>
            <th className="px-3 py-3">Status</th>
            <th className="w-36 px-3 py-3">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {[...acoes].sort((a, b) => (a.prazo ?? '9').localeCompare(b.prazo ?? '9')).map((a) => (
            <tr key={a.id} className="hover:bg-ink-50">
              <td className="px-4 py-3"><Link to={`/execucao/${a.id}`} className="font-medium hover:text-accent-700 hover:underline">{a.o_que}</Link></td>
              {mostrarIniciativa && <td className="px-3 py-3 text-xs text-ink-600"><Link className="hover:underline" to={`/estrategia/iniciativas/${a.iniciativa_id}`}>{inis.get(a.iniciativa_id)?.titulo ?? '—'}</Link></td>}
              <td className="px-3 py-3"><Link className="hover:underline" to={`/pessoas/${a.responsavel_id}`}>{pessoas.get(a.responsavel_id ?? '')?.nome ?? '—'}</Link></td>
              <td className={`px-3 py-3 tabular-nums ${acaoAtrasada(a) ? 'font-semibold text-red-700' : ''}`}>{fmtData(a.prazo)}</td>
              <td className="px-3 py-3"><StatusBadge status={a.status} prazo={a.prazo} /></td>
              <td className="px-3 py-3"><Progresso valor={a.status === 'concluido' ? 100 : a.percentual} compacto /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
