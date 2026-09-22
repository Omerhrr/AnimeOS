"use client";

// ─────────────────────────────────────────────────────────────
// Season-wide arc ruler: one horizontal axis where every episode
// is a segment sized by its shot count and every state arc is a
// violet bar spanning its shots. Spans that survive an episode
// boundary (same speaker + state on both sides) merge into ONE
// season arc and are drawn straight across the boundary. Click a
// bar to open that episode. Pure display: spans come from the
// shared computeSeasonArcSpans over the project query the view
// already holds, so there is no extra API round trip.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Route } from "lucide-react";
import {
  computeSeasonArcSpans, formatSeasonArcRange, packSpanLanes,
  type SeasonArcShotInput, type SeasonArcSpan,
} from "@/lib/comic/arcs";
import { cn } from "@/lib/utils";

interface RulerShot { id: string; number: number; dialogue?: string | null }
interface RulerScene { id: string; number: number; shots: RulerShot[] }
interface RulerEpisode { id: string; number: number; title: string; scenes: RulerScene[] }

const LANE_H = 26;

export function ArcRuler({
  episodes, activeEpisodeNumber, onPickEpisode,
}: {
  episodes: RulerEpisode[];
  activeEpisodeNumber: number | null;
  onPickEpisode: (episodeNumber: number) => void;
}) {
  const ordered = useMemo(
    () => [...episodes].sort((a, b) => a.number - b.number).filter((e) => e.scenes.some((sc) => sc.shots.length > 0)),
    [episodes],
  );

  // flat episode-ordered shot list (episode, then scene, then shot) is the ruler axis
  const shots: SeasonArcShotInput[] = useMemo(
    () =>
      ordered.flatMap((ep) =>
        [...ep.scenes]
          .sort((a, b) => a.number - b.number)
          .flatMap((sc) =>
            [...sc.shots]
              .sort((a, b) => a.number - b.number)
              .map((sh) => ({
                id: sh.id, sceneId: sc.id, sceneNumber: sc.number,
                number: sh.number, dialogue: sh.dialogue ?? null, episodeNumber: ep.number,
              })),
          ),
      ),
    [ordered],
  );

  const indexByShotId = useMemo(() => new Map(shots.map((s, i) => [s.id, i])), [shots]);

  const spans: SeasonArcSpan[] = useMemo(() => computeSeasonArcSpans(shots), [shots]);

  // bar geometry: inclusive global shot indexes -> percentages of the axis
  const bars = useMemo(() => {
    const total = shots.length;
    if (total === 0) return [];
    const lanes = packSpanLanes(spans.map((s) => ({ start: indexByShotId.get(s.startShotId) ?? 0, end: indexByShotId.get(s.endShotId) ?? 0 })));
    return spans.map((span, i) => {
      const start = indexByShotId.get(span.startShotId) ?? 0;
      const end = indexByShotId.get(span.endShotId) ?? start;
      return {
        span, lane: lanes[i], start, end,
        left: (start / total) * 100,
        width: ((end - start + 1) / total) * 100,
      };
    });
  }, [spans, shots, indexByShotId]);

  const laneCount = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);

  // episode segments along the same axis
  const segments = useMemo(() => {
    const total = shots.length;
    if (total === 0) return [];
    let acc = 0;
    return ordered.map((ep) => {
      const count = ep.scenes.reduce((n, sc) => n + sc.shots.length, 0);
      const seg = {
        episode: ep, startIdx: acc, count,
        left: (acc / total) * 100,
        width: (count / total) * 100,
      };
      acc += count;
      return seg;
    });
  }, [ordered, shots]);

  const totalShots = shots.length;

  if (totalShots === 0) {
    return (
      <div className="studio-panel p-4 mb-5 text-xs text-muted-foreground print:hidden">
        <span className="flex items-center gap-1.5 font-semibold text-foreground/80">
          <Route className="h-3.5 w-3.5 text-violet-300" /> Season arc ruler
        </span>
        <p className="mt-1.5">No shots to measure yet - break down a scene and the season&apos;s state arcs appear here.</p>
      </div>
    );
  }

  return (
    <div className="studio-panel p-4 mb-5 print:hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
          <Route className="h-3.5 w-3.5 text-violet-300" /> Season arc ruler
        </span>
        <span className="text-[10px] text-muted-foreground">
          {spans.length} state arc{spans.length === 1 ? "" : "s"} across {ordered.length} episode{ordered.length === 1 ? "" : "s"} · {totalShots} shots · violet bar = one arc, a bar crossing a boundary is one continuous season beat · click a bar to open that episode
        </span>
      </div>

      {/* episode label row */}
      <div className="relative mt-3 h-4 select-none">
        {segments.map((seg) => (
          <span
            key={seg.episode.id}
            className={cn(
              "absolute top-0 truncate px-1 text-[9px] font-mono font-bold tracking-widest",
              seg.episode.number === activeEpisodeNumber ? "text-violet-200" : "text-muted-foreground",
            )}
            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
            title={`Episode ${seg.episode.number}: ${seg.episode.title} (${seg.count} shots)`}
          >
            E{String(seg.episode.number).padStart(2, "0")}
            <span className="ml-1 font-sans font-medium tracking-normal opacity-70 hidden sm:inline">{seg.episode.title}</span>
          </span>
        ))}
      </div>

      {/* the axis: episode segments as background, arc bars stacked in lanes */}
      <div
        className="relative mt-1 rounded-md border border-white/10 bg-black/30"
        style={{ height: Math.max(laneCount, 1) * LANE_H + 8 }}
      >
        {segments.map((seg, i) => (
          <div
            key={seg.episode.id}
            className={cn(
              "absolute inset-y-0 border-white/8",
              i > 0 && "border-l",
              i % 2 === 0 ? "bg-white/[0.03]" : "bg-transparent",
              seg.episode.number === activeEpisodeNumber && "bg-violet-400/[0.06]",
            )}
            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
          />
        ))}

        {laneCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
            No state arcs on the season yet - paint one from the dialogue editor, apply_arc_template or set_state_arc.
          </div>
        )}

        {bars.map(({ span, lane, left, width }) => (
          <button
            key={`${span.speakerKey}:${span.state}:${span.startShotId}`}
            onClick={() => onPickEpisode(span.startEpisode)}
            className="absolute flex items-center overflow-hidden px-1.5 text-left text-[9px] font-bold tracking-wide transition-all hover:brightness-125 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-300"
            style={{
              top: 4 + lane * LANE_H,
              height: LANE_H - 6,
              left: `${left}%`,
              width: `${width}%`,
              minWidth: 14,
              background: "linear-gradient(180deg, rgba(139,92,246,0.95), rgba(109,40,217,0.95))",
              border: "1px solid rgba(196,181,253,0.7)",
              borderRadius: 4,
              color: "#fff",
              boxShadow: span.crossesEpisode ? "0 0 0 1px rgba(232,176,75,0.55)" : "none",
            }}
            title={`State arc "${span.state}" - ${span.speaker} - ${formatSeasonArcRange(span)} - ${span.lineCount} line${span.lineCount === 1 ? "" : "s"} in ${span.shotCount} shot${span.shotCount === 1 ? "" : "s"}${span.crossesEpisode ? " - crosses episodes" : span.crossesScene ? " - crosses scenes" : ""}`}
          >
            <span className="truncate">
              {span.state}
              {span.crossesEpisode && <span className="ml-1 text-amber-200">→ season</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
