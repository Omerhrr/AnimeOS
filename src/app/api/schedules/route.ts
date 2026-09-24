export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createSchedule, listSchedules, fireDueSchedules, fireScheduleNow,
} from "@/lib/scheduler";
import { scheduleHealthData } from "@/lib/schedule-health";

// ── Cadence scheduler (approved plans on a schedule + render-queue
//    supervision) + its health digest.
//
// GET    { projectId }                                   -> schedules (cadence + last fire) + health digest
// POST   { projectId, name, kind, cadence, ... }         -> register a schedule
// POST   { action: "tick" }                              -> fire every due schedule now
// PATCH  { scheduleId, action: enable|disable|run }      -> steer
// DELETE { id }                                          -> remove

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const [schedules, digest] = await Promise.all([listSchedules(projectId), scheduleHealthData(projectId)]);
  return NextResponse.json({ schedules, digest });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (String(body.action ?? "") === "tick") {
    const result = await fireDueSchedules();
    return NextResponse.json(result);
  }
  const projectId = String(body.projectId ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const result = await createSchedule(projectId, {
    name: String(body.name ?? ""),
    kind: String(body.kind ?? "PLAN_RUN"),
    planId: body.planId ? String(body.planId) : null,
    cadence: String(body.cadence ?? "DAILY"),
    intervalHours: Number(body.intervalHours ?? 1),
    hourUtc: Number(body.hourUtc ?? 2),
    weekday: Number(body.weekday ?? 1),
    maxSteps: Number(body.maxSteps ?? 3),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const scheduleId = String(body.scheduleId ?? "");
  const action = String(body.action ?? "").toLowerCase();
  if (!scheduleId || !["enable", "disable", "run"].includes(action)) {
    return NextResponse.json({ error: "scheduleId and action (enable | disable | run) required" }, { status: 400 });
  }
  if (action === "enable" || action === "disable") {
    const row = await db.studioSchedule.findUnique({ where: { id: scheduleId } });
    if (!row) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    await db.studioSchedule.update({
      where: { id: scheduleId },
      data: { enabled: action === "enable" },
    });
    return NextResponse.json({ ok: true });
  }
  const result = await fireScheduleNow(scheduleId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const row = await db.studioSchedule.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  await db.studioSchedule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
