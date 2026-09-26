import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import {
  blenderAssetLibrary, buildBlenderAsset, inspectBlenderAsset, refreshAssetPreview,
  isBlenderAssetKind,
  type BlenderAssetKind,
} from "@/lib/blender/assets";
import { runRoundtrip, latestExportsFor, isExportFormat } from "@/lib/blender/roundtrip";

// ─────────────────────────────────────────────────────────────
// BLENDER ASSET LIBRARY API (design once, render many)
//
// GET  /api/blender-assets?projectId=...            - the library
// POST {action: build|inspect|preview|export, kind, refName} - the loop
//      build also accepts material/lighting recipe names, a motion
//      preset name (the baked performance) and a variation preset
//      name (the GN layout law); export takes a GLB|FBX format and
//      verifies the round trip
// ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const lib = await blenderAssetLibrary(projectId);
  const exports = await latestExportsFor(projectId);
  return NextResponse.json({ ...lib, exports });
}

export async function POST(request: Request) {
  let body: { action?: string; projectId?: string; kind?: string; refName?: string; material?: string; lighting?: string; motion?: string; variation?: string; format?: string; verify?: boolean } = {};
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
      motionName: String(body.motion ?? "").trim() || null,
      variationName: String(body.variation ?? "").trim() || null,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  }
  if (action === "export") {
    const refName = String(body.refName ?? "").trim();
    if (!refName) return NextResponse.json({ error: "refName is required" }, { status: 400 });
    const format = String(body.format ?? "GLB").toUpperCase();
    if (!isExportFormat(format)) {
      return NextResponse.json({ error: "format must be GLB or FBX" }, { status: 400 });
    }
    const asset = await db.blenderAsset.findFirst({ where: { projectId, refName } });
    if (!asset) return NextResponse.json({ error: `no asset named ${refName}` }, { status: 404 });
    const verify = body.verify === undefined ? true : Boolean(body.verify);
    const res = await runRoundtrip(asset.id, format, verify);
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
  return NextResponse.json({ error: `unknown action "${action}" (build | inspect | preview | export)` }, { status: 400 });
}
