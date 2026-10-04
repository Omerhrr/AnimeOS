// THE EYE BEFORE THE PEN (iteration 131): the 130 night named the
// frontier - the mannequin face/style route (S002 face 30 chibi read,
// S004 'face and hair lack sharp details', S005 style 20 low-poly read)
// plus the closeup hair probe (S003 hair 60). Before any craft moves,
// read the STANDING build DNA the renders will compile (the sheets were
// freshly re-anchored by the rebuild) - what dye does the build wear,
// what hair does it groom, and what will the judge's reference depict.
import { db } from "../src/lib/db";
import { readSheetDna } from "../src/lib/blender/adherence";
import { characterDesignDna } from "../src/lib/animation/design";

const MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  for (const name of MEMBERS) {
    const ch = await db.character.findFirst({ where: { projectId: prod.id, name } });
    if (!ch) { console.log(`${name}: missing`); continue; }
    const read = await readSheetDna(ch.id, { refresh: true });
    if (!read.ok) { console.log(`${name}: DNA READ FAILED - ${read.error}`); continue; }
    const d: any = read.dna;
    console.log(`== ${name} ==`);
    console.log(`  sheet dna: robe ${d.robeColor} | accent ${d.robeAccent ?? "-"} | hair ${d.hairColor} | skin ${d.skinTone ?? "-"}`);
    console.log(`  hairstyle: ${d.hairStyle ?? "-"} | eyes: ${d.eyeColor ?? "-"}`);
    const design = characterDesignDna({ name: ch.name, role: ch.role, appearance: ch.appearance, modelSheetPrompt: ch.modelSheetPrompt, stateClothing: null, stateWeapon: null });
    console.log(`  design:    robe ${design.robe} | accent ${design.robeAccent ?? "-"} | hair ${design.hair} | hairStyle ${design.hairStyle ?? "-"}`);
  }
}
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
