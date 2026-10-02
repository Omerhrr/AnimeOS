// NIGHT 115 - THE ANTAGONIST RIDES THE CREW: Demon Lord Wei takes the
// same designed path Lin Yue took in 109/113 - the SHEET READER reads
// his anchored model sheet, the BUILDER renders the turnaround, the
// JUDGE scores against the sheet, the TUNER moves the spec - and the
// best round's spec lands on Character.designSpec so every future
// render (S004's aura wide, S006's stand-off) builds him DESIGNED.
// The 114 night changes the SHOT side; the 115 night changes the
// ANTAGONIST - the crew is the designed path, never a re-roll of the
// hero (Lin Yue's committed r2 spec is untouched).
import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");
  const owner = await db.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) throw new Error("no OWNER user");
  const ownerUser = { id: owner.id, name: owner.name ?? "Owner", role: owner.role };

  const wei = await db.character.findFirst({ where: { projectId: prod.id, name: "Demon Lord Wei" } });
  if (!wei) throw new Error("Demon Lord Wei missing");
  if (wei.designSpec) {
    console.log(`Demon Lord Wei: designSpec already present (${wei.designSpec.length} chars) - the crew does not re-roll a committed design`);
    return;
  }
  if (!wei.modelSheetUrl) throw new Error("Demon Lord Wei has no anchored sheet - anchor it first");

  const t0 = Date.now();
  const crew = await executeTool(prod.id, "design_character", { characterName: "Demon Lord Wei", rounds: 2 }, ownerUser);
  console.log(`design_character Demon Lord Wei: ${crew.status} (${Math.round((Date.now() - t0) / 1000)}s)`);
  console.log(String(crew.result).slice(0, 900));

  const after = await db.character.findFirst({ where: { id: wei.id }, select: { designSpec: true, designSheetUrl: true, designedAt: true } });
  console.log(`landed: spec=${after?.designSpec ? `${after.designSpec.length} chars` : "MISSING"} sheet=${after?.designSheetUrl ?? "-"} at=${after?.designedAt?.toISOString() ?? "-"}`);
  if (after?.designSpec) {
    const spec = JSON.parse(after.designSpec);
    console.log(`spec: hair=${spec.hair?.color ?? "?"} style=${spec.hair?.style ?? "?"} outfit=${spec.outfit?.type ?? "?"} gender=${spec.body?.gender ?? "?"}`);
  }
}
main()
  .catch((e) => { console.error("night115 crew failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
