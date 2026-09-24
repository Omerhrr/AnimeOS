export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import {
  startRepaintRun, resumeRepaintRun, setRepaintRunStatus, latestRepaintRun,
} from "@/lib/universe-repaint";

// ── Supervised auto re-paint runner over the universe-facts
//    re-render queue.
//
// GET  { projectId }                    -> latest run (steps + status)
// POST { projectId, maxItems? }         -> start a run (worst first, capped)
// PATCH { runId, action }               -> pause | resume | abort
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const run = await latestRepaintRun(projectId);
  return NextResponse.json({ run });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = body.projectId ? String(body.projectId) : "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const maxItems = Number(body.maxItems ?? 3);
  const result = await startRepaintRun(projectId, Number.isFinite(maxItems) ? maxItems : 3);
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
  const runId = body.runId ? String(body.runId) : "";
  const action = String(body.action ?? "");
  if (!runId || !["pause", "resume", "abort"].includes(action)) {
    return NextResponse.json({ error: "runId and action (pause | resume | abort) required" }, { status: 400 });
  }
  const result = action === "resume"
    ? await resumeRepaintRun(runId)
    : await setRepaintRunStatus(runId, action === "pause" ? "PAUSED" : "ABORTED");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
