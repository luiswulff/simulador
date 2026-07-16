import { useState } from 'react';
import type { Contact } from '../types/db';
import { relationshipScore, scoreColor } from '../lib/score';

export function ScoreBadge({ contact, showBreakdown }: { contact: Contact; showBreakdown?: boolean }) {
  const [open, setOpen] = useState(false);
  const { total, parts } = relationshipScore(contact);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        className={`chip ${scoreColor(total)} ${showBreakdown ? 'cursor-help' : 'cursor-default'}`}
        onClick={() => showBreakdown && setOpen((v) => !v)}
        title={showBreakdown ? 'Clique para ver a composição do score' : `Score ${total}`}
      >
        {total}
      </button>
      {open && showBreakdown && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-ink-100 bg-white p-4 text-left shadow-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Composição do Relationship Score
          </p>
          {parts.map((p) => (
            <div key={p.key} className="flex items-center justify-between py-1 text-xs">
              <span className="text-ink-600">
                {p.label} <span className="text-ink-400">(peso {p.weight})</span>
              </span>
              <span className="font-semibold text-ink-900">{Math.round(p.weight * p.value)}</span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2 text-sm font-bold">
            <span>Total</span>
            <span>{total}</span>
          </div>
        </div>
      )}
    </div>
  );
}
