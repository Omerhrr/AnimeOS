// ─────────────────────────────────────────────────────────────
// NIGHT 111 - the hull-ink re-score night over EP07 Sc12.
//
// The batch fire taught the overflow lesson: the 3D pool holds TWO
// local workers (ANIMEOS_RENDER_WORKERS default 2) and a PREVIEW
// that lands on a full pool FALLS THROUGH to the MOTION engine (and
// past it to the wall-clock SIMULATOR) - four of six shots rendered
// stand-in pixels that way. This driver drains the scene the honest
// way: never more than two shots in flight, the tick driven exactly
// like the UI drives it (GET /api/render-jobs), every shot landing
// a REAL Blender clip before the re-score judges it.
//
// Redo scope: any scene shot whose LATEST job is not a Blender
// driver (MOTION/SIMULATOR) or has no job at all. Blender jobs
// already rendering (or holding a clip) are left alone.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const TITLE = "Immortal Path";
const EMAIL = "director@studio.dev";
const PASSWORD = "anchored2026";
const POOL = 1; // the 4GB host's honest wall: the three-way contention
// OOM-killed a worker mid-night - solo renders only (the iteration 106
// lesson, re-learned live: the pool admits ONE designed build at a time)
const OVERALL_TIMEOUT_MS = 55 * 60 * 1000; // solo renders: ~6 min each x 5 + DSH
const POLL_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const project = await db.project.findFirst({ where: { title: TITLE } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  console.log(`scene: ${scene.title} - ${shots.length} shots`);

  // ── 1. REDO scope: junk drivers or jobless shots ──────────
  const redo: string[] = [];
  for (const s of shots) {
    const last = await db.renderJob.findFirst({
      where: { projectId: project.id, shotId: s.id },
      orderBy: { startedAt: "desc" },
    });
    const blender = last && (last.driver === "BLENDER_LOCAL" || last.driver === "BLENDER");
    const rendering = last && last.status === "RENDERING";
    if (!last || !blender || (!rendering && !last.outputUrl)) redo.push(s.id);
  }
  for (const sid of redo) {
    const jobs = await db.renderJob.findMany({ where: { projectId: project.id, shotId: sid } });
    for (const j of jobs) {
      if (j.outputUrl) {
        const file = path.join(process.cwd(), "public", j.outputUrl.split("?")[0].replace(/^\//, ""));
        try { fs.unlinkSync(file); } catch { /* already gone */ }
      }
    }
    await db.renderJob.deleteMany({ where: { projectId: project.id, shotId: sid } });
    await db.shot.update({ where: { id: sid }, data: { status: "REVIEW" } });
  }
  const shotNum = new Map(shots.map((s) => [s.id, s.number]));
  console.log(`redo queue: ${redo.map((id) => `S00${shotNum.get(id)}`).join(", ") || "(none)"}`);

  // ── 2. the direct mint (dogfood the new studio door) ──────
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const jar = (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  console.log("minted session for the night driver");

  // ── 3. the drain: never more than POOL shots in flight ────
  const pending = [...redo];
  const failures: string[] = [];
  const t0 = Date.now();
  let submits = 0;
  // the loop lives until the REDO SHOTS hold clips (not until the
  // submit queue drains - the first burn taught this: the drain
  // exited while the last render was still in flight)
  while (Date.now() - t0 < OVERALL_TIMEOUT_MS) {
    const all = await db.renderJob.findMany({
      where: { projectId: project.id, shotId: { in: shots.map((s) => s.id) } },
      orderBy: { startedAt: "asc" },
    });
    const latest = new Map<string, (typeof all)[number]>();
    for (const j of all) latest.set(j.shotId, j); // asc order -> last wins
    const active = [...latest.values()].filter(
      (j) => j.status === "RENDERING" && (j.driver === "BLENDER_LOCAL" || j.driver === "BLENDER"),
    ).length;

    // admit junk jobs that never landed a clip? no - failures mean the
    // submit itself failed; retry once by re-queueing them
    const retryQueue = failures.splice(0, failures.length);

    if (active < POOL && retryQueue.length + pending.length > 0) {
      const nextId = retryQueue[0] ?? pending.shift()!;
      if (retryQueue.length) pending.unshift(nextId);
      const res = await fetch(`${BASE}/api/render-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: jar },
        body: JSON.stringify({ action: "create", shotId: nextId, mode: "PREVIEW" }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && data.id) {
        submits += 1;
        console.log(`submitted S00${shotNum.get(nextId)} -> job ${data.id} (active ${active + 1}/${POOL})`);
      } else {
        failures.push(nextId);
        console.log(`submit failed S00${shotNum.get(nextId)}: ${data.error ?? res.status}`);
        if (failures.length > 2) throw new Error("three consecutive submit failures - aborting");
        await sleep(POLL_MS);
        continue;
      }
    }

    // drive the tick exactly like the UI: GET ticks jobs + hands
    // finished renders to DSH (2 inspections per call)
    await fetch(`${BASE}/api/render-jobs?projectId=${project.id}`, { headers: { cookie: jar } }).catch(() => null);

    const lines: string[] = [];
    for (const s of shots) {
      const j = latest.get(s.id);
      if (!j) { lines.push(`S00${s.number}: -`); continue; }
      const clip = j.outputUrl ? "+" : "-";
      lines.push(`S00${s.number}: ${j.driver}/${j.status} ${clip} f${(j.stage ?? "").match(/frame (\d+)\/(\d+)/)?.slice(1).join("/") ?? ""}`);
    }
    console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${lines.join(" | ")}`);

    // done when every redo shot's latest job holds a clip
    const done = redo.every((sid) => latest.get(sid)?.outputUrl);
    if (done && pending.length === 0 && failures.length === 0) break;
    await sleep(POLL_MS);
  }

  // ── 4. the night's ledger ─────────────────────────────────
  const final = await db.renderJob.findMany({
    where: { projectId: project.id, shotId: { in: shots.map((s) => s.id) } },
    orderBy: { startedAt: "asc" },
  });
  const lastMap = new Map<string, (typeof final)[number]>();
  for (const j of final) lastMap.set(j.shotId, j);
  let real = 0;
  for (const s of shots) {
    const j = lastMap.get(s.id);
    const isBlender = j && (j.driver === "BLENDER_LOCAL" || j.driver === "BLENDER");
    if (isBlender && j.outputUrl) real += 1;
    console.log(
      `S00${s.number}: ${j ? `${j.driver} ${j.status} clip=${j.outputUrl ? "yes" : "no"} (${j.stage ?? ""})` : "no job"}`,
    );
  }
  console.log(`\nNIGHT RESULT: ${real}/${shots.length} real Blender clips`);
  if (real < shots.length) {
    console.log("NOT every shot rides a real clip - the re-score would judge stand-ins; inspect above");
    process.exitCode = 2;
  }
}

main()
  .catch((e) => { console.error("night driver failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
