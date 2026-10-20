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
//   (e) THE LEVER AIMS EVERY CALL (iteration 236). The carry arms
//       the craft lever (craft-lever.ts - the honest receipt is the
//       precondition) and the cell's own framing names the rung:
//       the judge reads the build's FACE at close/med framings, the
//       PAINT at wide framings; the proportion rung is refused
//       (spent - probe-140's own verdict). The caller carries the
//       framings map (shotId -> bucket, the matrix's own read off
//       the live shots); a shot the map lacks rides lever null -
//       named, never guessed (the 232 purity law). The aim line
//       rides the plan's own lines.
//
//   (f) THE AIM CARRIES ITS RUNG (iteration 237). The 236 plan named
//       the aim as a line of prose - and prose renders nothing: the
//       pass re-rendered the aimed cells and the payload never heard
//       the rung, so the judge scored the same craft a third time.
//       The call now carries the RUNG beside the line (face | paint),
//       and the render grows the rung's own arm (the face framings'
//       texels, the paint's own quality) - the aim becomes the
//       render's craft, the pull is executable end to end.
//
// PURE: no db, no fs - the order, the queues, the carry, and the
// framings arrive as the arguments (the caller built them from the
// review, the gate's own reads, and the live shots). The smoke pins
// the exact words; the ride executes the plan line by line.
// ─────────────────────────────────────────────────────────────

import type { RepairWorkOrder } from "./repair-work-order";
import { targetsNamedFirst, type NamedFirstShot } from "./repair-work-order";
import type { CarriedAcceptance } from "./acceptance-carry";
import { craftLeverForCell } from "./craft-lever";

export const RENDER_NIGHT_PLAN_LAW_VERSION = 238;

/** One member's below-bar queue, worst first (the gate's own order). */
export interface PlanMemberQueue {
  member: string;
  below: NamedFirstShot[];
}

/** THE COHORT'S OWN DOOR (iteration 239): the members the craft move
 *  leaves UNTESTED, their named cells in hand - the measurement the
 *  night owes (the repair stays BELOW-only; the door is named). */
export interface PlanOpenQueue {
  member: string;
  namedShots: Array<{ shotId: string; ref: string }>;
}

/** One executable call: prerender + ride, the cap's own shape. */
export interface NightCall {
  /** 1-based, across the whole plan. */
  index: number;
  member: string;
  ref: string;
  shotId: string;
  night: string;
  /** The entry's own median reading before the call (pct, whole
   *  numbers); null when the call rides the cohort's own door (the
   *  239 law: the cell's first reading in the present tense -
   *  nothing moved FROM). */
  beforePct: number | null;
  /** true when the call rides a named ref (the map's own order). */
  named: boolean;
  /** The carried acceptance line (in hand), verbatim; null when none. */
  carried: string | null;
  /** The craft lever's aim line (the rung the judge reads at this
   *  framing); null when the caller carries no framing for the shot
   *  or the carry does not arm the lever - named, never guessed. */
  lever: string | null;
  /** The aim's own rung (face | paint) - the render's craft arm the
   *  call pulls; null with the lever (an unarmed call renders the
   *  standing craft, byte-exact). The 237 law: the aim carries its
   *  rung, not just its line. */
  rung: "face" | "paint" | null;
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
 * verdict in hand on every call, the craft lever aiming every call
 * the carry arms and the framings name. One shot per member per call
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
  /** shotId -> the matrix's own framing bucket, gathered from the
   *  live shots; absent shots ride lever null (never guessed). */
  framings?: Record<string, "close" | "med" | "wide">;
  /** THE COHORT'S OWN DOOR (iteration 239): the members the craft
   *  move leaves UNTESTED with their named cells - the measurement
   *  calls the night owes (deduped against the below queues' own
   *  refs; the door rides the work order's named cells only). */
  openQueues?: PlanOpenQueue[];
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
  const framings = args.framings ?? {};
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
      const carriedAnswer = carryByName.get(q.member);
      const carried = carriedAnswer?.line ?? null;
      const framing = framings[t.shotId];
      // the lever arms only under the honest receipt (the carry's
      // own verdict) and only when the caller carries the shot's
      // framing - a lever aimed without either is a guess, and the
      // plan does not guess (the 232 purity law)
      const leverAnswer =
        framing && carriedAnswer
          ? craftLeverForCell({ ref: t.ref, framing, carry: carriedAnswer.verdict })
          : null;
      const lever = leverAnswer && leverAnswer.ok ? leverAnswer.lever.line : null;
      // THE AIM CARRIES ITS RUNG (237): the rung rides beside the
      // line - the caller aims the render with it (the pull's wire).
      const rung = leverAnswer && leverAnswer.ok ? leverAnswer.lever.rung : null;
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
        lever,
        rung,
        prerenderLine: `night ${night} call ${index}: prerender ${q.member} ${t.ref} (${beforePct}%) - the bridge renders across the boundary; the 233 resume law carries the work.`,
        rideLine: `night ${night} call ${index}: ride ${q.member} ${t.ref} - the pass resumes the wait and the re-score appends night-tagged; the medians move only as the nights do.`,
      });
    }
  }
  // THE COHORT'S OWN DOOR (iteration 239): the craft moved, the
  // cohort opened, and the cells the move leaves unmeasured owe the
  // present tense their first reading. The door's calls ride the
  // caller's own named cells (the member's own below-bar history -
  // the cells the member's queue would answer if the present tense
  // carried them), deduped against the below queues' own refs - a
  // cell the repair already carries rides once. The same lever law
  // arms them (the carry + the framing), and the before reads null
  // (the first reading IS the night's answer).
  const riddenRefs = new Set(calls.map((c) => c.ref));
  for (const q of args.openQueues ?? []) {
    for (const t of q.namedShots) {
      if (riddenRefs.has(t.ref)) continue;
      riddenRefs.add(t.ref);
      const index = calls.length + 1;
      const carriedAnswer = carryByName.get(q.member);
      const carried = carriedAnswer?.line ?? null;
      const framing = framings[t.shotId];
      const leverAnswer =
        framing && carriedAnswer
          ? craftLeverForCell({ ref: t.ref, framing, carry: carriedAnswer.verdict })
          : null;
      const lever = leverAnswer && leverAnswer.ok ? leverAnswer.lever.line : null;
      const rung = leverAnswer && leverAnswer.ok ? leverAnswer.lever.rung : null;
      calls.push({
        index,
        member: q.member,
        ref: t.ref,
        shotId: t.shotId,
        night,
        beforePct: null,
        named: true,
        carried,
        lever,
        rung,
        prerenderLine: `night ${night} call ${index}: prerender ${q.member} ${t.ref} (untested in the present cohort) - the cohort's own door: the craft moved, the cell owes its first reading; the bridge renders across the boundary.`,
        rideLine: `night ${night} call ${index}: ride ${q.member} ${t.ref} - the pass measures the cohort's own cell and the re-score appends night-tagged; the medians move only as the nights do.`,
      });
    }
  }
  for (const c of calls) {
    lines.push(c.prerenderLine);
    lines.push(c.rideLine);
    if (c.carried) lines.push(`night ${night} call ${c.index} carries: ${c.carried}`);
    if (c.lever) lines.push(`night ${night} call ${c.index} aims: ${c.lever}`);
  }
  const namedCells = order.namedRefs.length > 0 ? order.namedRefs.join(", ") : "none named";
  const headline = `THE BODY'S OWN ANSWER: ${calls.length} call(s) for ${order.source} under ${night} - the named cells first (${namedCells}), the acceptance's verdict in hand where the arc carries it.`;
  return { ok: true, night, source: order.source, calls, headline, lines: [headline, ...lines] };
}
