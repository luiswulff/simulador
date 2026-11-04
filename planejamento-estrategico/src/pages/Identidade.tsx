import { useList } from '../data/hooks';
import { useCiclo } from '../data/ciclo';
import { usePode } from '../contexts/AuthContext';
import { useEditor } from '../components/EntityForm';
import { BotaoNovo, BotoesLinha, Carregando, PageHeader, Secao, Texto, Vazio } from '../components/ui';
import type { Identidade, TipoIdentidade } from '../data/types';

const DESTAQUES: { tipo: TipoIdentidade; rotulo: string }[] = [
  { tipo: 'missao', rotulo: 'Missão' },
  { tipo: 'visao', rotulo: 'Visão' },
  { tipo: 'proposito', rotulo: 'Propósito' },
];

export function IdentidadePage() {
  const { ciclo } = useCiclo();
  const q = useList('pe_identidade');
  const pode = usePode();
  const ed = useEditor('pe_identidade', 'item de identidade');
  if (q.isLoading || !ciclo) return <Carregando />;

  const itens = [...(q.data ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const de = (t: TipoIdentidade) => itens.filter((i) => i.tipo === t);
  const botoes = (i: Identidade) =>
    pode.editarEstrutura ? <BotoesLinha onEditar={() => ed.editar(i)} onExcluir={() => ed.excluir(i, i.titulo)} /> : null;
  const novo = (tipo: TipoIdentidade) =>
    pode.editarEstrutura ? <BotaoNovo onClick={() => ed.novo({ ciclo_id: ciclo.id, tipo, ordem: de(tipo).length })}>Adicionar</BotaoNovo> : null;

  return (
    <>
      <PageHeader sobretitulo="Direção" titulo="Missão, visão, valores e cultura"
        subtitulo="A identidade que orienta todas as escolhas do ciclo 2027–2030." />

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {DESTAQUES.map(({ tipo, rotulo }) => {
          const i = de(tipo)[0];
          return (
            <div key={tipo} className="card border-t-4 border-t-accent-700">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-accent-700">{rotulo}</p>
                {i ? botoes(i) : novo(tipo)}
              </div>
              {i ? <div className="mt-2"><Texto>{i.descricao}</Texto></div> : <p className="mt-2 text-sm text-ink-400">A definir.</p>}
            </div>
          );
        })}
      </div>

      <Secao titulo="Valores" acoes={novo('valor')}>
        <div className="grid gap-3 md:grid-cols-2">
          {de('valor').map((v, n) => (
            <div key={v.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold"><span className="mr-2 text-accent-600">{String(n + 1).padStart(2, '0')}</span>{v.titulo}</p>
                {botoes(v)}
              </div>
              <div className="mt-1"><Texto>{v.descricao}</Texto></div>
              {v.comportamentos && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-600">
                  {v.comportamentos.split('\n').filter(Boolean).map((c, k) => <li key={k}>{c}</li>)}
                </ul>
              )}
            </div>
          ))}
          {!de('valor').length && <Vazio>Nenhum valor cadastrado.</Vazio>}
        </div>
      </Secao>

      <Secao titulo="Cultura — como trabalhamos" acoes={novo('cultura')}>
        <div className="grid gap-3 md:grid-cols-3">
          {de('cultura').map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between gap-2"><p className="font-bold">{c.titulo}</p>{botoes(c)}</div>
              <div className="mt-1"><Texto>{c.descricao}</Texto></div>
            </div>
          ))}
          {!de('cultura').length && <Vazio>Nenhum traço cultural cadastrado.</Vazio>}
        </div>
      </Secao>
      {ed.modal}
    </>
  );
}
