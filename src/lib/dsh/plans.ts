import { db } from "@/lib/db";
import { TOOL_DEFS, executeTool } from "@/lib/dsh/tools";

// ─────────────────────────────────────────────────────────────
// DSH PLANS THAT SURVIVE THE TURN
//
// The director reasons inside one turn (max 4 tool rounds); work
// that spans episodes or days needs memory. A DshPlan is an ordered
// list of tool calls landed by DSH (or the creator):
//
//   • PROPOSED  - waiting in the review panel. The creator approves
//     it (UI button or steer_plan) - nothing runs before approval.
//   • ACTIVE    - run_plan executes the next 1..3 steps per call and
//     reports each result; production events name the plan and step.
//   • PAUSED    - holds between steps; resume re-opens the runner.
//   • DONE      - cursor reached the end (every step recorded).
//   • ABORTED   - the director pulled the plug.
//
// A step that ERRORS records the failure and STOPS the auto-run with
// the cursor parked AT the failed step, so the cause can be fixed and
// the step retried - supervision, not blind chaining.
// ─────────────────────────────────────────────────────────────

export const MAX_PLAN_STEPS = 12;
export const MAX_PLAN_RUN_STEPS = 3;

export interface PlanStep {
  tool: string;
  args: Record<string, unknown>;
  why: string;
  status: "PENDING" | "DONE" | "ERROR";
  result?: string;
  at?: string;
}

export interface PlanView {
  id: string;
  title: string;
  goal: string;
  status: "PROPOSED" | "ACTIVE" | "PAUSED" | "DONE" | "ABORTED";
  source: "DSH" | "CREATOR";
  cursor: number;
  total: number;
  done: number;
  failed: number;
  steps: PlanStep[];
  createdAt: string;
  updatedAt: string;
}

/** Tools a plan may not call: the plan meta-tools themselves. */
const PLAN_META_TOOLS = new Set(["create_plan", "run_plan", "steer_plan"]);

function safeSteps(raw: string): PlanStep[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PlanStep[]) : [];
  } catch {
    return [];
  }
}

/** Parse a plan's stored steps JSON defensively (context lines, UI reuse). */
export function parsePlanSteps(raw: string): PlanStep[] {
  return safeSteps(raw);
}

function viewOf(plan: {
  id: string; title: string; goal: string; status: string; source: string;
  steps: string; cursor: number; createdAt: Date; updatedAt: Date;
}): PlanView {
  const steps = safeSteps(plan.steps);
  const status = (["PROPOSED", "ACTIVE", "PAUSED", "DONE", "ABORTED"].includes(plan.status) ? plan.status : "DONE") as PlanView["status"];
  return {
    id: plan.id,
    title: plan.title,
    goal: plan.goal,
    status,
    source: (plan.source === "CREATOR" ? "CREATOR" : "DSH") as PlanView["source"],
    cursor: plan.cursor,
    total: steps.length,
    done: steps.filter((s) => s.status === "DONE").length,
    failed: steps.filter((s) => s.status === "ERROR").length,
    steps,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * Validate + normalize a plan's steps: every tool must exist in the
 * registry, meta-tools are refused (no recursion), args must be an
 * object and every step gets a why. Returns the clean steps or a
 * precise reason.
 */
export function validatePlanSteps(input: unknown): { ok: true; steps: PlanStep[] } | { ok: false; error: string } {
  let rows: unknown[] = [];
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) rows = parsed;
    } catch {
      return { ok: false, error: "steps must be a JSON array of {tool, args, why}" };
    }
  } else if (Array.isArray(input)) {
    rows = input;
  }
  if (rows.length === 0) return { ok: false, error: "a plan needs at least one step: steps = [{tool, args, why}, ...]" };
  if (rows.length > MAX_PLAN_STEPS) return { ok: false, error: `a plan carries at most ${MAX_PLAN_STEPS} steps (got ${rows.length}) - split the work across plans` };
  const known = new Set(TOOL_DEFS.map((t) => t.name));
  const steps: PlanStep[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as { tool?: unknown; args?: unknown; why?: unknown };
    const tool = String(row?.tool ?? "").trim();
    if (!tool) return { ok: false, error: `step ${i + 1}: tool is required` };
    if (!known.has(tool)) return { ok: false, error: `step ${i + 1}: '${tool}' is not a production tool - pick one from YOUR TOOLS` };
    if (PLAN_META_TOOLS.has(tool)) return { ok: false, error: `step ${i + 1}: '${tool}' is a plan meta-tool and cannot ride inside a plan` };
    const args = (row?.args && typeof row.args === "object" && !Array.isArray(row.args) ? row.args : {}) as Record<string, unknown>;
    steps.push({
      tool,
      args,
      why: String(row?.why ?? "").slice(0, 300),
      status: "PENDING",
    });
  }
  return { ok: true, steps };
}

/** Land a plan (PROPOSED). The review panel (or steer_plan approve) opens the runner. */
export async function createPlan(
  projectId: string,
  input: { title: string; goal: string; steps: unknown; source?: "DSH" | "CREATOR" },
): Promise<{ ok: true; plan: PlanView } | { ok: false; error: string }> {
  const title = String(input.title ?? "").trim();
  const goal = String(input.goal ?? "").trim();
  if (!title) return { ok: false, error: "title is required" };
  if (!goal) return { ok: false, error: "goal is required: what does this plan accomplish?" };
  const checked = validatePlanSteps(input.steps);
  if (!checked.ok) return { ok: false, error: checked.error };
  const plan = await db.dshPlan.create({
    data: {
      projectId,
      title: title.slice(0, 120),
      goal: goal.slice(0, 600),
      status: "PROPOSED",
      source: input.source === "CREATOR" ? "CREATOR" : "DSH",
      steps: JSON.stringify(checked.steps),
      cursor: 0,
    },
  });
  return { ok: true, plan: viewOf(plan) };
}

export async function getPlan(planId: string): Promise<PlanView | null> {
  const plan = await db.dshPlan.findUnique({ where: { id: planId } });
  return plan ? viewOf(plan) : null;
}

/** Latest plan for the project, optionally filtered by status. */
export async function latestPlan(projectId: string, statuses?: PlanView["status"][]): Promise<PlanView | null> {
  const plan = await db.dshPlan.findFirst({
    where: { projectId, ...(statuses ? { status: { in: statuses } } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return plan ? viewOf(plan) : null;
}

export async function listPlans(projectId: string, take = 20): Promise<PlanView[]> {
  const plans = await db.dshPlan.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return plans.map(viewOf);
}

export async function setPlanStatus(
  planId: string,
  status: "ACTIVE" | "PAUSED" | "ABORTED",
): Promise<{ ok: boolean; error?: string }> {
  const plan = await db.dshPlan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, error: "Plan not found" };
  if (plan.status === "DONE" || plan.status === "ABORTED") {
    return { ok: false, error: `Plan is ${plan.status.toLowerCase()} - it no longer accepts steering` };
  }
  if (status === "ACTIVE" && plan.status !== "PROPOSED" && plan.status !== "PAUSED") {
    return { ok: false, error: `Plan is ${plan.status.toLowerCase()} - only a PROPOSED plan can be approved and only a PAUSED plan can resume` };
  }
  if (status === "PAUSED" && plan.status !== "ACTIVE") {
    return { ok: false, error: `Plan is ${plan.status.toLowerCase()} - nothing to pause` };
  }
  await db.dshPlan.update({ where: { id: planId }, data: { status } });
  if (status === "ABORTED" || status === "ACTIVE") {
    await db.productionEvent.create({
      data: {
        projectId: plan.projectId,
        actor: "SYSTEM",
        type: "PLAN",
        summary: status === "ACTIVE"
          ? `Plan '${plan.title}' ${plan.status === "PAUSED" ? "resumed" : "approved"} - ${viewOf(plan).total - plan.cursor} step(s) remain`
          : `Plan '${plan.title}' aborted at step ${plan.cursor + 1}/${viewOf(plan).total}`,
        payload: JSON.stringify({ planId: plan.id, status }),
      },
    }).catch(() => {});
  }
  return { ok: true };
}

/**
 * Run the next steps of an ACTIVE plan (max maxSteps per call). Each
 * step executes through the same executeTool path a live turn uses.
 * An ERROR result parks the cursor AT the failed step and stops the
 * run (fix the cause, then run again to retry it). Cursor reaching
 * the end marks the plan DONE.
 */
export async function runPlanSteps(
  planId: string,
  maxSteps = 1,
): Promise<{ ok: boolean; error?: string; report?: string; plan?: PlanView }> {
  const plan = await db.dshPlan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, error: "Plan not found" };
  if (plan.status === "PROPOSED") return { ok: false, error: "Plan is PROPOSED - it needs the creator's approval before anything runs (steer_plan approve or the review panel)" };
  if (plan.status === "PAUSED") return { ok: false, error: "Plan is PAUSED - resume it before running more steps" };
  if (plan.status === "ABORTED") return { ok: false, error: "Plan was ABORTED - nothing runs" };
  if (plan.status === "DONE") return { ok: false, error: "Plan is already DONE - every step has run" };

  const steps = safeSteps(plan.steps);
  const budget = Math.max(1, Math.min(MAX_PLAN_RUN_STEPS, Math.round(maxSteps) || 1));
  const lines: string[] = [];
  let cursor = plan.cursor;
  let ran = 0;

  for (let k = 0; k < budget && cursor < steps.length; k++) {
    const idx = cursor;
    const step = steps[idx];
    const outcome = await executeTool(plan.projectId, step.tool, step.args ?? {});
    steps[idx] = {
      ...step,
      status: outcome.status === "OK" ? "DONE" : "ERROR",
      result: outcome.result.slice(0, 900),
      at: new Date().toISOString(),
    };
    lines.push(`[${outcome.status}] step ${idx + 1}/${steps.length} ${step.tool}${step.why ? ` (${step.why})` : ""}: ${outcome.result.split("\n")[0].slice(0, 220)}`);
    await db.productionEvent.create({
      data: {
        projectId: plan.projectId,
        actor: "DSH",
        type: "TOOL_CALL",
        summary: `Plan '${plan.title}' step ${idx + 1}/${steps.length} ${step.tool} -> ${outcome.result.split("\n")[0].slice(0, 140)}`,
        payload: JSON.stringify({ planId: plan.id, stepIndex: idx, tool: step.tool, args: step.args, status: outcome.status }),
      },
    }).catch(() => {});
    if (outcome.status !== "OK") {
      // park AT the failed step: fix the cause and run again to retry
      await db.dshPlan.update({ where: { id: plan.id }, data: { steps: JSON.stringify(steps).slice(0, 14000), cursor: idx } });
      lines.push(`The plan holds at step ${idx + 1}: fix the cause and run the plan again to retry it.`);
      const failedView = await getPlan(plan.id);
      return { ok: true, report: lines.join("\n"), plan: failedView ?? undefined };
    }
    cursor = idx + 1;
    ran += 1;
  }

  const finished = cursor >= steps.length;
  await db.dshPlan.update({
    where: { id: plan.id },
    data: { steps: JSON.stringify(steps).slice(0, 14000), cursor, ...(finished ? { status: "DONE" } : {}) },
  });
  if (finished) {
    await db.productionEvent.create({
      data: {
        projectId: plan.projectId,
        actor: "SYSTEM",
        type: "PLAN",
        summary: `Plan '${plan.title}' completed - all ${steps.length} step(s) ran`,
        payload: JSON.stringify({ planId: plan.id, status: "DONE" }),
      },
    }).catch(() => {});
  }
  const remaining = steps.length - cursor;
  if (ran === 0 && !finished) lines.push("No steps ran this call - the plan still has work, run it again.");
  if (!finished && remaining > 0) lines.push(`${remaining} step(s) remain - run_plan continues from here (even in a later conversation).`);
  const view = await getPlan(plan.id);
  return { ok: true, report: lines.join("\n") || "nothing to run", plan: view ?? undefined };
}
