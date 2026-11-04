import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCheck } from 'lucide-react';
import { useList, useRemove, useSave } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, PageHeader, Secao, Vazio } from '../components/ui';
import type { Objetivo, Quadrante, SwotItem, SwotObjetivo } from '../data/types';

export const QUADRANTES: Record<Quadrante, { nome: string; dica: string; cor: string; fundo: string }> = {
  forca: { nome: 'Forças', dica: 'Interno · ajuda', cor: '#4f8a64', fundo: '#eef5f0' },
  fraqueza: { nome: 'Fraquezas', dica: 'Interno · atrapalha', cor: '#b7791f', fundo: '#fbf3e4' },
  oportunidade: { nome: 'Oportunidades', dica: 'Externo · ajuda', cor: '#4a67a8', fundo: '#eef1f8' },
  ameaca: { nome: 'Ameaças', dica: 'Externo · atrapalha', cor: '#b5473a', fundo: '#f9ecea' },
};
const ORDEM: Quadrante[] = ['forca', 'fraqueza', 'oportunidade', 'ameaca'];

function Impacto({ valor }: { valor?: number | null }) {
  if (!valor) return null;
  return (
    <span className="inline-flex items-center gap-0.5" title={`Impacto ${valor} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= valor ? 'bg-ink-700' : 'bg-ink-200'}`} />)}
    </span>
  );
}

const ordenar = (a: SwotItem, b: SwotItem) => (b.impacto ?? 0) - (a.impacto ?? 0) || (a.ordem ?? 0) - (b.ordem ?? 0);

export function SwotPage() {
  const { ciclo } = useCiclo();
  const itens = useList('pe_swot');
  const vinculos = useList('pe_swot_objetivos');
  const objetivos = useList('pe_objetivos');
  const pode = usePode();
  const ed = useEditor('pe_swot', 'item da SWOT');
  const salvarItem = useSave('pe_swot');
  const salvarVinculo = useSave('pe_swot_objetivos');
  const removerVinculo = useRemove('pe_swot_objetivos');
  if (!ciclo || itens.isLoading) return <Carregando />;

  const lista = itens.data ?? [];
  const V = vinculos.data ?? [];
  const objs = [...(objetivos.data ?? [])].sort((a, b) => (a.codigo ?? '').localeCompare(b.codigo ?? ''));
  const objsDe = (swotId: string) => V.filter((v) => v.swot_id === swotId).map((v) => ({ v, o: objs.find((o) => o.id === v.objetivo_id) })).filter((x): x is { v: SwotObjetivo; o: Objetivo } => Boolean(x.o));
  const rascunhos = lista.filter((i) => i.rascunho);
  const lacunas = lista.filter((i) => (i.impacto ?? 0) >= 4 && !V.some((v) => v.swot_id === i.id)).sort(ordenar);

  async function validarTodos() {
    if (!confirm(`Marcar os ${rascunhos.length} itens em rascunho como validados?`)) return;
    for (const i of rascunhos) await salvarItem.mutateAsync({ id: i.id, rascunho: false });
  }

  return (
    <>
      <PageHeader sobretitulo="Direção" titulo="Análise SWOT"
        subtitulo="O diagnóstico que justifica a estratégia: o que temos (forças e fraquezas) diante do que o mercado traz (oportunidades e ameaças). Cada item deve ser respondido por ao menos um objetivo."
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => ed.novo({ ciclo_id: ciclo.id, quadrante: 'forca', impacto: 3 })}>Item</BotaoNovo>} />

      {rascunhos.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-200 bg-accent-50 px-5 py-3 text-sm text-accent-800">
          <span><b>{rascunhos.length} itens em rascunho.</b> Montados a partir do quadro 2026 e do OnePage. Valide, ajuste ou exclua com os sócios.</span>
          {pode.editarEstrutura && <button className="btn-secondary px-3 py-1.5 text-xs" onClick={validarTodos}><CheckCheck className="h-3.5 w-3.5" /> Marcar todos como validados</button>}
        </div>
      )}

      <div className="mb-2 hidden grid-cols-[90px_1fr_1fr] gap-4 text-center lg:grid">
        <span />
        <span className="rotulo">Ajuda a atingir a ambição</span>
        <span className="rotulo">Atrapalha</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)]">
        {(['interno', 'externo'] as const).map((eixo) => (
          <div key={eixo} className="contents">
            <div className="hidden items-center justify-center lg:flex">
              <span className="rotulo -rotate-90 whitespace-nowrap">{eixo === 'interno' ? 'Interno (nós)' : 'Externo (mercado)'}</span>
            </div>
            {(eixo === 'interno' ? (['forca', 'fraqueza'] as Quadrante[]) : (['oportunidade', 'ameaca'] as Quadrante[])).map((q) => {
              const Q = QUADRANTES[q];
              const doQuadrante = lista.filter((i) => i.quadrante === q).sort(ordenar);
              return (
                <section key={q} className="min-w-0 rounded-2xl border border-ink-100 p-4 shadow-card" style={{ background: Q.fundo, borderTop: `4px solid ${Q.cor}` }}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold" style={{ color: Q.cor }}>{Q.nome} <span className="text-sm font-normal text-ink-500">({doQuadrante.length})</span></p>
                      <p className="text-xs text-ink-500">{Q.dica}</p>
                    </div>
                    {pode.editarEstrutura && <BotaoNovo onClick={() => ed.novo({ ciclo_id: ciclo.id, quadrante: q, impacto: 3, ordem: doQuadrante.length })}>Item</BotaoNovo>}
                  </div>
                  <ul className="space-y-2">
                    {doQuadrante.map((i) => {
                      const ligados = objsDe(i.id);
                      return (
                        <li key={i.id} className="rounded-xl bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold leading-snug text-ink-950">{i.titulo}</p>
                            <span className="flex shrink-0 items-center gap-2">
                              <Impacto valor={i.impacto} />
                              {pode.editarEstrutura && <BotoesLinha onEditar={() => ed.editar(i)} onExcluir={() => ed.excluir(i, i.titulo)} />}
                            </span>
                          </div>
                          {i.descricao && <p className="mt-1 text-sm text-ink-600">{i.descricao}</p>}
                          {i.evidencia && (
                            <details className="mt-1 text-xs text-ink-500">
                              <summary className="cursor-pointer select-none hover:text-ink-700">Evidência</summary>
                              <p className="mt-1 whitespace-pre-line">{i.evidencia}</p>
                            </details>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {i.rascunho && <span className="chip bg-accent-100 text-accent-800">rascunho</span>}
                            {ligados.map(({ v, o }) => (
                              <span key={v.id} className="chip bg-ink-100 text-ink-700">
                                <Link to={`/estrategia/objetivos/${o.id}`} className="hover:underline" title={o.titulo}>{o.codigo ?? o.titulo}</Link>
                                {pode.editarEstrutura && <button className="ml-0.5 text-ink-400 hover:text-red-700" title="Desvincular" onClick={() => removerVinculo.mutate(v.id)}>×</button>}
                              </span>
                            ))}
                            {!ligados.length && <span className="chip bg-white text-ink-400 ring-1 ring-ink-200">sem objetivo</span>}
                            {pode.editarEstrutura && objs.length > 0 && (
                              <select className="w-28 rounded-full border border-dashed border-ink-300 bg-transparent px-2 py-0.5 text-xs text-ink-500" value=""
                                onChange={(e) => e.target.value && salvarVinculo.mutate({ swot_id: i.id, objetivo_id: e.target.value })}>
                                <option value="">+ objetivo</option>
                                {objs.filter((o) => !ligados.some((l) => l.o.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.codigo} {o.titulo}</option>)}
                              </select>
                            )}
                          </div>
                        </li>
                      );
                    })}
                    {!doQuadrante.length && <Vazio>Nenhum item.</Vazio>}
                  </ul>
                </section>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Secao titulo={`Lacunas — impacto alto sem objetivo (${lacunas.length})`}>
          <div className="card space-y-3">
            {lacunas.map((i) => (
              <div key={i.id} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: QUADRANTES[i.quadrante].cor }} />
                <div><b>{i.titulo}</b> <span className="text-xs text-ink-500">· {QUADRANTES[i.quadrante].nome.slice(0, -1)} · impacto {i.impacto}</span></div>
              </div>
            ))}
            {!lacunas.length && <p className="text-sm text-emerald-700">Todo item de impacto alto é respondido por algum objetivo.</p>}
            <p className="text-xs text-ink-500">Uma fraqueza ou ameaça relevante sem objetivo é um risco não tratado; uma oportunidade sem objetivo é valor deixado na mesa.</p>
          </div>
        </Secao>

        <Secao titulo="Cruzamento objetivos × SWOT">
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[440px] text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr><th className="px-4 py-3">Objetivo</th>{ORDEM.map((q) => <th key={q} className="px-2 py-3 text-center" style={{ color: QUADRANTES[q].cor }}>{QUADRANTES[q].nome.slice(0, 4)}.</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {objs.map((o) => {
                  const ids = V.filter((v) => v.objetivo_id === o.id).map((v) => v.swot_id);
                  return (
                    <tr key={o.id} className="hover:bg-ink-50">
                      <td className="px-4 py-2"><Link to={`/estrategia/objetivos/${o.id}`} className="hover:underline"><b className="mr-1 text-ink-400">{o.codigo}</b>{o.titulo}</Link></td>
                      {ORDEM.map((q) => {
                        const n = lista.filter((i) => i.quadrante === q && ids.includes(i.id)).length;
                        return <td key={q} className="px-2 py-2 text-center tabular-nums">{n || <span className="text-ink-300">·</span>}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-ink-500">Objetivo sem nenhum item da SWOT merece a pergunta: por que ele existe?</p>
          </div>
        </Secao>
      </div>
      {ed.modal}
    </>
  );
}
