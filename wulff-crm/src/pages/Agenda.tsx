import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addMonths, format } from 'date-fns';
import { Plus, Check, Cake, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { ReminderForm } from '../components/QuickForms';
import { fmtDate } from '../lib/format';
import type { Contact, Reminder } from '../types/db';

type ReminderWithContact = Reminder & { contacts: { id: string; full_name: string } | null };

const RECURRENCE_MONTHS: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
};

export function AgendaPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd');

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['reminders', 'agenda'],
    queryFn: async () =>
      (
        await supabase
          .from('reminders')
          .select('*, contacts(id, full_name)')
          .eq('is_done', false)
          .lte('due_date', in30)
          .order('due_date')
      ).data as ReminderWithContact[],
  });

  const thisMonth = new Date().getMonth() + 1;
  const nextMonth = (thisMonth % 12) + 1;
  const { data: birthdays = [] } = useQuery({
    queryKey: ['birthdays', thisMonth],
    queryFn: async () =>
      (
        await supabase
          .from('contacts')
          .select('id, full_name, birth_day, birth_month, photo_url')
          .in('birth_month', [thisMonth, nextMonth])
          .is('deleted_at', null)
          .order('birth_month')
          .order('birth_day')
      ).data as Pick<Contact, 'id' | 'full_name' | 'birth_day' | 'birth_month' | 'photo_url'>[],
  });

  const complete = useMutation({
    mutationFn: async (r: Reminder) => {
      await supabase
        .from('reminders')
        .update({ is_done: true, done_at: new Date().toISOString() })
        .eq('id', r.id);
      // Recorrência: cria a próxima ocorrência automaticamente
      const months = RECURRENCE_MONTHS[r.recurrence];
      if (months) {
        const next = format(addMonths(new Date(r.due_date + 'T12:00:00'), months), 'yyyy-MM-dd');
        const { id: _id, created_at: _c, ...rest } = r as Reminder & { contacts?: unknown };
        delete (rest as Record<string, unknown>).contacts;
        delete (rest as Record<string, unknown>).updated_at;
        await supabase.from('reminders').insert({ ...rest, due_date: next, is_done: false, done_at: null });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (isLoading) return <Spinner />;

  const overdue = reminders.filter((r) => r.due_date < today);
  const todayList = reminders.filter((r) => r.due_date === today);
  const week = reminders.filter((r) => r.due_date > today && r.due_date <= in7);
  const month = reminders.filter((r) => r.due_date > in7);

  const bdayUpcoming = birthdays.filter((b) => {
    if (!b.birth_day || !b.birth_month) return false;
    const now = new Date();
    return !(b.birth_month === thisMonth && b.birth_day < now.getDate());
  });

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <h1 className="mr-auto text-xl font-extrabold text-ink-900">Agenda de relacionamento</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Novo lembrete
        </button>
      </div>

      {reminders.length === 0 && bdayUpcoming.length === 0 && (
        <EmptyState
          title="Agenda vazia"
          hint="Crie lembretes de próximo contato e configure cadências (mensal, trimestral…) para manter relacionamentos aquecidos."
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Novo lembrete
            </button>
          }
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Bucket title="Atrasados" tone="red" items={overdue} onDone={(r) => complete.mutate(r)} onEdit={setEditing} />
        <Bucket title="Hoje" tone="accent" items={todayList} onDone={(r) => complete.mutate(r)} onEdit={setEditing} />
        <Bucket title="Esta semana" tone="amber" items={week} onDone={(r) => complete.mutate(r)} onEdit={setEditing} />
        <Bucket title="Próximos 30 dias" tone="ink" items={month} onDone={(r) => complete.mutate(r)} onEdit={setEditing} />

        {bdayUpcoming.length > 0 && (
          <div className="card lg:col-span-2">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-400">
              <Cake className="h-4 w-4" /> Aniversários próximos
            </h3>
            <div className="flex flex-wrap gap-2">
              {bdayUpcoming.map((b) => (
                <Link key={b.id} to={`/contatos/${b.id}`} className="chip bg-pink-50 !py-1.5 text-pink-800 hover:bg-pink-100">
                  {b.full_name} · {String(b.birth_day).padStart(2, '0')}/{String(b.birth_month).padStart(2, '0')}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && <ReminderForm onClose={() => setShowForm(false)} />}
      {editing && <ReminderForm reminder={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const TONES: Record<string, string> = {
  red: 'border-red-200 bg-red-50 text-red-800',
  accent: 'border-accent-200 bg-accent-50 text-accent-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  ink: 'border-ink-200 bg-ink-100 text-ink-600',
};

function Bucket({
  title,
  tone,
  items,
  onDone,
  onEdit,
}: {
  title: string;
  tone: string;
  items: ReminderWithContact[];
  onDone: (r: Reminder) => void;
  onEdit: (r: Reminder) => void;
}) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-400">{title}</h3>
        <span className={`chip border ${TONES[tone]}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-300">Nada aqui.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="group flex items-start gap-2.5">
              <button
                className="mt-0.5 rounded-full border border-ink-300 p-1 text-transparent hover:border-accent-600 hover:text-accent-600"
                title="Concluir"
                onClick={() => onDone(r)}
              >
                <Check className="h-3 w-3" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{r.title}</p>
                <p className="text-xs text-ink-400">
                  {fmtDate(r.due_date)}
                  {r.priority === 'alta' && <span className="ml-1 text-red-600">· alta prioridade</span>}
                  {r.recurrence !== 'nenhuma' && ` · ${r.recurrence}`}
                  {r.channel && ` · via ${r.channel}`}
                </p>
                {r.contacts && (
                  <Link to={`/contatos/${r.contacts.id}`} className="text-xs font-medium text-accent-700 hover:underline">
                    {r.contacts.full_name}
                  </Link>
                )}
                {r.reason && <p className="text-xs text-ink-500">{r.reason}</p>}
              </div>
              <button className="btn-ghost hidden !p-1.5 group-hover:block" onClick={() => onEdit(r)} title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
