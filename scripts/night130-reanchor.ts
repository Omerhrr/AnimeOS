// NIGHT 130 - THE DYE'S HUE CLASS (the sheet acceptance gates HUE).
// The 129 night's blind spot: Lin's re-anchored sheet painted the robe
// BLUE (#285578) under a 'deep jade-teal #2f6d63' clause - inside the
// design's VALUE class (dLum 0.067) but off its HUE (0.100 of the
// circle) - so the acceptance passed, the honest-read anchor stood
// down, and the build carried the blue into every wide framing. The
// 130 law (designDyeClass) judges VALUE and HUE together; this run:
//   1. measure each member's STANDING sheet through the shared law
//      (the receipt - what the judge sees),
//   2. gate on the BUILD DNA (what actually poisons the render): the
//      build robe OUT of the design's class -> regenerate; the build
//      IN -> the honest receipt stands (a drifted-but-unworn depiction
//      is the judge's own reference; the anchor stays the render's net),
//   3. regen: reanchorCharacter once (the canonical law: both events),
//      then bounded best-of-3 while the sheet cluster stays OUT of the
//      design's class (value AND hue now),
//   4. re-read the sheet DNA for every regenerated member (the build
//      compiles through the NEW sheet - the 122 restore's step 4).
// Run: DATABASE_URL=file:... npx tsx scripts/night130-reanchor.ts
import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";
import { reanchorCharacter } from "../src/lib/reanchor";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { readSheetDna } from "../src/lib/blender/adherence";
import {
  extractSheetPalette, designDyeClass, hexDist,
} from "../src/lib/blender/sheet-palette";
import { characterDesignDna } from "../src/lib/animation/design";

const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];
const MAX_ATTEMPTS = 3;

interface Dyes { robe?: string; accent?: string; hair?: string; }

function nearestCluster(hex: string | undefined, palette: string[]) {
  if (!hex || !palette.length) return null;
  let nearest = palette[0];
  for (const c of palette) if (hexDist(hex, c) < hexDist(hex, nearest)) nearest = c;
  return nearest;
}

async function measure(sheetUrl: string | null | undefined, dyes: Dyes) {
  if (!sheetUrl) return null;
  const p = path.join(process.cwd(), "public", sheetUrl.split("?")[0]);
  if (!fs.existsSync(p)) return null;
  const palette = await extractSheetPalette(await fs.promises.readFile(p));
  const robe = nearestCluster(dyes.robe, palette);
  return {
    palette,
    robe,
    robeClass: robe && dyes.robe ? designDyeClass(robe, dyes.robe) : null,
  };
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
    const dnaRead = await readSheetDna(ch.id);
    const buildRobe = dnaRead.ok ? dnaRead.dna.robeColor : null;
    const buildClass = buildRobe && dyes.robe ? designDyeClass(buildRobe, dyes.robe) : null;

    console.log(`== ${name}: design robe ${dyes.robe}`);
    console.log(`   sheet: ${before?.robe ? `nearest ${before.robe} -> ${before.robeClass?.out ? "OUT" : "in class"} (dLum ${before.robeClass?.dLum.toFixed(3)}, dHue ${before.robeClass?.dHue !== null ? before.robeClass?.dHue.toFixed(3) : "exempt"})` : "no sheet read"}`);
    console.log(`   build: robe ${buildRobe ?? "?"} -> ${buildClass ? (buildClass.out ? "OUT of the design's class" : "in class") : "no build DNA"}`);

    if (!buildClass || !buildClass.out) {
      console.log(`   HONEST RECEIPT: the build wears the design's class - no regen owed (the anchor stays the render's net)`);
      continue;
    }

    // the build is poisoned: regenerate the sheet through the canonical law
    const re = await reanchorCharacter(ch.id, { actor: "DSH", rescore: 0 });
    if (!re.ok) { console.log(`   REANCHOR FAILED - ${re.error}`); continue; }
    let attempts = 1;
    let after = await measure(re.result.modelSheetUrl, dyes);

    while (after?.robeClass && after.robeClass.out && attempts < MAX_ATTEMPTS) {
      const why = after.robeClass.valueOut && after.robeClass.hueOut
        ? `dLum ${after.robeClass.dLum.toFixed(3)} + dHue ${after.robeClass.dHue?.toFixed(3)}`
        : after.robeClass.hueOut
          ? `dHue ${after.robeClass.dHue?.toFixed(3)} (value in)`
          : `dLum ${after.robeClass.dLum.toFixed(3)} (hue exempt)`;
      console.log(`   attempt ${attempts} landed OUT (${why}) - regenerating`);
      const g = await generateCharacterModelSheet(ch.id);
      after = await measure(g.modelSheetUrl, dyes);
      attempts += 1;
    }

    const dna = await readSheetDna(ch.id, { refresh: true });
    const landed = after?.robeClass && !after.robeClass.out;
    console.log(`   after (${attempts} image gen${attempts > 1 ? "s" : ""}): ${after?.robe ? `nearest ${after.robe} -> ${landed ? "IN the design's class (value and hue)" : "STILL OUT"}` : "measure failed"}`);
    console.log(`   palette: ${after?.palette.join(" ") ?? "-"}`);
    console.log(`   sheet DNA: ${dna.ok ? "re-read (the build compiles through the new sheet)" : `FAILED - ${dna.error}`}`);
    if (!landed) {
      console.log(`   HONEST RECEIPT: the channel kept its drift - the 130 anchor remains the render's net`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error("re-anchor failed:", e); process.exit(1); });
