import type { LucideIcon } from "lucide-react";

export default function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
  accent = "gold",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  accent?: "gold" | "exec" | "emerald" | "slate";
}) {
  const accents = {
    gold: "text-gold border-gold/25 bg-gold/[0.06]",
    exec: "text-exec-soft border-exec/25 bg-exec/[0.06]",
    emerald: "text-emeraldx-soft border-emeraldx/25 bg-emeraldx/[0.06]",
    slate: "text-slate-300 border-ink-700 bg-ink-800/60",
  } as const;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-800/50 px-3.5 py-2.5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${accents[accent]}`}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="tabular text-lg font-bold leading-tight text-white">{value}</p>
        {hint ? <p className="truncate text-[11px] leading-tight text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
