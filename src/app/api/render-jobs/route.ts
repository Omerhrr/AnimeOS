export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRenderJob, tickProjectJobs, applyEvaluationActions } from "@/lib/engine/render";
import { runRenderEvaluation } from "@/lib/dsh/evaluator";

/** Render queue state. Ticks all active jobs; triggers DSH inspection for completed ones. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  await tickProjectJobs(projectId);

  // Hand completed, uninspected renders to DSH exactly once (atomic claim)
  const awaiting = await db.renderJob.findMany({
    where: { projectId, status: "REVIEW", evaluation: null },
    select: { id: true },
  });
  for (const job of awaiting) {
    const claimed = await db.renderJob.updateMany({
      where: { id: job.id, status: "REVIEW", evaluation: null },
      data: { status: "INSPECTING", stage: "DSH inspecting render" },
    });
    if (claimed.count === 1) {
      await runRenderEvaluation(job.id).catch(() => {
        return db.renderJob.update({
          where: { id: job.id },
          data: { status: "NEEDS_REVISION", stage: "Inspection failed — manual review" },
        });
      });
    }
  }

  const jobs = await db.renderJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      shot: { include: { scene: true } },
      evaluation: true,
    },
  });
  return NextResponse.json(jobs);
}

/**
 * POST actions:
 *  - { action: "create", shotId, mode }              → queue a render
 *  - { action: "apply", evaluationId }               → apply DSH modifications + re-render
 *  - { action: "retry", jobId }                      → re-render same shot (attempt+1)
 *  - { action: "approve", jobId }                    → human override approve → FINAL-eligible
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action ?? "create");

  if (action === "create") {
    const shot = await db.shot.findUnique({ where: { id: String(body.shotId) }, include: { scene: { include: { episode: { include: { season: true } } } } } });
    if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    const job = await createRenderJob(shot.scene.episode.season.projectId, shot.id, body.mode === "FINAL" ? "FINAL" : "PREVIEW");
    return NextResponse.json({ id: job.id });
  }

  if (action === "apply") {
    const evaluation = await db.evaluation.findUnique({ where: { id: String(body.evaluationId) }, include: { renderJob: true } });
    if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
    await applyEvaluationActions(evaluation.id);
    const shot = evaluation.renderJob.shotId;
    if (shot) await createRenderJob(evaluation.renderJob.projectId, shot, evaluation.renderJob.mode as "PREVIEW" | "FINAL");
    return NextResponse.json({ ok: true });
  }

  if (action === "retry") {
    const job = await db.renderJob.findUnique({ where: { id: String(body.jobId) } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const next = await createRenderJob(job.projectId, job.shotId, job.mode as "PREVIEW" | "FINAL");
    return NextResponse.json({ id: next.id });
  }

  if (action === "approve") {
    const job = await db.renderJob.findUnique({ where: { id: String(body.jobId) } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    await db.renderJob.update({ where: { id: job.id }, data: { status: "APPROVED", stage: "Approved by creator" } });
    if (job.shotId) {
      await db.shot.update({ where: { id: job.shotId }, data: { status: "FINAL" } });
      const shot = await db.shot.findUnique({ where: { id: job.shotId }, include: { scene: true } });
      if (shot) await db.scene.update({ where: { id: shot.scene.id }, data: { status: "RENDERED" } });
    }
    await db.productionEvent.create({
      data: { projectId: job.projectId, actor: "USER", type: "STATE_CHANGE", summary: `Creator approved render ${job.id.slice(-6)} → shot marked FINAL` },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
