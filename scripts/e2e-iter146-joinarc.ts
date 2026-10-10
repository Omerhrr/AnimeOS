// ─────────────────────────────────────────────────────────────
// E2E ITERATION 146 - THE REPAIR JOINS THE ARC.
//
// The 146 probe measured the gap on the ledger's own receipts: the
// 145 refusal named identity_repair_pass as the repair, and the pass
// as built answered a DIFFERENT instrument - it read the sweep
// (castIdentityMeasurement), re-scored into the sweep, and the gate
// stopped reading the sweep the moment the arc existed. A repair that
// lifted its shots to 0.90 reported REPAIRED into a ledger the
// refusing instrument never reads; the arc median never moved.
//
// THE FIX: from 146 the repair's re-scores APPEND to the identity arc
// (real production readings of the work - the shot's whole cast
// verdict, cohort-tagged from the bridges' own law versions,
// night-tagged `repair-<date>` with the same idempotent fold every
// writer obeys, ref-chained to the work by the append itself), and
// the pass reads its after-standing the way the gate does -
// episodeReleaseVerdict off the same receipt path - so the repair's
// ledger and the release verdict answer ONE instrument.
//
// This gate proves the join end to end, on the e2e's own throwaway
// production + lab receipt (the production ledger never hears of it):
//   A1 the source law (the append in the repair lib, the version 146,
//      the gate read in the result, the tool case naming the arc)
//   B1 the REAL loop runs (real sheet, real planted below standing,
//      real re-render over the engine, real re-score)
//   B2 the lab arc DB rows carry the repair night (cohort-tagged)
//   B3 the lab receipt carries the line, ref-chained to the WORK
//   B4 the gate reads the repair night off the lab receipt
//      (arc=true, the readings the repair's own re-score earned)
//   B5 the pass's arcAfter answers the gate's OWN instrument (the
//      same read the release spine runs, same numbers)
//   B6 the idempotent fold (a second append under the same
//      (shot, source, night) replaces - one line, one row)
//   B7 the anti-fabrication law (the production receipt's bytes are
//      untouched through the whole run) + the no-residue law
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter146-joinarc.ts
// (needs the dev server + Blender + the vision channel: the loop is
// REAL - a real sheet generation, a real render, a real re-score)
// ─────────────────────────────────────────────────────────────

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import { runIdentityRepairPass, shotRepairVerdict, renderAndWait } from "../src/lib/identity-repair";
import { appendIdentityArcReading, bridgeLawCohort, IDENTITY_ARC_LAW_VERSION } from "../src/lib/identity-arc";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { readFileSync, existsSync, unlinkSync, mkdirSync, rmSync as fsRmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter146-joinarc";
const LAB_ARC = "receipts/.e2e146-lab.jsonl"; // gitignored - the lab never commits
const LAB_NIGHT = "e2e146-repair-a";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

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
  get header() {
    return [...this.m.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function call(jar: Jar, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${url}`, { ...init, headers: { ...(init?.headers ?? {}), cookie: jar.header } });
  jar.absorb(res);
  return res;
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`register ${email}: ${res.status}`);
  const jar = new Jar();
  const csrfRes = await call(jar, "/api/auth/csrf"); // the csrf cookie lands in the jar (the double-submit pair)
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const callback = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual", // the session cookie rides the 302 - following it loses the set-cookie
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": `e2e-${MARK}`, cookie: jar.header },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
  });
  jar.absorb(callback);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${callback.status}, probe ${probe.status}`);
  const me = (await (await call(jar, "/api/auth/session")).json()) as { user?: { id?: string; role?: string } };
  return { id: me.user?.id ?? "", role: me.user?.role ?? "" };
}

async function cleanupLab(labId: string): Promise<void> {
  const labJobs = await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  for (const r of labJobs) {
    if (r.outputUrl) {
      const p = path.join(process.cwd(), "public", r.outputUrl);
      if (existsSync(p)) unlinkSync(p);
    }
    const st = path.join(process.cwd(), "public", "renders", `.job-${r.id}.json`);
    if (existsSync(st)) unlinkSync(st);
    const poster = path.join(process.cwd(), "public", "renders", "posters", `${r.id}.jpg`);
    if (existsSync(poster)) unlinkSync(poster);
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderReview.deleteMany({ where: { projectId: labId } });
  await db.identityArcReading.deleteMany({ where: { projectId: labId } });
  await db.identityScore.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  const labChars = await db.character.findMany({ where: { projectId: labId } });
  for (const c of labChars) {
    const sheetPath = path.join(process.cwd(), "public", "sheets", `${c.id}.png`);
    if (existsSync(sheetPath)) unlinkSync(sheetPath);
    const dnaPath = path.join(process.cwd(), "public", "sheets", `${c.id}-dna.json`);
    if (existsSync(dnaPath)) unlinkSync(dnaPath);
  }
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function realRender(labId: string, shotId: string): Promise<{ ok: boolean; status: string }> {
  // THE TICK-BUDGET LAW (iteration 147): the gate rides the SAME
  // progress-aware wait the repair rides - the old fixed 210s loop
  // died on advancing renders the moment the box was loaded (the
  // exact finding the 146 night named), and a gate that abandons an
  // alive render starves everything downstream of a clip.
  return renderAndWait(labId, shotId);
}

async function main() {
  console.log("== Iteration 146: THE REPAIR JOINS THE ARC ==\n");

  // ───────────────────── A. the source law ─────────────────────
  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  const arcSrc = readFileSync("src/lib/identity-arc.ts", "utf8");
  const toolsSrc = readFileSync("src/lib/dsh/tools.ts", "utf8");

  check("A1a the repair lib carries the arc append (the join's source truth)",
    repairSrc.includes("appendIdentityArcReading(") && repairSrc.includes('from "@/lib/identity-arc"'));
  check("A1b the arc lib carries the join version (146)", arcSrc.includes(`export const IDENTITY_ARC_LAW_VERSION = ${IDENTITY_ARC_LAW_VERSION}`) && IDENTITY_ARC_LAW_VERSION === 146);
  check("A1c the repair night defaults to the calendar-day repair tag (the idempotent fold key)",
    repairSrc.includes("repair-${new Date().toISOString().slice(0, 10)}"));
  check("A1d the cohort rides the bridges' own law versions (the same cohort law the night obeys)",
    repairSrc.includes("bridgeLawCohort()"));
  check("A1e the after-standing reads the gate's own instrument (episodeReleaseVerdict in the repair lib)",
    repairSrc.includes("episodeReleaseVerdict(") && repairSrc.includes("arcAfter"));
  check("A1f the receipt path routes through (the lab scopes never touch the production ledger)",
    repairSrc.includes("receiptPath"));
  check("A1g the tool case names the arc night and the arc standing",
    toolsSrc.includes("arc night ${res.night}") && toolsSrc.includes("arc standing:"));

  // ───────────────────── B. the REAL loop, the lab receipt ─────────────────────
  // the production truth baselines (the anti-fabrication law)
  const prodReceiptBefore = (() => {
    try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
  })();
  const prodArcBefore = await db.identityArcReading.count();
  const prodScoresBefore = await db.identityScore.count();

  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }

  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B0a the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter146 JoinArc Lab ${MARK}`, logline: "a throwaway production for the repair-joins-arc proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B0b the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  try {
    const ep = await T("create_episode", { title: "The Join Arc", count: 1 });
    check("B0c the episode exists", ep.status === "OK", ep.result.slice(0, 120));
    let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
    if (!scene) {
      const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
      if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
      scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Gate" } });
    }
    const shot = await db.shot.create({
      data: { sceneId: scene.id, number: 2, description: "Lin Yue steps through the broken gate, robes whipping in the wind", duration: 2.5, movement: "STATIC" },
    });
    const hero = await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });

    const realSheet = await T("generate_model_sheet", { characterName: "Lin Yue" });
    check("B0d the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

    const r1 = await realRender(labId, shot.id);
    check("B0e the hero's clip finished over the real engine", r1.ok, r1.status.slice(0, 140));

    // the planted below standing (the work order)
    const raw35 = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Lin Yue", similarity: 0.35, aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shot.id, raw35, "RENDER");
    check("B0f the planted below reading lands on the real row", planted.ok, "error" in planted ? planted.error : "");
    const standingBefore = await castIdentityMeasurement(labId, "RENDER");
    check("B0g the standing names Lin Yue BELOW at the planted 0.35",
      standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Lin Yue")?.worstRef === "E1 Sc1 S002",
      JSON.stringify({ below: standingBefore.below }));

    // THE LOOP (reanchor off for this proof: bounded, no sheet regen;
    // the lab receipt path - the production ledger never hears of it)
    const pass = await runIdentityRepairPass(labId, {
      members: 1,
      shotsPerMember: 1,
      reanchor: false,
      night: LAB_NIGHT,
      receiptPath: LAB_ARC,
    });
    check("B1 the REAL loop ran the work order end to end", pass.members.length === 1 && pass.members[0].shots.length === 1, JSON.stringify(pass.members.map((m) => m.verdict)));
    const workedShot = pass.members[0]?.shots[0];
    if (workedShot) console.log(`   repair ledger (real): E1 Sc1 S002 ${(workedShot.before * 100).toFixed(0)}% -> ${workedShot.after === null ? "unscored" : (workedShot.after * 100).toFixed(0) + "%"} - ${workedShot.verdict}`);
    check("B1b the loop's verdict law stays honest", workedShot ? ["REPAIRED", "IMPROVED", "UNCHANGED", "WORSE"].includes(workedShot.verdict) : false, JSON.stringify(workedShot));

    // B2: the lab arc DB rows carry the repair night
    const arcRows = await db.identityArcReading.findMany({ where: { projectId: labId, night: LAB_NIGHT } });
    check("B2a the repair's re-score appended to the arc DB (one row, the repair night)", arcRows.length === 1, `rows=${arcRows.length}`);
    check("B2b the arc row carries the whole cast verdict and the worst",
      arcRows.length === 1 && arcRows[0].shotId === shot.id && Array.isArray(JSON.parse(arcRows[0].scores)) && JSON.parse(arcRows[0].scores).length >= 1
      && typeof arcRows[0].worst === "number", `worst=${arcRows[0]?.worst}`);
    check("B2c the arc row is cohort-tagged from the bridges' own law versions", arcRows.length === 1 && arcRows[0].cohort === bridgeLawCohort(), `cohort=${arcRows[0]?.cohort}`);

    // B3: the lab receipt carries the line, ref-chained to the WORK
    const labLines = (() => {
      try { return readFileSync(LAB_ARC, "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; }
    })();
    check("B3a the lab receipt carries the repair line (one line on disk)", labLines.length === 1, `lines=${labLines.length}`);
    check("B3b the line is addressed by the WORK (ref 1/1/2), not the surrogate",
      labLines.length === 1 && labLines[0].ref?.episode === 1 && labLines[0].ref?.scene === 1 && labLines[0].ref?.shot === 2 && labLines[0].night === LAB_NIGHT,
      JSON.stringify(labLines[0]?.ref));

    // B4: the gate reads the repair night off the lab receipt
    const labEpisode = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!labEpisode) throw new Error("lab episode missing");
    const gate = await episodeReleaseVerdict(labId, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
    check("B4a the gate reads the arc off the lab receipt (arc=true)", gate.arc === true, `arc=${gate.arc} verdict=${gate.verdict}`);
    check("B4b the repair night is IN the gate's read (1 night, provisional, the repair's own readings)",
      gate.nights === 1 && gate.provisional === true && gate.readings >= 1,
      `nights=${gate.nights} readings=${gate.readings} provisional=${gate.provisional}`);

    // B5: the pass's arcAfter answers the gate's OWN instrument
    check("B5a the pass carried the arc after-standing", pass.night === LAB_NIGHT && Array.isArray(pass.arcAfter) && pass.arcAfter.length === 1, `nights=${pass.arcAfter.length}`);
    const after = pass.arcAfter[0];
    check("B5b the pass's after-standing IS the gate's read (same verdict, same numbers)",
      !!after && after.verdict === gate.verdict && after.nights === gate.nights && after.provisional === gate.provisional
      && Math.abs(after.overall.median - gate.overall.median) < 1e-9 && after.episodeNumber === 1,
      JSON.stringify({ verdict: after?.verdict, nights: after?.nights, median: after?.overall.median }));

    // B6: the idempotent fold - a second append under the same
    // (shot, source, night) replaces (the same law every writer obeys)
    await appendIdentityArcReading({
      projectId: labId, shotId: shot.id, source: "RENDER",
      night: LAB_NIGHT, cohort: bridgeLawCohort(), worst: 0.5,
      scores: [{ characterName: "Lin Yue", similarity: 0.5, aspects: { face: 0.5 }, note: "the folded re-append" }],
    }, { receiptPath: LAB_ARC });
    const foldedLines = (() => {
      try { return readFileSync(LAB_ARC, "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; }
    })();
    const foldedRows = await db.identityArcReading.findMany({ where: { projectId: labId, night: LAB_NIGHT } });
    check("B6 the fold replaces (one line, one row, the fresh values win)",
      foldedLines.length === 1 && foldedRows.length === 1 && foldedRows[0].worst === 0.5,
      `lines=${foldedLines.length} rows=${foldedRows.length} worst=${foldedRows[0]?.worst}`);

    // the repair's own honest closure: the sweep after the pass
    const standingAfter = await castIdentityMeasurement(labId, "RENDER");
    console.log(`   standing: ${standingBefore.below} below -> ${standingAfter.below} below (sweep); the arc answers in the pass's own arcAfter line`);
    if (workedShot) console.log(`   the pair's verdict against the bar: ${shotRepairVerdict(workedShot.before, workedShot.after, 0.7)}`);
  } finally {
    await cleanupLab(labId);
    fsRmSync(LAB_ARC, { force: true }); // the lab receipt dies with the lab
  }

  // B7: the anti-fabrication law + the no-residue law
  const prodReceiptAfter = (() => {
    try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
  })();
  const prodArcAfter = await db.identityArcReading.count();
  const prodScoresAfter = await db.identityScore.count();
  check("B7 the production ledger never heard of the lab (receipt bytes + row counts byte-exact)",
    prodReceiptAfter === prodReceiptBefore && prodArcAfter === prodArcBefore && prodScoresAfter === prodScoresBefore,
    `receipt ${prodReceiptAfter === prodReceiptBefore ? "byte-exact" : "CHANGED"}, arc ${prodArcBefore}->${prodArcAfter}, scores ${prodScoresBefore}->${prodScoresAfter}`);
  check("B7b the lab receipt is gone (the no-residue law)", !existsSync(LAB_ARC));

  if (failures > 0) {
    console.log(`\nITERATION 146: ${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("\nALL GREEN - iteration 146: the repair joins the arc - the named repair now feeds the instrument that named it");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
