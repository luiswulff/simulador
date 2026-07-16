import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAudit } from '../../lib/audit';
import { Modal, Field } from '../../components/ui';
import { CLOSENESS_LEVELS } from '../../lib/score';
import { normalizePhone, parseBirthday, cleanSpaces } from '../../lib/normalize';
import type { Contact, Category, Tag } from '../../types/db';

const EMPTY: Partial<Contact> = { relationship_status: 'ativo' };

export function ContactForm({
  contact,
  onClose,
  onSaved,
}: {
  contact?: Contact | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Contact>>(contact ?? EMPTY);
  const [birthdayText, setBirthdayText] = useState(
    contact?.birth_date
      ? contact.birth_date.split('-').reverse().join('/')
      : contact?.birth_day && contact?.birth_month
        ? `${String(contact.birth_day).padStart(2, '0')}/${String(contact.birth_month).padStart(2, '0')}`
        : '',
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () =>
      (await supabase.from('categories').select('*').order('sort_order')).data as Category[],
  });
  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => (await supabase.from('tags').select('*').order('name')).data as Tag[],
  });

  useEffect(() => {
    if (!contact) return;
    supabase
      .from('contact_categories')
      .select('category_id')
      .eq('contact_id', contact.id)
      .then(({ data }) => setSelectedCategories((data ?? []).map((r) => r.category_id)));
    supabase
      .from('contact_tags')
      .select('tag_id')
      .eq('contact_id', contact.id)
      .then(({ data }) => setSelectedTags((data ?? []).map((r) => r.tag_id)));
  }, [contact]);

  const set = (k: keyof Contact, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sessão expirada');
      const name = cleanSpaces(form.full_name ?? '');
      if (!name) throw new Error('O nome completo é obrigatório.');
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email))
        throw new Error('E-mail principal inválido.');
      const bday = parseBirthday(birthdayText);
      const payload: Record<string, unknown> = {
        ...form,
        full_name: name,
        email: form.email?.trim().toLowerCase() || null,
        whatsapp: form.whatsapp ? normalizePhone(form.whatsapp) : null,
        birth_date: bday.birth_date,
        birth_day: bday.birth_day,
        birth_month: bday.birth_month,
        user_id: user.id,
      };
      // remove campos calculados/relacionais
      for (const k of ['id', 'created_at', 'updated_at', 'interactions_count', 'last_interaction_at']) {
        delete payload[k];
      }
      let id = contact?.id;
      if (id) {
        const { error } = await supabase.from('contacts').update(payload).eq('id', id);
        if (error) throw new Error(error.message);
        await logAudit('contact', id, 'editar', { nome: name });
      } else {
        const { data, error } = await supabase
          .from('contacts')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        id = data.id as string;
        await logAudit('contact', id, 'criar', { nome: name });
      }
      // categorias e tags (substitui o conjunto)
      await supabase.from('contact_categories').delete().eq('contact_id', id);
      if (selectedCategories.length)
        await supabase.from('contact_categories').insert(
          selectedCategories.map((cid) => ({ contact_id: id, category_id: cid, user_id: user.id })),
        );
      await supabase.from('contact_tags').delete().eq('contact_id', id);
      if (selectedTags.length)
        await supabase.from('contact_tags').insert(
          selectedTags.map((tid) => ({ contact_id: id, tag_id: tid, user_id: user.id })),
        );
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact', id] });
      onSaved?.(id!);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const addTag = async () => {
    const name = cleanSpaces(newTag);
    if (!name || !user) return;
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedTags.includes(existing.id)) setSelectedTags((s) => [...s, existing.id]);
    } else {
      const { data } = await supabase
        .from('tags')
        .insert({ user_id: user.id, name })
        .select()
        .single();
      if (data) {
        qc.invalidateQueries({ queryKey: ['tags'] });
        setSelectedTags((s) => [...s, data.id]);
      }
    }
    setNewTag('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate();
  };

  return (
    <Modal title={contact ? 'Editar contato' : 'Novo contato'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Section title="Identificação" defaultOpen>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome completo *">
              <input className="input" value={form.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} required />
            </Field>
            <Field label="Nome preferencial">
              <input className="input" value={form.preferred_name ?? ''} onChange={(e) => set('preferred_name', e.target.value)} />
            </Field>
            <Field label="Cargo">
              <input className="input" value={form.job_title ?? ''} onChange={(e) => set('job_title', e.target.value)} />
            </Field>
            <Field label="Empresa">
              <input className="input" value={form.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} />
            </Field>
            <Field label="Departamento">
              <input className="input" value={form.department ?? ''} onChange={(e) => set('department', e.target.value)} />
            </Field>
            <Field label="Profissão">
              <input className="input" value={form.profession ?? ''} onChange={(e) => set('profession', e.target.value)} />
            </Field>
            <Field label="Segmento de atuação">
              <input className="input" value={form.segment ?? ''} onChange={(e) => set('segment', e.target.value)} />
            </Field>
            <Field label="Aniversário (dd/mm/aaaa ou dd/mm)">
              <input className="input" value={birthdayText} onChange={(e) => setBirthdayText(e.target.value)} placeholder="21/03/1975 ou 21/03" />
            </Field>
            <Field label="Cidade">
              <input className="input" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Estado (UF)">
              <input className="input" value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} />
            </Field>
            <Field label="País">
              <input className="input" value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} />
            </Field>
            <Field label="Idioma principal">
              <input className="input" value={form.language ?? ''} onChange={(e) => set('language', e.target.value)} />
            </Field>
            <Field label="Gênero (se informado)">
              <input className="input" value={form.gender ?? ''} onChange={(e) => set('gender', e.target.value)} />
            </Field>
            <Field label="CPF / documento (opcional)">
              <input className="input" value={form.document ?? ''} onChange={(e) => set('document', e.target.value)} />
            </Field>
            <Field label="Código interno">
              <input className="input" value={form.internal_code ?? ''} onChange={(e) => set('internal_code', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Contato" defaultOpen>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="E-mail principal">
              <input type="email" className="input" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Telefone">
              <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="WhatsApp">
              <input className="input" value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+55 51 99999-9999" />
            </Field>
            <Field label="LinkedIn">
              <input className="input" value={form.linkedin ?? ''} onChange={(e) => set('linkedin', e.target.value)} />
            </Field>
            <Field label="Instagram">
              <input className="input" value={form.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} />
            </Field>
            <Field label="X / Twitter">
              <input className="input" value={form.twitter ?? ''} onChange={(e) => set('twitter', e.target.value)} />
            </Field>
            <Field label="Site">
              <input className="input" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Relacionamento" defaultOpen>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categorias">
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-ink-200 p-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setSelectedCategories((s) =>
                        s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id],
                      )
                    }
                    className={`chip ${selectedCategories.includes(c.id) ? 'bg-accent-800 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </Field>
            <div className="space-y-3">
              <Field label="Grau de relacionamento">
                <select className="input" value={form.closeness ?? ''} onChange={(e) => set('closeness', e.target.value ? +e.target.value : null)}>
                  <option value="">—</option>
                  {CLOSENESS_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.value}. {l.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status do relacionamento">
                <select className="input" value={form.relationship_status ?? 'ativo'} onChange={(e) => set('relationship_status', e.target.value)}>
                  <option value="ativo">Ativo</option>
                  <option value="enfraquecendo">Enfraquecendo</option>
                  <option value="inativo">Inativo</option>
                  <option value="perdido">Perdido</option>
                </select>
              </Field>
            </div>
            <RatingField label="Importância (1–5)" value={form.importance} onChange={(v) => set('importance', v)} />
            <RatingField label="Influência (1–5)" value={form.influence} onChange={(v) => set('influence', v)} />
            <RatingField label="Potencial comercial (1–5)" value={form.business_potential} onChange={(v) => set('business_potential', v)} />
            <RatingField label="Nível de confiança (1–5)" value={form.trust_level} onChange={(v) => set('trust_level', v)} />
            <Field label="Como conheci">
              <input className="input" value={form.how_we_met ?? ''} onChange={(e) => set('how_we_met', e.target.value)} />
            </Field>
            <Field label="Quem apresentou">
              <input className="input" value={form.introduced_by ?? ''} onChange={(e) => set('introduced_by', e.target.value)} />
            </Field>
            <Field label="Evento / contexto de origem">
              <input className="input" value={form.origin_context ?? ''} onChange={(e) => set('origin_context', e.target.value)} />
            </Field>
            <Field label="Data em que nos conhecemos">
              <input type="date" className="input" value={form.met_date ?? ''} onChange={(e) => set('met_date', e.target.value || null)} />
            </Field>
            <Field label="Próximo contato sugerido">
              <input type="date" className="input" value={form.next_contact_date ?? ''} onChange={(e) => set('next_contact_date', e.target.value || null)} />
            </Field>
            <Field label="Frequência desejada">
              <select className="input" value={form.contact_frequency ?? ''} onChange={(e) => set('contact_frequency', e.target.value || null)}>
                <option value="">—</option>
                <option value="mensal">Mensal</option>
                <option value="bimestral">Bimestral</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
                <option value="personalizada">Personalizada</option>
              </select>
            </Field>
            <Field label="Responsável interno">
              <input className="input" value={form.owner ?? ''} onChange={(e) => set('owner', e.target.value)} />
            </Field>
            <Field label="Tags" className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {tags
                  .filter((t) => selectedTags.includes(t.id))
                  .map((t) => (
                    <button key={t.id} type="button" className="chip bg-accent-100 text-accent-800" onClick={() => setSelectedTags((s) => s.filter((x) => x !== t.id))}>
                      {t.name} ×
                    </button>
                  ))}
                <input
                  className="input !w-52"
                  list="tag-options"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Adicionar tag e Enter"
                />
                <datalist id="tag-options">
                  {tags.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </div>
            </Field>
            <Field label="Assuntos de interesse" className="sm:col-span-2">
              <input className="input" value={form.interests ?? ''} onChange={(e) => set('interests', e.target.value)} />
            </Field>
            <Field label="Preferências pessoais" className="sm:col-span-2">
              <input className="input" value={form.preferences ?? ''} onChange={(e) => set('preferences', e.target.value)} />
            </Field>
            <Field label="Oportunidades existentes" className="sm:col-span-2">
              <input className="input" value={form.opportunities ?? ''} onChange={(e) => set('opportunities', e.target.value)} />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <textarea className="input" rows={2} value={form.observations ?? ''} onChange={(e) => set('observations', e.target.value)} />
            </Field>
            <Field label="Notas privadas" className="sm:col-span-2">
              <textarea className="input" rows={2} value={form.private_notes ?? ''} onChange={(e) => set('private_notes', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Informações pessoais (discretas)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cônjuge">
              <input className="input" value={form.spouse_name ?? ''} onChange={(e) => set('spouse_name', e.target.value)} />
            </Field>
            <Field label="Filhos">
              <input className="input" value={form.children ?? ''} onChange={(e) => set('children', e.target.value)} />
            </Field>
            <Field label="Datas relevantes">
              <input className="input" value={form.relevant_dates ?? ''} onChange={(e) => set('relevant_dates', e.target.value)} />
            </Field>
            <Field label="Hobbies / esportes / vinhos / clubes">
              <input className="input" value={form.hobbies ?? ''} onChange={(e) => set('hobbies', e.target.value)} />
            </Field>
            <Field label="Outras informações para fortalecer o relacionamento" className="sm:col-span-2">
              <textarea className="input" rows={2} value={form.personal_info ?? ''} onChange={(e) => set('personal_info', e.target.value)} />
            </Field>
          </div>
        </Section>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar contato'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="rounded-xl border border-ink-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-ink-800"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function RatingField({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`h-8 w-8 rounded-lg border text-sm font-semibold ${
              (value ?? 0) >= n
                ? 'border-accent-800 bg-accent-800 text-white'
                : 'border-ink-200 bg-white text-ink-400 hover:border-ink-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </Field>
  );
}
