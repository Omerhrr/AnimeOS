import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { auditAsset, auditLibrary, designStatus, fixIssues, retireIssues } from "@/lib/blender/design-review";

// ─────────────────────────────────────────────────────────────
// DESIGN REVIEW API (the self-correcting design loop, visible)
//
// GET  /api/design-reviews?projectId=...   - the standing readout:
//        open issues by severity, recent reviews, per-asset grades
// POST {action: audit|fix|retire, projectId, ...}
//        audit  {refName?, kind?, library?}  - run the audit pass
//        fix    {refName, kind?, issueIds?}  - run the fix pass
//        retire {issueIds, note}             - mark issues WONTFIX
//
// Reads are reads (any crew member); audit/fix/retire are design
// WRITES (EDITOR+ through the write gate, OWNER unconditionally).
// ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const access = await requireProjectAccess(request, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const status = await designStatus(projectId);
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  let body: {
    action?: string;
    projectId?: string;
    refName?: string;
    kind?: string;
    library?: boolean;
    issueIds?: string[];
    note?: string;
  } = {};
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

  if (action === "audit") {
    if (body.library) {
      const res = await auditLibrary(projectId, true);
      return NextResponse.json(res, { status: res.ok ? 200 : 500 });
    }
    const refName = String(body.refName ?? "").trim();
    if (!refName) return NextResponse.json({ error: "refName is required (or library: true)" }, { status: 400 });
    const kind = String(body.kind ?? "").toUpperCase();
    const asset = await db.blenderAsset.findFirst({
      where: { projectId, refName, ...(kind ? { kind } : {}) },
      orderBy: { updatedAt: "desc" },
    });
    if (!asset) return NextResponse.json({ error: `no library asset named ${refName}` }, { status: 404 });
    const res = await auditAsset(asset.id, true);
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  }
  if (action === "fix") {
    const refName = String(body.refName ?? "").trim();
    if (!refName) return NextResponse.json({ error: "refName is required" }, { status: 400 });
    const kind = String(body.kind ?? "").toUpperCase();
    const asset = await db.blenderAsset.findFirst({
      where: { projectId, refName, ...(kind ? { kind } : {}) },
      orderBy: { updatedAt: "desc" },
    });
    if (!asset) return NextResponse.json({ error: `no library asset named ${refName}` }, { status: 404 });
    const res = await fixIssues(asset.id, Array.isArray(body.issueIds) ? body.issueIds.map(String) : undefined);
    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
  }
  if (action === "retire") {
    const issueIds = Array.isArray(body.issueIds) ? body.issueIds.map(String) : [];
    if (issueIds.length === 0) return NextResponse.json({ error: "issueIds array is required" }, { status: 400 });
    const count = await retireIssues(projectId, issueIds, String(body.note ?? ""));
    return NextResponse.json({ ok: true, retired: count });
  }
  return NextResponse.json({ error: `unknown action "${action}" (audit | fix | retire)` }, { status: 400 });
}
