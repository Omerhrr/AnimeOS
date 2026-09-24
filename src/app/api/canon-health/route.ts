export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { canonHealthData } from "@/lib/canon-health";

// ── Canon health: the universe-facts verdict history read back as a
//    health score with per-fact rows.
//
// GET ?projectId=  -> { digest, rows }
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const data = await canonHealthData(projectId);
  return NextResponse.json(data);
}
