export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startLoraTrainRun, tickProjectTrainRuns } from "@/lib/ai/lora-train";

// Simulated LoRA training runs over a production's approved panels.
// GET advances RUNNING runs (poll-driven, like the render queue) and
// returns recent runs; POST starts a new run for one adapter.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const loraId = searchParams.get("loraId");
  if (!projectId && !loraId) {
    return NextResponse.json({ error: "projectId or loraId required" }, { status: 400 });
  }

  if (projectId) await tickProjectTrainRuns(projectId);

  const runs = await db.loraTrainRun.findMany({
    where: projectId ? { projectId } : { loraId: loraId as string },
    orderBy: { startedAt: "desc" },
    take: 30,
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
  const loraId = body.loraId ? String(body.loraId) : "";
  if (!loraId) return NextResponse.json({ error: "loraId required" }, { status: 400 });

  try {
    const started = await startLoraTrainRun(loraId);
    return NextResponse.json(started);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start training run";
    const status = msg.includes("not found") ? 404 : msg.includes("in flight") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
