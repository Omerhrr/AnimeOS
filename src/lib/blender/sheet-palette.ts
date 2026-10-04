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
  anchored?: string;
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

// THE DESIGN DYE IS THE ANCHOR (iteration 128): the 127 night's
// frontier named the conformance's own dye - the sheet reader measured
// #9bbcb3 off the sheet's own render while the committed design says
// #2f6d63, and the conformance built the sheet's mistake into the
// cast. The sheet is a DEPICTION of the design; when its pixels
// contradict the committed design dye's VALUE CLASS, the depiction is
// the drifted artifact and the design's dye leads: the riding dye
// pulls back toward the committed design (the adherent factor - the
// same bound "close the remaining drift" always used), the row is
// named, and the drifted sheet's palette cannot refine what it
// mis-depicts. A sheet read inside the design's value class is an
// honest depiction and the standing law (skip + the value-guarded
// pull) keeps the sheet as color law, untouched.
export const DESIGN_ANCHOR_FACTOR = 0.75;

// THE DYE'S HUE CLASS (iteration 130): the 115 value class reads VALUE
// only - and the 129 night caught the blind spot red-handed. Lin's
// re-anchored sheet painted the robe BLUE (#285578) under a dye clause
// that said 'deep jade-teal #2f6d63': the value classes matched (dLum
// 0.067), so the sheet acceptance passed AND the honest-read anchor
// stood down - the build carried the blue into every wide framing and
// the judge named it ('palette uses blue instead of the canonical
// teal/green', S002 palette 70 -> 20). A dye's class is VALUE and HUE:
// the hue reads on the HSV color circle, gated by a chroma floor - the
// weak-hued dyes (greys, slates, near-blacks) have no hue to judge and
// the value class stands alone for them, exactly as the 115/116 laws
// left them.
export const DESIGN_HUE_BAND = 0.08; // a fraction of the color circle (~29 degrees)
export const HUE_CHROMA_FLOOR = 0.25; // HSV saturation below which hue is noise

/** hue on the HSV color circle in degrees [0, 360); 0 when achromatic */
export function hueOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

/** HSV saturation - the dye's chroma strength (the hue judge's gate) */
export function satOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** distance on the color circle as a fraction of it: [0, 0.5] */
export function hueDist(a: string, b: string): number {
  const d = Math.abs(hueOf(a) - hueOf(b)) / 360;
  return Math.min(d, 1 - d);
}

export interface DyeClassRead {
  out: boolean; // the drift verdict the anchor acts on
  valueOut: boolean; // outside the design's value class (the 115 measure)
  hueOut: boolean; // outside the design's hue family (the 130 measure)
  dLum: number; // the measured value step
  dHue: number | null; // the measured hue step (null when hue is not judged)
  judgedHue: boolean; // both dyes carry enough chroma for a hue reading
}

/**
 * THE DYE'S CLASS (iteration 130) - the shared drift measure: a riding
 * dye is OUT of its committed design dye's class when the value step
 * crosses the 115 cap OR the hue family drifts past the 130 band (the
 * hue judged only where both dyes carry real chroma - below the floor
 * the hue is noise and the value class stands alone). The render path
 * and the sheet acceptance both read this one measure, so a sheet the
 * acceptance refuses is exactly a sheet the anchor would rescue.
 */
export function designDyeClass(from: string, designDye: string): DyeClassRead {
  const dLum = Math.abs(relLum(from) - relLum(designDye));
  const valueOut = Math.abs(relLum(from) - relLum(designDye)) > PULL_LUM_CAP;
  const judgedHue = satOf(from) >= HUE_CHROMA_FLOOR && satOf(designDye) >= HUE_CHROMA_FLOOR;
  const dHue = judgedHue ? hueDist(from, designDye) : null;
  const hueOut = dHue !== null && dHue > DESIGN_HUE_BAND;
  return { out: valueOut || hueOut, valueOut, hueOut, dLum, dHue, judgedHue };
}

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

// THE SKIP EARNS ITS SKIP (iteration 116): "already true to the sheet"
// must never forgive a VALUE drift. The evidence: Wei's robe DNA
// (#5b7d7e, mid-teal) stood 0.090 from the sheet's own dark-teal
// cluster (#476565) - inside SKIP_BELOW, so the pull skipped as
// "already true" - but the distance WAS a value step (dLum 0.091)
// and the storm wash read the robe pale; the re-score's worst cell
// named it (wardrobe 10%: "lacks his specific dark teal color").
// The skip now holds only when the nearest cluster also shares the
// dye's value closely; a near distance that is mostly value drift
// falls through to the (value-guarded) pull.
export const SKIP_LUM_CAP = 0.05;

// THE EXTRACTOR SEES THE DARK (iteration 116): the dominant-bucket
// census is a brightness lie - a model sheet's paper and skin own the
// pixel count, so the dark region (the hair, the boots, the
// antagonist's wardrobe) never reaches MIN_SHARE and the palette
// measures blind to it (Lin Yue's black hair measured all-pale/teal
// through 115; the value guard could only refuse, never refine). The
// stratified pass: every value class that owns a real share of the
// sheet contributes its own dominant cluster - the dark class's
// census is the point. Deterministic: class bounds are fixed, the
// within-class winner is the largest bucket, at most two join.
const VALUE_CLASSES: Array<{ name: string; lo: number; hi: number }> = [
  { name: "dark", lo: 0.0, hi: 0.28 },
  { name: "mid", lo: 0.28, hi: 0.62 },
  { name: "bright", lo: 0.62, hi: 1.01 },
];
const CLASS_MIN_SHEET_SHARE = 0.05; // the class must be a real region of the sheet
const CLASS_MIN_CLASS_SHARE = 0.12; // ...and the cluster a real part of its class
const STRATIFIED_MAX = 2; // the dominant census stays the palette's spine

/** relative luminance from raw channels (the Rec.601 the cel tree uses) */
function lumOf(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

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
  // the stratified census rides the same walk: per-pixel value class,
  // per-class bucket tally (class -> bucket key -> summed pixels)
  const classTotals = VALUE_CLASSES.map(() => 0);
  const classBuckets: Array<Map<number, { n: number; r: number; g: number; b: number }>> = VALUE_CLASSES.map(() => new Map());
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
    const lum = lumOf(r, g, b);
    for (let ci = 0; ci < VALUE_CLASSES.length; ci++) {
      const cls = VALUE_CLASSES[ci];
      if (lum >= cls.lo && lum < cls.hi) {
        classTotals[ci] += 1;
        const cb = classBuckets[ci].get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        cb.n += 1;
        cb.r += r;
        cb.g += g;
        cb.b += b;
        classBuckets[ci].set(key, cb);
        break;
      }
    }
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
  // THE STRATIFIED PASS (iteration 116): the classes the dominance
  // missed earn their cluster - dark first (the law's point), the
  // winner is the class's own dominant bucket, held to the same
  // separation discipline as the dominant census.
  let stratified = 0;
  for (let ci = 0; ci < VALUE_CLASSES.length && stratified < STRATIFIED_MAX; ci++) {
    const share = total > 0 ? classTotals[ci] / total : 0;
    if (share < CLASS_MIN_SHEET_SHARE) continue;
    let best: { n: number; hex: string } | null = null;
    for (const v of classBuckets[ci].values()) {
      if (v.n / Math.max(1, classTotals[ci]) < CLASS_MIN_CLASS_SHARE) continue;
      const hex = rgbToHex(v.r / v.n, v.g / v.n, v.b / v.n);
      if (picked.some((p) => hexDist(p, hex) < MIN_SEPARATION)) continue;
      if (best === null || v.n > best.n) best = { n: v.n, hex };
    }
    if (best !== null) {
      picked.push(best.hex);
      stratified += 1;
    }
  }
  return picked;
}

/**
 * PLAN the conformance: every graded role finds its nearest sheet
 * cluster; a color already true to the sheet (distance < SKIP_BELOW)
 * is skipped and named; the rest blend CONFORM_FACTOR toward the
 * cluster - the sheet's truth, bounded so the design survives.
 * `design` (iteration 128) carries the committed design dyes: a
 * riding dye outside its design dye's class is the sheet's own
 * render drift - the design anchors the row and names it. The class
 * is VALUE and HUE (iteration 130): the shared designDyeClass measure
 * judges the 115 value step and the 130 hue family together.
 */
export function planSheetConformance(
  colors: { robe?: string; accent?: string; hair?: string; boots?: string },
  palette: string[],
  factor = CONFORM_FACTOR,
  skipBelow = SKIP_BELOW,
  design?: { robe?: string; accent?: string; hair?: string; boots?: string },
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
    // THE DESIGN DYE IS THE ANCHOR (iteration 128): a riding dye that
    // sits outside the committed design dye's class is the sheet's own
    // render drift - the design's dye leads and the sheet's palette
    // (measured off the same drifted pixels) stands down for this role.
    // The class is VALUE and HUE (iteration 130) - the shared measure.
    const designDye = design?.[role as keyof typeof design];
    const dyeClass = designDye && designDye.startsWith("#") ? designDyeClass(from, designDye) : null;
    if (dyeClass?.out && designDye) {
      const to = blendHex(from, designDye, DESIGN_ANCHOR_FACTOR);
      const classes = dyeClass.valueOut && dyeClass.hueOut
        ? "the value and hue classes"
        : dyeClass.hueOut
          ? "the hue class"
          : "the value class";
      rows.push({
        role,
        mat,
        from,
        to,
        delta: hexDist(from, to),
        anchored: `design anchor: the sheet's own render reads ${from} but the committed design says ${designDye} - the design's dye leads (${classes})`,
      });
      continue;
    }
    let nearest = palette[0];
    for (const p of palette) {
      if (hexDist(from, p) < hexDist(from, nearest)) nearest = p;
    }
    const d = hexDist(from, nearest);
    if (d < skipBelow) {
      // THE SKIP EARNS ITS SKIP (iteration 116): the skip holds only
      // when the nearest cluster shares the dye's value closely - a
      // near distance that is mostly value drift is not "already
      // true", it is the sheet one value step away, and the pull
      // proceeds (guarded by the value class below).
      if (Math.abs(relLum(nearest) - relLum(from)) <= SKIP_LUM_CAP) {
        rows.push({ role, mat, from, to: from, delta: d, skipped: "already true to the sheet" });
        continue;
      }
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
