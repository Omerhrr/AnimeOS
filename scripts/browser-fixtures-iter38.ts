// Browser fixtures for Iteration 38 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter38" with a
//       speaking closeup (art + dialogue) whose episode carries a REAL
//       exported cut on the delivery spine, a fact whose three BROKEN
//       audits earn a retire suggestion (the reword flow re-audits the
//       art-less panel honestly, no vision call needed), and the
//       publishing panel ready to stage a live package.
// clean: deletes the fixture production (cascades) and sweeps
//        orphaned panels + the fixture's cut artifacts.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter38";
const CUT_PREFIX = "e2e-browser-iter38";

function synth(file: string, filter: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execSync(`ffmpeg -y -loglevel error -f lavfi -i ${filter} -frames:v 1 "${file}"`);
}

async function sweepOrphans() {
  const shotIds = new Set((await db.shot.findMany({ select: { id: true } })).map((s) => s.id));
  let removed = 0;
  const panelsDir = path.join(process.cwd(), "public", "panels");
  if (fs.existsSync(panelsDir)) {
    for (const f of fs.readdirSync(panelsDir)) {
      const full = path.join(panelsDir, f);
      if (!fs.statSync(full).isFile()) continue;
      if (!shotIds.has(f.replace(/\.png$/, ""))) {
        fs.rmSync(full, { force: true });
        removed += 1;
      }
    }
  }
  const cutsDir = path.join(process.cwd(), "public", "renders", "cuts");
  if (fs.existsSync(cutsDir)) {
    for (const f of fs.readdirSync(cutsDir)) {
      if (f.startsWith(CUT_PREFIX)) {
        fs.rmSync(path.join(cutsDir, f), { force: true });
        removed += 1;
      }
    }
  }
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
    logline: "browser fixture: acoustic retime + re-audit helper + platform publishing",
    characters: { create: [{ name: "Lin Yue", role: "PROTAGONIST" }] },
    seasons: {
      create: {
        number: 1,
        title: "S1",
        episodes: {
          create: {
            number: 1,
            title: "Embers",
            synopsis: "Lin Yue answers the stair.",
            scenes: {
              create: {
                number: 1,
                title: "Ash Steps",
                shots: { create: [
                  { number: 1, description: "Lin Yue speaks on the stair", shotType: "CLOSEUP", movement: "STATIC", duration: 4, dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The blade chose me.", kind: "SPEECH" }]) },
                  { number: 2, description: "the two moons over the ash stair", shotType: "ESTABLISHING", movement: "STATIC", duration: 3 },
                ] },
              },
            },
          },
        },
      },
    },
  },
  include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
});
const ep1 = proj.seasons[0].episodes[0];
const [shotSpeak, shotMoons] = ep1.scenes[0].shots;
console.log(`fixture project ${proj.id}`);

// panel art for the speaking closeup (the cut's MOTION inline render
// rides it); shot 2 stays art-less on purpose (the re-audit skips it
// honestly instead of calling the vision model)
const speakArt = path.join(process.cwd(), "public", "panels", `${shotSpeak.id}.png`);
synth(speakArt, "gradients=s=640x360:c0=0x112233:c1=0x778899");
await db.shot.update({ where: { id: shotSpeak.id }, data: { artworkUrl: `/panels/${shotSpeak.id}.png`, artGeneratedAt: new Date() } });

// a fact the art keeps failing: three BROKEN audits on the art-less
// panel earn the auto-retire suggestion (hold rate 0%)
const fact = await db.universeFact.create({
  data: { projectId: proj.id, text: "two moons hang over the ash stair", category: "WORLD", source: "USER" },
});
const ev = (conf: number) => ({
  projectId: proj.id,
  entityType: "UNIVERSE_FACT",
  entityName: fact.text.slice(0, 90),
  kind: "FACT_BROKEN",
  episodeNumber: 1,
  description: `[universe ${shotMoons.id}] (E1 Sc1 S002) confidence ${conf.toFixed(2)} - only one moon visible`.slice(0, 900),
  severity: "WARNING",
});
await db.continuityEvent.createMany({ data: [ev(0.85), ev(0.8), ev(0.75)] });

// a REAL cut on the delivery spine (MOTION renders the closeup inline)
const { buildEpisodeCut } = await import("@/lib/comic/cut");
const cut = await buildEpisodeCut(ep1.id, "PREVIEW");
console.log(`cut: ${cut.file} (${cut.width}x${cut.height}, ${(cut.durationMs / 1000).toFixed(1)}s)`);
console.log(`fact: ${fact.text} (3 BROKEN audits -> retire suggestion; reword re-audits 1 art-less panel)`);
console.log("seeded");
process.exit(0);
