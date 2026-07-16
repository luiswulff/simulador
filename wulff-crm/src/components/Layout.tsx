import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, CalendarClock, MessageSquareText,
  Upload, ListFilter, Settings, LogOut, Search, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace, ROLE_LABEL } from '../contexts/WorkspaceContext';
import { GlobalSearch } from './GlobalSearch';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/contatos', label: 'Contatos', icon: Users },
  { to: '/empresas', label: 'Empresas', icon: Building2 },
  { to: '/agenda', label: 'Agenda', icon: CalendarClock },
  { to: '/interacoes', label: 'Interações', icon: MessageSquareText },
  { to: '/importacoes', label: 'Importações', icon: Upload },
  { to: '/listas', label: 'Listas', icon: ListFilter },
  { to: '/configuracoes', label: 'Ajustes', icon: Settings },
];

export function Layout() {
  const { signOut, user } = useAuth();
  const { workspaces, active, setActiveOwner } = useWorkspace();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Barra superior clara */}
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          {/* Marca */}
          <NavLink to="/" className="flex shrink-0 items-center gap-2" aria-label="Início">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 font-serif text-lg font-bold text-white">
              W
            </span>
            <span className="hidden text-[15px] font-bold tracking-tight text-ink-900 xl:block">
              Wulff
            </span>
          </NavLink>

          {/* Busca */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-9 w-full max-w-[260px] items-center gap-2 rounded-full bg-ink-100 px-3.5 text-left text-sm text-ink-500 transition-colors hover:bg-ink-200/70"
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Buscar</span>
            <kbd className="ml-auto hidden rounded-md border border-ink-200 bg-white px-1.5 text-[10px] text-ink-400 md:block">
              ⌘K
            </kbd>
          </button>

          {/* Navegação (desktop) */}
          <nav className="ml-auto hidden items-stretch md:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={label}
                className={({ isActive }) =>
                  `relative flex h-14 w-[64px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors lg:w-[72px] ${
                    isActive
                      ? 'text-ink-900 after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-ink-900'
                      : 'text-ink-500 hover:text-ink-900'
                  }`
                }
              >
                <Icon className="h-[21px] w-[21px]" strokeWidth={1.75} />
                <span className="hidden lg:block">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Seletor de base (multiusuário) */}
          {workspaces.length > 1 && (
            <select
              className="hidden max-w-[150px] rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 sm:block"
              value={active.ownerId}
              onChange={(e) => setActiveOwner(e.target.value)}
              title={`Base ativa · seu papel: ${ROLE_LABEL[active.role]}`}
            >
              {workspaces.map((w) => (
                <option key={w.ownerId} value={w.ownerId}>
                  {w.own ? 'Minha base' : `${w.label} (${ROLE_LABEL[w.role]})`}
                </option>
              ))}
            </select>
          )}

          {/* Menu do usuário */}
          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-ink-100"
              aria-label="Menu do usuário"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-200 text-sm font-bold text-ink-600">
                {(user?.email ?? '?').charAt(0).toUpperCase()}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-ink-400 sm:block" />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-ink-200/70 bg-white p-2 shadow-lg">
                <div className="border-b border-ink-100 px-3 pb-2 pt-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{user?.email}</p>
                  <p className="text-xs text-ink-400">
                    {active.own ? 'Minha base' : active.label} · {ROLE_LABEL[active.role]}
                  </p>
                </div>
                {workspaces.length > 1 && (
                  <div className="border-b border-ink-100 px-3 py-2 sm:hidden">
                    <p className="label">Base ativa</p>
                    <select
                      className="input !rounded-lg !py-1.5 text-xs"
                      value={active.ownerId}
                      onChange={(e) => setActiveOwner(e.target.value)}
                    >
                      {workspaces.map((w) => (
                        <option key={w.ownerId} value={w.ownerId}>
                          {w.own ? 'Minha base' : `${w.label} (${ROLE_LABEL[w.role]})`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={async () => {
                    await signOut();
                    navigate('/login');
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navegação (mobile): linha rolável de pílulas */}
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Conteúdo */}
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <Outlet />
      </main>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      <SearchHotkey onOpen={() => setSearchOpen(true)} />
    </div>
  );
}

function SearchHotkey({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
  return null;
}
