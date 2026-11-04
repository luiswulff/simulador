import { useState } from 'react';
import { useList } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, PageHeader, Secao, Texto } from '../components/ui';
import { Restrito } from './Gente';
import { fmtMi, fmtNum } from '../lib/format';
import type { ValuationCenario, ValuationProjecao } from '../data/types';

/**
 * Dois métodos, deliberadamente simples e transparentes:
 *  1) Múltiplo: EV(ano) = EBITDA(ano) × múltiplo EV/EBITDA do cenário.
 *  2) DCF simplificado: usa o lucro líquido projetado como proxy de fluxo de caixa
 *     livre, desconta pela taxa do cenário e soma a perpetuidade de Gordon.
 * Para um laudo formal, substitua por um modelo completo (capex, capital de giro, IR).
 */
function dcf(c: ValuationCenario, proj: ValuationProjecao[], anoBase: number) {
  const r = (c.taxa_desconto_pct ?? 0) / 100;
  const g = (c.crescimento_perpetuo_pct ?? 0) / 100;
  const fut = proj.filter((p) => p.ano > anoBase).sort((a, b) => a.ano - b.ano);
  if (!fut.length || r <= g) return null;
  let vp = 0;
  fut.forEach((p, i) => { vp += (p.lucro_liquido ?? 0) / Math.pow(1 + r, i + 1); });
  const ultimo = fut[fut.length - 1].lucro_liquido ?? 0;
  const terminal = (ultimo * (1 + g)) / (r - g) / Math.pow(1 + r, fut.length);
  return vp + terminal;
}

export function ValuationPage() {
  const { ciclo } = useCiclo();
  const cenarios = useList('pe_valuation_cenarios');
  const proj = useList('pe_valuation_projecoes');
  const pode = usePode();
  const edC = useEditor('pe_valuation_cenarios', 'cenário');
  const edP = useEditor('pe_valuation_projecoes', 'projeção');
  const [sel, setSel] = useState<string | null>(null);
  if (!pode.verConfidencial) return <Restrito />;
  if (!ciclo || cenarios.isLoading) return <Carregando />;

  const lista = [...(cenarios.data ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const atual = lista.find((c) => c.id === sel) ?? lista.find((c) => c.nome.toLowerCase() === 'base') ?? lista[0];
  const anoBase = ciclo.ano_inicio - 1;
  const projDe = (cid: string) => (proj.data ?? []).filter((p) => p.cenario_id === cid).sort((a, b) => a.ano - b.ano);
  const ev = (c: ValuationCenario, p: ValuationProjecao) => (p.ebitda ?? 0) * (c.multiplo_ebitda ?? 0);
  const evFinal = (c: ValuationCenario) => { const ps = projDe(c.id); const u = ps[ps.length - 1]; return u ? ev(c, u) : 0; };
  const evBase = (c: ValuationCenario) => { const p = projDe(c.id).find((x) => x.ano === anoBase); return p ? ev(c, p) : 0; };
  const max = Math.max(1, ...lista.map(evFinal));

  return (
    <>
      <PageHeader sobretitulo="Valor · confidencial" titulo="Valuation"
        subtitulo={`Quanto a firma vale hoje (${anoBase}) e quanto valerá em ${ciclo.ano_fim} se o plano for executado.`}
        acoes={<BotaoNovo onClick={() => edC.novo({ ciclo_id: ciclo.id, ordem: lista.length })}>Cenário</BotaoNovo>} />

      <Secao titulo={`Enterprise value por cenário (múltiplo de EBITDA): ${anoBase} → ${ciclo.ano_fim}`}>
        <div className="card space-y-4">
          {lista.map((c) => (
            <button key={c.id} onClick={() => setSel(c.id)} className={`block w-full rounded-lg p-2 text-left ${atual?.id === c.id ? 'bg-accent-50 ring-1 ring-accent-300' : 'hover:bg-ink-50'}`}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{c.nome}</span>
                <span className="tabular-nums">{fmtMi(evBase(c))} → <b>{fmtMi(evFinal(c))}</b>{evBase(c) > 0 && <span className="ml-1 text-xs text-ink-500">({fmtNum(evFinal(c) / evBase(c), 1)}×)</span>}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-accent-700" style={{ width: `${(evFinal(c) / max) * 100}%` }} /></div>
            </button>
          ))}
        </div>
      </Secao>

      {atual && (
        <Secao titulo={`Cenário ${atual.nome}`} acoes={<span className="flex gap-2">
          <BotaoNovo onClick={() => edP.novo({ cenario_id: atual.id })}>Ano</BotaoNovo>
          <BotoesLinha onEditar={() => edC.editar(atual)} onExcluir={() => edC.excluir(atual, atual.nome)} /></span>}>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="card py-3"><p className="label">EV/EBITDA</p><p className="text-lg font-bold">{fmtNum(atual.multiplo_ebitda, 1)}×</p></div>
            <div className="card py-3"><p className="label">WACC</p><p className="text-lg font-bold">{fmtNum(atual.taxa_desconto_pct, 1)}%</p></div>
            <div className="card py-3"><p className="label">g perpetuidade</p><p className="text-lg font-bold">{fmtNum(atual.crescimento_perpetuo_pct, 1)}%</p></div>
            <div className="card py-3"><p className="label">DCF simplificado ({anoBase})</p><p className="text-lg font-bold">{fmtMi(dcf(atual, projDe(atual.id), anoBase))}</p></div>
          </div>
          {atual.descricao && <div className="card mb-4"><Texto>{atual.descricao}</Texto></div>}
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500"><tr>
                <th className="px-4 py-3">Ano</th><th className="px-3 text-right">Receita</th><th className="px-3 text-right">EBITDA</th><th className="px-3 text-right">Margem</th>
                <th className="px-3 text-right">Lucro líquido</th><th className="px-3 text-right">EV (múltiplo)</th><th /></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {projDe(atual.id).map((p) => (
                  <tr key={p.id}><td className="px-4 py-2 font-semibold">{p.ano}{p.ano === anoBase && <span className="ml-1 text-xs text-ink-400">(base)</span>}</td>
                    <td className="px-3 text-right tabular-nums">{fmtMi(p.receita)}</td><td className="px-3 text-right tabular-nums">{fmtMi(p.ebitda)}</td>
                    <td className="px-3 text-right tabular-nums">{p.receita ? `${fmtNum(((p.ebitda ?? 0) / p.receita) * 100, 1)}%` : '—'}</td>
                    <td className="px-3 text-right tabular-nums">{fmtMi(p.lucro_liquido)}</td><td className="px-3 text-right font-bold tabular-nums">{fmtMi(ev(atual, p))}</td>
                    <td className="px-2 text-right"><BotoesLinha onEditar={() => edP.editar(p)} onExcluir={() => edP.excluir(p, String(p.ano))} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">EV = EBITDA × múltiplo. DCF usa lucro líquido como proxy de fluxo de caixa livre — indicativo, não substitui laudo.</p>
        </Secao>
      )}
      {edC.modal}{edP.modal}
    </>
  );
}
