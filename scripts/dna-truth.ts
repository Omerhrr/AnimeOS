// Dump the EXACT cast DNA the render engine assembles for S003 -
// the regex DNA, the sheet DNA merge, the design spec, and the
// conformance pulls (one script, the whole truth).
import { db } from "../src/lib/db";
import { characterDesignDna } from "../src/lib/animation/design";
import { detectCast } from "../src/lib/ai/art";
import { adherentDna, sheetDnaFresh } from "../src/lib/blender/adherence";
import { extractSheetPalette, planSheetConformance, BOOTS_DEFAULT } from "../src/lib/blender/sheet-palette";
import fs from "fs";
import path from "path";

(async () => {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 3 }, include: { scene: true } });
  const episodeNumber = 7;
  const castRows = await db.character.findMany({ where: { projectId: project.id }, include: { states: true } });
  const detected = detectCast(castRows, shot.description).slice(0, 2);
  for (const c of detected) {
    const st = [...c.states]
      .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
      .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())[0];
    const regex = characterDesignDna({
      name: c.name,
      role: c.role,
      appearance: c.appearance,
      modelSheetPrompt: c.modelSheetPrompt,
      stateClothing: st?.clothing ?? null,
      stateWeapon: st?.weapon ?? null,
    });
    const dna = adherentDna(regex, sheetDnaFresh(c.sheetDna, c.modelSheetUrl));
    const spec = c.designSpec ? JSON.parse(c.designSpec) : null;
    console.log(JSON.stringify({
      name: c.name,
      regexHair: regex.hairColor, dnaHair: dna.hairColor,
      regexRobe: regex.robeColor, dnaRobe: dna.robeColor,
      specHair: spec?.hair?.color, specEyes: spec?.eyes?.color,
      specHeadScale: spec?.body?.headScale,
      conformFactor: dna.conformFactor,
    }));
    if (c.modelSheetUrl) {
      const sheetPath = path.join(process.cwd(), "public", c.modelSheetUrl.split("?")[0]);
      const palette = await extractSheetPalette(await fs.promises.readFile(sheetPath));
      const conf = planSheetConformance(
        { robe: dna.robeColor, accent: dna.robeAccent, hair: dna.hairColor, boots: BOOTS_DEFAULT },
        palette,
        dna.conformFactor,
      );
      console.log("  palette:", JSON.stringify(palette));
      console.log("  rows:", JSON.stringify((conf as any).rows?.map((r: any) => ({ mat: r.mat, to: r.to }))));
    }
  }
  await db.$disconnect();
})();
