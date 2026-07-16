import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Spinner, EmptyState } from '../../components/ui';
import { CompanyForm } from './CompanyForm';
import type { Company } from '../../types/db';

export function CompaniesPage() {
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const { canWrite } = useWorkspace();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies', q],
    queryFn: async () => {
      let query = supabase.from('companies').select('*').is('deleted_at', null).order('trade_name');
      if (q) query = query.or(`trade_name.ilike.%${q}%,legal_name.ilike.%${q}%,segment.ilike.%${q}%,city.ilike.%${q}%`);
      return (await query.limit(500)).data as Company[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ['company-contact-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('company_id').not('company_id', 'is', null).is('deleted_at', null);
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.company_id!] = (map[r.company_id!] ?? 0) + 1;
      return map;
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-extrabold text-ink-900">Empresas</h1>
        <input
          className="input !w-64"
          placeholder="Buscar empresa…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canWrite && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Nova empresa
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : companies.length === 0 ? (
        <EmptyState
          title="Nenhuma empresa cadastrada"
          hint="Cadastre as organizações da sua rede para vincular contatos, cargos e histórico."
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Nova empresa
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {companies.map((c) => (
            <Link key={c.id} to={`/empresas/${c.id}`} className="card flex items-start gap-3 !p-4 hover:border-accent-300">
              <div className="rounded-lg bg-ink-100 p-2.5">
                <Building2 className="h-5 w-5 text-ink-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink-900">{c.trade_name}</p>
                <p className="truncate text-sm text-ink-500">{c.segment ?? '—'}</p>
                <p className="text-xs text-ink-400">
                  {[c.city, c.state, c.country].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="chip bg-ink-100 text-ink-600">{counts[c.id] ?? 0} contatos</span>
            </Link>
          ))}
        </div>
      )}

      {showForm && <CompanyForm onClose={() => setShowForm(false)} onSaved={(id) => navigate(`/empresas/${id}`)} />}
    </div>
  );
}
