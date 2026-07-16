import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Link2, Search, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAudit } from '../../lib/audit';
import { Modal } from '../../components/ui';
import { Avatar } from '../../components/Avatar';
import { searchProvider } from '../../features/photos/searchProvider';
import type { Contact } from '../../types/db';

type Tab = 'upload' | 'url' | 'busca';

// Foto do contato — upload, URL externa e busca assistida (Seção 8).
export function PhotoEditor({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('upload');
  const [error, setError] = useState<string | null>(null);

  // URL externa
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewOk, setPreviewOk] = useState<boolean | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const savePhoto = useMutation({
    mutationFn: async (p: {
      photo_url: string | null;
      photo_source: string | null;
      photo_source_url?: string | null;
    }) => {
      const { error } = await supabase
        .from('contacts')
        .update({
          photo_url: p.photo_url,
          photo_source: p.photo_source,
          photo_source_url: p.photo_source_url ?? null,
          photo_updated_at: new Date().toISOString(),
          photo_verified_by_user: p.photo_url !== null,
        })
        .eq('id', contact.id);
      if (error) throw new Error(error.message);
      await logAudit('contact', contact.id, 'foto', { origem: p.photo_source });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contact.id] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const uploadFile = async (file: File) => {
    setError(null);
    if (!user) return;
    if (!file.type.startsWith('image/')) {
      setError('O arquivo selecionado não é uma imagem.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5 MB.');
      return;
    }
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/${contact.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('contact-photos').upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      setError(`Falha no upload: ${error.message}`);
      return;
    }
    const { data } = supabase.storage.from('contact-photos').getPublicUrl(path);
    savePhoto.mutate({ photo_url: data.publicUrl, photo_source: 'upload' });
  };

  const validarUrl = () => {
    setError(null);
    setPreviewOk(null);
    setConfirmed(false);
    const u = url.trim();
    if (!/^https:\/\/.+/i.test(u)) {
      setError('Informe uma URL válida iniciando com https:// (endereços http não são aceitos por segurança).');
      setPreview(null);
      return;
    }
    setPreview(u);
  };

  return (
    <Modal title="Foto do contato" onClose={onClose}>
      <div className="mb-4 flex items-center gap-4">
        <Avatar name={contact.full_name} photoUrl={contact.photo_url} size={64} />
        <div className="text-sm text-ink-600">
          <p className="font-semibold text-ink-900">{contact.full_name}</p>
          {contact.photo_url ? (
            <button
              className="mt-1 inline-flex items-center gap-1 text-red-600 hover:underline"
              onClick={() => savePhoto.mutate({ photo_url: null, photo_source: null })}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover foto atual
            </button>
          ) : (
            <p>Sem foto — usando avatar com iniciais.</p>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg bg-ink-100 p-1">
        {(
          [
            { id: 'upload', label: 'Upload', icon: Upload },
            { id: 'url', label: 'URL externa', icon: Link2 },
            { id: 'busca', label: 'Buscar na internet', icon: Search },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold ${
              tab === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-200 p-8 text-center hover:border-accent-500">
          <Upload className="h-6 w-6 text-ink-400" />
          <span className="text-sm font-medium text-ink-700">
            Clique para escolher uma imagem
          </span>
          <span className="text-xs text-ink-400">JPG, PNG ou WebP · máx. 5 MB · armazenada no Supabase Storage</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
          />
        </label>
      )}

      {tab === 'url' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="https://exemplo.com/foto.jpg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button className="btn-secondary shrink-0" onClick={validarUrl}>
              Pré-visualizar
            </button>
          </div>
          {preview && (
            <div className="rounded-xl border border-ink-100 p-4 text-center">
              <img
                src={preview}
                alt="Pré-visualização"
                className="mx-auto max-h-48 rounded-lg object-cover"
                onLoad={() => setPreviewOk(true)}
                onError={() => {
                  setPreviewOk(false);
                  setError('Não foi possível carregar a imagem neste endereço. Verifique se a URL está disponível e é pública.');
                }}
              />
              {previewOk && (
                <div className="mt-3 space-y-2">
                  <label className="flex items-center justify-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Confirmo que esta imagem pertence à pessoa cadastrada.
                  </label>
                  <button
                    className="btn-primary"
                    disabled={!confirmed || savePhoto.isPending}
                    onClick={() =>
                      savePhoto.mutate({ photo_url: preview, photo_source: 'url', photo_source_url: preview })
                    }
                  >
                    Usar esta imagem
                  </button>
                  <p className="text-xs text-ink-400">
                    URLs externas podem deixar de funcionar com o tempo. Nesse caso, o avatar com
                    iniciais será exibido automaticamente.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'busca' && (
        <PhotoSearch contact={contact} onSelect={(imgUrl, sourceUrl) =>
          savePhoto.mutate({ photo_url: imgUrl, photo_source: 'search', photo_source_url: sourceUrl })
        } />
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </Modal>
  );
}

// Busca assistida (Seção 8.2) — interface pronta; provedor desacoplado.
function PhotoSearch({
  contact,
  onSelect,
}: {
  contact: Contact;
  onSelect: (imageUrl: string, sourceUrl: string) => void;
}) {
  const [results, setResults] = useState<Awaited<ReturnType<NonNullable<typeof searchProvider>['search']>>>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const query = ['"' + contact.full_name + '"', contact.company_name && '"' + contact.company_name + '"', contact.job_title && '"' + contact.job_title + '"']
    .filter(Boolean)
    .join(' ');

  const buscar = async () => {
    setMsg(null);
    if (!searchProvider) {
      setMsg(
        'Nenhum provedor de busca de imagens está configurado. Esta funcionalidade está preparada na arquitetura (V2): para ativar, implemente um provedor em src/features/photos/searchProvider.ts conforme documentado no README.',
      );
      return;
    }
    setBusy(true);
    try {
      setResults(await searchProvider.search({ query, contact }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Falha na busca.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        Consulta sugerida: <code className="rounded bg-ink-100 px-1">{query}</code>
      </p>
      <button className="btn-secondary" onClick={buscar} disabled={busy}>
        <Search className="h-4 w-4" /> {busy ? 'Buscando…' : 'Buscar foto na internet'}
      </button>
      {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{msg}</p>}
      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                setSelected(i);
                setConfirmed(false);
              }}
              className={`rounded-lg border p-2 text-left ${selected === i ? 'border-accent-600 ring-1 ring-accent-500' : 'border-ink-200'}`}
            >
              <img src={r.thumbnailUrl} alt={r.pageTitle} className="h-24 w-full rounded object-cover" />
              <p className="mt-1 truncate text-xs font-medium">{r.pageTitle}</p>
              <p className="truncate text-[10px] text-ink-400">{r.domain}</p>
              <a
                href={r.pageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-accent-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Ver fonte
              </a>
            </button>
          ))}
        </div>
      )}
      {selected !== null && results[selected] && (
        <div className="space-y-2 rounded-xl border border-ink-100 p-3">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Confirme que esta imagem pertence à pessoa cadastrada.
          </label>
          <button
            className="btn-primary"
            disabled={!confirmed}
            onClick={() => onSelect(results[selected].imageUrl, results[selected].pageUrl)}
          >
            Selecionar imagem
          </button>
        </div>
      )}
    </div>
  );
}
