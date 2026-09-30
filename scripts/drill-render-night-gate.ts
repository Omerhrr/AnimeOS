// THE RENDER NIGHT DRILL: THE NIGHT BURNS AND THE GATE BITES.
// Not a throwaway lab - this runs on the STANDING production
// (Immortal Path) and leaves its artifacts standing:
//   A. the night's cargo: the shots whose own descriptions call for
//      it get real directed fx/physics/grammar (the OVER anatomy
//      will name what rode the render, for real)
//   B. the real render night: six PREVIEW jobs through the resident
//      bridge + warm Blender pool, SUPERVISED BY THE FIRE ITSELF -
//      the REPAINT_QUEUE schedule is fired on a loop and its
//      supervision part 1 is what ticks every active job
//   C. the fire's cost line: the last fire's report carries the
//      night cost read over the REAL walls (ledger median/worst,
//      the OVER regressions naming what rode, the SLOW tail counted)
//   D. the gate before scoring: a staged publish through the REAL
//      /api/publish route refused honestly (UNSCORED - the spine
//      does not guess a release)
//   E. the verdict for real: real model sheets (real image-gen) +
//      real render-identity scoring (real vision calls over the
//      night's real clips) -> the matrix's REAL distribution ->
//      the gate's real answer (HOLD/BELLOW refusal verbatim, or the
//      gate OPENS and the package stages with the identity check)
// Run: PHASE=night|gate|all npx tsx scripts/drill-render-night-gate.ts
//      (the gate phase needs the dev server alive; the night phase
//       spawns/adopts the resident bridge on its own)

import { db } from "../src/lib/db";
import { createRenderJob } from "../src/lib/engine/render";
import { performanceData, performanceNightLine, performanceLine, performanceFrames } from "../src/lib/engine/performance";
import { createSchedule, fireScheduleNow } from "../src/lib/scheduler";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { scoreRenderIdentity } from "../src/lib/identity";
import { ensureResident } from "../src/lib/blender/runtime";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();
const PRODUCTION_TITLE = "Immortal Path";
const FPS = 24;
const NIGHT_CAP_MS = 8.5 * 60 * 1000;
const ACCOUNT = { email: "director@studio.dev", password: "anchored2026", name: "Lin Director" };

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}
const said = (label: string, line: string) => {
  console.log(`\n<< ${label} >>`);
  console.log(line.split("; ").join(";\n  "));
  console.log("");
};

class Jar {
  private m = new Map<string, string>();
  absorb(res: Response) {
    const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0) this.m.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  get header(): string {
    return Array.from(this.m.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "drill-night-gate" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "drill-night-gate", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await fetch(`${BASE}/api/projects`, { headers: { cookie: jar.header, "user-agent": "drill-night-gate" } });
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function call(jar: Jar, p: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { "content-type": "application/json", "user-agent": "drill-night-gate", cookie: jar.header, ...(init.headers ?? {}) },
  });
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* empty */ }
  return { status: res.status, body };
}

const ref = (epNo: number, scNo: number, shotNo: number) =>
  `E${epNo} Sc${scNo} S${String(shotNo).padStart(3, "0")}`;
const ms = (v: number) => (v >= 60000 ? `${(v / 60000).toFixed(1)}min` : `${(v / 1000).toFixed(0)}s`);

async function production() {
  const project = await db.project.findFirst({ where: { title: PRODUCTION_TITLE } });
  if (!project) throw new Error(`the standing production '${PRODUCTION_TITLE}' is missing`);
  const episode = await db.episode.findFirst({ where: { season: { projectId: project.id } }, orderBy: { number: "asc" } });
  if (!episode) throw new Error("the production carries no episode");
  const scene = await db.scene.findFirst({ where: { episodeId: episode.id }, orderBy: { number: "asc" } });
  if (!scene) throw new Error("the episode carries no scene");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  return { project, episode, scene, shots };
}

// ── A. the night's cargo ──
async function directCargo(shots: Awaited<ReturnType<typeof production>>["shots"]): Promise<void> {
  const byNo = (n: number) => shots.find((s) => s.number === n);
  // S005 sword draw: the blade sings out, azure energy coiling up the steel
  const s5 = byNo(5);
  if (s5) {
    await db.shot.update({
      where: { id: s5.id },
      data: {
        grammar: JSON.stringify([{ move: "DOLLY_IN", from: 0, to: 1.2, note: "push on the draw" }, { move: "ORBIT", from: 1.2, to: 2.4, note: "circle the drawn blade" }]),
        fx: JSON.stringify([
          { kind: "slash_trace", color: "#7fd4ff", intensity: 0.8, note: "the draw's arc" },
          { kind: "energy_coil", color: "#9fe8ff", intensity: 0.6, note: "azure energy climbing the steel" },
        ]),
      },
    });
  }
  // S006 impact: lightning detonates through the broken roof, debris suspended mid-air
  const s6 = byNo(6);
  if (s6) {
    await db.shot.update({
      where: { id: s6.id },
      data: {
        grammar: JSON.stringify([{ move: "CRANE", from: 0, to: 1.4, note: "rise over the clash" }, { move: "DOLLY_IN", from: 1.4, to: 2.4, note: "into the shockwave" }]),
        fx: JSON.stringify([
          { kind: "lightning_flash", intensity: 0.9, note: "the detonation" },
          { kind: "debris_burst", intensity: 0.7, note: "roof debris suspended mid-air" },
        ]),
        physics: JSON.stringify([{ kind: "cloth", intensity: 0.6, note: "robes whipped by the shockwave" }]),
      },
    });
  }
  // S004: the Demon Lord's aura crawls across the floor
  const s4 = byNo(4);
  if (s4) {
    await db.shot.update({
      where: { id: s4.id },
      data: { fx: JSON.stringify([{ kind: "aura_crawl", color: "#b388ff", intensity: 0.5, note: "the shadow detaching itself" }]) },
    });
  }
}

// ── B+C. the real render night, supervised by the fire itself ──
// the bridge drivers the night can land on (the pipeline picks per
// job: BLENDER / BLENDER_LOCAL via the resident pool, MOTION as the
// honest fallback when the pool saturates - all three are real renders)
const NIGHT_DRIVERS = ["BLENDER", "BLENDER_LOCAL", "MOTION"];

async function renderNight(projectId: string, shots: Array<{ id: string; number: number }>): Promise<void> {
  // find-or-create the standing schedule (the studio keeps its render night)
  const existing = await db.studioSchedule.findFirst({ where: { projectId, kind: "REPAINT_QUEUE", name: "Render Night" } });
  const sched = existing
    ? { ok: true as const, schedule: { id: existing.id } }
    : await createSchedule(projectId, { name: "Render Night", kind: "REPAINT_QUEUE", cadence: "DAILY", hourUtc: 2 });
  check("N1 the render-night schedule stands (a real cadence on the real production)", sched.ok, "createSchedule refused");
  if (!sched.ok) return;

  // enqueue the night: one PREVIEW job per shot that has neither a finished
  // nor an in-flight BLENDER_LOCAL render (re-runs resume, never double-render)
  let enqueued = 0;
  for (const shot of shots) {
    const prior = await db.renderJob.findFirst({
      where: {
        projectId, shotId: shot.id, driver: { in: ["BLENDER", "BLENDER_LOCAL", "MOTION"] }, status: { notIn: ["FAILED"] },
        OR: [{ outputUrl: { not: null } }, { status: { in: ["QUEUED", "RENDERING", "INSPECTING"] } }],
      },
      select: { id: true, status: true },
    });
    if (prior) continue;
    await createRenderJob(projectId, shot.id, "PREVIEW");
    enqueued += 1;
  }
  console.log(`\n-- the night enqueued ${enqueued} new render job(s) over ${shots.length} shot(s) --\n`);

  // THE FIRE SUPERVISES: every pass ticks every active job (progress,
  // completions, stale-worker failures) - exactly what the nightly
  // cadence does - until the queue drains or the cap burns
  const t0 = Date.now();
  let lastActive = -1;
  for (;;) {
    const active = await db.renderJob.count({ where: { projectId, status: { in: ["QUEUED", "RENDERING"] } } });
    if (active === 0) break;
    if (active !== lastActive) {
      const stages = await db.renderJob.findMany({
        where: { projectId, status: { in: ["QUEUED", "RENDERING"] } },
        select: { stage: true, shotId: true },
      });
      console.log(`[night] ${active} active job(s): ${stages.map((j) => j.stage ?? "?").join(" | ")}`);
      lastActive = active;
    }
    if (Date.now() - t0 > NIGHT_CAP_MS) {
      console.log(`[night] the cap burned with ${active} job(s) still rendering - re-run PHASE=night to resume`);
      break;
    }
    const fire = await fireScheduleNow(sched.schedule.id);
    if (!fire.ok) {
      console.log(`[night] the fire errored: ${fire.error}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  // the night's ledger, read honestly
  const jobs = await db.renderJob.findMany({
    where: { projectId, driver: { in: NIGHT_DRIVERS }, shotId: { not: null } },
    include: { shot: { include: { scene: { include: { episode: { select: { number: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n-- the night's real renders --");
  for (const j of jobs) {
    if (!j.finishedAt || !j.startedAt) continue;
    const wall = j.finishedAt.getTime() - j.startedAt.getTime();
    const frames = j.shot ? performanceFrames(j.shot.duration, FPS) : 0;
    const spf = frames > 0 ? (wall / 1000) / frames : 0;
    console.log(`  ${ref(j.shot!.scene.episode.number, j.shot!.scene.number, j.shot!.number)} ${j.mode} ${j.status} attempt ${j.attempt}: ${ms(wall)} wall, ${frames} frame(s), ${spf.toFixed(2)}s/f`);
  }
  const withClip = jobs.filter((j) => j.finishedAt && j.status !== "FAILED" && j.outputUrl);
  const shotsWithClip = new Set(withClip.map((j) => j.shotId)).size;
  check("N2 the night's renders stand finished (every shot carries a finished bridge render)",
    shotsWithClip === shots.length, `shots-with-clip=${shotsWithClip}/${shots.length}`);
  const clipsOnDisk = withClip.filter((j) => j.outputUrl && fs.existsSync(path.join(process.cwd(), "public", j.outputUrl.replace(/^\//, "").split("?")[0])));
  check("N3 the rendered clips are real files on disk", clipsOnDisk.length === shotsWithClip, `clips=${clipsOnDisk.length}/${shotsWithClip}`);
}

// ── C. the fire reads its cost line ──
async function theFire(projectId: string): Promise<string | null> {
  const sched = await db.studioSchedule.findFirst({ where: { projectId, kind: "REPAINT_QUEUE", name: "Render Night" } });
  if (!sched) {
    check("N4 the render-night schedule stands", false, "schedule vanished");
    return null;
  }
  const fire = await fireScheduleNow(sched.id);
  check("N4 the fire ran and reported", fire.ok, fire.error ?? "no report");
  const report = fire.report ?? "";
  check("N5 the fire's report carries the night cost read", report.includes("night cost read:"), report.slice(0, 200));

  // the line's window count is honest: it names exactly what the
  // ledger says finished inside the window
  const ledger = await performanceData(projectId);
  const line = performanceNightLine(ledger, 24, new Date());
  const expectedNight = ledger.cohorts.flatMap((c) => c.readings).filter((x) => Date.now() - new Date(x.finishedAt).getTime() < 24 * 3600 * 1000).length;
  check("N6 the night line's window count matches the ledger", line.includes(`${expectedNight} finished in the last 24h`), `${line.slice(0, 160)} (expected ${expectedNight})`);
  check("N7 the cost line carries the ledger shape (median + worst + the honest verdict half)",
    line.includes("ledger median") && (line.includes("no regressions") || line.includes("over:")),
    line.slice(0, 200));
  said("THE FIRE'S COST LINE (verbatim, over the real night)", report);
  const fullRead = performanceLine(ledger);
  said("THE FULL COST LEDGER (the DSH read)", fullRead);
  return report;
}

// ── D+E. the gate ──
async function theGate(projectId: string, episodeId: string, epNo: number, scNo: number, shots: Array<{ id: string; number: number; description: string | null }>): Promise<void> {
  const jar = await loginJar(ACCOUNT.email, ACCOUNT.password);
  const epTag = `EP${String(epNo).padStart(2, "0")}`;

  // D. the gate before scoring: the spine refuses whatever the ledger
  // honestly holds at entry - UNSCORED (nothing measured, never guessed)
  // on a fresh production, or the under-floor refusal once readings exist
  const before = await call(jar, "/api/publish", { method: "POST", body: JSON.stringify({ episodeId, platform: "YOUTUBE" }) });
  const beforeErr = String(before.body.error ?? "");
  const refusedBefore = before.status === 400
    && (beforeErr.includes("does not guess a release") || beforeErr.includes("does not publish"));
  check("G1 the staging is refused before any release exists (the gate's teeth, whatever the ledger honestly holds)", refusedBefore, `status=${before.status} err=${beforeErr.slice(0, 160)}`);
  said(`THE GATE'S REFUSAL (verbatim, ${epTag} at entry)`, beforeErr);
  const pubEventsBefore = await db.productionEvent.count({ where: { projectId, type: "PUBLISH" } });
  check("G2 a refusal lands no PUBLISH event", pubEventsBefore === 0, `events=${pubEventsBefore}`);

  // E1. the sheets: real image-gen for the featured cast
  const cast = await db.character.findMany({ where: { projectId } });
  const featured = cast.filter((c) => shots.some((s) => (s.description ?? "").toLowerCase().includes(c.name.toLowerCase().split(" ")[0])));
  for (const member of featured) {
    if (member.modelSheetUrl && fs.existsSync(path.join(process.cwd(), "public", member.modelSheetUrl.split("?")[0].replace(/^\//, "")))) {
      console.log(`[sheet] ${member.name} already anchored (${member.modelSheetUrl})`);
      continue;
    }
    const sheet = await generateCharacterModelSheet(member.id);
    console.log(`[sheet] ${member.name} anchored -> ${sheet.modelSheetUrl}`);
  }
  const anchored = await db.character.findMany({ where: { projectId, modelSheetUrl: { not: null } } });
  check("G3 the featured cast is anchored on real model sheets", anchored.length >= featured.length && featured.length > 0, `featured=${featured.length} anchored=${anchored.length}`);

  // E2. the scoring: real vision calls over the night's real clips
  const scoredShots: Array<{ shotId: string; ref: string }> = [];
  for (const shot of shots) {
    const detected = featured.filter((c) => (shot.description ?? "").toLowerCase().includes(c.name.toLowerCase().split(" ")[0]));
    if (detected.length === 0) continue;
    const res = await scoreRenderIdentity(shot.id);
    const shotRef = ref(epNo, scNo, shot.number);
    if (!res.ok) {
      console.log(`[score] ${shotRef}: refused - ${res.error}`);
      continue;
    }
    scoredShots.push({ shotId: shot.id, ref: shotRef });
    const row = await db.identityScore.findFirst({ where: { shotId: shot.id, source: "RENDER" }, orderBy: { createdAt: "desc" } });
    const entries = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>) : [];
    console.log(`[score] ${shotRef}: ${entries.map((e) => `${e.characterName} ${(e.similarity ?? 0).toFixed(2)}`).join(", ")}${row?.note ? ` - ${row.note}` : ""}`);
  }
  const scoreRows = await db.identityScore.count({ where: { projectId, source: "RENDER" } });
  check("G4 the night's renders are scored for real (RENDER-source identity rows)", scoreRows > 0 && scoredShots.length > 0, `rows=${scoreRows} shots=${scoredShots.length}`);

  // E3. the matrix's verdict on the real distribution
  const verdict = await episodeReleaseVerdict(projectId, episodeId);
  const shape = `verdict ${verdict.verdict} over ${verdict.readings} reading(s): mean ${verdict.overall.mean === null ? "-" : (verdict.overall.mean * 100).toFixed(0) + "%"}, median ${verdict.overall.median === null ? "-" : (verdict.overall.median * 100).toFixed(0) + "%"}, p10 ${verdict.overall.p10 === null ? "-" : (verdict.overall.p10 * 100).toFixed(0) + "%"}; blocking: ${verdict.blocking.map((c) => `${c.key} - ${c.verdict}, p10 ${c.p10 === null ? "-" : (c.p10 * 100).toFixed(0) + "%"} (worst at ${c.worstRef ?? "-"})`).join(" | ") || "none"}`;
  said("THE MATRIX'S VERDICT (the real distribution)", shape);

  // E4. the gate's real answer
  const after = await call(jar, "/api/publish", { method: "POST", body: JSON.stringify({ episodeId, platform: "YOUTUBE" }) });
  if (after.status === 200) {
    const pkg = after.body as { ready?: boolean; conformance?: Array<{ label: string; ok: boolean; detail: string }>; checklist?: string[] };
    const identityCheck = (pkg.conformance ?? []).find((c) => c.label === "identity distribution");
    check("G5 the gate OPENS on the real distribution (staged with the identity check riding)", !!identityCheck && identityCheck.ok, JSON.stringify(pkg.conformance ?? []).slice(0, 200));
    said("THE GATE OPENS (the package's identity check)", identityCheck?.detail ?? "missing");
  } else {
    const refusal = String(after.body.error ?? "");
    const wording = verdict.verdict === "HOLD" ? "does not publish on a HOLD distribution" : verdict.verdict === "BELOW" ? "does not publish BELOW the floor" : refusal;
    check(`G5 the gate refuses the real ${verdict.verdict} distribution with the work order named`,
      after.status === 400 && refusal.includes(wording), `status=${after.status} err=${refusal.slice(0, 220)}`);
    said(`THE GATE'S REFUSAL (verbatim, the real ${verdict.verdict})`, refusal);
  }

  // E5. the cadence obeys the same gate
  const pubSchedExisting = await db.studioSchedule.findFirst({ where: { projectId, kind: "PUBLISH_RUN", name: "Weekly Slip" } });
  const pubSched = pubSchedExisting
    ? { ok: true as const, schedule: { id: pubSchedExisting.id } }
    : await createSchedule(projectId, { name: "Weekly Slip", kind: "PUBLISH_RUN", publishEpisode: epNo, publishPlatform: "YOUTUBE", cadence: "WEEKLY", weekday: 1, hourUtc: 3 });
  check("G6 the PUBLISH_RUN cadence stands", pubSched.ok, pubSched.ok ? "" : pubSched.error ?? "");
  if (pubSched.ok) {
    const fire = await fireScheduleNow(pubSched.schedule.id);
    const cadenceRefuses = fire.status === "SKIPPED" && (fire.report ?? "").includes("does not publish");
    const cadenceStages = fire.status === "OK";
    check("G7 the cadence obeys the gate (skips on a refusal, stages on a release)", cadenceRefuses || cadenceStages, `${fire.status}: ${(fire.report ?? fire.error ?? "").slice(0, 200)}`);
    said("THE CADENCE'S ANSWER (verbatim)", `${fire.status}: ${fire.report ?? fire.error ?? ""}`);
  }
}

async function run() {
  console.log(`== THE RENDER NIGHT DRILL (phase: ${PHASE}) ==\n`);
  const { project, episode, scene, shots } = await production();
  console.log(`production: ${project.title} (fps ${project.fps}) - ${`EP${episode.number}`} "${episode.title}", scene ${scene.number}, ${shots.length} shot(s)\n`);

  if (PHASE === "night" || PHASE === "all") {
    await directCargo(shots);
    console.log("-- the night's cargo is directed (fx/physics/grammar on the shots that call for it) --");
    const resident = await ensureResident();
    check("N0 the resident Blender bridge is alive (spawned or adopted)", resident, "ensureResident failed");
    await renderNight(project.id, shots.map((s) => ({ id: s.id, number: s.number })));
    await theFire(project.id);
  }

  if (PHASE === "gate" || PHASE === "all") {
    await theGate(project.id, episode.id, episode.number, scene.number, shots.map((s) => ({ id: s.id, number: s.number, description: s.description })));
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - the render night drill (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("the drill crashed:", err);
  process.exit(1);
});
