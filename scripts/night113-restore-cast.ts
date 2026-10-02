// NIGHT 113 - RESTORE THE CAST'S FACE (the sandbox rebuild):
// the standing production's rows are back (auto-seed) but the cast
// rides no sheets and no design spec - the anchor law would refuse
// every shot. This driver anchors the four primary members' model
// sheets, reads the sheet DNA into the build, and gives Lin Yue his
// designed spec through the design crew.
import { db } from "../src/lib/db";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { readSheetDna } from "../src/lib/blender/adherence";
import { executeTool } from "../src/lib/dsh/tools";

const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");
  const owner = await db.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) throw new Error("no OWNER user");
  const ownerUser = { id: owner.id, name: owner.name ?? "Owner", role: owner.role };
  const T = (name: string, args: Record<string, unknown>) => executeTool(prod.id, name, args, ownerUser);

  // 1. anchor the sheets (the image channel draws them)
  for (const name of SHEET_MEMBERS) {
    const ch = await db.character.findFirst({ where: { projectId: prod.id, name } });
    if (!ch) { console.log(`${name}: missing (skipped)`); continue; }
    if (ch.modelSheetUrl) { console.log(`${name}: already anchored`); continue; }
    try {
      const sheet = await generateCharacterModelSheet(ch.id);
      console.log(`${name}: sheet anchored -> ${sheet.modelSheetUrl}`);
    } catch (e) {
      console.log(`${name}: SHEET FAILED - ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. the crew designs Lin Yue through the sheet (the designed path)
  const lin = await db.character.findFirst({ where: { projectId: prod.id, name: "Lin Yue" } });
  if (lin && !lin.designSpec) {
    const crew = await T("design_character", { characterName: "Lin Yue", rounds: 2 });
    console.log(`design_character Lin Yue: ${crew.status}\n${String(crew.result).slice(0, 600)}`);
  } else {
    console.log(`Lin Yue: designSpec ${lin?.designSpec ? "present" : "character missing"}`);
  }

  // 3. the sheet DNA binding (the build compiles through the sheet)
  const cast = await db.character.findMany({ where: { projectId: prod.id }, orderBy: { createdAt: "asc" } });
  for (const member of cast) {
    if (!member.modelSheetUrl) { console.log(`${member.name}: no sheet - DNA unchanged`); continue; }
    const read = await readSheetDna(member.id, { refresh: true });
    console.log(`${member.name}: sheet DNA ${read.ok ? "READ" : `FAILED - ${read.error}`}`);
  }
}
main()
  .catch((e) => { console.error("restore failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
