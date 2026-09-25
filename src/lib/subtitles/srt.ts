// ─────────────────────────────────────────────────────────────
// SRT PARSER / SERIALIZER (isomorphic - client and server safe)
//
// Pure string/date math only. The translation engine (server) and
// the subtitles view (client) share this module so a pasted SRT and
// a downloaded SRT round-trip through the exact same shape.
// ─────────────────────────────────────────────────────────────

export interface SrtCue {
  index: number; // 1-based position in the document
  startMs: number;
  endMs: number;
  text: string;
}

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toMs(h: string, m: string, s: string, ms: string): number {
  return (
    Number(h) * 3600000 +
    Number(m) * 60000 +
    Number(s) * 1000 +
    Number(ms.padEnd(3, "0"))
  );
}

// Tolerant parser: accepts \r\n and \n, BOM, missing/odd indices,
// blank-line separators (or missing ones around malformed blocks).
// Cues that fail to parse a timecode are skipped and reported.
export function parseSrt(raw: string): { cues: SrtCue[]; skipped: number } {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return { cues: [], skipped: 0 };

  const blocks = text.split(/\n{2,}/);
  const cues: SrtCue[] = [];
  let skipped = 0;
  let autoIndex = 1;

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    const timeLine = lines.find((l) => TIME_RE.test(l));
    if (!timeLine) {
      skipped += 1;
      continue;
    }
    const match = TIME_RE.exec(timeLine);
    if (!match) {
      skipped += 1;
      continue;
    }
    const startMs = toMs(match[1], match[2], match[3], match[4]);
    const endMs = toMs(match[5], match[6], match[7], match[8]);
    const bodyLines = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l.trim()));
    if (bodyLines.length === 0 || endMs <= startMs) {
      skipped += 1;
      continue;
    }
    cues.push({
      index: autoIndex++,
      startMs,
      endMs,
      text: bodyLines.join("\n").trim(),
    });
  }

  return { cues, skipped };
}

function pad(n: number, width: number): string {
  return String(Math.max(0, n)).padStart(width, "0");
}

export function srtTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(total / 3600000), 2)}:${pad(Math.floor((total % 3600000) / 60000), 2)}:${pad(Math.floor((total % 60000) / 1000), 2)},${pad(total % 1000, 3)}`;
}

export function serializeSrt(cues: SrtCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${srtTimestamp(c.startMs)} --> ${srtTimestamp(c.endMs)}\n${c.text.trim()}`)
    .join("\n\n")
    .concat(cues.length > 0 ? "\n" : "");
}

// Subtitles translations can run long; a per-cue length guard used
// by the engine's honesty note (not a hard block).
export function longestLine(text: string): number {
  return text.split("\n").reduce((max, l) => Math.max(max, l.length), 0);
}
