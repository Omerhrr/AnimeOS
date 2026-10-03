// NIGHT 122 - RESTORE THE STANDING PRODUCTION, COMMITTED AND
// BYTE-EXACT (the sandbox-rebuild law, complete at last).
//
// The rows come back through the auto-seed (GET /api/projects on an
// empty database), but the cast rides no sheets and no designed
// builds - and the 113/114 restore drivers each fixed half the
// state: 113 re-RAN the crew (re-rolling the asset the 112-121
// distributions measured - the confound the 114 comment forbids),
// 114 wired only Lin Yue's committed r2, so after any reset Wei
// silently lost his 115-designed spec. THIS driver is the whole
// law, no re-rolls anywhere:
//   1. anchor the four primary members' model sheets (image-gen,
//      skipped when anchored),
//   2. wire Lin Yue's COMMITTED r2 design (byte-exact from git,
//      the exact designed build 112-121 measured),
//   3. wire Demon Lord Wei's COMMITTED 115 design (byte-exact from
//      git; the crew's best round, reconstructed - the assumption
//      is named here: r2, the tuned round),
//   4. read the sheet DNA into the build for the whole cast.
// Run: DATABASE_URL=file:... npx tsx scripts/night122-restore.ts
import { db } from "../src/lib/db";
import fs from "fs";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { readSheetDna } from "../src/lib/blender/adherence";

const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];
const COMMITTED = [
  {
    name: "Lin Yue",
    dna: "public/designs/cmuq1s4i00007ppgsjqryw9r5/r2/dna.json",
    sheet: "/designs/cmuq1s4i00007ppgsjqryw9r5/r2/turn_sheet.png",
  },
  {
    name: "Demon Lord Wei",
    dna: "public/designs/cmuqieinq000cpxz7lp5ohq41/r2/dna.json",
    sheet: "/designs/cmuqieinq000cpxz7lp5ohq41/r2/turn_sheet.png",
  },
];

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");

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

  // 2+3. wire the COMMITTED designed builds (byte-exact, no re-roll)
  for (const c of COMMITTED) {
    const ch = await db.character.findFirst({ where: { projectId: prod.id, name: c.name } });
    if (!ch) { console.log(`${c.name}: character missing (skipped)`); continue; }
    const dnaRaw = JSON.parse(fs.readFileSync(c.dna, "utf8"));
    if (!dnaRaw?.designSpec) throw new Error(`${c.dna} carries no designSpec`);
    const designSpec = JSON.stringify(dnaRaw.designSpec);
    await db.character.update({
      where: { id: ch.id },
      data: { designSpec, designSheetUrl: c.sheet, designedAt: new Date() },
    });
    console.log(`${c.name}: COMMITTED design wired byte-exact (${designSpec.length} chars), designSheet -> ${c.sheet}`);
  }

  // 4. the sheet DNA binding (the build compiles through the sheet)
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
