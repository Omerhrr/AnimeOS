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
    webhookUrl: body.webhookUrl === undefined ? undefined : String(body.webhookUrl ?? ""),
    digestEmail: body.digestEmail === undefined ? undefined : String(body.digestEmail ?? ""),
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
  if (!scheduleId || !["enable", "disable", "run", "set_delivery"].includes(action)) {
    return NextResponse.json({ error: "scheduleId and action (enable | disable | run | set_delivery) required" }, { status: 400 });
  }
  if (action === "set_delivery") {
    // DAILY_DIGEST delivery targets (webhook + email), steerable any time
    const row = await db.studioSchedule.findUnique({ where: { id: scheduleId } });
    if (!row) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    if (row.kind !== "DAILY_DIGEST") return NextResponse.json({ error: "only DAILY_DIGEST schedules carry delivery targets" }, { status: 400 });
    const data: { webhookUrl?: string | null; digestEmail?: string | null } = {};
    if (body.webhookUrl !== undefined) {
      const hook = String(body.webhookUrl ?? "").trim();
      if (hook && !/^https?:\/\/\S+$/.test(hook)) return NextResponse.json({ error: "webhookUrl must be an http(s) URL" }, { status: 400 });
      data.webhookUrl = hook || null;
    }
    if (body.digestEmail !== undefined) {
      const mail = String(body.digestEmail ?? "").trim();
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return NextResponse.json({ error: "digestEmail must be a valid email address" }, { status: 400 });
      data.digestEmail = mail || null;
    }
    await db.studioSchedule.update({ where: { id: scheduleId }, data });
    return NextResponse.json({ ok: true, ...data });
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
