export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { startLoraTrainRun, tickProjectTrainRuns } from "@/lib/ai/lora-train";

// Simulated LoRA training runs over a production's approved panels.
// GET advances RUNNING runs (poll-driven, like the render queue) and
// returns recent runs; POST starts a new run for one adapter, or a
// batch of runs for every eligible adapter of the production.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const loraId = searchParams.get("loraId");
  if (!projectId && !loraId) {
    return NextResponse.json({ error: "projectId or loraId required" }, { status: 400 });
  }
  // scope through whichever locator the caller used
  let scopeProjectId = projectId;
  if (!scopeProjectId && loraId) {
    const loraRow = await db.styleLora.findUnique({ where: { id: loraId }, select: { projectId: true } });
    if (!loraRow) return NextResponse.json({ error: "LoRA not found" }, { status: 404 });
    scopeProjectId = loraRow.projectId;
  }
  const access = await requireProjectAccess(req, scopeProjectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (projectId) await tickProjectTrainRuns(projectId);

  const runs = await db.loraTrainRun.findMany({
    where: projectId ? { projectId } : { loraId: loraId as string },
    orderBy: { startedAt: "desc" },
    take: 60,
    include: { lora: { select: { name: true } } },
  });
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── batch mode: train every eligible adapter of the production ──
  if (body.batch) {
    const projectId = body.projectId ? String(body.projectId) : "";
    if (!projectId) return NextResponse.json({ error: "projectId required for batch training" }, { status: 400 });
    const batchAccess = await requireProjectAccess(req, projectId, { write: true });
    if (!batchAccess.ok) return NextResponse.json({ error: batchAccess.error }, { status: batchAccess.status });

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: { loras: { orderBy: { createdAt: "asc" } } },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.loras.length === 0) {
      return NextResponse.json({ error: "No adapters registered yet" }, { status: 400 });
    }

    // adapters already carrying a run in flight are off-limits
    const running = await db.loraTrainRun.findMany({
      where: { projectId, status: "RUNNING" },
      select: { loraId: true },
    });
    const busyIds = new Set(running.map((r) => r.loraId));

    const started: Array<{ loraId: string; name: string; runId: string; totalSteps: number; panelCount: number }> = [];
    const skipped: Array<{ loraId: string; name: string; reason: string }> = [];
    for (const lora of project.loras) {
      if (busyIds.has(lora.id) || lora.status === "TRAINING") {
        skipped.push({ loraId: lora.id, name: lora.name, reason: "already training" });
        continue;
      }
      try {
        const res = await startLoraTrainRun(lora.id);
        started.push({ loraId: lora.id, name: lora.name, runId: res.runId, totalSteps: res.totalSteps, panelCount: res.panelCount });
      } catch (err) {
        skipped.push({ loraId: lora.id, name: lora.name, reason: err instanceof Error ? err.message : "failed to start" });
      }
    }

    if (started.length === 0) {
      return NextResponse.json(
        { error: `No adapter could start: ${skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}` },
        { status: 409 },
      );
    }
    return NextResponse.json({ started, skipped });
  }

  // ── single adapter ──
  const loraId = body.loraId ? String(body.loraId) : "";
  if (!loraId) return NextResponse.json({ error: "loraId required" }, { status: 400 });
  const singleLora = await db.styleLora.findUnique({ where: { id: loraId }, select: { projectId: true } });
  if (!singleLora) return NextResponse.json({ error: "LoRA not found" }, { status: 404 });
  const singleAccess = await requireProjectAccess(req, singleLora.projectId, { write: true });
  if (!singleAccess.ok) return NextResponse.json({ error: singleAccess.error }, { status: singleAccess.status });

  try {
    const started = await startLoraTrainRun(loraId);
    return NextResponse.json(started);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start training run";
    const status = msg.includes("not found") ? 404 : msg.includes("in flight") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
