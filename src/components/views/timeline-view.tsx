"use client";

import { useState } from "react";
import { GanttChartSquare, MonitorPlay } from "lucide-react";
import type { StudioProject } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader, StatusBadge, SHOT_TYPE_LABELS } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-white/12 border-white/20",
  QUEUED: "bg-amber-400/25 border-amber-400/40",
  RENDERING: "bg-amber-400/40 border-amber-300/60 animate-pulse",
  REVIEW: "bg-violet-400/30 border-violet-400/50",
  INSPECTING: "bg-violet-400/40 border-violet-300/60 animate-pulse",
  APPROVED: "bg-emerald-400/25 border-emerald-400/50",
  FINAL: "bg-emerald-400/40 border-emerald-300/60",
  FAILED: "bg-rose-400/30 border-rose-400/50",
};

export function TimelineView({ project }: { project: StudioProject }) {
  const { openPreview, setView } = useStudio();
  const [hover, setHover] = useState<string | null>(null);

  const episodes = project.seasons.flatMap((s) => s.episodes);
  const [episodeIdx, setEpisodeIdx] = useState(0);
  const episode = episodes[Math.min(episodeIdx, episodes.length - 1)];

  if (!episode) {
    return (
      <div>
        <SectionHeader title="Timeline" sub="Shot-based screen time across the episode." />
        <div className="studio-panel p-10 text-center text-sm text-muted-foreground">No episodes yet - create one in Story & Scenes.</div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Timeline"
        sub="Every block is a shot, width proportional to duration. This is the episode as the render pipeline sees it."
        right={
          <div className="flex gap-1.5 flex-wrap">
            {episodes.map((ep, i) => (
              <Button key={ep.id} size="sm" variant={i === episodeIdx ? "default" : "outline"}
                className={cn("h-7 text-[11px]", i !== episodeIdx && "border-white/12 bg-white/5")}
                onClick={() => setEpisodeIdx(i)}>
                E{String(ep.number).padStart(2, "0")}
              </Button>
            ))}
          </div>
        }
      />

      <div className="space-y-5">
        {episode.scenes.map((scene) => {
          const total = scene.shots.reduce((n, s) => n + s.duration, 0) || 1;
          return (
            <div key={scene.id} className="studio-panel p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <GanttChartSquare className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Scene {scene.number} - {scene.title}</span>
                  <StatusBadge status={scene.status} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground tabular-nums">{total.toFixed(1)}s</span>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" onClick={() => openPreview(scene.id)}>
                    <MonitorPlay className="h-3 w-3 mr-1" /> Preview
                  </Button>
                </div>
              </div>
              <div className="flex gap-1 h-14">
                {scene.shots.map((shot) => (
                  <button
                    key={shot.id}
                    onClick={() => setView("story")}
                    onMouseEnter={() => setHover(shot.id)}
                    onMouseLeave={() => setHover(null)}
                    style={{ width: `${(shot.duration / total) * 100}%` }}
                    className={cn(
                      "relative rounded-md border min-w-[6px] transition-all hover:brightness-125",
                      STATUS_COLORS[shot.status] ?? "bg-white/10 border-white/20"
                    )}
                    aria-label={`Shot ${shot.number}`}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-white/80">
                      {hover === shot.id ? `${shot.duration.toFixed(1)}s` : String(shot.number).padStart(3, "0")}
                    </span>
                  </button>
                ))}
                {scene.shots.length === 0 && (
                  <div className="flex-1 rounded-md border border-dashed border-white/15 flex items-center justify-center text-[11px] text-muted-foreground">
                    No shots - ask DSH to break this scene down
                  </div>
                )}
              </div>
              {hover && (
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  {(() => {
                    const shot = scene.shots.find((s) => s.id === hover);
                    if (!shot) return null;
                    return `SHOT ${String(shot.number).padStart(3, "0")} - ${SHOT_TYPE_LABELS[shot.shotType] ?? shot.shotType} · ${shot.lens ?? "default"} · ${shot.movement?.toLowerCase() ?? "static"} - ${shot.description}`;
                  })()}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
