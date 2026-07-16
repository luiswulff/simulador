import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Trash2, Plus, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAudit } from '../../lib/audit';
import { Avatar } from '../../components/Avatar';
import { Spinner, ConfirmDialog, InfoRow, Modal, Field } from '../../components/ui';
import { NoteForm } from '../../components/QuickForms';
import { CompanyForm } from './CompanyForm';
import { fmtDate, fmtDateTime, interactionLabel } from '../../lib/format';
import type { Company, Contact, Interaction, Note } from '../../types/db';

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modal, setModal] = useState<null | 'editar' | 'excluir' | 'vincular' | 'nota'>(null);

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', id!).single();
      if (error) throw new Error(error.message);
      return data as Company;
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ['company-links', id],
    queryFn: async () =>
      (
        await supabase
          .from('contact_companies')
          .select('*, contacts(id, full_name, job_title, photo_url)')
          .eq('company_id', id!)
          .order('is_current', { ascending: false })
      ).data ?? [],
  });

  const { data: directContacts = [] } = useQuery({
    queryKey: ['company-contacts', id],
    queryFn: async () =>
      (
        await supabase
          .from('contacts')
          .select('id, full_name, job_title, photo_url')
          .eq('company_id', id!)
          .is('deleted_at', null)
      ).data as Pick<Contact, 'id' | 'full_name' | 'job_title' | 'photo_url'>[],
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['company-interactions', id],
    queryFn: async () =>
      (
        await supabase
          .from('interactions')
          .select('*, contacts(full_name)')
          .eq('company_id', id!)
          .order('occurred_at', { ascending: false })
          .limit(50)
      ).data ?? [],
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['company-notes', id],
    queryFn: async () =>
      (
        await supabase
          .from('notes')
          .select('*')
          .eq('company_id', id!)
          .order('created_at', { ascending: false })
      ).data as Note[],
  });

  const remove = useMutation({
    mutationFn: async () => {
      await supabase.from('companies').update({ deleted_at: new Date().toISOString() }).eq('id', id!);
      await logAudit('company', id!, 'excluir');
    },
    onSuccess: () => navigate('/empresas'),
  });

  if (isLoading || !company) return <Spinner />;

  const linkedIds = new Set(links.map((l) => l.contacts?.id));
  const allPeople = [
    ...links.map((l) => ({
      id: l.contacts?.id,
      name: l.contacts?.full_name,
      photo: l.contacts?.photo_url,
      title: l.job_title ?? l.contacts?.job_title,
      current: l.is_current,
      period: [l.started_at ? fmtDate(l.started_at) : null, l.ended_at ? fmtDate(l.ended_at) : l.is_current ? 'atual' : null]
        .filter(Boolean)
        .join(' — '),
    })),
    ...directContacts
      .filter((c) => !linkedIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.full_name, photo: c.photo_url, title: c.job_title, current: true, period: '' })),
  ];

  return (
    <div>
      <div className="card mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="rounded-xl bg-ink-100 p-4">
            <Building2 className="h-8 w-8 text-ink-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-ink-900">{company.trade_name}</h1>
            {company.legal_name && <p className="text-sm text-ink-500">{company.legal_name}</p>}
            <p className="text-sm text-ink-400">
              {[company.segment, company.city, company.state, company.country].filter(Boolean).join(' · ')}
            </p>
            <span className="chip mt-2 bg-ink-100 text-ink-600">{company.status}</span>
          </div>
          <div className="flex gap-1.5">
            <button className="btn-secondary !px-3" onClick={() => setModal('editar')} title="Editar">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn-secondary !px-3 !text-red-600" onClick={() => setModal('excluir')} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-400">Informações</h3>
          <InfoRow label="CNPJ" value={company.cnpj} />
          <InfoRow label="Porte" value={company.size} />
          <InfoRow
            label="Site"
            value={
              company.website ? (
                <a className="text-accent-700 hover:underline" href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer">
                  {company.website} <ExternalLink className="inline h-3 w-3" />
                </a>
              ) : null
            }
          />
          <InfoRow label="LinkedIn" value={company.linkedin} />
          <InfoRow label="Telefone" value={company.phone} />
          <InfoRow label="Responsável" value={company.owner} />
          <InfoRow label="Descrição" value={company.description} />
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-400">
              Contatos vinculados ({allPeople.length})
            </h3>
            <button className="btn-secondary !py-1.5 text-xs" onClick={() => setModal('vincular')}>
              <Plus className="h-3.5 w-3.5" /> Vincular contato
            </button>
          </div>
          {allPeople.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhum contato vinculado.</p>
          ) : (
            <ul className="space-y-2">
              {allPeople.map((p, i) => (
                <li key={`${p.id}-${i}`} className="flex items-center gap-3">
                  <Avatar name={p.name ?? '?'} photoUrl={p.photo} size={32} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/contatos/${p.id}`} className="text-sm font-semibold text-accent-700 hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-ink-400">
                      {[p.title, p.period].filter(Boolean).join(' · ')}
                      {!p.current && ' · anterior'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-400">Histórico de relacionamento</h3>
          {interactions.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhuma interação vinculada a esta empresa.</p>
          ) : (
            <ul className="space-y-2">
              {interactions.map((i) => (
                <li key={i.id} className="text-sm">
                  <span className="chip mr-1.5 bg-accent-100 text-accent-800">{interactionLabel((i as Interaction).kind)}</span>
                  <span className="font-medium">{(i as Interaction).summary}</span>
                  <span className="text-xs text-ink-400">
                    {' '}· {fmtDate((i as Interaction).occurred_at)}
                    {i.contacts?.full_name ? ` · ${i.contacts.full_name}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-400">Notas</h3>
            <button className="btn-secondary !py-1.5 text-xs" onClick={() => setModal('nota')}>Nova nota</button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhuma nota.</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-ink-100 p-3">
                  {n.title && <p className="text-sm font-semibold">{n.title}</p>}
                  <p className="whitespace-pre-wrap text-sm text-ink-700">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-400">{fmtDateTime(n.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal === 'editar' && <CompanyForm company={company} onClose={() => setModal(null)} />}
      {modal === 'nota' && (
        <NoteForm companyId={company.id} onClose={() => { setModal(null); qc.invalidateQueries({ queryKey: ['company-notes', id] }); }} />
      )}
      {modal === 'excluir' && (
        <ConfirmDialog
          title="Excluir empresa"
          message={`Excluir "${company.trade_name}"? Os contatos não serão excluídos, apenas desvinculados.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => remove.mutate()}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'vincular' && (
        <LinkContactModal companyId={company.id} onClose={() => { setModal(null); qc.invalidateQueries({ queryKey: ['company-links', id] }); }} />
      )}
    </div>
  );
}

// Vincula pessoa ↔ empresa com cargo e período (histórico de cargos — Seção 14)
function LinkContactModal({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [contactId, setContactId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [isCurrent, setIsCurrent] = useState(true);
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: options = [] } = useQuery({
    queryKey: ['link-options', q],
    enabled: q.length >= 2,
    queryFn: async () =>
      (
        await supabase
          .from('contacts')
          .select('id, full_name')
          .ilike('full_name', `%${q}%`)
          .is('deleted_at', null)
          .limit(20)
      ).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!user || !contactId) throw new Error('Selecione o contato.');
      const { error } = await supabase.from('contact_companies').insert({
        user_id: user.id,
        contact_id: contactId,
        company_id: companyId,
        job_title: jobTitle || null,
        is_current: isCurrent,
        started_at: startedAt || null,
        ended_at: endedAt || null,
      });
      if (error) throw new Error(error.message);
      if (isCurrent) {
        await supabase.from('contacts').update({ company_id: companyId }).eq('id', contactId);
      }
    },
    onSuccess: onClose,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title="Vincular contato à empresa" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Buscar contato">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome…" />
        </Field>
        {options.length > 0 && (
          <select className="input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Selecione…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </select>
        )}
        <Field label="Cargo nesta empresa">
          <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <input type="date" className="input" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </Field>
          <Field label="Fim (se anterior)">
            <input type="date" className="input" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} />
          Vínculo atual
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>Vincular</button>
        </div>
      </div>
    </Modal>
  );
}
