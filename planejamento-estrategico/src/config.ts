const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const config = {
  empresa: (import.meta.env.VITE_EMPRESA_NOME as string | undefined) || 'TaxCo',
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** Sem Supabase configurado, o app roda em modo demonstração (dados no navegador). */
  modoDemo: !(url && anonKey),
};
