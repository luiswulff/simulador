import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Download, DatabaseBackup, Upload, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Field, ConfirmDialog } from '../components/ui';
import { exportRows, exportContacts, generateBackup, restoreBackup, type ExportFormat } from '../features/export/exporters';
import type { Category, Contact, Tag } from '../types/db';

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-extrabold text-ink-900">Configurações</h1>
      <CategoriesSection />
      <TagsSection />
      <ExportSection />
      <BackupSection />
      <AboutSection />
    </div>
  );
}

function CategoriesSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await supabase.from('categories').select('*').order('sort_order')).data as Category[],
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!user || !newName.trim()) return;
      await supabase.from('categories').insert({
        user_id: user.id,
        name: newName.trim(),
        sort_order: categories.length + 1,
      });
    },
    onSuccess: () => {
      setNewName('');
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const rename = useMutation({
    mutationFn: async () => {
      if (!editing || !editName.trim()) return;
      await supabase.from('categories').update({ name: editName.trim() }).eq('id', editing.id);
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('categories').delete().eq('id', id);
    },
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold text-ink-900">Perfis de relacionamento (categorias)</h2>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <span key={c.id} className="chip group bg-ink-100 text-ink-700">
            {editing?.id === c.id ? (
              <input
                className="w-32 bg-transparent outline-none"
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && rename.mutate()}
                onBlur={() => rename.mutate()}
              />
            ) : (
              c.name
            )}
            <button className="text-ink-400 hover:text-ink-800" title="Renomear" onClick={() => { setEditing(c); setEditName(c.name); }}>
              <Pencil className="h-3 w-3" />
            </button>
            <button className="text-ink-400 hover:text-red-600" title="Excluir" onClick={() => setToDelete(c)}>
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input !w-64"
          placeholder="Nova categoria…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add.mutate()}
        />
        <button className="btn-secondary" onClick={() => add.mutate()}>
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>
      {toDelete && (
        <ConfirmDialog
          title="Excluir categoria"
          message={`Excluir a categoria "${toDelete.name}"? Os contatos não serão excluídos, apenas desclassificados.`}
          danger
          confirmLabel="Excluir"
          onConfirm={() => del.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

function TagsSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => (await supabase.from('tags').select('*').order('group_name').order('name')).data as Tag[],
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!user || !name.trim()) return;
      await supabase.from('tags').upsert(
        { user_id: user.id, name: name.trim(), group_name: group.trim() || null },
        { onConflict: 'user_id,name' },
      );
    },
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('tags').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });

  const groups = new Map<string, Tag[]>();
  for (const t of tags) {
    const g = t.group_name ?? 'Sem grupo';
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold text-ink-900">Tags</h2>
      {Array.from(groups.entries()).map(([g, list]) => (
        <div key={g} className="mb-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">{g}</p>
          <div className="flex flex-wrap gap-1.5">
            {list.map((t) => (
              <span key={t.id} className="chip bg-amber-100 text-amber-800">
                #{t.name}
                <button className="text-amber-500 hover:text-red-600" onClick={() => del.mutate(t.id)} title="Excluir tag">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input !w-48" placeholder="Nova tag…" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input !w-48" placeholder="Grupo (opcional)" value={group} onChange={(e) => setGroup(e.target.value)} />
        <button className="btn-secondary" onClick={() => add.mutate()}>
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>
    </div>
  );
}

function ExportSection() {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const fetchTable = async (table: string) => {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from(table).select('*').range(from, from + 999);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  const items: { key: string; label: string; action: () => Promise<void> }[] = [
    {
      key: 'contatos',
      label: 'Contatos',
      action: async () => {
        const rows = (await fetchTable('contacts')) as unknown as Contact[];
        await exportContacts(rows.filter((c) => !c.deleted_at), format);
      },
    },
    { key: 'empresas', label: 'Empresas', action: async () => exportRows(await fetchTable('companies'), format, 'empresas') },
    { key: 'interacoes', label: 'Interações', action: async () => exportRows(await fetchTable('interactions'), format, 'interacoes') },
    { key: 'lembretes', label: 'Lembretes', action: async () => exportRows(await fetchTable('reminders'), format, 'lembretes') },
    { key: 'tags', label: 'Tags', action: async () => exportRows(await fetchTable('tags'), format, 'tags') },
    { key: 'importacoes', label: 'Histórico de importações', action: async () => exportRows(await fetchTable('import_jobs'), format, 'importacoes') },
  ];

  return (
    <div className="card">
      <h2 className="mb-3 text-base font-bold text-ink-900">Exportação de dados</h2>
      <Field label="Formato">
        <select className="input !w-40" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
          <option value="csv">CSV</option>
          <option value="xlsx">XLSX</option>
          <option value="json">JSON</option>
        </select>
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((i) => (
          <button key={i.key} className="btn-secondary" disabled={busy !== null} onClick={() => run(i.key, i.action)}>
            <Download className="h-4 w-4" />
            {busy === i.key ? 'Exportando…' : i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BackupSection() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [confirmFile, setConfirmFile] = useState<File | null>(null);

  const doBackup = async () => {
    setProgress('Iniciando…');
    try {
      await generateBackup(setProgress);
      setProgress(null);
    } catch (e) {
      setProgress(e instanceof Error ? e.message : 'Falha no backup.');
    }
  };

  const doRestore = async (file: File) => {
    if (!user) return;
    setRestoreMsg('Restaurando…');
    try {
      const res = await restoreBackup(file, user.id, setRestoreMsg);
      const total = Object.values(res.restored).reduce((a, b) => a + b, 0);
      setRestoreMsg(
        `Restauração concluída: ${total.toLocaleString('pt-BR')} registros.` +
          (res.errors.length ? ` Avisos: ${res.errors.join(' | ')}` : ''),
      );
    } catch (e) {
      setRestoreMsg(e instanceof Error ? e.message : 'Falha na restauração.');
    }
  };

  return (
    <div className="card">
      <h2 className="mb-1 text-base font-bold text-ink-900">Backup e restauração</h2>
      <p className="mb-3 text-sm text-ink-500">
        Gere um arquivo JSON único com toda a base (contatos, empresas, interações, notas, lembretes, tags,
        conexões e histórico). Guarde-o com segurança — ele garante a portabilidade dos seus dados,
        independentemente do Supabase. <strong>Recomendamos um backup mensal.</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={doBackup} disabled={progress !== null}>
          <DatabaseBackup className="h-4 w-4" /> {progress ?? 'Gerar backup completo (JSON)'}
        </button>
        <label className="btn-secondary cursor-pointer">
          <Upload className="h-4 w-4" /> Restaurar backup…
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && setConfirmFile(e.target.files[0])}
          />
        </label>
      </div>
      {restoreMsg && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">{restoreMsg}</p>}
      {confirmFile && (
        <ConfirmDialog
          title="Restaurar backup"
          message={`Restaurar "${confirmFile.name}"? Os registros do backup serão reinseridos/atualizados na base atual (a restauração não apaga dados que não estejam no arquivo).`}
          confirmLabel="Restaurar"
          onConfirm={() => {
            doRestore(confirmFile);
            setConfirmFile(null);
          }}
          onCancel={() => setConfirmFile(null)}
        />
      )}
    </div>
  );
}

function AboutSection() {
  const { user } = useAuth();
  return (
    <div className="card text-sm text-ink-600">
      <h2 className="mb-2 text-base font-bold text-ink-900">Conta e versão</h2>
      <p>Usuário: <strong>{user?.email}</strong> · Perfil: <strong>Administrador</strong></p>
      <p className="mt-2 text-xs text-ink-400">
        Wulff Relationship CRM · MVP 1.0 · Perfis Executivo, Assistente e Consulta, Mapa de Relacionamentos,
        campos personalizados e módulo de Relatórios estão preparados no banco para a V2 (ver README).
      </p>
    </div>
  );
}
