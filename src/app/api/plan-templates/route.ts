export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { episodeTemplateCatalog, instantiateEpisodePlan } from "@/lib/dsh/plan-templates";

// ── Per-episode plan templates.
//
// GET   ?projectId=                                     -> catalog: every episode with its template cards
// POST  { projectId, episodeId, templateId }            -> land the template as a PROPOSED plan (source CREATOR)
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const catalog = await episodeTemplateCatalog(projectId);
  return NextResponse.json(catalog);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  const episodeId = String(body.episodeId ?? "");
  const templateId = String(body.templateId ?? "");
  if (!projectId || !episodeId || !templateId) {
    return NextResponse.json({ error: "projectId, episodeId and templateId required" }, { status: 400 });
  }
  const result = await instantiateEpisodePlan(projectId, episodeId, templateId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
