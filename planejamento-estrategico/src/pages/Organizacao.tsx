import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { useIndex, useList, useRow } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { useMetricas } from '../data/metricas';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { Avatar, BotaoNovo, Carregando, DrillCard, PageHeader, Progresso, Secao, Stat, StatusBadge, Texto, Vazio } from '../components/ui';
import { TabelaAcoes } from './Estrategia';
import { atingimento, progressoIniciativa } from '../lib/progresso';
import { acaoAtrasada, fmtData, fmtValor } from '../lib/format';

export function AreasPage() {
  const areas = useList('org_areas');
  const pessoas = useList('org_pessoas');
  const acoes = useList('pe_acoes');
  const idx = useIndex('org_pessoas');
  const pode = usePode();
  const ed = useEditor('org_areas', 'área');
  if (areas.isLoading) return <Carregando />;
  return (
    <>
      <PageHeader sobretitulo="Organização" titulo="Áreas" subtitulo="Cada área com seus líderes, pessoas, iniciativas, ações e indicadores."
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => ed.novo({ ordem: areas.data?.length ?? 0, ativo: true })}>Área</BotaoNovo>} />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[...(areas.data ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((a) => {
          const minhas = (acoes.data ?? []).filter((x) => x.area_id === a.id);
          const atrasadas = minhas.filter(acaoAtrasada).length;
          return (
            <DrillCard key={a.id} to={`/areas/${a.id}`}>
              <p className="text-xs font-bold text-ink-400">{a.sigla}</p>
              <p className="font-bold">{a.nome}</p>
              <p className="mt-1 text-xs text-ink-500">Líder: {idx.get(a.lider_id ?? '')?.nome ?? '—'}</p>
              <p className="mt-2 text-xs text-ink-600">
                {(pessoas.data ?? []).filter((p) => p.area_id === a.id).length} pessoa(s) · {minhas.length} ação(ões)
                {atrasadas > 0 && <span className="ml-1 font-semibold text-red-700">· {atrasadas} atrasada(s)</span>}
              </p>
            </DrillCard>
          );
        })}
      </div>
      {ed.modal}
    </>
  );
}

export function AreaPage() {
  const { id } = useParams();
  const area = useRow('org_areas', id);
  const pessoas = useList('org_pessoas', { area_id: id });
  const inis = useList('pe_iniciativas', { area_id: id });
  const acoes = useList('pe_acoes', { area_id: id });
  const todasAcoes = useList('pe_acoes');
  const objs = useList('pe_objetivos', { area_id: id });
  const metr = useMetricas();
  const inds = { data: metr.inds.filter((x) => x.area_id === id) };
  const cargos = useIndex('pe_cargos');
  const idx = useIndex('org_pessoas');
  const { ciclo, anoRef } = useCiclo();
  const pode = usePode();
  const edArea = useEditor('org_areas', 'área');
  const edPessoa = useEditor('org_pessoas', 'pessoa');
  const edInd = useEditor('pe_indicadores', 'indicador');
  if (!area.data || !ciclo) return <Carregando />;
  const a = area.data;
  const A = acoes.data ?? [];

  return (
    <>
      <PageHeader migalhas={[{ label: 'Áreas', to: '/areas' }, { label: a.nome }]} sobretitulo={`Área ${a.sigla ?? ''}`} titulo={a.nome}
        subtitulo={<>Líder: <Link className="underline" to={`/pessoas/${a.lider_id}`}>{idx.get(a.lider_id ?? '')?.nome ?? '—'}</Link></>}
        acoes={pode.editarEstrutura && <button className="btn-secondary text-xs" onClick={() => edArea.editar(a)}>Editar</button>} />
      {a.descricao && <div className="card mb-6"><Texto>{a.descricao}</Texto></div>}

      <div className="mb-8 grid gap-3 sm:grid-cols-4">
        <Stat label="Pessoas" valor={pessoas.data?.length ?? 0} />
        <Stat label="Iniciativas" valor={inis.data?.length ?? 0} />
        <Stat label="Ações" valor={A.length} detalhe={`${A.filter((x) => x.status === 'concluido').length} concluídas`} />
        <Stat label="Atrasadas" valor={<span className={A.some(acaoAtrasada) ? 'text-red-700' : ''}>{A.filter(acaoAtrasada).length}</span>} />
      </div>

      {(objs.data?.length ?? 0) > 0 && (
        <Secao titulo="Objetivos estratégicos sob responsabilidade da área">
          <ul className="card divide-y divide-ink-100 p-0">
            {(objs.data ?? []).map((o) => (
              <li key={o.id}><Link to={`/estrategia/objetivos/${o.id}`} className="block px-4 py-3 text-sm hover:bg-ink-50"><b className="mr-2 text-ink-400">{o.codigo}</b>{o.titulo}</Link></li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Indicadores da área" acoes={pode.editarDaArea(a.id) && <BotaoNovo onClick={() => edInd.novo({ ciclo_id: ciclo.id, escopo: 'area', area_id: a.id, polaridade: 'maior' })}>Indicador</BotaoNovo>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(inds.data ?? []).map((i) => {
            const at = atingimento(i, metr.metas, metr.meds, anoRef);
            return (
              <Link key={i.id} to={`/indicadores/${i.id}`} className="card block hover:shadow-md">
                <p className="text-sm font-semibold">{i.nome}</p>
                <p className="text-xs text-ink-500">{fmtValor(at.valor, i.unidade)} / meta {fmtValor(at.meta, i.unidade)}</p>
                <div className="mt-2"><Progresso valor={at.pct} compacto /></div>
              </Link>
            );
          })}
          {!inds.data?.length && <Vazio>Sem indicadores próprios da área.</Vazio>}
        </div>
      </Secao>

      <Secao titulo="Iniciativas">
        <div className="grid gap-3 md:grid-cols-2">
          {(inis.data ?? []).map((i) => (
            <DrillCard key={i.id} to={`/estrategia/iniciativas/${i.id}`}>
              <div className="flex justify-between gap-2"><p className="text-xs font-bold text-ink-400">{i.codigo}</p><StatusBadge status={i.status} prazo={i.fim} /></div>
              <p className="mb-2 font-semibold">{i.titulo}</p>
              <Progresso valor={progressoIniciativa(i, todasAcoes.data ?? [])} compacto />
            </DrillCard>
          ))}
          {!inis.data?.length && <Vazio>Sem iniciativas.</Vazio>}
        </div>
      </Secao>

      <Secao titulo="Ações da área"><TabelaAcoes acoes={A} mostrarIniciativa /></Secao>

      <Secao titulo="Pessoas" acoes={pode.editarEstrutura && <BotaoNovo onClick={() => edPessoa.novo({ area_id: a.id, ativo: true })}>Pessoa</BotaoNovo>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(pessoas.data ?? []).map((p) => (
            <Link key={p.id} to={`/pessoas/${p.id}`} className="card flex items-center gap-3 py-3 hover:shadow-md">
              <Avatar nome={p.nome} />
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{p.nome} {p.is_socio && <Crown className="inline h-3.5 w-3.5 text-amber-600" />}</p>
                <p className="text-xs text-ink-500">{cargos.get(p.cargo_id ?? '')?.nome ?? '—'}</p></div>
            </Link>
          ))}
        </div>
      </Secao>
      {edArea.modal}{edPessoa.modal}{edInd.modal}
    </>
  );
}

export function PessoasPage() {
  const pessoas = useList('org_pessoas');
  const areas = useIndex('org_areas');
  const cargos = useIndex('pe_cargos');
  const degraus = useIndex('pe_carreira_degraus');
  const pode = usePode();
  const ed = useEditor('org_pessoas', 'pessoa');
  const [busca, setBusca] = useState('');
  if (pessoas.isLoading) return <Carregando />;
  const lista = (pessoas.data ?? []).filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return (
    <>
      <PageHeader sobretitulo="Organização" titulo="Pessoas" subtitulo="Cadastro único de pessoas da firma (compartilhado com as demais aplicações)."
        acoes={pode.editarEstrutura && <BotaoNovo onClick={() => ed.novo({ ativo: true })}>Pessoa</BotaoNovo>} />
      <input className="input mb-4 max-w-sm" placeholder="Buscar por nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr><th className="px-4 py-3">Nome</th><th className="px-3 py-3">Área</th><th className="px-3 py-3">Cargo</th><th className="px-3 py-3">Carreira societária</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {lista.map((p) => (
              <tr key={p.id} className="hover:bg-ink-50">
                <td className="px-4 py-2"><Link to={`/pessoas/${p.id}`} className="flex items-center gap-2 font-medium hover:text-accent-700"><Avatar nome={p.nome} tamanho="sm" />{p.nome}{p.is_socio && <Crown className="h-3.5 w-3.5 text-amber-600" />}</Link></td>
                <td className="px-3 py-2">{areas.get(p.area_id ?? '')?.nome ?? '—'}</td>
                <td className="px-3 py-2">{cargos.get(p.cargo_id ?? '')?.nome ?? '—'}</td>
                <td className="px-3 py-2">{degraus.get(p.degrau_id ?? '')?.nome ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ed.modal}
    </>
  );
}

export function PessoaPage() {
  const { id } = useParams();
  const pessoa = useRow('org_pessoas', id);
  const acoes = useList('pe_acoes', { responsavel_id: id });
  const inis = useList('pe_iniciativas', { responsavel_id: id });
  const objs = useList('pe_objetivos', { responsavel_id: id });
  const liderados = useList('org_pessoas', { gestor_id: id });
  const areas = useIndex('org_areas');
  const cargos = useIndex('pe_cargos');
  const degraus = useIndex('pe_carreira_degraus');
  const idx = useIndex('org_pessoas');
  const pode = usePode();
  const ed = useEditor('org_pessoas', 'pessoa');
  if (!pessoa.data) return <Carregando />;
  const p = pessoa.data;
  const area = areas.get(p.area_id ?? '');

  return (
    <>
      <PageHeader migalhas={[{ label: 'Pessoas', to: '/pessoas' }, { label: p.nome }]}
        titulo={<span className="flex items-center gap-3"><Avatar nome={p.nome} tamanho="lg" />{p.nome}{p.is_socio && <span className="chip bg-amber-100 text-amber-800">Sócio</span>}</span>}
        acoes={pode.editarEstrutura && <button className="btn-secondary text-xs" onClick={() => ed.editar(p)}>Editar</button>} />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card py-3"><p className="label">Área</p>{area ? <Link className="text-sm font-semibold hover:underline" to={`/areas/${area.id}`}>{area.nome}</Link> : '—'}</div>
        <div className="card py-3"><p className="label">Cargo</p><Link className="text-sm font-semibold hover:underline" to="/carreira-societaria">{cargos.get(p.cargo_id ?? '')?.nome ?? '—'}</Link></div>
        <div className="card py-3"><p className="label">Carreira societária</p><Link className="text-sm font-semibold hover:underline" to="/carreira-societaria">{degraus.get(p.degrau_id ?? '')?.nome ?? '—'}</Link></div>
        <div className="card py-3"><p className="label">Gestor · Admissão</p><p className="text-sm font-semibold">{idx.get(p.gestor_id ?? '')?.nome ?? '—'} · {fmtData(p.data_admissao)}</p></div>
      </div>

      {(objs.data?.length ?? 0) > 0 && (
        <Secao titulo="Sponsor dos objetivos">
          <ul className="card divide-y divide-ink-100 p-0">{(objs.data ?? []).map((o) => (
            <li key={o.id}><Link to={`/estrategia/objetivos/${o.id}`} className="block px-4 py-3 text-sm hover:bg-ink-50"><b className="mr-2 text-ink-400">{o.codigo}</b>{o.titulo}</Link></li>
          ))}</ul>
        </Secao>
      )}
      {(inis.data?.length ?? 0) > 0 && (
        <Secao titulo="Responsável pelas iniciativas">
          <ul className="card divide-y divide-ink-100 p-0">{(inis.data ?? []).map((i) => (
            <li key={i.id}><Link to={`/estrategia/iniciativas/${i.id}`} className="flex justify-between gap-2 px-4 py-3 text-sm hover:bg-ink-50"><span><b className="mr-2 text-ink-400">{i.codigo}</b>{i.titulo}</span><StatusBadge status={i.status} prazo={i.fim} /></Link></li>
          ))}</ul>
        </Secao>
      )}
      <Secao titulo="Ações sob responsabilidade"><TabelaAcoes acoes={acoes.data ?? []} mostrarIniciativa /></Secao>
      {(liderados.data?.length ?? 0) > 0 && (
        <Secao titulo="Equipe direta">
          <div className="flex flex-wrap gap-2">{(liderados.data ?? []).map((l) => (
            <Link key={l.id} to={`/pessoas/${l.id}`} className="chip bg-white py-1 shadow-sm ring-1 ring-ink-100 hover:ring-accent-300"><Avatar nome={l.nome} tamanho="sm" />{l.nome}</Link>
          ))}</div>
        </Secao>
      )}
      {ed.modal}
    </>
  );
}
