export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { canonHealthData } from "@/lib/canon-health";
import { reauditRewordedFact, driftedRewordedFacts, reauditDriftedFacts } from "@/lib/universe-facts";

// ── Canon health: the universe-facts verdict history read back as a
//    health score with per-fact rows.
//
// GET ?projectId=  -> { digest, rows, suggestions, drift, rewordDrift }
//      rewordDrift: facts whose wording changed after their last
//      audit loop (the re-audit sweep's queue)
// POST { projectId, action: "reaudit", factId, oldText }
//   -> the reworded-fact re-audit helper: re-runs the vision check
//      on every panel that audited the OLD wording, against the
//      fact's NEW wording.
// POST { projectId, action: "reaudit-drifted" }
//   -> the batch sweep: re-audits every reworded fact (capped),
//      closing the loop on each fact it actually re-checked.
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const [data, rewordDrift] = await Promise.all([
    canonHealthData(projectId),
    driftedRewordedFacts(projectId).catch(() => []),
  ]);
  return NextResponse.json({ ...data, rewordDrift });
}

export async function POST(req: Request) {
  let body: { projectId?: unknown; action?: unknown; factId?: unknown; oldText?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "a JSON body is required" }, { status: 400 });
  }
  if (body.action === "reaudit-drifted") {
    const projectId = String(body.projectId ?? "");
    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    const sweep = await reauditDriftedFacts(projectId);
    if (!sweep.ok) return NextResponse.json({ error: sweep.error }, { status: 400 });
    return NextResponse.json(sweep.result);
  }
  if (body.action !== "reaudit") {
    return NextResponse.json({ error: "unknown action (expected: reaudit)" }, { status: 400 });
  }
  const factId = String(body.factId ?? "");
  const oldText = String(body.oldText ?? "");
  if (!factId || !oldText) {
    return NextResponse.json({ error: "factId and oldText are required (panels are found by what they audited)" }, { status: 400 });
  }
  const result = await reauditRewordedFact(factId, oldText);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.result);
}
