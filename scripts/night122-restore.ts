// NIGHT 122 - RESTORE THE STANDING PRODUCTION, COMMITTED AND
// BYTE-EXACT (the sandbox-rebuild law, complete at last - the 222
// degraded-mode edition).
//
// The rows come back through the auto-seed (seed140 / GET /api/projects
// on an empty database), but the cast rides no sheets and no designed
// builds - and the 113/114 restore drivers each fixed half the state.
// THIS driver is the whole law, no re-rolls anywhere:
//   1. THE COMMITTED DNA SEED (the 222 law - the twelfth drift's own
//      answer): receipts/restore-cast-dna.json wires the MEASURED sheet
//      DNA the standing receipts pin (the dye clauses' hexes the smokes
//      assert) - a wiped box restores the dye law without the vision
//      channel. The seed never invents: a member absent from the seed
//      restores only through the vision read. Dormant until its sheet
//      lands (the anchor is what identity is scored against - the
//      keyframe member law skips the sheetless), and the vision re-read
//      (step 5) updates under the staleness law when a sheet lands.
//   2. anchor the four primary members' model sheets (image-gen; the
//      164 ladder rides inside the generator - a 429 lands an HONEST
//      MISS on the receipt, the window-bound remainder named, never a
//      crash),
//   3. wire Lin Yue's COMMITTED r3 design (byte-exact from git; r2 was
//      the 112-121 measured designed build, r3 is the 140 statement
//      revision - the twice-named 'wrong gender/age features' cell at
//      the face-filling closeup answered by the probe-140 m-cuts),
//   4. wire Demon Lord Wei's COMMITTED r3 design (byte-exact from git;
//      r3 is the 139 statement revision - the 138 night's chibi receipt
//      answered by the probe-139 A/B),
//   5. read the sheet DNA for the whole cast (vision, sheeted members
//      only; a seed member whose sheet is window-bound keeps the seed
//      values and the receipt names the source that won),
//   6. THE RESTORE RECEIPT (the 220 report law's shape): what landed,
//      what waits, every error verbatim - receipts/restore-receipt.json,
//      NON-FATAL (a failed write names itself - nothing hidden).
// Run: DATABASE_URL=file:... npx tsx scripts/night122-restore.ts
import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";
import { generateCharacterModelSheet } from "../src/lib/ai/art";
import { readSheetDna } from "../src/lib/blender/adherence";

const SHEET_MEMBERS = ["Lin Yue", "Chen Hao", "Elder Han", "Demon Lord Wei"];
const COMMITTED = [
  {
    name: "Lin Yue",
    // r3 (the 140 statement revision): the male-statement dials move,
    // the SHEET ART does not - the designSheet rides the r2
    // turnaround (the same law the dials serve)
    dna: "public/designs/cmuq1s4i00007ppgsjqryw9r5/r3/dna.json",
    sheet: "/designs/cmuq1s4i00007ppgsjqryw9r5/r2/turn_sheet.png",
  },
  {
    name: "Demon Lord Wei",
    // r3 (the 139 statement revision): the proportion dials move,
    // the SHEET ART does not - the designSheet rides the r2
    // turnaround (the same law the dials serve)
    dna: "public/designs/cmuqieinq000cpxz7lp5ohq41/r3/dna.json",
    sheet: "/designs/cmuqieinq000cpxz7lp5ohq41/r2/turn_sheet.png",
  },
];
const DNA_SEED = "receipts/restore-cast-dna.json";
const RECEIPT = "receipts/restore-receipt.json";

interface MemberRead {
  name: string;
  sheet: "landed" | "already-anchored" | "window-bound";
  sheetError?: string;
  dnaSource: "committed-seed" | "vision-read" | "unchanged" | "absent";
  dnaError?: string;
}

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");
  const members: MemberRead[] = [];

  // 1. THE COMMITTED DNA SEED (the 222 law - before the sheets, so the
  // vision re-read's win is nameable per member)
  let seed: { members?: Array<{ name: string; sheetDna: Record<string, string> }> } | null = null;
  try {
    seed = JSON.parse(fs.readFileSync(DNA_SEED, "utf8"));
  } catch (e) {
    console.log(`DNA SEED: unreadable (${e instanceof Error ? e.message : String(e)}) - the seed law degrades honestly`);
  }
  if (seed?.members?.length) {
    for (const m of seed.members) {
      const ch = await db.character.findFirst({ where: { projectId: prod.id, name: m.name } });
      if (!ch) { console.log(`${m.name}: seed target missing (skipped)`); continue; }
      if (ch.sheetDna) { console.log(`${m.name}: sheet DNA already present (the seed never overwrites)`); continue; }
      await db.character.update({ where: { id: ch.id }, data: { sheetDna: JSON.stringify(m.sheetDna) } });
      console.log(`${m.name}: COMMITTED DNA seeded (${Object.keys(m.sheetDna).length} fields, dormant until the sheet lands)`);
    }
  }

  // 2. anchor the sheets (the image channel draws them; the ladder
  // rides inside - an honest MISS per member, never a crash)
  for (const name of SHEET_MEMBERS) {
    const ch = await db.character.findFirst({ where: { projectId: prod.id, name } });
    if (!ch) { members.push({ name, sheet: "window-bound", dnaSource: "absent", sheetError: "character missing" }); continue; }
    if (ch.modelSheetUrl) {
      console.log(`${name}: already anchored`);
      members.push({ name, sheet: "already-anchored", dnaSource: "unchanged" });
      continue;
    }
    try {
      const sheet = await generateCharacterModelSheet(ch.id);
      console.log(`${name}: sheet anchored -> ${sheet.modelSheetUrl}`);
      members.push({ name, sheet: "landed", dnaSource: "unchanged" });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`${name}: SHEET WINDOW-BOUND - ${err.slice(0, 140)}`);
      members.push({ name, sheet: "window-bound", sheetError: err, dnaSource: ch.sheetDna ? "committed-seed" : "absent" });
    }
  }

  // 3+4. wire the COMMITTED designed builds (byte-exact, no re-roll)
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

  // 5. the sheet DNA binding (the vision read; the staleness law's own
  // door - a seed member whose sheet landed NOW gets the vision read,
  // and the receipt names which source won)
  const cast = await db.character.findMany({ where: { projectId: prod.id }, orderBy: { createdAt: "asc" } });
  for (const member of cast) {
    const row = members.find((m) => m.name === member.name);
    if (!member.modelSheetUrl) {
      if (row && row.dnaSource === "unchanged") {
        row.dnaSource = member.sheetDna ? "committed-seed" : "absent";
      }
      console.log(`${member.name}: no sheet - DNA ${member.sheetDna ? "rides the committed seed (dormant)" : "absent"}`);
      continue;
    }
    const read = await readSheetDna(member.id, { refresh: true });
    if (read.ok) {
      console.log(`${member.name}: sheet DNA READ (vision)`);
      if (row) row.dnaSource = "vision-read";
    } else {
      console.log(`${member.name}: DNA READ FAILED - ${read.error.slice(0, 120)}${member.sheetDna ? " (the committed seed stands)" : ""}`);
      if (row) { row.dnaError = read.error; if (member.sheetDna) row.dnaSource = "committed-seed"; }
    }
  }

  // 6. THE RESTORE RECEIPT (the 220 report law's shape - non-fatal)
  const windowBound = members.filter((m) => m.sheet === "window-bound").map((m) => m.name);
  const body = {
    restore: "night122-restore",
    edition: "the 222 degraded-mode law: the committed DNA seed + the honest window-bound remainder",
    ranAt: new Date().toISOString(),
    project: prod.id,
    members,
    designs: COMMITTED.map((c) => ({ name: c.name, designSheet: c.sheet })),
    windowBound,
    complete: windowBound.length === 0,
    note: windowBound.length
      ? `the sheets are the image channel's own work - ${windowBound.join(", ")} wait for the window; the dye law rides the committed seed until then`
      : "the restore is complete (every sheet anchored, every DNA vision-read)",
  };
  try {
    fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
    fs.writeFileSync(RECEIPT, JSON.stringify(body, null, 2));
    console.log(`\nRESTORE RECEIPT: ${RECEIPT} (complete: ${body.complete})`);
  } catch (e) {
    console.log(`RESTORE RECEIPT WRITE FAILED - ${e instanceof Error ? e.message : String(e)}`);
  }
}
main()
  .catch((e) => { console.error("restore failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
