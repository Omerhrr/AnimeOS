export const dynamic = "force-dynamic";
export const maxDuration = 300; // scoring is real vision work (one call per panel)

import { NextResponse } from "next/server";
import {
  identityPanelData, scoreProjectIdentity, scoreShotIdentity,
  scoreShotEmbedding, scoreProjectEmbeddings,
} from "@/lib/identity";

// ── Identity-similarity scoring for panels + the provider-free
//    affinity pass.
//
// GET   ?projectId=                        -> scored rows (worst first) + drift queue + picker + affinity rows
// POST  { shotId, mode? }                  -> mode "vision" (default): score ONE panel against its cast's model sheets (vision); mode "affinity": the instant local embedding pass
// PATCH { projectId, limit?, mode? }       -> batch score (worst existing scores first, then unscored)
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const data = await identityPanelData(projectId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const shotId = String(body.shotId ?? "");
  if (!shotId) return NextResponse.json({ error: "shotId required" }, { status: 400 });
  if (String(body.mode ?? "") === "affinity") {
    const result = await scoreShotEmbedding(shotId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }
  const result = await scoreShotIdentity(shotId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const limit = Number(body.limit ?? 4);
  if (String(body.mode ?? "") === "affinity") {
    const result = await scoreProjectEmbeddings(projectId, Number.isFinite(limit) ? limit : 8);
    return NextResponse.json(result);
  }
  const result = await scoreProjectIdentity(projectId, Number.isFinite(limit) ? limit : 4);
  return NextResponse.json(result);
}
