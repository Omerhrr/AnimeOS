// PROBE 215 - THE PAIRED ARM: the three seams the first pass named, each
// cell changed ONLY by its own named fix (the 214 paired discipline):
//   S001 (60): WEAPON-FIDELITY clause - the sheet says sword; the judge read
//     a glowing energy blade (weapon 40). The shot's own language gives the
//     sheathed walk; the S005 draw beat owns the azure emission. The clause:
//     the jade sword SHEATHED, no glow.
//   S003 (40): THE SHEET-ANCHOR ARM - the 213 frontier's named arm, first
//     ride: the committed sheet itself as the generation's base image through
//     the edit channel, the face proportions and grammar riding the IMAGE,
//     not the words (the text style pin held at medium but lost at closeup
//     granularity: face 20 / style 10).
//   S006 (65): CONTRAST DYE LAW - in the two-shot the dye law held for Wei
//     (85) and LOST for Lin (pale cyan vs deep green #2a5c52). The clause
//     names the two figures as SEPARATE wardrobes that must not mix.
// Same judge (the REAL instrument, the REAL committed sheets), same sizes,
// same featured-cast worst, zero production writes.
//
// Run: DATABASE_URL=file:... npx tsx scripts/probe215-arms.ts
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

/** THE CONTRAST CLAUSE (the S006 seam's fix): in a multi-figure frame the
 * generator averages or swaps garment dyes; the clause names the split. */
function contrastClause(dyeClauses: string[]): string | null {
  if (dyeClauses.length < 2) return null;
  return (
    "TWO SEPARATE CHARACTERS with DIFFERENT wardrobes in this frame - their garment colors MUST NOT mix, average, or swap: " +
    "one figure wears the deep teal-green robe, the OTHER figure wears the dark purple robe; " +
    "keep each character's dye exactly on their own body."
  );
}

/** THE WEAPON CLAUSE (the S001 seam's fix): the sheet is the weapon's law;
 * the shot's beat decides drawn or sheathed, glowing or dark. */
function weaponClause(name: string, dna: SheetDna | null, shotNumber: number): string | null {
  if (!dna?.weaponType || dna.weaponType === "none") return null;
  if (shotNumber === 1) {
    return `${name}'s WEAPON LAW: the ${dna.weaponType} is SHEATHED at the hip in this shot, hilt visible, NO glow, NO energy emission - the blade only sings out in a later shot.`;
  }
  return null;
}

async function judge(
  shotId: string,
  dataUrl: string,
  castNames: string[],
  featured: string[],
): Promise<{ worst: number; entries: Array<Record<string, unknown>> } | null> {
  const loaded = await loadIdentityShot(shotId);
  if (!loaded) return null;
  const ctx = await prepareIdentityContext(loaded, { imageData: dataUrl, error: "" });
  if (!ctx.ok) { console.log(`  ctx FAILED - ${ctx.error}`); return null; }
  const call = await rawIdentityCall(ctx, undefined);
  if (!call.ok) { console.log(`  judge FAILED - ${call.error}`); return null; }
  const verdict = parseIdentityVerdict(call.raw, castNames);
  if (!verdict) { console.log("  verdict UNPARSABLE"); return null; }
  const featuredEntries = verdict.entries.filter((e) => featured.includes(e.characterName));
  const worst = Math.min(...featuredEntries.map((e) => e.similarity));
  for (const e of verdict.entries) {
    const a = e.aspects;
    console.log(
      `  ${e.characterName}: ${Math.round(e.similarity * 100)}  [face ${Math.round((a.face ?? 0) * 100)} hair ${Math.round((a.hair ?? 0) * 100)} wardrobe ${Math.round((a.wardrobe ?? 0) * 100)} weapon ${Math.round((a.weapon ?? 0) * 100)} palette ${Math.round((a.palette ?? 0) * 100)} style ${Math.round((a.style ?? 0) * 100)}]`,
    );
    console.log(`    note: ${e.note.slice(0, 220)}`);
  }
  return {
    worst,
    entries: verdict.entries.map((e) => ({
      characterName: e.characterName,
      similarity: Math.round(e.similarity * 100),
      aspects: Object.fromEntries(Object.entries(e.aspects).map(([k, v]) => [k, Math.round((v as number) * 100)])),
      note: e.note,
    })),
  };
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

  for (const shotNum of [1, 3, 6]) {
    const shot = shots.find((s) => s.number === shotNum);
    if (!shot) continue;
    const ref = `S${String(shot.number).padStart(3, "0")}`;
    const cast = detectCast(prod.characters, shot.description);
    const castNames = cast.map((c) => c.name);
    const featured = castNames.filter((n) => !/clone/i.test(n));
    console.log(`\n=== ARM ${ref} (${shot.shotType}) featured=[${featured}] ===`);

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

    const armParts = [
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
    ];
    const armPrompt = armParts.filter(Boolean).join(". ");
    fs.writeFileSync(path.join(OUT_DIR, `${ref}-arm-prompt.txt`), armPrompt);

    let base64: string | null = null;
    try {
      if (shotNum === 3) {
        // THE SHEET-ANCHOR ARM: Lin's committed sheet rides as the base
        // IMAGE; the scene language is the edit instruction. The face
        // proportions and grammar ride the image, not the words.
        const sheetUrl = sheetByChar.get(featured[0] ?? "") ?? null;
        if (!sheetUrl) throw new Error("no sheetUrl for anchor");
        const sheetPath = path.join(process.cwd(), "public", sheetUrl.split("?")[0]);
        const dataUrlSheet = `data:image/png;base64,${fs.readFileSync(sheetPath).toString("base64")}`;
        const anchorPrompt =
          `Render this EXACT character - same face, same hairstyle, same facial proportions, same outfit, same colors, same art style as the reference model sheet - in the following keyframe: ${armPrompt}`;
        const res = (await zai.images.generations.edit({
          prompt: anchorPrompt,
          images: [{ url: dataUrlSheet }],
          size: sizeFor(shot.shotType) as never,
        })) as { data?: Array<{ base64?: string }> };
        base64 = res.data?.[0]?.base64 ?? null;
      } else {
        const res = (await zai.images.generations.create({
          prompt: armPrompt,
          size: sizeFor(shot.shotType) as never,
        })) as { data?: Array<{ base64?: string }> };
        base64 = res.data?.[0]?.base64 ?? null;
      }
    } catch (e) {
      console.log(`${ref}: GENERATION FAILED - ${e instanceof Error ? e.message : String(e)}`);
      report.push({ ref, error: `generation: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (!base64) { console.log(`${ref}: no image returned`); continue; }
    fs.writeFileSync(path.join(OUT_DIR, `${ref}-arm-keyframe.png`), Buffer.from(base64, "base64"));
    const dataUrl = `data:image/png;base64,${base64}`;
    console.log(`${ref}: arm keyframe generated`);

    const judged = await judge(shot.id, dataUrl, castNames, featured);
    if (!judged) { report.push({ ref, error: "judge failed" }); continue; }
    console.log(`  >>> ${ref} ARM worst ${Math.round(judged.worst * 100)} (first pass: S001 60 / S003 40 / S006 65)`);
    report.push({
      ref,
      shotType: shot.shotType,
      arm: shotNum === 3 ? "sheet-anchor" : shotNum === 6 ? "contrast-dye" : "weapon-fidelity",
      featured,
      featuredWorst: Math.round(judged.worst * 100),
      entries: judged.entries,
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, "arm-report.json"), JSON.stringify(report, null, 2));
  console.log(`\narm report -> ${OUT_DIR}/arm-report.json (no production writes anywhere)`);
  await db.$disconnect();
}
main();
