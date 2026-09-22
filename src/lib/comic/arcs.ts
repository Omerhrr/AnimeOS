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
