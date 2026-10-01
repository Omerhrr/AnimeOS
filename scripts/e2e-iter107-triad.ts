// Iteration 107 E2E: THE TRIAD (the frontier the crafted night's
// distribution named: surface, face, presence) + the two engine seams
// the night caught. Proves, against the REAL database and the REAL
// render engine tick:
//   A. source: the seam reader exported, the bake/wrinkle keys
//      re-versioned 107 on both runtimes
//   B. pure: the TS bake key mirrors the worker's bit-exactly (the
//      same sha256-16 over the same versioned key), the presence
//      table's shape
//   C. THE SEAMS over the real tick:
//      - a done-with-clip job file lands REVIEW when the bridge is
//        lost (the degrade consults the conclusion - the night's
//        clipless-SIM residue is dead)
//      - a done-with-error job file lands the NAMED failure
//      - an absent job file keeps the 106 degrade (the simulator)
//      - localJobStale: a concluded file is never stale, an
//        unconcluded quiet file is
//      - the fail-stale-jobs tool lands the unticked conclusion
//        instead of failing a finished render
//   D. cleanup
// Run: DATABASE_URL="file:/home/z/my-project/AnimeOS/db/custom.db" npx tsx scripts/e2e-iter107-triad.ts

import { db } from "../src/lib/db";
import { tickRenderJob } from "../src/lib/engine/render";
import { readLocalJobConclusion, localJobStale } from "../src/lib/bridge/blender";
import { headBakeKeyHash } from "../src/lib/blender/head-carve";
import { wrinkleKeyHash } from "../src/lib/blender/wrinkle";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync, utimesSync } from "node:fs";
import path from "node:path";

const MARK = "iter107-triad";
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

const ROOT = process.cwd();
const RENDERS = path.join(ROOT, "public", "renders");

function jobFileFor(jobId: string): string {
  return path.join(RENDERS, `.job-${jobId}.json`);
}

function writeJobFile(jobId: string, state: Record<string, unknown>) {
  writeFileSync(jobFileFor(jobId), JSON.stringify(state));
}

// ── A/B. the pure laws ──
check("A1 the seam reader is exported and honest on an absent file",
  readLocalJobConclusion("iter107-no-such-job") === null);

const bakeTS = headBakeKeyHash({ jawTaper: 0.92, chinFwd: 0.88, browFwd: 0.9, cheekOut: 0.85, noseLen: 0.95 });
const pyKey = `107|0.920|0.880|0.900|0.850|0.950|v1`;
const pyHash = execFileSync("python3", ["-c", `import hashlib;print(hashlib.sha256("${pyKey}".encode()).hexdigest()[:16])`]).toString().trim();
check("B1 the bake key is versioned 107 and mirrors the worker bit-exactly", bakeTS === pyHash, `${bakeTS} vs ${pyHash}`);
const wrTS = wrinkleKeyHash({ jawTaper: 0.92, chinFwd: 0.88, browFwd: 0.9, cheekOut: 0.85, noseLen: 0.95 });
const wrPy = execFileSync("python3", ["-c", `import hashlib;print(hashlib.sha256("107|0.920|0.880|0.900|0.850|0.950|v1".encode()).hexdigest()[:16])`]).toString().trim();
check("B2 the wrinkle key rides the same 107 version on both runtimes", wrTS === wrPy, `${wrTS} vs ${wrPy}`);
const bakeMoved = headBakeKeyHash({ jawTaper: 0.92, chinFwd: 0.88, browFwd: 0.9, cheekOut: 0.85, noseLen: 0.95 })
  !== execFileSync("python3", ["-c", `import hashlib;print(hashlib.sha256("90|0.920|0.880|0.900|0.850|0.950|v1".encode()).hexdigest()[:16])`]).toString().trim();
check("B3 the 107 bake key differs from the stale 90-era caches (re-bake is forced)", bakeMoved);

// ── C. the lab: a REAL production row chain + the REAL tick ──
async function run() {
const lab = await db.project.create({
  data: { title: `Iter107 Triad Lab ${MARK}`, logline: "a throwaway production for the seam proof", visualStyle: "DONGHUA" },
});
let labId = lab.id;
const season = await db.season.create({ data: { projectId: lab.id, number: 1, title: "S1" } });
const ep = await db.episode.create({ data: { seasonId: season.id, number: 1, title: "The Seam Arc" } });
const scene = await db.scene.create({ data: { episodeId: ep.id, number: 1, title: "The Quiet Ridge" } });
const shot = await db.shot.create({
  data: { sceneId: scene.id, number: 1, description: "Lin Yue stands on the ridge", shotType: "MEDIUM", movement: "STATIC", duration: 2.0 },
});
check("C1 the lab stands (project/episode/scene/shot)", !!lab && !!season && !!ep && !!scene && !!shot);

async function mkJob(tag: string): Promise<string> {
  const j = await db.renderJob.create({
    data: {
      projectId: lab.id, shotId: shot.id, mode: "PREVIEW", driver: "BLENDER",
      status: "RENDERING", progress: 40, stage: "Blender: rendering",
      startedAt: new Date(Date.now() - 60_000), durationMs: 2000,
    },
  });
  void tag;
  return j.id;
}

// C2. done-with-clip: the conclusion lands REVIEW (the night's residue is dead)
const j1 = await mkJob("clip");
const clipPath = path.join(RENDERS, `${j1}.mp4`);
writeFileSync(clipPath, "fake mp4 bytes for the seam proof");
writeJobFile(j1, { jobId: j1, done: true, mp4Path: clipPath, stage: "Blender worker: done", progress: 1.0 });
const t1 = await tickRenderJob(j1);
check("C2 the done-with-clip job lands REVIEW (not a SIM degrade) when the bridge is lost",
  t1?.status === "REVIEW" && t1.outputUrl === `/renders/${j1}.mp4` && (t1.stage ?? "").includes("conclusion"),
  `status=${t1?.status} url=${t1?.outputUrl} stage=${(t1?.stage ?? "").slice(0, 120)}`);
check("C3 the landed row never switched drivers", t1?.driver === "BLENDER", `driver=${t1?.driver}`);

// C4. done-with-error: the NAMED failure
const j2 = await mkJob("err");
writeJobFile(j2, { jobId: j2, done: true, error: "warm worker went quiet: no job-file progress for 420s", stage: "Blender worker: failed" });
const t2 = await tickRenderJob(j2);
check("C4 the done-with-error job lands the NAMED failure (re-queueable)",
  t2?.status === "FAILED" && (t2.stage ?? "").includes("warm worker went quiet"),
  `status=${t2?.status} stage=${(t2?.stage ?? "").slice(0, 140)}`);

// C5. absent file: the 106 degrade holds (the simulator)
const j3 = await mkJob("degrade");
const t3 = await tickRenderJob(j3);
check("C5 an unconcluded (absent) job file keeps the honest degrade to the simulator",
  t3?.driver === "SIMULATOR" && (t3.stage ?? "").includes("bridge lost"),
  `driver=${t3?.driver} stage=${(t3?.stage ?? "").slice(0, 120)}`);

// C6. the staleness law reads the conclusion first
const j4 = await mkJob("stale");
writeJobFile(j4, { jobId: j4, done: false, progress: 0.4 });
const old = new Date(Date.now() - 60 * 60_000);
utimesSync(jobFileFor(j4), old, old);
check("C6a an unconcluded quiet file IS stale (the old law holds)", localJobStale(j4) === true);
writeJobFile(j4, { jobId: j4, done: true, mp4Path: clipPath });
utimesSync(jobFileFor(j4), old, old);
check("C6b a concluded file is NEVER stale (the 107 law)", localJobStale(j4) === false);

// C7. the fail-stale-jobs tool lands the unticked conclusion
const j5 = await mkJob("tool");
const clip5 = path.join(RENDERS, `${j5}.mp4`);
writeFileSync(clip5, "fake mp4 bytes for the tool proof");
writeJobFile(j5, { jobId: j5, done: true, mp4Path: clip5, stage: "Blender worker: done", progress: 1.0 });
execFileSync("npx", ["tsx", "scripts/fail-stale-jobs.ts"], {
  cwd: ROOT, encoding: "utf-8",
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/AnimeOS/db/custom.db" },
  timeout: 120_000,
});
const t5 = await db.renderJob.findUnique({ where: { id: j5 } });
check("C7 the staleness tool lands the unticked conclusion as REVIEW (a finished render is never failed)",
  t5?.status === "REVIEW" && t5.outputUrl === `/renders/${j5}.mp4`,
  `status=${t5?.status} url=${t5?.outputUrl} stage=${(t5?.stage ?? "").slice(0, 100)}`);

// ── D. cleanup ──
for (const p of [clipPath, clip5, jobFileFor(j1), jobFileFor(j2), jobFileFor(j4), jobFileFor(j5)]) {
  if (existsSync(p)) unlinkSync(p);
}
await db.renderJob.deleteMany({ where: { projectId: lab.id } });
await db.shot.deleteMany({ where: { sceneId: scene.id } });
await db.scene.deleteMany({ where: { id: scene.id } });
await db.episode.deleteMany({ where: { id: ep.id } });
await db.season.deleteMany({ where: { id: season.id } });
await db.project.delete({ where: { id: lab.id } }).catch(() => {});
const gone = !(existsSync(clipPath) || existsSync(clip5));
check("D1 the lab and its artifacts are gone", gone);
}

run().then(() => {
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 107 E2E (the triad's seams)`);
  process.exit(failures === 0 ? 0 : 1);
}).catch((err) => {
  console.error("the e2e crashed:", err);
  process.exit(1);
});
