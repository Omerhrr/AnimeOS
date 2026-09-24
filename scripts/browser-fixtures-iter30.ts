// Browser fixtures for Iteration 30 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter30" exercising
//       both features: THREE UNIVERSE FACTS (canon rules of the world)
//       + REAL panel art + a manufactured confident FACT_BROKEN verdict
//       (so the re-render queue shows a ranked row immediately), and
//       RENDERED clips for every shot - shot 1 is a CLOSEUP with a
//       STANCE -> POINT program so the v3.2 face/hand rig is visible
//       right on the queue card.
// clean: deletes the fixture production (cascades jobs/events/facts)
//        and unlinks every artifact it produced.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const TITLE = "E2E Browser Iter30";
const SNAPSHOT = path.join("/tmp", ".iter30-fixture-files.json");

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
    logline: "browser fixture: stand-in rig upgrade (faces/hands) + universe-facts vision checks",
    fps: 24,
    resolution: "1280x720",
    characters: {
      create: [
        { name: "Lin Yue", role: "PROTAGONIST" },
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
            title: "Terrace",
            scenes: {
              create: {
                number: 1,
                title: "Cloud Terrace",
                description: "a rain-slick terrace above the cloud sea, two moons overhead",
                fogDensity: 0.4,
                lightningIntensity: 0.3,
                energyIntensity: 0.6,
                cameraDistance: 1.0,
                rimLightIntensity: 0.55,
                shots: {
                  create: [
                    { number: 1, description: "Lin Yue channels spirit energy at the terrace edge", shotType: "CLOSEUP", movement: "STATIC", poseStart: "STANCE", poseEnd: "POINT", duration: 2.0 },
                    { number: 2, description: "Lin Yue snaps into the duel under the two moons", shotType: "MEDIUM", movement: "DOLLY_IN", poseStart: "STANCE", poseEnd: "LUNGE", duration: 2.0 },
                    { number: 3, description: "the empty terrace after the storm", shotType: "WIDE", movement: "PAN", duration: 1.6 },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
  include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
});
const shots = proj.seasons[0].episodes[0].scenes[0].shots.sort((a, b) => a.number - b.number);
console.log(`fixture project ${proj.id}, ${shots.length} shots`);

// 1) universe facts (the production's canon rules)
const facts = [
  { text: "Lin Yue's blade emits a cyan glow whenever spirit energy channels through it", category: "PROP" },
  { text: "The Cloud Terrace arena sits under two moons in the night sky", category: "LOCATION" },
  { text: "Spirit energy in this world appears as golden particles drifting upward", category: "RULE" },
];
for (const f of facts) {
  await db.universeFact.create({ data: { projectId: proj.id, text: f.text, category: f.category, source: "BIBLE" } });
}
console.log(`facts: ${facts.length}`);

// 2) panel art for shot 1
const art = await api<{ artworkUrl?: string; error?: string }>("/api/panel-art", {
  method: "POST",
  body: JSON.stringify({ shotId: shots[0].id, format: "MANHUA" }),
});
if (!art.artworkUrl) throw new Error(`panel art failed: ${art.error}`);
console.log("panel art ready");

// 3) a manufactured confident violation so the re-render queue has a
//    ranked row from the first paint (a real check replaces it)
await db.continuityEvent.create({
  data: {
    projectId: proj.id,
    entityType: "UNIVERSE_FACT",
    entityName: "The Cloud Terrace arena sits under two moons in the night sky",
    kind: "FACT_BROKEN",
    episodeNumber: 1,
    description: `[universe ${shots[0].id}] (E1 Sc1 S001) confidence 0.78 - only one moon is visible in the panel sky`,
    severity: "WARNING",
  },
});
console.log("queue row ready");

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
