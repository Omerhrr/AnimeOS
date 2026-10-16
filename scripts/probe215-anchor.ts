// PROBE 215 - THE ANCHOR PASS: the arm that LANDED (the sheet-anchor,
// S003 40 -> 75) generalizes to the two cells that missed.
//
// THE EVIDENCE: words keep losing what the image carries -
//   S001: the dye clause rode but the palette drifted at establishing scale
//     (teal/cyan vs deep emerald, palette 40); the weapon clause WORKED
//     (weapon 40 -> 60) and stays.
//   S006: the contrast clause FIXED the dyes (Lin palette 90 "color
//     blocking is accurate", Wei 95) but the faces softened in the busy
//     two-shot (face 50/60); the contrast clause stays.
// THE ANCHOR PASS changes ONLY the generation channel: the committed sheet
// PNGs ride as the edit channel's base images (S001: Lin's sheet; S006:
// Lin's AND Wei's sheets as the images ARRAY) - the dyes, silhouettes and
// face proportions ride the IMAGE. Same judge, same sizes, same featured
// worst, zero production writes.
//
// Run: DATABASE_URL=file:... npx tsx scripts/probe215-anchor.ts
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

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart215");

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

interface SheetDna {
  hairStyle?: string;
  hairColor?: string;
  robeColor?: string;
  robeAccent?: string;
  bootsColor?: string;
  skinTone?: string;
  weaponType?: string;
}

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

function contrastClause(dyeClauses: string[]): string | null {
  if (dyeClauses.length < 2) return null;
  return (
    "TWO SEPARATE CHARACTERS with DIFFERENT wardrobes in this frame - their garment colors MUST NOT mix, average, or swap: " +
    "one figure wears the deep teal-green robe, the OTHER figure wears the dark purple robe; " +
    "keep each character's dye exactly on their own body."
  );
}

function weaponClause(name: string, dna: SheetDna | null, shotNumber: number): string | null {
  if (!dna?.weaponType || dna.weaponType === "none") return null;
  if (shotNumber === 1) {
    return `${name}'s WEAPON LAW: the ${dna.weaponType} is SHEATHED at the hip in this shot, hilt visible, NO glow, NO energy emission - the blade only sings out in a later shot.`;
  }
  return null;
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

  const styleTokens = productionStyleTokens(prod);
  const negativeTail = productionNegativeTokens(prod);
  const factCanon = factCanonSection(prod.universeFacts, null);
  const zai = await ZAI.create();

  const dyeByChar = new Map<string, SheetDna | null>();
  const sheetByChar = new Map<string, string | null>();
  for (const c of prod.characters) {
    dyeByChar.set(c.name, c.sheetDna ? (JSON.parse(c.sheetDna) as SheetDna) : null);
    sheetByChar.set(c.name, c.sheetDna ? (JSON.parse(c.sheetDna) as { sheetUrl?: string }).sheetUrl ?? null : null);
  }

  const STYLE_PIN =
    "Anime cel-shading style with clean lineart, exactly matching a donghua character model sheet's art style; flat color fields with soft gradient shading, sharp facial features, NO photorealism, NO 3d render look, NO western comic style";

  const report: Array<Record<string, unknown>> = [];

  for (const shotNum of [1, 6]) {
    const shot = shots.find((s) => s.number === shotNum);
    if (!shot) continue;
    const ref = `S${String(shot.number).padStart(3, "0")}`;
    const cast = detectCast(prod.characters, shot.description);
    const castNames = cast.map((c) => c.name);
    const featured = castNames.filter((n) => !/clone/i.test(n));
    console.log(`\n=== ANCHOR ${ref} (${shot.shotType}) featured=[${featured}] ===`);

    const castLooks = cast
      .map((c) => {
        const look = castLook(c, scene.episode.number);
        return look ? `${c.name} (match established character design exactly): ${look}` : null;
      })
      .filter(Boolean)
      .join("\n");
    const dyeList = cast
      .map((c) => dyeClause(c.name, dyeByChar.get(c.name) ?? null))
      .filter(Boolean) as string[];
    const env = scene.environment;

    const anchorPrompt = [
      `Cinematic keyframe still from a high-budget Chinese donghua (xianxia) animated series, film-grade lighting, rich detail. ${STYLE_PIN}`,
      styleTokens,
      FRAMING_WORDS[String(shot.shotType ?? "MEDIUM").toUpperCase()] ?? "medium shot",
      shot.description,
      env ? `Setting: ${env.name}${env.description ? ` - ${env.description}` : ""}` : null,
      scene.timeOfDay ? `${scene.timeOfDay.toLowerCase()} lighting` : null,
      scene.weather ? `${scene.weather.toLowerCase()} weather` : null,
      shot.lighting ? `Lighting: ${shot.lighting}` : null,
      castLooks ? `Characters:\n${castLooks}` : null,
      dyeList.length ? `GARMENT DYES:\n${dyeList.join("\n")}` : null,
      contrastClause(dyeList),
      cast.map((c) => weaponClause(c.name, dyeByChar.get(c.name) ?? null, shot.number)).filter(Boolean).join(" "),
      factCanon,
      "dramatic composition, atmospheric depth, high quality, detailed",
      negativeTail,
      `Render the character(s) from the attached model sheet(s) EXACTLY as designed - same face, same facial proportions, same hairstyle, same outfit, same colors - placed into this keyframe scene.`,
    ].filter(Boolean).join(". ");
    fs.writeFileSync(path.join(OUT_DIR, `${ref}-anchor-prompt.txt`), anchorPrompt);

    // THE ANCHOR: the committed sheet PNG(s) as the edit channel's base
    const images: Array<{ url: string }> = [];
    for (const name of featured) {
      const sheetUrl = sheetByChar.get(name) ?? null;
      if (!sheetUrl) throw new Error(`no sheetUrl for ${name}`);
      const sheetPath = path.join(process.cwd(), "public", sheetUrl.split("?")[0]);
      images.push({ url: `data:image/png;base64,${fs.readFileSync(sheetPath).toString("base64")}` });
    }

    let base64: string | null = null;
    try {
      const res = (await zai.images.generations.edit({
        prompt: anchorPrompt,
        images,
        size: sizeFor(shot.shotType) as never,
      })) as { data?: Array<{ base64?: string }> };
      base64 = res.data?.[0]?.base64 ?? null;
    } catch (e) {
      console.log(`${ref}: GENERATION FAILED - ${e instanceof Error ? e.message : String(e)}`);
      report.push({ ref, error: `generation: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (!base64) { console.log(`${ref}: no image returned`); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${ref}-anchor-keyframe.png`), Buffer.from(base64, "base64"));
    const dataUrl = `data:image/png;base64,${base64}`;
    console.log(`${ref}: anchor keyframe generated (${images.length} sheet${images.length > 1 ? "s" : ""} anchored)`);

    const loaded = await loadIdentityShot(shot.id);
    if (!loaded) continue;
    const ctx = await prepareIdentityContext(loaded, { imageData: dataUrl, error: "" });
    if (!ctx.ok) { console.log(`${ref}: ctx FAILED - ${ctx.error}`); report.push({ ref, error: ctx.error }); continue; }
    const call = await rawIdentityCall(ctx, undefined);
    if (!call.ok) { console.log(`${ref}: judge FAILED - ${call.error}`); report.push({ ref, error: call.error }); continue; }
    const verdict = parseIdentityVerdict(call.raw, castNames);
    if (!verdict) { console.log(`${ref}: verdict UNPARSABLE`); report.push({ ref, error: "unparsable" }); continue; }
    const featuredEntries = verdict.entries.filter((e) => featured.includes(e.characterName));
    const worst = Math.min(...featuredEntries.map((e) => e.similarity));
    for (const e of verdict.entries) {
      const a = e.aspects;
      console.log(
        `  ${e.characterName}: ${Math.round(e.similarity * 100)}  [face ${Math.round((a.face ?? 0) * 100)} hair ${Math.round((a.hair ?? 0) * 100)} wardrobe ${Math.round((a.wardrobe ?? 0) * 100)} weapon ${Math.round((a.weapon ?? 0) * 100)} palette ${Math.round((a.palette ?? 0) * 100)} style ${Math.round((a.style ?? 0) * 100)}]`,
      );
      console.log(`    note: ${e.note.slice(0, 220)}`);
    }
    console.log(`  >>> ${ref} ANCHOR worst ${Math.round(worst * 100)} (arm pass: S001 65 / S006 60; floor 70)`);
    report.push({
      ref,
      shotType: shot.shotType,
      arm: "sheet-anchor",
      anchoredSheets: featured,
      featured,
      featuredWorst: Math.round(worst * 100),
      entries: verdict.entries.map((e) => ({
        characterName: e.characterName,
        similarity: Math.round(e.similarity * 100),
        aspects: Object.fromEntries(Object.entries(e.aspects).map(([k, v]) => [k, Math.round((v as number) * 100)])),
        note: e.note,
      })),
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, "anchor-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nanchor report -> ${OUT_DIR}/anchor-report.json (no production writes anywhere)`);
  await db.$disconnect();
}
main();
