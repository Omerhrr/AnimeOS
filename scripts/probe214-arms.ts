// PROBE 214 - THE ARMS: DYE-LAW + STYLE-PIN (the 213 probe's paired arm).
//
// The 213 probe validated the AI-art lever at the plateau cells (S002 90 /
// S005 85 vs Blender medians 55) and named two seams:
//   1. S004's wardrobe dyes LOST (tattered black coat vs the sheet's purple
//      + gold) - the 129 law's own answer: the sheet's MEASURED dyes ride
//      the prompt as EXPLICIT color law.
//   2. The style grammar drifted between cells (S002 cel vs S005
//      semi-realistic) - one episode, one grammar: the style pin.
// THE PAIRED DISCIPLINE: same three cells, same generation sizes, same
// scoring path (the REAL judge, the REAL sheets), the ONLY changes are
// (1) the dye clause built from each member's committed sheetDna hexes,
// (2) the style-pin clause. worst computed over FEATURED cast (no clone
// ghost - the 140 law's precondition, honored read-only).
//
// Run: DATABASE_URL=file:... npx tsx scripts/probe214-arms.ts
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

const PROBE_SHOTS = [2, 4, 5];
const OUT_DIR = path.join(process.cwd(), "inspect", "aiart214");

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

interface SheetDna {
  hairStyle?: string;
  hairColor?: string;
  robeColor?: string;
  robeAccent?: string;
  bootsColor?: string;
  skinTone?: string;
  weaponType?: string;
}

/** THE DYE CLAUSE (the 129 law's shape, keyframe edition): the sheet's
 * own measured hexes ride as BINDING color law, stated after the look
 * tokens so the character's measured dyes override every style default. */
function dyeClause(name: string, dna: SheetDna | null): string | null {
  if (!dna?.robeColor) return null;
  const bits = [
    `${name}'s COLOR LAW (binding, overrides every default palette):`,
    `robe exactly ${dna.robeColor}`,
    dna.robeAccent ? `with ${dna.robeAccent} trim/accents` : null,
    dna.hairColor ? `hair exactly ${dna.hairColor}` : null,
    dna.hairStyle ? `in a ${dna.hairStyle}` : null,
    dna.bootsColor ? `boots ${dna.bootsColor}` : null,
    dna.skinTone ? `skin ${dna.skinTone}` : null,
    `do NOT change this character's garment color or silhouette`,
  ];
  return bits.filter(Boolean).join(" ");
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
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });

  const lines = fs
    .readFileSync("receipts/identity-arc.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const styleTokens = productionStyleTokens(prod);
  const negativeTail = productionNegativeTokens(prod);
  const factCanon = factCanonSection(prod.universeFacts, null);
  const zai = await ZAI.create();

  // the dye source: each member's committed sheetDna (the measured hexes)
  const dyeByChar = new Map<string, SheetDna | null>();
  for (const c of prod.characters) {
    dyeByChar.set(c.name, c.sheetDna ? (JSON.parse(c.sheetDna) as SheetDna) : null);
  }

  // the STYLE PIN: one grammar for the whole episode
  const STYLE_PIN =
    "Anime cel-shading style with clean lineart, exactly matching a donghua character model sheet's art style; flat color fields with soft gradient shading, sharp facial features, NO photorealism, NO 3d render look, NO western comic style";

  const report: Array<Record<string, unknown>> = [];

  for (const shotNum of PROBE_SHOTS) {
    const shot = shots.find((s) => s.number === shotNum);
    if (!shot) continue;
    const ref = `S${String(shot.number).padStart(3, "0")}`;
    const cast = detectCast(prod.characters, shot.description);
    const castNames = cast.map((c) => c.name);
    const featured = castNames.filter((n) => !/clone/i.test(n));

    const shotLines = lines.filter(
      (l) => l.ref?.episode === 7 && l.ref?.scene === 12 && l.ref?.shot === shot.number,
    );
    const allSims = shotLines.flatMap((l) => l.scores.map((s: { similarity: number }) => s.similarity));
    console.log(`\n=== ${ref} (${shot.shotType}) cast=[${castNames}] featured=[${featured}] ===`);
    console.log(`committed median ${Math.round(median(allSims) * 100)} over ${allSims.length} readings`);

    const castLooks = cast
      .map((c) => {
        const look = castLook(c, scene.episode.number);
        return look ? `${c.name} (match established character design exactly): ${look}` : null;
      })
      .filter(Boolean)
      .join("\n");
    const dyes = cast
      .map((c) => dyeClause(c.name, dyeByChar.get(c.name) ?? null))
      .filter(Boolean)
      .join("\n");
    const env = scene.environment;
    const promptParts = [
      `Cinematic keyframe still from a high-budget Chinese donghua (xianxia) animated series, film-grade lighting, rich detail. ${STYLE_PIN}`,
      styleTokens,
      FRAMING_WORDS[String(shot.shotType ?? "MEDIUM").toUpperCase()] ?? "medium shot",
      shot.description,
      env ? `Setting: ${env.name}${env.description ? ` - ${env.description}` : ""}` : null,
      scene.timeOfDay ? `${scene.timeOfDay.toLowerCase()} lighting` : null,
      scene.weather ? `${scene.weather.toLowerCase()} weather` : null,
      shot.lighting ? `Lighting: ${shot.lighting}` : null,
      castLooks ? `Characters:\n${castLooks}` : null,
      dyes ? `GARMENT DYES:\n${dyes}` : null,
      factCanon,
      "dramatic composition, atmospheric depth, high quality, detailed",
      negativeTail,
    ];
    const prompt = promptParts.filter(Boolean).join(". ");
    fs.writeFileSync(path.join(OUT_DIR, `${ref}-prompt.txt`), prompt);

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
    if (!base64) { console.log(`${ref}: no image returned`); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${ref}-keyframe.png`), Buffer.from(base64, "base64"));
    const dataUrl = `data:image/png;base64,${base64}`;
    console.log(`${ref}: keyframe generated`);

    const loaded = await loadIdentityShot(shot.id);
    if (!loaded) continue;
    const ctx = await prepareIdentityContext(loaded, { imageData: dataUrl, error: "" });
    if (!ctx.ok) { console.log(`${ref}: ctx FAILED - ${ctx.error}`); report.push({ ref, error: ctx.error }); continue; }
    const call = await rawIdentityCall(ctx, undefined);
    if (!call.ok) { console.log(`${ref}: judge FAILED - ${call.error}`); report.push({ ref, error: call.error }); continue; }
    const verdict = parseIdentityVerdict(call.raw, castNames);
    if (!verdict) {
      console.log(`${ref}: verdict UNPARSABLE`);
      fs.writeFileSync(path.join(OUT_DIR, `${ref}-raw.txt`), call.raw);
      report.push({ ref, error: "unparsable verdict" });
      continue;
    }
    const featuredEntries = verdict.entries.filter((e) => featured.includes(e.characterName));
    const featuredWorst = Math.min(...featuredEntries.map((e) => e.similarity));
    for (const e of verdict.entries) {
      const a = e.aspects;
      console.log(
        `  AI-KEYFRAME ${e.characterName}: ${Math.round(e.similarity * 100)}  [face ${Math.round((a.face ?? 0) * 100)} hair ${Math.round((a.hair ?? 0) * 100)} wardrobe ${Math.round((a.wardrobe ?? 0) * 100)} weapon ${Math.round((a.weapon ?? 0) * 100)} palette ${Math.round((a.palette ?? 0) * 100)} style ${Math.round((a.style ?? 0) * 100)}]`,
      );
      console.log(`    note: ${e.note.slice(0, 220)}`);
    }
    console.log(`  >>> ${ref} FEATURED worst ${Math.round(featuredWorst * 100)} (213 arm: S002 90 / S004 30 / S005 85)`);
    report.push({
      ref,
      shotType: shot.shotType,
      featured,
      featuredWorst: Math.round(featuredWorst * 100),
      entries: verdict.entries.map((e) => ({
        characterName: e.characterName,
        similarity: Math.round(e.similarity * 100),
        aspects: Object.fromEntries(Object.entries(e.aspects).map(([k, v]) => [k, Math.round((v as number) * 100)])),
        note: e.note,
      })),
      note: verdict.note,
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nreport -> ${OUT_DIR}/report.json (no production writes anywhere)`);
  await db.$disconnect();
}
main();
