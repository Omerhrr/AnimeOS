// Browser fixtures for Iteration 29 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter29" exercising
//       all three features: a character whose states carry POSE
//       PRESETS (explicit STANCE->LUNGE pair + a preset-less state),
//       RENDERED clips for every shot (headless Blender stand-in for
//       the pose beat, Blender/MOTION for the camera-only beats), and
//       an ART-AWARE CONTINUITY story: model sheet, then panel art,
//       then a new state + a regenerated anchor AFTER the art - so the
//       continuity scan flags stale-state and stale-anchor, and Chen
//       Hao shows as anchor-missing.
// clean: deletes the fixture production (cascades jobs/events) and
//        unlinks every artifact it produced (renders/panels/sheets).
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const TITLE = "E2E Browser Iter29";
const SNAPSHOT = path.join("/tmp", ".iter29-fixture-files.json");

async function api<T>(p: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${p}`, init);
  return (await res.json()) as T;
}

function dirFiles(): string[] {
  const out: string[] = [];
  for (const d of ["renders", "panels", "sheets"]) {
    const dir = path.join(process.cwd(), "public", d);
    try { for (const f of fs.readdirSync(dir)) out.push(`${d}/${f}`); } catch { /* missing */ }
  }
  return out;
}

function removeFixtureFiles(snapshot: string[]) {
  const before = new Set(snapshot);
  let removed = 0;
  for (const rel of dirFiles()) {
    if (!before.has(rel)) {
      try { fs.unlinkSync(path.join(process.cwd(), "public", rel)); removed += 1; } catch { /* best effort */ }
    }
  }
  return removed;
}

if (process.argv[2] === "clean") {
  const proj = await db.project.findFirst({ where: { title: TITLE }, select: { id: true } });
  if (!proj) {
    console.log("nothing to clean");
    process.exit(0);
  }
  await db.project.delete({ where: { id: proj.id } });
  let snapshot: string[] = [];
  try { snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as string[]; } catch { /* missing */ }
  const removed = removeFixtureFiles(snapshot);
  try { fs.unlinkSync(SNAPSHOT); } catch { /* already gone */ }
  console.log(`cleaned: fixture project + ${removed} artifact file(s)`);
  process.exit(0);
}

// ── seed ──
fs.writeFileSync(SNAPSHOT, JSON.stringify(dirFiles()));

const proj = await db.project.create({
  data: {
    title: TITLE,
    logline: "browser fixture: real img2vid provider, per-state pose presets, art-aware continuity",
    fps: 24,
    resolution: "1280x720",
    characters: {
      create: [
        {
          name: "Lin Yue",
          role: "PROTAGONIST",
          appearance: JSON.stringify({ notes: "young cultivator, silver hair tied high, jade eyes, teal sect robes" }),
          states: {
            create: [
              // explicit pose preset: visible as selects + chip in the characters view
              { label: "Furious (temple duel)", episodeNumber: 1, stateType: "TEMPORARY", poseStart: "STANCE", poseEnd: "LUNGE" },
              // a preset-less state for the empty-selects look
              { label: "Grieving (aftermath)", episodeNumber: 2, stateType: "PERMANENT" },
            ],
          },
        },
        { name: "Chen Hao", role: "RIVAL" },
      ],
    },
    seasons: {
      create: {
        number: 1,
        title: "S1",
        episodes: {
          create: {
            number: 1,
            title: "Terrace Duel",
            scenes: {
              create: {
                number: 1,
                title: "Terrace",
                description: "a rain-slick terrace above the cloud sea",
                fogDensity: 0.45,
                lightningIntensity: 0.3,
                energyIntensity: 0.65,
                cameraDistance: 1.0,
                rimLightIntensity: 0.55,
                shots: {
                  create: [
                    { number: 1, description: "Lin Yue snaps into the duel", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE", duration: 2.0 },
                    { number: 2, description: "Lin Yue stands against the storm", shotType: "CLOSEUP", movement: "DOLLY_IN", lens: "50mm", lighting: "storm night", duration: 1.6 },
                    { number: 3, description: "Chen Hao watches from the far rail", shotType: "WIDE", movement: "PAN", duration: 1.6 },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
  include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } }, characters: { include: { states: true } } },
});
const shots = proj.seasons[0].episodes[0].scenes[0].shots.sort((a, b) => a.number - b.number);
const linYue = proj.characters.find((c) => c.name === "Lin Yue")!;
console.log(`fixture project ${proj.id}, ${shots.length} shots`);

// 1) model sheet (anchor) for Lin Yue
const sheet = await api<{ modelSheetUrl?: string; error?: string }>("/api/character-sheet", {
  method: "POST",
  body: JSON.stringify({ characterId: linYue.id }),
});
if (!sheet.modelSheetUrl) throw new Error(`sheet failed: ${sheet.error}`);
console.log("model sheet ready");

// 2) panel art for shot 2 (carries the previous-panel continuity line)
const art = await api<{ artworkUrl?: string; error?: string }>("/api/panel-art", {
  method: "POST",
  body: JSON.stringify({ shotId: shots[1].id, format: "MANHUA" }),
});
if (!art.artworkUrl) throw new Error(`panel art failed: ${art.error}`);
console.log("panel art ready");

// 3) art-aware continuity story: a state recorded AFTER the art
//    (stale-state) and a REGENERATED anchor AFTER the art (stale-anchor)
await db.characterState.create({
  data: { characterId: linYue.id, label: "Grieving (after the duel)", episodeNumber: 1, stateType: "TEMPORARY" },
});
const sheet2 = await api<{ modelSheetUrl?: string; error?: string }>("/api/character-sheet", {
  method: "POST",
  body: JSON.stringify({ characterId: linYue.id }),
});
if (!sheet2.modelSheetUrl) throw new Error(`sheet regen failed: ${sheet2.error}`);
console.log("stale art scenario ready");

// 4) render all three shots and wait for clips
for (const s of shots) {
  await api("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "create", shotId: s.id, mode: "PREVIEW" }) });
}
const deadline = Date.now() + 7 * 60_000;
let withClips = 0;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  const jobs = await api<Array<{ shotId: string | null; outputUrl: string | null }>>(`/api/render-jobs?projectId=${proj.id}`);
  const byShot = new Map<string, string | null>();
  for (const j of jobs) if (j.shotId) byShot.set(j.shotId, byShot.get(j.shotId) ?? j.outputUrl);
  withClips = shots.filter((s) => (byShot.get(s.id) ?? null) !== null).length;
  process.stdout.write(`\rclips: ${withClips}/${shots.length}   `);
  if (withClips === shots.length) break;
}
console.log(`\nseeded: ${TITLE} project=${proj.id} with ${withClips}/${shots.length} clips`);
if (withClips < shots.length) {
  console.log("WARN: not every shot finished in time - the browser check will show partial state");
}
process.exit(0);
