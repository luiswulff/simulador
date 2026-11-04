import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { useList, useIndex } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { atingimento, progressoPilar } from '../lib/progresso';
import { acaoAtrasada, fmtData, fmtValor, hojeISO } from '../lib/format';
import { Carregando, DrillCard, PageHeader, Progresso, Secao, StatusBadge, Vazio } from '../components/ui';

export function PainelPage() {
  const { ciclo, anoRef, carregando } = useCiclo();
  const pilares = useList('pe_pilares');
  const objetivos = useList('pe_objetivos');
  const inis = useList('pe_iniciativas');
  const acoes = useList('pe_acoes');
  const inds = useList('pe_indicadores', { escopo: 'ambicao' });
  const metas = useList('pe_indicador_metas');
  const meds = useList('pe_indicador_medicoes');
  const marcos = useList('pe_marcos');
  const pessoas = useIndex('org_pessoas');

  if (carregando || pilares.isLoading) return <Carregando />;
  if (!ciclo) return <Vazio>Nenhum ciclo de planejamento cadastrado. Vá em <Link className="underline" to="/configuracoes">Configurações</Link>.</Vazio>;

  const A = acoes.data ?? [];
  const atrasadas = A.filter(acaoAtrasada);
  const proximas = A.filter((a) => a.prazo && a.prazo >= hojeISO() && a.status !== 'concluido' && a.status !== 'cancelado')
    .sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? '')).slice(0, 6);
  const concluidas = A.filter((a) => a.status === 'concluido').length;

  return (
    <>
      <PageHeader sobretitulo={ciclo.nome} titulo="Painel estratégico" subtitulo={ciclo.ambicao} />

      <Secao titulo={`Ambição — metas ${anoRef}`} acoes={<Link to="/ambicao" className="text-xs font-semibold text-accent-700 hover:underline">Ver 2027–2030 →</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(inds.data ?? []).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((i) => {
            const at = atingimento(i, metas.data ?? [], meds.data ?? [], anoRef);
            return (
              <Link key={i.id} to={`/indicadores/${i.id}`} className="card block transition hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{i.nome}</p>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <p className="text-2xl font-extrabold tabular-nums">{fmtValor(at.valor ?? null, i.unidade)}</p>
                  <p className="text-xs text-ink-500">meta {fmtValor(at.meta ?? null, i.unidade)}</p>
                </div>
                <div className="mt-2"><Progresso valor={at.pct} compacto /></div>
              </Link>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Execução por pilar" acoes={<Link to="/estrategia" className="text-xs font-semibold text-accent-700 hover:underline">Mapa estratégico →</Link>}>
        <div className="grid gap-3 md:grid-cols-2">
          {(pilares.data ?? []).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((p) => {
            const objs = (objetivos.data ?? []).filter((o) => o.pilar_id === p.id);
            return (
              <DrillCard key={p.id} to={`/estrategia/pilares/${p.id}`} cor={p.cor}>
                <p className="font-bold text-ink-900">{p.nome}</p>
                <p className="mb-3 text-xs text-ink-500">{objs.length} objetivo(s)</p>
                <Progresso valor={progressoPilar(p.id, objetivos.data ?? [], inis.data ?? [], A)} />
              </DrillCard>
            );
          })}
        </div>
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Planos de ação">
          <div className="card">
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-2xl font-extrabold">{A.length}</p><p className="text-xs text-ink-500">ações</p></div>
              <div><p className="text-2xl font-extrabold text-emerald-700">{concluidas}</p><p className="text-xs text-ink-500">concluídas</p></div>
              <Link to="/execucao?filtro=atrasadas"><p className="text-2xl font-extrabold text-red-700">{atrasadas.length}</p><p className="text-xs text-ink-500">atrasadas</p></Link>
            </div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-ink-500"><CalendarClock className="h-3.5 w-3.5" /> Próximos prazos</p>
            <ul className="divide-y divide-ink-100">
              {proximas.map((a) => (
                <li key={a.id}>
                  <Link to={`/execucao/${a.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-accent-700">
                    <span className="min-w-0 truncate">{a.o_que}</span>
                    <span className="shrink-0 text-xs text-ink-500">{fmtData(a.prazo)} · {pessoas.get(a.responsavel_id ?? '')?.nome ?? '—'}</span>
                  </Link>
                </li>
              ))}
              {!proximas.length && <li className="py-2 text-sm text-ink-400">Nenhum prazo futuro.</li>}
            </ul>
            {atrasadas.length > 0 && (
              <Link to="/execucao?filtro=atrasadas" className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-800">
                <AlertTriangle className="h-4 w-4" /> {atrasadas.length} ação(ões) com prazo vencido — ver lista
              </Link>
            )}
          </div>
        </Secao>

        <Secao titulo={`Marcos de ${anoRef}`} acoes={<Link to="/ambicao" className="text-xs font-semibold text-accent-700 hover:underline">Roadmap →</Link>}>
          <div className="card">
            <ul className="space-y-3">
              {(marcos.data ?? []).filter((m) => m.ano === anoRef).map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>{m.titulo}</span><StatusBadge status={m.status} />
                </li>
              ))}
              {!(marcos.data ?? []).some((m) => m.ano === anoRef) && <li className="text-sm text-ink-400">Nenhum marco para {anoRef}.</li>}
            </ul>
          </div>
        </Secao>
      </div>
    </>
  );
}
