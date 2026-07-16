import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Field } from '../components/ui';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) setError(error);
        else navigate('/');
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) setError(error);
        else setInfo('Conta criada. Se a confirmação por e-mail estiver ativa no Supabase, verifique sua caixa de entrada antes de entrar.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* Painel de marca (desktop) */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-accent-800/30 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-accent-600/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-700 font-serif text-2xl font-bold text-accent-100">
            W
          </div>
          <div>
            <p className="text-xl font-extrabold text-white">Wulff</p>
            <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400">Relationship CRM</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="font-serif text-4xl leading-tight text-white">
            Relacionamentos construídos ao longo do tempo.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-300">
            <li>— Toda a sua rede em um único lugar, com histórico e contexto</li>
            <li>— Relationship Score e lembretes de cadência para não esfriar contatos</li>
            <li>— Importação inteligente de qualquer base, com deduplicação</li>
            <li>— Seus dados, seu backup: portabilidade total em um clique</li>
          </ul>
        </div>
        <p className="relative text-xs text-ink-500">Inteligência pessoal de relacionamentos</p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center lg:hidden">
          <p className="text-3xl font-extrabold tracking-tight text-white">Wulff</p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-ink-400">Relationship CRM</p>
          <p className="mt-3 text-sm italic text-ink-400">
            Relacionamentos construídos ao longo do tempo
          </p>
        </div>
        <form onSubmit={submit} className="card space-y-4 !p-6">
          {mode === 'signup' && (
            <Field label="Nome completo">
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="E-mail">
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {info && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-800">{info}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
          <button
            type="button"
            className="w-full text-center text-sm text-ink-500 hover:text-ink-800"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
              setInfo(null);
            }}
          >
            {mode === 'login'
              ? 'Primeiro acesso? Criar conta de administrador'
              : 'Já tenho conta — entrar'}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
