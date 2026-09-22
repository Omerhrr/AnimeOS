// ─────────────────────────────────────────────────────────────
// Reusable arc templates: named beat SHAPES painted onto one
// speaker's lines across a range of shots. A template is a
// sequence of segments ("auto" = clear the override, "state" =
// force the chosen state) sized as fractions of the speaker's own
// lines in the WHOLE range, so the same shape stretches over a
// 2-line beat or a 20-line montage and paints ONE arc across the
// range, not a repeated mini-arc per shot. The template carries
// the shape; the caller supplies WHICH state drives the "state"
// segments (matched against the speaker's real development states
// at apply time, exactly like set_state_arc). Pure layer: the
// voice chain still resolves overrides per line.
// ─────────────────────────────────────────────────────────────

import type { DialogueLine } from "@/lib/comic/dialogue";

export interface ArcTemplateSegment {
  /** Share of the speaker's lines in the range (fractions across segments sum to 1). */
  frac: number;
  /** "auto" clears the override; "state" forces the caller's chosen state. */
  kind: "auto" | "state";
}

export interface ArcTemplate {
  id: string;
  name: string;
  description: string;
  segments: ArcTemplateSegment[];
}

export const ARC_TEMPLATES: ArcTemplate[] = [
  {
    id: "possession-spread",
    name: "possession spread",
    description: "The classic possession beat: normal lines settle the scene, the state takes over the middle, then releases. auto 25% -> state 50% -> auto 25%.",
    segments: [
      { frac: 0.25, kind: "auto" },
      { frac: 0.5, kind: "state" },
      { frac: 0.25, kind: "auto" },
    ],
  },
  {
    id: "full-takeover",
    name: "full takeover",
    description: "Brief normal bookends around a dominant state run: the possession (or corruption) owns the whole beat. auto 15% -> state 70% -> auto 15%.",
    segments: [
      { frac: 0.15, kind: "auto" },
      { frac: 0.7, kind: "state" },
      { frac: 0.15, kind: "auto" },
    ],
  },
  {
    id: "recovery-arc",
    name: "recovery arc",
    description: "Open inside the state and shake it off: the first lines still perform possessed (or injured), the rest return to normal. state 60% -> auto 40%.",
    segments: [
      { frac: 0.6, kind: "state" },
      { frac: 0.4, kind: "auto" },
    ],
  },
];

export function arcTemplateByName(nameOrId: string): ArcTemplate | null {
  const key = nameOrId.trim().toLowerCase();
  if (!key) return null;
  return (
    ARC_TEMPLATES.find((t) => t.id === key || t.name.toLowerCase() === key) ??
    ARC_TEMPLATES.find((t) => t.name.toLowerCase().includes(key) || key.includes(t.name.toLowerCase())) ??
    null
  );
}

/**
 * Largest-remainder allocation: split n lines across segments by
 * fraction, keep the segment order, guarantee the counts sum to
 * exactly n. Ties go to the wider fraction, then the earlier
 * segment, so short beats lean on their dominant segment first.
 */
export function planTemplateCounts(n: number, segments: ArcTemplateSegment[]): number[] {
  if (n <= 0 || segments.length === 0) return segments.map(() => 0);
  const total = segments.reduce((acc, s) => acc + s.frac, 0) || 1;
  const raw = segments.map((s) => (s.frac / total) * n);
  const counts = raw.map((r) => Math.floor(r));
  let rest = n - counts.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % byRemainder.length, rest -= 1) {
    counts[byRemainder[k].i] += 1;
  }
  return counts;
}

/** The "auto" | "state" plan for each of the speaker's lines, in range order. */
export function planTemplateAssignment(speakerLineCount: number, template: ArcTemplate): Array<"auto" | "state"> {
  const counts = planTemplateCounts(speakerLineCount, template.segments);
  const plan: Array<"auto" | "state"> = [];
  template.segments.forEach((seg, i) => {
    for (let k = 0; k < counts[i]; k += 1) plan.push(seg.kind);
  });
  return plan;
}

export interface TemplateSegmentReport {
  kind: "auto" | "state";
  /** speaker lines this segment covered */
  lines: number;
  /** lines that actually changed */
  stamped: number;
}

export interface TemplateShotInput {
  shotId: string;
  /** parsed dialogue lines of this shot (range order preserved by the caller) */
  lines: DialogueLine[];
}

export interface TemplateShotResult {
  shotId: string;
  lines: DialogueLine[];
  /** true when at least one line changed and the shot needs persisting */
  changed: boolean;
}

/**
 * Paint a template shape onto ONE speaker's lines across a RANGE of
 * shots: the speaker's lines are collected in range order, split by
 * the template's segment fractions, then each line is stamped with
 * the chosen state ("state" segments) or cleared ("auto" segments).
 * The shape spans the WHOLE range, so one possession arc stretches
 * across the beat instead of repeating per shot. A line is written
 * only when its override actually changes, so re-running the same
 * template is a no-op. Returns [perShotResults, stampedCount,
 * perSegmentReport]; persist every result where changed is true.
 */
export function applyArcTemplate(
  shots: TemplateShotInput[],
  speaker: string,
  template: ArcTemplate,
  state: string | null,
): [TemplateShotResult[], number, TemplateSegmentReport[]] {
  const want = speaker.trim().toLowerCase();
  // the speaker's line positions across the range, in order
  const positions: Array<{ shot: number; line: number }> = [];
  shots.forEach((sh, si) => {
    sh.lines.forEach((l, li) => {
      if (l.speaker && l.speaker.trim().toLowerCase() === want) positions.push({ shot: si, line: li });
    });
  });

  const counts = planTemplateCounts(positions.length, template.segments);
  const segOfLine: number[] = [];
  counts.forEach((c, i) => {
    for (let k = 0; k < c; k += 1) segOfLine.push(i);
  });

  const next = shots.map((sh) => ({ shotId: sh.shotId, lines: [...sh.lines], changed: false }));
  const report: TemplateSegmentReport[] = template.segments.map((seg) => ({ kind: seg.kind, lines: 0, stamped: 0 }));
  let stamped = 0;

  positions.forEach((pos, k) => {
    const segIdx = segOfLine[k] ?? 0;
    const segState = template.segments[segIdx].kind === "state" ? state : null;
    const target = next[pos.shot].lines[pos.line];
    if ((target.state ?? null) !== segState) {
      next[pos.shot].lines[pos.line] = { ...target, state: segState };
      next[pos.shot].changed = true;
      stamped += 1;
      report[segIdx].stamped += 1;
    }
    report[segIdx].lines += 1;
  });

  return [next, stamped, report];
}

/** Human summary of a segment report: `auto x1 (1 stamped), "state" x2 (2 stamped)`. */
export function formatTemplateReport(report: TemplateSegmentReport[], stateLabel: string | null): string {
  return report
    .map((r) =>
      r.kind === "state"
        ? `"${stateLabel ?? "state"}" x${r.lines} (${r.stamped} stamped)`
        : `auto x${r.lines} (${r.stamped} stamped)`,
    )
    .join(", ");
}
