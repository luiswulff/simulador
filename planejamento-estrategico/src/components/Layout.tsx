import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Compass, Mountain, Network, ListChecks, Gauge, Building2, Users,
  Wallet, GraduationCap, TrendingUp, Settings, LogOut, Menu, X, Lock, Target, ChevronRight, CalendarRange,
} from 'lucide-react';
import { useAuth, usePode } from '../contexts/AuthContext';
import { config } from '../config';
import type { Papel } from '../data/types';

type Item = { to: string; label: string; icon: typeof Compass; end?: boolean; confidencial?: boolean };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: '', itens: [{ to: '/', label: 'Painel', icon: LayoutDashboard, end: true }] },
  { titulo: 'Direção', itens: [
    { to: '/identidade', label: 'Missão, visão e valores', icon: Compass },
    { to: '/ambicao', label: 'Ambição 2030', icon: Mountain },
  ] },
  { titulo: 'Desdobramento', itens: [
    { to: '/estrategia', label: 'Mapa estratégico', icon: Network },
    { to: '/indicadores', label: 'Indicadores', icon: Gauge },
    { to: '/execucao', label: 'Planos de ação', icon: ListChecks },
  ] },
  { titulo: 'Organização', itens: [
    { to: '/areas', label: 'Áreas', icon: Building2 },
    { to: '/pessoas', label: 'Pessoas', icon: Users },
  ] },
  { titulo: 'Gente & Sociedade', itens: [
    { to: '/cargos-salarios', label: 'Cargos e salários', icon: Wallet, confidencial: true },
    { to: '/carreira-societaria', label: 'Carreira societária', icon: GraduationCap },
  ] },
  { titulo: 'Valor', itens: [{ to: '/valuation', label: 'Valuation', icon: TrendingUp, confidencial: true }] },
  { titulo: '', itens: [{ to: '/configuracoes', label: 'Configurações', icon: Settings }] },
];

const PAPEIS: { value: Papel; label: string }[] = [
  { value: 'diretoria', label: 'Diretoria' },
  { value: 'lider', label: 'Líder de área' },
  { value: 'colaborador', label: 'Colaborador' },
];

export function Layout() {
  const { email, sair, papel, simularPapel } = useAuth();
  const pode = usePode();
  const [aberto, setAberto] = useState(false);
  const { pathname } = useLocation();
  const itens = GRUPOS.flatMap((g) => g.itens);
  const paginaAtual = (pathname === '/' ? itens[0] : itens.filter((i) => i.to !== '/').find((i) => pathname.startsWith(i.to)))?.label ?? '';

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {GRUPOS.map((g, gi) => (
        <div key={gi}>
          {g.titulo && <p className="px-3 pb-1 text-xs font-medium text-ink-500">{g.titulo}</p>}
          <div className="flex flex-col gap-0.5">
            {g.itens.filter((i) => !i.confidencial || pode.verConfidencial).map(({ to, label, icon: Icon, end, confidencial }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setAberto(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                    isActive
                      ? 'bg-accent-50 font-semibold text-ink-950 ring-1 ring-accent-400 shadow-[inset_3px_0_0_#a98445]'
                      : 'text-ink-700 hover:bg-ink-50 hover:text-ink-950'}`}>
                <Icon className="h-[18px] w-[18px] text-ink-500" strokeWidth={1.75} />
                <span className="flex-1">{label}</span>
                {confidencial && <Lock className="h-3 w-3 text-ink-400" />}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const marca = (
    <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-950 text-white"><Target className="h-5 w-5" /></span>
      <div className="leading-tight">
        <p className="font-bold text-ink-950">Planejamento</p>
        <p className="text-xs text-ink-500">{config.empresa} · 2027–2030</p>
      </div>
    </div>
  );

  const rodape = (
    <div className="border-t border-ink-100 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-200 text-sm font-semibold text-ink-600">
          {(email ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-ink-950">{email}</p>
          <p className="text-xs text-ink-500">{PAPEIS.find((p) => p.value === papel)?.label ?? 'sem perfil'}</p>
        </div>
      </div>
      {!config.modoDemo && (
        <button onClick={sair} className="mt-3 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-[15px] text-red-700 hover:bg-red-50">
          <LogOut className="h-[18px] w-[18px]" /> Sair
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-ink-100 bg-white lg:flex">
        {marca}{nav}{rodape}
      </aside>

      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white">
             <button className="absolute right-3 top-6 p-1 text-ink-500" onClick={() => setAberto(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
            {marca}{nav}{rodape}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white/85 px-4 py-4 backdrop-blur lg:px-8">
          <button className="lg:hidden" onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
          <nav className="flex min-w-0 items-center gap-2 text-[15px]">
            <span className="hidden text-ink-400 sm:inline">Planejamento</span>
            <ChevronRight className="hidden h-4 w-4 text-ink-300 sm:inline" />
            <span className="truncate font-semibold text-ink-950">{paginaAtual}</span>
          </nav>
          <span className="ml-auto hidden items-center gap-2 text-sm text-ink-500 sm:flex">
            <CalendarRange className="h-4 w-4" /> Ciclo 2027–2030
          </span>
        </header>

        {config.modoDemo && simularPapel && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-accent-200 bg-accent-50 px-4 py-2 text-xs text-accent-800 lg:px-8">
            <span><strong>Modo demonstração</strong> — dados ilustrativos, salvos só neste navegador.</span>
            <span className="flex items-center gap-2">
              Simular perfil:
               <select className="rounded-lg border border-accent-300 bg-white px-2 py-0.5" value={papel ?? ''} onChange={(e) => simularPapel(e.target.value as Papel)}>
                {PAPEIS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </span>
          </div>
        )}

        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
