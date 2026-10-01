// Iteration 106 E2E: THE FIGURE IS CRAFTED, NOT ASSEMBLED (the gate's
// remaining work order) + the two queued seams (THE NAME IS A WHOLE
// WORD; THE STATUS NAMES THE PROCESSES).
// Proves, against the RUNNING studio, the REAL bridge and REAL renders:
//   A. pure: the cast word-boundary law ('coiling' never reads as
//      "lin" again; possessives, hyphens, case, unicode and the max-3
//      law pinned); detectCast and BOTH mirrors riding the same law
//      module; the craft law's key/hash/version and the asset stamp
//      moving 95 -> 106
//   B1. real: the trap shot ("...coiling with qi") renders a payload
//      with NO cast (pre-fix the trap fired); the named-cast shot
//      renders for REAL and the worker names the craft evidence
//      (version 106, the softened parts, the hash matching the TS
//      mirror bit-exactly - one law, two runtimes over the wire)
//   B2. real: the pool's /status names the PROCESSES (a killed idle
//      worker reads dead immediately; a killed mid-render worker
//      never counts busy through its fallback window - and the
//      fallback honestly holds the cold lane); the job still lands;
//      exact lab cleanup
// Run: PHASE=a|b1|b2|b|all npx tsx scripts/e2e-iter106-craftcast.ts

// the fast stale law so the killed-worker scenario resolves in
// seconds, not minutes (inherited by the resident spawn)
process.env.ANIMEOS_WARM_STALE_S = process.env.ANIMEOS_WARM_STALE_S ?? "30";

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { detectCast } from "../src/lib/ai/art";
import { castNameToken, tokenizeDescription, filterCastByDescription } from "../src/lib/cast-token";
import { CRAFT_LAW_VERSION, CRAFT_BEVELS, CRAFT_CYL_SEGMENTS, craftKey, craftHash } from "../src/lib/blender/craft";
import { CHARACTER_ASSET_LAW_VERSION, characterAssetKey } from "../src/lib/blender/character-asset";
import { createHash } from "node:crypto";
import { readFileSync, readFileSync as rf, existsSync, unlinkSync } from "node:fs";
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter106-craftcast";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();
const RESIDENT_STATUS = "http://127.0.0.1:8101/status";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

interface PoolStatus { size: number; alive: number; free: number; busy: number; booting?: number; served: number }
async function residentStatus(): Promise<{ ok: boolean; busy: boolean; pool?: PoolStatus; scene?: string } | null> {
  try {
    const res = await fetch(RESIDENT_STATUS, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; busy: boolean; pool?: PoolStatus; scene?: string };
  } catch {
    return null;
  }
}

async function waitPoolFree(minFree: number, timeoutS: number): Promise<PoolStatus | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutS * 1000) {
    const st = await residentStatus();
    if (st?.pool && st.pool.free >= minFree) return st.pool;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

function jobFilePath(jobId: string): string {
  return path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
}
function readJobFile(jobId: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(jobFilePath(jobId), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The pool workers' pids, from the ready files (pid is the content). */
function poolWorkerPids(): Array<{ port: number; pid: number }> {
  const out: Array<{ port: number; pid: number }> = [];
  const dir = path.join(process.cwd(), "public", "renders");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const m = f.match(/^\.pool-(\d+)\.ready$/);
    if (!m) continue;
    try {
      const pid = parseInt(fs.readFileSync(path.join(dir, f), "utf8").trim(), 10);
      if (Number.isFinite(pid) && pid > 0) out.push({ port: parseInt(m[1], 10), pid });
    } catch { /* best effort */ }
  }
  return out;
}

async function cleanupLab(labId: string): Promise<void> {
  for (const r of await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } })) {
    try { fs.unlinkSync(jobFilePath(r.id)); } catch { /* best effort */ }
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderJob.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.renderReview.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.characterAsset.deleteMany({ where: { projectId: labId } }).catch(() => {});
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  try {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
      body: JSON.stringify({ email, name, password }),
    });
    const body = (await res.json()) as { user?: { id: string; role: string } };
    if (res.ok) return { id: body.user?.id ?? "", role: body.user?.role ?? "" };
  } catch { /* the dev server need not be up - the db fallback stands */ }
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
}

async function realRender(labId: string, shotId: string): Promise<{ ok: boolean; jobId: string | null; status: string }> {
  const job = await createRenderJob(labId, shotId, "PREVIEW");
  if (!job) return { ok: false, jobId: null, status: "no-job" };
  let ticked = await tickRenderJob(job.id);
  for (let i = 0; i < 1200 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

const CAST_ROWS = [
  { id: "c1", name: "Lin Yue" },
  { id: "c2", name: "Demon Lord Wei" },
  { id: "c3", name: "Lin Yue - Clone 001" },
  { id: "c4", name: "Bai Qi" },
  { id: "c5", name: "Elder Han" },
];

async function T(projectId: string, name: string, args: Record<string, unknown>, user: { id: string; name: string; role: string }) {
  return executeTool(projectId, name, args, user);
}

async function run() {
  console.log(`== Iteration 106: the figure is crafted (phase: ${PHASE}) ==\n`);

  if (PHASE === "a" || PHASE === "all") {

  // ── A. THE NAME IS A WHOLE WORD (the queued seam) ──
  check("A1 the tokenizer keeps 'coiling' whole (the render night's trap)",
    JSON.stringify(tokenizeDescription("the blade's edge, coiling with qi")) === JSON.stringify(["the", "blade", "s", "edge", "coiling", "with", "qi"]),
    JSON.stringify(tokenizeDescription("the blade's edge, coiling with qi")));
  check("A2 'coiling' never detects Lin Yue (the law the night named)",
    filterCastByDescription(CAST_ROWS, "the blade's edge, coiling with qi").length === 0,
    JSON.stringify(filterCastByDescription(CAST_ROWS, "the blade's edge, coiling with qi").map((c) => c.name)));
  check("A3 the first-token law preserved: naming Lin fires her (and her clone shares the token)",
    JSON.stringify(filterCastByDescription(CAST_ROWS, "Lin Yue draws her sword").map((c) => c.id)) === JSON.stringify(["c1", "c3"]),
    JSON.stringify(filterCastByDescription(CAST_ROWS, "Lin Yue draws her sword").map((c) => c.name)));
  check("A4 case-insensitive and possessive: 'LIN YUE rises', \"Lin's blade\" both fire",
    filterCastByDescription(CAST_ROWS, "LIN YUE rises against the storm").length >= 1
    && filterCastByDescription(CAST_ROWS, "Lin's blade glints in the dark").length >= 1);
  check("A5 hyphenated spelling splits at the boundary: 'lin-feng' mentions the lin token",
    filterCastByDescription(CAST_ROWS, "lin-feng walks the ridge").length >= 1);
  check("A6 a longer word that merely CONTAINS the token never fires ('malignin', 'online')",
    filterCastByDescription(CAST_ROWS, "the malignin herb glows online").length === 0,
    JSON.stringify(filterCastByDescription(CAST_ROWS, "the malignin herb glows online").map((c) => c.name)));
  check("A7 the first-token semantics pinned: 'Demon Lord Wei' matches 'demon', never bare 'wei'",
    filterCastByDescription(CAST_ROWS, "the Demon Lord Wei smirks").map((c) => c.id).includes("c2")
    && filterCastByDescription(CAST_ROWS, "wei stands alone").length === 0);
  check("A8 the max-3 law holds (matching names land three, roster order preserved)",
    JSON.stringify(filterCastByDescription(CAST_ROWS, "lin and bai and elder han and clone", 3).map((c) => c.id))
    === JSON.stringify(["c1", "c3", "c4"]),
    JSON.stringify(filterCastByDescription(CAST_ROWS, "lin and bai and elder han and clone", 3).map((c) => c.id)));
  check("A9 an empty token (a punctuation name) honestly never matches - the old includes('') matched EVERYTHING",
    filterCastByDescription([{ id: "x", name: "——" }] as Array<{ id: string; name: string }>, "anything at all").length === 0);
  check("A10 the unicode law: CJK names tokenize and match (the old includes kept it; the law keeps it)",
    filterCastByDescription([{ id: "u1", name: "林悦" }] as Array<{ id: string; name: string }>, "林悦拔剑而立").length === 1);

  const castTyped = CAST_ROWS as unknown as Parameters<typeof detectCast>[0];
  check("A11 detectCast rides the word-boundary law (the art prompts' door)",
    detectCast(castTyped, "the qi coils, coiling around the blade").length === 0
    && detectCast(castTyped, "Lin Yue steps into the light").length >= 1);

  check("A12 the shots route and the panel dialog ride the SAME law module (zero copies)",
    readFileSync("src/app/api/shots/route.ts", "utf8").includes('from "@/lib/cast-token"')
    && readFileSync("src/components/views/panel-inspector-dialog.tsx", "utf8").includes('from "@/lib/cast-token"')
    && readFileSync("src/lib/ai/art.ts", "utf8").includes('from "@/lib/cast-token"'));

  // ── A. THE FIGURE IS CRAFTED, NOT ASSEMBLED (the craft law) ──
  check("A13 the craft law stands at version 106 with the 9 organic families and the 24-segment curve lift",
    CRAFT_LAW_VERSION === 106
    && JSON.stringify(Object.keys(CRAFT_BEVELS).sort()) === JSON.stringify(["blade", "brow", "finger", "guard", "mouth", "palm", "sashTail", "skirt", "thumb"])
    && CRAFT_CYL_SEGMENTS === 24);
  const key = craftKey();
  check("A14 the canonical craft key is versioned, sorted and complete",
    key.startsWith("106|bevel:") && key.endsWith("|v1") && key.includes("seg:2") && key.includes("cyl:24")
    && key.indexOf("blade=") < key.indexOf("thumb="), key);
  const hash = craftHash();
  const indep = createHash("sha256").update(key).digest("hex").slice(0, 16);
  check("A15 the craft hash is sha256-16 over the key (deterministic across calls)",
    hash === indep && hash.length === 16 && craftHash() === hash, `${hash} vs ${indep}`);
  check("A16 the character asset stamp moved 95 -> 106 (a craft change is an asset change)",
    CHARACTER_ASSET_LAW_VERSION === 106 && characterAssetKey({ name: "Lin Yue" }).startsWith("106|"),
    characterAssetKey({ name: "Lin Yue" }).slice(0, 40));
  check("A17 the bridge mirrors the craft law (constants + the hash formula live in the worker)",
    readFileSync("bridges/blender/animeos_bridge.py", "utf8").includes("CRAFT_LAW_VERSION = 106")
    && readFileSync("bridges/blender/animeos_bridge.py", "utf8").includes("def craft_soften")
    && readFileSync("bridges/blender/animeos_bridge.py", "utf8").includes('f"{CRAFT_LAW_VERSION}|bevel:{parts}|seg:{CRAFT_BEVEL_SEGMENTS}|cyl:{CRAFT_CYL_SEGMENTS}|v1"'));
  check("A18 the asset key mirror moved with the worker (one law, two runtimes)",
    readFileSync("bridges/blender/animeos_bridge.py", "utf8").includes('        "106",')
    && readFileSync("src/lib/blender/character-asset.ts", "utf8").includes('"106",'));

  // ── A. THE STATUS NAMES THE PROCESSES (the pool seam) ──
  const src = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A19 the truth-reap law stands (the flag is memory, the process is truth)",
    src.includes("def _reap_locked") && src.includes("THE FLAG IS MEMORY, THE PROCESS IS TRUTH"));
  check("A20 /status reaps before counting and busy counts only the living",
    src.includes("self._reap_locked()\n            warm_total")
    && src.includes('if w["busy"] and not w["dead"]'));
  check("A21 the cold fallback rides the cold lane counter (submit guards on it)",
    (src.match(/self\.cold_workers \+= 1/g) ?? []).length === 2
    && (src.match(/self\.cold_workers -= 1/g) ?? []).length === 2
    && src.includes("THE FALLBACK RIDES THE COLD LANE"));
  check("A22 the old generation's cleanup never clears the new generation's busy flag",
    src.includes("same_slot = self.pool.get(port)") && src.includes("if w is not None and w is same_slot:"));
  }

  if (["b1", "b", "all"].includes(PHASE)) {

  // ── B1. the REAL studio: the trap refused, the crafted clip real ──
  const hostFile = path.join(process.cwd(), ".blender-runtime", "host.json");
  if (existsSync(hostFile)) {
    try {
      const host = JSON.parse(rf(hostFile, "utf8")) as { pid?: number };
      if (host.pid) execSync(`kill ${host.pid} 2>/dev/null || true`, { stdio: "ignore" });
    } catch { /* best effort */ }
    unlinkSync(hostFile);
  }
  try { execSync("pkill -f 'pw-port' 2>/dev/null || true", { stdio: "ignore" }); } catch { /* best effort */ }
  await new Promise((r) => setTimeout(r, 2000));

  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: ownerLogin.role };
  const created = await executeTool("throwaway", "create_project", { title: `Iter106 CraftCast Lab ${MARK}`, logline: "the crafted figure proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B1 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("lab missing");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  await T("create_episode", { title: "The Craft Arc", number: 1 });
  const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
  const scene = await db.scene.create({ data: { episodeId: epRow!.id, number: 1, title: "The Crafted Cut" } });
  const linChar = await db.character.create({
    data: {
      projectId: labId, name: "Lin Yue",
      appearance: "lean swordswoman, sage-green robe, black topknot",
      modelSheetPrompt: "lean swordswoman in sage-green robe, black topknot, ornate sword",
    },
  });
  const trapShot = await db.shot.create({
    data: {
      sceneId: scene.id, number: 1,
      description: "The blade's edge, coiling with qi above the terrace stones",
      shotType: "CLOSEUP", duration: 1.0, movement: "STATIC",
    },
  });
  const namedShot = await db.shot.create({
    data: {
      sceneId: scene.id, number: 2,
      description: "Lin Yue draws her sword, the sage-green robe flowing under the moon",
      shotType: "CLOSEUP", duration: 1.0, movement: "STATIC",
    },
  });
  check("B2 the lab stands (the cast member, the trap shot, the named shot)", !!linChar && !!trapShot && !!namedShot);

  // the named-cast shot renders FOR REAL through the resident + pool
  // (this first render also BOOTS the resident this half retired)
  const r1 = await realRender(labId, namedShot.id);
  check("B3 the named-cast render completed over the resident (a real clip)",
    r1.ok, r1.status.slice(0, 160));
  const craftState = r1.jobId ? (readJobFile(r1.jobId) as { rig?: { craft?: Record<string, unknown>; grip?: Record<string, unknown> } } | null) : null;
  const craft = craftState?.rig?.craft;
  check("B4 the worker names the craft evidence (version 106, the softened count)",
    !!craft && craft.version === 106 && typeof craft.softened === "number" && (craft.softened as number) >= 24,
    JSON.stringify(craft ?? craftState?.rig ?? {}).slice(0, 220));
  check("B5 THE TWO-RUNTIME PROOF: the worker's craft hash matches the TS mirror bit-exactly",
    !!craft && craft.hash === craftHash(), `${String(craft?.hash)} vs ${craftHash()}`);
  check("B6 the crafted figure keeps the rig contract (the grip contact rides beside)",
    !!craftState?.rig?.grip && (craftState.rig.grip as { contact?: boolean }).contact === true,
    JSON.stringify(craftState?.rig?.grip ?? {}).slice(0, 160));

  // ── THE STATUS NAMES THE PROCESSES (the pool seam, for real) ──
  const pool = await waitPoolFree(1, 240);
  check("B7 the pool stood up (size 2, at least one free warm slot)",
    !!pool && pool.size === 2 && pool.free >= 1, JSON.stringify(pool));

  // the TRAP: the description carries 'coiling' - pre-fix the substring
  // law cast Lin Yue (and her clone) in a shot that never named her.
  // The trap job is created AFTER the boot render (the resident is up,
  // the payload lands on disk honestly) and never ticked to a full
  // render - the payload's cast is the assert.
  const trapJob = await createRenderJob(labId, trapShot.id, "PREVIEW");
  let trapPayload: { shot?: { cast?: unknown[] } } | null = null;
  if (trapJob) {
    for (let i = 0; i < 20 && !trapPayload; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const jf = readJobFile(trapJob.id) as { payload?: { shot?: { cast?: unknown[] } } } | null;
      if (jf?.payload?.shot) trapPayload = jf.payload;
    }
  }
  const trapCast = (trapPayload as { shot?: { cast?: unknown[] } } | null)?.shot?.cast;
  check("B8 THE TRAP REFUSED: 'coiling' renders a payload with NO cast members (the payload law drops the empty key)",
    !!trapPayload && (!Array.isArray(trapCast) || trapCast.length === 0), JSON.stringify(trapCast ?? null));
  if (trapJob) {
    try { fs.unlinkSync(jobFilePath(trapJob.id)); } catch { /* best effort */ }
    await db.renderJob.deleteMany({ where: { id: trapJob.id } });
  }

  // ── C1. cleanup (the b1 half ends here) ──
  await cleanupLab(labId);
  const leftovers1 = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("C1 the lab is gone exactly", leftovers1.length === 0);
  }

  if (["b2a", "b2", "b", "all"].includes(PHASE)) {

  // ── B2a. THE STATUS NAMES THE PROCESSES (boot + the idle kill) ──
  // a self-contained lab (the b1 half cleaned its own)
  const hostFile = path.join(process.cwd(), ".blender-runtime", "host.json");
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin2 = await register("director@studio.dev", "Lin Director", "anchored2026");
  const ownerUser2 = { id: ownerLogin2.id, name: "Lin Director", role: ownerLogin2.role };
  const created2 = await executeTool("throwaway", "create_project", { title: `Iter106 CraftCast Lab ${MARK}`, logline: "the status truth proof", visualStyle: "DONGHUA" }, ownerUser2);
  check("B2b the second lab exists", created2.status === "OK", created2.result.slice(0, 120));
  const lab2 = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab2) throw new Error("lab2 missing");
  const labId = lab2.id;
  await T(labId, "create_episode", { title: "The Craft Arc", number: 1 }, ownerUser2);
  const epRow2 = await db.episode.findFirst({ where: { season: { projectId: labId } } });
  const scene2 = await db.scene.create({ data: { episodeId: epRow2!.id, number: 1, title: "The Status Cut" } });
  await db.character.create({
    data: {
      projectId: labId, name: "Lin Yue",
      appearance: "lean swordswoman, sage-green robe, black topknot",
      modelSheetPrompt: "lean swordswoman in sage-green robe, black topknot, ornate sword",
    },
  });
  const carnageShot = await db.shot.create({
    data: {
      sceneId: scene2.id, number: 1,
      description: "Lin Yue draws her sword under the moon",
      shotType: "CLOSEUP", duration: 1.0, movement: "STATIC",
    },
  });
  check("B2c the carnage lab stands", !!carnageShot);
  // a first real render boots the resident + pool - SKIPPED when a
  // previous run left a FULLY ALIVE pool standing; a wounded or
  // half-dead pool (an attempt that timed out mid-carnage) is retired
  // and booted fresh - the carnage needs two living workers to kill
  let pool0 = await waitPoolFree(1, 5);
  if (!pool0 || pool0.alive < pool0.size) {
    if (existsSync(hostFile)) {
      try {
        const host = JSON.parse(rf(hostFile, "utf8")) as { pid?: number };
        if (host.pid) execSync(`kill ${host.pid} 2>/dev/null || true`, { stdio: "ignore" });
      } catch { /* best effort */ }
      unlinkSync(hostFile);
    }
    try { execSync("pkill -f 'pw-port' 2>/dev/null || true", { stdio: "ignore" }); } catch { /* best effort */ }
    try { execSync("pkill -f 'animeos_bridge.py.*--worker' 2>/dev/null || true", { stdio: "ignore" }); } catch { /* best effort */ }
    await new Promise((r) => setTimeout(r, 2000));
    const rBoot = await realRender(labId, carnageShot.id);
    check("B2d the boot render completed", rBoot.ok, rBoot.status.slice(0, 120));
    pool0 = await waitPoolFree(1, 240);
  } else {
    console.log("   (a healthy pool is already standing - the boot render is skipped)");
  }

  const pids = poolWorkerPids();
  if (pids.length >= 1 && pool0 && pool0.size >= 1) {
    // kill ONE IDLE warm worker: the honest /status reads it dead on
    // the NEXT read - pre-fix, the stale alive-flag read it alive
    // until somebody submitted
    const victim = pids[0];
    try { execSync(`kill -9 ${victim.pid} 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* best effort */ }
    await new Promise((r) => setTimeout(r, 300));
    const afterKill = await residentStatus();
    check("B9 the killed IDLE worker reads dead IMMEDIATELY in /status (reap-on-read; alive < size)",
      !!afterKill?.pool && afterKill.pool.alive === afterKill.pool.size - 1,
      JSON.stringify(afterKill?.pool));
    check("B10 the dead slot never counts busy or free",
      !!afterKill?.pool && afterKill.pool.busy === 0 && afterKill.pool.free <= afterKill.pool.size - 1,
      JSON.stringify(afterKill?.pool));
    // the pool heals: the surviving slot still offers a free warm
    // seat (the killed slot's respawn rides the next submit)
    const healed = await waitPoolFree(1, 60);
    check("B11 the pool heals (a free warm slot again - the survivor serves)",
      !!healed, JSON.stringify(healed));
  } else {
    check("B9-B11 skipped: no pool worker pids to kill (the pool never stood up)", false, JSON.stringify(pids));
  }

  // ── C2a. cleanup (the b2a half ends here) ──
  await cleanupLab(labId);
  const leftovers2 = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("C2a the lab is gone exactly", leftovers2.length === 0);
  }

  if (["b2b", "b2", "b", "all"].includes(PHASE)) {

  // ── B2b. THE CARNAGE (the mid-render kill + the honest fallback) ──
  // a fresh lab; the resident + pool stand from b2a (or boot here)
  const hostFile2 = path.join(process.cwd(), ".blender-runtime", "host.json");
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin3 = await register("director@studio.dev", "Lin Director", "anchored2026");
  const ownerUser3 = { id: ownerLogin3.id, name: "Lin Director", role: ownerLogin3.role };
  const created3 = await executeTool("throwaway", "create_project", { title: `Iter106 CraftCast Lab ${MARK}`, logline: "the carnage proof", visualStyle: "DONGHUA" }, ownerUser3);
  check("B2e the third lab exists", created3.status === "OK", created3.result.slice(0, 120));
  const lab3 = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab3) throw new Error("lab3 missing");
  const labId3 = lab3.id;
  await T(labId3, "create_episode", { title: "The Craft Arc", number: 1 }, ownerUser3);
  const epRow3 = await db.episode.findFirst({ where: { season: { projectId: labId3 } } });
  const scene3 = await db.scene.create({ data: { episodeId: epRow3!.id, number: 1, title: "The Carnage Cut" } });
  await db.character.create({
    data: {
      projectId: labId3, name: "Lin Yue",
      appearance: "lean swordswoman, sage-green robe, black topknot",
      modelSheetPrompt: "lean swordswoman in sage-green robe, black topknot, ornate sword",
    },
  });
  const carnageShot3 = await db.shot.create({
    data: {
      sceneId: scene3.id, number: 1,
      description: "Lin Yue draws her sword under the moon",
      shotType: "CLOSEUP", duration: 1.0, movement: "STATIC",
    },
  });
  check("B2f the carnage shot stands", !!carnageShot3);
  let poolPre = await residentStatus();
  if (!poolPre?.pool || poolPre.pool.alive < 1) {
    const rBoot2 = await realRender(labId3, carnageShot3.id);
    check("B2g the boot render completed", rBoot2.ok, rBoot2.status.slice(0, 120));
    poolPre = await residentStatus();
  } else {
    console.log("   (the pool still stands from b2a - the boot render is skipped)");
  }
  check("B2h a warm worker is alive to take the carnage render", !!poolPre?.pool && poolPre.pool.alive >= 1, JSON.stringify(poolPre?.pool));

  // kill the warm workers MID-RENDER: the dead slots never count
  // busy through the fallback window, and the fallback honestly holds
  // the cold lane (server busy reads TRUE - pre-fix it read false
  // while a full cold render was already running)
  const r2 = await realRenderStart(labId3, carnageShot3.id);
  if (r2.jobId) {
    let killed = false;
    for (let i = 0; i < 240 && !killed; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await residentStatus();
      if (st?.pool && st.pool.busy >= 1) {
        for (const w of poolWorkerPids()) {
          try { execSync(`kill -9 ${w.pid} 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* best effort */ }
        }
        killed = true;
      }
    }
    check("B12 a warm worker went busy and was killed mid-render", killed);
    // wait into the fallback window: the stale law (30s) fires, the
    // cold fallback takes the job, the lane counter turns on
    let sawHonest = false;
    for (let i = 0; i < 90 && !sawHonest; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await residentStatus();
      // the honest read: dead slots never count busy, and the cold
      // lane reads occupied while the fallback re-renders
      if (st?.pool && st.pool.busy === 0 && st.busy === true) sawHonest = true;
    }
    check("B13 THE DRIFT NAMED AND CLOSED: during the fallback the dead slots never count busy AND the server reads honestly busy",
      sawHonest, JSON.stringify((await residentStatus())?.pool));
    // the job still completes - the cold fallback finishes the SAME job
    let done = false;
    let ticked = await tickRenderJob(r2.jobId);
    for (let i = 0; i < 1200 && ticked && ticked.status === "RENDERING"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      ticked = await tickRenderJob(r2.jobId);
    }
    done = !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl;
    check("B14 the killed worker's job still completed (the fallback never loses a job - iteration 105 rides)",
      done, `${ticked?.status} ${ticked?.stage ?? ""}`.slice(0, 160));
    const stAfter = await residentStatus();
    check("B15 the counters recovered after the carnage (busy 0 - nothing lies busy)",
      !!stAfter?.pool && stAfter.pool.busy === 0, JSON.stringify(stAfter?.pool));
    // THE STUDIO NEVER STAYS WOUNDED: the respawn law rides the next
    // submit - a probe job's submit respawns the dead slots, and the
    // pool stands again (the probe is never ticked to a full render)
    const probe = await createRenderJob(labId3, carnageShot3.id, "PREVIEW");
    let probePayload = false;
    if (probe) {
      await tickRenderJob(probe.id).catch(() => {});
      for (let i = 0; i < 100 && !probePayload; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const st = await residentStatus();
        if (st?.pool && st.pool.alive >= 1 && st.pool.free >= 1) probePayload = true;
      }
      try { fs.unlinkSync(jobFilePath(probe.id)); } catch { /* best effort */ }
      await db.renderJob.deleteMany({ where: { id: probe.id } });
    }
    check("B16 the next submit respawned the pool (a free warm slot stands again)",
      probePayload, JSON.stringify((await residentStatus())?.pool));
  } else {
    check("B12-B15 skipped: the second render never started", false, r2.status);
  }

  // ── C2b. cleanup ──
  await cleanupLab(labId3);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("C2b the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 106 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);

  async function realRenderStart(projectId: string, shotId: string): Promise<{ ok: boolean; jobId: string | null; status: string }> {
    const job = await createRenderJob(projectId, shotId, "PREVIEW");
    if (!job) return { ok: false, jobId: null, status: "no-job" };
    const ticked = await tickRenderJob(job.id);
    return { ok: !!ticked, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
  }
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});
