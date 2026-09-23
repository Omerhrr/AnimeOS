// ─────────────────────────────────────────────────────────────
// Arc playback: hear an arc's takes in sequence. Given an arc span
// (speaker + state + the shots it covers) and the episode's ordered
// shots WITH their audio cues, collect the stored VOICE takes of the
// span's lines in story order (scene number, then shot number, then
// line order). Cue-to-line matching follows the SAME label convention
// the voice chain writes ("speaker: text", case-insensitive), so a
// take only qualifies when its label matches the line it would play
// for. Pure display layer: no DB, no DOM - the inspector builds the
// queue here and plays it with plain Audio elements.
// ─────────────────────────────────────────────────────────────

import { parseDialogue } from "@/lib/comic/dialogue";

export interface ArcPlaybackCue {
  kind: string; // VOICE cues only
  label: string; // "speaker: text" as written by the render chain
  voiceUrl: string | null;
  voiceDurationMs: number | null;
  voiceActor: string | null;
  voiceStateLabel: string | null;
}

export interface ArcPlaybackShot {
  id: string;
  sceneNumber: number;
  number: number; // shot number within its scene
  dialogue: string | null;
  audioCues?: ArcPlaybackCue[];
}

export interface ArcPlaybackSpan {
  speakerKey: string; // lowercase match key
  state: string; // the span's state override (exact)
  shotIds: string[];
}

export interface ArcTakeItem {
  speaker: string; // display form, as written on the line
  text: string;
  url: string; // stored take under /voices/
  durationMs: number | null;
  voiceId: string | null;
  stateLabel: string | null; // state the take performed under
  sceneNumber: number;
  shotNumber: number;
  lineIdx: number; // line order inside its shot
}

/** True when a cue label belongs to a dialogue line (same convention as the voice chain). */
function cueMatchesLine(cueLabel: string, speaker: string, text: string): boolean {
  const wantSpeaker = speaker.trim().toLowerCase();
  const wantText = text.trim().toLowerCase();
  if (!wantSpeaker || !wantText) return false;
  const sep = cueLabel.includes(": ") ? cueLabel.indexOf(": ") : -1;
  const cueSpeaker = sep >= 0 ? cueLabel.slice(0, sep).trim().toLowerCase() : "";
  const cueText = (sep >= 0 ? cueLabel.slice(sep + 2) : cueLabel).trim().toLowerCase();
  if (cueText !== wantText) return false;
  if (cueSpeaker && cueSpeaker !== wantSpeaker) return false;
  return true;
}

/**
 * The stored takes of ONE arc span, in story order. Walks the span's
 * shots in the caller's order, keeps the span speaker's lines that
 * carry the span's exact state override, and matches each line to the
 * first VOICE cue with a rendered url whose label names the line.
 */
export function buildArcTakes(span: ArcPlaybackSpan, shots: ArcPlaybackShot[]): ArcTakeItem[] {
  const byId = new Map(shots.map((s) => [s.id, s]));
  const takes: ArcTakeItem[] = [];
  for (const shotId of span.shotIds) {
    const shot = byId.get(shotId);
    if (!shot) continue;
    const cues = (shot.audioCues ?? []).filter((c) => c.kind === "VOICE" && c.voiceUrl);
    const lines = parseDialogue(shot.dialogue);
    lines.forEach((line, lineIdx) => {
      const speakerKey = line.speaker.trim().toLowerCase();
      if (!speakerKey || speakerKey !== span.speakerKey) return;
      if ((line.state ?? null) !== span.state) return;
      const cue = cues.find((c) => cueMatchesLine(c.label, line.speaker, line.text));
      if (!cue || !cue.voiceUrl) return;
      takes.push({
        speaker: line.speaker.trim(),
        text: line.text,
        url: cue.voiceUrl,
        durationMs: cue.voiceDurationMs,
        voiceId: cue.voiceActor,
        stateLabel: cue.voiceStateLabel,
        sceneNumber: shot.sceneNumber,
        shotNumber: shot.number,
        lineIdx,
      });
    });
  }
  return takes;
}

/**
 * ONE sequence for a WHOLE ensemble beat: every member span's takes
 * merged and re-sorted into story order (scene, shot, line), so the
 * parallel beat plays as the scene reads it - possessor and possessed
 * interleaved exactly as the lines sit on the timeline.
 */
export function mergeArcTakes(spans: ArcPlaybackSpan[], shots: ArcPlaybackShot[]): ArcTakeItem[] {
  const merged = spans.flatMap((span) => buildArcTakes(span, shots));
  return merged.sort(
    (a, b) =>
      a.sceneNumber - b.sceneNumber ||
      a.shotNumber - b.shotNumber ||
      a.lineIdx - b.lineIdx,
  );
}
