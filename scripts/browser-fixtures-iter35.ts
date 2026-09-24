// Browser fixtures for Iteration 35 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter35" with two
//       sheeted characters (gradient sheets), panel art with REAL
//       affinity rows (the provider-free embedding pass through
//       sharp), identity score rows through the REAL persistence path
//       (one verified, one drifting), universe facts with verdict
//       events in the EXACT format the vision pipeline writes (the
//       display seam while the vision provider is rate-limited; the
//       real loop was proven in the iter35 E2E tool step), and REAL
//       schedule fires (SKIPPED x2 + ERROR through the deleted pinned
//       plan) with one schedule made overdue for the digest chips.
// clean: deletes the fixture production (cascades) and sweeps
//        orphaned panels/renders/sheets by DB-existence.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { scoreShotIdentityFromRaw, scoreShotEmbedding } from "@/lib/identity";
import { createSchedule, fireScheduleNow } from "@/lib/scheduler";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter35";

function synth(file: string, filter: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execSync(`ffmpeg -y -loglevel error -f lavfi -i ${filter} -frames:v 1 "${file}"`);
}

async function sweepOrphans() {
  const shotIds = new Set((await db.shot.findMany({ select: { id: true } })).map((s) => s.id));
  const charIds = new Set((await db.character.findMany({ select: { id: true } })).map((c) => c.id));
  const jobIds = new Set((await db.renderJob.findMany({ select: { id: true } })).map((j) => j.id));
  let removed = 0;
  const sweep = (dir: string, ids: Set<string>) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (!fs.statSync(full).isFile()) continue;
      const stem = f.replace(/\.png$|\.mp4$/, "");
      if (!ids.has(stem)) {
        fs.rmSync(full, { force: true });
        removed += 1;
      }
    }
  };
  sweep(path.join(process.cwd(), "public", "panels"), shotIds);
  sweep(path.join(process.cwd(), "public", "sheets"), charIds);
  sweep(path.join(process.cwd(), "public", "renders"), jobIds);
  return removed;
}

if (process.argv[2] === "clean") {
  const proj = await db.project.findFirst({ where: { title: TITLE }, select: { id: true } });
  if (proj) await db.project.delete({ where: { id: proj.id } });
  const removed = await sweepOrphans();
  console.log(`cleaned: fixture project ${proj ? "(cascaded)" : "(absent)"} + ${removed} orphan artifact(s)`);
  process.exit(0);
}

const proj = await db.project.create({
  data: {
    title: TITLE,
    logline: "browser fixture: canon health, schedule digest, affinity tripwire",
    characters: { create: [
      { name: "Lin Yue", role: "PROTAGONIST" },
      { name: "Xiao Chen", role: "RIVAL" },
    ] },
    seasons: {
      create: {
        number: 1,
        title: "S1",
        episodes: {
          create: {
            number: 1,
            title: "Embers",
            scenes: {
              create: {
                number: 1,
                title: "Ash Steps",
                description: "a scorched mountain stair under two moons",
                fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.5, cameraDistance: 1.0, rimLightIntensity: 0.5,
                shots: { create: [
                  { number: 1, description: "Lin Yue climbs the ash stair, blade drawn", shotType: "MEDIUM", movement: "DOLLY_IN", duration: 3 },
                  { number: 2, description: "Xiao Chen waits at the summit", shotType: "WIDE", movement: "STATIC", duration: 3 },
                  { number: 3, description: "the two moons over the ash stair", shotType: "ESTABLISHING", movement: "CRANE", duration: 3 },
                ] },
              },
            },
          },
        },
      },
    },
  },
  include: { characters: true, seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
});
console.log(`fixture project ${proj.id}`);

const [linYue, xiaoChen] = proj.characters;
const [shot1, shot2] = proj.seasons[0].episodes[0].scenes[0].shots;
const now = new Date();

// sheets + panels: real gradient PNGs so the embedding pass is meaningful
synth(path.join(process.cwd(), "public", "sheets", `${linYue.id}.png`), "gradients=s=1024x1024:c0=0x1b2a4a:c1=0x0e1428");
synth(path.join(process.cwd(), "public", "sheets", `${xiaoChen.id}.png`), "gradients=s=1024x1024:c0=0x4a1b2a:c1=0x280d16");
synth(path.join(process.cwd(), "public", "panels", `${shot1.id}.png`), "mandelbrot=s=1152x864");
synth(path.join(process.cwd(), "public", "panels", `${shot2.id}.png`), "gradients=s=1152x864:c0=0x4a1b2a:c1=0x280d16");
await db.character.update({ where: { id: linYue.id }, data: { modelSheetUrl: `/sheets/${linYue.id}.png?v=${now.getTime()}`, modelSheetPrompt: "Lin Yue canonical anchor (E2E)", modelSheetAt: now } });
await db.character.update({ where: { id: xiaoChen.id }, data: { modelSheetUrl: `/sheets/${xiaoChen.id}.png?v=${now.getTime()}`, modelSheetPrompt: "Xiao Chen canonical anchor (E2E)", modelSheetAt: now } });
await db.shot.update({ where: { id: shot1.id }, data: { artworkUrl: `/panels/${shot1.id}.png?v=${now.getTime()}`, artGeneratedAt: now } });
await db.shot.update({ where: { id: shot2.id }, data: { artworkUrl: `/panels/${shot2.id}.png?v=${now.getTime()}`, artGeneratedAt: now } });

// identity rows through the REAL persistence path
const verified = await scoreShotIdentityFromRaw(shot1.id, JSON.stringify({
  note: "the panel reads close to the canonical sheet",
  characters: [{ name: "Lin Yue", similarity: 0.83, aspects: { face: 0.9, hair: 0.85 }, note: "hair and blade match" }],
}));
const drifting = await scoreShotIdentityFromRaw(shot2.id, JSON.stringify({
  note: "the rival's robe lost its rank sash",
  characters: [{ name: "Xiao Chen", similarity: 0.41, aspects: { face: 0.7, wardrobe: 0.2 }, note: "wardrobe drifted" }],
}));
console.log(`identity rows: verified=${verified.ok ? verified.scored.verdict.worst : "FAIL"} drift=${drifting.ok ? drifting.scored.verdict.worst : "FAIL"}`);

// provider-free affinity rows through the REAL local pass (sharp, no provider)
const aff1 = await scoreShotEmbedding(shot1.id);
const aff2 = await scoreShotEmbedding(shot2.id);
console.log(`affinity rows: shot1=${aff1.ok ? aff1.scored.verdict.worst.toFixed(2) : "FAIL"} shot2=${aff2.ok ? aff2.scored.verdict.worst.toFixed(2) : "FAIL"}`);

// universe facts + verdict events in the EXACT format the vision
// pipeline writes (universe-facts.ts persist block) - a display seam
// while the vision provider is 429; the real loop is proven in the
// iter35 E2E tool step
const facts = await db.universeFact.createManyAndReturn({
  data: [
    { projectId: proj.id, text: "two moons hang over the arena", category: "WORLD", source: "USER" },
    { projectId: proj.id, text: "the antagonist never removes his mask", category: "RULE", source: "USER" },
    { projectId: proj.id, text: "her blade glows cyan when energy channels", category: "PROP", source: "DSH" },
    { projectId: proj.id, text: "the terrace lanterns burn blue at night", category: "LOCATION", source: "DSH" },
  ],
});
const ref1 = "E1 Sc1 S001";
const ref2 = "E1 Sc1 S002";
const ev = (factText: string, kind: string, conf: number, note: string, ref: string) => ({
  projectId: proj.id,
  entityType: "UNIVERSE_FACT",
  entityName: factText.slice(0, 90),
  kind,
  episodeNumber: 1,
  description: `[universe ${ref.includes("S001") ? shot1.id : shot2.id}] (${ref}) confidence ${conf.toFixed(2)} - ${note}`.slice(0, 900),
  severity: kind === "FACT_BROKEN" && conf >= 0.6 ? "WARNING" : "INFO",
});
await db.continuityEvent.createMany({
  data: [
    ev(facts[0].text, "FACT_HELD", 0.9, "both moons visible", ref1),
    ev(facts[1].text, "FACT_BROKEN", 0.85, "the mask is off", ref1),
    ev(facts[2].text, "FACT_HELD", 0.4, "glow faint but present", ref1),
    ev(facts[0].text, "FACT_HELD", 0.8, "moons clear", ref2),
    ev(facts[1].text, "FACT_HELD", 0.7, "mask on", ref2),
    ev(facts[2].text, "FACT_HELD", 0.3, "barely visible", ref2),
  ],
});
console.log(`facts: ${facts.length} registered, 6 verdict events`);

// REAL schedule fires: SKIPPED x2, then ERROR via the deleted pinned plan
const planRun = await createSchedule(proj.id, { name: "Nightly breakdown", kind: "PLAN_RUN", cadence: "DAILY", hourUtc: 2, maxSteps: 2 });
await fireScheduleNow(planRun.schedule.id);
const watch = await createSchedule(proj.id, { name: "Render-queue watch", kind: "REPAINT_QUEUE", cadence: "HOURLY", intervalHours: 6 });
await fireScheduleNow(watch.schedule.id);
const doomed = await db.dshPlan.create({ data: { projectId: proj.id, title: "Doomed plan", goal: "prove the ERROR path", status: "ACTIVE", steps: "[]" } });
const doomedSched = await createSchedule(proj.id, { name: "Stuck exporter", kind: "PLAN_RUN", cadence: "DAILY", hourUtc: 3, planId: doomed.id });
await db.dshPlan.delete({ where: { id: doomed.id } });
const errFire = await fireScheduleNow(doomedSched.schedule.id);
console.log(`schedules: SKIPPED+SKIPPED+${errFire.status ?? "?"} fired, digest rows ready`);

console.log("seeded");
process.exit(0);
