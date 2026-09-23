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
// Click a bar to open that episode. FOCUS MODE: click an episode
// label (or the focus button on a segment) to zoom the ruler onto
// ONE episode - the axis becomes that episode's shots, scene
// segments replace episode segments, shot ticks give per-shot
// reading, and season arcs that flow in from (or out to) a
// neighbouring episode are clipped to the window with an amber
// arrow. Pure display: spans come from the shared
// computeSeasonArcSpans over the project query the view already
// holds, so there is no extra API round trip.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Crosshair, Route } from "lucide-react";
import {
  computeSeasonArcSpans, formatSeasonArcRange, groupSpansBySpeaker,
  type SeasonArcShotInput, type SeasonArcSpan,
} from "@/lib/comic/arcs";
import { cn } from "@/lib/utils";

interface RulerShot { id: string; number: number; dialogue?: string | null }
interface RulerScene { id: string; number: number; title?: string; shots: RulerShot[] }
interface RulerEpisode { id: string; number: number; title: string; scenes: RulerScene[] }

const LANE_H = 26;
const GUTTER_W = 88;
const TICK_LABEL_MAX = 32; // show per-shot numbers only when the episode is small enough

interface FocusBar {
  span: SeasonArcSpan;
  leftClip: boolean; // the season arc flows in from the previous episode
  rightClip: boolean; // ...and keeps flowing into the next one
  left: number;
  width: number;
}

export function ArcRuler({
  episodes, activeEpisodeNumber, onPickEpisode,
}: {
  episodes: RulerEpisode[];
  activeEpisodeNumber: number | null;
  onPickEpisode: (episodeNumber: number) => void;
}) {
  const [focusEpisodeNumber, setFocusEpisodeNumber] = useState<number | null>(null);

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

  const focusSeg = focusEpisodeNumber === null ? null : segments.find((s) => s.episode.number === focusEpisodeNumber) ?? null;
  const focused = focusSeg && focusSeg.count > 0 ? focusSeg : null;

  // ── season view geometry ─────────────────────────────────────
  const speakerLanes = useMemo(
    () =>
      groupSpansBySpeaker(
        spans.map((span) => ({ ...span, start: indexByShotId.get(span.startShotId) ?? 0 })),
      ),
    [spans, indexByShotId],
  );

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

  // ── focus view geometry: season spans clipped to the episode window ──
  const focusView = useMemo(() => {
    if (!focused) return null;
    const from = focused.startIdx;
    const total = focused.count;
    const windowSpans = spans.flatMap((span) => {
      const s = indexByShotId.get(span.startShotId) ?? 0;
      const e = indexByShotId.get(span.endShotId) ?? s;
      if (e < from || s > from + total - 1) return [];
      const start = Math.max(s, from);
      const end = Math.min(e, from + total - 1);
      return [{
        span,
        start, end,
        leftClip: s < from,
        rightClip: e > from + total - 1,
        left: ((start - from) / total) * 100,
        width: ((end - start + 1) / total) * 100,
      }];
    });
    const lanes = groupSpansBySpeaker(windowSpans.map((b) => ({ ...b.span, start: b.start })));
    const laneOf = new Map(lanes.map((g, i) => [g.speakerKey, i]));
    const focusBars: FocusBar[] = windowSpans.map((b) => ({ ...b }));
    // scene segments over the focused window
    let acc = 0;
    const sceneSegs = [...focused.episode.scenes]
      .sort((a, b) => a.number - b.number)
      .map((sc) => {
        const count = [...sc.shots].length;
        const seg = { scene: sc, count, left: (acc / total) * 100, width: (count / total) * 100, startIdx: acc };
        acc += count;
        return seg;
      });
    // shot ticks (labelled when the episode is small enough to read them)
    const tickShots = shots.slice(from, from + total);
    return { lanes, laneOf, focusBars, sceneSegs, tickShots, from, total };
  }, [focused, spans, indexByShotId, shots]);

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

  // ── FOCUS MODE ───────────────────────────────────────────────
  if (focused && focusView) {
    const { lanes, laneOf, focusBars, sceneSegs, tickShots, total } = focusView;
    const ep = focused.episode;
    return (
      <div className="studio-panel p-4 mb-5 print:hidden">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
            <Route className="h-3.5 w-3.5 text-violet-300" /> Season arc ruler
          </span>
          <span className="flex items-center gap-1 rounded border border-violet-400/30 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
            <Crosshair className="h-3 w-3" /> Focus: Ep{String(ep.number).padStart(2, "0")} - {ep.title}
          </span>
          <button
            onClick={() => setFocusEpisodeNumber(null)}
            className="rounded border border-white/12 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            title="Leave focus and draw the whole season again"
          >
            Exit focus (season view)
          </button>
          <span className="text-[10px] text-muted-foreground">
            {lanes.reduce((n, g) => n + g.spans.length, 0)} state arc{lanes.reduce((n, g) => n + g.spans.length, 0) === 1 ? "" : "s"} in this episode · {total} shots · one lane per speaker · an amber arrow means the season beat continues into the neighbouring episode
          </span>
        </div>

        {/* scene label row */}
        <div className="mt-3 flex select-none">
          <div className="shrink-0" style={{ width: GUTTER_W }} />
          <div className="relative h-4 min-w-0 flex-1">
            {sceneSegs.map((seg) => (
              <span
                key={seg.scene.id}
                className="absolute top-0 truncate px-1 text-[9px] font-mono font-bold tracking-widest text-muted-foreground"
                style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
                title={`Scene ${seg.scene.number} (${seg.count} shot${seg.count === 1 ? "" : "s"})`}
              >
                SC{String(seg.scene.number).padStart(2, "0")}
                <span className="ml-1 font-sans font-medium tracking-normal opacity-70 hidden sm:inline">{seg.scene.title ?? ""}</span>
              </span>
            ))}
          </div>
        </div>

        {/* speaker gutter + the focused axis: scene segments as background, one lane per speaker */}
        <div className="mt-1 flex">
          <div className="shrink-0 pt-1 pr-2 select-none" style={{ width: GUTTER_W }}>
            {lanes.length === 0 ? (
              <div className="text-[9px] leading-tight text-muted-foreground">&nbsp;</div>
            ) : (
              lanes.map((g) => (
                <div key={g.speakerKey} className="flex items-center justify-end" style={{ height: LANE_H }}>
                  <span
                    className="truncate text-[9px] font-mono font-bold text-violet-200/80"
                    title={`${g.speaker}: ${g.spans.length} arc${g.spans.length === 1 ? "" : "s"} in this episode`}
                  >
                    {g.speaker}
                  </span>
                </div>
              ))
            )}
          </div>
          <div
            className="relative min-w-0 flex-1 rounded-md border border-white/10 bg-black/30"
            style={{ height: Math.max(lanes.length, 1) * LANE_H + 8 }}
          >
            {sceneSegs.map((seg, i) => (
              <div
                key={seg.scene.id}
                className={cn(
                  "absolute inset-y-0 border-white/8",
                  i > 0 && "border-l",
                  i % 2 === 0 ? "bg-white/[0.03]" : "bg-transparent",
                  ep.number === activeEpisodeNumber && "bg-violet-400/[0.06]",
                )}
                style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
              />
            ))}

            {lanes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[10px] text-muted-foreground">
                No state arcs in this episode yet - paint one from the dialogue editor, apply_arc_template or set_state_arc.
              </div>
            )}

            {focusBars.map(({ span, leftClip, rightClip, left, width }) => {
              const lane = laneOf.get(span.speakerKey) ?? 0;
              return (
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
                    boxShadow: leftClip || rightClip ? "0 0 0 1px rgba(232,176,75,0.55)" : "none",
                  }}
                  title={`State arc "${span.state}" - ${span.speaker} - ${formatSeasonArcRange(span)} - ${span.lineCount} line${span.lineCount === 1 ? "" : "s"} in ${span.shotCount} shot${span.shotCount === 1 ? "" : "s"}${leftClip ? ` - continues from Ep${span.startEpisode}` : ""}${rightClip ? ` - continues into Ep${span.endEpisode}` : ""}`}
                >
                  <span className="truncate">
                    {leftClip && <span className="mr-1 text-amber-200">←</span>}
                    {span.state}
                    {rightClip && <span className="ml-1 text-amber-200">→</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* shot ticks: per-shot reading inside the focused episode */}
        <div className="mt-1 flex select-none">
          <div className="shrink-0" style={{ width: GUTTER_W }} />
          <div className="relative h-4 min-w-0 flex-1 border-t border-white/10">
            {tickShots.map((sh, i) => {
              const pct = ((i + 0.5) / total) * 100;
              return (
                <span
                  key={sh.id}
                  className="absolute top-0.5 -translate-x-1/2 text-[7px] font-mono leading-none text-muted-foreground/70"
                  style={{ left: `${pct}%` }}
                  title={`Shot ${sh.number} (Sc${sh.sceneNumber} S${sh.number})`}
                >
                  {total <= TICK_LABEL_MAX ? `S${sh.number}` : "·"}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── SEASON MODE ──────────────────────────────────────────────
  const laneCount = speakerLanes.length;

  return (
    <div className="studio-panel p-4 mb-5 print:hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
          <Route className="h-3.5 w-3.5 text-violet-300" /> Season arc ruler
        </span>
        <span className="text-[10px] text-muted-foreground">
          {spans.length} state arc{spans.length === 1 ? "" : "s"} across {ordered.length} episode{ordered.length === 1 ? "" : "s"} · {totalShots} shots · one lane per speaker · a bar crossing a boundary is one continuous season beat · click a bar to open that episode · click an episode label to focus the ruler on it
        </span>
      </div>

      {/* episode label row (gutter spacer keeps labels aligned with the axis); click a label to focus */}
      <div className="mt-3 flex select-none">
        <div className="shrink-0" style={{ width: GUTTER_W }} />
        <div className="relative h-4 min-w-0 flex-1">
          {segments.map((seg) => (
            <button
              key={seg.episode.id}
              onClick={() => setFocusEpisodeNumber(seg.episode.number)}
              className={cn(
                "absolute top-0 truncate px-1 text-left text-[9px] font-mono font-bold tracking-widest transition-colors hover:text-violet-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-300",
                seg.episode.number === activeEpisodeNumber ? "text-violet-200" : "text-muted-foreground",
              )}
              style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
              title={`Episode ${seg.episode.number}: ${seg.episode.title} (${seg.count} shots) - click to focus the ruler on this episode`}
            >
              E{String(seg.episode.number).padStart(2, "0")}
              <span className="ml-1 font-sans font-medium tracking-normal opacity-70 hidden sm:inline">{seg.episode.title}</span>
            </button>
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
