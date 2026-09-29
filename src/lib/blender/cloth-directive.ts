/**
 * cloth-directive - THE CLOTH IS DIRECTED (iteration 87, Layer B).
 *
 * The solver-grade cloth (iteration 10 of the worker, v10.0) answered
 * a SCALAR: the beat's wind number stirred the air and every garment
 * - a silk sash and an armored skirt alike - shared one probed mass,
 * one stiffness, one direction of pull (the X rotation), and one
 * per-part gust. Real art-directed cloth is not a scalar: the director
 * decides WHICH WAY the air moves (the hero's robes stream BACK
 * against the gale; a crosswind peels the sash sideways), HOW DISORDERED
 * it is (a maelstrom scatters the panels, a temple hall holds one clean
 * fall), and WHAT the garment is made of (silk answers a breath,
 * armor barely notices a storm).
 *
 * This module compiles the SHOT'S OWN WORDS into a bounded CLOTH
 * DIRECTIVE (the same one-law-two-runtimes pattern as the comp, the
 * groom, the expression and the material): the wind words set the
 * strength tier, the violence words set the turbulence, the direction
 * words set the heading on the screen plane, the fabric words pick the
 * garment class (which re-tunes the REAL solver's mass and stiffness
 * for this shot), and the close-quarters words arm self-collision.
 * The worker re-clamps against the same bounds, re-tunes the solver,
 * decomposes the heading into the anchor's forward/lateral pull and
 * names the whole thing in the render state - hash-proven.
 *
 * Heading convention (the screen plane; the camera stays on the
 * figure's front side - the house framing law):
 *   0   = the classic hero-read: the air streams BACK, away from the
 *         lens (cloth trails behind the figure - what the old scalar
 *         wind already rendered, so heading 0 is bit-compatible with
 *         every wind beat ever shot);
 *  90   = the drift goes screen-right; 270 = screen-left;
 * 180   = the air blows TOWARD the lens (the hem billows at the camera).
 *
 * Laws of the module:
 *  - bounded: heading folds into 0..360, strength and turbulence land
 *    inside CLOTH_DIRECTIVE_BOUNDS; the worker re-clamps against the
 *    same bounds on BOTH sides of the wire (one law, two runtimes);
 *  - honest: `fields` names ONLY the traits the shot's own words (and
 *    the scene's own energy number) described - a quiet shot keeps the
 *    house air with an honest empty list;
 *  - alive: a stillness word never lands the dead zero - the house
 *    ambient floor keeps the cloth breathing (stillness is directed,
 *    not frozen);
 *  - deterministic: the same shot always lands the same directive,
 *    hash-proven (clothHash mirrors the worker bit-exactly).
 */

import { createHash } from "node:crypto";

// ── the directive ──

export interface ClothDirective {
  heading: number; // 0..360 - the wind's travel heading on the screen plane
  strength: number; // 0..1 - the directed wind strength
  turbulence: number; // 0..1 - gust disorder (scatter + second harmonic)
  garment: string; // silk | cloth | leather | armor
  collision: string; // self | off
  fields: string[]; // the traits the shot's own words described
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const CLOTH_DIRECTIVE_BOUNDS: Record<"strength" | "turbulence", [number, number]> = {
  strength: [0, 1],
  turbulence: [0, 1],
};

export const CLOTH_HEADINGS: readonly string[] = ["0 back-stream", "90 screen-right", "180 toward-lens", "270 screen-left"];

export const GARMENT_CLASSES: readonly string[] = ["silk", "cloth", "leather", "armor"];

export const COLLISION_TIERS: readonly string[] = ["self", "off"];

/**
 * Per-class solver physics (the REAL cloth settings the worker
 * re-tunes). The probed CLOTH preset (iteration v10.0) remains the
 * `cloth` class; silk is lighter and looser, leather heavier and
 * stiffer, armor nearly rigid with the pin law untouched.
 */
export const GARMENT_SETTINGS: Record<string, { mass: number; tension: number; compression: number; shear: number; bending: number; airDamping: number }> = {
  silk: { mass: 0.14, tension: 7.0, compression: 5.5, shear: 4.5, bending: 0.12, airDamping: 1.35 },
  cloth: { mass: 0.25, tension: 12.0, compression: 10.0, shear: 8.0, bending: 0.3, airDamping: 1.6 },
  leather: { mass: 0.42, tension: 20.0, compression: 17.0, shear: 14.0, bending: 0.85, airDamping: 1.9 },
  armor: { mass: 0.65, tension: 30.0, compression: 26.0, shear: 22.0, bending: 2.2, airDamping: 2.2 },
};

/** The house defaults (a quiet shot keeps the probed cloth physics and the ambient air). */
export const CLOTH_DIRECTIVE_BASE: Omit<ClothDirective, "fields"> = {
  heading: 0,
  strength: 0,
  turbulence: 0,
  garment: "cloth",
  collision: "off",
};

export interface ClothSource {
  description?: string | null;
  energyIntensity?: number | null;
}

const round3 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
const fold360 = (v: number): number => {
  const x = v % 360;
  return Math.round((x < 0 ? x + 360 : x) * 10) / 10;
};

/**
 * THE CLOTH IS DIRECTED (pure): read the shot's own words into a
 * bounded cloth directive. The wind words set the strength tier (the
 * scene's own energy number lifts the floor), the violence words set
 * the turbulence, the direction words set the heading, the fabric
 * words pick the garment class, the close-quarters words arm
 * self-collision. `fields` names ONLY what the shot itself said.
 * Deterministic: the same shot always lands the same directive.
 */
export function parseClothDirective(src: ClothSource): ClothDirective {
  const d: ClothDirective = { ...CLOTH_DIRECTIVE_BASE, fields: [] };
  const desc = (src.description ?? "").toLowerCase();
  const has = (...words: string[]) => words.some((w) => desc.includes(w));

  // the fabric words pick the garment class (solver physics re-tuned)
  if (has("silk", "satin", "gauze", "chiffon", "silken")) {
    d.garment = "silk";
    d.fields.push("silk");
  } else if (has("leather", "hide", "buckram")) {
    d.garment = "leather";
    d.fields.push("leather");
  } else if (has("armor", "armored", "armour", "plate", "mail", "carapace")) {
    d.garment = "armor";
    d.fields.push("armor");
  }

  // the wind words set the strength tier
  const gale = has("gale", "storm", "hurricane", "howling", "maelstrom", "tempest");
  const breeze = has("breeze", "stir", "whisper");
  const windNamed = has("wind", "windswept", "wind-swept", "gust", "blowing", "gale", "storm", "breeze");
  const billow = has("billow", "flutter", "whip", "streaming", "streams", "swirl", "flare", "snap");
  if (gale) {
    d.strength = Math.max(d.strength, 0.85);
    d.fields.push("gale");
  } else if (windNamed) {
    d.strength = Math.max(d.strength, 0.55);
    d.fields.push("wind");
  } else if (breeze) {
    d.strength = Math.max(d.strength, 0.3);
    d.fields.push("breeze");
  }
  if (billow) {
    d.strength = Math.max(d.strength, 0.6);
    if (!d.fields.includes("billow")) d.fields.push("billow");
  }

  // the scene's own energy stirs the air (a floor, never a ceiling)
  if (typeof src.energyIntensity === "number" && src.energyIntensity > 0.45) {
    const lift = round3(0.2 + 0.35 * Math.min(1, Math.max(0, src.energyIntensity)));
    if (lift > d.strength) {
      d.strength = lift;
      d.fields.push("scene energy");
    }
  }

  // the violence words set the turbulence
  if (has("maelstrom", "cyclone", "vortex", "chaos", "turbulent", "swirl")) {
    d.turbulence = Math.max(d.turbulence, 0.7);
    d.fields.push("vortex");
  } else if (gale) {
    d.turbulence = Math.max(d.turbulence, 0.5);
    if (!d.fields.includes("gale turbulence")) d.fields.push("gale turbulence");
  } else if (has("gust")) {
    d.turbulence = Math.max(d.turbulence, 0.4);
    d.fields.push("gust");
  } else if (billow) {
    d.turbulence = Math.max(d.turbulence, 0.3);
    if (!d.fields.includes("billow turbulence")) d.fields.push("billow turbulence");
  }

  // the direction words set the heading on the screen plane
  if (has("crosswind", "sideways", "lateral", "side wind", "sidewind")) {
    d.heading = fold360(90);
    d.fields.push("crosswind");
  } else if (has("toward the camera", "into the lens", "billows forward", "billows at the camera")) {
    d.heading = fold360(180);
    d.fields.push("toward-lens");
  } else if (has("headwind", "against the wind", "streams back", "streaming back", "trails behind", "blown back", "whips back", "snaps back")) {
    // the classic hero-read: the air hits the figure's front and the
    // cloth streams BACK, away from the lens (what the scalar wind
    // always rendered)
    d.heading = fold360(0);
    if (!d.fields.includes("headwind")) d.fields.push("headwind");
  }

  // the close-quarters words arm self-collision (the sash can snag itself)
  if (has("grapple", "close-quarters", "close quarters", "melee", "collide", "tangle")) {
    d.collision = "self";
    d.fields.push("self-collision");
  }

  // the stillness words DIRECT stillness - the alive floor, never the
  // dead zero (a frozen cloth reads broken; a held breath reads calm).
  // The floor SETS the answer: stillness is a directed value, not a
  // cap that a wilder word could zero out.
  if (has("calm", "still", "meditat", "tranquil", "silent", "sealed chamber", "meditation")) {
    d.strength = 0.06;
    d.turbulence = 0.02;
    d.fields.push("stillness");
  }

  // clamp the law: strength/turbulence inside bounds, garment and
  // collision names can never ride wild
  d.strength = round3(d.strength);
  d.turbulence = round3(d.turbulence);
  if (!GARMENT_CLASSES.includes(d.garment)) d.garment = "cloth";
  if (!COLLISION_TIERS.includes(d.collision)) d.collision = "off";
  return d;
}

/** The directive as one ledger line (the render state reports it). */
export function clothDirectiveLine(d: ClothDirective): string {
  const from = d.fields.length > 0 ? `named by the shot: ${d.fields.join(", ")}` : "house air";
  return `cloth: directed - heading ${d.heading.toFixed(0)}°, strength ${d.strength.toFixed(2)}, turbulence ${d.turbulence.toFixed(2)}, ${d.garment} garments, ${d.collision === "self" ? "self-collision" : "no self-collision"} (${from})`;
}

/** The DETERMINISTIC cloth-directive hash - mirrored bit-exactly in the worker. */
export function clothHash(d: ClothDirective): string {
  const key = `87|${d.heading.toFixed(1)}|${d.strength.toFixed(3)}|${d.turbulence.toFixed(3)}|${d.garment}|${d.collision}|v1`;
  // sha256 over the key, first 16 hex - identical to Python's
  // hashlib.sha256(key.encode()).hexdigest()[:16]
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}
