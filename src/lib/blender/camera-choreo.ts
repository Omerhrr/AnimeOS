/**
 * camera-choreo - THE CAMERA CHOREOGRAPHS THE DRAMA (iteration 88,
 * Layer C).
 *
 * The camera has always obeyed the shot's MECHANICS: one movement for
 * a whole clip (iteration 4), beat-by-beat grammar poses when the
 * director spells them out (iteration 53), the impact punch when a
 * keyed strike lands (iteration 74). But the drama never moved the
 * lens by ITSELF: a revelation did not drift in, dread did not tilt
 * the horizon, a storm did not breathe the frame, a slash did not
 * whip the pan. A static lens on a performing face is the last
 * mannequin tell - the shot's own words already compile the comp
 * profile (iteration 86), the groom (60), the expression (59) and
 * the cloth directive (62); now they compile the CAMERA.
 *
 * This module compiles the SHOT'S OWN WORDS into a bounded CAMERA
 * CHOREO (the same one-law-two-runtimes pattern as every directed
 * layer): the revelation words push in, the retreat words pull out,
 * the dread words tilt the horizon clockwise and breathe the frame,
 * the storm words hand the camera to the wind, and the action verbs
 * whip the pan at the cut. The worker re-clamps against the same
 * bounds and layers the choreo onto WHATEVER aims the lens - the
 * whole-clip movement, the grammar beats, the pose follow - because
 * the choreo is bounded subtlety (a 0.35-unit dolly, a 10-degree
 * tilt, a breath of wobble, a decaying snap), not a new path.
 *
 * Laws of the module:
 *  - bounded: every factor lands inside CAMERA_CHOREO_BOUNDS; the
 *    worker re-clamps against the same bounds on BOTH sides of the
 *    wire (one law, two runtimes);
 *  - honest: `fields` names ONLY the traits the shot's own words
 *    described - a quiet shot keeps the steady house camera with an
 *    honest empty list;
 *  - deterministic: the same shot always lands the same choreo,
 *    hash-proven (cameraChoreoHash mirrors the worker bit-exactly);
 *  - supersession: none - the grammar and the movement still own
 *    WHERE the lens goes; the choreo owns HOW THE DRAMA MOVES it.
 */

import { createHash } from "node:crypto";

// ── the choreo ──

export interface CameraChoreo {
  pushIn: number; // 0..1 - the lens drifts toward the subject over the shot
  pullOut: number; // 0..1 - the lens retreats from the subject over the shot
  dutch: number; // 0..1 - the horizon tilts clockwise (the dread read)
  handheld: number; // 0..1 - the frame breathes (the storm / documentary read)
  whip: number; // 0..1 - the pan snaps and settles at the cut-in
  fields: string[]; // the traits the shot's own words described
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const CAMERA_CHOREO_BOUNDS: Record<Exclude<keyof CameraChoreo, "fields">, [number, number]> = {
  pushIn: [0, 1],
  pullOut: [0, 1],
  dutch: [0, 1],
  handheld: [0, 1],
  whip: [0, 1],
};

/** The house defaults (a quiet shot keeps the steady house camera). */
export const CAMERA_CHOREO_BASE: Omit<CameraChoreo, "fields"> = {
  pushIn: 0,
  pullOut: 0,
  dutch: 0,
  handheld: 0,
  whip: 0,
};

/** The choreo's physical laws (the worker applies the same numbers). */
export const CAMERA_CHOREO_PHYSICS = {
  dollyUnits: 0.35, // the farthest the dolly may travel (scene units)
  dutchDeg: 10.0, // the farthest the horizon may tilt (degrees, clockwise)
  wobbleUnits: 0.02, // the handheld breath amplitude (scene units)
  wobbleRollDeg: 0.3, // the handheld roll breath (degrees)
  whipDeg: 18.0, // the pan snap at the cut-in (degrees)
  whipWindow: 0.1, // the snap decays over the shot's first 10%
} as const;

export interface CameraChoreoSource {
  description?: string | null;
  shotType?: string | null;
}

const round3 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/**
 * THE CAMERA CHOREOGRAPHS THE DRAMA (pure): read the shot's own words
 * into a bounded camera choreo. The revelation words push in, the
 * retreat words pull out, the dread words tilt + breathe, the storm
 * words hand the camera to the wind, the action verbs whip the pan.
 * `fields` names ONLY what the shot itself said. Deterministic: the
 * same shot always lands the same choreo.
 */
export function parseCameraChoreo(src: CameraChoreoSource): CameraChoreo {
  const c: CameraChoreo = { ...CAMERA_CHOREO_BASE, fields: [] };
  const desc = (src.description ?? "").toLowerCase();
  const st = (src.shotType ?? "").toUpperCase();
  const has = (...words: string[]) => words.some((w) => desc.includes(w));

  // the revelation words push in (the lens leans into what changes)
  if (has("revelation", "realizes", "realization", "understands", "eyes widen", "discovers", "recognizes", "the truth", "sees the")) {
    c.pushIn = Math.max(c.pushIn, 0.6);
    c.fields.push("revelation");
  }

  // the retreat words pull out (the lens lets the moment go)
  if (has("retreats", "turns away", "aftermath", "silence", "walks away", "leaves", "stands alone", "falls still")) {
    c.pullOut = Math.max(c.pullOut, 0.55);
    c.fields.push("retreat");
  }

  // the dread words tilt the horizon and breathe the frame
  if (has("dread", "terror", "despair", "horror", "last stand", "reality bends", "world ends")) {
    c.dutch = Math.max(c.dutch, 0.6);
    c.handheld = Math.max(c.handheld, 0.4);
    c.fields.push("dread");
  }

  // the storm words hand the camera to the wind
  if (has("storm", "chaos", "maelstrom", "earthquake", "collapses", "rumbles", "quake", "trembles")) {
    c.handheld = Math.max(c.handheld, 0.55);
    c.fields.push("storm");
  }

  // the action verbs whip the pan at the cut-in
  if (has("slash", "dash", "leap", "charge", "strike", "whip", "spins", "bursts")) {
    c.whip = Math.max(c.whip, 0.6);
    c.fields.push("action");
  }

  // the framing leans the drift: the close shot drifts in, the wide settles back
  if (st === "CLOSEUP" || st === "EXTREME_CLOSEUP") {
    c.pushIn = Math.max(c.pushIn, 0.35);
    c.fields.push("close drift");
  } else if (st === "WS" || st === "WIDE" || st === "ESTABLISHING") {
    c.pullOut = Math.max(c.pullOut, 0.3);
    c.fields.push("wide settle");
  }

  // clamp the law
  c.pushIn = round3(c.pushIn);
  c.pullOut = round3(c.pullOut);
  c.dutch = round3(c.dutch);
  c.handheld = round3(c.handheld);
  c.whip = round3(c.whip);
  return c;
}

/** The choreo as one ledger line (the render state reports it). */
export function cameraChoreoLine(c: CameraChoreo): string {
  const from = c.fields.length > 0 ? `named by the shot: ${c.fields.join(", ")}` : "steady house camera";
  return `camera: choreographed - push-in ${c.pushIn.toFixed(2)}, pull-out ${c.pullOut.toFixed(2)}, dutch ${c.dutch.toFixed(2)}, handheld ${c.handheld.toFixed(2)}, whip ${c.whip.toFixed(2)} (${from})`;
}

/** The DETERMINISTIC camera-choreo hash - mirrored bit-exactly in the worker. */
export function cameraChoreoHash(c: CameraChoreo): string {
  const key = `88|${c.pushIn.toFixed(3)}|${c.pullOut.toFixed(3)}|${c.dutch.toFixed(3)}|${c.handheld.toFixed(3)}|${c.whip.toFixed(3)}|v1`;
  // sha256 over the key, first 16 hex - identical to Python's
  // hashlib.sha256(key.encode()).hexdigest()[:16]
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}
