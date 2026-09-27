import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// LEARNED SEQUENCE FLOWS (iteration 63 - the studio remembers
// its sentences)
//
// A direction that verified is a LESSON, not an event. This is
// the production's sequence flow memory, shaped like the retopo
// flows and the sculpt plans: a persistent row per named flow,
// keyed (project, register, name), carrying the slot sentence
// that drove the directions and the MEASURED record of every
// outcome it produced (scope, shots stamped, wind beats, pose
// cuts, move clashes, world bindings, renders queued). The
// memory grows two ways:
//   - ADOPTION: DSH names a verified SEQUENCE program and saves
//     it as the register's named flow (learn_sequence_flow) -
//     the same adoption law the retopo flows and the
//     Terminology memory obey ("that is how the memory grows").
//   - APPLICATION: every direct_sequence that drives the flow
//     (or the program it was learned from) appends what the run
//     MEASURED. A direction that landed whole (every slot
//     stamped a real shot) verifies; one whose flow read raised
//     no blocking note (zero move clashes) on top of that earns
//     the flow a clear and rises in the consult ranking.
// The consult: when DSH directs WITHOUT naming a program or
// slots, direct_sequence register:'<register>' starts from the
// register's best-proven flow - the sentence that verified
// before, not a fresh guess. The record is honest: an outcome is
// appended whatever it measured, verified or not - a flow's
// failures are part of its lesson.
// ─────────────────────────────────────────────────────────────

export const SEQUENCE_REGISTERS = [
  "BATTLE",
  "PURSUIT",
  "REVEAL",
  "STANDOFF",
  "RITUAL",
  "INTRIGUE",
  "RESOLVE",
] as const;

export type SequenceRegister = (typeof SEQUENCE_REGISTERS)[number];

export function isSequenceRegister(v: string): v is SequenceRegister {
  return (SEQUENCE_REGISTERS as readonly string[]).includes(v);
}

export interface SequenceFlowSlot {
  grammar: string;
  poseStart: string | null;
  poseEnd: string | null;
  fx: string | null;
  physics: string | null;
  note: string | null;
}

export interface SequenceFlowSpec {
  description: string | null;
  slots: SequenceFlowSlot[];
}

export interface SequenceOutcome {
  scope: string; // "scene 2" | "episode 1 (2 scenes)"
  program: string | null; // the named program that drove it, if any
  slots: number; // slots in the sentence
  directed: number; // shots the direction stamped
  untouched: number; // shots beyond the plan
  unused: number; // slots that had no shot to direct
  windBeats: number;
  poseCuts: number;
  moveClashes: number;
  fxBound: number;
  physBound: number;
  rendersQueued: number;
  verified: boolean; // the sentence landed whole: every slot stamped a real shot
  at: string; // ISO timestamp
}

const MAX_OUTCOMES = 24;

export function parseSlots(raw: string | null | undefined): SequenceFlowSlot[] {
  try {
    const parsed = JSON.parse(raw || "{}") as Partial<SequenceFlowSpec>;
    return Array.isArray(parsed.slots) ? (parsed.slots as SequenceFlowSlot[]) : [];
  } catch {
    return [];
  }
}

function parseOutcomes(raw: string | null | undefined): SequenceOutcome[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as SequenceOutcome[]) : [];
  } catch {
    return [];
  }
}

export interface FlowRow {
  id: string;
  register: string;
  name: string;
  spec: SequenceFlowSpec;
  outcomes: SequenceOutcome[];
  runs: number;
  clears: number;
  learnedFrom: string | null;
}

function toRow(f: {
  id: string; register: string; name: string; spec: string; outcomes: string; runs: number; clears: number; learnedFrom: string | null;
}): FlowRow {
  return {
    id: f.id, register: f.register, name: f.name,
    spec: { description: null, slots: parseSlots(f.spec) },
    outcomes: parseOutcomes(f.outcomes),
    runs: f.runs, clears: f.clears, learnedFrom: f.learnedFrom,
  };
}

/** ADOPTION: name a verified sequence program and save it as the
 * register's named flow law. The slots come from the program's
 * design-time-validated spec (learn_sequence_flow validates before
 * calling). An existing flow of the same name is re-lawed (the spec
 * updates; the record stays). */
export async function learnSequenceFlow(input: {
  projectId: string;
  register: string;
  name: string;
  spec: SequenceFlowSpec;
  learnedFrom?: string | null;
}): Promise<FlowRow> {
  const existing = await db.sequenceFlow.findUnique({
    where: { projectId_register_name: { projectId: input.projectId, register: input.register, name: input.name } },
  });
  const row = await db.sequenceFlow.upsert({
    where: { projectId_register_name: { projectId: input.projectId, register: input.register, name: input.name } },
    create: {
      projectId: input.projectId,
      register: input.register,
      name: input.name,
      spec: JSON.stringify(input.spec),
      outcomes: JSON.stringify([]),
      learnedFrom: input.learnedFrom ?? null,
    },
    update: {
      spec: JSON.stringify(input.spec),
      learnedFrom: input.learnedFrom ?? existing?.learnedFrom ?? null,
    },
  });
  return toRow(row);
}

export async function findSequenceFlow(projectId: string, register: string, name: string): Promise<FlowRow | null> {
  const exact = await db.sequenceFlow.findUnique({
    where: { projectId_register_name: { projectId, register, name } },
  });
  if (exact) return toRow(exact);
  // A flow is named per register, but DSH may recall the name without
  // the register - resolve within the production before refusing.
  const loose = await db.sequenceFlow.findFirst({ where: { projectId, name } });
  return loose ? toRow(loose) : null;
}

/** The flows a named program taught: applications of the program grow
 * every flow it was learned from (usually one; a program adopted under
 * two registers teaches both memories honestly). */
export async function flowsLearnedFromProgram(projectId: string, programName: string): Promise<FlowRow[]> {
  const rows = await db.sequenceFlow.findMany({ where: { projectId, learnedFrom: programName } });
  return rows.map(toRow);
}

/** Append the measured outcome of one direction to a flow's record
 * and count the run. Reinforces on the same write when the direction
 * landed whole with no blocking note (the clear law). Returns null
 * when the flow vanished - a missing flow is an honest null, never a
 * silent row. */
export async function recordSequenceOutcome(
  projectId: string,
  register: string,
  name: string,
  outcome: Omit<SequenceOutcome, "at">,
): Promise<FlowRow | null> {
  const flow = await db.sequenceFlow.findUnique({
    where: { projectId_register_name: { projectId, register, name } },
  });
  if (!flow) return null;
  const verified = outcome.verified;
  const cleared = verified && outcome.moveClashes === 0;
  const outcomes = [...parseOutcomes(flow.outcomes), { ...outcome, at: new Date().toISOString() }].slice(-MAX_OUTCOMES);
  const updated = await db.sequenceFlow.update({
    where: { id: flow.id },
    data: {
      outcomes: JSON.stringify(outcomes),
      runs: { increment: 1 },
      ...(cleared ? { clears: { increment: 1 } } : {}),
    },
  });
  return toRow(updated);
}

/** The flow direct_sequence consults: the register's best-proven
 * record - flows that cleared rank first, then by the share of
 * verified outcomes, then by experience. A flow that never landed
 * whole is never consulted. */
export async function bestSequenceFlow(projectId: string, register: string): Promise<FlowRow | null> {
  const rows = await db.sequenceFlow.findMany({
    where: { projectId, register },
    orderBy: [{ clears: "desc" as const }, { runs: "desc" as const }],
    take: 12,
  });
  const flows = rows.map(toRow).filter((f) => f.outcomes.some((o) => o.verified));
  if (flows.length === 0) return null;
  const score = (f: FlowRow) => {
    const verified = f.outcomes.filter((o) => o.verified).length;
    const ratio = verified / Math.max(1, f.outcomes.length);
    const last = f.outcomes.length > 0 ? f.outcomes[f.outcomes.length - 1] : null;
    const lastBonus = last && last.moveClashes === 0 && last.verified ? 1 : 0;
    return f.clears * 10 + ratio * 5 + f.runs * 0.1 + lastBonus;
  };
  return flows.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function listSequenceFlows(projectId: string): Promise<FlowRow[]> {
  const rows = await db.sequenceFlow.findMany({
    where: { projectId },
    orderBy: [{ register: "asc" as const }, { clears: "desc" as const }],
    take: 24,
  });
  return rows.map(toRow);
}

/** The context line: the studio's remembered sentences, read before
 * directing any sequence. */
export function sequenceFlowsContextLine(flows: FlowRow[]): string | null {
  if (flows.length === 0) return null;
  const parts = flows.slice(0, 6).map((f) => {
    const verified = f.outcomes.filter((o) => o.verified).length;
    const chain = f.spec.slots.map((s) => s.grammar).join(">");
    return `${f.register} '${f.name}' ${chain} (${f.runs} run${f.runs === 1 ? "" : "s"}, ${f.clears} clear${f.clears === 1 ? "" : "s"}, ${verified}/${f.outcomes.length} landed whole)`;
  });
  return `learned sequence flows: ${parts.join(" | ")}`;
}
