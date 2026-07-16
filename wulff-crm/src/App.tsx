import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { supabaseConfigured } from './lib/supabase';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ContactsPage } from './pages/contacts/ContactsPage';
import { ContactDetailPage } from './pages/contacts/ContactDetailPage';
import { CompaniesPage } from './pages/companies/CompaniesPage';
import { CompanyDetailPage } from './pages/companies/CompanyDetailPage';
import { AgendaPage } from './pages/Agenda';
import { InteractionsPage } from './pages/Interactions';
import { ImportsPage } from './pages/imports/ImportsPage';
import { ImportWizardPage } from './pages/imports/ImportWizardPage';
import { SmartListsPage } from './pages/SmartLists';
import { SettingsPage } from './pages/Settings';

export default function App() {
  const { session, loading } = useAuth();

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-lg">
          <h1 className="mb-2 text-lg font-bold">Configuração necessária</h1>
          <p className="text-sm text-ink-600">
            As variáveis <code className="rounded bg-ink-100 px-1">VITE_SUPABASE_URL</code> e{' '}
            <code className="rounded bg-ink-100 px-1">VITE_SUPABASE_ANON_KEY</code> não foram
            configuradas. Siga o passo a passo do README para criar o projeto Supabase e definir as
            variáveis de ambiente no Netlify (ou no arquivo <code>.env</code> em desenvolvimento).
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <Spinner label="Iniciando…" />;

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/contatos" element={<ContactsPage />} />
        <Route path="/contatos/:id" element={<ContactDetailPage />} />
        <Route path="/empresas" element={<CompaniesPage />} />
        <Route path="/empresas/:id" element={<CompanyDetailPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/interacoes" element={<InteractionsPage />} />
        <Route path="/importacoes" element={<ImportsPage />} />
        <Route path="/importacoes/nova" element={<ImportWizardPage />} />
        <Route path="/listas" element={<SmartListsPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-extrabold text-ink-200">404</p>
      <p className="mt-2 text-ink-600">Página não encontrada.</p>
    </div>
  );
}
