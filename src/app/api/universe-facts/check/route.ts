export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireProjectAccess, projectOfRow } from "@/lib/access";
import { checkShotUniverseFacts } from "@/lib/universe-facts";

// ── POST { shotId } : VLM universe-facts check on one shot's panel
// art. Verdicts persist as FACT_HELD / FACT_BROKEN continuity events;
// confident violations feed the re-render queue.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const shotId = body.shotId ? String(body.shotId) : "";
  if (!shotId) return NextResponse.json({ error: "shotId required" }, { status: 400 });
  const shotProject = await projectOfRow("shot", shotId);
  const access = await requireProjectAccess(req, shotProject, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await checkShotUniverseFacts(shotId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
