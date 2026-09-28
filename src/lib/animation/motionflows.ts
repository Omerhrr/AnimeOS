// ─────────────────────────────────────────────────────────────
// LEARNED MOTION FLOWS (iteration 77) - THE MOTION IS LEARNED
//
// A verified render is a lesson, not an event. When a shot's KEYED
// performance renders and the pixels verify, the studio can ADOPT
// that program as a named MOTION FLOW: the production's memory of
// how a pose transition is performed (the anticipation that earned
// the strike, the hold that sold the read) for a dramatic register.
// Later shots consult the flows: applying one re-performs the
// verified timing, and every passing review of a flow-carrying shot
// grows the flow's verified record.
//
// Pure module - the laws, gates and ranking. Storage is the
// MotionFlow table; the pens are learn_motion_flow (adopt) and
// set_shot_choreography (apply, flow-aware).
// ─────────────────────────────────────────────────────────────

import type { ChoreoProgram } from "./choreography";

/** The dramatic registers a motion flow can serve (the sequence-flow law). */
export const MOTION_REGISTERS = [
  "BATTLE",
  "PURSUIT",
  "REVEAL",
  "STANDOFF",
  "RITUAL",
  "INTRIGUE",
  "RESOLVE",
] as const;

export type MotionRegister = (typeof MOTION_REGISTERS)[number];

export function isMotionRegister(v: string): v is MotionRegister {
  return (MOTION_REGISTERS as readonly string[]).includes(v);
}

/** The shot statuses that verify a motion program without a review. */
export const MOTION_FLOW_VERIFIED_STATUSES = ["APPROVED", "FINAL"] as const;

export interface FlowShotState {
  status: string;
  choreo: string | null;
}

export interface FlowReviewState {
  state: string; // PASSED | NEEDS_WORK | REVIEWED
  overall: number | null;
  bar: number;
}

/**
 * THE ADOPTION LAW: a flow is learned only from a VERIFIED render -
 * the shot's review passed its bar, or the shot itself was approved
 * / finalized by a human. A motion nobody verified is a motion
 * nobody should remember.
 */
export function motionFlowAdoptionGate(
  shot: FlowShotState,
  review: FlowReviewState | null,
): { ok: boolean; reason: string } {
  const status = String(shot.status ?? "").toUpperCase();
  if ((MOTION_FLOW_VERIFIED_STATUSES as readonly string[]).includes(status)) {
    return { ok: true, reason: `the shot is ${status}` };
  }
  if (!review) {
    return {
      ok: false,
      reason: "the shot has no pixel review yet - run review_render on its finished render first (or approve/final the shot)",
    };
  }
  if (review.state !== "PASSED") {
    return { ok: false, reason: `the shot's pixel review is ${review.state}, not PASSED` };
  }
  if (review.overall === null || review.overall < review.bar) {
    return {
      ok: false,
      reason: `the review's overall ${(review.overall ?? 0).toFixed(2)} does not clear its bar ${review.bar.toFixed(2)}`,
    };
  }
  return { ok: true, reason: `the review PASSED at ${(review.overall * 100).toFixed(0)}%` };
}

/** The `_flow` marker a flow-sourced application stores on the shot's choreo column. */
export function flowNameFromChoreo(choreo: string | null): string | null {
  if (!choreo) return null;
  try {
    const parsed = JSON.parse(choreo) as { flow?: unknown };
    return typeof parsed.flow === "string" && parsed.flow.trim() ? parsed.flow.trim() : null;
  } catch {
    return null;
  }
}

export interface MotionFlowRowLike {
  register: string;
  verified: number;
  applied: number;
  updatedAt: Date;
}

/**
 * THE CONSULT LAW: strongest evidence first - a flow the renders
 * keep verifying outranks a flow that was only ever applied, which
 * outranks a fresh adoption. `register` narrows when given.
 */
export function rankMotionFlows<T extends MotionFlowRowLike>(flows: T[], register?: string | null): T[] {
  const pool = register ? flows.filter((f) => f.register === register) : flows;
  return [...pool].sort((a, b) =>
    b.verified - a.verified ||
    b.applied - a.applied ||
    b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

export interface MotionFlowContextFlow {
  name: string;
  register: string;
  poseFrom: string;
  poseTo: string;
  verified: number;
  applied: number;
}

/** The DSH context line: the production's learned motion vocabulary. */
export function motionFlowsContextLine(flows: MotionFlowContextFlow[]): string | null {
  if (flows.length === 0) return null;
  const parts = flows.map((f) =>
    `'${f.name}' (${f.register.toLowerCase()}) ${f.poseFrom.toLowerCase()}->${f.poseTo.toLowerCase()} x${f.applied}/${f.verified}v`,
  );
  return `learned motion flows - apply with set_shot_choreography choreo:'<name>' : ${parts.join(", ")}`;
}
