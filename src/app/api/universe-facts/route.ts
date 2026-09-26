export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { universePanelData } from "@/lib/universe-facts";

const CATEGORIES = ["WORLD", "CHARACTER", "PROP", "LOCATION", "RULE"];

// ── GET ?projectId= : facts + the confidence-ranked re-render queue
// + the shot list the panel's checker picker offers.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const data = await universePanelData(projectId);
  return NextResponse.json(data);
}

// ── POST { projectId, text, category? } : author a canon fact
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = body.projectId ? String(body.projectId) : "";
  const text = body.text ? String(body.text).trim() : "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const category = CATEGORIES.includes(String(body.category ?? "")) ? String(body.category) : "WORLD";
  const source = body.source === "DSH" || body.source === "BIBLE" ? String(body.source) : "USER";
  const fact = await db.universeFact.create({
    data: { projectId, text: text.slice(0, 400), category, source },
  });
  await db.productionEvent.create({
    data: { projectId, actor: source === "DSH" ? "DSH" : "USER", type: "CONTINUITY", summary: `Universe fact registered: ${fact.text.slice(0, 80)}` },
  });
  return NextResponse.json(fact);
}
