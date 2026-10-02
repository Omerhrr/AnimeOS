// NIGHT 114 - RESTORE THE STANDING PRODUCTION'S FACE (the sandbox
// rebuild): rows are back (auto-seed) but the cast rides no sheets
// and no design spec - the anchor law would refuse every shot.
// This driver anchors the four primary members' model sheets, wires
// Lin Yue's COMMITTED r2 design DNA (the exact designed build the
// 112/113 distributions measured - re-running the crew here would
// re-roll the asset and confound the 114-vs-113 comparison: the 114
// night changes the SHOT side, never the asset), and reads the
// sheet DNA into the build.
import { db } from "../src/lib/db";
import fs from "fs";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { readSheetDna } from "../src/lib/blender/adherence";

const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];
const COMMITTED_DNA = "public/designs/cmuq1s4i00007ppgsjqryw9r5/r2/dna.json";
const COMMITTED_SHEET = "/designs/cmuq1s4i00007ppgsjqryw9r5/r2/turn_sheet.png";

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");

  // 0. the committed designed build (113's r2, byte-exact)
  const dnaRaw = JSON.parse(fs.readFileSync(COMMITTED_DNA, "utf8"));
  if (!dnaRaw?.designSpec) throw new Error("committed r2 dna carries no designSpec");
  const designSpec = JSON.stringify(dnaRaw.designSpec);

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

  // 2. wire the committed designed build (the crew's r2, unchanged)
  const lin = await db.character.findFirst({ where: { projectId: prod.id, name: "Lin Yue" } });
  if (lin && !lin.designSpec) {
    await db.character.update({
      where: { id: lin.id },
      data: { designSpec, designSheetUrl: COMMITTED_SHEET, designedAt: new Date() },
    });
    console.log(`Lin Yue: committed r2 designSpec wired (${designSpec.length} chars), designSheet -> ${COMMITTED_SHEET}`);
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
