import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAudit } from '../../lib/audit';
import { Modal, Field } from '../../components/ui';
import { cleanSpaces } from '../../lib/normalize';
import type { Company } from '../../types/db';

export function CompanyForm({
  company,
  onClose,
  onSaved,
}: {
  company?: Company | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Company>>(company ?? { status: 'ativa' });
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Company, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sessão expirada');
      const name = cleanSpaces(form.trade_name ?? '');
      if (!name) throw new Error('O nome fantasia é obrigatório.');
      const payload: Record<string, unknown> = { ...form, trade_name: name, user_id: user.id };
      for (const k of ['id', 'created_at', 'updated_at']) delete payload[k];
      if (company) {
        const { error } = await supabase.from('companies').update(payload).eq('id', company.id);
        if (error) throw new Error(error.message);
        await logAudit('company', company.id, 'editar');
        return company.id;
      }
      const { data, error } = await supabase.from('companies').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      await logAudit('company', data.id, 'criar', { nome: name });
      return data.id as string;
    },
    onSuccess: (cid) => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['company', cid] });
      onSaved?.(cid);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate();
  };

  return (
    <Modal title={company ? 'Editar empresa' : 'Nova empresa'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome fantasia *">
          <input className="input" value={form.trade_name ?? ''} onChange={(e) => set('trade_name', e.target.value)} required />
        </Field>
        <Field label="Razão social">
          <input className="input" value={form.legal_name ?? ''} onChange={(e) => set('legal_name', e.target.value)} />
        </Field>
        <Field label="CNPJ">
          <input className="input" value={form.cnpj ?? ''} onChange={(e) => set('cnpj', e.target.value)} />
        </Field>
        <Field label="Segmento">
          <input className="input" value={form.segment ?? ''} onChange={(e) => set('segment', e.target.value)} />
        </Field>
        <Field label="Porte">
          <select className="input" value={form.size ?? ''} onChange={(e) => set('size', e.target.value || null)}>
            <option value="">—</option>
            <option value="MEI">MEI</option>
            <option value="Pequena">Pequena</option>
            <option value="Média">Média</option>
            <option value="Grande">Grande</option>
            <option value="Multinacional">Multinacional</option>
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={form.status ?? 'ativa'} onChange={(e) => set('status', e.target.value)}>
            <option value="ativa">Ativa</option>
            <option value="prospect">Prospect</option>
            <option value="inativa">Inativa</option>
          </select>
        </Field>
        <Field label="Cidade">
          <input className="input" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Estado (UF)">
          <input className="input" value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label="País">
          <input className="input" value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} />
        </Field>
        <Field label="Site">
          <input className="input" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
        </Field>
        <Field label="LinkedIn">
          <input className="input" value={form.linkedin ?? ''} onChange={(e) => set('linkedin', e.target.value)} />
        </Field>
        <Field label="Telefone">
          <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Responsável">
          <input className="input" value={form.owner ?? ''} onChange={(e) => set('owner', e.target.value)} />
        </Field>
        <Field label="Descrição" className="sm:col-span-2">
          <textarea className="input" rows={3} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar empresa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
