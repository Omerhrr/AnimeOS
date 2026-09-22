export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const terms = await db.terminology.findMany({
    where: { projectId },
    orderBy: { term: "asc" },
  });
  return NextResponse.json(terms);
}

export async function POST(req: Request) {
  const body = await req.json();
  const term = String(body.term ?? "").trim();
  if (!term) return NextResponse.json({ error: "term required" }, { status: 400 });
  const saved = await db.terminology.upsert({
    where: { projectId_term: { projectId: String(body.projectId), term } },
    create: {
      projectId: String(body.projectId),
      term,
      category: body.category ? String(body.category) : null,
      translations: JSON.stringify(body.translations ?? {}),
    },
    update: {
      category: body.category ? String(body.category) : null,
      translations: JSON.stringify(body.translations ?? {}),
    },
  });
  return NextResponse.json({ id: saved.id });
}
