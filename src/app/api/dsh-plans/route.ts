export const dynamic = "force-dynamic";
export const maxDuration = 300; // run steps can execute slow production tools (art, renders)

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { createPlan, listPlans, runPlanSteps, setPlanStatus } from "@/lib/dsh/plans";

// ── Cross-turn DSH plans (landed by DSH or the creator, run after
//    the creator approves).
//
// GET   { projectId }                                   -> latest plans (steps + progress)
// POST  { projectId, title, goal, steps }               -> create a plan (source CREATOR)
// PATCH { planId, action: approve|pause|resume|abort }  -> steer
// PATCH { planId, action: "run", maxSteps? }            -> run the next steps
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const plans = await listPlans(projectId);
  return NextResponse.json({ plans });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await createPlan(projectId, {
    title: String(body.title ?? ""),
    goal: String(body.goal ?? ""),
    steps: body.steps,
    source: "CREATOR",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const planId = String(body.planId ?? "");
  const action = String(body.action ?? "").toLowerCase();
  if (!planId || !["approve", "pause", "resume", "abort", "run"].includes(action)) {
    return NextResponse.json({ error: "planId and action (approve | pause | resume | abort | run) required" }, { status: 400 });
  }
  const plan = await db.dshPlan.findUnique({ where: { id: planId }, select: { projectId: true } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  const access = await requireProjectAccess(req, plan.projectId, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (action === "run") {
    const maxSteps = Number(body.maxSteps ?? 1);
    const result = await runPlanSteps(planId, Number.isFinite(maxSteps) ? maxSteps : 1);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }
  const status = action === "approve" ? "ACTIVE" : action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "ABORTED";
  const result = await setPlanStatus(planId, status as "ACTIVE" | "PAUSED" | "ABORTED");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
