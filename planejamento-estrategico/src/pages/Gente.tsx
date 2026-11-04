import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useList } from '../data/hooks';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { Avatar, BotaoNovo, BotoesLinha, Carregando, PageHeader, Texto, Vazio } from '../components/ui';
import { fmtMoeda, fmtNum } from '../lib/format';

export function CargosSalariosPage() {
  const cargos = useList('pe_cargos');
  const faixas = useList('pe_faixas_salariais');
  const pessoas = useList('org_pessoas');
  const pode = usePode();
  const edCargo = useEditor('pe_cargos', 'cargo');
  const edFaixa = useEditor('pe_faixas_salariais', 'faixa salarial');
  if (!pode.verConfidencial) return <Restrito />;
  if (cargos.isLoading) return <Carregando />;

  return (
    <>
      <PageHeader sobretitulo="Gente & Sociedade · confidencial" titulo="Plano de cargos e salários"
        subtitulo="Estrutura de cargos, requisitos e faixas salariais por nível. Visível apenas para a Diretoria."
        acoes={<BotaoNovo onClick={() => edCargo.novo({ ordem: cargos.data?.length ?? 0 })}>Cargo</BotaoNovo>} />
      <div className="space-y-3">
        {[...(cargos.data ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((c) => {
          const fx = (faixas.data ?? []).filter((f) => f.cargo_id === c.id).sort((a, b) => a.nivel.localeCompare(b.nivel));
          const n = (pessoas.data ?? []).filter((p) => p.cargo_id === c.id).length;
          return (
            <details key={c.id} className="card group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span><span className="font-bold">{c.nome}</span><span className="ml-2 text-xs text-ink-500">{c.familia} · {n} pessoa(s)</span></span>
                <span className="flex items-center gap-3 text-xs tabular-nums text-ink-600">
                  {fx.length > 0 && <span>{fmtMoeda(Math.min(...fx.map((f) => f.minimo ?? Infinity)))} – {fmtMoeda(Math.max(...fx.map((f) => f.maximo ?? 0)))}</span>}
                  <BotoesLinha onEditar={() => edCargo.editar(c)} onExcluir={() => edCargo.excluir(c, c.nome)} />
                </span>
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><p className="label">Responsabilidades</p><Texto>{c.descricao}</Texto></div>
                <div><p className="label">Requisitos</p><Texto>{c.requisitos}</Texto></div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs uppercase text-ink-500"><tr><th className="py-2">Nível</th><th className="text-right">Mínimo</th><th className="text-right">Médio</th><th className="text-right">Máximo</th><th className="text-right">Vigência</th><th /></tr></thead>
                  <tbody className="divide-y divide-ink-100">
                    {fx.map((f) => (
                      <tr key={f.id}><td className="py-2 font-semibold">{f.nivel}</td>
                        <td className="text-right tabular-nums">{fmtMoeda(f.minimo)}</td><td className="text-right tabular-nums">{fmtMoeda(f.medio)}</td>
                        <td className="text-right tabular-nums">{fmtMoeda(f.maximo)}</td><td className="text-right">{f.vigencia}</td>
                        <td className="text-right"><BotoesLinha onEditar={() => edFaixa.editar(f)} onExcluir={() => edFaixa.excluir(f, f.nivel)} /></td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2"><BotaoNovo onClick={() => edFaixa.novo({ cargo_id: c.id, vigencia: new Date().getFullYear() + 1 })}>Faixa</BotaoNovo></div>
              </div>
            </details>
          );
        })}
      </div>
      {edCargo.modal}{edFaixa.modal}
    </>
  );
}

export function CarreiraSocietariaPage() {
  const degraus = useList('pe_carreira_degraus');
  const pessoas = useList('org_pessoas');
  const pode = usePode();
  const ed = useEditor('pe_carreira_degraus', 'degrau');
  if (degraus.isLoading) return <Carregando />;
  const lista = [...(degraus.data ?? [])].sort((a, b) => a.ordem - b.ordem);

  return (
    <>
      <PageHeader sobretitulo="Gente & Sociedade" titulo="Plano de carreira societário"
        subtitulo="A trilha até a sociedade: degraus, critérios objetivos, tempo mínimo, participação, direitos e obrigações."
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => ed.novo({ trilha: 'societaria', ordem: lista.length + 1 })}>Degrau</BotaoNovo>} />
      <ol className="space-y-3">
        {lista.map((d, i) => {
          const nele = (pessoas.data ?? []).filter((p) => p.degrau_id === d.id);
          return (
            <li key={d.id} className="card" style={{ marginLeft: `${Math.min(i, 6) * 1.25}rem` }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-accent-600">Degrau {d.ordem}</p>
                  <p className="text-lg font-extrabold">{d.nome}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-600">
                  {d.tempo_minimo_meses ? <span>mín. {d.tempo_minimo_meses} meses</span> : null}
                  {pode.verConfidencial && d.participacao_pct != null && <span className="chip bg-accent-100 text-accent-800">{fmtNum(d.participacao_pct, 1)}% ref.</span>}
                  {pode.editarEstrutura && <BotoesLinha onEditar={() => ed.editar(d)} onExcluir={() => ed.excluir(d, d.nome)} />}
                </div>
              </div>
              {d.descricao && <div className="mt-2"><Texto>{d.descricao}</Texto></div>}
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div><p className="label">Critérios de acesso</p><Texto>{d.criterios}</Texto></div>
                <div><p className="label">Direitos</p><Texto>{d.direitos}</Texto></div>
                <div><p className="label">Obrigações</p><Texto>{d.obrigacoes}</Texto></div>
              </div>
              {nele.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                  {nele.map((p) => <Link key={p.id} to={`/pessoas/${p.id}`} className="chip bg-ink-50 py-1 hover:bg-accent-50"><Avatar nome={p.nome} tamanho="sm" />{p.nome}</Link>)}
                </div>
              )}
            </li>
          );
        })}
        {!lista.length && <Vazio>Nenhum degrau cadastrado.</Vazio>}
      </ol>
    </>
  );
}

export function Restrito() {
  return (
    <div className="py-20 text-center">
      <Lock className="mx-auto h-10 w-10 text-ink-300" />
      <p className="mt-3 font-semibold">Conteúdo confidencial</p>
      <p className="text-sm text-ink-500">Disponível apenas para o perfil Diretoria.</p>
    </div>
  );
}
