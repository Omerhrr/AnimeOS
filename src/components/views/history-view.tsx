"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Cpu, User, Cog, ShieldAlert, Clapperboard, Eye } from "lucide-react";
import { api } from "@/lib/api-client";
import { SectionHeader } from "@/components/views/shared";
import { cn } from "@/lib/utils";

const ACTOR_STYLE: Record<string, { icon: typeof Cpu; className: string }> = {
  DSH: { icon: Cpu, className: "text-violet-300 bg-violet-400/10 border-violet-400/30" },
  USER: { icon: User, className: "text-amber-300 bg-amber-400/10 border-amber-400/30" },
  SYSTEM: { icon: Cog, className: "text-teal-300 bg-teal-400/10 border-teal-400/30" },
};

const TYPE_ICON: Record<string, typeof Clapperboard> = {
  TOOL_CALL: Cpu,
  RENDER: Eye,
  EVALUATION: ShieldAlert,
  CONTINUITY: ShieldAlert,
  PROJECT: Clapperboard,
  STATE_CHANGE: Cog,
};

export function HistoryView({ project }: { project: import("@/lib/api-client").StudioProject }) {
  const events = project.productionEvents;

  return (
    <div>
      <SectionHeader
        title="Production History"
        sub="Every decision, tool call, render and evaluation — the production remembers everything (§52)."
      />
      <div className="studio-panel p-4">
        <div className="relative max-h-[calc(100vh-14rem)] overflow-y-auto studio-scroll pr-2">
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-white/10" />
          <div className="space-y-3">
            {events.map((e) => {
              const actor = ACTOR_STYLE[e.actor] ?? ACTOR_STYLE.SYSTEM;
              const TypeIcon = TYPE_ICON[e.type] ?? History;
              return (
                <div key={e.id} className="relative flex gap-3 items-start pl-0">
                  <div className={cn("h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 z-10", actor.className)}>
                    <TypeIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[11px] font-semibold", e.actor === "DSH" ? "text-violet-300" : e.actor === "USER" ? "text-amber-300" : "text-teal-300")}>
                        {e.actor}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">{e.type.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground/70 ml-auto tabular-nums">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed mt-1 text-foreground/85">{e.summary}</p>
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <p className="text-xs text-muted-foreground py-8 text-center">No production events yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
