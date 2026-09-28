/**
 * groom - THE HAIR IS GROOMED (iteration 85, Layer A).
 *
 * The measured cast gap survived the palette, the silhouette, the
 * sculpt, the grade AND the performance because the HAIR still read
 * as solid helmet masses: lofted volumes with tapered tips (a tip
 * reads as hair, a sphere reads as a ball - iteration 82's law), but
 * a volume without STRAND DETAIL still reads as a helmet in close
 * framing, and no sheet-directed DIRECTION lived in it - the groom
 * was the builder's default, not the sheet's.
 *
 * This module compiles the sheet read's own silhouette sentence into
 * a bounded GROOM PROFILE (the same one-law-two-runtimes pattern as
 * the silhouette, the face and the materials): the direction the
 * sheet describes (flowing, windswept, swept back, slicked, parted)
 * and the detail the framing needs (the LOD law: close framings grow
 * the full strand detail, wide framings keep the volumes - the
 * worker owns the framing, the profile owns the traits).
 *
 * Laws of the module:
 *  - bounded: every factor lands inside GROOM_PROFILE_BOUNDS; the
 *    worker re-clamps against the same bounds on BOTH sides of the
 *    wire (one law, two runtimes);
 *  - honest: `fields` names ONLY the traits the sheet's own words
 *    described - a silent note keeps the style prior with an honest
 *    empty list; a guess build carries no profile at all;
 *  - deterministic: the same sentence always lands the same profile;
 *  - strand detail is SEEDED law, not noise: the worker's strands
 *    hang off fnv1a-seeded determinism (the same DNA always grooms
 *    the same hair - the smoke test hashes it).
 */

// ── the profile ──

export interface GroomProfile {
  sweep: number; // -1..1 (front-to-back pull: + swept back, - falls forward)
  flow: number; // 0..1 (straight -> flowing wave)
  flyaway: number; // 0..1 (the loose strands the wind owns)
  taper: number; // 0.5..1 (how fine the strand tips die out)
  fields: string[]; // the traits the sheet's own words described
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const GROOM_PROFILE_BOUNDS: Record<keyof Omit<GroomProfile, "fields">, [number, number]> = {
  sweep: [-1, 1],
  flow: [0, 1],
  flyaway: [0, 1],
  taper: [0.5, 1],
};

/** The style priors (the sheet names the style; the groom follows). */
export const GROOM_STYLE_PRIORS: Record<string, Partial<Omit<GroomProfile, "fields">>> = {
  topknot: { sweep: 0.45, flow: 0.15, flyaway: 0.15 },
  ponytail: { sweep: 0.55, flow: 0.3, flyaway: 0.25 },
  braid: { sweep: 0.35, flow: 0.1, flyaway: 0.1 },
  long: { sweep: 0.1, flow: 0.55, flyaway: 0.35 },
  short: { sweep: 0.2, flow: 0.1, flyaway: 0.2 },
};

function clampGroom(key: keyof Omit<GroomProfile, "fields">, v: number): number {
  const [lo, hi] = GROOM_PROFILE_BOUNDS[key];
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
}

/**
 * THE HAIR IS GROOMED (pure): read the sheet's silhouette sentence
 * into a bounded groom profile. The hair STYLE sets the prior (the
 * sheet named it); the note's own words push the traits - "flowing"
 * and "windswept" raise the flow and the flyaway, "swept back" and
 * "slicked" pull the sweep, "loose" raises the flyaway, "neat" and
 * "tied" lower it. `fields` names ONLY what the note itself said.
 * Deterministic: the same sentence always lands the same profile.
 */
export function parseGroomProfile(
  silhouette: string | null | undefined,
  hairStyle: string | null | undefined,
): GroomProfile {
  const styleKey = (hairStyle ?? "").trim().toLowerCase();
  const prior = GROOM_STYLE_PRIORS[styleKey] ?? GROOM_STYLE_PRIORS.short;
  const prof: GroomProfile = {
    sweep: prior.sweep ?? 0.2,
    flow: prior.flow ?? 0.15,
    flyaway: prior.flyaway ?? 0.2,
    taper: 0.85,
    fields: [],
  };
  const note = (silhouette ?? "").toLowerCase();
  if (!note.trim()) return prof;
  const has = (...words: string[]) => words.some((w) => note.includes(w));
  const push = (key: keyof Omit<GroomProfile, "fields">, delta: number, field: string) => {
    prof[key] = clampGroom(key, prof[key] + delta);
    if (!prof.fields.includes(field)) prof.fields.push(field);
  };
  if (has("flowing", "windswept", "cascading", "billowing")) {
    push("flow", 0.3, "flowing");
    push("flyaway", 0.2, "flowing");
  }
  if (has("swept back", "slicked", "tied back", "pulled back")) push("sweep", 0.3, "swept back");
  if (has("loose")) push("flyaway", 0.25, "loose");
  if (has("neat", "tied", "braided", "bound")) {
    push("flyaway", -0.12, "neat");
    push("flow", -0.08, "neat");
  }
  if (has("wild", "unkempt", "tangled", "flying")) push("flyaway", 0.3, "wild");
  return prof;
}

/** The groom as one ledger line (the repair pass reports it). */
export function groomProfileLine(prof: GroomProfile): string {
  const from = prof.fields.length > 0 ? `named by the sheet: ${prof.fields.join(", ")}` : "from the style prior";
  return `groomed: sweep ${prof.sweep.toFixed(2)}, flow ${prof.flow.toFixed(2)}, flyaway ${prof.flyaway.toFixed(2)} (${from})`;
}

// ── the LOD law (the framing owns the detail) ──

/**
 * The framings that grow the FULL strand detail (the face is the
 * shot; the hair must read as hair at arm's length). Everything
 * wider keeps the volumes + a reduced strand pass - a wide shot
 * renders thousands of strands nobody can see.
 */
export const GROOM_CLOSE_FRAMINGS: readonly string[] = [
  "CLOSEUP", "EXTREME_CLOSEUP", "MCU",
];

/** The strand multiplier for a framing (pure, deterministic). */
export function groomStrandFactor(shotType: string | null | undefined): number {
  const st = (shotType ?? "").toUpperCase();
  if (GROOM_CLOSE_FRAMINGS.includes(st)) return 1.0;
  if (st === "WS" || st === "WIDE" || st === "ESTABLISHING" || st === "OTS") return 0.4;
  return 0.7;
}

/** The strand budget law: close framings carry the full pass. */
export const GROOM_STRAND_BASE = 7; // thin strands per groomed piece, before the LOD factor
export const GROOM_FLYAWAY_BASE = 5; // loose strands, riding the flyaway factor + the LOD
