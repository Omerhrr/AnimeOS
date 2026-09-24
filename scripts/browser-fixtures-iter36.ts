// Browser fixtures for Iteration 36 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter36" with two
//       sheeted characters, three REAL identity-scored panels building
//       a DECLINING drift curve for Lin Yue (0.9 -> 0.7 over episode
//       order) plus a below-bar Xiao Chen panel for the re-paint
//       queue, a universe fact whose 3 BROKEN audits earn a retire
//       suggestion, a saved creator-authored plan-template variation,
//       and a posted studio digest.
// clean: deletes the fixture production (cascades) and sweeps
//        orphaned panels/renders/sheets by DB-existence.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { scoreShotIdentityFromRaw } from "@/lib/identity";
import { savePlanTemplate } from "@/lib/dsh/plan-templates";
import { postDailyDigest } from "@/lib/digest";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter36";

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
    logline: "browser fixture: previz demotion, retire suggestions, drift curves, variations, digest",
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
                  { number: 2, description: "Lin Yue rests at the summit", shotType: "CLOSEUP", movement: "STATIC", duration: 3 },
                  { number: 3, description: "Xiao Chen waits alone", shotType: "WIDE", movement: "STATIC", duration: 3 },
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

const [shot1, shot2, shot3] = proj.seasons[0].episodes[0].scenes[0].shots;
const now = new Date();

// sheets + panels: real gradient PNGs
for (const c of proj.characters) {
  synth(path.join(process.cwd(), "public", "sheets", `${c.id}.png`), c.name === "Lin Yue"
    ? "gradients=s=1024x1024:c0=0x1b2a4a:c1=0x0e1428"
    : "gradients=s=1024x1024:c0=0x4a1b2a:c1=0x280d16");
  await db.character.update({
    where: { id: c.id },
    data: { modelSheetUrl: `/sheets/${c.id}.png?v=${now.getTime()}`, modelSheetPrompt: `${c.name} canonical anchor (E2E)`, modelSheetAt: now },
  });
}
const panels = [
  { shot: shot1, filter: "gradients=s=1152x864:c0=0x22304e:c1=0x111a30" },
  { shot: shot2, filter: "gradients=s=1152x864:c0=0x1d2942:c1=0x0e1626" },
  { shot: shot3, filter: "gradients=s=1152x864:c0=0x501c2e:c1=0x2a0e18" },
];
for (const p of panels) {
  synth(path.join(process.cwd(), "public", "panels", `${p.shot.id}.png`), p.filter);
  await db.shot.update({ where: { id: p.shot.id }, data: { artworkUrl: `/panels/${p.shot.id}.png?v=${now.getTime()}`, artGeneratedAt: now } });
}

// identity rows through the REAL persistence path: Lin Yue declines
// 0.9 -> 0.7 across story order; Xiao Chen lands below the bar
const r1 = await scoreShotIdentityFromRaw(shot1.id, JSON.stringify({
  note: "close to the canonical sheet",
  characters: [{ name: "Lin Yue", similarity: 0.9, aspects: { face: 0.92, hair: 0.88, wardrobe: 0.9 }, note: "matches" }],
}));
const r2 = await scoreShotIdentityFromRaw(shot2.id, JSON.stringify({
  note: "the face softened against the sheet",
  characters: [{ name: "Lin Yue", similarity: 0.7, aspects: { face: 0.66, hair: 0.74, wardrobe: 0.8 }, note: "face drifting" }],
}));
const r3 = await scoreShotIdentityFromRaw(shot3.id, JSON.stringify({
  note: "the rival's robe lost its rank sash",
  characters: [{ name: "Xiao Chen", similarity: 0.41, aspects: { face: 0.7, wardrobe: 0.2 }, note: "wardrobe drifted" }],
}));
console.log(`identity: ${r1.ok ? r1.scored.verdict.worst : "FAIL"} / ${r2.ok ? r2.scored.verdict.worst : "FAIL"} / ${r3.ok ? r3.scored.verdict.worst : "FAIL"}`);

// a fact whose audits keep failing -> the retire suggestion
const maskFact = await db.universeFact.create({
  data: { projectId: proj.id, text: "the antagonist never removes his mask", category: "RULE", source: "USER" },
});
const ev = (kind: string, conf: number, note: string, shotId: string, num: number) => ({
  projectId: proj.id,
  entityType: "UNIVERSE_FACT",
  entityName: maskFact.text.slice(0, 90),
  kind,
  episodeNumber: 1,
  description: `[universe ${shotId}] (E1 Sc1 S00${num}) confidence ${conf.toFixed(2)} - ${note}`.slice(0, 900),
  severity: kind === "FACT_BROKEN" && conf >= 0.6 ? "WARNING" : "INFO",
});
await db.continuityEvent.createMany({
  data: [
    ev("FACT_BROKEN", 0.9, "the mask is off", shot1.id, 1),
    ev("FACT_BROKEN", 0.85, "the mask is off again", shot2.id, 2),
    ev("FACT_BROKEN", 0.88, "bare-faced on the stair", shot3.id, 3),
  ],
});
console.log(`fact "${maskFact.text}" with 3 BROKEN audits (retire suggestion ready)`);

// a saved creator-authored variation
const saved = await savePlanTemplate(proj.id, {
  baseId: "beat-breakdown",
  name: "Two-shot beat breakdown",
  summary: "A leaner beat: one establishing frame and one reaction closeup, then a capability check.",
  cadenceHint: "nightly - two shots per fire",
  steps: [
    { tool: "get_production_context", args: {}, why: "load the production state" },
    { tool: "create_scene", args: { episodeNumber: "{episode}", title: "{title} - the lean beat" }, why: "open the beat's scene" },
    { tool: "create_shot", args: { shotType: "ESTABLISHING", movement: "CRANE", duration: 5 }, why: "geography shot" },
    { tool: "create_shot", args: { shotType: "CLOSEUP", movement: "STATIC", duration: 3 }, why: "reaction shot" },
    { tool: "check_capabilities", args: {}, why: "what the beat still lacks" },
  ],
});
console.log(`variation: ${saved.ok ? saved.template!.name : "FAIL"}`);

// a posted digest
const digest = await postDailyDigest(proj.id);
console.log(`digest: ${digest.ok ? digest.digest.headline : "FAIL"}`);

console.log("seeded");
process.exit(0);
