import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { logAudit } from '../lib/audit';
import { Modal, Field } from './ui';
import { INTERACTION_KINDS } from '../lib/format';
import type { Interaction, Note, Reminder } from '../types/db';

function useContactOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['contact-options'],
    enabled,
    queryFn: async () =>
      (
        await supabase
          .from('contacts')
          .select('id, full_name')
          .is('deleted_at', null)
          .order('full_name')
          .limit(5000)
      ).data as { id: string; full_name: string }[],
  });
}

function ContactSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { data: options = [] } = useContactOptions(true);
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— Sem contato vinculado —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.full_name}
        </option>
      ))}
    </select>
  );
}

export function InteractionForm({
  contactId,
  interaction,
  defaultKind,
  onClose,
}: {
  contactId?: string | null;
  interaction?: Interaction | null;
  defaultKind?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { ownerId } = useWorkspace();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    contact_id: interaction?.contact_id ?? contactId ?? null,
    kind: interaction?.kind ?? defaultKind ?? 'reuniao',
    summary: interaction?.summary ?? '',
    description: interaction?.description ?? '',
    occurred_at: (interaction?.occurred_at ?? new Date().toISOString()).slice(0, 16),
    participants: interaction?.participants ?? '',
    next_action: interaction?.next_action ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sessão expirada');
      if (!form.summary.trim()) throw new Error('Descreva um resumo da interação.');
      const payload = {
        ...form,
        summary: form.summary.trim(),
        occurred_at: new Date(form.occurred_at).toISOString(),
        user_id: ownerId,
      };
      if (interaction) {
        const { error } = await supabase.from('interactions').update(payload).eq('id', interaction.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('interactions').insert(payload);
        if (error) throw new Error(error.message);
      }
      await logAudit('interaction', interaction?.id ?? null, interaction ? 'editar' : 'criar');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interactions'] });
      qc.invalidateQueries({ queryKey: ['contact'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title={interaction ? 'Editar interação' : 'Registrar interação'} onClose={onClose}>
      <div className="space-y-3">
        {!contactId && (
          <Field label="Contato">
            <ContactSelect value={form.contact_id} onChange={(v) => setForm((f) => ({ ...f, contact_id: v }))} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select className="input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
              {INTERACTION_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Data e hora">
            <input type="datetime-local" className="input" value={form.occurred_at} onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))} />
          </Field>
        </div>
        <Field label="Resumo *">
          <input className="input" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Ex.: Almoço para discutir a reforma tributária" />
        </Field>
        <Field label="Descrição">
          <textarea className="input" rows={3} value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Participantes">
            <input className="input" value={form.participants ?? ''} onChange={(e) => setForm((f) => ({ ...f, participants: e.target.value }))} />
          </Field>
          <Field label="Próxima ação">
            <input className="input" value={form.next_action ?? ''} onChange={(e) => setForm((f) => ({ ...f, next_action: e.target.value }))} />
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ReminderForm({
  contactId,
  reminder,
  onClose,
}: {
  contactId?: string | null;
  reminder?: Reminder | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { ownerId } = useWorkspace();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    contact_id: reminder?.contact_id ?? contactId ?? null,
    title: reminder?.title ?? '',
    reason: reminder?.reason ?? '',
    due_date: reminder?.due_date ?? new Date().toISOString().slice(0, 10),
    recurrence: reminder?.recurrence ?? 'nenhuma',
    priority: reminder?.priority ?? 'media',
    channel: reminder?.channel ?? '',
    notes: reminder?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sessão expirada');
      if (!form.title.trim()) throw new Error('Dê um título ao lembrete.');
      const payload = { ...form, title: form.title.trim(), user_id: ownerId };
      if (reminder) {
        const { error } = await supabase.from('reminders').update(payload).eq('id', reminder.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('reminders').insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title={reminder ? 'Editar lembrete' : 'Novo lembrete'} onClose={onClose}>
      <div className="space-y-3">
        {!contactId && (
          <Field label="Contato">
            <ContactSelect value={form.contact_id} onChange={(v) => setForm((f) => ({ ...f, contact_id: v }))} />
          </Field>
        )}
        <Field label="Título *">
          <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex.: Ligar para retomar conversa" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input type="date" className="input" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          </Field>
          <Field label="Prioridade">
            <select className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </Field>
          <Field label="Recorrência">
            <select className="input" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}>
              <option value="nenhuma">Sem recorrência</option>
              <option value="mensal">Mensal</option>
              <option value="bimestral">Bimestral</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </Field>
          <Field label="Canal sugerido">
            <select className="input" value={form.channel ?? ''} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
              <option value="">—</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="ligacao">Ligação</option>
              <option value="email">E-mail</option>
              <option value="presencial">Presencial</option>
            </select>
          </Field>
        </div>
        <Field label="Motivo">
          <input className="input" value={form.reason ?? ''} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </Field>
        <Field label="Observações">
          <textarea className="input" rows={2} value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function NoteForm({
  contactId,
  companyId,
  note,
  onClose,
}: {
  contactId?: string | null;
  companyId?: string | null;
  note?: Note | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { ownerId } = useWorkspace();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: note?.title ?? '',
    body: note?.body ?? '',
    is_private: note?.is_private ?? false,
    is_pinned: note?.is_pinned ?? false,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sessão expirada');
      if (!form.body.trim()) throw new Error('Escreva o conteúdo da nota.');
      const payload = {
        ...form,
        title: form.title.trim() || null,
        contact_id: note?.contact_id ?? contactId ?? null,
        company_id: note?.company_id ?? companyId ?? null,
        user_id: ownerId,
      };
      if (note) {
        const { error } = await supabase.from('notes').update(payload).eq('id', note.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('notes').insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title={note ? 'Editar nota' : 'Nova nota'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Título">
          <input className="input" value={form.title ?? ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </Field>
        <Field label="Texto *">
          <textarea className="input" rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        </Field>
        <div className="flex gap-5 text-sm text-ink-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_private} onChange={(e) => setForm((f) => ({ ...f, is_private: e.target.checked }))} />
            Nota privada
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))} />
            Fixar nota
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
