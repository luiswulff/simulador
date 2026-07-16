import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Building2, CalendarClock, MessageSquareText,
  Upload, ListFilter, Settings, LogOut, Menu, X, Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GlobalSearch } from './GlobalSearch';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/contatos', label: 'Contatos', icon: Users },
  { to: '/empresas', label: 'Empresas', icon: Building2 },
  { to: '/agenda', label: 'Agenda', icon: CalendarClock },
  { to: '/interacoes', label: 'Interações', icon: MessageSquareText },
  { to: '/importacoes', label: 'Importações', icon: Upload },
  { to: '/listas', label: 'Listas inteligentes', icon: ListFilter },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Layout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-accent-800 text-white'
                : 'text-ink-300 hover:bg-ink-800 hover:text-white'
            }`
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-ink-950 lg:flex">
        <div className="px-6 py-6">
          <p className="text-lg font-extrabold tracking-tight text-white">Wulff</p>
          <p className="text-[11px] uppercase tracking-widest text-ink-400">Relationship CRM</p>
        </div>
        {nav}
        <div className="border-t border-ink-800 p-3">
          <p className="truncate px-3 pb-2 text-xs text-ink-400">{user?.email}</p>
          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-300 hover:bg-ink-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-ink-950 pt-4">
            <div className="flex items-center justify-between px-4 pb-4">
              <p className="text-lg font-extrabold text-white">Wulff CRM</p>
              <button onClick={() => setMenuOpen(false)} className="p-2 text-ink-300" aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <div className="border-t border-ink-800 p-3">
              <button
                onClick={async () => {
                  await signOut();
                  navigate('/login');
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 hover:bg-ink-800"
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <button className="btn-ghost !p-2 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex flex-1 items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-left text-sm text-ink-400 hover:border-ink-300 sm:max-w-md"
          >
            <Search className="h-4 w-4" />
            Buscar contatos, empresas, notas…
            <kbd className="ml-auto hidden rounded border border-ink-200 bg-white px-1.5 text-[10px] text-ink-400 sm:block">
              Ctrl K
            </kbd>
          </button>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>

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
