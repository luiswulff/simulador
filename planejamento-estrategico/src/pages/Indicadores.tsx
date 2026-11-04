import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useIndex, useList, useRemove, useRow, useSave } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, PageHeader, Progresso, Secao, Texto, Vazio } from '../components/ui';
import { atingimento } from '../lib/progresso';
import { fmtData, fmtValor } from '../lib/format';

const ESCOPOS = { ambicao: 'Ambição (firma)', objetivo: 'Objetivos estratégicos', area: 'Áreas' } as const;

export function IndicadoresPage() {
  const { ciclo, anoRef } = useCiclo();
  const inds = useList('pe_indicadores');
  const metas = useList('pe_indicador_metas');
  const meds = useList('pe_indicador_medicoes');
  const objs = useIndex('pe_objetivos');
  const areas = useIndex('org_areas');
  const pode = usePode();
  const ed = useEditor('pe_indicadores', 'indicador');
  if (!ciclo || inds.isLoading) return <Carregando />;

  return (
    <>
      <PageHeader sobretitulo="Desdobramento" titulo="Indicadores" subtitulo={`Atingimento das metas de ${anoRef} com base na medição mais recente.`}
        acoes={pode.diretoria && <BotaoNovo onClick={() => ed.novo({ ciclo_id: ciclo.id, escopo: 'objetivo', polaridade: 'maior' })}>Indicador</BotaoNovo>} />
      {(Object.keys(ESCOPOS) as (keyof typeof ESCOPOS)[]).map((esc) => {
        const lista = (inds.data ?? []).filter((i) => i.escopo === esc);
        if (!lista.length) return null;
        return (
          <Secao key={esc} titulo={ESCOPOS[esc]}>
            <div className="card divide-y divide-ink-100 p-0">
              {lista.map((i) => {
                const at = atingimento(i, metas.data ?? [], meds.data ?? [], anoRef);
                const vinculo = i.objetivo_id ? objs.get(i.objetivo_id)?.codigo : i.area_id ? areas.get(i.area_id)?.nome : null;
                return (
                  <Link key={i.id} to={`/indicadores/${i.id}`} className="grid items-center gap-2 px-4 py-3 hover:bg-ink-50 sm:grid-cols-[1fr_160px_200px]">
                    <div><p className="font-semibold">{i.nome}</p>{vinculo && <p className="text-xs text-ink-500">{vinculo}</p>}</div>
                    <p className="text-xs text-ink-600 tabular-nums">{fmtValor(at.valor, i.unidade)} / {fmtValor(at.meta, i.unidade)}</p>
                    <Progresso valor={at.pct} compacto />
                  </Link>
                );
              })}
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
  const ind = useRow('pe_indicadores', id);
  const metas = useList('pe_indicador_metas', { indicador_id: id });
  const meds = useList('pe_indicador_medicoes', { indicador_id: id });
  const obj = useRow('pe_objetivos', ind.data?.objetivo_id ?? undefined);
  const pessoas = useIndex('org_pessoas');
  const { anos, anoRef } = useCiclo();
  const pode = usePode();
  const edInd = useEditor('pe_indicadores', 'indicador');
  const edMed = useEditor('pe_indicador_medicoes', 'medição');
  const salvarMeta = useSave('pe_indicador_metas');
  const removerMeta = useRemove('pe_indicador_metas');
  const [rascunho, setRascunho] = useState<Record<number, string>>({});
  if (!ind.data) return <Carregando />;
  const i = ind.data;
  const podeEditar = pode.editarDaArea(i.area_id);
  const at = atingimento(i, metas.data ?? [], meds.data ?? [], anoRef);

  async function gravarMeta(ano: number) {
    const txt = rascunho[ano];
    if (txt === undefined) return;
    const existente = (metas.data ?? []).find((m) => m.ano === ano);
    if (txt === '') { if (existente) await removerMeta.mutateAsync(existente.id); }
    else await salvarMeta.mutateAsync({ id: existente?.id, indicador_id: i.id, ano, meta: Number(txt) });
    setRascunho((r) => { const n = { ...r }; delete n[ano]; return n; });
  }

  const migalhas = i.escopo === 'ambicao'
    ? [{ label: 'Ambição 2030', to: '/ambicao' }, { label: i.nome }]
    : obj.data ? [{ label: 'Mapa estratégico', to: '/estrategia' }, { label: obj.data.codigo ?? obj.data.titulo, to: `/estrategia/objetivos/${obj.data.id}` }, { label: i.nome }]
    : [{ label: 'Indicadores', to: '/indicadores' }, { label: i.nome }];

  return (
    <>
      <PageHeader migalhas={migalhas} sobretitulo={`Indicador · ${i.unidade ?? ''} · ${i.polaridade === 'maior' ? 'quanto maior, melhor' : 'quanto menor, melhor'}`}
        titulo={i.nome} subtitulo={<>Responsável: {pessoas.get(i.responsavel_id ?? '')?.nome ?? '—'} · Frequência: {i.frequencia ?? '—'}</>}
        acoes={podeEditar && <button className="btn-secondary text-xs" onClick={() => edInd.editar(i)}>Editar</button>} />
      {i.descricao && <div className="card mb-6"><Texto>{i.descricao}</Texto></div>}

      <div className="mb-6 card"><p className="label">Atingimento {anoRef}</p><Progresso valor={at.pct} /></div>

      <Secao titulo="Metas por ano">
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="card py-3"><p className="label">Base</p><p className="text-lg font-bold">{fmtValor(i.linha_base, i.unidade)}</p></div>
          {anos.map((ano) => {
            const m = (metas.data ?? []).find((x) => x.ano === ano);
            return (
              <div key={ano} className="card py-3">
                <p className="label">{ano}</p>
                {podeEditar ? (
                  <input className="input text-lg font-bold" type="number" step="any"
                    value={rascunho[ano] ?? (m ? String(m.meta) : '')}
                    onChange={(e) => setRascunho((r) => ({ ...r, [ano]: e.target.value }))}
                    onBlur={() => gravarMeta(ano)} />
                ) : <p className="text-lg font-bold">{fmtValor(m?.meta, i.unidade)}</p>}
              </div>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Medições" acoes={pode.registrar && <BotaoNovo onClick={() => edMed.novo({ indicador_id: i.id, autor_id: pode.pessoaId })}>Lançar medição</BotaoNovo>}>
        <div className="card divide-y divide-ink-100 p-0">
          {[...(meds.data ?? [])].sort((a, b) => b.data_ref.localeCompare(a.data_ref)).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="w-24 tabular-nums text-ink-500">{fmtData(m.data_ref)}</span>
              <span className="w-28 font-bold tabular-nums">{fmtValor(m.valor, i.unidade)}</span>
              <span className="flex-1 text-ink-600">{m.comentario}</span>
              {pode.diretoria && <BotoesLinha onEditar={() => edMed.editar(m)} onExcluir={() => edMed.excluir(m)} />}
            </div>
          ))}
          {!meds.data?.length && <div className="p-4"><Vazio>Nenhuma medição lançada.</Vazio></div>}
        </div>
      </Secao>
      {edInd.modal}{edMed.modal}
    </>
  );
}
