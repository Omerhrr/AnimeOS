"use client";

import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-white/5 text-muted-foreground border-white/10",
  BUILDING: "bg-amber-400/10 text-amber-300 border-amber-400/25",
  QUEUED: "bg-amber-400/10 text-amber-300 border-amber-400/25",
  RENDERING: "bg-amber-400/15 text-amber-200 border-amber-400/30",
  INSPECTING: "bg-violet-400/10 text-violet-300 border-violet-400/25",
  REVIEW: "bg-violet-400/10 text-violet-300 border-violet-400/25",
  PREVIEW: "bg-violet-400/10 text-violet-300 border-violet-400/25",
  IN_PRODUCTION: "bg-teal-400/10 text-teal-300 border-teal-400/25",
  APPROVED: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  RENDERED: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
  FINAL: "bg-emerald-400/15 text-emerald-200 border-emerald-400/35",
  NEEDS_REVISION: "bg-rose-400/10 text-rose-300 border-rose-400/25",
  FAILED: "bg-rose-400/10 text-rose-300 border-rose-400/25",
  ACTIVE: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide border whitespace-nowrap",
        STATUS_STYLES[status] ?? "bg-white/5 text-muted-foreground border-white/10",
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatCard({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className="studio-panel p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", accent && "text-primary")}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

export const SHOT_TYPE_LABELS: Record<string, string> = {
  ESTABLISHING: "Establishing",
  WIDE: "Wide",
  MEDIUM: "Medium",
  CLOSEUP: "Close-up",
  EXTREME_CLOSEUP: "Extreme close-up",
  LOW_ANGLE: "Low angle",
};
