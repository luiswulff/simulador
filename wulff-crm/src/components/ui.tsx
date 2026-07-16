import { type ReactNode, useEffect } from 'react';
import { Loader2, X, Inbox } from 'lucide-react';

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-ink-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Inbox className="h-10 w-10 text-ink-300" />
      <p className="font-semibold text-ink-700">{title}</p>
      {hint && <p className="max-w-md text-sm text-ink-500">{hint}</p>}
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 pt-[6vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost !p-1.5" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-ink-700">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <div className="flex gap-2 py-1.5 text-sm">
      <span className="w-44 shrink-0 text-ink-500">{label}</span>
      <span className="text-ink-900">{value}</span>
    </div>
  );
}
