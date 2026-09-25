import { NextResponse } from "next/server";
import { runtimeStatus, provisionBlender, ensureResident, restartResident } from "@/lib/blender/runtime";

// ─────────────────────────────────────────────────────────────
// BLENDER RUNTIME API (the studio's own Blender, as infrastructure)
//
// GET  /api/blender-runtime  - full runtime status: binary, version,
//                              provisioning progress, resident health
// POST {action}              - provision | start | restart
// ─────────────────────────────────────────────────────────────

export async function GET() {
  const status = await runtimeStatus(true);
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    // empty body allowed - defaults to start
  }
  const action = String(body.action ?? "start").toLowerCase();

  if (action === "provision") {
    const res = await provisionBlender();
    return NextResponse.json({ ok: res.ok, action, log: res.log, bin: res.bin });
  }
  if (action === "restart") {
    const ok = await restartResident();
    return NextResponse.json({ ok, action });
  }
  if (action === "start") {
    const ok = await ensureResident();
    return NextResponse.json({ ok, action });
  }
  return NextResponse.json({ ok: false, error: `unknown action "${action}" (provision | start | restart)` }, { status: 400 });
}
