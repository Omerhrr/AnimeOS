// ─────────────────────────────────────────────────────────────
// THE FEET STAY PLANTED (iteration 96): two-bone leg IK over the
// shot pose vocabulary.
//
// The readings named the frontier: the pose program drops the root
// (CROUCH -0.40, RISE -0.25, FALL -0.62) while the leg chain keeps
// the table's knee angles, so the boots sink through the ground
// plane exactly where the audience's eye measures the lie - the
// crouch/RISE pairs the state presets drive most (determined
// CROUCH->RISE, grieving STANCE->CROUCH) read feet-first into the
// floor.
//
// THE LAW: the pose table stays the INTENT (the choreography the
// director named); the IK corrects the penetration only. Per frame,
// with the EFFECTIVE thigh angle (table + walk swing) and the hip
// height (built rest height + rootY + bob):
//
//   footDrop(t, k) = L1*cos(t) + L2*cos(k - t)     (down-positive,
//        the bridge's own composition: hip rotates -t, knee +k)
//   penetration = footDrop - hipHeight             (>0 = below ground)
//
// A penetrating leg SOLVES closed-form (law of cosines) with the
// thigh read PRESERVED and the shin taking the FOLD branch - the
// solved knee is never below the table's angle (the IK folds, it
// never pops a crouch straight), clamped at KNEE_MAX. Whatever
// penetration survives the clamp (a synthetic deep pose, never the
// vocabulary - proven) the ROOT lifts: one root, the worse leg
// wins. A floating foot (the lunge's heel, the leap's tuck) is the
// pose's own read - named as clearance, never "fixed".
//
// Everything is pure and deterministic: the same pose row always
// solves the same knees, so retries are stable and the hash below
// is bit-exact across runtimes (mirrored in the worker's
// leg_ik_hash - one law, two runtimes).
// ─────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

import { POSES, POSE_JOINTS } from "@/lib/animation/poses";

export const LEG_IK_VERSION = 96;

/** Build-unit leg chain (both figures share the skeleton): the knee
 * empty sits at hip-local -0.46 and the boot sole at knee-local
 * -0.46, so the hip pivots 0.92 above its own rest sole. */
export const LEG_IK = {
  upper: 0.46,
  lower: 0.46,
  hipStand: 0.92,
  kneeMax: 130.0,
  propScale: 0.45,
} as const;

export interface LegIkSolution {
  /** The knee angle the rig wears (degrees; the table's own when no
   * penetration fired). */
  knee: number;
  /** Down-positive penetration of the sole below the ground plane
   * BEFORE the solve (build units, rounded 3). */
  pen: number;
  /** Penetration that survived the KNEE_MAX clamp (the root's lift
   * share; 0 whenever the solve planted). */
  residual: number;
  /** How far above the plane the sole rests when the solve never
   * fired (the pose's own float - the lunge heel, the leap tuck). */
  clearance: number;
  /** True when the solve fired (the knee moved). */
  solved: boolean;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const deg = Math.PI / 180;

/** Down-positive vertical distance from the hip pivot to the boot
 * sole under the bridge's own rotation composition (hip -t, knee +k
 * about the same axis): the shin's world angle is (k - t). */
export function footDrop(thighDeg: number, kneeDeg: number): number {
  return (
    LEG_IK.upper * Math.cos(thighDeg * deg) +
    LEG_IK.lower * Math.cos((kneeDeg - thighDeg) * deg)
  );
}

/** The two-bone solve for one leg: effective thigh angle (table +
 * walk swing, degrees), the table's knee, the hip's height inputs
 * (rootY + bob in build units). Fold-only, thigh read preserved. */
export function solveLegIk(rootY: number, thighDeg: number, kneeDeg: number, bob = 0): LegIkSolution {
  const hip = LEG_IK.hipStand + rootY + bob;
  const drop = footDrop(thighDeg, kneeDeg);
  const pen = round3(drop - hip);
  if (pen <= 0) {
    // The pose's own float: no solve, the clearance named honestly.
    return { knee: round3(kneeDeg), pen, residual: 0, clearance: pen === 0 ? 0 : round3(hip - drop), solved: false };
  }
  // The planted shin's world angle: cos(shin) = (hip - L1*cos t)/L2,
  // the FOLD branch (+acos -> knee = thigh + acos, never smaller
  // than the table's angle when the solve fired - provable: pen>0
  // implies cos(shin_table) > rhs implies |shin_table| > acos(rhs)).
  const rhs = clamp((hip - LEG_IK.upper * Math.cos(thighDeg * deg)) / LEG_IK.lower, -1, 1);
  const knee = round3(Math.min(LEG_IK.kneeMax, thighDeg + Math.acos(rhs) / deg));
  const residual = round3(Math.max(0, footDrop(thighDeg, knee) - hip));
  return { knee, pen, residual, clearance: 0, solved: true };
}

export interface LegIkPoseRow {
  kneeTableR: number;
  kneeSolvedR: number;
  kneeTableL: number;
  kneeSolvedL: number;
  /** The worse (deeper) sole's penetration before the solve (build
   * units) - the frontier the readings named, per pose. */
  penBefore: number;
  /** The deeper sole's penetration after (0 across the vocabulary -
   * the proof the law plants). */
  penAfter: number;
  /** The root lift the pose demanded (the worse leg's residual). */
  rootLift: number;
}

/** The law over the whole vocabulary: every pose solved at its own
 * end row (rootY + leg channels) - the canonical table the hash
 * covers and the evidence carries. */
export function legIkTable(): Record<string, LegIkPoseRow> {
  const out: Record<string, LegIkPoseRow> = {};
  for (const name of POSES) {
    const j = POSE_JOINTS[name];
    const r = solveLegIk(j.rootY, j.rLeg, j.rKnee);
    const l = solveLegIk(j.rootY, j.lLeg, j.lKnee);
    const penBefore = round3(Math.max(r.pen, l.pen));
    const penAfter = round3(Math.max(r.residual, l.residual));
    out[name] = {
      kneeTableR: round3(j.rKnee),
      kneeSolvedR: r.knee,
      kneeTableL: round3(j.lKnee),
      kneeSolvedL: l.knee,
      penBefore,
      penAfter,
      rootLift: round3(Math.max(r.residual, l.residual)),
    };
  }
  return out;
}

/** The canonical key - the law's inputs and its answers over the
 * vocabulary, pipe-format, versioned 96. Mirrors leg_ik_key in the
 * worker field for field (one law, two runtimes). */
export function legIkKey(): string {
  const rows = POSES.map((name) => {
    const r = legIkTable()[name];
    return (
      `${name}:r=${fmt(r.kneeTableR)},${fmt(r.kneeSolvedR)}` +
      `;l=${fmt(r.kneeTableL)},${fmt(r.kneeSolvedL)}` +
      `;res=${fmt(r.penAfter)};lift=${fmt(r.rootLift)}`
    );
  });
  return (
    `${LEG_IK_VERSION}` +
    `|L1=${LEG_IK.upper.toFixed(3)}|L2=${LEG_IK.lower.toFixed(3)}` +
    `|HIP=${LEG_IK.hipStand.toFixed(3)}|KMAX=${LEG_IK.kneeMax.toFixed(3)}` +
    `|${rows.join("|")}` +
    `|v1`
  );
}

const fmt = (x: number) => x.toFixed(3);

/** The DETERMINISTIC leg-IK hash - sha256-16 over the canonical key
 * (mirrors leg_ik_hash in the worker bit-exactly). */
export function legIkHash(): string {
  return createHash("sha256").update(legIkKey(), "utf8").digest("hex").slice(0, 16);
}

/** Human one-liner for stage text and logs. */
export function legIkLine(): string {
  const t = legIkTable();
  const worst = POSES.map((n) => ({ n, pen: t[n].penBefore })).sort((a, b) => b.pen - a.pen)[0];
  return `leg IK v96: the feet stay planted (fold-only two-bone solve, knee ${LEG_IK.kneeMax.toFixed(0)} max); deepest pose ${worst.n} at ${worst.pen.toFixed(3)} build units before, 0 after`;
}
