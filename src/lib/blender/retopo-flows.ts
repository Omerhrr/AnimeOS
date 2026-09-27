import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// LEARNED RETOPO FLOWS (iteration 60 - the studio remembers its
// craft)
//
// A retopo run that verified is a LESSON, not an event. This is
// the production's retopo flow memory, shaped like the
// Terminology memory: a persistent row per named flow, keyed
// (project, kind, name), carrying the spec that drove the pass
// and the MEASURED record of every outcome it produced (tris
// before/after, drift %, verified verdict). The memory grows two
// ways:
//   - ADOPTION: DSH names a verified run and saves it
//     (learn_retopo_flow) - the same adoption law the
//     Terminology memory obeys ("that is how the memory grows").
//   - REINFORCEMENT: design_fix's retopo branch consults the
//     best-verified flow for the kind before it decimates, and
//     when the re-audit stops raising TOPOLOGY the flow earns a
//     clear. A flow that keeps clearing rises in the consult
//     ranking; the studio starts from what worked, not from a
//     fresh guess.
// The record is honest: an outcome is appended whatever it
// measured, verified or not - a flow's failures are part of its lesson.
// ─────────────────────────────────────────────────────────────

export interface RetopoOutcome {
  assetRef: string; // e.g. "PROP:Relic Blade v3" - what was decimated
  trisBefore: number | null;
  trisAfter: number | null;
  driftPct: number | null;
  verified: boolean;
  at: string; // ISO timestamp
}

export interface RetopoFlowSpec {
  budget: number;
  parts: string[];
}

const MAX_OUTCOMES = 24;

function parseOutcomes(raw: string | null | undefined): RetopoOutcome[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as RetopoOutcome[]) : [];
  } catch {
    return [];
  }
}

function parseSpec(raw: string | null | undefined): RetopoFlowSpec {
  try {
    const parsed = JSON.parse(raw || "{}") as Partial<RetopoFlowSpec>;
    return {
      budget: typeof parsed.budget === "number" ? parsed.budget : 20_000,
      parts: Array.isArray(parsed.parts) ? parsed.parts.map(String) : [],
    };
  } catch {
    return { budget: 20_000, parts: [] };
  }
}

export interface FlowRow {
  id: string;
  kind: string;
  name: string;
  spec: RetopoFlowSpec;
  outcomes: RetopoOutcome[];
  runs: number;
  clears: number;
  learnedFrom: string | null;
}

function toRow(f: {
  id: string; kind: string; name: string; spec: string; outcomes: string; runs: number; clears: number; learnedFrom: string | null;
}): FlowRow {
  return {
    id: f.id, kind: f.kind, name: f.name,
    spec: parseSpec(f.spec), outcomes: parseOutcomes(f.outcomes),
    runs: f.runs, clears: f.clears, learnedFrom: f.learnedFrom,
  };
}

/** Append a measured outcome to a flow's record and count the run.
 * The flow must exist (adoption creates it) - a missing flow is an
 * honest null, never a silent row. */
export async function recordRetopoOutcome(
  projectId: string,
  kind: string,
  name: string,
  outcome: Omit<RetopoOutcome, "at">,
): Promise<FlowRow | null> {
  const flow = await db.retopoFlow.findUnique({
    where: { projectId_kind_name: { projectId, kind, name } },
  });
  if (!flow) return null;
  const outcomes = [...parseOutcomes(flow.outcomes), { ...outcome, at: new Date().toISOString() }].slice(-MAX_OUTCOMES);
  const updated = await db.retopoFlow.update({
    where: { id: flow.id },
    data: { outcomes: JSON.stringify(outcomes), runs: { increment: 1 } },
  });
  return toRow(updated);
}

/** Reinforcement: the re-audit stopped raising TOPOLOGY after this
 * flow drove the pass - the flow earns a clear and rises in the
 * consult ranking. */
export async function reinforceRetopoFlow(projectId: string, kind: string, name: string): Promise<void> {
  await db.retopoFlow.updateMany({
    where: { projectId, kind, name },
    data: { clears: { increment: 1 } },
  });
}

/** ADOPTION: name a verified run and save it as the kind's named
 * flow law. An existing flow of the same name is re-lawed (the
 * spec updates; the record stays). Seeded with the run it was
 * learned from when one is given. */
export async function learnRetopoFlow(input: {
  projectId: string;
  kind: string;
  name: string;
  spec: RetopoFlowSpec;
  seedOutcome?: RetopoOutcome | null;
  learnedFrom?: string | null;
}): Promise<FlowRow> {
  const existing = await db.retopoFlow.findUnique({
    where: { projectId_kind_name: { projectId: input.projectId, kind: input.kind, name: input.name } },
  });
  const outcomes = input.seedOutcome ? [input.seedOutcome] : parseOutcomes(existing?.outcomes);
  const row = await db.retopoFlow.upsert({
    where: { projectId_kind_name: { projectId: input.projectId, kind: input.kind, name: input.name } },
    create: {
      projectId: input.projectId,
      kind: input.kind,
      name: input.name,
      spec: JSON.stringify(input.spec),
      outcomes: JSON.stringify(outcomes),
      learnedFrom: input.learnedFrom ?? null,
    },
    update: {
      spec: JSON.stringify(input.spec),
      learnedFrom: input.learnedFrom ?? existing?.learnedFrom ?? null,
    },
  });
  return toRow(row);
}

export async function findRetopoFlow(projectId: string, kind: string, name: string): Promise<FlowRow | null> {
  const exact = await db.retopoFlow.findUnique({
    where: { projectId_kind_name: { projectId, kind, name } },
  });
  if (exact) return toRow(exact);
  // A flow is named per kind, but DSH may recall the name without the
  // kind - resolve within the production before refusing.
  const loose = await db.retopoFlow.findFirst({ where: { projectId, name } });
  return loose ? toRow(loose) : null;
}

/** The flow design_fix consults: the kind's best-verified record -
 * flows that cleared the re-audit rank first, then by the share of
 * verified outcomes, then by experience. A flow that never verified
 * is never consulted. */
export async function bestRetopoFlow(projectId: string, kind: string): Promise<FlowRow | null> {
  const rows = await db.retopoFlow.findMany({
    where: { projectId, kind },
    orderBy: [{ clears: "desc" as const }, { runs: "desc" as const }],
    take: 12,
  });
  const flows = rows.map(toRow).filter((f) => f.outcomes.some((o) => o.verified));
  if (flows.length === 0) return null;
  const score = (f: FlowRow) => {
    const verified = f.outcomes.filter((o) => o.verified).length;
    const ratio = verified / Math.max(1, f.outcomes.length);
    const lastDrift = f.outcomes.length > 0 ? Math.max(0, 5 - (f.outcomes[f.outcomes.length - 1].driftPct ?? 5)) : 0;
    return f.clears * 10 + ratio * 5 + f.runs * 0.1 + lastDrift;
  };
  return flows.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function listRetopoFlows(projectId: string): Promise<FlowRow[]> {
  const rows = await db.retopoFlow.findMany({
    where: { projectId },
    orderBy: [{ kind: "asc" as const }, { clears: "desc" as const }],
    take: 24,
  });
  return rows.map(toRow);
}

/** The context line: the studio's learned retopo standing, read
 * before running a budget pass. */
export function retopoFlowsContextLine(flows: FlowRow[]): string | null {
  if (flows.length === 0) return null;
  const parts = flows.slice(0, 6).map((f) => {
    const verified = f.outcomes.filter((o) => o.verified).length;
    const last = f.outcomes.length > 0 ? f.outcomes[f.outcomes.length - 1] : null;
    return `${f.kind} '${f.name}' budget ${f.spec.budget.toLocaleString()} (${f.runs} run${f.runs === 1 ? "" : "s"}, ${f.clears} clear${f.clears === 1 ? "" : "s"}, ${verified}/${f.outcomes.length} verified${last && last.driftPct !== null ? `, last drift ${last.driftPct}%` : ""})`;
  });
  return `learned retopo flows: ${parts.join(" | ")}`;
}
