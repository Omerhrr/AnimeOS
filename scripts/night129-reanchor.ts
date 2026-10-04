// NIGHT 129 - THE SHEET DEPICTS THE DESIGN (the sheet's own re-anchor,
// the 128 night's named frontier). For each of the four primary
// members:
//   1. measure the STANDING sheet's palette vs the design compile's
//      dyes (the before - the drift the 128 night named),
//   2. reanchorCharacter (the canonical re-anchor law: the REANCHOR
//      production event + the IDENTITY_REANCHOR continuity event, the
//      drift baseline restarts; the sheet regenerates from the design
//      text whose dyes now ride the prompt as COSTUME COLOR LAW),
//   3. measure the NEW sheet - the robe dye must land INSIDE the
//      design's value class (the 115 PULL_LUM_CAP measure the 128 law
//      itself uses); if not, up to 2 direct regeneration attempts
//      (bounded, measured each time, the last generation stands),
//   4. re-read the sheet DNA (the build compiles through the sheet -
//      the 122 restore's step 4).
// Run: DATABASE_URL=file:... npx tsx scripts/night129-reanchor.ts
import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";
import { reanchorCharacter } from "../src/lib/reanchor";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { readSheetDna } from "../src/lib/blender/adherence";
import { extractSheetPalette, relLum, PULL_LUM_CAP, hexDist } from "../src/lib/blender/sheet-palette";
import { characterDesignDna } from "../src/lib/animation/design";

const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];
const MAX_ATTEMPTS = 3;

interface Dyes { robe?: string; accent?: string; hair?: string; }

async function measure(sheetUrl: string | null | undefined, dyes: Dyes) {
  if (!sheetUrl) return null;
  const p = path.join(process.cwd(), "public", sheetUrl.split("?")[0]);
  if (!fs.existsSync(p)) return null;
  const palette = await extractSheetPalette(await fs.promises.readFile(p));
  const row = (hex?: string) => {
    if (!hex || !palette.length) return null;
    let nearest = palette[0];
    for (const c of palette) if (hexDist(hex, c) < hexDist(hex, nearest)) nearest = c;
    const dl = Math.abs(relLum(nearest) - relLum(hex));
    return { nearest, dLum: Number(dl.toFixed(3)), inClass: dl <= PULL_LUM_CAP };
  };
  return { palette, robe: row(dyes.robe), accent: row(dyes.accent), hair: row(dyes.hair) };
}

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");

  for (const name of SHEET_MEMBERS) {
    const ch = await db.character.findFirst({
      where: { projectId: prod.id, name },
      include: { states: { orderBy: { episodeNumber: "asc" } } },
    });
    if (!ch) { console.log(`${name}: missing (skipped)`); continue; }
    const st = [...ch.states].sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0] ?? null;
    const design = characterDesignDna({
      name: ch.name, role: ch.role, appearance: ch.appearance, modelSheetPrompt: ch.modelSheetPrompt,
      stateClothing: st?.clothing ?? null, stateWeapon: st?.weapon ?? null,
    });
    const dyes: Dyes = { robe: design.robeColor, accent: design.robeAccent, hair: design.hairColor };

    const before = await measure(ch.modelSheetUrl, dyes);
    console.log(`== ${name}: design robe ${dyes.robe} accent ${dyes.accent} hair ${dyes.hair}`);
    console.log(`   before: ${before ? `robe ${before.robe?.nearest} (dLum ${before.robe?.dLum}${before.robe?.inClass ? "" : " OUT"}) accent ${before.accent?.nearest} (dLum ${before.accent?.dLum}${before.accent?.inClass ? "" : " OUT"})` : "no sheet"}`);

    // the canonical re-anchor (the reanchor law: both events ride)
    const re = await reanchorCharacter(ch.id, { actor: "DSH", rescore: 0 });
    if (!re.ok) { console.log(`   REANCHOR FAILED - ${re.error}`); continue; }
    let attempts = 1;
    let after = await measure(re.result.modelSheetUrl, dyes);

    // bounded retry: the robe must DEPICT the design's value class
    while (after?.robe && !after.robe.inClass && attempts < MAX_ATTEMPTS) {
      console.log(`   attempt ${attempts} landed OUT of class (robe dLum ${after.robe.dLum}) - regenerating`);
      const g = await generateCharacterModelSheet(ch.id);
      after = await measure(g.modelSheetUrl, dyes);
      attempts += 1;
    }

    const dna = await readSheetDna(ch.id, { refresh: true });
    console.log(`   after (${attempts} image gen${attempts > 1 ? "s" : ""}): ${after ? `robe ${after.robe?.nearest} (dLum ${after.robe?.dLum}${after.robe?.inClass ? " IN class" : " OUT"}) accent ${after.accent?.nearest} (dLum ${after.accent?.dLum}${after.accent?.inClass ? " IN" : " OUT"}) hair ${after.hair?.nearest} (dLum ${after.hair?.dLum}${after.hair?.inClass ? " IN" : " OUT"})` : "measure failed"}`);
    console.log(`   palette: ${after?.palette.join(" ") ?? "-"}`);
    console.log(`   sheet DNA: ${dna.ok ? "re-read" : `FAILED - ${dna.error}`}`);
    if (after?.robe && !after.robe.inClass) {
      console.log(`   HONEST RECEIPT: the robe still reads outside the design's value class - the 128 anchor remains the render's net`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("re-anchor failed:", e); process.exit(1); });
