import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// LEARNED SEQUENCE FLOWS (iteration 63 - the studio remembers
// its sentences; iteration 64 - the sentence calls the air,
// the consult names its teachers)
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
//     The consult proposes it itself now: every program-driven
//     direction lands its measured record on the PROGRAM's own
//     ledger, and a program that verified without a flow is named
//     by the consult (success, refusal, and the context line) -
//     a proven sentence should not wait to be remembered.
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
  /** The slot's air call (iteration 64): a number drives EVERY beat of
   * the slot's grammar, an array is keyed per beat (null leaves the
   * grammar's own call - explicit 0 is a stillness call that calms a
   * gusty grammar). Validated at design time against the compiled
   * grammar's beat count - a typo never reaches a shoot. */
  wind?: Array<number | null> | number | null;
  /** The slot's SOLVER call (iteration 68): a number 0..1 that scales
   * the cloth solver's ANSWER for the whole shot - the directed air,
   * the beat impulse, the stagger sway - never its physics. A per-shot
   * answer, not a per-beat gust; absent = the full probed response. */
  cloth?: number | null;
  /** The slot's FLESH call (iteration 69): a number 0..1 that scales
   * the soft-body solver's ANSWER for the whole shot - the lag the
   * trunk and face volumes answer the beats with. Per-shot like the
   * cloth call; absent = the full probed response. */
  flesh?: number | null;
  /** The slot's CHAINED PERFORMANCE (iteration 78 - the sentence calls
   * the motion): a CHOREOGRAPHY source name the stamped shot PERFORMS
   * (a saved choreography preset, a built-in - The Combo / The Draw
   * Storm / The Rising Fang - or, the point of the chain, a LEARNED
   * MOTION FLOW whose verified timing re-performs on every shot the
   * slot stamps). Validated at design time against the choreography
   * registry; applied through the same flow-aware path
   * set_shot_choreography uses, so applied records grow and the
   * flow's verified evidence rides along. */
  motion?: string | null;
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
  motionChained: number; // slots that chained a choreography/motion performance onto their shot (iteration 78)
  rendersQueued: number;
  verified: boolean; // the sentence landed whole: every slot stamped a real shot
  at: string; // ISO timestamp
}

const MAX_OUTCOMES = 24;

/** The outcome a PROGRAM-driven direction lands on the program's own
 * ledger (same shape the flows keep, minus the program field - it IS
 * the program). */
export type SequenceProgramOutcome = Omit<SequenceOutcome, "program" | "at"> & { program?: string | null };

export interface ProgramRecord {
  name: string;
  runs: number; // directions the program drove (of the kept record)
  verifiedRuns: number; // directions that landed whole
  lastVerified: boolean | null;
}

function parseProgramOutcomes(raw: string | null | undefined): SequenceProgramOutcome[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as SequenceProgramOutcome[]) : [];
  } catch {
    return [];
  }
}

/** The program's own measured record (iteration 64): every
 * program-driven direction appends what it measured, verified or not
 * - the same honest ledger the flows keep, so the consult can name
 * the sentences that PROVED themselves.
 * Returns null when the preset vanished - an honest null, never a
 * silent row. */
export async function recordProgramOutcome(
  projectId: string,
  programName: string,
  outcome: SequenceProgramOutcome,
): Promise<ProgramRecord | null> {
  const preset = await db.designPreset.findUnique({
    where: { projectId_kind_name: { projectId, kind: "SEQUENCE", name: programName } },
  });
  if (!preset) return null;
  const outcomes = [...parseProgramOutcomes(preset.outcomes), { ...outcome, at: new Date().toISOString() }].slice(-MAX_OUTCOMES);
  await db.designPreset.update({ where: { id: preset.id }, data: { outcomes: JSON.stringify(outcomes) } });
  return programRecord(preset.name, outcomes);
}

function programRecord(name: string, outcomes: SequenceProgramOutcome[]): ProgramRecord {
  const last = outcomes.length > 0 ? outcomes[outcomes.length - 1] : null;
  return {
    name,
    runs: outcomes.length,
    verifiedRuns: outcomes.filter((o) => o.verified).length,
    lastVerified: last ? last.verified : null,
  };
}

/** The verified-but-unadopted programs (iteration 64): SEQUENCE
 * programs whose directions landed whole but that no learned flow
 * carries yet (no flow was ever learned from them). This is what the
 * consult reads before it answers - the studio proposes adopting its
 * own proven sentences instead of waiting for DSH to remember. */
export async function unadoptedVerifiedPrograms(projectId: string): Promise<ProgramRecord[]> {
  const [presets, flows] = await Promise.all([
    db.designPreset.findMany({
      where: { projectId, kind: "SEQUENCE" },
      orderBy: { updatedAt: "desc" as const },
      take: 40,
      select: { name: true, outcomes: true },
    }),
    db.sequenceFlow.findMany({ where: { projectId }, select: { learnedFrom: true } }),
  ]);
  const adopted = new Set(flows.map((f) => f.learnedFrom).filter((n): n is string => Boolean(n)));
  return presets
    .filter((p) => !adopted.has(p.name))
    .map((p) => programRecord(p.name, parseProgramOutcomes(p.outcomes)))
    .filter((p) => p.verifiedRuns > 0)
    .slice(0, 6);
}

/** The consult's adoption suggestion line: the proven sentences no
 * flow carries yet, named so DSH can adopt them in one call. */
export function sequenceAdoptionSuggestionsLine(programs: ProgramRecord[]): string | null {
  if (programs.length === 0) return null;
  const parts = programs
    .slice(0, 2)
    .map((p) => `'${p.name}' (${p.verifiedRuns} landed-whole run${p.verifiedRuns === 1 ? "" : "(s)"} of ${p.runs})`);
  return `Adoption: ${parts.join(", ")} verified but no flow carries ${programs.length === 1 ? "it" : "them"} yet - learn_sequence_flow register:'<register>' program:'<name>' grows the memory (the consult only starts from what adopted).`;
}

// ── THE SLOT'S AIR CALL (iteration 64 - per-beat secondary motion
//    at sequence scale) ──
// The worker's secondary rig rides each grammar beat's wind (the
// gust the cloth and hair answer). A grammar carries its own wind
// per beat; a SEQUENCE slot may now call the air OVER the grammar:
// a number drives every beat of the slot's grammar, an array is
// keyed per beat (null keeps the grammar's own gust; explicit 0 is
// a stillness call that calms a gusty grammar). Validated at design
// time against the compiled grammar's beat count - a typo never
// reaches a shoot.

export function compileSlotWind(
  input: unknown,
  label: string,
): { ok: true; wind: Array<number | null> | number | null } | { ok: false; error: string } {
  if (input === undefined || input === null || input === "") return { ok: true, wind: null };
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return { ok: false, error: `${label}: an empty wind array directs no air - pass a number 0..1 or one entry per beat (null keeps the grammar's own gust)` };
    }
    const out: Array<number | null> = [];
    for (let i = 0; i < input.length; i++) {
      const e = input[i];
      if (e === null || e === undefined || e === "") {
        out.push(null);
        continue;
      }
      const w = Number(e);
      if (!Number.isFinite(w)) {
        return { ok: false, error: `${label}: wind[${i}] must be a number 0..1 or null (got ${String(e)})` };
      }
      out.push(clamp(w));
    }
    return { ok: true, wind: out };
  }
  const w = Number(input);
  if (!Number.isFinite(w)) {
    return { ok: false, error: `${label}: wind must be a number 0..1 or an array keyed per beat (got ${String(input)})` };
  }
  return { ok: true, wind: clamp(w) };
}

/** Does the slot's air call fit the grammar it rides? An array may
 * not name more beats than the grammar directs (shorter is fine -
 * the unnamed beats keep their own call). Returns the error or null. */
export function windFitsGrammar(wind: Array<number | null> | number | null, beatCount: number, label: string): string | null {
  if (Array.isArray(wind) && wind.length > beatCount) {
    return `${label}: wind names ${wind.length} beat(s) but the grammar directs ${beatCount} - the air call must fit the grammar's beats`;
  }
  return null;
}

/** Apply a slot's air call to a freshly compiled grammar's beats,
 * mutating in place (the compiled spec is per-shot, never shared).
 * Returns how many beats the call actually touched. */
export function applySlotWind(beats: Array<{ wind?: number | null }>, wind: Array<number | null> | number | null): number {
  if (wind === null || wind === undefined) return 0;
  let touched = 0;
  if (Array.isArray(wind)) {
    beats.forEach((b, i) => {
      const w = wind[i];
      if (w !== null && w !== undefined) {
        b.wind = w;
        touched += 1;
      }
    });
  } else {
    beats.forEach((b) => {
      b.wind = wind as number;
      touched += 1;
    });
  }
  return touched;
}

/** Format an air call for the flow read (honest about stillness). */
export function formatSlotWind(wind: Array<number | null> | number | null): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  if (Array.isArray(wind)) return `wind [${wind.map((w) => (w === null ? "keep" : n(w))).join(",")}]`;
  return `wind ${wind === null ? "-" : n(wind)}`;
}

// ── THE SLOT'S SOLVER CALL (iteration 68 - per-shot solver
//    intensity at sequence scale) ──
// The cloth solver answers the air the sentence calls; its INTENSITY
// is itself directable. A CLOTH call is one number 0..1 per shot that
// scales the solver's ANSWER - the directed air, the beat impulse,
// the stagger sway - never its physics (mass, stiffness and the pin
// law stay probed). Absent = the full probed response; 0 is a
// stillness call (the anchors hold, the solver settles the garment).
// It is deliberately NOT per-beat: the wind call is the per-beat
// gust, the cloth call is the whole shot's answer.

export function compileSlotCloth(
  input: unknown,
  label: string,
): { ok: true; cloth: number | null } | { ok: false; error: string } {
  if (input === undefined || input === null || input === "") return { ok: true, cloth: null };
  if (Array.isArray(input)) {
    return { ok: false, error: `${label}: a CLOTH call is one number 0..1 for the whole shot - the solver's intensity is a per-shot answer, not a per-beat gust (the wind call is the per-beat one)` };
  }
  const c = Number(input);
  if (!Number.isFinite(c)) {
    return { ok: false, error: `${label}: cloth must be a number 0..1 (got ${String(input)})` };
  }
  return { ok: true, cloth: Math.max(0, Math.min(1, c)) };
}

/** Format a solver call for the flow read (absent formats empty). */
export function formatSlotCloth(cloth: number | null): string {
  if (cloth === null || cloth === undefined) return "";
  const n = Number.isInteger(cloth) ? String(cloth) : cloth.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `cloth ${n}`;
}

// ── THE SLOT'S FLESH CALL (iteration 69 - the soft-body solver's
//    per-shot intensity at sequence scale) ──
// One solver up from the cloth: the trunk and face volumes answer the
// beats with real inertia lag, and its INTENSITY is directable the
// same way the cloth's is - one number 0..1 per shot that scales the
// solver's ANSWER (the beat impulse, the stagger sway, the wind
// breath), never its physics (the probed goal law stays).

export function compileSlotFlesh(
  input: unknown,
  label: string,
): { ok: true; flesh: number | null } | { ok: false; error: string } {
  if (input === undefined || input === null || input === "") return { ok: true, flesh: null };
  if (Array.isArray(input)) {
    return { ok: false, error: `${label}: a FLESH call is one number 0..1 for the whole shot - the soft-body solver's intensity is a per-shot answer, not a per-beat gust (the wind call is the per-beat one)` };
  }
  const c = Number(input);
  if (!Number.isFinite(c)) {
    return { ok: false, error: `${label}: flesh must be a number 0..1 (got ${String(input)})` };
  }
  return { ok: true, flesh: Math.max(0, Math.min(1, c)) };
}

/** Format a flesh call for the flow read (absent formats empty). */
export function formatSlotFlesh(flesh: number | null): string {
  if (flesh === null || flesh === undefined) return "";
  const n = Number.isInteger(flesh) ? String(flesh) : flesh.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `flesh ${n}`;
}

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
