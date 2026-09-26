import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { runBlenderScript } from "@/lib/blender/runtime";

// ─────────────────────────────────────────────────────────────
// GLTF / FBX ROUND-TRIP (iteration 53)
//
// An asset that cannot LEAVE the studio is not a production asset:
// game engines eat GLB, mocap and contractor DCCs speak FBX,
// distributors' QC lanes want both. Exporting is the easy half -
// the professional half is RE-IMPORTING the file and comparing it
// against the source (bridges/blender/roundtrip.py: object/tri/
// material counts, bbox dims, missing meshes), because an export
// you did not verify is a hope, not a deliverable.
//
// Every export lands an AssetExport row (format, path, verified,
// drift, full report) and the file copies to /exports/ for
// download.
// ─────────────────────────────────────────────────────────────

const EXPORT_PUBLIC_DIR = path.join(process.cwd(), "public", "exports");
const EXPORT_LIBRARY_DIR = path.join(process.cwd(), "assets", "exports");

export type ExportFormat = "GLB" | "FBX";
export const EXPORT_FORMATS: ExportFormat[] = ["GLB", "FBX"];

export function isExportFormat(v: string): v is ExportFormat {
  return (EXPORT_FORMATS as string[]).includes(v);
}

export interface RoundtripReport {
  format: string;
  path: string;
  bytes: number;
  objectsSrc: number;
  meshesSrc: number;
  meshesRe: number;
  trisSrc: number;
  trisRe: number;
  triDeltaPct: number;
  materialsSrc: number;
  materialsRe: number;
  dimsSrc: number[];
  dimsRe: number[];
  bboxDeltaPct: number;
  missing: string[];
  verified: boolean;
  notes: string[];
}

export interface RoundtripResult {
  ok: boolean;
  error?: string;
  assetId: string;
  refName: string;
  format: ExportFormat;
  exportId: string | null;
  path: string | null;
  publicPath: string | null;
  verified: boolean;
  drift: number | null;
  report: RoundtripReport | null;
  log: string;
}

function parseMarker(log: string, marker: string): string | null {
  const m = log.match(new RegExp(`^${marker} (.+)$`, "m"));
  return m ? m[1].trim() : null;
}

/**
 * Export one library asset to GLB/FBX through the studio's own
 * Blender runtime, verify the round-trip (export -> wipe ->
 * re-import -> compare), and persist an AssetExport row.
 */
export async function runRoundtrip(assetId: string, format: ExportFormat, verify = true): Promise<RoundtripResult> {
  const asset = await db.blenderAsset.findUnique({ where: { id: assetId } });
  const base = { assetId, refName: asset?.refName ?? "", format, exportId: null, path: null, publicPath: null, verified: false, drift: null, report: null, log: "" };
  if (!asset) return { ...base, ok: false, error: "asset not found" };
  if (asset.status !== "READY" || !asset.blendPath || !fs.existsSync(asset.blendPath)) {
    return { ...base, ok: false, error: "asset has no accepted .blend on disk - build it first" };
  }

  const project = await db.project.findUnique({ where: { id: asset.projectId }, select: { title: true } });
  const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "asset";
  const outDir = path.join(EXPORT_LIBRARY_DIR, slugOf(project?.title ?? "project"), `${slugOf(asset.refName)}-${format.toLowerCase()}-${Date.now().toString(36)}`);
  fs.mkdirSync(outDir, { recursive: true });

  // the driver: roundtrip.py runs inside the same short-lived headless
  // Blender the exec sandbox spawns (runBlenderScript passes --out and
  // its own -- only, so the blend/format/out args are baked INTO the
  // script and roundtrip.run() is called directly)
  const driverScript = `import sys, os
sys.path.insert(0, r"${path.join(process.cwd(), "bridges", "blender").replace(/\\/g, "\\\\")}")
import roundtrip
blend_path = r"${asset.blendPath.replace(/\\/g, "\\\\")}"
out_dir = r"${outDir.replace(/\\/g, "\\\\")}"
import bpy
report, err = roundtrip.run(bpy, blend_path, "${format}", out_dir)
if report is None:
    print("RT_ERROR %s" % err, flush=True)
    sys.exit(1)
print("ROUNDTRIP %s" % __import__("json").dumps(report), flush=True)
print("RT_OK", flush=True)
`;
  const res = await runBlenderScript(driverScript, `roundtrip-${slugOf(asset.refName)}-${format.toLowerCase()}`, 4 * 60_000);

  const err = parseMarker(res.fullLog, "RT_ERROR");
  const raw = parseMarker(res.fullLog, "ROUNDTRIP");
  if (!raw) {
    return { ...base, ok: false, error: err ?? `round-trip failed: ${res.log.slice(-300)}`, log: res.log };
  }
  let report: RoundtripReport | null = null;
  try {
    report = JSON.parse(raw) as RoundtripReport;
  } catch {
    return { ...base, ok: false, error: "round-trip report unparsable", log: res.log };
  }

  // serve the file for download
  const ext = format === "GLB" ? "glb" : "fbx";
  fs.mkdirSync(EXPORT_PUBLIC_DIR, { recursive: true });
  const publicPath = path.join(EXPORT_PUBLIC_DIR, `${assetId}.${ext}`);
  let served: string | null = null;
  if (fs.existsSync(report.path)) {
    try {
      fs.copyFileSync(report.path, publicPath);
      served = `/exports/${assetId}.${ext}`;
    } catch {
      served = null;
    }
  }

  const row = await db.assetExport.create({
    data: {
      assetId: asset.id,
      projectId: asset.projectId,
      format,
      path: report.path,
      publicPath: served,
      verified: verify ? report.verified : false,
      drift: report.bboxDeltaPct / 100,
      report: JSON.stringify(report).slice(0, 8000),
    },
  });

  return {
    ok: true,
    assetId: asset.id,
    refName: asset.refName,
    format,
    exportId: row.id,
    path: report.path,
    publicPath: served,
    verified: verify ? report.verified : false,
    drift: report.bboxDeltaPct / 100,
    report,
    log: res.log,
  };
}

/** Latest export per asset for one production (the UI chip row). */
export async function latestExportsFor(projectId: string): Promise<Record<string, { format: string; verified: boolean; drift: number | null; publicPath: string | null; createdAt: string }>> {
  const rows = await db.assetExport.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 120,
  });
  const out: Record<string, { format: string; verified: boolean; drift: number | null; publicPath: string | null; createdAt: string }> = {};
  for (const r of rows) {
    if (out[r.assetId]) continue; // first (newest) wins
    out[r.assetId] = {
      format: r.format,
      verified: r.verified,
      drift: r.drift,
      publicPath: r.publicPath,
      createdAt: r.createdAt.toISOString(),
    };
  }
  return out;
}
