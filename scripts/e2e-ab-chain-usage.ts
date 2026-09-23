// E2E Iteration 26: A/B CHAINING in the audition history (any two
// recorded reads compared back to back), the playable ARC CHIP inside
// the panel-inspector ENSEMBLE CLUSTERS (chip + merged queue), and
// PER-SCOPE TEMPLATE USAGE COUNTS.
// Steps:
//   plan - pure checks (no DB writes): pickChainSide pick/swap/unpick
//          semantics + clearChainSides, formatTemplateUsage readouts
//   tool - self-contained fixture (Ep13/Sc33, its own character +
//          states): a saved production template records usage on the
//          single apply (and NOT on a no-op re-apply), one use per
//          ensemble batch, the dialog's use endpoint increments and
//          404s unknown ids, the suggest registry line carries the
//          usage numbers, the history GET round trip serves the rows
//          an A/B chain needs (newest first); fixture removed, audition
//          files unlinked
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { clearChainSides, pickChainSide, swapChainSides } from "@/lib/comic/audition-chain";
import { formatTemplateUsage } from "@/lib/comic/arc-templates";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;

const BASE = process.env.BASE ?? "http://localhost:3000";
const step = process.argv[2] ?? "plan";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const FIXTURE_EPISODE = 13;
const FIXTURE_SCENE = 33;
const RIVAL = "E2E Rival Wei";
const LIN_STATE = "E2E Possessed (fixture)";
const RIVAL_STATE = "E2E Possessor (fixture)";
const TEMPLATE_NAME = "E2E chain shape";
const TEMPLATE_DESC = "a slow corruption crawl that swallows the speaker and never lets go";

const LIN_HEAD = "The mark spreads.";
const RIVAL_HEAD = "Feel it climb.";
const LIN_MID = "It is in my voice now.";
const RIVAL_MID = "Good.";

const FIXTURE_DIALOGUES: Record<number, string> = {
  1: `[{"speaker":"Lin Yue","text":"${LIN_HEAD}","kind":"SPEECH"}]`,
  2: `[{"speaker":"${RIVAL}","text":"${RIVAL_HEAD}","kind":"SPEECH"}]`,
  3: `[{"speaker":"Lin Yue","text":"${LIN_MID}","kind":"SPEECH"}]`,
  4: `[{"speaker":"${RIVAL}","text":"${RIVAL_MID}","kind":"SPEECH"}]`,
  5: `[{"speaker":"Lin Yue","text":"Say it back to me.","kind":"SPEECH"}]`,
  6: `[{"speaker":"${RIVAL}","text":"Yours now.","kind":"SPEECH"}]`,
};

async function ep7() {
  const ep = await db.episode.findFirst({
    where: { number: 7, season: { projectId } },
    include: { scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: { number: "asc" } } } } },
  });
  return ep;
}

async function ensureEpisodeFixture() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "A/B chain fixture (E2E)", status: "DRAFT" } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Corruption Crawl - chain fixture", status: "DRAFT" },
  });
  const shots: Record<number, { id: string }> = {};
  for (const n of [1, 2, 3, 4, 5, 6]) {
    shots[n] = await db.shot.create({
      data: { sceneId: scene.id, number: n, description: `Fixture shot ${n}`, shotType: "MEDIUM", dialogue: FIXTURE_DIALOGUES[n] },
    });
  }
  return { ep, scene, shots };
}

if (step === "plan") {
  // 1. pickChainSide: pick, unpick, swap-on-conflict
  let pair = pickChainSide({ aId: null, bId: null }, "r1", "A");
  check("chain: first pick lands on A alone", pair.aId === "r1" && pair.bId === null, JSON.stringify(pair));
  pair = pickChainSide(pair, "r2", "B");
  check("chain: second pick lands on B", pair.aId === "r1" && pair.bId === "r2", JSON.stringify(pair));
  const swapped = pickChainSide(pair, "r2", "A");
  check("chain: picking the B row as A swaps the slots", swapped.aId === "r2" && swapped.bId === "r1", JSON.stringify(swapped));
  const unpicked = pickChainSide(pair, "r1", "A");
  check("chain: re-picking a side unpicks it", unpicked.aId === null && unpicked.bId === "r2", JSON.stringify(unpicked));
  const bSwap = pickChainSide(pair, "r1", "B");
  check("chain: picking the A row as B swaps the other way", bSwap.aId === "r2" && bSwap.bId === "r1", JSON.stringify(bSwap));
  check("chain: swapChainSides flips the order", swapChainSides(pair).aId === "r2" && swapChainSides(pair).bId === "r1", JSON.stringify(swapChainSides(pair)));
  check("chain: clearChainSides clears one side", JSON.stringify(clearChainSides(pair, "A")) === JSON.stringify({ aId: null, bId: "r2" }), JSON.stringify(clearChainSides(pair, "A")));
  check("chain: clearChainSides clears the pair", clearChainSides(pair).aId === null && clearChainSides(pair).bId === null, "");

  // 2. formatTemplateUsage: the human per-scope readout
  check("usage: zero uses read as never applied", formatTemplateUsage(0, null) === "never applied", formatTemplateUsage(0, null));
  check("usage: NaN reads as never applied", formatTemplateUsage(Number.NaN, null) === "never applied", formatTemplateUsage(Number.NaN, null));
  const stamp = new Date(2026, 8, 24, 14, 5);
  check("usage: count without a date", formatTemplateUsage(3, null) === "used 3×", formatTemplateUsage(3, null));
  check("usage: count with a last-used stamp", formatTemplateUsage(3, stamp.toISOString()) === "used 3× · last 09-24 14:05", formatTemplateUsage(3, stamp.toISOString()));
  check("usage: singular count", formatTemplateUsage(1, stamp.toISOString()).startsWith("used 1×"), formatTemplateUsage(1, stamp.toISOString()));
}

if (step === "tool") {
  // fixture character + states (TEMPORARY @Ep9 so they never auto-apply)
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  const rival = await db.character.create({ data: { projectId, name: RIVAL, role: "rival (e2e fixture)" } });
  const lin = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true, name: true } });
  if (!lin) throw new Error("Lin Yue not found");
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  const linState = await db.characterState.create({ data: { characterId: lin.id, label: LIN_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi" } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  const rivalState = await db.characterState.create({ data: { characterId: rival.id, label: RIVAL_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi" } });

  const fixture = await ensureEpisodeFixture();
  const rangeArgs = { scope: "scene", episodeNumber: fixture.ep.number, sceneNumber: FIXTURE_SCENE };

  // 1. a saved production template starts at zero uses
  await db.arcTemplate.deleteMany({ where: { projectId, name: TEMPLATE_NAME } });
  const tpl = await db.arcTemplate.create({
    data: {
      projectId,
      scope: "PROJECT",
      name: TEMPLATE_NAME,
      description: TEMPLATE_DESC,
      segments: JSON.stringify([{ frac: 0.2, kind: "auto" }, { frac: 0.6, kind: "state" }, { frac: 0.2, kind: "auto" }]),
    },
  });
  const listRes = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  const list = (await listRes.json()) as Array<{ id: string; usageCount: number; lastUsedAt: string | null }>;
  const listed = list.find((r) => r.id === tpl.id);
  check("usage: GET returns the usage fields (0, never used)", listRes.status === 200 && listed?.usageCount === 0 && listed?.lastUsedAt === null, JSON.stringify(listed));

  // 2. single apply: the use is recorded in the result and in the DB
  const a1 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characterName: "Lin Yue",
    stateLabel: "Possessed",
    template: TEMPLATE_NAME,
  });
  check("usage: single apply is OK and names the shape", a1.status === "OK" && a1.result.includes(`"${TEMPLATE_NAME}" (production template)`), a1.result.slice(0, 260));
  check("usage: single apply records the use", a1.result.includes(`Use recorded: "${TEMPLATE_NAME}" is now at 1 apply on its scope`), a1.result.slice(0, 400));
  const afterSingle = await db.arcTemplate.findUnique({ where: { id: tpl.id } });
  check("usage: DB count is 1 with a lastUsedAt", afterSingle?.usageCount === 1 && afterSingle?.lastUsedAt !== null, `count=${afterSingle?.usageCount}`);

  // 3. no-op re-apply (same shape, same state): nothing stamped, NO use recorded
  const a2 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characterName: "Lin Yue",
    stateLabel: "Possessed",
    template: TEMPLATE_NAME,
  });
  check("usage: no-op re-apply stays silent about uses", a2.status === "OK" && !a2.result.includes("Use recorded") && a2.result.includes("already carry"), a2.result.slice(0, 260));
  const afterNoop = await db.arcTemplate.findUnique({ where: { id: tpl.id } });
  check("usage: no-op re-apply keeps the count at 1", afterNoop?.usageCount === 1, `count=${afterNoop?.usageCount}`);

  // 4. ensemble batch: ONE use for the whole batch (rows may skip on TTS 429 without failing the count)
  const a3 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue", stateLabel: "Possessed" }, { name: RIVAL, stateLabel: "Possessor" }],
    template: TEMPLATE_NAME,
  });
  check("usage: ensemble batch applies", a3.status === "OK" && a3.result.includes("Ensemble arc template"), a3.result.slice(0, 260));
  check("usage: ensemble batch records ONE use", a3.result.includes(`is now at 2 applies on its scope`), a3.result.slice(0, 400));
  const afterEnsemble = await db.arcTemplate.findUnique({ where: { id: tpl.id } });
  check("usage: DB count is 2 after the batch", afterEnsemble?.usageCount === 2, `count=${afterEnsemble?.usageCount}`);

  // 5. the suggest registry line carries the per-scope usage numbers
  const s1 = await executeTool(projectId, "suggest_arc_template", {
    ...rangeArgs,
    description: TEMPLATE_DESC,
  });
  check("usage: suggest registry line carries the usage", s1.status === "OK" && s1.result.includes(`used 2×`), s1.result.slice(s1.result.indexOf("Registry:") >= 0 ? s1.result.indexOf("Registry:") : 0).slice(0, 400));

  // 6. the dialog's use endpoint increments (and 404s unknown ids)
  const useRes = await fetch(`${BASE}/api/arc-templates/${tpl.id}/use`, { method: "POST" });
  const useBody = (await useRes.json()) as { usageCount?: number; error?: string };
  check("usage: POST /use increments to 3", useRes.status === 200 && useBody.usageCount === 3, JSON.stringify(useBody));
  const useMissing = await fetch(`${BASE}/api/arc-templates/nope/use`, { method: "POST" });
  check("usage: POST /use on an unknown id -> 404", useMissing.status === 404, String(useMissing.status));

  // 7. the history rows an A/B chain picks from: GET serves them newest first
  await db.stateAudition.createMany({
    data: [
      { stateId: linState.id, characterId: lin.id, projectId, url: "/auditions/e2e-chain-older.wav", text: "older read", source: "custom", voiceId: "kazi", deliveryId: "NEUTRAL", speed: 1, pitch: 1, createdAt: new Date(Date.now() - 120000) },
      { stateId: linState.id, characterId: lin.id, projectId, url: "/auditions/e2e-chain-newer.wav", text: "newer read", source: "custom", voiceId: "kazi", deliveryId: "EXCITED", speed: 1.1, pitch: 0.9, createdAt: new Date() },
    ],
  });
  const histRes = await fetch(`${BASE}/api/state-auditions?stateId=${linState.id}`);
  const hist = (await histRes.json()) as { auditions: Array<{ id: string; url: string }> };
  check("chain: history GET serves the pair newest first", histRes.status === 200 && hist.auditions.length >= 2 && hist.auditions[0].url === "/auditions/e2e-chain-newer.wav" && hist.auditions[1].url === "/auditions/e2e-chain-older.wav", `${hist.auditions.length} rows`);

  // 8. baseline: the real season is untouched
  const ep7row = await ep7();
  if (!ep7row) throw new Error("Ep7 not found");
  const baseline = await diffEpisodeById(ep7row.id);
  check("baseline: Ep7 exactly as it started", baseline !== null && baseline.fresh === 0 && baseline.stale === 0 && baseline.unrendered === 1, baseline ? `fresh=${baseline.fresh} stale=${baseline.stale} unrendered=${baseline.unrendered}` : "null");

  // cleanup: unlink audition files, remove fixture episode + character (cascades states + history rows) + template
  const files = await db.stateAudition.findMany({ where: { stateId: { in: [linState.id, rivalState.id] } }, select: { url: true } });
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  await db.arcTemplate.deleteMany({ where: { projectId, name: TEMPLATE_NAME } });
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  for (const f of files) {
    if (f.url.startsWith("/auditions/")) await unlink(path.join(process.cwd(), "public", f.url)).catch(() => {});
  }
  console.log(`cleanup done (${files.length} audition file(s) unlinked)`);
}

if (step === "cleanup") {
  // idempotent leftovers sweep (safe to run after a crashed tool step)
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  await db.arcTemplate.deleteMany({ where: { projectId, name: TEMPLATE_NAME } });
  const rival = await db.character.findFirst({ where: { projectId, name: RIVAL } });
  if (rival) {
    await db.character.delete({ where: { id: rival.id } });
  }
  console.log("leftover sweep done");
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
} else {
  console.log("\nALL PASS");
}
