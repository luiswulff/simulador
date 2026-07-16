import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Building2, StickyNote, MessageSquareText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fold } from '../lib/normalize';

interface Hit {
  type: 'contato' | 'empresa' | 'nota' | 'interacao';
  id: string;
  title: string;
  subtitle: string;
  to: string;
}

// Busca global tolerante a acentos e caixa (Seção 18).
export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ['global-search', q],
    enabled: q.trim().length >= 2,
    queryFn: async (): Promise<Hit[]> => {
      const term = q.trim();
      const ilike = `%${term}%`;
      const [contacts, companies, notes, interactions] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, full_name, job_title, company_name, email, phone, city')
          .is('deleted_at', null)
          .or(
            `full_name.ilike.${ilike},email.ilike.${ilike},phone.ilike.${ilike},company_name.ilike.${ilike},job_title.ilike.${ilike},city.ilike.${ilike},interests.ilike.${ilike}`,
          )
          .limit(30),
        supabase
          .from('companies')
          .select('id, trade_name, city, segment')
          .is('deleted_at', null)
          .or(`trade_name.ilike.${ilike},legal_name.ilike.${ilike},segment.ilike.${ilike},city.ilike.${ilike}`)
          .limit(10),
        supabase
          .from('notes')
          .select('id, title, body, contact_id')
          .or(`title.ilike.${ilike},body.ilike.${ilike}`)
          .limit(10),
        supabase
          .from('interactions')
          .select('id, summary, contact_id, kind')
          .or(`summary.ilike.${ilike},description.ilike.${ilike}`)
          .limit(10),
      ]);

      const out: Hit[] = [];
      const folded = fold(term);
      for (const c of contacts.data ?? []) {
        out.push({
          type: 'contato',
          id: c.id,
          title: c.full_name,
          subtitle: [c.job_title, c.company_name, c.city].filter(Boolean).join(' · '),
          to: `/contatos/${c.id}`,
        });
      }
      for (const c of companies.data ?? []) {
        out.push({
          type: 'empresa',
          id: c.id,
          title: c.trade_name,
          subtitle: [c.segment, c.city].filter(Boolean).join(' · '),
          to: `/empresas/${c.id}`,
        });
      }
      for (const n of notes.data ?? []) {
        out.push({
          type: 'nota',
          id: n.id,
          title: n.title || n.body.slice(0, 60),
          subtitle: 'Nota',
          to: n.contact_id ? `/contatos/${n.contact_id}?aba=notas` : '/contatos',
        });
      }
      for (const i of interactions.data ?? []) {
        out.push({
          type: 'interacao',
          id: i.id,
          title: i.summary,
          subtitle: 'Interação',
          to: i.contact_id ? `/contatos/${i.contact_id}?aba=historico` : '/interacoes',
        });
      }
      // Prioriza resultados cujo texto "folded" contém o termo sem acento
      return out.sort((a, b) => {
        const am = fold(a.title).includes(folded) ? 0 : 1;
        const bm = fold(b.title).includes(folded) ? 0 : 1;
        return am - bm;
      });
    },
  });

  const ICONS = {
    contato: User,
    empresa: Building2,
    nota: StickyNote,
    interacao: MessageSquareText,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/50 p-4 pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4">
          <Search className="h-4 w-4 text-ink-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar em contatos, empresas, notas e interações…"
            className="w-full bg-transparent py-3.5 text-sm outline-none"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {q.trim().length < 2 && (
            <p className="px-3 py-6 text-center text-sm text-ink-400">
              Digite ao menos 2 caracteres. A busca tolera maiúsculas e acentos.
            </p>
          )}
          {isFetching && <p className="px-3 py-4 text-center text-sm text-ink-400">Buscando…</p>}
          {!isFetching && q.trim().length >= 2 && hits.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-ink-400">Nada encontrado.</p>
          )}
          {hits.map((h) => {
            const Icon = ICONS[h.type];
            return (
              <button
                key={h.type + h.id}
                onClick={() => {
                  navigate(h.to);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-ink-50"
              >
                <Icon className="h-4 w-4 shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{h.title}</p>
                  {h.subtitle && <p className="truncate text-xs text-ink-500">{h.subtitle}</p>}
                </div>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-ink-400">
                  {h.type}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
