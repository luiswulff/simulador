import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, LayoutGrid, List, Rows3, Download, Archive, Tags, SlidersHorizontal, BookmarkPlus, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAudit } from '../../lib/audit';
import { Avatar } from '../../components/Avatar';
import { ScoreBadge } from '../../components/ScoreBadge';
import { Spinner, EmptyState, Field, Modal } from '../../components/ui';
import { ContactForm } from './ContactForm';
import { relationshipScore, CLOSENESS_LEVELS, closenessLabel, completeness } from '../../lib/score';
import { fmtRelative } from '../../lib/format';
import { exportContacts } from '../../features/export/exporters';
import type { Contact, Category, Tag } from '../../types/db';

export interface ContactFilters {
  q?: string;
  categoryId?: string;
  tagId?: string;
  city?: string;
  state?: string;
  country?: string;
  company?: string;
  status?: string;
  closeness?: number | '';
  minScore?: number | '';
  owner?: string;
  origin?: string;
  hasEmail?: '' | 'sim' | 'nao';
  hasPhone?: '' | 'sim' | 'nao';
  hasLinkedin?: '' | 'sim' | 'nao';
  noInteractionDays?: number | '';
  birthdayMonth?: number | '';
  incomplete?: boolean;
  archived?: boolean;
}

const PAGE_SIZE = 50;

export function ContactsPage() {
  const [params] = useSearchParams();
  const initialFilters = useMemo<ContactFilters>(() => {
    const f = params.get('filtros');
    if (f) {
      try {
        return JSON.parse(f) as ContactFilters;
      } catch {
        /* filtro inválido na URL: ignora */
      }
    }
    return {};
  }, [params]);

  const [filters, setFilters] = useState<ContactFilters>(initialFilters);
  const [view, setView] = useState<'tabela' | 'cards' | 'compacta'>('tabela');
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSaveList, setShowSaveList] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', filters, page],
    queryFn: async () => {
      let ids: string[] | null = null;
      if (filters.categoryId) {
        const { data } = await supabase
          .from('contact_categories')
          .select('contact_id')
          .eq('category_id', filters.categoryId);
        ids = (data ?? []).map((r) => r.contact_id);
        if (ids.length === 0) return { rows: [] as Contact[], count: 0 };
      }
      if (filters.tagId) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .eq('tag_id', filters.tagId);
        const tagIds = (data ?? []).map((r) => r.contact_id);
        ids = ids ? ids.filter((i) => tagIds.includes(i)) : tagIds;
        if (ids.length === 0) return { rows: [] as Contact[], count: 0 };
      }

      let q = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .eq('is_archived', Boolean(filters.archived));

      if (ids) q = q.in('id', ids.slice(0, 1000));
      if (filters.q) {
        const like = `%${filters.q}%`;
        q = q.or(
          `full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},company_name.ilike.${like},job_title.ilike.${like}`,
        );
      }
      if (filters.city) q = q.ilike('city', `%${filters.city}%`);
      if (filters.state) q = q.ilike('state', `%${filters.state}%`);
      if (filters.country) q = q.ilike('country', `%${filters.country}%`);
      if (filters.company) q = q.ilike('company_name', `%${filters.company}%`);
      if (filters.status) q = q.eq('relationship_status', filters.status);
      if (filters.closeness) q = q.eq('closeness', filters.closeness);
      if (filters.owner) q = q.ilike('owner', `%${filters.owner}%`);
      if (filters.origin) q = q.eq('source', filters.origin);
      if (filters.hasEmail === 'sim') q = q.not('email', 'is', null);
      if (filters.hasEmail === 'nao') q = q.is('email', null);
      if (filters.hasPhone === 'sim') q = q.not('phone', 'is', null);
      if (filters.hasPhone === 'nao') q = q.is('phone', null);
      if (filters.hasLinkedin === 'sim') q = q.not('linkedin', 'is', null);
      if (filters.hasLinkedin === 'nao') q = q.is('linkedin', null);
      if (filters.birthdayMonth) q = q.eq('birth_month', filters.birthdayMonth);
      if (filters.noInteractionDays) {
        const cutoff = new Date(Date.now() - Number(filters.noInteractionDays) * 86_400_000).toISOString();
        q = q.or(`last_interaction_at.lt.${cutoff},last_interaction_at.is.null`);
      }

      const { data: rows, count, error } = await q
        .order('full_name')
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);

      let result = (rows ?? []) as Contact[];
      if (filters.minScore) result = result.filter((c) => relationshipScore(c).total >= Number(filters.minScore));
      if (filters.incomplete) result = result.filter((c) => completeness(c) < 0.5);
      return { rows: result, count: count ?? 0 };
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () =>
      (await supabase.from('categories').select('*').order('sort_order')).data as Category[],
  });
  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => (await supabase.from('tags').select('*').order('name')).data as Tag[],
  });

  const bulkArchive = useMutation({
    mutationFn: async () => {
      const idsArr = Array.from(selected);
      const { error } = await supabase
        .from('contacts')
        .update({ is_archived: true })
        .in('id', idsArr);
      if (error) throw new Error(error.message);
      await logAudit('contact', null, 'arquivar', { quantidade: idsArr.length });
    },
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== '' && v !== false).length;

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-extrabold text-ink-900">
          Contatos <span className="text-sm font-medium text-ink-400">({total})</span>
        </h1>
        <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
          {(
            [
              { v: 'tabela', icon: List, title: 'Tabela' },
              { v: 'cards', icon: LayoutGrid, title: 'Cards' },
              { v: 'compacta', icon: Rows3, title: 'Lista compacta' },
            ] as const
          ).map(({ v, icon: Icon, title }) => (
            <button
              key={v}
              title={title}
              onClick={() => setView(v)}
              className={`rounded-md p-1.5 ${view === v ? 'bg-ink-900 text-white' : 'text-ink-400 hover:text-ink-700'}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button className="btn-secondary" onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal className="h-4 w-4" />
          Filtros {activeFilterCount > 0 && <span className="chip bg-accent-800 text-white">{activeFilterCount}</span>}
        </button>
        <button
          className="btn-secondary"
          onClick={() => exportContacts(rowsToExport(filters), 'csv')}
          title="Exportar contatos filtrados"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Novo contato
        </button>
      </div>

      {showFilters && (
        <FilterPanel
          filters={filters}
          categories={categories}
          tags={tags}
          onChange={(f) => {
            setFilters(f);
            setPage(0);
            setSelected(new Set());
          }}
          onSaveList={() => setShowSaveList(true)}
        />
      )}

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent-200 bg-accent-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-accent-900">{selected.size} selecionado(s)</span>
          <button className="btn-ghost !py-1 text-sm" onClick={() => setShowBulkTag(true)}>
            <Tags className="h-4 w-4" /> Aplicar tag
          </button>
          <button className="btn-ghost !py-1 text-sm" onClick={() => bulkArchive.mutate()}>
            <Archive className="h-4 w-4" /> Arquivar
          </button>
          <button
            className="btn-ghost !py-1 text-sm"
            onClick={async () => {
              const { data } = await supabase.from('contacts').select('*').in('id', Array.from(selected));
              exportContacts(Promise.resolve((data ?? []) as Contact[]), 'csv');
            }}
          >
            <Download className="h-4 w-4" /> Exportar seleção
          </button>
          <button className="btn-ghost !py-1 text-sm" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4" /> Limpar
          </button>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum contato encontrado"
          hint={
            activeFilterCount > 0
              ? 'Ajuste os filtros ou limpe-os para ver todos os contatos.'
              : 'Comece cadastrando um contato ou importando suas bases em Importações.'
          }
          action={
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Novo contato
              </button>
              <Link to="/importacoes/nova" className="btn-secondary">
                Importar arquivo
              </Link>
            </div>
          }
        />
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <Link key={c.id} to={`/contatos/${c.id}`} className="card flex items-start gap-3 !p-4 hover:border-accent-300">
              <Avatar name={c.full_name} photoUrl={c.photo_url} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink-900">{c.full_name}</p>
                <p className="truncate text-sm text-ink-500">
                  {[c.job_title, c.company_name].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="truncate text-xs text-ink-400">
                  {[c.city, c.state].filter(Boolean).join('/')}
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  Último contato: {fmtRelative(c.last_interaction_at)}
                </p>
              </div>
              <ScoreBadge contact={c} />
            </Link>
          ))}
        </div>
      ) : view === 'compacta' ? (
        <div className="card divide-y divide-ink-50 !p-0">
          {rows.map((c) => (
            <Link key={c.id} to={`/contatos/${c.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-ink-50">
              <Avatar name={c.full_name} photoUrl={c.photo_url} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.full_name}</span>
              <span className="hidden truncate text-xs text-ink-400 sm:block">{c.company_name}</span>
              <ScoreBadge contact={c} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} />
                </th>
                <th className="px-2 py-3">Nome</th>
                <th className="px-2 py-3">Empresa / cargo</th>
                <th className="px-2 py-3">Cidade</th>
                <th className="px-2 py-3">Grau</th>
                <th className="px-2 py-3">Último contato</th>
                <th className="px-2 py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-ink-50 hover:bg-ink-50"
                  onClick={() => navigate(`/contatos/${c.id}`)}
                >
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.full_name} photoUrl={c.photo_url} size={32} />
                      <div>
                        <p className="font-semibold text-ink-900">{c.full_name}</p>
                        <p className="text-xs text-ink-400">{c.email ?? c.phone ?? ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-ink-600">
                    {[c.company_name, c.job_title].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-2 py-2.5 text-ink-600">{[c.city, c.state].filter(Boolean).join('/') || '—'}</td>
                  <td className="px-2 py-2.5 text-ink-600">{closenessLabel(c.closeness)}</td>
                  <td className="px-2 py-2.5 text-ink-500">{fmtRelative(c.last_interaction_at)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <ScoreBadge contact={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span className="text-ink-500">
            Página {page + 1} de {totalPages}
          </span>
          <button className="btn-secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}

      {showForm && <ContactForm onClose={() => setShowForm(false)} onSaved={(id) => navigate(`/contatos/${id}`)} />}
      {showSaveList && (
        <SaveSmartListModal filters={filters} onClose={() => setShowSaveList(false)} />
      )}
      {showBulkTag && (
        <BulkTagModal
          contactIds={Array.from(selected)}
          tags={tags}
          userId={user?.id ?? ''}
          onClose={() => {
            setShowBulkTag(false);
            setSelected(new Set());
            qc.invalidateQueries({ queryKey: ['contacts'] });
          }}
        />
      )}
    </div>
  );
}

// Exporta TODOS os contatos que atendem aos filtros (não apenas a página atual)
async function rowsToExport(filters: ContactFilters): Promise<Contact[]> {
  let q = supabase.from('contacts').select('*').is('deleted_at', null).eq('is_archived', Boolean(filters.archived));
  if (filters.q) {
    const like = `%${filters.q}%`;
    q = q.or(`full_name.ilike.${like},email.ilike.${like},company_name.ilike.${like}`);
  }
  if (filters.city) q = q.ilike('city', `%${filters.city}%`);
  if (filters.state) q = q.ilike('state', `%${filters.state}%`);
  if (filters.country) q = q.ilike('country', `%${filters.country}%`);
  if (filters.company) q = q.ilike('company_name', `%${filters.company}%`);
  if (filters.status) q = q.eq('relationship_status', filters.status);
  if (filters.closeness) q = q.eq('closeness', filters.closeness);
  const { data } = await q.order('full_name').limit(10000);
  return (data ?? []) as Contact[];
}

function FilterPanel({
  filters,
  categories,
  tags,
  onChange,
  onSaveList,
}: {
  filters: ContactFilters;
  categories: Category[];
  tags: Tag[];
  onChange: (f: ContactFilters) => void;
  onSaveList: () => void;
}) {
  const set = (k: keyof ContactFilters, v: unknown) => onChange({ ...filters, [k]: v });
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return (
    <div className="card mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Field label="Busca (nome, e-mail, empresa)">
        <input className="input" value={filters.q ?? ''} onChange={(e) => set('q', e.target.value)} />
      </Field>
      <Field label="Categoria">
        <select className="input" value={filters.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || undefined)}>
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Tag">
        <select className="input" value={filters.tagId ?? ''} onChange={(e) => set('tagId', e.target.value || undefined)}>
          <option value="">Todas</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Empresa">
        <input className="input" value={filters.company ?? ''} onChange={(e) => set('company', e.target.value)} />
      </Field>
      <Field label="Cidade">
        <input className="input" value={filters.city ?? ''} onChange={(e) => set('city', e.target.value)} />
      </Field>
      <Field label="Estado">
        <input className="input" value={filters.state ?? ''} onChange={(e) => set('state', e.target.value)} />
      </Field>
      <Field label="País">
        <input className="input" value={filters.country ?? ''} onChange={(e) => set('country', e.target.value)} />
      </Field>
      <Field label="Grau de relacionamento">
        <select className="input" value={filters.closeness ?? ''} onChange={(e) => set('closeness', e.target.value ? +e.target.value : '')}>
          <option value="">Todos</option>
          {CLOSENESS_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.value}. {l.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select className="input" value={filters.status ?? ''} onChange={(e) => set('status', e.target.value || undefined)}>
          <option value="">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="enfraquecendo">Enfraquecendo</option>
          <option value="inativo">Inativo</option>
          <option value="perdido">Perdido</option>
        </select>
      </Field>
      <Field label="Score mínimo">
        <input type="number" min={0} max={100} className="input" value={filters.minScore ?? ''} onChange={(e) => set('minScore', e.target.value ? +e.target.value : '')} />
      </Field>
      <Field label="Sem interação há (dias)">
        <input type="number" min={0} className="input" value={filters.noInteractionDays ?? ''} onChange={(e) => set('noInteractionDays', e.target.value ? +e.target.value : '')} />
      </Field>
      <Field label="Aniversário no mês">
        <select className="input" value={filters.birthdayMonth ?? ''} onChange={(e) => set('birthdayMonth', e.target.value ? +e.target.value : '')}>
          <option value="">—</option>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label="Com e-mail">
        <select className="input" value={filters.hasEmail ?? ''} onChange={(e) => set('hasEmail', e.target.value)}>
          <option value="">—</option>
          <option value="sim">Com e-mail</option>
          <option value="nao">Sem e-mail</option>
        </select>
      </Field>
      <Field label="Com telefone">
        <select className="input" value={filters.hasPhone ?? ''} onChange={(e) => set('hasPhone', e.target.value)}>
          <option value="">—</option>
          <option value="sim">Com telefone</option>
          <option value="nao">Sem telefone</option>
        </select>
      </Field>
      <Field label="Com LinkedIn">
        <select className="input" value={filters.hasLinkedin ?? ''} onChange={(e) => set('hasLinkedin', e.target.value)}>
          <option value="">—</option>
          <option value="sim">Com LinkedIn</option>
          <option value="nao">Sem LinkedIn</option>
        </select>
      </Field>
      <Field label="Origem">
        <select className="input" value={filters.origin ?? ''} onChange={(e) => set('origin', e.target.value || undefined)}>
          <option value="">Todas</option>
          <option value="manual">Manual</option>
          <option value="import">Importação</option>
          <option value="demo">Demonstração</option>
        </select>
      </Field>
      <Field label="Responsável">
        <input className="input" value={filters.owner ?? ''} onChange={(e) => set('owner', e.target.value)} />
      </Field>
      <div className="flex items-end gap-4 pb-1">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={Boolean(filters.incomplete)} onChange={(e) => set('incomplete', e.target.checked)} />
          Cadastro incompleto
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={Boolean(filters.archived)} onChange={(e) => set('archived', e.target.checked)} />
          Arquivados
        </label>
      </div>
      <div className="flex items-end justify-end gap-2 sm:col-span-3 lg:col-span-4">
        <button className="btn-ghost" onClick={() => onChange({})}>Limpar filtros</button>
        <button className="btn-secondary" onClick={onSaveList}>
          <BookmarkPlus className="h-4 w-4" /> Salvar como lista inteligente
        </button>
      </div>
    </div>
  );
}

function SaveSmartListModal({ filters, onClose }: { filters: ContactFilters; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      if (!user || !name.trim()) throw new Error('Dê um nome à lista.');
      const { error } = await supabase.from('saved_filters').insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        filters,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-filters'] });
      onClose();
    },
  });
  return (
    <Modal title="Salvar lista inteligente" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome da lista *">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Empresários sem contato há 90 dias" />
        </Field>
        <Field label="Descrição">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>Salvar lista</button>
        </div>
      </div>
    </Modal>
  );
}

function BulkTagModal({
  contactIds,
  tags,
  userId,
  onClose,
}: {
  contactIds: string[];
  tags: Tag[];
  userId: string;
  onClose: () => void;
}) {
  const [tagId, setTagId] = useState('');
  const apply = useMutation({
    mutationFn: async () => {
      if (!tagId) throw new Error('Selecione uma tag.');
      const rows = contactIds.map((cid) => ({ contact_id: cid, tag_id: tagId, user_id: userId }));
      const { error } = await supabase.from('contact_tags').upsert(rows);
      if (error) throw new Error(error.message);
    },
    onSuccess: onClose,
  });
  return (
    <Modal title={`Aplicar tag a ${contactIds.length} contato(s)`} onClose={onClose}>
      <div className="space-y-3">
        <select className="input" value={tagId} onChange={(e) => setTagId(e.target.value)}>
          <option value="">Selecione a tag…</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {apply.error && <p className="text-sm text-red-600">{(apply.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => apply.mutate()} disabled={apply.isPending}>Aplicar</button>
        </div>
      </div>
    </Modal>
  );
}
