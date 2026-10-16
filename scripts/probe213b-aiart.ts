// PROBE 213 - THE AI-ART LEVER (read-only on production, the eye before the hand).
//
// The question the roster names: the procedural build asymptotes at
// "good stylized mannequin" (the 211 style-gap finding: 'simplified',
// 'lacks the intricate gold embroidery' - the judge's own words, five
// nights of p10 35-48 vs the 70 floor). The lever candidate: AI
// keyframes generated FROM THE PRODUCTION'S OWN ANCHORS (the same
// style tokens, the same cast looks, the same scene canon the panel
// channel rides) - judged by the SAME identity instrument against the
// SAME committed sheets. The probe does NOT install anything: no
// artworkUrl writes, no IdentityScore rows, no arc appends (the 113
// law: no re-rolling measured assets; the anti-fabrication law: lab
// scopes write only their own report).
//
// For each probe cell (S002 the style-gap lever, S004 the Wei wide,
// S005 the weapon cell): compose the production-grade prompt ->
// image-gen -> score through rawIdentityCall (the REAL judge, the
// REAL sheets) -> parse -> report beside the committed per-shot
// medians from the durable ledger.
//
// Run: DATABASE_URL=file:... npx tsx scripts/probe213b-aiart.ts
import { db } from "../src/lib/db";
import {
  loadIdentityShot,
  prepareIdentityContext,
  rawIdentityCall,
  parseIdentityVerdict,
} from "../src/lib/identity";
import {
  detectCast,
  castLook,
  productionStyleTokens,
  productionNegativeTokens,
  factCanonSection,
} from "../src/lib/ai/art";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const PROBE_SHOTS = [2, 4, 5]; // S002 / S004 / S005 by scene-12 shot number
const OUT_DIR = path.join(process.cwd(), "inspect", "aiart213");

const FRAMING_WORDS: Record<string, string> = {
  ESTABLISHING: "extreme long establishing shot, epic sense of scale",
  WIDE: "wide shot",
  MEDIUM: "medium shot, waist-up",
  CLOSEUP: "close-up on the face",
  LOW_ANGLE: "low angle hero shot",
};

function sizeFor(shotType: string | null): string {
  return shotType === "CLOSEUP" ? "1152x864" : "1344x768";
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prod = await db.project.findFirst({
    where: { title: "Immortal Path" },
    include: {
      characters: { include: { states: true } },
      universeFacts: { where: { active: true } },
    },
  });
  if (!prod) throw new Error("Immortal Path missing");

  const scene = await db.scene.findFirst({
    where: { number: 12, episode: { number: 7 } },
    include: { environment: true, episode: true },
  });
  if (!scene) throw new Error("E7 Sc12 missing");
  const shots = await db.shot.findMany({
    where: { sceneId: scene.id },
    orderBy: { number: "asc" },
  });

  // ── committed baseline from the durable ledger ──
  const lines = fs
    .readFileSync("receipts/identity-arc.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const styleTokens = productionStyleTokens(prod);
  const negativeTail = productionNegativeTokens(prod);
  const factCanon = factCanonSection(prod.universeFacts, null);
  const zai = await ZAI.create();

  const report: Array<Record<string, unknown>> = [];

  for (const shotNum of PROBE_SHOTS) {
    const shot = shots.find((s) => s.number === shotNum);
    if (!shot) { console.log(`S00${shotNum}: missing`); continue; }
    const ref = `S${String(shot.number).padStart(3, "0")}`;
    const cast = detectCast(prod.characters, shot.description);
    const castNames = cast.map((c) => c.name);

    // ── the committed per-shot median across ALL nights ──
    const shotLines = lines.filter(
      (l) => l.ref?.episode === 7 && l.ref?.scene === 12 && l.ref?.shot === shot.number,
    );
    const allSims = shotLines.flatMap((l) => l.scores.map((s: { similarity: number }) => s.similarity));
    const committedMedian = median(allSims);
    console.log(`\n=== ${ref} (${shot.shotType}) cast=[${castNames}] ===`);
    console.log(
      `committed: ${shotLines.length} readings, median ${Math.round(committedMedian * 100)}  series=[${shotLines.map((l: { night: string; scores: Array<{ similarity: number }> }) => `${l.night.slice(-4)}:${l.scores.map((s: { similarity: number }) => Math.round(s.similarity * 100)).join("/")}`).join(", ")}]`,
    );

    // ── compose the prompt from the production's own anchors ──
    const castLooks = cast
      .map((c) => {
        const look = castLook(c, scene.episode.number);
        return look ? `${c.name} (match established character design exactly): ${look}` : null;
      })
      .filter(Boolean)
      .join("\n");
    const env = scene.environment;
    const promptParts = [
      "Cinematic keyframe still from a high-budget Chinese donghua (xianxia) animated series, film-grade lighting, rich detail, painterly rendering",
      styleTokens,
      FRAMING_WORDS[String(shot.shotType ?? "MEDIUM").toUpperCase()] ?? "medium shot",
      shot.description,
      env ? `Setting: ${env.name}${env.description ? ` - ${env.description}` : ""}` : null,
      scene.timeOfDay ? `${scene.timeOfDay.toLowerCase()} lighting` : null,
      scene.weather ? `${scene.weather.toLowerCase()} weather` : null,
      shot.lighting ? `Lighting: ${shot.lighting}` : null,
      castLooks ? `Characters:\n${castLooks}` : null,
      factCanon,
      "dramatic composition, atmospheric depth, high quality, detailed",
      negativeTail,
    ];
    const prompt = promptParts.filter(Boolean).join(". ");
    fs.writeFileSync(path.join(OUT_DIR, `${ref}-prompt.txt`), prompt);

    // ── generate ──
    let base64: string | null = null;
    try {
      const res = (await zai.images.generations.create({
        prompt,
        size: sizeFor(shot.shotType) as never,
      })) as { data?: Array<{ base64?: string }> };
      base64 = res.data?.[0]?.base64 ?? null;
    } catch (e) {
      console.log(`${ref}: GENERATION FAILED - ${e instanceof Error ? e.message : String(e)}`);
      report.push({ ref, error: `generation: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (!base64) { console.log(`${ref}: generation returned no image`); continue; }
    const pngPath = path.join(OUT_DIR, `${ref}-keyframe.png`);
    fs.writeFileSync(pngPath, Buffer.from(base64, "base64"));
    const dataUrl = `data:image/png;base64,${base64}`;
    console.log(`${ref}: keyframe generated (${Math.round(base64.length * 0.75 / 1024)}KB) -> ${pngPath}`);

    // ── score through the REAL judge (no persist anywhere) ──
    const loaded = await loadIdentityShot(shot.id);
    if (!loaded) { console.log(`${ref}: shot load failed`); continue; }
    const ctx = await prepareIdentityContext(loaded, { imageData: dataUrl, error: "" });
    if (!ctx.ok) { console.log(`${ref}: ctx FAILED - ${ctx.error}`); report.push({ ref, error: ctx.error }); continue; }
    const call = await rawIdentityCall(ctx, undefined);
    if (!call.ok) { console.log(`${ref}: judge FAILED - ${call.error}`); report.push({ ref, error: call.error }); continue; }
    const verdict = parseIdentityVerdict(call.raw, castNames);
    if (!verdict) {
      console.log(`${ref}: verdict UNPARSABLE — raw head: ${call.raw.slice(0, 200)}`);
      fs.writeFileSync(path.join(OUT_DIR, `${ref}-raw.txt`), call.raw);
      report.push({ ref, error: "unparsable verdict", raw: call.raw.slice(0, 500) });
      continue;
    }
    for (const e of verdict.entries) {
      const a = e.aspects;
      console.log(
        `  AI-KEYFRAME ${e.characterName}: similarity ${Math.round(e.similarity * 100)}  [face ${Math.round((a.face ?? 0) * 100)} hair ${Math.round((a.hair ?? 0) * 100)} wardrobe ${Math.round((a.wardrobe ?? 0) * 100)} weapon ${Math.round((a.weapon ?? 0) * 100)} palette ${Math.round((a.palette ?? 0) * 100)} style ${Math.round((a.style ?? 0) * 100)}]`,
      );
      console.log(`    note: ${e.note.slice(0, 220)}`);
    }
    console.log(
      `  >>> ${ref} AI-keyframe worst ${Math.round(verdict.worst * 100)} vs committed median ${Math.round(committedMedian * 100)}`,
    );
    report.push({
      ref,
      shotType: shot.shotType,
      castNames,
      committedMedian: Math.round(committedMedian * 100),
      committedReadings: shotLines.length,
      aiKeyframe: {
        worst: Math.round(verdict.worst * 100),
        entries: verdict.entries.map((e) => ({
          characterName: e.characterName,
          similarity: Math.round(e.similarity * 100),
          aspects: Object.fromEntries(Object.entries(e.aspects).map(([k, v]) => [k, Math.round((v as number) * 100)])),
          note: e.note,
        })),
        note: verdict.note,
      },
      promptFile: `${ref}-prompt.txt`,
      pngFile: `${ref}-keyframe.png`,
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nreport -> ${path.join(OUT_DIR, "report.json")} (no production writes anywhere)`);
  await db.$disconnect();
}
main();
