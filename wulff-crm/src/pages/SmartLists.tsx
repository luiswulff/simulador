import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListFilter, Trash2, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { fmtDate } from '../lib/format';
import type { SavedFilter } from '../types/db';

export function SmartListsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['saved-filters'],
    queryFn: async () =>
      (await supabase.from('saved_filters').select('*').order('created_at', { ascending: false })).data as SavedFilter[],
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('saved_filters').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-filters'] }),
  });

  const describe = (filters: Record<string, unknown>): string => {
    const parts: string[] = [];
    const label: Record<string, string> = {
      q: 'busca', city: 'cidade', state: 'UF', country: 'país', company: 'empresa',
      status: 'status', closeness: 'grau', minScore: 'score ≥', noInteractionDays: 'sem contato há (dias)',
      birthdayMonth: 'aniversário no mês', hasEmail: 'e-mail', hasPhone: 'telefone', hasLinkedin: 'LinkedIn',
      incomplete: 'incompletos', archived: 'arquivados', origin: 'origem', owner: 'responsável',
      categoryId: 'categoria', tagId: 'tag',
    };
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === '' || v === false) continue;
      parts.push(`${label[k] ?? k}: ${v === true ? 'sim' : v}`);
    }
    return parts.join(' · ') || 'sem filtros';
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <h1 className="mr-auto text-xl font-extrabold text-ink-900">Listas inteligentes</h1>
        <Link to="/contatos" className="btn-primary">Criar nova em Contatos</Link>
      </div>
      <p className="mb-4 text-sm text-ink-500">
        Uma lista inteligente é um conjunto de filtros salvos — ela se atualiza sozinha conforme a base muda.
        Para criar, monte os filtros na tela de Contatos e clique em "Salvar como lista inteligente".
      </p>

      {lists.length === 0 ? (
        <EmptyState
          title="Nenhuma lista inteligente"
          hint={'Exemplos: "Clientes estratégicos de Porto Alegre", "Empresários sem contato há 90 dias", "Advogados de São Paulo", "Aniversariantes do próximo mês".'}
          action={<Link to="/contatos" className="btn-primary">Ir para Contatos</Link>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lists.map((l) => (
            <div key={l.id} className="card flex items-start gap-3 !p-4">
              <div className="rounded-lg bg-accent-50 p-2.5">
                <ListFilter className="h-5 w-5 text-accent-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink-900">{l.name}</p>
                {l.description && <p className="text-sm text-ink-500">{l.description}</p>}
                <p className="mt-1 text-xs text-ink-400">{describe(l.filters)}</p>
                <p className="text-xs text-ink-300">Criada em {fmtDate(l.created_at)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  className="btn-primary !px-3 !py-1.5"
                  title="Aplicar lista"
                  onClick={() => navigate(`/contatos?filtros=${encodeURIComponent(JSON.stringify(l.filters))}`)}
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button className="btn-secondary !px-3 !py-1.5 !text-red-600" title="Excluir lista" onClick={() => del.mutate(l.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
