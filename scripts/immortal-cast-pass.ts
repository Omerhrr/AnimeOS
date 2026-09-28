// Iteration 79 REAL PASS — raise real identity on the Immortal Path
// cast (sheet-conformant renders against the 70% shipping bar) and
// point the chain at the episode-scale battle on E7.
//
//   1. ANCHOR: real model sheets for the four primary members (the
//      clone stays unanchored on purpose - a derivative answers with
//      its own sheet, and an unanchored member is named honestly by
//      the cast pass instead of poisoning the readings).
//   2. RENDER: the cast-bearing shots (Sc12 S002/S003/S004) through
//      the real engine - the sheet-conformance palette rides the DNA.
//   3. MEASURE: the REAL vision identity score per render against the
//      sheets (source RENDER, bar 0.7).
//   4. READ: measure_identity_bar + cast_identity_pass over the real
//      production - the honest per-member standing.
//   5. THE BATTLE: design -> learn -> verify -> stage_battle across
//      episode 7 (arc BATTLE > PURSUIT > RESOLVE, weights 3/2/1 over
//      the 6 shots), built-in performances chained in the slots.
//
// Run: npx tsx scripts/immortal-cast-pass.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreRenderIdentity } from "../src/lib/identity";

const PROD_TITLE = "Immortal Path";
const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];
const RENDER_SHOT_NUMBERS = [2, 3, 4]; // the cast-bearing shots of Sc12

async function realRender(projectId: string, shotId: string): Promise<{ ok: boolean; status: string }> {
  const job = await createRenderJob(projectId, shotId, "PREVIEW");
  if (!job) return { ok: false, status: "no-job" };
  let ticked = await tickRenderJob(job.id);
  for (let i = 0; i < 560 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

async function main() {
  console.log(`== Immortal Path: the cast answers the bar + the battle is staged ==\n`);
  const prod = await db.project.findFirst({ where: { title: PROD_TITLE } });
  if (!prod) throw new Error(`${PROD_TITLE} not found`);
  const memberships = await db.projectMembership.findMany({ where: { projectId: prod.id }, include: { user: true } });
  const ownerRow = memberships.find((m) => m.user.role === "OWNER") ?? memberships[0];
  const owner = ownerRow?.user ?? (await db.user.findFirst({ where: { role: "OWNER" } }));
  if (!owner) throw new Error("no OWNER user on the host");
  const ownerUser = { id: owner.id, name: owner.name ?? "Owner", role: owner.role };
  const T = (name: string, args: Record<string, unknown>) => executeTool(prod.id, name, args, ownerUser);

  // ── 1. ANCHOR: real sheets for the primary cast ──
  console.log(`── 1. anchor: real model sheets ──`);
  for (const name of SHEET_MEMBERS) {
    const ch = await db.character.findFirst({ where: { projectId: prod.id, name } });
    if (!ch) {
      console.log(`   ${name}: not found (skipped)`);
      continue;
    }
    if (ch.modelSheetUrl) {
      console.log(`   ${name}: already anchored (${ch.modelSheetUrl})`);
      continue;
    }
    try {
      const sheet = await generateCharacterModelSheet(ch.id);
      console.log(`   ${name}: sheet anchored -> ${sheet.modelSheetUrl}`);
    } catch (e) {
      console.log(`   ${name}: sheet generation FAILED - ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 2. RENDER: the cast-bearing shots over the real engine ──
  console.log(`\n── 2. render: the cast-bearing shots (sheet conformance rides the DNA) ──`);
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: prod.id } } },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  if (!scene) throw new Error("no scene on the production");
  const shotByNumber = new Map(scene.shots.map((s) => [s.number, s]));
  const rendered: number[] = [];
  for (const n of RENDER_SHOT_NUMBERS) {
    const shot = shotByNumber.get(n);
    if (!shot) {
      console.log(`   S00${n}: missing (skipped)`);
      continue;
    }
    const existing = await db.renderJob.findFirst({
      where: { shotId: shot.id, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      console.log(`   S00${n}: already rendered (${existing.outputUrl})`);
      rendered.push(n);
      continue;
    }
    const r = await realRender(prod.id, shot.id);
    console.log(`   S00${n}: ${r.ok ? "RENDERED" : "FAILED"} (${r.status.trim().slice(0, 90)})`);
    if (r.ok) rendered.push(n);
  }

  // ── 3. MEASURE: real vision identity per render ──
  console.log(`\n── 3. measure: the REAL vision score per render (source RENDER, bar 70%) ──`);
  for (const n of rendered) {
    const shot = shotByNumber.get(n)!;
    const already = await db.identityScore.findUnique({ where: { shotId_source: { shotId: shot.id, source: "RENDER" } } });
    if (already) {
      console.log(`   E7 Sc${scene.number} S00${n}: already measured (worst ${(already.worst * 100).toFixed(0)}%)`);
      continue;
    }
    const res = await scoreRenderIdentity(shot.id);
    if (res.ok) {
      const worst = (res.scored.verdict.worst * 100).toFixed(0);
      const entries = res.scored.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ");
      console.log(`   E7 Sc${scene.number} S00${n}: worst ${worst}% (${entries})`);
    } else {
      console.log(`   E7 Sc${scene.number} S00${n}: scoring FAILED - ${res.error.slice(0, 120)}`);
    }
  }

  // ── 4. READ: the honest standing over the real production ──
  console.log(`\n── 4. read: the bar + the cast standing ──`);
  const bar = await T("measure_identity_bar", {});
  console.log(bar.result);
  console.log("");
  const cast = await T("cast_identity_pass", {});
  console.log(cast.result);

  // ── 5. THE BATTLE: the chain pointed at the episode-scale fight ──
  console.log(`\n── 5. the battle: design -> learn -> verify -> stage ──`);
  const flowProven = async (register: string, name: string): Promise<boolean> => {
    const f = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: prod.id, register, name } } });
    if (!f) return false;
    try {
      const outcomes = JSON.parse(f.outcomes || "[]") as Array<{ verified?: boolean }>;
      return Array.isArray(outcomes) && outcomes.some((o) => o.verified);
    } catch {
      return false;
    }
  };
  const legs: Array<{ flow: string; register: string; program: string; slots: unknown[] }> = [
    { flow: "Summit Clash law", register: "BATTLE", program: "Mountain Clash", slots: [
      { grammar: "The Assault", motion: "The Rising Fang", wind: 0.7, cloth: 0.8, note: "the clash opens on the rising fang" },
      { grammar: "The Standoff", motion: "The Draw Storm", cloth: 0.5, note: "the circling beat, blades drawn" },
      { grammar: "The Assault", flesh: 0.4, note: "the second exchange lands heavier" },
    ] },
    { flow: "Sky Chase law", register: "PURSUIT", program: "Sky Chase", slots: [
      { grammar: "The Ascent", wind: 0.5 },
      { grammar: "The Withdrawal", cloth: 0.6 },
    ] },
    { flow: "Aftermath law", register: "RESOLVE", program: "Storm Aftermath", slots: [
      { grammar: "The Reveal", cloth: 0.2, wind: 0.1 },
      { grammar: "The Standoff", cloth: 0.1, note: "the peak holds its silence" },
    ] },
  ];
  for (const leg of legs) {
    if (await flowProven(leg.register, leg.flow)) {
      console.log(`   ${leg.flow} (${leg.register}): already proven`);
      continue;
    }
    const designed = await T("design_sequence", { name: leg.program, description: `${leg.program} - the ${leg.register.toLowerCase()} leg of the summit battle`, slots: JSON.stringify(leg.slots) });
    console.log(`   design ${leg.program}: ${designed.status === "OK" ? "OK" : designed.result.slice(0, 160)}`);
    const learned = await T("learn_sequence_flow", { name: leg.flow, register: leg.register, program: leg.program });
    console.log(`   learn ${leg.flow} (${leg.register}): ${learned.status === "OK" ? "OK" : learned.result.slice(0, 160)}`);
    const directed = await T("direct_sequence", { sceneNumber: scene.number, program: leg.program });
    console.log(`   verify ${leg.program}: ${directed.status === "OK" ? "OK (landed whole)" : directed.result.slice(0, 160)}`);
  }
  const battleEvent = await db.productionEvent.findFirst({ where: { projectId: prod.id, summary: { contains: "Battle staged across episode 7" } } });
  if (battleEvent) {
    console.log(`\n   the battle is already staged: ${battleEvent.summary.slice(0, 200)}`);
  } else {
    const staged = await T("stage_battle", { arc: "BATTLE > PURSUIT > RESOLVE", episodeNumber: 7 });
    console.log(`\n${staged.status === "OK" ? staged.result : `STAGE REFUSED: ${staged.result}`}`);
  }

  console.log(`\n== Immortal Path pass complete ==`);
  process.exit(0);
}

main().catch((e) => {
  console.error("real pass crashed:", e);
  process.exit(1);
});
