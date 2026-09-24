export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  episodeTemplateCatalog, instantiateEpisodePlan, listPlanTemplates,
  savePlanTemplate, deletePlanTemplate, builtInStepsFor,
} from "@/lib/dsh/plan-templates";

// ── Per-episode plan templates + creator-authored variations.
//
// GET    ?projectId=                                     -> catalog: every episode with its built-in cards + saved variations
// GET    ?projectId=&episodeId=&templateId=              -> preview: the built-in's resolved steps (the authoring dialog's "load base")
// POST   { projectId, episodeId, templateId }            -> land a built-in OR a saved variation (id / exact name) as a PROPOSED plan
// PUT    { projectId, name, summary, steps, ... }        -> save a creator-authored variation (scope PROJECT|STUDIO)
// DELETE ?id=                                            -> remove a saved variation
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const templateId = searchParams.get("templateId");
  if (templateId) {
    const episodeId = searchParams.get("episodeId") ?? "";
    const catalog = await episodeTemplateCatalog(projectId);
    const ep = catalog.episodes.find((e) => e.episodeId === episodeId);
    if (!ep) return NextResponse.json({ error: "episodeId not found in this production" }, { status: 404 });
    // resolve the same way the catalog builds episodes: reuse the raw episode row
    const rawEp = {
      episodeId: ep.episodeId, seasonNumber: ep.seasonNumber, number: ep.number,
      title: ep.title, sceneCount: ep.sceneCount, shotCount: ep.shotCount,
    };
    const steps = builtInStepsFor(rawEp, templateId);
    if (!steps) return NextResponse.json({ error: "unknown built-in template" }, { status: 404 });
    return NextResponse.json({ steps });
  }

  const [catalog, saved] = await Promise.all([episodeTemplateCatalog(projectId), listPlanTemplates(projectId)]);
  return NextResponse.json({ ...catalog, saved });
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

export async function PUT(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const result = await savePlanTemplate(projectId, {
    baseId: body.baseId ? String(body.baseId) : "custom",
    name: String(body.name ?? ""),
    summary: String(body.summary ?? ""),
    cadenceHint: body.cadenceHint === undefined ? undefined : String(body.cadenceHint ?? ""),
    steps: body.steps,
    scope: body.scope ? String(body.scope) : "PROJECT",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const result = await deletePlanTemplate(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
