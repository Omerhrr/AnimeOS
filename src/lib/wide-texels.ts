// ─────────────────────────────────────────────────────────────
// THE WIDE-END TEXEL ARITHMETIC (iteration 241) - the 133 smear
// zone's own answer at the small figure, grown as the craft law.
//
// The 236 craft-lever routed the wide framings to the PAINT rung
// ("the judge reads the paint there") - and the paint's own walls
// answered: the 238 dye law killed the hue the sheet never decided,
// the 239 mass law grew the falling mass the sheet decided. What
// REMAINED at the wide cell (E7 Sc12 S004) is the judge's own words
// the 240 remainder carries verbatim: "the face structure is heavily
// drifted to a rounder, more feminine shape with larger eyes"; hair:
// "the hair lacks the long flowing strands" - the STRUCTURE at the
// small figure, and the lever names its own answer: "the texels at
// the small figure - the 133 smear zone's own arithmetic at the wide
// end".
//
// THE ARITHMETIC, on the probes' own receipts (one law, two
// runtimes - the bridge's mirror):
//   • the head rides ~30px at the 640 preview rung - the convicted
//     smear (the 137 night's receipt, the 133 zone),
//   • the head rides ~48px at the 1024 wide rung - the 138 A/B's
//     own receipt: the face reads DRAWN (the iris, the brow bands,
//     the nose line, the mouth, the topknot pin),
//   • the face CROP's source rides 49x45 at 640 and 72x64 at 1024 -
//     the 164 verify arm's own receipt (2.09x the area, and the eye
//     reads the difference),
//   • at the 1280 final rung the arithmetic answers: 1.25x linear
//     over the wide rung - the head 60px, the crop's source 90x80
//     (1.5625x the area of the wide rung's). The structure the
//     judge reads at the wide end comes through the crops (the 157
//     scale law's own grammar), and the crops resolve what their
//     source carries - the source is the rung's texels.
//
// THE ANSWER: an aimed FACE cell at the wide-end framings rides the
// FINAL rung in preview (the 241 wide-end face rung - the small
// figure's own texels), beside the 237 face rung's close/med lift
// and the 138 wide rung's unaimed answer. The paint rung keeps its
// own walls where no lever names the texels.
//
// PURE: no db, no fs - the caps and the anchors are the law's own
// constants, mirrored from the bridge; the smoke pins the bytes.
// ─────────────────────────────────────────────────────────────

export const WIDE_TEXEL_LAW_VERSION = 241;

/** The resolution rung ladder (the bridge's own mirror). */
export const PREVIEW_CAP = 640;
export const WIDE_RUNG_CAP = 1024;
export const FINAL_CAP = 1280;

/** The probes' own receipts, as anchors: the WIDE head's px at the
 *  640 rung (the 137 receipt - the 133 smear zone) and at the 1024
 *  wide rung (the 138 A/B - the face reads drawn). */
export const WIDE_HEAD_PX_AT_PREVIEW = 30;
export const WIDE_HEAD_PX_AT_WIDE_RUNG = 48;

/** The 164 verify arm's own receipt: the face crop's source px at
 *  the 640 and the 1024 rungs. */
export const WIDE_CROP_SOURCE_AT_PREVIEW = { w: 49, h: 45 };
export const WIDE_CROP_SOURCE_AT_WIDE_RUNG = { w: 72, h: 64 };

/** The smear floor: the head px under which the 133 zone convicts
 *  the face (the 137 receipt's own 30px - the zone's named depth). */
export const SMEAR_HEAD_PX = 30;

/** One rung's texel read: the arithmetic off the anchors. */
export interface WideTexelRead {
  cap: number;
  /** The WIDE head's px at this rung (the linear answer off the
   *  anchors; the anchors themselves ride exact). */
  headPx: number;
  /** The face crop's source px at this rung (the linear answer off
   *  the receipts; the receipts' own rungs ride exact). */
  cropSource: { w: number; h: number };
  /** true when the head sits in the 133 smear zone at this rung. */
  inSmearZone: boolean;
  /** The read's own line (exact words - the smoke pins them). */
  line: string;
}

const ANCHOR_CAP = PREVIEW_CAP;

function headPxAt(cap: number): number {
  if (cap === PREVIEW_CAP) return WIDE_HEAD_PX_AT_PREVIEW;
  if (cap === WIDE_RUNG_CAP) return WIDE_HEAD_PX_AT_WIDE_RUNG;
  return Math.round((WIDE_HEAD_PX_AT_WIDE_RUNG * cap) / WIDE_RUNG_CAP);
}

function cropSourceAt(cap: number): { w: number; h: number } {
  if (cap === PREVIEW_CAP) return { ...WIDE_CROP_SOURCE_AT_PREVIEW };
  if (cap === WIDE_RUNG_CAP) return { ...WIDE_CROP_SOURCE_AT_WIDE_RUNG };
  const g = cap / WIDE_RUNG_CAP;
  return { w: Math.round(WIDE_CROP_SOURCE_AT_WIDE_RUNG.w * g), h: Math.round(WIDE_CROP_SOURCE_AT_WIDE_RUNG.h * g) };
}

/**
 * THE WIDE-END TEXEL READ (pure): the small figure's own texels at
 * a rung, on the probes' own anchors - the head's px, the crop's
 * source, the smear zone's own verdict, one line.
 */
export function wideTexelRead(args: { cap: number }): WideTexelRead {
  const cap = Math.max(16, Math.round(Number(args.cap) || PREVIEW_CAP));
  const headPx = headPxAt(cap);
  const cropSource = cropSourceAt(cap);
  const inSmearZone = headPx <= SMEAR_HEAD_PX;
  const area =
    cap === WIDE_RUNG_CAP
      ? null
      : Math.round(((cropSource.w * cropSource.h) / (WIDE_CROP_SOURCE_AT_WIDE_RUNG.w * WIDE_CROP_SOURCE_AT_WIDE_RUNG.h)) * 10000) / 10000;
  const anchorNote =
    cap === PREVIEW_CAP
      ? `the head rides ${headPx}px at the ${cap} preview rung - the 133 smear zone's own depth (the 137 receipt)`
      : cap === WIDE_RUNG_CAP
        ? `the head rides ${headPx}px at the ${cap} wide rung - the 138 A/B's own answer: the face reads drawn`
        : `the head rides ${headPx}px at the ${cap} rung (${(cap / WIDE_RUNG_CAP).toFixed(2)}x linear over the wide rung)`;
  const cropNote =
    cap === WIDE_RUNG_CAP
      ? `the crop's source rides ${cropSource.w}x${cropSource.h} (the 164 verify arm's receipt)`
      : `the crop's source rides ${cropSource.w}x${cropSource.h} (${area}x the wide rung's area)`;
  return {
    cap,
    headPx,
    cropSource,
    inSmearZone,
    line: `${anchorNote}; ${cropNote}; the structure rides the crops (the 157 scale law's own grammar) - the source is the rung's texels.`,
  };
}

/**
 * THE 241 WIDE-END FACE RUNG (pure): the cap an aimed FACE cell
 * rides. The wide-end framings answer the FINAL rung in preview -
 * the small figure's own texels; the close/med framings keep the
 * 237 face rung's own lift (the 1024); FINAL always renders FINAL.
 */
export function wideFaceRungCap(args: { framing: "close" | "med" | "wide"; mode?: "PREVIEW" | "FINAL" }): number {
  if (String(args.mode ?? "PREVIEW").toUpperCase() === "FINAL") return FINAL_CAP;
  return args.framing === "wide" ? FINAL_CAP : WIDE_RUNG_CAP;
}

/**
 * THE WIDE-END AIM LINE (pure): the plan's aim for a wide cell the
 * lever names - the judge's own words ride VERBATIM (the pure law
 * never paraphrases the judge) and the arithmetic answers beside
 * them. One line, exact words - the smoke pins the bytes.
 */
export function wideTexelAimLine(args: { ref: string; leverLine: string }): string {
  const read = wideTexelRead({ cap: wideFaceRungCap({ framing: "wide" }) });
  return `${args.ref}: the wide-end face rung answers the lever's own words - "${args.leverLine}" - ${read.line}`;
}
