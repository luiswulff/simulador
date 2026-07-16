import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Download, DatabaseBackup, Upload, Pencil, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace, ROLE_LABEL, type WorkspaceRole } from '../contexts/WorkspaceContext';
import { Field, ConfirmDialog } from '../components/ui';
import { exportRows, exportContacts, generateBackup, restoreBackup, type ExportFormat } from '../features/export/exporters';
import type { Category, Contact, Tag } from '../types/db';

export function SettingsPage() {
  const { isOwner } = useWorkspace();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-extrabold text-ink-900">Configurações</h1>
      {isOwner && <TeamSection />}
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
  const { ownerId } = useWorkspace();
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
        user_id: ownerId,
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
  const { ownerId } = useWorkspace();
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
        { user_id: ownerId, name: name.trim(), group_name: group.trim() || null },
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
  const { ownerId } = useWorkspace();
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
      const res = await restoreBackup(file, ownerId, setRestoreMsg);
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
  const { active } = useWorkspace();
  return (
    <div className="card text-sm text-ink-600">
      <h2 className="mb-2 text-base font-bold text-ink-900">Conta e versão</h2>
      <p>
        Usuário: <strong>{user?.email}</strong> · Base ativa: <strong>{active.label}</strong> · Papel:{' '}
        <strong>{ROLE_LABEL[active.role]}</strong>
      </p>
      <p className="mt-2 text-xs text-ink-400">
        Wulff Relationship CRM · v1.1 (multiusuário) · Mapa de Relacionamentos, campos personalizados e
        módulo de Relatórios preparados no banco para a V2 (ver README).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Equipe — multiusuário: convide pessoas para acessar a SUA base, com papel.
// A pessoa cria a própria conta na tela de login; depois você a adiciona aqui.
// ---------------------------------------------------------------------------
function TeamSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('assistente');
  const [msg, setMsg] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ['my-members'],
    queryFn: async () => {
      const { data } = await supabase.rpc('list_my_members');
      return (data ?? []) as {
        id: string; member_id: string; member_name: string | null;
        member_email: string | null; role: WorkspaceRole; created_at: string;
      }[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      setMsg(null);
      if (!user) throw new Error('Sessão expirada');
      const target = email.trim();
      if (!target) throw new Error('Informe o e-mail da pessoa.');
      if (target.toLowerCase() === user.email?.toLowerCase()) throw new Error('Você já é o administrador desta base.');
      const { data, error } = await supabase.rpc('find_profile_by_email', { p_email: target });
      if (error) throw new Error(error.message);
      const found = (data ?? [])[0];
      if (!found) {
        throw new Error(
          'Nenhuma conta encontrada com este e-mail. Peça para a pessoa criar a conta dela primeiro (tela de login → "Criar conta") e tente de novo.',
        );
      }
      const { error: insErr } = await supabase.from('workspace_members').insert({
        owner_id: user.id,
        member_id: found.id,
        role,
      });
      if (insErr) {
        if (/duplicate|unique/i.test(insErr.message)) throw new Error('Esta pessoa já é membro da sua base.');
        throw new Error(insErr.message);
      }
    },
    onSuccess: () => {
      setEmail('');
      setMsg('Membro adicionado. Ao entrar, a pessoa verá a sua base no seletor do topo da tela.');
      qc.invalidateQueries({ queryKey: ['my-members'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const changeRole = useMutation({
    mutationFn: async (input: { id: string; role: WorkspaceRole }) => {
      await supabase.from('workspace_members').update({ role: input.role }).eq('id', input.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-members'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('workspace_members').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-members'] }),
  });

  return (
    <div className="card">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-ink-900">
        <Users className="h-4 w-4" /> Equipe — acesso multiusuário
      </h2>
      <p className="mb-3 text-sm text-ink-500">
        Dê acesso à sua base para sócios e assistentes. <strong>Como funciona:</strong> a pessoa cria a
        própria conta na tela de login do sistema; depois você adiciona o e-mail dela aqui, escolhendo o papel.
      </p>
      <div className="mb-2 grid gap-1 rounded-lg bg-ink-50 p-3 text-xs text-ink-500">
        <span><strong>Executivo</strong> — vê tudo, cria e edita contatos, empresas, notas, interações e lembretes.</span>
        <span><strong>Assistente</strong> — cadastra, organiza, importa e atualiza; não vê notas privadas.</span>
        <span><strong>Consulta</strong> — apenas visualização.</span>
      </div>

      {members.length > 0 && (
        <ul className="mb-3 divide-y divide-ink-50">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">{m.member_name ?? m.member_email}</p>
                <p className="truncate text-xs text-ink-400">{m.member_email}</p>
              </div>
              <select
                className="input !w-36 !py-1 text-xs"
                value={m.role}
                onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as WorkspaceRole })}
              >
                <option value="executivo">Executivo</option>
                <option value="assistente">Assistente</option>
                <option value="consulta">Consulta</option>
              </select>
              <button className="btn-ghost !p-1.5 !text-red-500" title="Remover acesso" onClick={() => remove.mutate(m.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          className="input !w-72"
          type="email"
          placeholder="e-mail da pessoa (conta já criada)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="input !w-36" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
          <option value="executivo">Executivo</option>
          <option value="assistente">Assistente</option>
          <option value="consulta">Consulta</option>
        </select>
        <button className="btn-primary" onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="h-4 w-4" /> Adicionar membro
        </button>
      </div>
      {msg && <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">{msg}</p>}
    </div>
  );
}
