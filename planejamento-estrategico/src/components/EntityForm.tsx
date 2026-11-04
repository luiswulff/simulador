import { useState, type FormEvent, type ReactNode } from 'react';
import { CAMPOS, type Campo } from '../data/campos';
import { useList, useRemove, useSave } from '../data/hooks';
import type { TableName, Tables } from '../data/types';
import { Modal } from './ui';

type Valores = Record<string, unknown>;

function CampoRef({ campo, valor, onChange }: { campo: Extract<Campo, { tipo: 'ref' }>; valor: unknown; onChange: (v: unknown) => void }) {
  const q = useList(campo.tabela);
  const opcoes = [...(q.data ?? [])]
    .map((r) => ({ id: r.id, label: String((r as unknown as Valores)[campo.rotulo] ?? r.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return (
    <select className="input" value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} required={campo.obrigatorio}>
      <option value="">— selecione —</option>
      {opcoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

function Entrada({ campo, valor, onChange }: { campo: Campo; valor: unknown; onChange: (v: unknown) => void }) {
  switch (campo.tipo) {
    case 'textarea':
      return <textarea className="input min-h-[90px]" value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value)} required={campo.obrigatorio} />;
    case 'number':
      return (
        <input className="input" type="number" step={campo.passo ?? 'any'} value={valor === null || valor === undefined ? '' : String(valor)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} required={campo.obrigatorio} />
      );
    case 'checkbox':
      return <input type="checkbox" className="h-4 w-4 accent-accent-700" checked={Boolean(valor)} onChange={(e) => onChange(e.target.checked)} />;
    case 'select':
      return (
        <select className="input" value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} required={campo.obrigatorio}>
          <option value="">— selecione —</option>
          {campo.opcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'ref':
      return <CampoRef campo={campo} valor={valor} onChange={onChange} />;
    case 'color':
      return <input type="color" className="h-9 w-16 cursor-pointer rounded border border-ink-200" value={(valor as string) || '#1e3a5f'} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input className="input" type={campo.tipo} value={(valor as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} required={campo.obrigatorio} />;
  }
}

export function EntityForm<T extends TableName>({
  tabela, inicial, ocultar = [], onClose, titulo, onSalvo,
}: {
  tabela: T;
  inicial: Partial<Tables[T]>;
  ocultar?: string[];
  onClose: () => void;
  titulo: string;
  onSalvo?: (row: Tables[T]) => void;
}) {
  const [valores, setValores] = useState<Valores>(inicial as Valores);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useSave(tabela);
  const campos = (CAMPOS[tabela] ?? []).filter((c) => !ocultar.includes(c.nome));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const row = await salvar.mutateAsync(valores as never);
      onSalvo?.(row);
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar. Verifique sua permissão.');
    }
  }

  return (
    <Modal titulo={titulo} onClose={onClose} largo={campos.length > 8}>
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        {campos.map((c) => (
          <label key={c.nome} className={c.tipo === 'textarea' || c.tipo === 'ref' ? 'sm:col-span-2' : ''}>
            <span className="label">{c.label}{c.obrigatorio && ' *'}</span>
            <Entrada campo={c} valor={valores[c.nome]} onChange={(v) => setValores((s) => ({ ...s, [c.nome]: v }))} />
            {c.ajuda && <span className="mt-1 block text-xs text-ink-400">{c.ajuda}</span>}
          </label>
        ))}
        {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{erro}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Hook de conveniência: `const ed = useEditor('pe_acoes')` → `ed.novo({...})`,
 * `ed.editar(row)`, `ed.excluir(row)` e renderize `{ed.modal}`.
 */
export function useEditor<T extends TableName>(tabela: T, nome: string, ocultar: string[] = []) {
  const [aberto, setAberto] = useState<{ inicial: Partial<Tables[T]>; titulo: string } | null>(null);
  const remover = useRemove(tabela);
  const modal: ReactNode = aberto ? (
    <EntityForm tabela={tabela} inicial={aberto.inicial} titulo={aberto.titulo} ocultar={ocultar} onClose={() => setAberto(null)} />
  ) : null;
  return {
    novo: (padrao: Partial<Tables[T]> = {}) => setAberto({ inicial: padrao, titulo: `Novo(a) ${nome}` }),
    editar: (row: Tables[T]) => setAberto({ inicial: row, titulo: `Editar ${nome}` }),
    excluir: async (row: Tables[T], descricao?: string) => {
      if (!confirm(`Excluir ${nome}${descricao ? ` "${descricao}"` : ''}? Itens vinculados abaixo dele também serão excluídos.`)) return;
      try {
        await remover.mutateAsync(row.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Não foi possível excluir.');
      }
    },
    modal,
  };
}
