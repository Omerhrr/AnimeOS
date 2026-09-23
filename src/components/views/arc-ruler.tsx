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
// arrow. The focused episode is remembered per session, so
// switching episodes or views and coming back restores the zoom.
// ENSEMBLE BEATS: spans from DIFFERENT speakers covering a shared
// shot read as one parallel beat and carry a teal ×N badge, so a
// multi-speaker apply is visible across lanes at a glance. PLAYBACK:
// a bar with rendered takes carries a ▶ chip - one click plays that
// arc's takes in story order (an ensemble member plays the WHOLE beat
// merged), so the season can be auditioned straight from the ruler.
// Pure display: spans come from the shared computeSeasonArcSpans over
// the project query the view already holds, so there is no extra
// API round trip.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Crosshair, Play, Route, Square } from "lucide-react";
import {
  computeSeasonArcSpans, ensembleGroupSizes, formatSeasonArcRange, groupEnsembleSpans,
  groupSpansBySpeaker, type SeasonArcShotInput, type SeasonArcSpan,
} from "@/lib/comic/arcs";
import {
  buildArcTakes, mergeArcTakes, type ArcPlaybackShot, type ArcPlaybackSpan, type ArcTakeItem,
} from "@/lib/comic/arc-playback";
import { cn } from "@/lib/utils";

interface RulerCue {
  kind: string;
  label: string;
  voiceUrl: string | null;
  voiceDurationMs: number | null;
  voiceActor: string | null;
  voiceStateLabel: string | null;
}

interface RulerShot { id: string; number: number; dialogue?: string | null; audioCues?: RulerCue[] }
interface RulerScene { id: string; number: number; title?: string; shots: RulerShot[] }
interface RulerEpisode { id: string; number: number; title: string; scenes: RulerScene[] }

const LANE_H = 26;
const GUTTER_W = 88;
const TICK_LABEL_MAX = 32; // show per-shot numbers only when the episode is small enough

type RulerSpan = SeasonArcSpan & { ensemble: number; ensembleNames: string[] };

// ── session-backed focus store ────────────────────────────────
// sessionStorage IS the state: the focused episode survives ruler
// close/open and episode switches for the whole tab session, and
// useSyncExternalStore keeps SSR (null) and client snapshots in
// sync without a restore effect.
const focusListeners = new Set<() => void>();
function subscribeFocus(onChange: () => void) {
  focusListeners.add(onChange);
  return () => {
    focusListeners.delete(onChange);
  };
}
function emitFocusChange() {
  for (const listener of focusListeners) listener();
}

function useFocusEpisode(projectId: string): [number | null, (n: number | null) => void] {
  const key = `animeos:arc-ruler-focus:${projectId}`;
  const raw = useSyncExternalStore(
    subscribeFocus,
    () => window.sessionStorage.getItem(key),
    () => null,
  );
  const set = (n: number | null) => {
    if (n === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, String(n));
    emitFocusChange();
  };
  const parsed = raw === null ? Number.NaN : Number(raw);
  return [Number.isFinite(parsed) ? parsed : null, set];
}

interface FocusBar {
  span: RulerSpan;
  spanIndex: number; // index into enrichedSpans / playback.takesByIndex
  leftClip: boolean; // the season arc flows in from the previous episode
  rightClip: boolean; // ...and keeps flowing into the next one
  left: number;
  width: number;
}

/** Stable key for one arc span (playback state is keyed by it). */
function arcKey(a: { speakerKey: string; state: string; startShotId: string }): string {
  return `${a.speakerKey}:${a.state}:${a.startShotId}`;
}

/**
 * ONE ruler bar: the label button opens the span's episode (the
 * classic affordance); a ▶ chip on the right edge plays the span's
 * stored takes when it has any (an ensemble member plays the WHOLE
 * beat merged). The chip paints above every bar (z-10), so a tiny
 * bar's control stays clickable even in a crowded lane.
 */
function RulerBar({
  span, top, left, width, minWidth, border, boxShadow, label, title,
  takeCount, playing, onPickEpisode, onToggle,
}: {
  span: RulerSpan;
  top: number;
  left: number;
  width: number;
  minWidth: number;
  border: string;
  boxShadow: string;
  label: ReactNode;
  title: string;
  takeCount: number;
  playing: boolean;
  onPickEpisode: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className="absolute flex items-center transition-all hover:brightness-125"
      style={{
        top,
        height: LANE_H - 6,
        left: `${left}%`,
        width: `${width}%`,
        minWidth,
        background: "linear-gradient(180deg, rgba(139,92,246,0.95), rgba(109,40,217,0.95))",
        border,
        borderRadius: 4,
        color: "#fff",
        boxShadow,
      }}
    >
      <button
        onClick={onPickEpisode}
        className="min-w-0 flex-1 truncate text-left text-[9px] font-bold tracking-wide focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-300"
        style={{ paddingLeft: 6, paddingRight: takeCount > 0 ? 15 : 6 }}
        title={title}
      >
        {label}
      </button>
      {takeCount > 0 && (
        <button
          onClick={onToggle}
          className={cn(
            "absolute right-[2px] top-1/2 z-10 flex h-3 w-3 -translate-y-1/2 items-center justify-center rounded-full border transition-colors",
            playing
              ? "border-white/70 bg-rose-500/90 hover:bg-rose-400"
              : "border-cyan-200/70 bg-cyan-500/80 hover:bg-cyan-400",
          )}
          title={playing
            ? "Stop the arc playback"
            : takeCount === 1
              ? `Play this arc's 1 stored take in story order (${span.speaker} - ${span.state})`
              : `Play this arc's ${takeCount} stored takes in story order (${span.speaker} - ${span.state})`}
        >
          {playing ? <Square className="h-2 w-2" /> : <Play className="h-2 w-2" />}
        </button>
      )}
    </div>
  );
}

export function ArcRuler({
  projectId, episodes, activeEpisodeNumber, onPickEpisode,
}: {
  projectId: string;
  episodes: RulerEpisode[];
  activeEpisodeNumber: number | null;
  onPickEpisode: (episodeNumber: number) => void;
}) {
  const [focusEpisodeNumber, setFocusEpisodeNumber] = useFocusEpisode(projectId);

  const ordered = useMemo(
    () => [...episodes].sort((a, b) => a.number - b.number).filter((e) => e.scenes.some((sc) => sc.shots.length > 0)),
    [episodes],
  );

  // flat episode-ordered shot list (episode, then scene, then shot) is the ruler axis;
  // it carries the shots' VOICE cues too, so the bars can play their takes
  const shots: (SeasonArcShotInput & { audioCues?: RulerCue[] })[] = useMemo(
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
                audioCues: sh.audioCues,
              })),
          ),
      ),
    [ordered],
  );

  const indexByShotId = useMemo(() => new Map(shots.map((s, i) => [s.id, i])), [shots]);

  const spans: SeasonArcSpan[] = useMemo(() => computeSeasonArcSpans(shots), [shots]);

  // ensemble grouping: spans from DIFFERENT speakers sharing a shot
  // read as ONE parallel beat (the same template applied to several
  // speakers over the same range)
  const ensembleOf = useMemo(() => {
    const groups = groupEnsembleSpans(spans);
    const sizes = ensembleGroupSizes(groups);
    const names = new Map<number, string[]>();
    spans.forEach((s, i) => {
      const g = groups[i];
      const arr = names.get(g) ?? [];
      arr.push(s.speaker);
      names.set(g, arr);
    });
    return { group: groups, size: sizes, names };
  }, [spans]);

  // ── arc playback: stored takes per span, played straight from the bars ──
  // the same flat shot list now carries its VOICE cues; buildArcTakes
  // matches takes to lines by the render chain's label convention. An
  // ENSEMBLE member's queue is the WHOLE beat merged in story order,
  // so the parallel read plays as the scene reads it.
  const playback = useMemo(() => {
    const playbackShots: ArcPlaybackShot[] = shots.map((s) => ({
      id: s.id,
      sceneNumber: s.sceneNumber,
      number: s.number,
      dialogue: s.dialogue,
      audioCues: (s.audioCues ?? []).map((c) => ({
        kind: c.kind, label: c.label, voiceUrl: c.voiceUrl,
        voiceDurationMs: c.voiceDurationMs, voiceActor: c.voiceActor, voiceStateLabel: c.voiceStateLabel,
      })),
    }));
    const membersOf = new Map<number, SeasonArcSpan[]>();
    spans.forEach((s, i) => {
      const g = ensembleOf.group[i];
      const arr = membersOf.get(g) ?? [];
      arr.push(s);
      membersOf.set(g, arr);
    });
    const takesByIndex: ArcTakeItem[][] = spans.map((span, i) => {
      const size = ensembleOf.size[ensembleOf.group[i]] ?? 1;
      const members = size > 1 ? (membersOf.get(ensembleOf.group[i]) ?? [span]) : [span];
      const arcSpans: ArcPlaybackSpan[] = members.map((m) => ({
        speakerKey: m.speakerKey,
        state: m.state,
        shotIds: shots.slice(indexByShotId.get(m.startShotId) ?? 0, (indexByShotId.get(m.endShotId) ?? 0) + 1).map((s) => s.id),
      }));
      return size > 1 ? mergeArcTakes(arcSpans, playbackShots) : buildArcTakes(arcSpans[0], playbackShots);
    });
    return { takesByIndex };
  }, [spans, shots, indexByShotId, ensembleOf]);

  const enrichedSpans: RulerSpan[] = useMemo(
    () =>
      spans.map((span, i) => ({
        ...span,
        ensemble: ensembleOf.size[ensembleOf.group[i]] ?? 1,
        ensembleNames: ensembleOf.names.get(ensembleOf.group[i]) ?? [],
      })),
    [spans, ensembleOf],
  );

  // ── sequential player: one token-guarded loop for the whole ruler, ──
  // pause-safe waiters, stopped by unmount / another bar / the chip
  const playTokenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playKey, setPlayKey] = useState<string | null>(null);

  useEffect(
    () => () => {
      playTokenRef.current += 1;
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  function stopPlayback() {
    playTokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayKey(null);
  }

  async function playArcTakes(key: string, takes: ArcTakeItem[]) {
    stopPlayback();
    const token = playTokenRef.current;
    setPlayKey(key);
    for (const t of takes) {
      if (playTokenRef.current !== token) return;
      await new Promise<void>((resolve) => {
        const audio = new Audio(t.url);
        audioRef.current = audio;
        const done = () => resolve();
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = done; // stop() pauses: resolve instead of hanging
        void audio.play().catch(done);
      });
    }
    if (playTokenRef.current === token) setPlayKey(null);
  }

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
        enrichedSpans.map((span) => ({ ...span, start: indexByShotId.get(span.startShotId) ?? 0 })),
      ),
    [enrichedSpans, indexByShotId],
  );

  const bars = useMemo(() => {
    const total = shots.length;
    if (total === 0) return [];
    const laneOf = new Map(speakerLanes.map((g, i) => [g.speakerKey, i]));
    return enrichedSpans.map((span, i) => {
      const start = indexByShotId.get(span.startShotId) ?? 0;
      const end = indexByShotId.get(span.endShotId) ?? start;
      const takes = playback.takesByIndex[i] ?? [];
      return {
        span, lane: laneOf.get(span.speakerKey) ?? 0, start, end, takes,
        left: (start / total) * 100,
        width: ((end - start + 1) / total) * 100,
      };
    });
  }, [enrichedSpans, shots, indexByShotId, speakerLanes, playback]);

  // ── focus view geometry: season spans clipped to the episode window ──
  const focusView = useMemo(() => {
    if (!focused) return null;
    const from = focused.startIdx;
    const total = focused.count;
    const windowSpans = enrichedSpans.flatMap((span, i) => {
      const s = indexByShotId.get(span.startShotId) ?? 0;
      const e = indexByShotId.get(span.endShotId) ?? s;
      if (e < from || s > from + total - 1) return [];
      const start = Math.max(s, from);
      const end = Math.min(e, from + total - 1);
      return [{
        span,
        spanIndex: i,
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
  }, [focused, enrichedSpans, indexByShotId, shots]);

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
            {lanes.reduce((n, g) => n + g.spans.length, 0)} state arc{lanes.reduce((n, g) => n + g.spans.length, 0) === 1 ? "" : "s"} in this episode · {total} shots · one lane per speaker · an ×N badge marks an ensemble beat · an amber arrow means the season beat continues into the neighbouring episode · a ▶ chip on a bar plays its takes (an ensemble member plays the whole beat)
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

            {focusBars.map(({ span, spanIndex, leftClip, rightClip, left, width }) => {
              const lane = laneOf.get(span.speakerKey) ?? 0;
              const ens = span.ensemble;
              const takes = playback.takesByIndex[spanIndex] ?? [];
              const key = arcKey(span);
              return (
                <RulerBar
                  key={key}
                  span={span}
                  top={4 + lane * LANE_H}
                  left={left}
                  width={width}
                  minWidth={14}
                  border={ens > 1 ? "1px solid rgba(94,234,212,0.8)" : "1px solid rgba(196,181,253,0.7)"}
                  boxShadow={leftClip || rightClip ? "0 0 0 1px rgba(232,176,75,0.55)" : "none"}
                  label={
                    <>
                      {leftClip && <span className="mr-1 text-amber-200">←</span>}
                      {span.state}
                      {ens > 1 && <span className="ml-1 text-teal-200">×{ens}</span>}
                      {rightClip && <span className="ml-1 text-amber-200">→</span>}
                    </>
                  }
                  title={`State arc "${span.state}" - ${span.speaker} - ${formatSeasonArcRange(span)} - ${span.lineCount} line${span.lineCount === 1 ? "" : "s"} in ${span.shotCount} shot${span.shotCount === 1 ? "" : "s"}${ens > 1 ? ` - ensemble beat: ${ens} speakers in parallel (${span.ensembleNames.join(", ")})` : ""}${leftClip ? ` - continues from Ep${span.startEpisode}` : ""}${rightClip ? ` - continues into Ep${span.endEpisode}` : ""} - click to open Ep${span.startEpisode}`}
                  takeCount={takes.length}
                  playing={playKey === key}
                  onPickEpisode={() => onPickEpisode(span.startEpisode)}
                  onToggle={() => (playKey === key ? stopPlayback() : void playArcTakes(key, takes))}
                />
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
          {spans.length} state arc{spans.length === 1 ? "" : "s"} across {ordered.length} episode{ordered.length === 1 ? "" : "s"} · {totalShots} shots · one lane per speaker · a bar crossing a boundary is one continuous season beat · an ×N badge marks an ensemble beat (the same shape on several speakers in parallel) · click a bar to open that episode · click an episode label to focus the ruler on it · a ▶ chip on a bar plays its takes in story order (an ensemble member plays the whole beat merged)
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

          {bars.map(({ span, lane, left, width, takes }) => {
            const key = arcKey(span);
            return (
              <RulerBar
                key={key}
                span={span}
                top={4 + lane * LANE_H}
                left={left}
                width={width}
                minWidth={14}
                border={span.ensemble > 1 ? "1px solid rgba(94,234,212,0.8)" : "1px solid rgba(196,181,253,0.7)"}
                boxShadow={span.crossesEpisode ? "0 0 0 1px rgba(232,176,75,0.55)" : "none"}
                label={
                  <>
                    {span.state}
                    {span.ensemble > 1 && <span className="ml-1 text-teal-200">×{span.ensemble}</span>}
                    {span.crossesEpisode && <span className="ml-1 text-amber-200">→ season</span>}
                  </>
                }
                title={`State arc "${span.state}" - ${span.speaker} - ${formatSeasonArcRange(span)} - ${span.lineCount} line${span.lineCount === 1 ? "" : "s"} in ${span.shotCount} shot${span.shotCount === 1 ? "" : "s"}${span.ensemble > 1 ? ` - ensemble beat: ${span.ensemble} speakers in parallel (${span.ensembleNames.join(", ")})` : ""}${span.crossesEpisode ? " - crosses episodes" : span.crossesScene ? " - crosses scenes" : ""} - click to open Ep${span.startEpisode}`}
                takeCount={takes.length}
                playing={playKey === key}
                onPickEpisode={() => onPickEpisode(span.startEpisode)}
                onToggle={() => (playKey === key ? stopPlayback() : void playArcTakes(key, takes))}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
