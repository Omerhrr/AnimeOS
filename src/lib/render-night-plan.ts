// ─────────────────────────────────────────────────────────────
// THE NIGHT PLAN (iteration 235) - the next nights stop being
// improvisation.
//
// The 233/234 rides answered the map across the executor's own cap:
// a foreground call dies at ten minutes, a real render rides ~ten
// alone, so each night split into a seconds-long prerender call (the
// bridge renders across the boundary) and a ride call (the pass
// resumes the wait, the re-score appends night-tagged). The protocol
// lived in the ride scripts as earned improvisation - every night
// re-derived its targets, its member order, and its call shape by
// hand. The 235 frontier names the work: "the repair pass's next
// nights ride the named cells with the acceptance's verdict in hand"
// - and next nights planned by hand are prose, not a plan.
//
// THE LAW, in four moves:
//
//   (a) THE PLAN ANSWERS THE REPAIR PASS'S INSTRUMENT ONLY. The
//       ANSWERER GUARD's twin: an order whose answerer is not the
//       repair pass is refused by the plan itself (the night law
//       answers the tails; the measurement answers the unscored).
//
//   (b) THE MAP'S OWN SELECTION LAW SELECTS. The named refs ride
//       first in the map's own order (targetsNamedFirst - the 233
//       law, reused byte-exact), the member's own below-bar queue
//       fills the rest; one shot per member per call (the cap's own
//       shape, the 234 protocol's law); the calls run the members in
//       the gate's own standing order.
//
//   (c) THE NIGHT IS THE PLAN'S OWN. The fold law is the arc's: a
//       reading folds into its (source, shot, night) key, so the
//       medians move only as the NIGHTS do. A second repair night
//       rides its own tag (the acceptance night's precedent - the
//       distinct works keep distinct keys) and the plan names the
//       night on every call.
//
//   (d) THE CARRY RIDES EVERY CALL. The carried acceptance line
//       (acceptance-carry.ts - the verdict in hand) rides the calls
//       verbatim; a member with no answer carries the honest NONE
//       line. The ledger names what the next night knew.
//
// PURE: no db, no fs - the order, the queues, and the carry arrive
// as the arguments (the caller built them from the review and the
// gate's own reads). The smoke pins the exact words; the ride
// executes the plan line by line.
// ─────────────────────────────────────────────────────────────

import type { RepairWorkOrder } from "./repair-work-order";
import { targetsNamedFirst, type NamedFirstShot } from "./repair-work-order";
import type { CarriedAcceptance } from "./acceptance-carry";

export const RENDER_NIGHT_PLAN_LAW_VERSION = 235;

/** One member's below-bar queue, worst first (the gate's own order). */
export interface PlanMemberQueue {
  member: string;
  below: NamedFirstShot[];
}

/** One executable call: prerender + ride, the cap's own shape. */
export interface NightCall {
  /** 1-based, across the whole plan. */
  index: number;
  member: string;
  ref: string;
  shotId: string;
  night: string;
  /** The entry's own median reading before the call (pct, whole numbers). */
  beforePct: number;
  /** true when the call rides a named ref (the map's own order). */
  named: boolean;
  /** The carried acceptance line (in hand), verbatim; null when none. */
  carried: string | null;
  /** The call's prerender line (exact words - the smoke pins them). */
  prerenderLine: string;
  /** The call's ride line (exact words - the smoke pins them). */
  rideLine: string;
}

/** The plan, or the refusal (the guard's own line). */
export type NightPlan =
  | { ok: true; night: string; source: string; calls: NightCall[]; headline: string; lines: string[] }
  | { ok: false; line: string };

/**
 * THE NIGHT PLAN (pure): the RENDER order's named cells, spread
 * across the executor's cap as prerender+ride calls, the acceptance's
 * verdict in hand on every call. One shot per member per call
 * (callsPerMember, floored at 1, capped at the member's queue); the
 * members run in the queue order given (the gate's own standing
 * order); a below member with an empty queue rides an honest line,
 * never a silent skip.
 */
export function renderNightPlan(args: {
  order: RepairWorkOrder;
  queues: PlanMemberQueue[];
  carry: CarriedAcceptance[];
  night: string;
  callsPerMember?: number;
}): NightPlan {
  const { order, queues, carry, night } = args;
  if (order.answeredBy !== "repair-pass") {
    return {
      ok: false,
      line: `the night plan refuses: the ${order.source} order answers by ${order.answeredBy} - the plan answers the repair pass's instrument only (the night law answers the tails, the measurement answers the unscored).`,
    };
  }
  const per = Math.max(1, Math.round(Number(args.callsPerMember ?? 1) || 1));
  const carryByName = new Map(carry.map((c) => [c.characterName, c] as const));
  const calls: NightCall[] = [];
  const lines: string[] = [];
  for (const q of queues) {
    if (q.below.length === 0) {
      lines.push(`${q.member}: nothing below the bar rides - the member's own board is clear.`);
      continue;
    }
    // the map's own selection law: named refs first, the queue fills,
    // deduped by shot, capped at the call budget
    const order2 = targetsNamedFirst(q.below, order.namedRefs, Math.min(per, q.below.length));
    for (const t of order2.targets) {
      const index = calls.length + 1;
      const carried = carryByName.get(q.member)?.line ?? null;
      const beforePct = Math.round(t.similarity * 100);
      calls.push({
        index,
        member: q.member,
        ref: t.ref,
        shotId: t.shotId,
        night,
        beforePct,
        named: order.namedRefs.includes(t.ref),
        carried,
        prerenderLine: `night ${night} call ${index}: prerender ${q.member} ${t.ref} (${beforePct}%) - the bridge renders across the boundary; the 233 resume law carries the work.`,
        rideLine: `night ${night} call ${index}: ride ${q.member} ${t.ref} - the pass resumes the wait and the re-score appends night-tagged; the medians move only as the nights do.`,
      });
    }
  }
  for (const c of calls) {
    lines.push(c.prerenderLine);
    lines.push(c.rideLine);
    if (c.carried) lines.push(`night ${night} call ${c.index} carries: ${c.carried}`);
  }
  const namedCells = order.namedRefs.length > 0 ? order.namedRefs.join(", ") : "none named";
  const headline = `THE BODY'S OWN ANSWER: ${calls.length} call(s) for ${order.source} under ${night} - the named cells first (${namedCells}), the acceptance's verdict in hand where the arc carries it.`;
  return { ok: true, night, source: order.source, calls, headline, lines: [headline, ...lines] };
}
