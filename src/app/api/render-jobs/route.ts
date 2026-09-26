export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, authGuardResponse } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { createRenderJob, tickProjectJobs, applyEvaluationActions } from "@/lib/engine/render";
import { runRenderEvaluation } from "@/lib/dsh/evaluator";

/** Render queue state. Ticks all active jobs; triggers DSH inspection for completed ones. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await tickProjectJobs(projectId);

  // Hand completed, uninspected renders to DSH exactly once (atomic claim).
  // Capped per tick - a batch render completing all at once must not turn a
  // single poll into a dozen sequential LLM inspections; the remaining
  // renders are picked up by subsequent polls (2s cadence).
  const INSPECTIONS_PER_TICK = 2;
  const awaiting = await db.renderJob.findMany({
    where: { projectId, status: "REVIEW", evaluation: null },
    select: { id: true },
    take: INSPECTIONS_PER_TICK,
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
          data: { status: "NEEDS_REVISION", stage: "Inspection failed - manual review" },
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
 *  - { action: "batch", episodeIds[], mode }         → queue a render per shot across episodes
 *  - { action: "apply", evaluationId }               → apply DSH modifications + re-render
 *  - { action: "retry", jobId }                      → re-render same shot (attempt+1)
 *  - { action: "approve", jobId }                    → human approve (EDITOR+) → FINAL-eligible;
 *                                                      with the approval gate on this is the ONLY
 *                                                      way a DSH-approved render becomes APPROVED
 *  - { action: "reject", jobId, note }               → human revision request (EDITOR+); the note
 *                                                      lands in the shot's comment thread
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
    const access = await requireProjectAccess(req, shot.scene.episode.season.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const job = await createRenderJob(shot.scene.episode.season.projectId, shot.id, body.mode === "FINAL" ? "FINAL" : "PREVIEW");
    return NextResponse.json({ id: job.id });
  }

  if (action === "batch") {
    const ids = Array.isArray(body.episodeIds) ? body.episodeIds.map(String).filter(Boolean).slice(0, 20) : [];
    if (ids.length === 0) return NextResponse.json({ error: "episodeIds required" }, { status: 400 });
    const mode = body.mode === "FINAL" ? "FINAL" : "PREVIEW";
    const episodes = await db.episode.findMany({
      where: { id: { in: ids } },
      include: { season: true, scenes: { include: { shots: { orderBy: { number: "asc" } } } } },
    });
    if (episodes.length === 0) return NextResponse.json({ error: "No matching episodes" }, { status: 404 });
    // Every episode's production must be on the caller's slate.
    const checkedProjects = new Set<string>();
    for (const ep of episodes) {
      const pid = ep.season.projectId;
      if (!checkedProjects.has(pid)) {
        const epAccess = await requireProjectAccess(req, pid, { write: true });
        if (!epAccess.ok) return NextResponse.json({ error: epAccess.error }, { status: epAccess.status });
        checkedProjects.add(pid);
      }
    }

    let created = 0;
    let skipped = 0;
    for (const ep of episodes) {
      for (const scene of ep.scenes) {
        for (const shot of scene.shots) {
          if (shot.status === "FINAL") { skipped += 1; continue; }
          await createRenderJob(ep.season.projectId, shot.id, mode);
          created += 1;
        }
      }
      if (ep.status === "DRAFT") {
        await db.episode.update({ where: { id: ep.id }, data: { status: "IN_PRODUCTION" } });
      }
    }
    await db.productionEvent.create({
      data: {
        projectId: episodes[0].season.projectId,
        actor: "USER",
        type: "RENDER",
        summary: `Batch render queued - ${created} shot(s) across ${episodes.length} episode(s) (${mode})${skipped ? `, ${skipped} already FINAL skipped` : ""}`,
        payload: JSON.stringify({ episodeIds: ids, mode, created, skipped }),
      },
    });
    return NextResponse.json({ created, skipped, episodes: episodes.length });
  }

  if (action === "apply") {
    const evaluation = await db.evaluation.findUnique({ where: { id: String(body.evaluationId) }, include: { renderJob: true } });
    if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
    const access = await requireProjectAccess(req, evaluation.renderJob.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    await applyEvaluationActions(evaluation.id);
    const shot = evaluation.renderJob.shotId;
    if (shot) await createRenderJob(evaluation.renderJob.projectId, shot, evaluation.renderJob.mode as "PREVIEW" | "FINAL");
    return NextResponse.json({ ok: true });
  }

  if (action === "retry") {
    const job = await db.renderJob.findUnique({ where: { id: String(body.jobId) } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const access = await requireProjectAccess(req, job.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const next = await createRenderJob(job.projectId, job.shotId, job.mode as "PREVIEW" | "FINAL");
    return NextResponse.json({ id: next.id });
  }

  if (action === "approve") {
    // Approving is a DIRECTION decision: DB-fresh EDITOR+ (a promoted
    // member cannot ride a stale JWT claim past the human gate).
    const guard = await requireRole(req, "EDITOR");
    if (!guard.ok) return authGuardResponse(guard)!;
    const job = await db.renderJob.findUnique({ where: { id: String(body.jobId) } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const access = await requireProjectAccess(req, job.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    await db.renderJob.update({ where: { id: job.id }, data: { status: "APPROVED", stage: `Approved by ${guard.user.name}` } });
    if (job.shotId) {
      await db.shot.update({ where: { id: job.shotId }, data: { status: "FINAL" } });
      const shot = await db.shot.findUnique({ where: { id: job.shotId }, include: { scene: true } });
      if (shot) await db.scene.update({ where: { id: shot.scene.id }, data: { status: "RENDERED" } });
    }
    await db.productionEvent.create({
      data: { projectId: job.projectId, actor: "USER", type: "STATE_CHANGE", summary: `${guard.user.name} approved render ${job.id.slice(-6)} → shot marked FINAL` },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    // The other half of the human gate: a revision request with a
    // REASON. The note is required (a reject without a why is noise)
    // and lands in the shot's workplace thread as a first-class comment
    // so the discussion and the queue tell the same story.
    const guard = await requireRole(req, "EDITOR");
    if (!guard.ok) return authGuardResponse(guard)!;
    const job = await db.renderJob.findUnique({ where: { id: String(body.jobId) } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const rejectAccess = await requireProjectAccess(req, job.projectId, { write: true });
    if (!rejectAccess.ok) return NextResponse.json({ error: rejectAccess.error }, { status: rejectAccess.status });
    const note = String(body.note ?? "").trim();
    if (!note) return NextResponse.json({ error: "A rejection note is required - say what to fix" }, { status: 400 });
    await db.renderJob.update({
      where: { id: job.id },
      data: { status: "NEEDS_REVISION", stage: `Revision requested by ${guard.user.name}: ${note.slice(0, 120)}` },
    });
    if (job.shotId) {
      await db.shot.update({ where: { id: job.shotId }, data: { status: "REVIEW" } });
      await db.comment.create({
        data: {
          projectId: job.projectId,
          anchorType: "SHOT",
          anchorId: job.shotId,
          authorId: guard.user.id,
          authorName: guard.user.name,
          body: `[Revision requested] ${note}`,
        },
      });
    }
    await db.productionEvent.create({
      data: {
        projectId: job.projectId,
        actor: "USER",
        type: "STATE_CHANGE",
        summary: `${guard.user.name} requested revision on render ${job.id.slice(-6)}: "${note.slice(0, 80)}"`,
        payload: JSON.stringify({ renderJobId: job.id, note }),
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
