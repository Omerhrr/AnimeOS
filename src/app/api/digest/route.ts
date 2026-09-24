export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listDigests, postDailyDigest } from "@/lib/digest";

// ── The studio's daily digest to the creator.
//
// GET  ?projectId=            -> the most recent posted digests
// POST { projectId, hours? }  -> build + land a digest now (the digest panel's Post now)
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const digests = await listDigests(projectId);
  return NextResponse.json({ digests });
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
  const hours = Number(body.hours ?? 24);
  const result = await postDailyDigest(projectId, Number.isFinite(hours) ? hours : 24);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
