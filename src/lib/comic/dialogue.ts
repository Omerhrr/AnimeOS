// ─────────────────────────────────────────────────────────────
// Speech bubble / dialogue model for Comic Mode panels
// ─────────────────────────────────────────────────────────────

export type BubbleKind = "SPEECH" | "THOUGHT" | "SFX";

export interface DialogueLine {
  speaker: string;
  text: string;
  kind: BubbleKind;
}

export const BUBBLE_KINDS: Array<{ id: BubbleKind; label: string; hint: string }> = [
  { id: "SPEECH", label: "Speech", hint: "Solid bubble with a tail" },
  { id: "THOUGHT", label: "Thought", hint: "Cloudy bubble with drifting dots" },
  { id: "SFX", label: "SFX", hint: "Stylized sound-effect text" },
];

const VALID_KINDS = new Set<BubbleKind>(["SPEECH", "THOUGHT", "SFX"]);
const MAX_LINES = 8;
const MAX_TEXT = 300;

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
      }))
      .filter((l) => l.text.trim().length > 0)
      .slice(0, MAX_LINES)
  );
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
