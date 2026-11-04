import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { config } from '../config';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setMsg(null); setCarregando(true);
    const { error } = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha });
    setCarregando(false);
    if (error) setMsg(error.message);
    else if (modo === 'criar') setMsg('Conta criada. Se a confirmação de e-mail estiver ativa, confirme antes de entrar.');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <p className="text-2xl font-extrabold">{config.empresa}</p>
        <p className="mb-6 text-xs uppercase tracking-widest text-ink-500">Planejamento Estratégico 2027–2030</p>
        <form onSubmit={enviar} className="space-y-4">
          <label className="block"><span className="label">E-mail</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="block"><span className="label">Senha</span><input className="input" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
          {msg && <p className="rounded bg-ink-50 p-2 text-sm text-ink-700">{msg}</p>}
          <button className="btn-primary w-full" disabled={carregando}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        <button className="mt-4 w-full text-center text-xs text-ink-500 hover:underline" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
        </button>
      </div>
    </div>
  );
}
