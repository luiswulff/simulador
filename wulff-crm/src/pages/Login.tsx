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
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
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
  );
}
