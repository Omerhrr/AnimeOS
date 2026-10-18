// ─────────────────────────────────────────────────────────────
// THE KEYFRAME REGEN (iteration 234) - the tail's own answerer.
//
// The 233 ride answered RENDER's order (the repair pass, the map's
// named refs riding first) and named the other answerer honestly:
// AI_KEYFRAME's order rides out answeredBy "night-law" - "the regen
// re-rides the named worst shots night-tagged, and the medians move
// only as the nights do" - and NOTHING executed it. The night
// writer (runAiKeyframeNight) always had its own door (onlyShotIds)
// and the arc's own cohort; what stood between the order and the
// door was the RESOLVER: the order names REFS (the work-number chain
// "E7 Sc12 S003"), the night writer takes SHOT IDS.
//
// This module is that contract, PURE:
//
//   - parseWorkRef: the work-number chain's own parse (the same ref
//     shape the arc buckets and the receipt fold key speak),
//   - resolveNamedShots: the order's named refs against the live
//     shot chain - resolved in the map's own order, deduped by
//     shot, and a named ref that resolves to no live shot (or is
//     malformed) rides out NAMED in `unresolvedRefs` - the ledger
//     honest at the seam, the unnamed law's own twin,
//   - nightLawPlan: the executable plan - the shot ids the night
//     writer re-rides, the night tag carried from the order
//     untouched, and the ANSWERER GUARD: a non-night-law order is
//     refused by the plan itself (the contract names its
//     answerers; the night law does not answer another
//     instrument's order).
//
// PURE: no db, no fs - the shots arrive as arguments (the caller
// reads the live chain), the night rides the order. The ride
// itself stays in the night writer's own hands: generate the
// anchored pixels, read them N times through the damped
// instrument, append night-tagged under the source's own cohort,
// and the gate re-reads the medians.
// ─────────────────────────────────────────────────────────────

import type { RepairWorkOrder } from "./repair-work-order";

export const REGEN_LAW_VERSION = 234;

/** The work-number chain one ref speaks: E<episode> Sc<scene> S<shot>. */
export interface WorkRef {
  episode: number;
  scene: number;
  shot: number;
}

/** Parse one work ref ("E7 Sc12 S003" -> {episode:7, scene:12, shot:3}).
 *  Malformed or partial: null - the caller names it, never drops it. */
export function parseWorkRef(ref: string): WorkRef | null {
  const m = /^E(\d+)\s+Sc(\d+)\s+S(\d+)$/.exec(ref.trim());
  if (!m) return null;
  const episode = Number(m[1]);
  const scene = Number(m[2]);
  const shot = Number(m[3]);
  if (!Number.isFinite(episode) || !Number.isFinite(scene) || !Number.isFinite(shot)) return null;
  return { episode, scene, shot };
}

/** The minimal live shot chain the resolver reads (structural - the
 *  caller's db rows without the import cycle). */
export interface RegenShot {
  id: string;
  episode: number;
  scene: number;
  number: number;
}

export interface ResolvedNamedShots {
  /** The named refs that resolve to a live shot, in the map's own
   *  order, deduped by shot. */
  resolved: Array<{ ref: string; shotId: string }>;
  /** The named refs that resolve to nothing (no live shot, or
   *  malformed) - named, never silently dropped. */
  unresolvedRefs: string[];
}

/**
 * THE RESOLVER (pure): the order's named refs against the live shot
 * chain. The map's own order is THE order (the named refs ride
 * first because the map said so); a ref that resolves rides with
 * its shot id; a ref that does not (no live shot at that number
 * chain, or malformed) rides out NAMED in unresolvedRefs. A shot
 * is never resolved twice (deduped by shotId).
 */
export function resolveNamedShots(refs: string[], shots: RegenShot[]): ResolvedNamedShots {
  const byRef = new Map<string, string>();
  for (const s of shots) {
    const ref = `E${s.episode} Sc${s.scene} S${String(s.number).padStart(3, "0")}`;
    if (!byRef.has(ref)) byRef.set(ref, s.id);
  }
  const resolved: Array<{ ref: string; shotId: string }> = [];
  const seen = new Set<string>();
  const unresolvedRefs: string[] = [];
  for (const raw of refs) {
    const ref = raw.trim();
    if (!ref) continue;
    const parsed = parseWorkRef(ref);
    const shotId = parsed ? byRef.get(ref) : undefined;
    if (shotId && !seen.has(shotId)) {
      resolved.push({ ref, shotId });
      seen.add(shotId);
    } else if (!shotId && !unresolvedRefs.includes(ref)) {
      unresolvedRefs.push(ref);
    }
  }
  return { resolved, unresolvedRefs };
}

/** The night law's executable plan: what the regen re-rides, under
 *  what night, and what it refuses to answer. */
export interface RegenPlan {
  /** The order's own night tag, carried through untouched. */
  night: string;
  /** The shot ids the night writer re-rides (empty when the plan
   *  refuses or resolves nothing - the line says which). */
  onlyShotIds: string[];
  resolvedRefs: string[];
  unresolvedRefs: string[];
  /** The plan in one line (exact words - the smoke pins them). */
  planLine: string;
}

/**
 * THE NIGHT-LAW PLAN (pure): the AI_KEYFRAME work order, made
 * executable. A non-night-law order is REFUSED by the plan itself
 * (the contract names its answerers - the night law does not answer
 * the repair pass's instrument); a night-law order whose refs
 * resolve to nothing rides out an honest no-op (named, never
 * silent); otherwise the plan carries the resolved shot ids and the
 * order's own night, and the night writer's door (onlyShotIds)
 * takes it from there - generate, read, append night-tagged, and
 * the gate re-reads the medians.
 */
export function nightLawPlan(order: RepairWorkOrder, shots: RegenShot[]): RegenPlan {
  const { resolved, unresolvedRefs } = resolveNamedShots(order.namedRefs, shots);
  if (order.answeredBy !== "night-law") {
    return {
      night: order.night,
      onlyShotIds: [],
      resolvedRefs: [],
      unresolvedRefs: [],
      planLine: `${order.source}: the answerer is ${order.answeredBy} - the night law's plan does not answer this order (the contract names its answerers).`,
    };
  }
  if (resolved.length === 0) {
    const named = unresolvedRefs.length > 0 ? ` (${unresolvedRefs.join(", ")})` : " (the order names no refs)";
    return {
      night: order.night,
      onlyShotIds: [],
      resolvedRefs: [],
      unresolvedRefs,
      planLine: `${order.source}: nothing to re-ride - every named ref resolves to no live shot${named}; the plan refuses honestly (the ledger stays honest at the seam).`,
    };
  }
  const unresolved = unresolvedRefs.length > 0
    ? `; ${unresolvedRefs.length} named ref(s) resolve to no live shot (${unresolvedRefs.join(", ")}) - named, never silent`
    : "";
  return {
    night: order.night,
    onlyShotIds: resolved.map((r) => r.shotId),
    resolvedRefs: resolved.map((r) => r.ref),
    unresolvedRefs,
    planLine: `${order.source}: the regen re-rides ${resolved.length} named shot(s) (${resolved.map((r) => r.ref).join(", ")}) night-tagged under ${order.night} - the night writer's own door (runAiKeyframeNight, onlyShotIds), the appends ride the source's own cohort${unresolved}.`,
  };
}
