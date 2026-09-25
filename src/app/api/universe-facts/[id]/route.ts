export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const CATEGORIES = ["WORLD", "CHARACTER", "PROP", "LOCATION", "RULE"];

// ── PATCH { text?, category?, active? } : steer one fact
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const existing = await db.universeFact.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Universe fact not found" }, { status: 404 });
  const data: { text?: string; category?: string; active?: boolean; lastRewordedFrom?: string | null } = {};
  if (typeof body.text === "string" && body.text.trim()) {
    const next = body.text.trim().slice(0, 400);
    // a real reword starts the re-audit loop: the old wording is kept
    // so the re-audit sweep can find the panels that audited it
    if (next !== existing.text.trim()) data.lastRewordedFrom = existing.text;
    data.text = next;
  }
  if (CATEGORIES.includes(String(body.category ?? ""))) data.category = String(body.category);
  if (typeof body.active === "boolean") data.active = body.active;
  const fact = await db.universeFact.update({ where: { id }, data });
  return NextResponse.json(fact);
}

// ── DELETE : retire a fact
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.universeFact.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Universe fact not found" }, { status: 404 });
  await db.universeFact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
