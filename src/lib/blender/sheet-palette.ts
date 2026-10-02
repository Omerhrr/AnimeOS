/**
 * sheet-palette - THE SHEET DRESSES THE RENDER (iteration 66).
 *
 * The canonical model sheet is what identity is SCORED against, yet it
 * never told the 3D render path how the character is actually COLORED -
 * the figure wore the regex-compiled DNA guesses and the render scored
 * ~25% against the very sheet it ignored. This module closes the loop
 * from the other side: the sheet's own pixels are MEASURED (a
 * deterministic quantized-palette read, the same bytes always land the
 * same colors) and its dominant clusters grade the figure's
 * robe/accent/hair/boots base colors with a bounded, hue-preserving
 * blend before a single frame renders.
 *
 * Laws of the module:
 *  - deterministic: a given sheet lands the same palette, a given plan
 *    lands the same rows (no randomness, no timestamps);
 *  - bounded: the conformance BLEND never fully repaints a material -
 *    the DNA's character survives and the sheet's truth pulls it;
 *  - honest: a color already true to the sheet is skipped and named,
 *    a missing sheet is absent (never silently applied).
 */

import sharp from "sharp";

export interface SheetConformanceRow {
  role: string;
  mat: string;
  from: string;
  to: string;
  delta: number;
  skipped?: string;
}

export interface SheetConformance {
  characterName: string;
  palette: string[];
  rows: SheetConformanceRow[];
  note: string;
}

/** the worker's boots default (build_designed_figure's own constant) */
export const BOOTS_DEFAULT = "#241a12";

/** role -> the material name the worker builds/can override by name */
const ROLE_MATS: Array<{ role: string; mat: string }> = [
  { role: "robe", mat: "RobeMat" },
  { role: "accent", mat: "AccentMat" },
  { role: "hair", mat: "HairMat" },
  { role: "boots", mat: "BootsMat" },
];

const QUANT_SHIFT = 4; // 16 levels per channel - coarse but stable
const MIN_SHARE = 0.02; // a cluster must own >= 2% of the sheet
const MIN_SEPARATION = 0.075; // normalized city-block distance between kept clusters
const CONFORM_FACTOR = 0.35; // the sheet pulls, it does not repaint
const SKIP_BELOW = 0.1; // already true to the sheet
// THE PULL NEVER CROSSES THE VALUE CLASS (iteration 115): the palette
// pull refines HUE and CHROMA toward the sheet's clusters - it must
// never re-dye a color's VALUE, and it must refuse when the palette
// cannot see the dye's class at all. The evidence: Lin Yue's sheet
// palette measured all-pale/teal clusters (the extractor's 4 dominant
// buckets missed the dark hair region entirely), so the near-black
// hair dye (#0d0d0d) found its "nearest" cluster at mid-teal
// (#678a89) and the 0.75 sheet-DNA blend landed ~#516b6a - the
// closeup's hair rendered PALE TEAL and every hair cell of the 115
// re-scores read 0-10% against a black-haired sheet. A capped blend
// still injects the wrong HUE (the third burn's muted slate-teal);
// the honest law is a REFUSAL: when the nearest cluster sits outside
// the dye's value class (|Δlum| > the cap), the palette cannot see
// this dye - the sheet DNA's own measured read stands un-pulled.
export const PULL_LUM_CAP = 0.15;

/** relative luminance (the Rec.601 the cel tree itself uses) */
export function relLum(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6) || "000000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");
}

export function hexDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)) / (3 * 255);
}

export function blendHex(from: string, to: string, factor: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(r1 + (r2 - r1) * factor, g1 + (g2 - g1) * factor, b1 + (b2 - b1) * factor);
}

/**
 * MEASURE the sheet: quantize to 16 levels per channel, count the
 * buckets, and keep the dominant clusters (>= 2% share) that stand at
 * least MIN_SEPARATION RGB apart - the sheet's real wardrobe palette.
 */
export async function extractSheetPalette(png: Buffer, max = 5): Promise<string[]> {
  const { data, info } = await sharp(png)
    .resize(48, 48, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const total = info.width * info.height;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < total; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const key = ((r >> QUANT_SHIFT) << 8) | ((g >> QUANT_SHIFT) << 4) | (b >> QUANT_SHIFT);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  }
  const sorted = [...buckets.values()]
    .map((v) => ({ n: v.n, hex: rgbToHex(v.r / v.n, v.g / v.n, v.b / v.n) }))
    .sort((a, b) => b.n - a.n);
  const picked: string[] = [];
  for (const cand of sorted) {
    if (picked.length >= max) break;
    if (cand.n / total < MIN_SHARE) break;
    if (picked.some((p) => hexDist(p, cand.hex) < MIN_SEPARATION)) continue;
    picked.push(cand.hex);
  }
  return picked;
}

/**
 * PLAN the conformance: every graded role finds its nearest sheet
 * cluster; a color already true to the sheet (distance < SKIP_BELOW)
 * is skipped and named; the rest blend CONFORM_FACTOR toward the
 * cluster - the sheet's truth, bounded so the design survives.
 */
export function planSheetConformance(
  colors: { robe?: string; accent?: string; hair?: string; boots?: string },
  palette: string[],
  factor = CONFORM_FACTOR,
  skipBelow = SKIP_BELOW,
): SheetConformanceRow[] {
  const rows: SheetConformanceRow[] = [];
  if (!palette.length) {
    for (const { role, mat } of ROLE_MATS) {
      const from = colors[role as keyof typeof colors];
      if (from) rows.push({ role, mat, from, to: from, delta: 0, skipped: "the sheet named no usable palette" });
    }
    return rows;
  }
  for (const { role, mat } of ROLE_MATS) {
    const from = colors[role as keyof typeof colors];
    if (!from) continue;
    let nearest = palette[0];
    for (const p of palette) {
      if (hexDist(from, p) < hexDist(from, nearest)) nearest = p;
    }
    const d = hexDist(from, nearest);
    if (d < skipBelow) {
      rows.push({ role, mat, from, to: from, delta: d, skipped: "already true to the sheet" });
      continue;
    }
    let to = blendHex(from, nearest, factor);
    // THE VALUE GUARD: a nearest cluster outside the dye's value class
    // means the palette never saw this dye (the extractor missed the
    // region) - the pull refuses and the measured DNA read stands.
    if (Math.abs(relLum(nearest) - relLum(from)) > PULL_LUM_CAP) {
      rows.push({ role, mat, from, to: from, delta: d, skipped: "value guard: no sheet cluster shares the dye's value class - the measured DNA read stands" });
      continue;
    }
    rows.push({ role, mat, from, to, delta: hexDist(from, to) });
  }
  return rows;
}
