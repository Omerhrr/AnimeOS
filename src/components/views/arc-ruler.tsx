"use client";

// ─────────────────────────────────────────────────────────────
// Season-wide arc ruler: one horizontal axis where every episode
// is a segment sized by its shot count and every state arc is a
// violet bar spanning its shots. ONE LANE PER SPEAKER: each
// character with arcs gets its own labeled row (a speaker's spans
// are disjoint by construction), ordered by story position, so
// rival arcs never stack on the character's row. Spans that
// survive an episode boundary (same speaker + state on both sides)
// merge into ONE season arc drawn straight across the boundary.
// Click a bar to open that episode. Pure display: spans come from
// the shared computeSeasonArcSpans over the project query the view
// already holds, so there is no extra API round trip.
// ─────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Route } from "lucide-react";
import {
  computeSeasonArcSpans, formatSeasonArcRange, groupSpansBySpeaker,
  type SeasonArcShotInput, type SeasonArcSpan,
} from "@/lib/comic/arcs";
import { cn } from "@/lib/utils";

interface RulerShot { id: string; number: number; dialogue?: string | null }
interface RulerScene { id: string; number: number; shots: RulerShot[] }
interface RulerEpisode { id: string; number: number; title: string; scenes: RulerScene[] }

const LANE_H = 26;
const GUTTER_W = 88;

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

  // per-speaker lanes: one row per character, ordered by first arc start
  const speakerLanes = useMemo(
    () =>
      groupSpansBySpeaker(
        spans.map((span) => ({ ...span, start: indexByShotId.get(span.startShotId) ?? 0 })),
      ),
    [spans, indexByShotId],
  );

  // bar geometry: inclusive global shot indexes -> percentages of the axis
  const bars = useMemo(() => {
    const total = shots.length;
    if (total === 0) return [];
    const laneOf = new Map(speakerLanes.map((g, i) => [g.speakerKey, i]));
    return spans.map((span) => {
      const start = indexByShotId.get(span.startShotId) ?? 0;
      const end = indexByShotId.get(span.endShotId) ?? start;
      return {
        span, lane: laneOf.get(span.speakerKey) ?? 0, start, end,
        left: (start / total) * 100,
        width: ((end - start + 1) / total) * 100,
      };
    });
  }, [spans, shots, indexByShotId, speakerLanes]);

  const laneCount = speakerLanes.length;

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
          {spans.length} state arc{spans.length === 1 ? "" : "s"} across {ordered.length} episode{ordered.length === 1 ? "" : "s"} · {totalShots} shots · one lane per speaker · a bar crossing a boundary is one continuous season beat · click a bar to open that episode
        </span>
      </div>

      {/* episode label row (gutter spacer keeps labels aligned with the axis) */}
      <div className="mt-3 flex select-none">
        <div className="shrink-0" style={{ width: GUTTER_W }} />
        <div className="relative h-4 min-w-0 flex-1">
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
      </div>

      {/* speaker gutter + the axis: episode segments as background, one lane per speaker */}
      <div className="mt-1 flex">
        <div className="shrink-0 pt-1 pr-2 select-none" style={{ width: GUTTER_W }}>
          {laneCount === 0 ? (
            <div className="text-[9px] leading-tight text-muted-foreground">&nbsp;</div>
          ) : (
            speakerLanes.map((g) => (
              <div key={g.speakerKey} className="flex items-center justify-end" style={{ height: LANE_H }}>
                <span
                  className="truncate text-[9px] font-mono font-bold text-violet-200/80"
                  title={`${g.speaker}: ${g.spans.length} arc${g.spans.length === 1 ? "" : "s"}`}
                >
                  {g.speaker}
                </span>
              </div>
            ))
          )}
        </div>
        <div
          className="relative min-w-0 flex-1 rounded-md border border-white/10 bg-black/30"
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
    </div>
  );
}
