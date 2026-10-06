// THE EYE BEFORE THE PEN (iteration 137) - the palette drift receipt,
// computed at the source: the cast DNA ledger exactly as the render
// engine assembles it (render.ts lines 217-297), for the standing
// scene's shots. Per member: the regex compile (the design text's own
// dye), the sheet-DNA read (the canonical sheet's measured truth),
// the adherent merge (what the build starts from), and the sheet
// conformance rows (the 128 design anchor + the sheet pull - what the
// build WEARS). The ledger names where the purple lives.
// Run: DATABASE_URL=file:... npx tsx scripts/probe-137-dyeledger.ts
import { db } from "../src/lib/db";
import { detectCast } from "../src/lib/ai/art";
import { characterDesignDna } from "../src/lib/animation/design";
import { adherentDna, sheetDnaFresh } from "../src/lib/blender/adherence";
import { planSheetConformance, extractSheetPalette } from "../src/lib/blender/sheet-palette";
import fs from "fs";
import path from "path";

const BOOTS_DEFAULT = "#2a2a30"; // render.ts's standing default

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const episodeNumber = (await db.episode.findFirst({ where: { id: scene.episodeId } }))?.number ?? 7;
  const castRows = await db.character.findMany({ where: { projectId: project.id }, include: { states: true } });

  for (const shot of await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } })) {
    const detected = detectCast(castRows, shot.description).slice(0, 2);
    if (detected.length === 0) continue;
    console.log(`\n== S00${shot.number} (${shot.shotType}) cast: ${detected.map((c) => c.name).join(" + ")} ==`);
    for (const c of detected) {
      const st = [...c.states]
        .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
        .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())[0];
      const regex = characterDesignDna({
        name: c.name, role: c.role, appearance: c.appearance, modelSheetPrompt: c.modelSheetPrompt,
        stateClothing: st?.clothing ?? null, stateWeapon: st?.weapon ?? null,
      });
      const fresh = sheetDnaFresh(c.sheetDna, c.modelSheetUrl);
      const dna = adherentDna(regex, fresh);
      console.log(`  ${c.name}:`);
      console.log(`    regex compile (the design text): robe ${regex.robeColor} accent ${regex.robeAccent} hair ${regex.hairColor}`);
      console.log(`    sheet read ${fresh ? `(fresh, ${fresh.sheetUrl?.slice(0, 30)})` : "(ABSENT - the regex rides)"}: robe ${fresh?.robeColor ?? "-"} accent ${fresh?.robeAccent ?? "-"} hair ${fresh?.hairColor ?? "-"}`);
      console.log(`    adherent merge (the build's start): robe ${dna.robeColor} accent ${dna.robeAccent} hair ${dna.hairColor} conform ${dna.conformFactor} sheetFields [${dna.sheetFields.join(",")}]`);

      // the sheet conformance (the 128 design anchor + the sheet pull)
      if (c.modelSheetUrl) {
        const sheetPath = path.join(process.cwd(), "public", c.modelSheetUrl.split("?")[0]);
        if (fs.existsSync(sheetPath)) {
          const palette = await extractSheetPalette(await fs.promises.readFile(sheetPath));
          const rows = planSheetConformance(
            { robe: dna.robeColor, accent: dna.robeAccent, hair: dna.hairColor, boots: BOOTS_DEFAULT },
            palette,
            dna.conformFactor,
            undefined,
            { robe: regex.robeColor, accent: regex.robeAccent, hair: regex.hairColor },
          );
          console.log(`    sheet palette [${palette.join(" ")}]`);
          for (const r of rows) {
            console.log(`      ${r.role} (${r.mat}): ${r.from} -> ${r.to} delta ${r.delta.toFixed(3)}${r.skipped ? ` SKIPPED (${r.skipped})` : ""}${r.anchored ? " ANCHORED(to design)" : ""}`);
          }
        } else {
          console.log(`    sheet file MISSING on disk: ${sheetPath}`);
        }
      }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("ledger failed:", e); process.exit(1); });
