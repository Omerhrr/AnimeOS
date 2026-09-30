// THE GATE'S WORK ORDER, STEP 1 - THE SHEETS ARE READ INTO BUILD DNA.
// The standing production's cast rode the render night on REGEX-GUESS
// DNA (sheetDna=null everywhere) - the vision scorer read the pixels
// honestly: "a low-poly 3D mannequin that bears no resemblance". The
// binding: every anchored member's canonical sheet is READ with the
// real vision model (adherence.ts readSheetDna) and the measured
// truth lands on Character.sheetDna - the next render compiles
// THROUGH the sheet (conform 0.75, the silhouette shapes the mesh,
// the face is sculpted to the sheet's family, the surface graded by
// the sheet's own hexes, the groom directed by the sheet's sentence).
import { db } from "../src/lib/db";
import { readSheetDna } from "../src/lib/blender/adherence";
import { characterAssetHashFor } from "../src/lib/character-assets";

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("the standing production is missing");
  const cast = await db.character.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
  console.log(`== THE BINDING: ${project.title} - ${cast.length} member(s) ==\n`);
  for (const member of cast) {
    if (!member.modelSheetUrl) {
      console.log(`- ${member.name}: no canonical sheet - the regex DNA keeps the guess build (unchanged)`);
      continue;
    }
    const before = await characterAssetHashFor(project.id, member.id);
    const read = await readSheetDna(member.id, { refresh: true });
    if (!read.ok) {
      console.log(`- ${member.name}: THE READ FAILED - ${read.error}`);
      continue;
    }
    const after = await characterAssetHashFor(project.id, member.id);
    const d = read.dna;
    console.log(`- ${member.name}: sheet read ${read.source === "read" ? "EARNED (real vision)" : "cached"} ->`);
    console.log(`    hair ${d.hairStyle ?? "-"}/${d.hairColor ?? "-"}  robe ${d.robeColor ?? "-"}/${d.robeAccent ?? "-"}  boots ${d.bootsColor ?? "-"}  skin ${d.skinTone ?? "-"}`);
    console.log(`    weapon ${d.weaponType ?? "-"}  build ${d.build ?? "-"}  beard ${d.beard ?? "-"}  face ${d.faceShape ?? "-"}`);
    console.log(`    silhouette: ${d.silhouette ?? "-"}`);
    console.log(`    asset: ${before.hash?.slice(0, 8) ?? "none"} v${before.version} -> recompiles on the next render (the moved hash re-versions honestly)`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
