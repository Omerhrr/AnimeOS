import { SEQUENCE_REGISTERS, isSequenceRegister, type SequenceRegister } from "@/lib/dsh/sequence-flows";

// ─────────────────────────────────────────────────────────────
// THE BATTLE IS STAGED (iteration 79) - the chain at episode scale.
//
// One sentence (direct_sequence) directs a scene. A BATTLE spans an
// episode: clash, pursuit, aftermath - a dramatic ARC of registers,
// each leg performed by the register's best-proven learned sequence
// flow, the episode's shots allocated across the legs by the
// sentence's own weight (a leg with more slots carries more of the
// fight), every leg pre-flighted BEFORE a single shot is stamped
// (a battle that fails at leg 3 with legs 1-2 already staged would
// leave the episode half-directed), and the chain law intact: a
// slot's motion call still chains the verified performance through
// the same registry set_shot_choreography consults.
//
// This module is the PURE law - arc parsing and shot allocation.
// The stamping lives in the tool (stage_battle), which reuses the
// exact resolver/compile set direct_sequence obeys.
// ─────────────────────────────────────────────────────────────

export const BATTLE_MIN_LEGS = 2;
export const BATTLE_MAX_LEGS = 5;

export type ParsedArc =
  | { ok: true; registers: SequenceRegister[] }
  | { ok: false; error: string };

/** Parse the director's arc - "BATTLE > PURSUIT > RESOLVE" (or
 * comma-separated). Every leg must name a sequence register, the arc
 * carries 2..5 legs, and consecutive legs may not repeat (a leg
 * fights, the next leg moves - a repeated register is one leg, not
 * two). Pure - the E2E asserts the refusals verbatim. */
export function parseBattleArc(input: unknown): ParsedArc {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return { ok: false, error: `pass an arc of registers - e.g. arc:'BATTLE > PURSUIT > RESOLVE' (${BATTLE_MIN_LEGS} to ${BATTLE_MAX_LEGS} legs, registers: ${SEQUENCE_REGISTERS.join(" | ")}).` };
  }
  const parts = raw.split(/[>,]/).map((p) => p.trim().toUpperCase()).filter((p) => p.length > 0);
  if (parts.length < BATTLE_MIN_LEGS) {
    return { ok: false, error: `a battle arc needs ${BATTLE_MIN_LEGS} to ${BATTLE_MAX_LEGS} legs - a single register belongs in direct_sequence register:'<register>' (got ${parts.length}).` };
  }
  if (parts.length > BATTLE_MAX_LEGS) {
    return { ok: false, error: `a battle arc carries at most ${BATTLE_MAX_LEGS} legs - longer than that is a season, not a battle (got ${parts.length}).` };
  }
  for (let i = 0; i < parts.length; i++) {
    if (!isSequenceRegister(parts[i])) {
      return { ok: false, error: `leg ${i + 1}: arc register must be one of ${SEQUENCE_REGISTERS.join(" | ")} (got "${parts[i]}").` };
    }
    if (i > 0 && parts[i] === parts[i - 1]) {
      return { ok: false, error: `the arc repeats ${parts[i]} in consecutive legs (legs ${i} and ${i + 1}) - merge them into one leg (a leg fights, the next leg moves).` };
    }
  }
  return { ok: true, registers: parts as SequenceRegister[] };
}

/** Allocate the episode's shots across the arc's legs by the legs'
 * SENTENCE WEIGHT (each leg's flow slot count): a leg with more slots
 * carries more of the fight. Largest-remainder rounding, ties break
 * to the earlier leg, every leg keeps at least one shot (the caller
 * refuses when shots < legs). Pure and deterministic - the E2E
 * asserts the distributions. */
export function allocateBattleShots(shots: number, slotWeights: number[]): number[] {
  const legs = slotWeights.length;
  const alloc = new Array<number>(legs).fill(0);
  if (legs === 0 || shots <= 0) return alloc;
  const totalW = slotWeights.reduce((a, b) => a + b, 0);
  if (totalW <= 0) {
    // degenerate: split evenly, earliest legs take the remainder
    const base = Math.floor(shots / legs);
    let rem = shots - base * legs;
    for (let i = 0; i < legs; i++) alloc[i] = base + (rem-- > 0 ? 1 : 0);
    return alloc;
  }
  let assigned = 0;
  const fracs: Array<{ i: number; frac: number }> = [];
  for (let i = 0; i < legs; i++) {
    const exact = (shots * slotWeights[i]) / totalW;
    const floor = Math.floor(exact);
    alloc[i] = floor;
    assigned += floor;
    fracs.push({ i, frac: exact - floor });
  }
  // largest remainder first (tie -> earlier leg), then clamp every
  // leg to at least one shot by taking from the largest allocation
  fracs.sort((a, b) => b.frac - a.frac || a.i - b.i);
  let rem = shots - assigned;
  for (let k = 0; k < fracs.length && rem > 0; k++, rem--) alloc[fracs[k].i] += 1;
  for (let k = fracs.length - 1; k >= 0 && rem < 0; k--, rem++) {
    const i = fracs[k].i;
    if (alloc[i] > 0) alloc[i] -= 1;
  }
  for (let i = 0; i < legs && alloc.every((a) => a >= 1) === false; i++) {
    if (alloc[i] === 0) {
      const donor = alloc.indexOf(Math.max(...alloc));
      if (alloc[donor] > 1) {
        alloc[donor] -= 1;
        alloc[i] += 1;
      }
    }
  }
  return alloc;
}

/** The battle line for one leg's read: the register, the flow it
 * consulted and the shots it carries. */
export function battleLegLabel(register: string, flowName: string, shots: number, runs: number, clears: number): string {
  return `${register} leg '${flowName}' (${shots} shot${shots === 1 ? "" : "s"}, ${runs} run${runs === 1 ? "" : "s"}, ${clears} clear${clears === 1 ? "" : "s"})`;
}
