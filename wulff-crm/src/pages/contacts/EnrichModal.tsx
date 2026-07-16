import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Linkedin, Search, Sparkles, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { Modal, Field } from '../../components/ui';
import {
  enrichmentProvider, linkedinSearchUrl, googleLinkedinSearchUrl,
} from '../../features/enrichment/provider';
import type { Contact } from '../../types/db';

// Enriquecimento assistido: pesquisa no LinkedIn/Google em um clique e
// preenchimento rápido dos dados encontrados (Seção "provider.ts" p/ automação).
export function EnrichModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    linkedin: contact.linkedin ?? '',
    job_title: contact.job_title ?? '',
    company_name: contact.company_name ?? '',
    city: contact.city ?? '',
    state: contact.state ?? '',
    segment: contact.segment ?? '',
    website: contact.website ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) patch[k] = v.trim() || null;
      if (patch.linkedin && !/linkedin\.com\//i.test(patch.linkedin)) {
        throw new Error('O campo LinkedIn deve conter um endereço linkedin.com (ex.: linkedin.com/in/nome).');
      }
      const { error } = await supabase.from('contacts').update(patch).eq('id', contact.id);
      if (error) throw new Error(error.message);
      await logAudit('contact', contact.id, 'enriquecer', { via: 'manual-linkedin' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contact.id] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const runAuto = async () => {
    if (!enrichmentProvider) {
      setAutoMsg(
        'Nenhum provedor de enriquecimento automático está configurado. A arquitetura está pronta: veja src/features/enrichment/provider.ts e o README para conectar um serviço (ex.: Proxycurl) via Netlify Function.',
      );
      return;
    }
    setAutoBusy(true);
    try {
      const r = await enrichmentProvider.enrich(contact);
      if (!r) {
        setAutoMsg('O provedor não encontrou dados para este contato.');
        return;
      }
      setForm((f) => ({
        linkedin: r.linkedin ?? f.linkedin,
        job_title: r.job_title ?? f.job_title,
        company_name: r.company_name ?? f.company_name,
        city: r.city ?? f.city,
        state: r.state ?? f.state,
        segment: r.segment ?? f.segment,
        website: r.website ?? f.website,
      }));
      setAutoMsg(`Dados sugeridos por ${r.sourceName} — revise antes de salvar.`);
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : 'Falha no provedor de enriquecimento.');
    } finally {
      setAutoBusy(false);
    }
  };

  return (
    <Modal title={`Enriquecer cadastro — ${contact.full_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm text-ink-600">
            <strong>1. Pesquise o contato</strong> (abre em nova aba):
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={linkedinSearchUrl(contact)}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary !py-1.5 text-xs !text-[#0a66c2]"
            >
              <Linkedin className="h-3.5 w-3.5" /> Pesquisar no LinkedIn
            </a>
            <a
              href={googleLinkedinSearchUrl(contact)}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary !py-1.5 text-xs"
            >
              <Search className="h-3.5 w-3.5" /> Google (só linkedin.com/in)
            </a>
            <button className="btn-secondary !py-1.5 text-xs" onClick={runAuto} disabled={autoBusy}>
              <Sparkles className="h-3.5 w-3.5" /> {autoBusy ? 'Consultando…' : 'Enriquecer automaticamente'}
            </button>
          </div>
          {autoMsg && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{autoMsg}</p>}
        </div>

        <div>
          <p className="mb-2 text-sm text-ink-600">
            <strong>2. Cole aqui o que encontrou</strong> — só os campos preenchidos serão atualizados:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="LinkedIn (URL do perfil)" className="sm:col-span-2">
              <div className="flex gap-2">
                <input className="input" placeholder="linkedin.com/in/nome" value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} />
                {form.linkedin && (
                  <a
                    href={/^https?:/i.test(form.linkedin) ? form.linkedin : `https://${form.linkedin}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary shrink-0 !px-3"
                    title="Conferir perfil"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </Field>
            <Field label="Cargo">
              <input className="input" value={form.job_title} onChange={(e) => set('job_title', e.target.value)} />
            </Field>
            <Field label="Empresa">
              <input className="input" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
            </Field>
            <Field label="Cidade">
              <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Estado (UF)">
              <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} />
            </Field>
            <Field label="Segmento">
              <input className="input" value={form.segment} onChange={(e) => set('segment', e.target.value)} />
            </Field>
            <Field label="Site">
              <input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} />
            </Field>
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar no cadastro'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
