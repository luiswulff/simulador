import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, Calculator } from 'lucide-react';
import { useIndex, useList, useRemove, useRow, useSave } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { agrupar, useMetricas } from '../data/metricas';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, PageHeader, Progresso, Secao, Texto, Vazio } from '../components/ui';
import { atingimento } from '../lib/progresso';
import { referencias } from '../lib/formula';
import { fmtData, fmtValor } from '../lib/format';

const ESCOPOS = { ambicao: 'Ambição (firma)', objetivo: 'Objetivos estratégicos', area: 'Áreas' } as const;

export function IndicadoresPage() {
  const { ciclo, anoRef } = useCiclo();
  const { inds, metas, meds, carregando } = useMetricas();
  const objs = useIndex('pe_objetivos');
  const areas = useIndex('org_areas');
  const pode = usePode();
  const ed = useEditor('pe_indicadores', 'indicador');
  if (!ciclo || carregando) return <Carregando />;

  return (
    <>
      <PageHeader sobretitulo="Desdobramento" titulo="Indicadores" subtitulo={`Dicionário de indicadores e atingimento das metas de ${anoRef}.`}
        acoes={pode.diretoria && <BotaoNovo onClick={() => ed.novo({ ciclo_id: ciclo.id, escopo: 'objetivo', polaridade: 'maior' })}>Indicador</BotaoNovo>} />
      {(Object.keys(ESCOPOS) as (keyof typeof ESCOPOS)[]).map((esc) => {
        const doEscopo = inds.filter((i) => i.escopo === esc);
        if (!doEscopo.length) return null;
        return (
          <Secao key={esc} titulo={ESCOPOS[esc]}>
            <div className="space-y-4">
              {agrupar(doEscopo).map(([grupo, lista]) => (
                <div key={grupo} className="card divide-y divide-ink-100 p-0">
                  {(esc === 'ambicao' || grupo !== 'Outros indicadores') && <p className="bg-ink-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-500">{grupo}</p>}
                  {lista.map((i) => {
                    const at = atingimento(i, metas, meds, anoRef);
                    const vinculo = i.objetivo_id ? objs.get(i.objetivo_id)?.codigo : i.area_id ? areas.get(i.area_id)?.nome : null;
                    return (
                      <Link key={i.id} to={`/indicadores/${i.id}`} className="grid items-center gap-2 px-4 py-3 hover:bg-ink-50 sm:grid-cols-[1fr_200px_200px]">
                        <div>
                          <p className="font-semibold">{i.nome}
                            {i.formula && <Calculator className="ml-1.5 inline h-3.5 w-3.5 text-ink-400" />}
                            {i.pendencia && <AlertCircle className="ml-1.5 inline h-3.5 w-3.5 text-amber-600" />}
                          </p>
                          <p className="text-xs text-ink-500">{[i.codigo, vinculo].filter(Boolean).join(' · ')}</p>
                        </div>
                        <p className="text-xs text-ink-600 tabular-nums">base {fmtValor(i.linha_base, i.unidade)} · meta {fmtValor(at.meta, i.unidade)}</p>
                        <Progresso valor={at.pct} compacto />
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </Secao>
        );
      })}
      {ed.modal}
    </>
  );
}

export function IndicadorPage() {
  const { id } = useParams();
  const metr = useMetricas();
  const bruto = useRow('pe_indicadores', id);
  const metasBrutas = useList('pe_indicador_metas', { indicador_id: id });
  const medsBrutas = useList('pe_indicador_medicoes', { indicador_id: id });
  const i = metr.inds.find((x) => x.id === id);
  const obj = useRow('pe_objetivos', i?.objetivo_id ?? undefined);
  const pessoas = useIndex('org_pessoas');
  const { anos, anoRef, ciclo } = useCiclo();
  const pode = usePode();
  const edInd = useEditor('pe_indicadores', 'indicador');
  const edMed = useEditor('pe_indicador_medicoes', 'medição');
  const salvarMeta = useSave('pe_indicador_metas');
  const removerMeta = useRemove('pe_indicador_metas');
  const [rascunho, setRascunho] = useState<Record<number, string>>({});
  if (!i || !bruto.data) return <Carregando />;
  const calculado = Boolean(i.formula);
  const podeEditar = pode.editarDaArea(i.area_id) && !calculado;
  const at = atingimento(i, metr.metas, metr.meds, anoRef);
  const metaDe = (ano: number) => metr.metas.find((m) => m.indicador_id === i.id && m.ano === ano)?.meta;
  const porCodigo = new Map(metr.inds.filter((x) => x.codigo).map((x) => [x.codigo!.toLowerCase(), x]));
  const usadoEm = metr.inds.filter((x) => i.codigo && x.formula && referencias(x.formula).includes(i.codigo.toLowerCase()));

  async function gravarMeta(ano: number) {
    const txt = rascunho[ano];
    if (txt === undefined) return;
    const existente = (metasBrutas.data ?? []).find((m) => m.ano === ano);
    if (txt === '') { if (existente) await removerMeta.mutateAsync(existente.id); }
    else await salvarMeta.mutateAsync({ id: existente?.id, indicador_id: i!.id, ano, meta: Number(txt.replace(',', '.')) });
    setRascunho((r) => { const n = { ...r }; delete n[ano]; return n; });
  }

  const migalhas = i.escopo === 'ambicao'
    ? [{ label: 'Ambição 2030', to: '/ambicao' }, { label: i.nome }]
    : obj.data ? [{ label: 'Mapa estratégico', to: '/estrategia' }, { label: obj.data.codigo ?? obj.data.titulo, to: `/estrategia/objetivos/${obj.data.id}` }, { label: i.nome }]
    : [{ label: 'Indicadores', to: '/indicadores' }, { label: i.nome }];

  return (
    <>
      <PageHeader migalhas={migalhas}
        sobretitulo={`${i.grupo ? i.grupo + ' · ' : ''}${i.unidade ?? ''} · ${i.polaridade === 'maior' ? 'quanto maior, melhor' : 'quanto menor, melhor'}`}
        titulo={i.nome} subtitulo={<>Código: <code>{i.codigo ?? '—'}</code> · Responsável: {pessoas.get(i.responsavel_id ?? '')?.nome ?? '—'} · Frequência: {i.frequencia ?? '—'}</>}
        acoes={pode.editarDaArea(i.area_id) && <button className="btn-secondary text-xs" onClick={() => edInd.editar(bruto.data!)}>Editar definição</button>} />

      {i.pendencia && (
        <div className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><b>A validar:</b> {i.pendencia}</div>
        </div>
      )}
      {calculado && (
        <div className="card mb-4 text-sm">
          <p className="label">Indicador calculado</p>
          <p><code className="rounded bg-ink-100 px-2 py-1">{i.formula}</code></p>
          {metr.erros.has(i.id) && <p className="mt-2 text-red-700">{metr.erros.get(i.id)}</p>}
          <p className="mt-2 text-xs text-ink-500">
            Depende de:{' '}
            {referencias(i.formula!).map((c, k) => {
              const ref = porCodigo.get(c);
              return <span key={c}>{k > 0 && ', '}{ref ? <Link className="underline" to={`/indicadores/${ref.id}`}>{ref.nome}</Link> : <span className="text-red-700">{c} (não existe)</span>}</span>;
            })}
          </p>
        </div>
      )}
      {i.descricao && <div className="card mb-4"><p className="label">Definição</p><Texto>{i.descricao}</Texto></div>}
      {usadoEm.length > 0 && (
        <p className="mb-4 text-xs text-ink-500">Usado no cálculo de: {usadoEm.map((u, k) => <span key={u.id}>{k > 0 && ', '}<Link className="underline" to={`/indicadores/${u.id}`}>{u.nome}</Link></span>)}</p>
      )}

      <div className="mb-6 card"><p className="label">Atingimento {anoRef}</p><Progresso valor={at.pct} /></div>

      <Secao titulo={calculado ? 'Valores por ano (calculados)' : 'Linha de base e metas por ano'}>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="card py-3"><p className="label">{ciclo ? ciclo.ano_inicio - 1 : 'Base'} (base)</p><p className="text-lg font-bold">{fmtValor(i.linha_base, i.unidade)}</p></div>
          {anos.map((ano) => (
            <div key={ano} className="card py-3">
              <p className="label">Meta {ano}</p>
              {podeEditar ? (
                <input className="input text-lg font-bold" type="number" step="any"
                  value={rascunho[ano] ?? (metaDe(ano) !== undefined ? String(metaDe(ano)) : '')}
                  onChange={(e) => setRascunho((r) => ({ ...r, [ano]: e.target.value }))}
                  onBlur={() => gravarMeta(ano)} />
              ) : <p className="text-lg font-bold">{fmtValor(metaDe(ano), i.unidade)}</p>}
            </div>
          ))}
        </div>
        {podeEditar && <p className="mt-2 text-xs text-ink-500">A linha de base é editada em "Editar definição". As metas salvam ao sair do campo.</p>}
      </Secao>

      {calculado ? (
        <Secao titulo="Realizado por ano (calculado)">
          <div className="card divide-y divide-ink-100 p-0">
            {metr.meds.filter((m) => m.indicador_id === i.id).map((m) => (
              <div key={m.id} className="flex justify-between px-4 py-3 text-sm"><span>{m.data_ref.slice(0, 4)}</span><b className="tabular-nums">{fmtValor(m.valor, i.unidade)}</b></div>
            ))}
            {!metr.meds.some((m) => m.indicador_id === i.id) && <div className="p-4"><Vazio>Lance as medições dos indicadores de origem.</Vazio></div>}
          </div>
        </Secao>
      ) : (
        <Secao titulo="Medições" acoes={pode.registrar && <BotaoNovo onClick={() => edMed.novo({ indicador_id: i.id, autor_id: pode.pessoaId })}>Lançar medição</BotaoNovo>}>
          <div className="card divide-y divide-ink-100 p-0">
            {[...(medsBrutas.data ?? [])].sort((a, b) => b.data_ref.localeCompare(a.data_ref)).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="w-24 tabular-nums text-ink-500">{fmtData(m.data_ref)}</span>
                <span className="w-28 font-bold tabular-nums">{fmtValor(m.valor, i.unidade)}</span>
                <span className="flex-1 text-ink-600">{m.comentario}</span>
                {pode.diretoria && <BotoesLinha onEditar={() => edMed.editar(m)} onExcluir={() => edMed.excluir(m)} />}
              </div>
            ))}
            {!medsBrutas.data?.length && <div className="p-4"><Vazio>Nenhuma medição lançada.</Vazio></div>}
          </div>
        </Secao>
      )}
      {edInd.modal}{edMed.modal}
    </>
  );
}
