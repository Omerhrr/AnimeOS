// PROBE 129 - the sheet-vs-design tension, measured on the standing rows.
// The 128 night named the work: the sheet's own re-anchor. This probe
// prints, per member: the design-text compile's dyes (the exact intent
// the 128 conformance law carries), the current sheet's measured
// palette, and the value-class distance per role - the drift the new
// sheet must close.
import { db } from "../src/lib/db";
import { characterDesignDna } from "../src/lib/animation/design";
import { extractSheetPalette, relLum, PULL_LUM_CAP } from "../src/lib/blender/sheet-palette";
import fs from "fs";
import path from "path";

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");
  const cast = await db.character.findMany({
    where: { projectId: prod.id },
    include: { states: { orderBy: { episodeNumber: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  for (const c of cast) {
    const st = [...c.states].sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0] ?? null;
    const design = characterDesignDna({
      name: c.name,
      role: c.role,
      appearance: c.appearance,
      modelSheetPrompt: c.modelSheetPrompt,
      stateClothing: st?.clothing ?? null,
      stateWeapon: st?.weapon ?? null,
    });
    console.log(`== ${c.name} (role=${c.role ?? "?"}, designSpec=${c.designSpec ? "YES" : "no"}, sheet=${c.modelSheetUrl?.split("?")[0] ?? "none"})`);
    console.log(`   design compile: robe=${design.robeColor} accent=${design.robeAccent} hair=${design.hairColor}`);
    console.log(`   clothing: ${(st?.clothing ?? "").slice(0, 140)}`);
    if (c.modelSheetUrl) {
      const p = path.join(process.cwd(), "public", c.modelSheetUrl.split("?")[0]);
      if (fs.existsSync(p)) {
        const palette = await extractSheetPalette(await fs.promises.readFile(p));
        console.log(`   sheet palette: ${palette.join(" ")}`);
        for (const [role, dye] of [["robe", design.robeColor], ["accent", design.robeAccent], ["hair", design.hairColor]] as const) {
          if (!dye) continue;
          let nearest: string | null = null;
          for (const cand of palette) {
            const d = Math.abs(relLum(cand) - relLum(dye));
            if (nearest === null || d < Math.abs(relLum(nearest) - relLum(dye))) nearest = cand;
          }
          if (nearest) {
            const dl = Math.abs(relLum(nearest) - relLum(dye));
            console.log(`   ${role}: design ${dye} (lum ${relLum(dye).toFixed(3)}) vs nearest sheet ${nearest} (lum ${relLum(nearest).toFixed(3)}) -> dLum ${dl.toFixed(3)} ${dl <= PULL_LUM_CAP ? "IN class" : "OUT of class"}`);
          }
        }
      }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
