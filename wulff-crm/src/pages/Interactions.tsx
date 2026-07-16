import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, EmptyState, Field } from '../components/ui';
import { InteractionForm } from '../components/QuickForms';
import { fmtDateTime, interactionLabel, INTERACTION_KINDS } from '../lib/format';
import type { Interaction } from '../types/db';

type InteractionRow = Interaction & { contacts: { id: string; full_name: string } | null };

export function InteractionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['interactions', 'global', kind, page],
    queryFn: async () => {
      let q = supabase
        .from('interactions')
        .select('*, contacts(id, full_name)', { count: 'exact' })
        .order('occurred_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (kind) q = q.eq('kind', kind);
      const { data, count } = await q;
      return { rows: (data ?? []) as InteractionRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-extrabold text-ink-900">Interações</h1>
        <Field label="Tipo">
          <select className="input !w-44" value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}>
            <option value="">Todos</option>
            {INTERACTION_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </Field>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Registrar interação
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma interação registrada"
          hint="Registre reuniões, ligações, almoços e demais contatos para construir a memória da sua rede."
        />
      ) : (
        <div className="card divide-y divide-ink-50 !p-0">
          {rows.map((i) => (
            <div key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
              <span className="w-40 shrink-0 text-xs text-ink-400">{fmtDateTime(i.occurred_at)}</span>
              <span className="chip bg-accent-100 text-accent-800">{interactionLabel(i.kind)}</span>
              <span className="min-w-0 flex-1 text-sm font-medium text-ink-900">{i.summary}</span>
              {i.contacts && (
                <Link to={`/contatos/${i.contacts.id}`} className="text-sm font-medium text-accent-700 hover:underline">
                  {i.contacts.full_name}
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="text-ink-500">Página {page + 1} de {totalPages}</span>
          <button className="btn-secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
        </div>
      )}

      {showForm && <InteractionForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
