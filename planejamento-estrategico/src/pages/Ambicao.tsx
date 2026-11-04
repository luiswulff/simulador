import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Calculator } from 'lucide-react';
import { useList } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { agrupar, cagr, useMetricas } from '../data/metricas';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, PageHeader, Secao, StatusBadge } from '../components/ui';
import { atingimento } from '../lib/progresso';
import { fmtNum, fmtValor } from '../lib/format';

export function AmbicaoPage() {
  const { ciclo, anos, anoRef } = useCiclo();
  const { inds, metas, meds, erros, carregando } = useMetricas();
  const marcos = useList('pe_marcos');
  const pode = usePode();
  const edCiclo = useEditor('pe_ciclos', 'ciclo');
  const edInd = useEditor('pe_indicadores', 'indicador');
  const edMarco = useEditor('pe_marcos', 'marco');
  if (!ciclo || carregando) return <Carregando />;

  const daAmbicao = inds.filter((i) => i.escopo === 'ambicao');
  const meta = (indId: string, ano: number) => metas.find((m) => m.indicador_id === indId && m.ano === ano)?.meta;
  const pendentes = daAmbicao.filter((i) => i.pendencia);
  const anoBase = ciclo.ano_inicio - 1;

  return (
    <>
      <PageHeader sobretitulo="Direção" titulo="Ambição 2030 — onde queremos chegar"
        acoes={pode.editarEstrutura && <button className="btn-secondary text-xs" onClick={() => edCiclo.editar(ciclo)}>Editar ambição</button>} />

      <div className="card-destaque mb-8">
        <p className="rotulo text-accent-700">Ambição do ciclo {ciclo.ano_inicio}–{ciclo.ano_fim}</p>
        <p className="mt-3 text-2xl font-semibold leading-snug text-ink-950">{ciclo.ambicao ?? 'A definir.'}</p>
      </div>

      <Secao titulo={`Scorecard ${anoBase}–${ciclo.ano_fim}`}
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => edInd.novo({ ciclo_id: ciclo.id, escopo: 'ambicao', polaridade: 'maior', frequencia: 'anual' })}>Indicador</BotaoNovo>}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Indicador</th>
                <th className="px-3 py-3 text-right">{anoBase} (base)</th>
                {anos.map((a) => <th key={a} className={`px-3 py-3 text-right ${a === anoRef ? 'text-accent-700' : ''}`}>{a}</th>)}
                <th className="px-3 py-3 text-right" title={`Crescimento anual composto ${anoBase}→${ciclo.ano_fim}`}>CAGR</th>
                <th className="px-3 py-3 text-right">Realizado {anoRef}</th>
                <th />
              </tr>
            </thead>
            {agrupar(daAmbicao).map(([grupo, lista]) => (
              <tbody key={grupo} className="divide-y divide-ink-100">
                <tr><td colSpan={anos.length + 5} className="bg-accent-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-700">{grupo}</td></tr>
                {lista.map((i) => {
                  const at = atingimento(i, metas, meds, anoRef);
                  const c = i.unidade === '%' ? null : cagr(i.linha_base, meta(i.id, ciclo.ano_fim), ciclo.ano_fim - anoBase);
                  return (
                    <tr key={i.id} className="hover:bg-ink-50">
                      <td className="px-4 py-2.5">
                        <Link className="font-semibold hover:text-accent-700 hover:underline" to={`/indicadores/${i.id}`}>{i.nome}</Link>
                        <span className="ml-2 inline-flex gap-1 align-middle">
                          {i.formula && <span className="chip bg-ink-100 text-ink-600" title={`Calculado: ${i.formula}`}><Calculator className="h-3 w-3" />calc.</span>}
                          {i.pendencia && <span className="chip bg-amber-100 text-amber-800" title={i.pendencia}><AlertCircle className="h-3 w-3" />validar</span>}
                          {erros.has(i.id) && <span className="chip bg-red-100 text-red-800" title={erros.get(i.id)}>erro na fórmula</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{fmtValor(i.linha_base, i.unidade)}</td>
                      {anos.map((a) => <td key={a} className={`px-3 py-2.5 text-right tabular-nums ${a === anoRef ? 'font-bold' : ''}`}>{fmtValor(meta(i.id, a), i.unidade)}</td>)}
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{c === null ? '—' : `${fmtNum(c, 1)}%`}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtValor(at.valor, i.unidade)}{at.pct !== null && <span className="ml-1 text-xs text-ink-500">({at.pct}%)</span>}
                      </td>
                      <td className="px-2">{pode.editarEstrutura && <BotoesLinha onEditar={() => edInd.editar(i)} onExcluir={() => edInd.excluir(i, i.nome)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Clique no indicador para lançar as metas por ano e as medições. Indicadores <b>calc.</b> são calculados automaticamente
          pela fórmula (margens, produtividade, contratos) e se atualizam quando os indicadores de origem mudam.
        </p>
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Simulador base={daAmbicao.find((i) => i.codigo === 'receita_global')?.linha_base ?? null} anoBase={anoBase} anoFim={ciclo.ano_fim} />

        <Secao titulo={`Pendências de definição (${pendentes.length})`}>
          <div className="card max-h-[340px] space-y-3 overflow-y-auto">
            {pendentes.map((i) => (
              <Link key={i.id} to={`/indicadores/${i.id}`} className="block text-sm hover:text-accent-700">
                <p className="font-semibold">{i.nome}</p>
                <p className="text-xs text-ink-600">{i.pendencia}</p>
              </Link>
            ))}
            {!pendentes.length && <p className="text-sm text-emerald-700">Todas as definições foram validadas.</p>}
          </div>
        </Secao>
      </div>

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

/** Sensibilidade: onde a receita global chega em 2030 para diferentes taxas de crescimento. */
function Simulador({ base, anoBase, anoFim }: { base: number | null; anoBase: number; anoFim: number }) {
  const [taxas, setTaxas] = useState([20, 25, 30, 35]);
  const n = anoFim - anoBase;
  return (
    <Secao titulo="Simulador de crescimento da receita global">
      <div className="card">
        {base === null ? (
          <p className="text-sm text-ink-500">Cadastre a linha de base do indicador <code>receita_global</code> para simular.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-500">Base {anoBase}: <b>{fmtValor(base, 'R$ mi')}</b>. Ajuste as taxas para comparar cenários. É uma conta de sensibilidade, não uma meta aprovada.</p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-500"><tr><th className="py-1">Crescimento a.a.</th><th className="text-right">Receita {anoFim}</th><th className="text-right">Múltiplo</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {taxas.map((t, k) => {
                  const fim = base * Math.pow(1 + t / 100, n);
                  return (
                    <tr key={k}>
                      <td className="py-1.5"><input type="number" className="input w-20 py-1" value={t} onChange={(e) => setTaxas((xs) => xs.map((x, j) => (j === k ? Number(e.target.value) : x)))} /> %</td>
                      <td className="text-right font-bold tabular-nums">{fmtValor(fim, 'R$ mi')}</td>
                      <td className="text-right tabular-nums text-ink-600">{fmtNum(fim / base, 1)}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Secao>
  );
}
