import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import {
  blenderAssetLibrary, buildBlenderAsset, inspectBlenderAsset, refreshAssetPreview,
  isBlenderAssetKind,
  type BlenderAssetKind,
} from "@/lib/blender/assets";

// ─────────────────────────────────────────────────────────────
// BLENDER ASSET LIBRARY API (design once, render many)
//
// GET  /api/blender-assets?projectId=...            - the library
// POST {action: build|inspect|preview, kind, refName} - design loop
//      build also accepts material/lighting recipe names
// ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const lib = await blenderAssetLibrary(projectId);
  return NextResponse.json(lib);
}

export async function POST(request: Request) {
  let body: { action?: string; projectId?: string; kind?: string; refName?: string; material?: string; lighting?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const action = String(body.action ?? "").toLowerCase();
  const postAccess = await requireProjectAccess(request, projectId, { write: true });
  if (!postAccess.ok) return NextResponse.json({ error: postAccess.error }, { status: postAccess.status });

  if (action === "build") {
    const kind = String(body.kind ?? "").toUpperCase();
    if (!isBlenderAssetKind(kind)) {
      return NextResponse.json({ error: "kind must be CHARACTER, ENVIRONMENT, PROP or CREATURE" }, { status: 400 });
    }
    const refName = String(body.refName ?? "").trim();
    if (!refName) return NextResponse.json({ error: "refName is required" }, { status: 400 });
    const res = await buildBlenderAsset(projectId, kind as BlenderAssetKind, refName, null, {
      materialName: String(body.material ?? "").trim() || null,
      lightingName: String(body.lighting ?? "").trim() || null,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  }
  if (action === "inspect") {
    const refName = String(body.refName ?? "").trim();
    if (!refName) return NextResponse.json({ error: "refName is required" }, { status: 400 });
    const asset = await db.blenderAsset.findFirst({ where: { projectId, refName } });
    if (!asset) return NextResponse.json({ error: `no asset named ${refName}` }, { status: 404 });
    const res = await inspectBlenderAsset(asset.id);
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  }
  if (action === "preview") {
    const refName = String(body.refName ?? "").trim();
    if (!refName) return NextResponse.json({ error: "refName is required" }, { status: 400 });
    const asset = await db.blenderAsset.findFirst({ where: { projectId, refName } });
    if (!asset) return NextResponse.json({ error: `no asset named ${refName}` }, { status: 404 });
    const res = await refreshAssetPreview(asset.id);
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  }
  return NextResponse.json({ error: `unknown action "${action}" (build | inspect | preview)` }, { status: 400 });
}
