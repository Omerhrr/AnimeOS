// PROBE 130 - the standing sheets through the hue-aware dye class
// (the 129 night's blind spot: Lin's sheet robe #285578 is in the
// design's VALUE class but off its jade HUE). For each primary member:
// the design compile's dyes, the sheet's measured palette, the
// designDyeClass verdict per role, and the exact planSheetConformance
// rows the render path would ride tonight.
// Run: DATABASE_URL=file:... npx tsx scripts/probe-130-hue.ts
import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";
import { readSheetDna } from "../src/lib/blender/adherence";
import {
  extractSheetPalette, designDyeClass, planSheetConformance,
  hueOf, satOf, hueDist, DESIGN_HUE_BAND, HUE_CHROMA_FLOOR, PULL_LUM_CAP,
} from "../src/lib/blender/sheet-palette";
import { characterDesignDna } from "../src/lib/animation/design";

const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");
  console.log(`the hue law: band ${DESIGN_HUE_BAND} of the circle, chroma floor ${HUE_CHROMA_FLOOR}, value cap ${PULL_LUM_CAP}`);

  for (const name of SHEET_MEMBERS) {
    const ch = await db.character.findFirst({
      where: { projectId: prod.id, name },
      include: { states: { orderBy: { episodeNumber: "asc" } } },
    });
    if (!ch) { console.log(`${name}: missing`); continue; }
    const st = [...ch.states].sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0] ?? null;
    const design = characterDesignDna({
      name: ch.name, role: ch.role, appearance: ch.appearance, modelSheetPrompt: ch.modelSheetPrompt,
      stateClothing: st?.clothing ?? null, stateWeapon: st?.weapon ?? null,
    });
    const dyes = { robe: design.robeColor, accent: design.robeAccent, hair: design.hairColor };
    console.log(`\n== ${name} (role ${ch.role}): design robe ${dyes.robe} (hue ${hueOf(dyes.robe).toFixed(0)} sat ${satOf(dyes.robe).toFixed(2)}) accent ${dyes.accent} hair ${dyes.hair}`);
    if (!ch.modelSheetUrl) { console.log("   no sheet"); continue; }
    const p = path.join(process.cwd(), "public", ch.modelSheetUrl.split("?")[0]);
    if (!fs.existsSync(p)) { console.log("   sheet file missing"); continue; }
    const palette = await extractSheetPalette(await fs.promises.readFile(p));
    console.log(`   sheet palette: ${palette.join(" ")}`);

    // the build's compiled DNA colors (what the render path rides as `from`)
    const dna = await readSheetDna(ch.id);
    if (dna.ok) {
      console.log(`   build DNA: robe ${dna.dna.robeColor} accent ${dna.dna.robeAccent} hair ${dna.dna.hairColor}`);
    } else {
      console.log(`   build DNA: unavailable (${dna.error})`);
    }

    for (const [role, dye] of Object.entries(dyes)) {
      if (!dye) continue;
      const cls = designDyeClass(dye, dye);
      void cls; // (the self-check is meaningless; the real verdict rides the nearest cluster below)
      if (!palette.length) { console.log(`   ${role}: no palette clusters`); continue; }
      let nearest = palette[0];
      for (const c of palette) if (hueDist(dye, c) < 99 && hexDistOf(dye, c) < hexDistOf(dye, nearest)) nearest = c;
      const verdict = designDyeClass(nearest, dye);
      console.log(`   ${role}: nearest ${nearest} (hue ${hueOf(nearest).toFixed(0)} sat ${satOf(nearest).toFixed(2)}) -> ${verdict.out ? "OUT" : "in class"}${verdict.valueOut ? " [value " + verdict.dLum.toFixed(3) + "]" : ""}${verdict.hueOut ? " [hue " + verdict.dHue?.toFixed(3) + "]" : ""}${!verdict.valueOut && !verdict.hueOut ? " [dLum " + verdict.dLum.toFixed(3) + (verdict.dHue !== null ? " dHue " + verdict.dHue.toFixed(3) : " hue exempt") + "]" : ""}`);
    }

    // the render path's own rows: the build DNA colors vs the sheet, design riding
    if (dna.ok) {
      const rows = planSheetConformance(
        { robe: dna.dna.robeColor, accent: dna.dna.robeAccent, hair: dna.dna.hairColor, boots: "#241a12" },
        palette, 0.75, undefined,
        { robe: dyes.robe, accent: dyes.accent, hair: dyes.hair },
      );
      for (const r of rows) {
        console.log(`   row ${r.role}: ${r.from} -> ${r.to}${r.anchored ? " ANCHORED" : ""}${r.skipped ? " (skipped)" : ""}`);
        if (r.anchored) console.log(`      ${r.anchored}`);
      }
    }
  }
  process.exit(0);
}

function hexDistOf(a: string, b: string): number {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return (Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2])) / (3 * 255);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
