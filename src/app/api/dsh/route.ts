export const dynamic = "force-dynamic";
export const maxDuration = 300; // DSH turns may include art generation (image models are slow)

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDshTurn } from "@/lib/dsh/orchestrator";

/** DSH conversation history. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const messages = await db.dshMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    take: 60,
  });
  return NextResponse.json(messages);
}

/** One DSH turn: intent → plan → execute → observe → reply (with execution trace). */
export async function POST(req: Request) {
  let body: { projectId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  const message = String(body.message ?? "").trim();
  if (!projectId || !message) {
    return NextResponse.json({ error: "projectId and message required" }, { status: 400 });
  }
  try {
    const result = await runDshTurn(projectId, message);
    return NextResponse.json(result);
  } catch (err) {
    console.error("DSH turn failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DSH orchestration failed" },
      { status: 500 }
    );
  }
}
