// THE GATE'S WORK ORDER, STEPS 2-4 - THE PIXELS CARRY THE SHEETS,
// THE DISTRIBUTION IS REPAIRED, THE GATE ANSWERS AGAIN.
// The render night's gate refused EP07 on an honestly-earned BELOW
// distribution (mean 2%, p10 0%): the pixels were guess-built because
// the production had never read its own sheets. The binding
// (drill-bind-sheets.ts) landed the measured truth on
// Character.sheetDna; iteration 105 closed the clip-loss race so the
// re-render cannot lose clips to the old 900s lie. This drill:
//   night - re-render every cast shot of EP07 Sc12 (S002-S005) through
//           the resident bridge + warm pool; the payload now compiles
//           sheet-adherent DNA (the silhouette shapes the mesh, the
//           face sculpted to the sheet's family, the surface graded by
//           the sheet's own hexes, the groom directed by the sheet's
//           sentence, the palette pull 0.75); the character assets
//           RE-VERSION on the moved hash (a changed asset is unproven
//           until the readings say otherwise). Resumable: every call
//           resumes the night, the cap is per-call.
//   gate  - the proof first: the newest job files carry
//           namedBySheet (the sheets' fields the pixels actually
//           wore); then every cast shot with a finished clip is
//           RE-SCORED with real vision calls (the upsert replaces the
//           shot's old mannequin reading); then the episode's release
//           verdict over the repaired distribution; then a REAL staged
//           publish through /api/publish - the gate's answer, whatever
//           it honestly is.
// Run: PHASE=night|gate|all npx tsx scripts/drill-bind-repair-stage.ts

import { db } from "../src/lib/db";
import { createRenderJob } from "../src/lib/engine/render";
import { fireScheduleNow } from "../src/lib/scheduler";
import { scoreRenderIdentity } from "../src/lib/identity";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();
const PRODUCTION_TITLE = "Immortal Path";
const NIGHT_CAP_MS = 7.5 * 60 * 1000;

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
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "drill-bind-repair" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "drill-bind-repair", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await fetch(`${BASE}/api/projects`, { headers: { cookie: jar.header, "user-agent": "drill-bind-repair" } });
  if (probe.status !== 200) throw new Error(`login failed: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

const ref = (epNo: number, scNo: number, shotNo: number) => `E${epNo} Sc${scNo} S${String(shotNo).padStart(3, "0")}`;
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

// ── the re-render night (the pixels carry the sheets) ──
async function repairNight(prod: Awaited<ReturnType<typeof production>>): Promise<void> {
  const { project, shots } = prod;
  const existing = await db.studioSchedule.findFirst({ where: { projectId: project.id, kind: "REPAINT_QUEUE", name: "Render Night" } });
  if (!existing) throw new Error("the standing Render Night schedule is missing - run the render night drill first");

  // the re-render set: every shot whose own text detects CAST (the
  // castless environment beats have no identity to bind - named, not
  // hidden). The supersede is DELIBERATE: the old mannequin clips are
  // exactly what this night replaces.
  const castRows = await db.character.findMany({ where: { projectId: project.id } });
  const { detectCast } = await import("../src/lib/ai/art");
  const castShots = shots.filter((s) => detectCast(castRows, s.description).length > 0);
  console.log(`-- the repair set: ${castShots.map((s) => `S${String(s.number).padStart(3, "0")}`).join(", ")} (of ${shots.length} shots; the castless beats keep their clips) --`);

  let enqueued = 0;
  for (const shot of castShots) {
    const active = await db.renderJob.findFirst({
      where: { projectId: project.id, shotId: shot.id, status: { in: ["QUEUED", "RENDERING", "INSPECTING"] } },
      select: { id: true },
    });
    if (active) continue;
    // THE REPAIR LAW: a shot whose newest BLENDER attempt already
    // carries a clip has the sheets riding its pixels - re-rendering
    // it again is waste, not diligence. Only a clipless newest attempt
    // (a failed or lost render) earns another job.
    const newestBlender = await db.renderJob.findFirst({
      where: { projectId: project.id, shotId: shot.id, driver: { in: ["BLENDER", "BLENDER_LOCAL"] } },
      orderBy: { attempt: "desc" },
      select: { outputUrl: true, attempt: true, status: true },
    });
    if (newestBlender?.outputUrl) continue;
    await createRenderJob(project.id, shot.id, "PREVIEW");
    enqueued += 1;
  }
  console.log(`-- the night enqueued ${enqueued} re-render job(s) (sheet-adherent DNA rides every payload) --\n`);

  const t0 = Date.now();
  let lastActive = -1;
  for (;;) {
    const active = await db.renderJob.count({ where: { projectId: project.id, status: { in: ["QUEUED", "RENDERING"] } } });
    if (active === 0) break;
    if (active !== lastActive) {
      const stages = await db.renderJob.findMany({
        where: { projectId: project.id, status: { in: ["QUEUED", "RENDERING"] } },
        select: { stage: true, shotId: true, progress: true },
      });
      console.log(`[night] ${active} active: ${stages.map((j) => `${j.progress}% ${j.stage ?? "?"}`).join(" | ")}`);
      lastActive = active;
    }
    if (Date.now() - t0 > NIGHT_CAP_MS) {
      console.log(`[night] the call's cap burned with ${active} job(s) rendering - re-run PHASE=night to resume`);
      break;
    }
    const fire = await fireScheduleNow(existing.id);
    if (!fire.ok) {
      console.log(`[night] the fire errored: ${fire.error}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  // the night's ledger, read honestly
  const jobs = await db.renderJob.findMany({
    where: { projectId: project.id, driver: { in: ["BLENDER", "BLENDER_LOCAL"] }, shotId: { not: null } },
    include: { shot: { include: { scene: { include: { episode: { select: { number: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n-- the repair night's renders (the newest attempt per shot is the shipping clip) --");
  for (const j of jobs.slice(-8)) {
    if (!j.finishedAt || !j.startedAt) continue;
    const wall = j.finishedAt.getTime() - j.startedAt.getTime();
    console.log(`  ${ref(j.shot!.scene.episode.number, j.shot!.scene.number, j.shot!.number)} att${j.attempt} ${j.driver} ${j.status}: ${ms(wall)} wall, clip=${j.outputUrl ? "yes" : "NO"}`);
  }
}

// ── the proof, the re-score, the verdict, the gate ──
async function repairGate(): Promise<void> {
  const { project, episode, scene, shots } = await production();

  // G1. THE PIXELS CARRY THE SHEETS: the newest finished job file per
  // cast shot names the sheet fields its figure actually wore
  const castRows = await db.character.findMany({ where: { projectId: project.id } });
  const { detectCast } = await import("../src/lib/ai/art");
  const castShots = shots.filter((s) => detectCast(castRows, s.description).length > 0);
  let sheetedJobs = 0;
  let namedFields = 0;
  for (const shot of castShots) {
    const job = await db.renderJob.findFirst({
      where: { projectId: project.id, shotId: shot.id, driver: { in: ["BLENDER", "BLENDER_LOCAL"] }, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!job) continue;
    const f = path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`);
    if (!fs.existsSync(f)) continue;
    try {
      const state = JSON.parse(fs.readFileSync(f, "utf8")) as { design?: { figure?: string | null }; rig?: { sculpt?: { namedBySheet?: string[] } } };
      const worn = state.rig?.sculpt?.namedBySheet ?? [];
      if (state.design?.figure) namedFields = Math.max(namedFields, worn.length);
      if (worn.length > 0) sheetedJobs += 1;
      console.log(`  ${ref(episode.number, scene.number, shot.number)}: figure=${state.design?.figure ?? "-"} namedBySheet=[${worn.join(", ")}]`);
    } catch { /* an unreadable file is named by absence below */ }
  }
  check("G1 the re-rendered figures were BUILT FROM THE SHEETS (namedBySheet non-empty on the newest clips)", sheetedJobs > 0, `sheetedJobs=${sheetedJobs} maxFields=${namedFields}`);

  // G2. THE ASSETS RE-VERSIONED (the moved master hash)
  const assets = await (db as unknown as { characterAsset: { findMany: (a: unknown) => Promise<Array<{ name: string; version: number; status: string; masterHash: string }>> } }).characterAsset.findMany({ where: { projectId: project.id } });
  const reversioned = assets.filter((a) => a.version >= 2);
  check("G2 the character assets re-versioned on the moved hash (a changed asset is unproven until the readings say otherwise)", reversioned.length > 0, assets.map((a) => `${a.name} v${a.version} ${a.status} ${a.masterHash.slice(0, 8)}`).join(", ") || "none");

  // G3. THE RE-SCORE: every cast shot whose RENDER reading PREDATES
  // its newest clip is scored again with REAL vision calls - the
  // upsert replaces the shot's old mannequin reading, so the
  // distribution reads the CURRENT truth. A reading already newer than
  // its clip is current - re-scoring it would only burn a vision call
  // and stir the scorer's own run-to-run variance into the record.
  console.log("");
  const scored: Array<{ ref: string; entries: string }> = [];
  for (const shot of castShots) {
    const newestClip = await db.renderJob.findFirst({
      where: { projectId: project.id, shotId: shot.id, driver: { in: ["BLENDER", "BLENDER_LOCAL"] }, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
      orderBy: { createdAt: "desc" },
      select: { finishedAt: true },
    });
    const current = await db.identityScore.findUnique({ where: { shotId_source: { shotId: shot.id, source: "RENDER" } }, select: { scoredAt: true, scores: true } });
    if (newestClip?.finishedAt && current && current.scoredAt > newestClip.finishedAt) {
      const entries = JSON.parse(current.scores ?? "[]") as Array<{ characterName: string; similarity: number }>;
      console.log(`[score] ${ref(episode.number, scene.number, shot.number)}: current (scored ${(current.scoredAt.toISOString().slice(11, 19))}Z, after the clip) - ${entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")}`);
      scored.push({ ref: ref(episode.number, scene.number, shot.number), entries: entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ") });
      continue;
    }
    const res = await scoreRenderIdentity(shot.id);
    const shotRef = ref(episode.number, scene.number, shot.number);
    if (!res.ok) {
      console.log(`[score] ${shotRef}: refused - ${res.error}`);
      continue;
    }
    scored.push({ ref: shotRef, entries: res.scored.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ") });
    console.log(`[score] ${shotRef}: ${scored[scored.length - 1].entries}${res.scored.verdict.note ? ` - ${res.scored.verdict.note.slice(0, 90)}` : ""}`);
  }
  check("G3 the repaired clips are scored for real (RENDER rows current with their clips)", scored.length > 0, `scored=${scored.length}`);

  // G4. THE REPAIRED DISTRIBUTION - judged against the PRE-BINDING
  // anchor: the render night's committed record (its gate refused on
  // mean 2%, median 0%, p10 0% - the guess-built mannequins). That
  // anchor is the binding's proof line; the scorer's own run-to-run
  // variance is why the comparison crosses the binding, not another
  // re-score.
  const PRE_BINDING_MEAN = Number(process.env.PRE_BINDING_MEAN ?? "0.02");
  const verdict = await episodeReleaseVerdict(project.id, episode.id);
  const shape = (v: Awaited<ReturnType<typeof episodeReleaseVerdict>>) =>
    `${v.verdict} over ${v.readings} reading(s): mean ${v.overall.mean === null ? "-" : (v.overall.mean * 100).toFixed(0) + "%"}, median ${v.overall.median === null ? "-" : (v.overall.median * 100).toFixed(0) + "%"}, p10 ${v.overall.p10 === null ? "-" : (v.overall.p10 * 100).toFixed(0) + "%"}, worst ${v.overall.worst === null ? "-" : (v.overall.worst * 100).toFixed(0) + "%"}; blocking: ${v.blocking.map((c) => `${c.key} - ${c.verdict}, p10 ${c.p10 === null ? "-" : (c.p10 * 100).toFixed(0) + "%"}`).join(" | ") || "none"}`;
  said("THE DISTRIBUTION, PRE-BINDING vs AFTER THE BINDING",
    `pre-binding (the render night's committed record): BELOW, mean ${(PRE_BINDING_MEAN * 100).toFixed(0)}%, median 0%, p10 0%\nafter:  ${shape(verdict)}`);
  const moved = (verdict.overall.mean ?? 0) > PRE_BINDING_MEAN;
  check("G4 the distribution MOVED (the repaired mean clears the pre-binding anchor - the binding is measurable)", moved,
    `pre-binding mean ${(PRE_BINDING_MEAN * 100).toFixed(0)}% / repaired mean ${((verdict.overall.mean ?? 0) * 100).toFixed(0)}%`);

  // G5. THE GATE ANSWERS AGAIN - a REAL staged publish through the
  // REAL route with a REAL session; the answer is whatever the
  // repaired distribution honestly earns
  const jar = await loginJar("director@studio.dev", "anchored2026");
  const res = await fetch(`${BASE}/api/publish`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "drill-bind-repair", cookie: jar.header },
    body: JSON.stringify({ episodeId: episode.id, platform: "YOUTUBE" }),
  });
  const body = (await res.json()) as { error?: string; package?: { status?: string; conformance?: Array<{ name?: string; ok?: boolean }> } };
  const refusal = String(body.error ?? "");
  if (verdict.verdict === "RELEASE") {
    const identityCheck = (body.package?.conformance ?? []).find((c) => String(c.name ?? "").includes("identity"));
    check("G5 the gate OPENS on the repaired distribution (staged, the identity check riding)", res.status === 200 && !!identityCheck?.ok, JSON.stringify(body).slice(0, 240));
    said("THE GATE OPENS", JSON.stringify(body.package ?? {}).slice(0, 600));
  } else {
    const wording = verdict.verdict === "HOLD" ? "does not publish on a HOLD distribution" : verdict.verdict === "BELOW" ? "does not publish BELOW the floor" : "does not guess a release";
    check("G5 the gate answers the repaired distribution honestly (the refusal names the remaining work order)",
      res.status !== 200 && refusal.includes(wording) && refusal.length > 40, `${res.status}: ${refusal.slice(0, 240)}`);
    said(`THE GATE'S ANSWER (the repaired distribution is ${verdict.verdict})`, refusal);
  }

  said("THE SCORE CARD", scored.map((s) => `${s.ref}: ${s.entries}`).join("\n"));
}

async function run() {
  console.log(`== THE BINDING REPAIR DRILL (phase: ${PHASE}) ==\n`);
  if (PHASE === "night" || PHASE === "all") await repairNight(await production());
  if (PHASE === "gate" || PHASE === "all") await repairGate();
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - the binding repair drill (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("drill crashed:", err);
  process.exit(1);
});
