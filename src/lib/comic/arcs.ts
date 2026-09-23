// ─────────────────────────────────────────────────────────────
// State arc spans: computed from per-line state overrides across
// an ordered shot list (episode order = scene number, then shot
// number). A span is the maximal run of ONE speaker's lines that
// share the same state override; lines from other speakers (or
// narration) do not break the run, but the speaker speaking an
// auto (or different-state) line does. Spans may cross scene
// boundaries when an arc was stamped with the cross-scene tools.
// Pure display layer: the voice chain still resolves overrides
// per line, so no sig or schema involvement lives here.
// ─────────────────────────────────────────────────────────────

import { parseDialogue } from "@/lib/comic/dialogue";

export interface ArcShotInput {
  id: string;
  sceneId: string;
  sceneNumber: number;
  number: number; // shot number within its scene
  dialogue: string | null;
}

export interface ArcSpan {
  speaker: string; // display form, as first seen
  speakerKey: string; // lowercase match key
  state: string;
  startScene: number;
  startShot: number;
  endScene: number;
  endShot: number;
  startShotId: string;
  endShotId: string;
  lineCount: number;
  shotCount: number;
  crossesScene: boolean;
  shotIds: string[]; // ordered, deduped
  arcBatches: string[]; // ensemble batch ids on the span's lines (ordered, deduped)
}

export function computeArcSpans(shots: ArcShotInput[]): ArcSpan[] {
  const spans: ArcSpan[] = [];
  let cur: ArcSpan | null = null;
  for (const shot of shots) {
    for (const line of parseDialogue(shot.dialogue)) {
      const speakerKey = line.speaker.trim().toLowerCase();
      if (!speakerKey || !line.state) {
        // the span's own speaker speaking an auto line ends the run
        if (cur && speakerKey === cur.speakerKey) {
          spans.push(cur);
          cur = null;
        }
        continue;
      }
      if (cur && cur.speakerKey === speakerKey && cur.state === line.state) {
        cur.endScene = shot.sceneNumber;
        cur.endShot = shot.number;
        cur.endShotId = shot.id;
        cur.lineCount += 1;
        if (cur.shotIds[cur.shotIds.length - 1] !== shot.id) {
          cur.shotIds.push(shot.id);
          cur.shotCount += 1;
        }
        if (line.arcBatch && !cur.arcBatches.includes(line.arcBatch)) cur.arcBatches.push(line.arcBatch);
      } else {
        if (cur) spans.push(cur);
        cur = {
          speaker: line.speaker.trim(),
          speakerKey,
          state: line.state,
          startScene: shot.sceneNumber,
          startShot: shot.number,
          endScene: shot.sceneNumber,
          endShot: shot.number,
          startShotId: shot.id,
          endShotId: shot.id,
          lineCount: 1,
          shotCount: 1,
          crossesScene: false,
          shotIds: [shot.id],
          arcBatches: line.arcBatch ? [line.arcBatch] : [],
        };
      }
    }
  }
  if (cur) spans.push(cur);
  for (const s of spans) s.crossesScene = s.startScene !== s.endScene;
  return spans;
}

/** The spans touching one shot, with the shot's position inside each. */
export function arcSpansForShot(
  spans: ArcSpan[],
  shotId: string,
): Array<ArcSpan & { startsHere: boolean; endsHere: boolean }> {
  const out: Array<ArcSpan & { startsHere: boolean; endsHere: boolean }> = [];
  for (const s of spans) {
    if (!s.shotIds.includes(shotId)) continue;
    out.push({ ...s, startsHere: s.startShotId === shotId, endsHere: s.endShotId === shotId });
  }
  return out;
}

/** Human range label: "Sc12 shots 3-6" in-scene, "Sc12 S3 → Sc13 S2" across scenes. */
export function formatArcRange(span: {
  startScene: number; startShot: number; endScene: number; endShot: number;
}): string {
  if (span.startScene === span.endScene) {
    if (span.startShot === span.endShot) return `Sc${span.startScene} shot ${span.startShot}`;
    return `Sc${span.startScene} shots ${span.startShot}-${span.endShot}`;
  }
  return `Sc${span.startScene} S${span.startShot} → Sc${span.endScene} S${span.endShot}`;
}

/** Where a shot sits inside its span. */
export function describeArcPosition(startsHere: boolean, endsHere: boolean): string {
  if (startsHere && endsHere) return "starts and ends here";
  if (startsHere) return "starts here";
  if (endsHere) return "ends here";
  return "runs through";
}

// ─────────────────────────────────────────────────────────────
// Season layer: the same run logic walked across the WHOLE season
// (every episode's shots in order). A span that survives an episode
// boundary (same speaker + state on both sides) becomes ONE season
// arc, so the arc ruler can draw the beat across episode segments.
// ─────────────────────────────────────────────────────────────

export interface SeasonArcShotInput extends ArcShotInput {
  episodeNumber: number;
}

export interface SeasonArcSpan extends ArcSpan {
  startEpisode: number;
  endEpisode: number;
  crossesEpisode: boolean;
}

/**
 * Season-wide spans from episode-ordered shots (episode number, then
 * scene number, then shot number). Runs merge across episode
 * boundaries exactly like they merge across scene boundaries: only
 * the span speaker speaking an auto (or different-state) line ends
 * the run. `shots` must carry episodeNumber for every shot.
 */
export function computeSeasonArcSpans(shots: SeasonArcShotInput[]): SeasonArcSpan[] {
  const episodeByShotId = new Map<string, number>();
  for (const s of shots) episodeByShotId.set(s.id, s.episodeNumber);
  const spans = computeArcSpans(shots);
  return spans.map((s) => {
    const startEpisode = episodeByShotId.get(s.startShotId) ?? 0;
    const endEpisode = episodeByShotId.get(s.endShotId) ?? 0;
    return {
      ...s,
      startEpisode,
      endEpisode,
      crossesEpisode: startEpisode !== endEpisode,
    };
  });
}

/** Season range label: "Ep07 Sc12 S1 → Sc13 S2" in-episode, "Ep07 Sc13 S2 → Ep08 Sc12 S1" across episodes. */
export function formatSeasonArcRange(span: {
  startEpisode: number; startScene: number; startShot: number;
  endEpisode: number; endScene: number; endShot: number;
}): string {
  if (span.startEpisode === span.endEpisode) {
    if (span.startScene === span.endScene) {
      if (span.startShot === span.endShot) return `Ep${span.startEpisode} Sc${span.startScene} shot ${span.startShot}`;
      return `Ep${span.startEpisode} Sc${span.startScene} shots ${span.startShot}-${span.endShot}`;
    }
    return `Ep${span.startEpisode} Sc${span.startScene} S${span.startShot} → Sc${span.endScene} S${span.endShot}`;
  }
  return `Ep${span.startEpisode} Sc${span.startScene} S${span.startShot} → Ep${span.endEpisode} Sc${span.endScene} S${span.endShot}`;
}

/**
 * Greedy lane packing for ruler bars: each span gets the first lane
 * whose previous bar ends before this one starts, so overlapping
 * beats stack without covering each other. Returns one lane index
 * per input span (input order preserved).
 */
export function packSpanLanes<T extends { start: number; end: number }>(spans: T[]): number[] {
  const order = spans.map((s, i) => ({ i, s })).sort((a, b) => a.s.start - b.s.start || a.s.end - b.s.end);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(spans.length);
  for (const { i, s } of order) {
    let lane = laneEnds.findIndex((end) => end < s.start);
    if (lane === -1) {
      laneEnds.push(s.end);
      lane = laneEnds.length - 1;
    } else {
      laneEnds[lane] = s.end;
    }
    lanes[i] = lane;
  }
  return lanes;
}

// ─────────────────────────────────────────────────────────────
// Ensemble beats: spans from DIFFERENT speakers that belong to the
// same parallel beat read as one ensemble. Two links union spans:
// (1) a shared ENSEMBLE BATCH id (an apply_arc_template ensemble
// batch stamps the same arcBatch on every speaker's lines, so the
// classic alternating-dialogue beat groups even when no two spans
// share a shot), and (2) a shared shot id (free-form parallel lines
// inside one shot). Union-find; same-speaker spans never merge;
// groups are numbered in first-seen order and a group of size 1 is
// not an ensemble. Pure display layer: derived from the same spans
// the ruler and the panel inspector already hold.
// ─────────────────────────────────────────────────────────────

/**
 * One group index per input span (input order preserved). A span
 * that bridges two groups pulls them together, so a three-speaker
 * beat is one group even when no single line carries all three.
 */
export function groupEnsembleSpans<T extends { speakerKey: string; shotIds: string[]; arcBatches?: string[] }>(
  spans: T[],
): number[] {
  const n = spans.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const unionIfDiff = (a: number, b: number) => {
    if (spans[a].speakerKey === spans[b].speakerKey) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const byShot = new Map<string, number[]>();
  const byBatch = new Map<string, number[]>();
  spans.forEach((s, i) => {
    for (const id of s.shotIds) {
      const shotPeers = byShot.get(id) ?? [];
      for (const j of shotPeers) unionIfDiff(i, j);
      shotPeers.push(i);
      byShot.set(id, shotPeers);
    }
    for (const b of s.arcBatches ?? []) {
      const batchPeers = byBatch.get(b) ?? [];
      for (const j of batchPeers) unionIfDiff(i, j);
      batchPeers.push(i);
      byBatch.set(b, batchPeers);
    }
  });
  const dense = new Map<number, number>();
  return parent.map((_, i) => {
    const root = find(i);
    let g = dense.get(root);
    if (g === undefined) {
      g = dense.size;
      dense.set(root, g);
    }
    return g;
  });
}

/** Member count per group id (index = group id). */
export function ensembleGroupSizes(groups: number[]): number[] {
  const sizes: number[] = [];
  for (const g of groups) sizes[g] = (sizes[g] ?? 0) + 1;
  return sizes;
}

export interface SpeakerLane<T> {
  speakerKey: string;
  speaker: string; // display form, as first seen
  spans: T[]; // ordered by start
}

/**
 * Per-speaker lane grouping for the ruler: ONE lane per speaker. A
 * speaker's spans are disjoint by construction (a run ends when the
 * same speaker speaks another state or auto), so every arc of a
 * character sits on its own character's row. Lanes are ordered by
 * each speaker's first span start, so rows read in story order.
 * `start` is a caller-chosen positional index (shot index on the
 * ruler axis), not a scene number.
 */
export function groupSpansBySpeaker<T extends { speakerKey: string; speaker: string; start: number }>(
  spans: T[],
): SpeakerLane<T>[] {
  const groups = new Map<string, SpeakerLane<T>>();
  for (const s of spans) {
    const g = groups.get(s.speakerKey);
    if (g) g.spans.push(s);
    else groups.set(s.speakerKey, { speakerKey: s.speakerKey, speaker: s.speaker, spans: [s] });
  }
  return [...groups.values()]
    .map((g) => ({ ...g, spans: [...g.spans].sort((a, b) => a.start - b.start) }))
    .sort((a, b) => a.spans[0].start - b.spans[0].start);
}
