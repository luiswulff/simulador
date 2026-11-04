import { Link } from 'react-router-dom';
import { useList } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, PageHeader, Secao, StatusBadge } from '../components/ui';
import { atingimento } from '../lib/progresso';
import { fmtValor } from '../lib/format';

export function AmbicaoPage() {
  const { ciclo, anos, anoRef } = useCiclo();
  const inds = useList('pe_indicadores', { escopo: 'ambicao' });
  const metas = useList('pe_indicador_metas');
  const meds = useList('pe_indicador_medicoes');
  const marcos = useList('pe_marcos');
  const pode = usePode();
  const edCiclo = useEditor('pe_ciclos', 'ciclo');
  const edInd = useEditor('pe_indicadores', 'indicador');
  const edMarco = useEditor('pe_marcos', 'marco');
  if (!ciclo || inds.isLoading) return <Carregando />;

  const meta = (indId: string, ano: number) => (metas.data ?? []).find((m) => m.indicador_id === indId && m.ano === ano)?.meta;

  return (
    <>
      <PageHeader sobretitulo="Direção" titulo="Ambição 2030 — onde queremos chegar"
        acoes={pode.editarEstrutura && <button className="btn-secondary text-xs" onClick={() => edCiclo.editar(ciclo)}>Editar ambição</button>} />

      <div className="card mb-8 bg-accent-900 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-accent-200">Ambição do ciclo {ciclo.ano_inicio}–{ciclo.ano_fim}</p>
        <p className="mt-2 text-xl font-bold leading-snug">{ciclo.ambicao ?? 'A definir.'}</p>
      </div>

      <Secao titulo="Metas da firma, ano a ano"
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => edInd.novo({ ciclo_id: ciclo.id, escopo: 'ambicao', polaridade: 'maior', frequencia: 'anual' })}>Indicador</BotaoNovo>}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Indicador</th>
                <th className="px-3 py-3 text-right">Base {ciclo.ano_inicio - 1}</th>
                {anos.map((a) => <th key={a} className={`px-3 py-3 text-right ${a === anoRef ? 'text-accent-700' : ''}`}>{a}</th>)}
                <th className="px-3 py-3 text-right">Realizado {anoRef}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {(inds.data ?? []).map((i) => {
                const at = atingimento(i, metas.data ?? [], meds.data ?? [], anoRef);
                return (
                  <tr key={i.id} className="hover:bg-ink-50">
                    <td className="px-4 py-3"><Link className="font-semibold hover:text-accent-700 hover:underline" to={`/indicadores/${i.id}`}>{i.nome}</Link></td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-500">{fmtValor(i.linha_base, i.unidade)}</td>
                    {anos.map((a) => <td key={a} className={`px-3 py-3 text-right tabular-nums ${a === anoRef ? 'font-bold' : ''}`}>{fmtValor(meta(i.id, a), i.unidade)}</td>)}
                    <td className="px-3 py-3 text-right tabular-nums">
                      {fmtValor(at.valor, i.unidade)}{at.pct !== null && <span className="ml-1 text-xs text-ink-500">({at.pct}%)</span>}
                    </td>
                    <td className="px-2">{pode.editarEstrutura && <BotoesLinha onEditar={() => edInd.editar(i)} onExcluir={() => edInd.excluir(i, i.nome)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-500">Clique no indicador para editar as metas por ano e lançar medições.</p>
      </Secao>

      <Secao titulo="Roadmap da transformação">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {anos.map((ano) => (
            <div key={ano} className={`card ${ano === anoRef ? 'ring-2 ring-accent-600' : ''}`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-lg font-extrabold">{ano}</p>
                {pode.editarEstrutura && <BotaoNovo onClick={() => edMarco.novo({ ciclo_id: ciclo.id, ano, status: 'nao_iniciado' })}>Marco</BotaoNovo>}
              </div>
              <ul className="space-y-3">
                {(marcos.data ?? []).filter((m) => m.ano === ano).map((m) => (
                  <li key={m.id} className="text-sm">
                    <p className="font-medium">{m.titulo}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <StatusBadge status={m.status} />
                      {pode.editarEstrutura && <BotoesLinha onEditar={() => edMarco.editar(m)} onExcluir={() => edMarco.excluir(m, m.titulo)} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Secao>
      {edCiclo.modal}{edInd.modal}{edMarco.modal}
    </>
  );
}
