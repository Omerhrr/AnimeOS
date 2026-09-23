// ─────────────────────────────────────────────────────────────
// Speech bubble / dialogue model for Comic Mode panels
// ─────────────────────────────────────────────────────────────

import { isDeliveryId, type DeliveryId } from "@/lib/comic/delivery";

export type BubbleKind = "SPEECH" | "THOUGHT" | "SFX";

export interface DialogueLine {
  speaker: string;
  text: string;
  kind: BubbleKind;
  // Line-level delivery inside a single shot: each line can be played
  // in its own register (a character takes a hit mid-shot and their
  // next line turns injured). null = auto (state-aware) resolution.
  delivery?: DeliveryId | null;
  // Line-level state override inside a single shot: forces ONE of the
  // speaker's development states to perform this line (variant voice,
  // speed/pitch hints and the state-classified delivery all come from
  // it). null = auto (episode-resolved) state selection.
  state?: string | null;
  // Ensemble batch tag: set by an ENSEMBLE arc apply (one template
  // painted on several speakers in one batch) so the derived spans
  // can read as ONE parallel beat across speaker lanes. Pure display
  // metadata: it never enters the voice sig, so it cannot make a
  // fresh take stale. Any other state-writing path clears it.
  arcBatch?: string | null;
}

export const BUBBLE_KINDS: Array<{ id: BubbleKind; label: string; hint: string }> = [
  { id: "SPEECH", label: "Speech", hint: "Solid bubble with a tail" },
  { id: "THOUGHT", label: "Thought", hint: "Cloudy bubble with drifting dots" },
  { id: "SFX", label: "SFX", hint: "Stylized sound-effect text" },
];

const VALID_KINDS = new Set<BubbleKind>(["SPEECH", "THOUGHT", "SFX"]);
const MAX_LINES = 8;
const MAX_TEXT = 300;
const MAX_STATE = 80;
const MAX_ARC_BATCH = 64;

export function parseDialogue(raw: string | null | undefined): DialogueLine[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null)
      .map((l) => ({
        speaker: typeof l.speaker === "string" ? l.speaker.slice(0, 60) : "",
        text: typeof l.text === "string" ? l.text.slice(0, MAX_TEXT) : "",
        kind: VALID_KINDS.has(l.kind as BubbleKind) ? (l.kind as BubbleKind) : "SPEECH",
        delivery: isDeliveryId(l.delivery) ? (l.delivery as DeliveryId) : null,
        state: typeof l.state === "string" ? l.state.trim().slice(0, MAX_STATE) || null : null,
        arcBatch: typeof l.arcBatch === "string" ? l.arcBatch.trim().slice(0, MAX_ARC_BATCH) || null : null,
      }))
      .filter((l) => l.text.length > 0)
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

export function serializeDialogue(lines: DialogueLine[]): string {
  return JSON.stringify(
    lines
      .map((l) => ({
        speaker: l.speaker.slice(0, 60),
        text: l.text.slice(0, MAX_TEXT),
        kind: VALID_KINDS.has(l.kind) ? l.kind : "SPEECH",
        ...(isDeliveryId(l.delivery) ? { delivery: l.delivery } : {}),
        ...(l.state ? { state: l.state.trim().slice(0, MAX_STATE) } : {}),
        ...(l.arcBatch ? { arcBatch: l.arcBatch.trim().slice(0, MAX_ARC_BATCH) } : {}),
      }))
      .filter((l) => l.text.trim().length > 0)
      .slice(0, MAX_LINES)
  );
}

/**
 * State arc: stamp a state override onto ONE speaker's lines from
 * fromIndex onward (a beat that lasts, e.g. possessed from the moment
 * she draws the blade until the scene ends). A line is stamped only
 * when it actually changes, so re-running the same arc is a no-op and
 * the returned count reflects real edits. state null clears overrides.
 * A changed line drops any ensemble batch tag (a new direction
 * replaces the old parallel beat). Returns [newLines, stampedCount];
 * the caller persists newLines.
 */
export function stampStateArc(
  lines: DialogueLine[],
  speaker: string,
  fromIndex: number,
  state: string | null,
): [DialogueLine[], number] {
  const want = speaker.trim().toLowerCase();
  let stamped = 0;
  const next = lines.map((l, i) => {
    if (i < fromIndex) return l;
    if (!l.speaker || l.speaker.trim().toLowerCase() !== want) return l;
    if ((l.state ?? null) === (state ?? null)) return l;
    stamped += 1;
    return { ...l, state, arcBatch: null };
  });
  return [next, stamped];
}

/**
 * Match a VOICE cue's "Speaker: text" label back to its dialogue line.
 * Returns the line's per-line fields (delivery register and state
 * override), or nulls when the line is state-aware (or unmatched).
 */
function dialogueLineForCue(
  dialogueRaw: string | null | undefined,
  cueLabel: string,
): DialogueLine | null {
  if (!cueLabel.includes(": ")) return null;
  const sep = cueLabel.indexOf(": ");
  const speaker = cueLabel.slice(0, sep).trim().toLowerCase();
  const text = cueLabel.slice(sep + 2).trim().toLowerCase();
  if (!text) return null;
  for (const line of parseDialogue(dialogueRaw)) {
    if (line.text.trim().toLowerCase() !== text) continue;
    if (speaker && line.speaker && line.speaker.trim().toLowerCase() !== speaker) continue;
    return line;
  }
  return null;
}

/**
 * Line-level delivery for a VOICE cue: that line's explicit register,
 * or null when the line is state-aware (or unmatched).
 */
export function dialogueDeliveryForCue(
  dialogueRaw: string | null | undefined,
  cueLabel: string,
): DeliveryId | null {
  const line = dialogueLineForCue(dialogueRaw, cueLabel);
  return line && isDeliveryId(line.delivery) ? line.delivery : null;
}

/**
 * Line-level state override for a VOICE cue: the state label the line
 * forces, or null when the line resolves its state automatically
 * (or is unmatched).
 */
export function dialogueStateForCue(
  dialogueRaw: string | null | undefined,
  cueLabel: string,
): string | null {
  return dialogueLineForCue(dialogueRaw, cueLabel)?.state ?? null;
}

export interface BubbleSpot {
  top: string;
  left: string; // logical position before RTL mirroring
  tail: "bl" | "br" | "none";
}

// Logical zones, top-heavy so bubbles never collide with the bottom narration
// caption - even in short panels (~112px). Caption zone = bottom ~25%.
const SPOT_POOL: BubbleSpot[] = [
  { top: "8%", left: "6%", tail: "bl" },
  { top: "30%", left: "44%", tail: "br" },
  { top: "46%", left: "6%", tail: "bl" },
  { top: "44%", left: "58%", tail: "none" },
];

export function bubbleSpots(count: number): BubbleSpot[] {
  return SPOT_POOL.slice(0, Math.min(count, SPOT_POOL.length));
}
