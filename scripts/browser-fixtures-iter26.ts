// Browser fixtures for Iteration 26 UI verification (seed | clean).
// seed: Ep14 fixture whose ensemble beat (Lin Yue + Rival Wei sharing
//       ONE arcBatch) carries REAL wav-backed VOICE cues so the panel
//       inspector's cluster chip has takes to queue; two audition-
//       history rows on the REAL Battle-damaged state (existing wavs)
//       for the A/B chain; a production + studio "browser fork" pair
//       where the production row carries usageCount 3.
// clean: removes all of it. The real season is never modified.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;

const EP = 14;
const SC = 34;
const BD = "Battle-damaged (temple fight)";
const TEMPLATE_NAME = "browser fork";
const HIST_TEXTS = ["The Jade Sword still answers my call.", "I cannot hold it much longer."];

async function twoExistingWavs(): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", "auditions");
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".wav")).sort();
    if (files.length >= 2) return [path.join("/auditions", files[0]), path.join("/auditions", files[1])];
    if (files.length === 1) return [path.join("/auditions", files[0]), path.join("/auditions", files[0])];
  } catch {
    // fall through
  }
  return ["/auditions/variant-cmueba65e0001us5e03fxc47h.wav", "/auditions/variant-cmud0e29s000mm0updcpjgz47.wav"];
}

if (process.argv[2] === "clean") {
  await db.episode.deleteMany({ where: { number: EP, season: { projectId } } });
  const tmpl = await db.arcTemplate.deleteMany({ where: { name: TEMPLATE_NAME, OR: [{ projectId }, { projectId: null }] } });
  // history rows are identified by their seeded texts (and existing audition wavs)
  const rows = await db.stateAudition.findMany({ where: { state: { label: BD, character: { projectId } } }, select: { id: true, text: true } });
  let hist = 0;
  for (const row of rows) {
    if (HIST_TEXTS.includes(row.text)) {
      await db.stateAudition.delete({ where: { id: row.id } });
      hist += 1;
    }
  }
  console.log(`cleaned: ${tmpl.count} template(s), ${hist} history row(s), episode ${EP}`);
} else {
  const wavs = await twoExistingWavs();

  // ── fixture episode: a shared arcBatch makes Lin + Rival ONE parallel beat ──
  await db.episode.deleteMany({ where: { number: EP, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: EP, title: "Cluster chip browser fixture", status: "DRAFT" } });
  const scene = await db.scene.create({ data: { episodeId: ep.id, number: SC, title: "Twin beat check", status: "DRAFT" } });

  const shot1 = await db.shot.create({
    data: {
      sceneId: scene.id, number: 1, description: "Cluster fixture shot 1", shotType: "CLOSEUP",
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The seal cracks from the inside.", kind: "SPEECH", state: BD, arcBatch: "bfix-1" }]),
    },
  });
  await db.audioCue.create({
    data: { shotId: shot1.id, kind: "VOICE", label: "Lin Yue: The seal cracks from the inside.", voiceUrl: wavs[0], voiceActor: "kazi", voiceDurationMs: 6120, voiceStateLabel: BD },
  });
  const shot2 = await db.shot.create({
    data: {
      sceneId: scene.id, number: 2, description: "Cluster fixture shot 2 (both speakers)", shotType: "MEDIUM",
      dialogue: JSON.stringify([
        { speaker: "Lin Yue", text: "It is in my voice now.", kind: "SPEECH", state: BD, arcBatch: "bfix-1" },
        { speaker: "Rival Wei", text: "Then let it speak.", kind: "SPEECH", state: "Possessor", arcBatch: "bfix-1" },
      ]),
    },
  });
  await db.audioCue.create({
    data: { shotId: shot2.id, kind: "VOICE", label: "Rival Wei: Then let it speak.", voiceUrl: wavs[1], voiceActor: "jam", voiceDurationMs: 5200, voiceStateLabel: "Possessor" },
  });
  await db.shot.create({
    data: {
      sceneId: scene.id, number: 3, description: "Cluster fixture shot 3", shotType: "MEDIUM",
      dialogue: JSON.stringify([{ speaker: "Rival Wei", text: "Say it back to me.", kind: "SPEECH", state: "Possessor", arcBatch: "bfix-1" }]),
    },
  });

  // ── audition history rows on the REAL state, backed by existing wavs ──
  const state = await db.characterState.findFirst({ where: { label: BD, character: { projectId } } });
  if (!state) throw new Error("Battle-damaged state not found");
  await db.stateAudition.create({
    data: {
      stateId: state.id, characterId: state.characterId, projectId,
      url: wavs[0], text: HIST_TEXTS[0], source: "character line",
      voiceId: "kazi", deliveryId: "INJURED", speed: 0.74, pitch: 0.75, durationMs: 6052,
      createdAt: new Date(Date.now() - 90000),
    },
  });
  await db.stateAudition.create({
    data: {
      stateId: state.id, characterId: state.characterId, projectId,
      url: wavs[1], text: HIST_TEXTS[1], source: "character line",
      voiceId: "jam", deliveryId: "INJURED", speed: 0.9, pitch: 0.75, durationMs: 5200,
    },
  });

  // ── template pair: the production fork carries a usage count ──
  await db.arcTemplate.deleteMany({ where: { name: TEMPLATE_NAME, OR: [{ projectId }, { projectId: null }] } });
  await db.arcTemplate.create({
    data: {
      projectId, scope: "PROJECT", name: TEMPLATE_NAME,
      description: "The production's own fork of the beat",
      segments: JSON.stringify([{ frac: 0.2, kind: "auto" }, { frac: 0.6, kind: "state" }, { frac: 0.2, kind: "auto" }]),
      usageCount: 3,
      lastUsedAt: new Date(),
    },
  });
  await db.arcTemplate.create({
    data: {
      projectId: null, scope: "STUDIO", name: TEMPLATE_NAME,
      description: "The studio original every show starts from",
      segments: JSON.stringify([{ frac: 0.25, kind: "auto" }, { frac: 0.5, kind: "state" }, { frac: 0.25, kind: "auto" }]),
    },
  });

  console.log(`seeded: episode ${ep.id} (ensemble beat + cues) + 2 history rows + template pair (fork used 3×)`);
}
await db.$disconnect();
