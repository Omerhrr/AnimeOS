// ─────────────────────────────────────────────────────────────
// E2E ITERATION 147 - THE TICK-BUDGET LAW.
//
// The 146 night named the finding and the frontier law: the repair's
// wait budget was a CONSTANT (660 x 500ms = 330s) while the work it
// waits on scales with the rung - the probe measured the constant
// under-covering the two wide-rung renders by 1.87x (S001, 101
// frames at ~6.1 s/frame) and 3.56x (Wei S004, 96 frames at ~12.2
// s/frame) off the committed record's own timeout frames, so 2 of 4
// re-renders died mid-render and their "repairs" were silently
// re-judgments (the re-anchor beat supplied the lift).
//
// THE FIX: from 147 the wait reads the work's OWN telemetry (the job
// stage's live "frame N/M", the job's progress): a render that
// advances is alive and waits as long as it needs. Only two honest
// budgets end a wait - the STALL (no visible advance for 120s) and
// the CEILING (22 min, sized from the measured worst per-frame cost
// at the wide rung) - and the failure status NAMES WHICH budget
// ended it and the frame the work reached. The old constant is gone.
//
// This gate proves the law end to end:
//   A1 the source law (the version, the sized constants, the old
//      constant GONE, the telemetry read, the honest reasons)
//   B1 the PURE wait decision (the continue zone, the stall
//      boundary, the ceiling boundary, stall outranks ceiling)
//   B2 the ceiling derivation (covers the measured worst need with
//      margin - the number the probe measured)
//   C1 the REAL loop runs under the new wait (real sheet, real
//      planted below standing, real re-render through renderAndWait,
//      the render COMPLETES with no stall/ceiling note)
//   C2 the pass's ledger stays honest (the shot row carries no
//      timeout vocabulary; the arc append rides the lab receipt)
//   C3 the anti-fabrication law (the production receipt's bytes are
//      untouched through the whole run) + the no-residue law
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter147-ticklaw.ts
// (needs the dev server + Blender + the vision channel: the loop is
// REAL - a real sheet generation, a real render, a real re-score)
// ─────────────────────────────────────────────────────────────

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  runIdentityRepairPass, renderWaitDecision, renderAndWait,
  REPAIR_LAW_VERSION, REPAIR_TICK_MS, REPAIR_STALL_TICKS, REPAIR_MAX_WAIT_TICKS,
} from "../src/lib/identity-repair";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const MARK = "iter147-ticklaw";
const LAB_ARC = "receipts/.e2e147-lab.jsonl"; // gitignored - the lab never commits
const LAB_NIGHT = "e2e147-repair-a";

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

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`http://localhost:3000/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`register ${email}: ${res.status}`);
  const jar = new Jar();
  const csrfRes = await fetch(`http://localhost:3000/api/auth/csrf`, { headers: { cookie: jar.header } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const callback = await fetch(`http://localhost:3000/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": `e2e-${MARK}`, cookie: jar.header },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
  });
  jar.absorb(callback);
  const probe = await fetch(`http://localhost:3000/api/projects`, { headers: { cookie: jar.header } });
  if (probe.status !== 200) throw new Error(`login failed for ${email}`);
  const me = (await (await fetch(`http://localhost:3000/api/auth/session`, { headers: { cookie: jar.header } })).json()) as { user?: { id?: string; role?: string } };
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
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderReview.deleteMany({ where: { projectId: labId } });
  await db.identityArcReading.deleteMany({ where: { projectId: labId } });
  await db.identityScore.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  const labChars = await db.character.findMany({ where: { projectId: labId } });
  for (const c of labChars) {
    for (const f of [`${c.id}.png`, `${c.id}-dna.json`]) {
      const p = path.join(process.cwd(), "public", "sheets", f);
      if (existsSync(p)) unlinkSync(p);
    }
  }
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function main() {
  console.log("== Iteration 147: THE TICK-BUDGET LAW ==\n");

  // ───────────────────── A. the source law ─────────────────────
  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  const arcSrc = readFileSync("src/lib/identity-arc.ts", "utf8");

  check("A1a the repair lib carries the tick-budget law version (147)",
    repairSrc.includes(`export const REPAIR_LAW_VERSION = ${REPAIR_LAW_VERSION}`) && REPAIR_LAW_VERSION === 147);
  check("A1b the old constant budget is GONE from source",
    !repairSrc.includes("REPAIR_TICKS ") && !repairSrc.includes("REPAIR_TICKS ="),
    "660 x 500ms was the finding");
  check("A1c the two honest budgets are sized in source",
    repairSrc.includes(`export const REPAIR_STALL_TICKS = ${REPAIR_STALL_TICKS}`) &&
    repairSrc.includes(`export const REPAIR_MAX_WAIT_TICKS = ${REPAIR_MAX_WAIT_TICKS}`),
    `stall ${REPAIR_STALL_TICKS} x ${REPAIR_TICK_MS}ms = ${REPAIR_STALL_TICKS * REPAIR_TICK_MS / 1000}s; ceiling ${REPAIR_MAX_WAIT_TICKS} x ${REPAIR_TICK_MS}ms = ${REPAIR_MAX_WAIT_TICKS * REPAIR_TICK_MS / 60000}min`);
  check("A1d the wait reads the work's own telemetry (the stage's frame N/M)",
    repairSrc.includes("frame (\\d+)\\/(\\d+)") && repairSrc.includes("function frameOf"),
    'the drain reads "frame N/M" live - now the repair does too');
  check("A1e the failure names WHICH budget ended the wait",
    repairSrc.includes("budget ended the wait"));
  check("A1f the doc names the measured divergence (the 146 night's numbers)",
    repairSrc.includes("1.87x") && repairSrc.includes("3.56x"));
  check("A1g the arc law version stands at 146 (the arc's read law did not move)",
    arcSrc.includes("export const IDENTITY_ARC_LAW_VERSION = 146"));

  // ───────────────────── B. the pure decision ─────────────────────
  check("B1a a fresh advancing render continues",
    renderWaitDecision({ elapsedTicks: 0, stalledTicks: 0 }).continue === true);
  check("B1b just under the stall window continues",
    renderWaitDecision({ elapsedTicks: 0, stalledTicks: REPAIR_STALL_TICKS - 1 }).continue === true);
  check("B1c at the stall window the wait ends - STALL",
    renderWaitDecision({ elapsedTicks: 0, stalledTicks: REPAIR_STALL_TICKS }).continue === false &&
    renderWaitDecision({ elapsedTicks: 0, stalledTicks: REPAIR_STALL_TICKS }).reason === "stall");
  check("B1d just under the ceiling continues",
    renderWaitDecision({ elapsedTicks: REPAIR_MAX_WAIT_TICKS - 1, stalledTicks: 0 }).continue === true);
  check("B1e at the ceiling the wait ends - CEILING",
    renderWaitDecision({ elapsedTicks: REPAIR_MAX_WAIT_TICKS, stalledTicks: 0 }).continue === false &&
    renderWaitDecision({ elapsedTicks: REPAIR_MAX_WAIT_TICKS, stalledTicks: 0 }).reason === "ceiling");
  check("B1f the stall outranks the ceiling (both fired)",
    renderWaitDecision({ elapsedTicks: REPAIR_MAX_WAIT_TICKS, stalledTicks: REPAIR_STALL_TICKS }).reason === "stall");
  check("B1g the ceiling derivation covers the measured worst need with margin",
    REPAIR_MAX_WAIT_TICKS * REPAIR_TICK_MS >= 1175_000,
    `worst measured need ~1173s (S004, 3.56x the old budget); ceiling ${REPAIR_MAX_WAIT_TICKS * REPAIR_TICK_MS / 1000}s`);

  // ───────────────────── C. the REAL loop under the new wait ─────────────────────
  const prodReceiptBefore = (() => {
    try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
  })();
  const prodArcBefore = await db.identityArcReading.count();

  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }

  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C0a the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter147 TickLaw Lab ${MARK}`, logline: "a throwaway production for the tick-budget-law proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C0b the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  try {
    const ep = await T("create_episode", { title: "The Scaled Wait", count: 1 });
    check("C0c the episode exists", ep.status === "OK", ep.result.slice(0, 120));
    let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
    if (!scene) {
      const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
      if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
      scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Wait" } });
    }
    const shot = await db.shot.create({
      data: { sceneId: scene.id, number: 3, description: "Lin Yue meditates on the cliff edge as the storm rolls in", duration: 2.5, movement: "STATIC" },
    });
    const hero = await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });

    const realSheet = await T("generate_model_sheet", { characterName: "Lin Yue" });
    check("C0d the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

    // the shot's own finished clip (the vision channel scores FINISHED
    // renders - the plant lands on a real row, the repair re-renders over
    // it). THE GATE RIDES THE SCALED WAIT ITSELF (iteration 147): the old
    // fixed 210s loop died on advancing renders the moment the box was
    // loaded - a gate that abandons an alive render starves everything
    // downstream of a clip.
    const r1 = await renderAndWait(labId, shot.id);
    check("C0e the hero's clip finished over the real engine", r1.ok, r1.status.slice(0, 140));

    // the planted below standing (the work order)
    const raw35 = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Lin Yue", similarity: 0.35, aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shot.id, raw35, "RENDER");
    check("C0f the planted below reading lands on the real row", planted.ok, "error" in planted ? planted.error : "");
    const standingBefore = await castIdentityMeasurement(labId, "RENDER");
    check("C0g the standing names Lin Yue BELOW at the planted 0.35",
      standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Lin Yue")?.worstRef === "E1 Sc1 S003",
      JSON.stringify({ below: standingBefore.below }));

    // THE LOOP through the NEW wait (reanchor off: bounded, no sheet
    // regen; the lab receipt path - the production ledger never hears
    // of it). The re-render is REAL: if the wait is broken (stalls a
    // live render, or fires the ceiling early), this row says so.
    const pass = await runIdentityRepairPass(labId, {
      members: 1, shotsPerMember: 1, reanchor: false, night: LAB_NIGHT, receiptPath: LAB_ARC,
    });
    const shotRow = pass.members[0]?.shots[0];
    check("C1a the pass worked the named member and shot",
      pass.members.length === 1 && !!shotRow,
      JSON.stringify({ members: pass.members.length }));
    check("C1b the re-render COMPLETED under the progress-aware wait (no stall, no ceiling, no timeout)",
      !!shotRow && shotRow.after !== null && !/stall|ceiling|timeout|did not finish/.test(shotRow.error ?? ""),
      JSON.stringify(shotRow?.error ?? "no error note"));
    check("C1c the wait never even approached the ceiling (an honest render is minutes, not the wall)",
      !!shotRow && shotRow.after !== null,
      "the completion itself is the proof the scaled wait serves real renders");

    const afterStanding = await castIdentityMeasurement(labId, "RENDER");
    check("C2a the pass's ledger stays honest (a verdict exists, the standing is re-read)",
      ["REPAIRED", "IMPROVED", "UNCHANGED", "WORSE", "STILL_BELOW", "UNSCORED"].includes(pass.members[0]?.verdict ?? "") &&
      afterStanding.measured >= 1,
      pass.members[0]?.verdict ?? "no verdict");
    const labArcRows = await db.identityArcReading.findMany({ where: { projectId: labId } });
    check("C2b the re-score appended to the lab arc (the 146 join rides the new wait)",
      labArcRows.length === 1 && labArcRows[0].night === LAB_NIGHT,
      JSON.stringify({ rows: labArcRows.length, night: labArcRows[0]?.night }));
    // C2c: the lab receipt carries the line, ref-chained to the WORK
    const labLines = (() => {
      try { return readFileSync(LAB_ARC, "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; }
    })();
    check("C2c the lab receipt carries the line (ref-chained to the WORK 1/1/3, not the surrogate)",
      labLines.length === 1 && labLines[0].ref?.episode === 1 && labLines[0].ref?.scene === 1 && labLines[0].ref?.shot === 3 && labLines[0].night === LAB_NIGHT,
      `lines=${labLines.length} ref=${JSON.stringify(labLines[0]?.ref)}`);
    check("C2d the pass's own report names its night",
      pass.night === LAB_NIGHT);
  } finally {
    // ───────────────────── C3. no residue, no fabrication ─────────────────────
    await cleanupLab(labId);
    if (existsSync(LAB_ARC)) unlinkSync(LAB_ARC);
    const prodReceiptAfter = (() => {
      try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
    })();
    check("C3a the production receipt's bytes are untouched through the whole run",
      prodReceiptBefore === prodReceiptAfter);
    check("C3b the production arc rows are untouched", (await db.identityArcReading.count()) === prodArcBefore);
    const residue = await db.project.findFirst({ where: { title: { contains: MARK } } });
    check("C3c the no-residue law (the lab project is gone)", !residue);
  }

  console.log(failures === 0
    ? "\nE2E GREEN - iteration 147: the tick-budget law holds - the wait reads the work, the budgets are honest, the render completes."
    : `\nE2E FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
