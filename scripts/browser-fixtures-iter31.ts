// Browser fixtures for Iteration 31 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter31" exercising
//       all three features: shot 1 is a SPEAKING CLOSEUP (SPEECH
//       dialogue + CLOSEUP framing) so its queue card carries the
//       lip-sync stage note and plays a clip; the universe panel gets
//       TWO facts, a manufactured confident FACT_BROKEN row (the
//       re-render queue ranks it) and a finished supervised run with
//       FIXED + STILL_BROKEN steps so the runner section shows its
//       step log from the first paint.
// clean: deletes the fixture production (cascades jobs/events/facts/
//        repaint runs) and unlinks every artifact it produced.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const TITLE = "E2E Browser Iter31";
const SNAPSHOT = path.join("/tmp", ".iter31-fixture-files.json");

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

const dialogueLin = JSON.stringify([{ speaker: "Lin Yue", text: "The blade remembers every promise we made", kind: "SPEECH" }]);

const proj = await db.project.create({
  data: {
    title: TITLE,
    logline: "browser fixture: supervised re-paint runner + fact-aware prompts + lip-sync closeups",
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
                    { number: 1, description: "Lin Yue speaks quietly at the terrace edge, blade in hand", shotType: "CLOSEUP", movement: "STATIC", poseStart: "STANCE", poseEnd: "STANCE", duration: 2.0, dialogue: dialogueLin },
                    { number: 2, description: "Chen Hao answers from the far end of the terrace", shotType: "MEDIUM", movement: "DOLLY_IN", duration: 2.0 },
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
];
for (const f of facts) {
  await db.universeFact.create({ data: { projectId: proj.id, text: f.text, category: f.category, source: "BIBLE" } });
}
console.log(`facts: ${facts.length}`);

// 2) real panel art for the speaking closeup
const art = await api<{ artworkUrl?: string; error?: string }>(`/api/panel-art`, {
  method: "POST",
  body: JSON.stringify({ shotId: shots[0].id, format: "MANHUA" }),
});
if (!art.artworkUrl) throw new Error(`panel art failed: ${art.error}`);
console.log("panel art ready");

// 3) a manufactured confident violation so the re-render queue has a
//    ranked row from the first paint
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

// 4) a finished supervised run with a FIXED + a STILL_BROKEN step so
//    the runner section shows its step log from the first paint
await db.repaintRun.create({
  data: {
    projectId: proj.id,
    status: "DONE",
    cap: 2,
    index: 2,
    steps: JSON.stringify([
      { shotId: shots[1].id, ref: "E1 Sc1 S002", factTexts: [facts[0].text], beforeWorst: 0.71, afterSummary: "the repainted panel holds every fact", afterBroken: 0, outcome: "FIXED", at: new Date(Date.now() - 90_000).toISOString() },
      { shotId: shots[0].id, ref: "E1 Sc1 S001", factTexts: [facts[1].text], beforeWorst: 0.78, afterSummary: "the sky reads dusk with a single moon", afterBroken: 1, outcome: "STILL_BROKEN", error: "78% The Cloud Terrace arena sits under two moons in the night sky: only one moon is visible", at: new Date(Date.now() - 40_000).toISOString() },
    ]),
  },
});
console.log("repaint run row ready");

// 5) render all three shots and wait for clips (shot 1's card carries
//    the lip-sync stage note: speaking closeup)
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
