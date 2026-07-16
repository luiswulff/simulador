import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  Users, Star, TrendingDown, Cake, CalendarClock, Building2, AlertCircle, Sparkles,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/ui';
import { relationshipScore } from '../lib/score';
import { daysSince, interactionLabel, fmtDateTime } from '../lib/format';
import type { Contact, Interaction } from '../types/db';

async function countWhere(build: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<number> {
  const q = build(base());
  const { count } = await q;
  return count ?? 0;
}
function base() {
  return supabase.from('contacts').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('is_archived', false);
}

export function DashboardPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const d90 = subDays(new Date(), 90).toISOString();
  const d180 = subDays(new Date(), 180).toISOString();
  const d30 = subDays(new Date(), 30).toISOString();
  const thisMonth = new Date().getMonth() + 1;

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: async () => {
      const [total, strategic, close, no90, no180, novos, incomplete, birthdays, week] = await Promise.all([
        countWhere((q) => q),
        countWhere((q) => q.eq('closeness', 1)),
        countWhere((q) => q.in('closeness', [2, 3])),
        countWhere((q) => q.or(`last_interaction_at.lt.${d90},last_interaction_at.is.null`)),
        countWhere((q) => q.or(`last_interaction_at.lt.${d180},last_interaction_at.is.null`)),
        countWhere((q) => q.gte('created_at', d30)),
        countWhere((q) => q.is('email', null).is('phone', null)),
        countWhere((q) => q.eq('birth_month', thisMonth)),
        countWhere((q) => q.lte('next_contact_date', format(subDays(new Date(), -7), 'yyyy-MM-dd')).gte('next_contact_date', today)),
      ]);
      const { count: reminders } = await supabase
        .from('reminders')
        .select('id', { count: 'exact', head: true })
        .eq('is_done', false)
        .lte('due_date', today);
      return { total, strategic, close, no90, no180, novos, incomplete, birthdays, week, reminders: reminders ?? 0 };
    },
  });

  const { data: categoryCounts = [] } = useQuery({
    queryKey: ['dashboard', 'categories'],
    queryFn: async () => {
      const { data } = await supabase.from('contact_categories').select('category_id, categories(name)');
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        const name = (r.categories as unknown as { name: string })?.name;
        if (name) map.set(name, (map.get(name) ?? 0) + 1);
      }
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    },
  });

  const { data: geo = [] } = useQuery({
    queryKey: ['dashboard', 'geo'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('city, state')
        .is('deleted_at', null)
        .not('city', 'is', null)
        .limit(10000);
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        const key = [r.city, r.state].filter(Boolean).join('/');
        if (key) map.set(key, (map.get(key) ?? 0) + 1);
      }
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    },
  });

  const { data: topCompanies = [] } = useQuery({
    queryKey: ['dashboard', 'companies'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('company_name')
        .is('deleted_at', null)
        .not('company_name', 'is', null)
        .limit(10000);
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        if (r.company_name) map.set(r.company_name, (map.get(r.company_name) ?? 0) + 1);
      }
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ['dashboard', 'recent-interactions'],
    queryFn: async () =>
      (
        await supabase
          .from('interactions')
          .select('*, contacts(id, full_name)')
          .order('occurred_at', { ascending: false })
          .limit(8)
      ).data as (Interaction & { contacts: { id: string; full_name: string } | null })[],
  });

  const { data: growth = [] } = useQuery({
    queryKey: ['dashboard', 'growth'],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('created_at')
        .is('deleted_at', null)
        .order('created_at')
        .limit(20000);
      const byMonth = new Map<string, number>();
      for (const r of data ?? []) {
        const m = r.created_at.slice(0, 7);
        byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
      }
      const months = Array.from(byMonth.entries()).slice(-12);
      let acc = 0;
      // acumulado anterior aos 12 meses exibidos
      for (const [m, n] of byMonth.entries()) {
        if (months.length && m < months[0][0]) acc += n;
      }
      return months.map(([m, n]) => ({ month: m, added: n, total: (acc += n) }));
    },
  });

  // "Quem devo contatar agora?" — prioriza importância, tempo sem interação,
  // lembrete vencido, próximo contato vencido, aniversário do mês e status.
  const { data: suggestions = [] } = useQuery({
    queryKey: ['dashboard', 'suggestions'],
    queryFn: async () => {
      const { data: cands } = await supabase
        .from('contacts')
        .select('*')
        .is('deleted_at', null)
        .eq('is_archived', false)
        .or(`closeness.lte.3,importance.gte.4,next_contact_date.lte.${today},relationship_status.eq.enfraquecendo,birth_month.eq.${thisMonth}`)
        .limit(400);
      const { data: overdue } = await supabase
        .from('reminders')
        .select('contact_id')
        .eq('is_done', false)
        .lt('due_date', today);
      const overdueSet = new Set((overdue ?? []).map((r) => r.contact_id));

      const scored = ((cands ?? []) as Contact[]).map((c) => {
        const days = daysSince(c.last_interaction_at);
        let urgency = 0;
        const reasons: string[] = [];
        if (c.importance && c.importance >= 4) {
          urgency += c.importance * 4;
          reasons.push('alta importância');
        }
        if (c.closeness && c.closeness <= 2) urgency += 8;
        if (days === null) {
          urgency += 10;
          reasons.push('nenhuma interação registrada');
        } else if (days > 180) {
          urgency += 18;
          reasons.push(`${days} dias sem contato`);
        } else if (days > 90) {
          urgency += 12;
          reasons.push(`${days} dias sem contato`);
        }
        if (c.next_contact_date && c.next_contact_date <= today) {
          urgency += 15;
          reasons.push('próximo contato vencido');
        }
        if (overdueSet.has(c.id)) {
          urgency += 15;
          reasons.push('lembrete atrasado');
        }
        if (c.relationship_status === 'enfraquecendo') {
          urgency += 10;
          reasons.push('relacionamento enfraquecendo');
        }
        if (c.birth_month === thisMonth) {
          urgency += 8;
          reasons.push('aniversário este mês');
        }
        if (c.opportunities) {
          urgency += 6;
          reasons.push('oportunidade em aberto');
        }
        return { contact: c, urgency, reasons };
      });
      return scored
        .filter((s) => s.urgency >= 15)
        .sort((a, b) => b.urgency - a.urgency)
        .slice(0, 8);
    },
  });

  if (isLoading || !kpis) return <Spinner />;

  const maxGrowth = Math.max(1, ...growth.map((g) => g.total));

  return (
    <div>
      <h1 className="mb-1 text-xl font-extrabold text-ink-900">Dashboard executivo</h1>
      <p className="mb-5 text-sm text-ink-500">Relacionamentos construídos ao longo do tempo</p>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={Users} label="Total de contatos" value={kpis.total} to="/contatos" />
        <Kpi icon={Star} label="Estratégicos" value={kpis.strategic} to={`/contatos?filtros=${enc({ closeness: 1 })}`} />
        <Kpi icon={Users} label="Próximos" value={kpis.close} to={`/contatos?filtros=${enc({ closeness: 2 })}`} />
        <Kpi icon={TrendingDown} label="+90 dias sem contato" value={kpis.no90} to={`/contatos?filtros=${enc({ noInteractionDays: 90 })}`} tone="amber" />
        <Kpi icon={TrendingDown} label="+180 dias sem contato" value={kpis.no180} to={`/contatos?filtros=${enc({ noInteractionDays: 180 })}`} tone="red" />
        <Kpi icon={Cake} label="Aniversários no mês" value={kpis.birthdays} to={`/contatos?filtros=${enc({ birthdayMonth: thisMonth })}`} />
        <Kpi icon={CalendarClock} label="Acionar esta semana" value={kpis.week + kpis.reminders} to="/agenda" />
        <Kpi icon={Users} label="Novos (30 dias)" value={kpis.novos} />
        <Kpi icon={AlertCircle} label="Sem e-mail e telefone" value={kpis.incomplete} to={`/contatos?filtros=${enc({ hasEmail: 'nao', hasPhone: 'nao' })}`} tone="amber" />
        <Kpi icon={CalendarClock} label="Lembretes vencidos" value={kpis.reminders} to="/agenda" tone={kpis.reminders ? 'red' : undefined} />
      </div>

      {/* Quem devo contatar agora */}
      <div className="card mb-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink-900">
          <Sparkles className="h-4 w-4 text-accent-700" /> Quem devo contatar agora?
        </h2>
        {suggestions.length === 0 ? (
          <p className="text-sm text-ink-400">
            Tudo em dia. As sugestões consideram importância, tempo sem interação, lembretes vencidos,
            aniversários, oportunidades e relacionamentos enfraquecendo.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestions.map(({ contact: c, reasons }) => (
              <Link key={c.id} to={`/contatos/${c.id}`} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3 hover:border-accent-300">
                <Avatar name={c.full_name} photoUrl={c.photo_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">{c.full_name}</p>
                  <p className="truncate text-xs text-ink-500">{[c.job_title, c.company_name].filter(Boolean).join(' · ')}</p>
                  <p className="truncate text-xs font-medium text-amber-700">{reasons.slice(0, 2).join(' · ')}</p>
                </div>
                <span className="chip bg-accent-100 text-accent-800">{relationshipScore(c).total}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evolução da base */}
        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-400">Evolução da base (12 meses)</h3>
          {growth.length === 0 ? (
            <p className="text-sm text-ink-400">Sem dados ainda.</p>
          ) : (
            <div className="flex h-36 items-end gap-1">
              {growth.map((g) => (
                <div key={g.month} className="group flex flex-1 flex-col items-center gap-1" title={`${g.month}: ${g.total} contatos (+${g.added})`}>
                  <div className="w-full rounded-t bg-accent-700 transition-colors group-hover:bg-accent-500" style={{ height: `${(100 * g.total) / maxGrowth}%` }} />
                  <span className="hidden text-[9px] text-ink-400 sm:block">{g.month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Categorias */}
        <RankCard title="Contatos por categoria" rows={categoryCounts} />
        <RankCard title="Principais empresas da rede" rows={topCompanies} icon={Building2} />
        <RankCard title="Cidades com mais contatos" rows={geo} />

        {/* Últimas interações */}
        <div className="card lg:col-span-2">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-400">Últimas interações</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhuma interação registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-ink-50">
              {recent.map((i) => (
                <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                  <span className="w-36 shrink-0 text-xs text-ink-400">{fmtDateTime(i.occurred_at)}</span>
                  <span className="chip bg-accent-100 text-accent-800">{interactionLabel(i.kind)}</span>
                  <span className="min-w-0 flex-1 truncate">{i.summary}</span>
                  {i.contacts && (
                    <Link to={`/contatos/${i.contacts.id}`} className="font-medium text-accent-700 hover:underline">
                      {i.contacts.full_name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function enc(filters: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(filters));
}

function Kpi({
  icon: Icon,
  label,
  value,
  to,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  to?: string;
  tone?: 'amber' | 'red';
}) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-ink-900';
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-ink-300" />
      </div>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value.toLocaleString('pt-BR')}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </>
  );
  return to ? (
    <Link to={to} className="card !p-4 transition-colors hover:border-accent-300">{inner}</Link>
  ) : (
    <div className="card !p-4">{inner}</div>
  );
}

function RankCard({ title, rows, icon: Icon }: { title: string; rows: [string, number][]; icon?: typeof Users }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div className="card">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-400">
        {Icon && <Icon className="h-4 w-4" />} {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-400">Sem dados ainda.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([name, n]) => (
            <li key={name} className="flex items-center gap-2 text-sm">
              <span className="w-40 shrink-0 truncate text-ink-700">{name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-accent-600" style={{ width: `${(100 * n) / max}%` }} />
              </div>
              <span className="w-10 text-right font-semibold text-ink-900">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
