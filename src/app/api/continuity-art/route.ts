export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { scanArtContinuity, checkShotArtContinuity } from "@/lib/continuity-art";

// ── GET ?projectId= : deterministic art-continuity scan ──
// Stale art vs state/anchor timestamps plus anchor coverage for
// every shot's featured cast.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const scan = await scanArtContinuity(projectId);
  return NextResponse.json(scan);
}

// ── POST { shotId } : VLM deep check (panel art vs model sheet) ──
// Verdict lands as an ART_DRIFT / ART_VERIFIED continuity event.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const shotId = body.shotId ? String(body.shotId) : "";
  if (!shotId) return NextResponse.json({ error: "shotId required" }, { status: 400 });
  const result = await checkShotArtContinuity(shotId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
