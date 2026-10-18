// ─────────────────────────────────────────────────────────────
// THE REPAIR WORK ORDER (iteration 233) - the map rides.
//
// The 232 review named the path between E7 and its first RELEASE
// verdict - and a path nobody executes is prose, not a plan. This
// module is the CONTRACT between the review and the machinery that
// answers it, in two pure halves:
//
//   (a) buildRepairWorkOrders: the review's own sources, verdict by
//       verdict, become work orders - the named worst refs (the
//       gate's blocking cells, worst-p10-first, deduped), the
//       repair's own budget carried through, the night tag the
//       re-scores will append under, and the ANSWERER named
//       honestly: the repair pass answers RENDER's instrument; a
//       non-RENDER source's tail is the night law's work (the regen
//       re-rides the named shots night-tagged); an UNSCORED source
//       is answered by measurement, not repair. An all-RELEASE
//       review earns no orders - nothing stands between.
//
//   (b) targetsNamedFirst: the pass's target selection law - the
//       map's named refs ride FIRST (in the map's own order), the
//       member's own below-bar queue fills the rest, deduped by
//       shot, capped at the budget; a named ref no below-bar
//       reading carries rides out NAMED (the map said it, the
//       member's own instrument does not - the ledger stays
//       honest at the seam).
//
// PURE: no db, no fs - the review arrives as the argument (the
// caller built it from the gate's own reads), the budget rides the
// review's own repairBudget (the 232 purity law kept). The smoke
// asserts the exact words; the e2e rides the real order.
// ─────────────────────────────────────────────────────────────

import type { DistributionVerdict } from "./identity-matrix";
import type { ReleaseReview } from "./release-review";

export const REPAIR_WORK_ORDER_LAW_VERSION = 233;

/** Who answers this order - named, never implied. */
export type RepairAnswerer = "repair-pass" | "night-law" | "measure-first";

/** One source's work order: the map's step, made executable. */
export interface RepairWorkOrder {
  source: string;
  verdict: DistributionVerdict;
  /** The night the re-scores append under (the review's own instant). */
  night: string;
  /** The repair's own budget, carried through untouched. */
  budget: { members: number; shotsPerMember: number; shotsPerPass: number };
  /** The gate's named worst refs - blocking-cell order (worst p10
   *  first), deduped, order preserved. */
  namedRefs: string[];
  answeredBy: RepairAnswerer;
  /** The order in one line (exact words - the smoke pins them). */
  orderLine: string;
}

const dedupeRefs = (refs: string[]): string[] => [...new Set(refs)];

/**
 * The review's work orders (pure): one per non-RELEASE source, in
 * the review's own source order. RELEASE earns no order - nothing
 * stands between that source and publish (the closing step the
 * review's path already carries).
 */
export function buildRepairWorkOrders(review: ReleaseReview): RepairWorkOrder[] {
  const night = `repair-${review.reviewedAt.slice(0, 10)}`;
  const orders: RepairWorkOrder[] = [];
  for (const s of review.sources) {
    if (s.verdict === "RELEASE") continue; // nothing stands between - no order
    const namedRefs = dedupeRefs(s.blocking.flatMap((b) => (b.worstRef ? [b.worstRef] : [])));
    const answeredBy: RepairAnswerer =
      s.verdict === "UNSCORED" ? "measure-first" : s.source === "RENDER" ? "repair-pass" : "night-law";
    const refsWords = namedRefs.length > 0 ? `: ${namedRefs.join(", ")}` : "";
    const budgetWords = `up to ${s.repairBudget.members} members x ${s.repairBudget.shotsPerMember} shots = ${s.repairBudget.shotsPerPass} shots per pass, the named worst refs first${refsWords}`;
    let orderLine: string;
    if (answeredBy === "measure-first") {
      orderLine = `${s.source}: measure first - run the identity sweep for this source; the gate refuses UNSCORED honestly and the spine does not guess a release.`;
    } else if (answeredBy === "night-law") {
      orderLine = `${s.source}: this source's repair is the night law's work - the regen re-rides the named worst shots${refsWords ? ` ${namedRefs.join(", ")}` : ""} night-tagged under ${night}, and the medians move only as the nights do; the repair pass answers RENDER's instrument, not this source.`;
    } else if (s.verdict === "BELOW") {
      orderLine = `${s.source}: the body is the work - the repair pass answers the map (${budgetWords}), its re-scores append night-tagged under ${night}, and the gate re-reads the medians.`;
    } else {
      orderLine = `${s.source}: the tail is the work - the repair pass answers the map (${budgetWords}), its re-scores append night-tagged under ${night}, and the medians move only as the nights do.`;
    }
    orders.push({
      source: s.source,
      verdict: s.verdict,
      night,
      budget: {
        members: s.repairBudget.members,
        shotsPerMember: s.repairBudget.shotsPerMember,
        shotsPerPass: s.repairBudget.shotsPerPass,
      },
      namedRefs,
      answeredBy,
      orderLine,
    });
  }
  return orders;
}

/** The minimal shot reading the pass's queue carries (structural -
 *  the caller's BelowShot without the import cycle). */
export interface NamedFirstShot {
  shotId: string;
  ref: string;
  similarity: number;
}

/**
 * THE PASS'S TARGET SELECTION (pure): the map's named refs ride
 * first, in the map's own order; the member's own below-bar queue
 * (worst first, as given) fills the rest; deduped by shotId; capped
 * at the budget (floored at 1). Named refs no below-bar reading
 * carries ride out in `unnamedRefs` - named, never silently dropped.
 */
export function targetsNamedFirst(
  below: NamedFirstShot[],
  namedRefs: string[],
  limit: number,
): { targets: NamedFirstShot[]; unnamedRefs: string[] } {
  const cap = Math.max(1, Math.round(limit) || 1);
  const byRef = new Map<string, NamedFirstShot>();
  for (const shot of below) if (!byRef.has(shot.ref)) byRef.set(shot.ref, shot);
  const targets: NamedFirstShot[] = [];
  const seen = new Set<string>();
  for (const ref of namedRefs) {
    const shot = byRef.get(ref);
    if (shot && !seen.has(shot.shotId)) {
      targets.push(shot);
      seen.add(shot.shotId);
    }
  }
  for (const shot of below) {
    if (targets.length >= cap) break;
    if (!seen.has(shot.shotId)) {
      targets.push(shot);
      seen.add(shot.shotId);
    }
  }
  const carried = new Set(below.map((b) => b.ref));
  const unnamedRefs = [...new Set(namedRefs.filter((r) => !carried.has(r)))];
  return { targets, unnamedRefs };
}
