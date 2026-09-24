// Browser fixtures for Iteration 34 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter34" with two
//       sheeted characters, panel art on shots 1-2 (synth PNGs while
//       the image provider is rate-limited), identity score rows
//       landed through the REAL persistence path (one verified, one
//       drifting), and a REAL completed MOTION render with telemetry.
//       The Render Queue shows the per-provider readout + ledger, the
//       Continuity view shows the identity panel with the drift
//       queue, the DSH view shows the per-episode template catalog.
// clean: deletes the fixture production (cascades) and sweeps
//        orphaned panels/renders/sheets by DB-existence.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRenderJob, tickRenderJob } from "@/lib/engine/render";
import { scoreShotIdentityFromRaw } from "@/lib/identity";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter34";

function synthesizePng(file: string, size: string, color: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=${color}:s=${size} -frames:v 1 "${file}"`);
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
      if (!fs.statSync(full).isFile()) continue; // keep subdirectories (e.g. renders/cuts)
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
    logline: "browser fixture: provider ledger, episode templates, identity scoring",
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

// sheets + panels on the real disk paths
synthesizePng(path.join(process.cwd(), "public", "sheets", `${linYue.id}.png`), "1024x1024", "0x1b2a4a");
synthesizePng(path.join(process.cwd(), "public", "sheets", `${xiaoChen.id}.png`), "1024x1024", "0x4a1b2a");
synthesizePng(path.join(process.cwd(), "public", "panels", `${shot1.id}.png`), "1152x864", "0x2a4a1b");
synthesizePng(path.join(process.cwd(), "public", "panels", `${shot2.id}.png`), "1152x864", "0x4a3a1b");
const now = new Date();
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

// a REAL MOTION render with REAL telemetry on shot 1
const job = await createRenderJob(proj.id, shot1.id, "PREVIEW");
let done = job;
for (let i = 0; i < 75 && done.status === "RENDERING"; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  done = (await tickRenderJob(done.id))!;
}
console.log(`render job ${done.status} telemetry=${done.telemetry?.slice(0, 80) ?? "none"}`);
console.log("seeded");
process.exit(0);
