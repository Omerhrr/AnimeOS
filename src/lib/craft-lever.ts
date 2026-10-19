// ─────────────────────────────────────────────────────────────
// THE CRAFT LEVER, ROUTED (iteration 236) - the next night's craft
// pull is aimed, not blind.
//
// The 235 rides answered the named cells twice and the wall did not
// move: S002's fresh pixels re-scored 38% -> 25% WORSE (the
// med/traveling/shadow cell), S004's 55% -> 55% UNCHANGED (the
// wide/yawing/storm cell) - two honest builds, two honest reads, and
// the acceptance stood down honest BOTH times (the builds wear the
// design's class; the reference does not move). The carry line names
// the only lever left: "the craft lever for a score is the craft,
// never a moved goalpost". What stood between that sentence and the
// machinery: the lever never named WHICH CRAFT the next night pulls
// - the pass re-rendered the cells blind, and the judge scored the
// same craft twice.
//
// THE LAW, in three moves:
//
//   (a) THE CELL'S OWN FRAMING NAMES THE RUNG. The matrix already
//       reads it (the close list is "the same shots the audience
//       reads the face on"): at close/med framings the judge reads
//       the BUILD'S FACE - the face craft's own answer is the lever
//       (the face rung the payload already carries: the sheet DNA's
//       face profile, the r3 statement's dials); at wide framings
//       the judge reads the PAINT - the toon look's own language at
//       the wide-end framings is the lever (the 139 frontier's own
//       named sentence).
//
//   (b) THE PROPORTION RUNG IS REFUSED. probe-140's own verdict:
//       the dials sit at their clamp floors (0.85 head, 0.70 eyes),
//       the eye's own read says the face reads MATURE, and the
//       accusation did not move - the proportion lever is spent. A
//       lever line never names the spent rung; the face line carries
//       the refusal beside it, so the next night cannot reach for
//       the spent dial twice.
//
//   (c) THE LEVER SPEAKS ONLY UNDER THE HONEST RECEIPT. The carry's
//       verdict is the precondition: STAND_DOWN_HONEST - the craft
//       is the lever (the reference does not move); REGEN_OWED - the
//       cell owes the reference work first, the lever waits; NONE -
//       the acceptance waits for its own night. A lever aimed
//       without the honest receipt is a moved goalpost wearing the
//       craft's name.
//
// PURE: no db, no fs - the framing and the carry arrive as the
// arguments (the caller gathered them from the live shots and the
// carried verdicts). The smoke pins the exact words; the plan rides
// them on every call.
// ─────────────────────────────────────────────────────────────

import type { CarriedVerdict } from "./acceptance-carry";

export const CRAFT_LEVER_LAW_VERSION = 236;

/** The rung the next night pulls (the proportion rung is refused,
 *  never named). */
export type CraftRung = "face" | "paint";

export interface CraftLever {
  ref: string;
  framing: "close" | "med" | "wide";
  rung: CraftRung;
  /** The lever's own line (exact words - the smoke pins them). */
  line: string;
}

export type CraftLeverAnswer =
  | { ok: true; lever: CraftLever }
  | { ok: false; line: string };

/** The carry's own sentence (the 149 law's, verbatim - the lever
 *  speaks under it, never instead of it). */
export const CRAFT_LEVER_SENTENCE =
  "the craft lever for a score is the craft, never a moved goalpost";

/** The spent rung's refusal (probe-140's own verdict). */
export const PROPORTION_REFUSAL = "the proportion lever is spent (probe-140's own verdict)";

/**
 * THE CRAFT LEVER (pure): the cell's framing names the rung, the
 * carry's verdict arms it. Unknown framings ride an honest refusal -
 * named, never guessed.
 */
export function craftLeverForCell(args: {
  ref: string;
  framing: "close" | "med" | "wide";
  carry: CarriedVerdict;
}): CraftLeverAnswer {
  if (args.carry === "REGEN_OWED") {
    return {
      ok: false,
      line: `${args.ref}: the cell owes the reference work first (the sheet acceptance answered REGEN_OWED) - the craft lever waits for the reference it must honor.`,
    };
  }
  if (args.carry !== "STAND_DOWN_HONEST") {
    return {
      ok: false,
      line: `${args.ref}: the acceptance waits for its own night - the lever speaks only under the honest receipt (${CRAFT_LEVER_SENTENCE}).`,
    };
  }
  if (args.framing === "wide") {
    return {
      ok: true,
      lever: {
        ref: args.ref,
        framing: args.framing,
        rung: "paint",
        line: `${args.ref}: the judge reads the paint at this framing - the toon look's own language at the wide-end framing is the lever.`,
      },
    };
  }
  return {
    ok: true,
    lever: {
      ref: args.ref,
      framing: args.framing,
      rung: "face",
      line: `${args.ref}: the judge reads the build's face at this framing - the face craft's own answer is the lever; ${PROPORTION_REFUSAL}.`,
    },
  };
}
