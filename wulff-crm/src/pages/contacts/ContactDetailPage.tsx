import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mail, Phone, Linkedin, MessageCircle, CalendarPlus, StickyNote, Pencil, Camera,
  Archive, Trash2, Copy, GitMerge, Pin, ArchiveRestore, ExternalLink, Instagram,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAudit } from '../../lib/audit';
import { Avatar } from '../../components/Avatar';
import { ScoreBadge } from '../../components/ScoreBadge';
import { Spinner, EmptyState, ConfirmDialog, InfoRow, Modal, Field } from '../../components/ui';
import { InteractionForm, ReminderForm, NoteForm } from '../../components/QuickForms';
import { ContactForm } from './ContactForm';
import { PhotoEditor } from './PhotoEditor';
import { closenessLabel } from '../../lib/score';
import { fmtDate, fmtDateTime, fmtRelative, fmtBirthday, interactionLabel } from '../../lib/format';
import { waLink } from '../../lib/normalize';
import type { AuditLog, Category, Contact, Interaction, Note, Reminder, Tag } from '../../types/db';

const TABS = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'historico', label: 'Histórico' },
  { id: 'relacionamentos', label: 'Relacionamentos' },
  { id: 'negocios', label: 'Negócios' },
  { id: 'notas', label: 'Notas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'origem', label: 'Dados de origem' },
  { id: 'auditoria', label: 'Auditoria' },
] as const;

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') ?? 'visao';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [modal, setModal] = useState<
    null | 'editar' | 'foto' | 'interacao' | 'lembrete' | 'nota' | 'excluir' | 'mesclar'
  >(null);
  const [interactionKind, setInteractionKind] = useState('reuniao');

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('*').eq('id', id!).single();
      if (error) throw new Error(error.message);
      return data as Contact;
    },
  });

  const { data: rel } = useQuery({
    queryKey: ['contact-rel', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [cats, tgs, emails, phones, socials] = await Promise.all([
        supabase.from('contact_categories').select('category_id, categories(name)').eq('contact_id', id!),
        supabase.from('contact_tags').select('tag_id, tags(name)').eq('contact_id', id!),
        supabase.from('contact_emails').select('*').eq('contact_id', id!),
        supabase.from('contact_phones').select('*').eq('contact_id', id!),
        supabase.from('contact_social_profiles').select('*').eq('contact_id', id!),
      ]);
      return {
        categories: (cats.data ?? []).map((r) => (r.categories as unknown as Category)?.name).filter(Boolean),
        tags: (tgs.data ?? []).map((r) => (r.tags as unknown as Tag)?.name).filter(Boolean),
        emails: emails.data ?? [],
        phones: phones.data ?? [],
        socials: socials.data ?? [],
      };
    },
  });

  const archive = useMutation({
    mutationFn: async (archived: boolean) => {
      await supabase.from('contacts').update({ is_archived: archived }).eq('id', id!);
      await logAudit('contact', id!, archived ? 'arquivar' : 'restaurar');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', id] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      await supabase.from('contacts').update({ deleted_at: new Date().toISOString() }).eq('id', id!);
      await logAudit('contact', id!, 'excluir');
    },
    onSuccess: () => navigate('/contatos'),
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      if (!contact) return null;
      const copy: Record<string, unknown> = { ...contact };
      for (const k of ['id', 'created_at', 'updated_at', 'last_interaction_at', 'interactions_count']) delete copy[k];
      copy.full_name = `${contact.full_name} (cópia)`;
      const { data, error } = await supabase.from('contacts').insert(copy).select('id').single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: (newId) => newId && navigate(`/contatos/${newId}`),
  });

  if (isLoading || !contact) return <Spinner />;

  const whatsapp = contact.whatsapp ?? contact.phone;

  return (
    <div>
      {/* Cabeçalho */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <button className="group relative" onClick={() => setModal('foto')} title="Alterar foto">
            <Avatar name={contact.full_name} photoUrl={contact.photo_url} size={80} />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-ink-900 p-1.5 text-white opacity-90 group-hover:bg-accent-700">
              <Camera className="h-3.5 w-3.5" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-ink-900">{contact.full_name}</h1>
              <ScoreBadge contact={contact} showBreakdown />
              {contact.is_archived && <span className="chip bg-ink-200 text-ink-600">Arquivado</span>}
            </div>
            <p className="text-ink-600">
              {[contact.job_title, contact.company_name].filter(Boolean).join(' · ')}
            </p>
            <p className="text-sm text-ink-400">
              {[contact.city, contact.state, contact.country].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {contact.closeness && (
                <span className="chip bg-accent-100 text-accent-800">{closenessLabel(contact.closeness)}</span>
              )}
              {(rel?.categories ?? []).map((c) => (
                <span key={c} className="chip bg-ink-100 text-ink-600">{c}</span>
              ))}
              {(rel?.tags ?? []).map((t) => (
                <span key={t} className="chip bg-amber-100 text-amber-800">#{t}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn-secondary !px-3" onClick={() => setModal('editar')} title="Editar contato">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn-secondary !px-3" onClick={() => duplicate.mutate()} title="Duplicar contato">
              <Copy className="h-4 w-4" />
            </button>
            <button className="btn-secondary !px-3" onClick={() => setModal('mesclar')} title="Mesclar com outro contato">
              <GitMerge className="h-4 w-4" />
            </button>
            <button
              className="btn-secondary !px-3"
              onClick={() => archive.mutate(!contact.is_archived)}
              title={contact.is_archived ? 'Restaurar' : 'Arquivar'}
            >
              {contact.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </button>
            <button className="btn-secondary !px-3 !text-red-600" onClick={() => setModal('excluir')} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="btn-secondary !py-1.5 text-xs">
              <Mail className="h-3.5 w-3.5" /> E-mail
            </a>
          )}
          {whatsapp && (
            <a href={waLink(whatsapp)} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 text-xs">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {contact.linkedin && (
            <a href={normalizeUrl(contact.linkedin)} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 text-xs">
              <Linkedin className="h-3.5 w-3.5" /> LinkedIn
            </a>
          )}
          {contact.instagram && (
            <a href={normalizeUrl(contact.instagram, 'instagram.com')} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 text-xs">
              <Instagram className="h-3.5 w-3.5" /> Instagram
            </a>
          )}
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => { setInteractionKind('ligacao'); setModal('interacao'); }}>
            <Phone className="h-3.5 w-3.5" /> Registrar ligação
          </button>
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => { setInteractionKind('reuniao'); setModal('interacao'); }}>
            <CalendarPlus className="h-3.5 w-3.5" /> Registrar reunião
          </button>
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => setModal('lembrete')}>
            <CalendarPlus className="h-3.5 w-3.5" /> Criar lembrete
          </button>
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => setModal('nota')}>
            <StickyNote className="h-3.5 w-3.5" /> Adicionar nota
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-ink-100 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ aba: t.id })}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? 'bg-ink-900 text-white' : 'text-ink-500 hover:bg-ink-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'visao' && <OverviewTab contact={contact} rel={rel} />}
      {tab === 'historico' && <TimelineTab contactId={contact.id} />}
      {tab === 'relacionamentos' && <RelationshipsTab contact={contact} />}
      {tab === 'negocios' && <BusinessTab contact={contact} />}
      {tab === 'notas' && <NotesTab contactId={contact.id} />}
      {tab === 'documentos' && <DocumentsTab contact={contact} />}
      {tab === 'origem' && <SourceTab contact={contact} />}
      {tab === 'auditoria' && <AuditTab contactId={contact.id} />}

      {modal === 'editar' && <ContactForm contact={contact} onClose={() => setModal(null)} />}
      {modal === 'foto' && <PhotoEditor contact={contact} onClose={() => setModal(null)} />}
      {modal === 'interacao' && (
        <InteractionForm contactId={contact.id} defaultKind={interactionKind} onClose={() => setModal(null)} />
      )}
      {modal === 'lembrete' && <ReminderForm contactId={contact.id} onClose={() => setModal(null)} />}
      {modal === 'nota' && <NoteForm contactId={contact.id} onClose={() => setModal(null)} />}
      {modal === 'excluir' && (
        <ConfirmDialog
          title="Excluir contato"
          message={`Tem certeza de que deseja excluir "${contact.full_name}"? O registro sai das listas, mas pode ser recuperado pelo suporte via banco (soft delete).`}
          confirmLabel="Excluir definitivamente"
          danger
          onConfirm={() => remove.mutate()}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'mesclar' && <MergeModal contact={contact} onClose={() => setModal(null)} />}
    </div>
  );
}

function normalizeUrl(v: string, defaultHost?: string): string {
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('@') && defaultHost) return `https://${defaultHost}/${v.slice(1)}`;
  if (defaultHost && !v.includes('.')) return `https://${defaultHost}/${v}`;
  return `https://${v}`;
}

function OverviewTab({
  contact,
  rel,
}: {
  contact: Contact;
  rel?: { emails: { email: string }[]; phones: { phone: string }[]; socials: { network: string; url: string }[] } | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-400">Contato</h3>
        <InfoRow label="E-mail" value={contact.email} />
        {(rel?.emails ?? []).map((e, i) => (
          <InfoRow key={i} label="E-mail adicional" value={e.email} />
        ))}
        <InfoRow label="Telefone" value={contact.phone} />
        {(rel?.phones ?? []).map((p, i) => (
          <InfoRow key={i} label="Telefone adicional" value={p.phone} />
        ))}
        <InfoRow label="WhatsApp" value={contact.whatsapp} />
        <InfoRow label="LinkedIn" value={contact.linkedin} />
        <InfoRow label="Instagram" value={contact.instagram} />
        <InfoRow label="X / Twitter" value={contact.twitter} />
        <InfoRow label="Site" value={contact.website} />
        {(rel?.socials ?? []).map((s, i) => (
          <InfoRow
            key={i}
            label={s.network}
            value={
              <a className="text-accent-700 hover:underline" href={s.url} target="_blank" rel="noreferrer">
                {s.url} <ExternalLink className="inline h-3 w-3" />
              </a>
            }
          />
        ))}
      </div>
      <div className="card">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-400">Perfil</h3>
        <InfoRow label="Nome preferencial" value={contact.preferred_name} />
        <InfoRow label="Departamento" value={contact.department} />
        <InfoRow label="Profissão" value={contact.profession} />
        <InfoRow label="Segmento" value={contact.segment} />
        <InfoRow label="Idioma" value={contact.language} />
        <InfoRow label="Aniversário" value={fmtBirthday(contact.birth_date, contact.birth_day, contact.birth_month)} />
        <InfoRow label="Código interno" value={contact.internal_code} />
      </div>
      <div className="card">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-400">Relacionamento</h3>
        <InfoRow label="Grau" value={closenessLabel(contact.closeness)} />
        <InfoRow label="Status" value={contact.relationship_status} />
        <InfoRow label="Importância" value={contact.importance ? `${contact.importance}/5` : null} />
        <InfoRow label="Influência" value={contact.influence ? `${contact.influence}/5` : null} />
        <InfoRow label="Potencial comercial" value={contact.business_potential ? `${contact.business_potential}/5` : null} />
        <InfoRow label="Confiança" value={contact.trust_level ? `${contact.trust_level}/5` : null} />
        <InfoRow label="Como conheci" value={contact.how_we_met} />
        <InfoRow label="Quem apresentou" value={contact.introduced_by} />
        <InfoRow label="Evento / contexto" value={contact.origin_context} />
        <InfoRow label="Nos conhecemos em" value={contact.met_date ? fmtDate(contact.met_date) : null} />
        <InfoRow label="Último contato" value={fmtRelative(contact.last_interaction_at)} />
        <InfoRow label="Próximo contato" value={contact.next_contact_date ? fmtDate(contact.next_contact_date) : null} />
        <InfoRow label="Frequência desejada" value={contact.contact_frequency} />
        <InfoRow label="Responsável" value={contact.owner} />
        <InfoRow label="Interações registradas" value={String(contact.interactions_count)} />
      </div>
      <div className="card">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-400">Interesses e pessoal</h3>
        <InfoRow label="Assuntos de interesse" value={contact.interests} />
        <InfoRow label="Preferências" value={contact.preferences} />
        <InfoRow label="Cônjuge" value={contact.spouse_name} />
        <InfoRow label="Filhos" value={contact.children} />
        <InfoRow label="Datas relevantes" value={contact.relevant_dates} />
        <InfoRow label="Hobbies" value={contact.hobbies} />
        <InfoRow label="Outras informações" value={contact.personal_info} />
        <InfoRow label="Observações" value={contact.observations} />
        <InfoRow label="Notas privadas" value={contact.private_notes} />
      </div>
    </div>
  );
}

function TimelineTab({ contactId }: { contactId: string }) {
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ['interactions', contactId],
    queryFn: async () =>
      (
        await supabase
          .from('interactions')
          .select('*')
          .eq('contact_id', contactId)
          .order('occurred_at', { ascending: false })
      ).data as Interaction[],
  });
  const { data: doneReminders = [] } = useQuery({
    queryKey: ['reminders-done', contactId],
    queryFn: async () =>
      (
        await supabase
          .from('reminders')
          .select('*')
          .eq('contact_id', contactId)
          .eq('is_done', true)
          .order('done_at', { ascending: false })
      ).data as Reminder[],
  });
  const del = useMutation({
    mutationFn: async (iid: string) => {
      await supabase.from('interactions').delete().eq('id', iid);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interactions', contactId] });
      qc.invalidateQueries({ queryKey: ['contact', contactId] });
    },
  });

  if (isLoading) return <Spinner />;

  const timeline = [
    ...interactions.map((i) => ({ type: 'interacao' as const, date: i.occurred_at, item: i })),
    ...doneReminders.map((r) => ({ type: 'lembrete' as const, date: r.done_at ?? r.due_date, item: r })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-400">Linha do tempo</h3>
        <button className="btn-primary !py-1.5 text-xs" onClick={() => setShowForm(true)}>
          Registrar interação
        </button>
      </div>
      {timeline.length === 0 ? (
        <EmptyState title="Nenhuma interação registrada" hint="Registre reuniões, ligações, almoços e mensagens para construir o histórico do relacionamento." />
      ) : (
        <ol className="relative ml-3 border-l border-ink-100">
          {timeline.map((entry) => (
            <li key={entry.type + (entry.item as { id: string }).id} className="mb-5 ml-5">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-accent-600" />
              {entry.type === 'interacao' ? (
                <InteractionEntry
                  interaction={entry.item as Interaction}
                  onEdit={() => setEditing(entry.item as Interaction)}
                  onDelete={() => del.mutate((entry.item as Interaction).id)}
                />
              ) : (
                <div>
                  <p className="text-xs text-ink-400">{fmtDateTime(entry.date)}</p>
                  <p className="text-sm">
                    <span className="chip mr-1 bg-ink-100 text-ink-600">Lembrete concluído</span>
                    {(entry.item as Reminder).title}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {showForm && <InteractionForm contactId={contactId} onClose={() => setShowForm(false)} />}
      {editing && <InteractionForm contactId={contactId} interaction={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function InteractionEntry({
  interaction: i,
  onEdit,
  onDelete,
}: {
  interaction: Interaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group">
      <p className="text-xs text-ink-400">{fmtDateTime(i.occurred_at)}</p>
      <p className="text-sm font-semibold text-ink-900">
        <span className="chip mr-1.5 bg-accent-100 text-accent-800">{interactionLabel(i.kind)}</span>
        {i.summary}
      </p>
      {i.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{i.description}</p>}
      {i.participants && <p className="text-xs text-ink-400">Participantes: {i.participants}</p>}
      {i.next_action && <p className="text-xs font-medium text-amber-700">Próxima ação: {i.next_action}</p>}
      <div className="mt-1 hidden gap-2 group-hover:flex">
        <button className="text-xs text-ink-400 hover:text-ink-800" onClick={onEdit}>Editar</button>
        <button className="text-xs text-red-400 hover:text-red-700" onClick={onDelete}>Excluir</button>
      </div>
    </div>
  );
}

function RelationshipsTab({ contact }: { contact: Contact }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const { data: relationships = [] } = useQuery({
    queryKey: ['relationships', contact.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('relationships')
        .select('*, from:contacts!relationships_from_contact_id_fkey(id, full_name), to:contacts!relationships_to_contact_id_fkey(id, full_name)')
        .or(`from_contact_id.eq.${contact.id},to_contact_id.eq.${contact.id}`);
      return data ?? [];
    },
  });
  const { data: sameCompany = [] } = useQuery({
    queryKey: ['same-company', contact.id],
    enabled: Boolean(contact.company_name),
    queryFn: async () =>
      (
        await supabase
          .from('contacts')
          .select('id, full_name, job_title')
          .eq('company_name', contact.company_name!)
          .neq('id', contact.id)
          .is('deleted_at', null)
          .limit(20)
      ).data ?? [],
  });
  const del = useMutation({
    mutationFn: async (rid: string) => {
      await supabase.from('relationships').delete().eq('id', rid);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['relationships', contact.id] }),
  });

  const KIND_LABEL: Record<string, string> = {
    conhece: 'conhece',
    apresentou: 'apresentou',
    trabalha_com: 'trabalha com',
    familia: 'família de',
    socio: 'sócio de',
    outro: 'relacionado a',
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-400">Conexões registradas</h3>
          <button className="btn-secondary !py-1.5 text-xs" onClick={() => setShowAdd(true)}>Adicionar conexão</button>
        </div>
        {contact.introduced_by && (
          <p className="mb-2 text-sm text-ink-600">
            Apresentado por: <strong>{contact.introduced_by}</strong>
          </p>
        )}
        {relationships.length === 0 ? (
          <p className="text-sm text-ink-400">Nenhuma conexão registrada. O Mapa de Relacionamentos visual chega na V2 — a base de dados já está pronta.</p>
        ) : (
          <ul className="space-y-2">
            {relationships.map((r) => {
              const other = r.from_contact_id === contact.id ? r.to : r.from;
              return (
                <li key={r.id} className="group flex items-center gap-2 text-sm">
                  <span className="chip bg-ink-100 text-ink-600">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <Link to={`/contatos/${other?.id}`} className="font-medium text-accent-700 hover:underline">
                    {other?.full_name}
                  </Link>
                  {r.notes && <span className="text-ink-400">— {r.notes}</span>}
                  <button className="hidden text-xs text-red-400 hover:text-red-700 group-hover:block" onClick={() => del.mutate(r.id)}>
                    remover
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-400">Mesma empresa</h3>
        {sameCompany.length === 0 ? (
          <p className="text-sm text-ink-400">Nenhum outro contato da mesma empresa.</p>
        ) : (
          <ul className="space-y-1.5">
            {sameCompany.map((c) => (
              <li key={c.id}>
                <Link to={`/contatos/${c.id}`} className="text-sm font-medium text-accent-700 hover:underline">
                  {c.full_name}
                </Link>
                {c.job_title && <span className="text-xs text-ink-400"> · {c.job_title}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {showAdd && user && (
        <AddRelationshipModal contact={contact} userId={user.id} onClose={() => {
          setShowAdd(false);
          qc.invalidateQueries({ queryKey: ['relationships', contact.id] });
        }} />
      )}
    </div>
  );
}

function AddRelationshipModal({ contact, userId, onClose }: { contact: Contact; userId: string; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [toId, setToId] = useState('');
  const [kind, setKind] = useState('conhece');
  const [notes, setNotes] = useState('');
  const { data: options = [] } = useQuery({
    queryKey: ['rel-options', q],
    enabled: q.length >= 2,
    queryFn: async () =>
      (
        await supabase
          .from('contacts')
          .select('id, full_name')
          .ilike('full_name', `%${q}%`)
          .neq('id', contact.id)
          .is('deleted_at', null)
          .limit(20)
      ).data ?? [],
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!toId) throw new Error('Selecione o contato.');
      const { error } = await supabase.from('relationships').insert({
        user_id: userId,
        from_contact_id: contact.id,
        to_contact_id: toId,
        kind,
        notes: notes || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: onClose,
  });
  return (
    <Modal title={`Conectar ${contact.full_name} a…`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Buscar contato">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome…" />
        </Field>
        {options.length > 0 && (
          <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Selecione…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </select>
        )}
        <Field label="Tipo de vínculo">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="conhece">Conhece</option>
            <option value="apresentou">Apresentou</option>
            <option value="trabalha_com">Trabalha com</option>
            <option value="socio">Sócio</option>
            <option value="familia">Família</option>
            <option value="outro">Outro</option>
          </select>
        </Field>
        <Field label="Observação">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => save.mutate()}>Salvar conexão</button>
        </div>
      </div>
    </Modal>
  );
}

function BusinessTab({ contact }: { contact: Contact }) {
  const { data: proposals = [] } = useQuery({
    queryKey: ['business', contact.id],
    queryFn: async () =>
      (
        await supabase
          .from('interactions')
          .select('*')
          .eq('contact_id', contact.id)
          .in('kind', ['proposta', 'contrato'])
          .order('occurred_at', { ascending: false })
      ).data as Interaction[],
  });
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-400">Negócios e oportunidades</h3>
      {contact.opportunities && (
        <div className="mb-4 rounded-lg bg-accent-50 p-3 text-sm text-accent-900">
          <p className="font-semibold">Oportunidades em aberto</p>
          <p className="whitespace-pre-wrap">{contact.opportunities}</p>
        </div>
      )}
      {contact.business_potential && (
        <p className="mb-3 text-sm text-ink-600">
          Potencial comercial: <strong>{contact.business_potential}/5</strong>
        </p>
      )}
      {proposals.length === 0 ? (
        <p className="text-sm text-ink-400">
          Nenhuma proposta ou contrato registrado. Registre interações do tipo "Proposta" ou "Contrato" no histórico para acompanhá-las aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {proposals.map((p) => (
            <li key={p.id} className="text-sm">
              <span className="chip mr-1.5 bg-amber-100 text-amber-800">{interactionLabel(p.kind)}</span>
              <span className="font-medium">{p.summary}</span>
              <span className="text-xs text-ink-400"> · {fmtDate(p.occurred_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesTab({ contactId }: { contactId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const qc = useQueryClient();
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', contactId],
    queryFn: async () =>
      (
        await supabase
          .from('notes')
          .select('*')
          .eq('contact_id', contactId)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
      ).data as Note[],
  });
  const togglePin = useMutation({
    mutationFn: async (n: Note) => {
      await supabase.from('notes').update({ is_pinned: !n.is_pinned }).eq('id', n.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', contactId] }),
  });
  const del = useMutation({
    mutationFn: async (nid: string) => {
      await supabase.from('notes').delete().eq('id', nid);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', contactId] }),
  });

  if (isLoading) return <Spinner />;
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-400">Notas</h3>
        <button className="btn-primary !py-1.5 text-xs" onClick={() => setShowForm(true)}>Nova nota</button>
      </div>
      {notes.length === 0 ? (
        <EmptyState title="Nenhuma nota" hint="Anote contextos, pendências e cuidados no relacionamento." />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className={`rounded-xl border p-3 ${n.is_pinned ? 'border-amber-200 bg-amber-50' : 'border-ink-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  {n.title && <p className="font-semibold text-ink-900">{n.title}</p>}
                  <p className="whitespace-pre-wrap text-sm text-ink-700">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {fmtDateTime(n.created_at)}
                    {n.is_private && ' · privada'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="btn-ghost !p-1.5" title={n.is_pinned ? 'Desafixar' : 'Fixar'} onClick={() => togglePin.mutate(n)}>
                    <Pin className={`h-3.5 w-3.5 ${n.is_pinned ? 'text-amber-600' : ''}`} />
                  </button>
                  <button className="btn-ghost !p-1.5" title="Editar" onClick={() => setEditing(n)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost !p-1.5 !text-red-500" title="Excluir" onClick={() => del.mutate(n.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && <NoteForm contactId={contactId} onClose={() => setShowForm(false)} />}
      {editing && <NoteForm note={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DocumentsTab({ contact }: { contact: Contact }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: docs = [] } = useQuery({
    queryKey: ['attachments', contact.id],
    queryFn: async () =>
      (await supabase.from('attachments').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false })).data ?? [],
  });

  const upload = async (file: File) => {
    setError(null);
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('O arquivo deve ter no máximo 10 MB (limite pensado para o free tier do Storage).');
      return;
    }
    const path = `${user.id}/docs/${contact.id}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('contact-photos').upload(path, file);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    await supabase.from('attachments').insert({
      user_id: user.id,
      contact_id: contact.id,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    });
    qc.invalidateQueries({ queryKey: ['attachments', contact.id] });
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-400">Documentos</h3>
        <label className="btn-primary !py-1.5 cursor-pointer text-xs">
          Anexar documento
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {docs.length === 0 ? (
        <EmptyState title="Nenhum documento" hint="Anexe propostas, contratos e materiais relevantes." />
      ) : (
        <ul className="divide-y divide-ink-50">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 truncate font-medium">{d.file_name}</span>
              <span className="text-xs text-ink-400">{d.size_bytes ? `${Math.round(d.size_bytes / 1024)} KB` : ''}</span>
              <a
                className="text-accent-700 hover:underline"
                href={supabase.storage.from('contact-photos').getPublicUrl(d.storage_path).data.publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceTab({ contact }: { contact: Contact }) {
  const { data: job } = useQuery({
    queryKey: ['import-job', contact.import_job_id],
    enabled: Boolean(contact.import_job_id),
    queryFn: async () =>
      (await supabase.from('import_jobs').select('*').eq('id', contact.import_job_id!).single()).data,
  });
  return (
    <div className="card">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-400">Dados de origem</h3>
      <InfoRow label="Origem do cadastro" value={{ manual: 'Cadastro manual', import: 'Importação', demo: 'Demonstração' }[contact.source] ?? contact.source} />
      <InfoRow label="Cadastrado em" value={fmtDateTime(contact.created_at)} />
      <InfoRow label="Última alteração" value={fmtDateTime(contact.updated_at)} />
      {job && (
        <>
          <InfoRow label="Arquivo de importação" value={job.file_name} />
          <InfoRow label="Importado em" value={fmtDateTime(job.created_at)} />
        </>
      )}
      {contact.source_row && (
        <div className="mt-3">
          <p className="label">Registro original importado (auditoria)</p>
          <pre className="max-h-72 overflow-auto rounded-lg bg-ink-950 p-3 text-xs text-ink-100">
            {JSON.stringify(contact.source_row, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function AuditTab({ contactId }: { contactId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit', contactId],
    queryFn: async () =>
      (
        await supabase
          .from('audit_logs')
          .select('*')
          .eq('entity', 'contact')
          .eq('entity_id', contactId)
          .order('created_at', { ascending: false })
          .limit(100)
      ).data as AuditLog[],
  });
  if (isLoading) return <Spinner />;
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-400">Auditoria</h3>
      {logs.length === 0 ? (
        <p className="text-sm text-ink-400">Nenhum evento registrado.</p>
      ) : (
        <ul className="space-y-1.5">
          {logs.map((l) => (
            <li key={l.id} className="flex gap-3 text-sm">
              <span className="w-36 shrink-0 text-ink-400">{fmtDateTime(l.created_at)}</span>
              <span className="chip bg-ink-100 text-ink-600">{l.action}</span>
              {l.details && <span className="truncate text-ink-500">{JSON.stringify(l.details)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Mesclagem manual de dois contatos (Seção 10) — preserva todas as informações.
function MergeModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [otherId, setOtherId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: options = [] } = useQuery({
    queryKey: ['merge-options', q, contact.id],
    enabled: q.length >= 2,
    queryFn: async () =>
      (
        await supabase
          .from('contacts')
          .select('id, full_name, email, company_name')
          .ilike('full_name', `%${q}%`)
          .neq('id', contact.id)
          .is('deleted_at', null)
          .limit(20)
      ).data ?? [],
  });

  const other = useMemo(() => options.find((o) => o.id === otherId), [options, otherId]);

  const merge = useMutation({
    mutationFn: async () => {
      if (!user || !otherId) throw new Error('Selecione o contato a mesclar.');
      const { data: src, error: srcErr } = await supabase.from('contacts').select('*').eq('id', otherId).single();
      if (srcErr || !src) throw new Error('Contato de origem não encontrado.');

      // complementa campos vazios do contato mantido
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(src)) {
        if (['id', 'created_at', 'updated_at', 'user_id', 'interactions_count', 'last_interaction_at'].includes(k)) continue;
        const cur = (contact as unknown as Record<string, unknown>)[k];
        if ((cur === null || cur === '' || cur === undefined) && v !== null && v !== '') patch[k] = v;
      }
      if (Object.keys(patch).length) await supabase.from('contacts').update(patch).eq('id', contact.id);

      // move registros relacionados
      for (const t of ['interactions', 'reminders', 'notes', 'contact_emails', 'contact_phones', 'contact_social_profiles', 'attachments', 'contact_companies']) {
        await supabase.from(t).update({ contact_id: contact.id }).eq('contact_id', otherId);
      }
      await supabase.from('relationships').update({ from_contact_id: contact.id }).eq('from_contact_id', otherId);
      await supabase.from('relationships').update({ to_contact_id: contact.id }).eq('to_contact_id', otherId);

      // preserva e-mail/telefone do mesclado como adicionais
      if (src.email && src.email !== contact.email) {
        await supabase.from('contact_emails').insert({ user_id: user.id, contact_id: contact.id, email: src.email, label: 'mesclado' });
      }
      if (src.phone && src.phone !== contact.phone) {
        await supabase.from('contact_phones').insert({ user_id: user.id, contact_id: contact.id, phone: src.phone, label: 'mesclado' });
      }

      await supabase.from('merge_history').insert({
        user_id: user.id,
        kept_contact_id: contact.id,
        removed_contact_snapshot: src,
      });
      await supabase.from('contacts').delete().eq('id', otherId);
      await logAudit('contact', contact.id, 'mesclar', { mesclado: src.full_name });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      navigate(`/contatos/${contact.id}`);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title="Mesclar contatos" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          O contato selecionado será <strong>mesclado dentro de "{contact.full_name}"</strong>: campos vazios são
          complementados e interações, notas, lembretes e conexões são transferidos. O registro original fica
          preservado no histórico de mesclagens.
        </p>
        <Field label="Buscar contato a mesclar">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome…" />
        </Field>
        {options.length > 0 && (
          <select className="input" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            <option value="">Selecione…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name} {o.email ? `· ${o.email}` : ''} {o.company_name ? `· ${o.company_name}` : ''}
              </option>
            ))}
          </select>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!other || merge.isPending} onClick={() => merge.mutate()}>
            {merge.isPending ? 'Mesclando…' : 'Mesclar contatos'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
