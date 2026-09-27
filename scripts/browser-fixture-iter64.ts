// Browser E2E fixture for iteration 64: seeds a small production whose
// program ledger carries the NEW states - a verified-but-unadopted
// program (the amber badge the consult proposes), a program adopted as
// a flow (the violet flow chip), and slots carrying the air call (the
// cyan air chip) - plus a directed scene whose call-sheet beats show
// the stamped wind. The Manifest view must render all of it live.
// Run: bun scripts/browser-fixture-iter64.ts
import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";

const MARK = "iter64-air-fixture";

async function main() {
  // fresh fixture each run
  const prev = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (prev) await db.project.delete({ where: { id: prev.id } });

  const owner = await db.user.findUnique({ where: { email: "director@studio.dev" } });
  if (!owner) throw new Error("seeded director missing - run the studio seed first");
  const user = { id: owner.id, name: owner.name ?? "Lin Director", role: owner.role };

  const created = await executeTool("fixture", "create_project", {
    title: `Storm Gate ${MARK}`,
    logline: "an air-call fixture: the sentence calls the wind, the consult names its teachers",
    visualStyle: "DONGHUA",
  }, user);
  if (created.status !== "OK") throw new Error(`create_project failed: ${created.result}`);
  const project = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!project) throw new Error("fixture project missing");
  const T = (name: string, args: Record<string, unknown>) => executeTool(project.id, name, args, user);

  // the verified-but-unadopted sentence (the consult proposes this one)
  const storm = await T("design_sequence", { name: "The Storm Gate", description: "find the gate, break the gate - the gust lands on the push-in", slots: JSON.stringify([
    { grammar: "The Reveal", wind: [null, 0.9], fx: "The Slash", note: "the gust rides the push-in" },
    { grammar: "The Assault", wind: 0.6, physics: "The Clash" },
  ]) });
  if (storm.status !== "OK") throw new Error(`design_sequence failed: ${storm.result}`);

  // the adopted sentence (a flow carries it)
  const calm = await T("design_sequence", { name: "The Calm Gate", slots: JSON.stringify([
    { grammar: "The Reveal", wind: 0 },
    { grammar: "The Standoff" },
  ]) });
  if (calm.status !== "OK") throw new Error(`design_sequence failed: ${calm.result}`);
  const adopt = await T("learn_sequence_flow", { name: "Calm grammar", register: "STANDOFF", program: "The Calm Gate" });
  if (adopt.status !== "OK") throw new Error(`learn_sequence_flow failed: ${adopt.result}`);

  await T("create_episode", { seasonNumber: 1, number: 1, title: "The Air Answers" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate approach" });
  await T("create_scene", { episodeNumber: 1, number: 2, title: "Gate clash" });
  for (const scn of [1, 2]) {
    for (const n of [1, 2]) {
      await T("create_shot", {
        sceneNumber: scn, number: n,
        description: `E2E Cultivator Lin rides the air - scene ${scn} shot ${n}`,
        shotType: n === 1 ? "ESTABLISHING" : "MEDIUM",
        movement: "STATIC",
      });
    }
  }

  // verify the storm program (direction 1 - lands whole) and direct scene 1 with it
  const dirStorm = await T("direct_sequence", { sceneNumber: 1, program: "The Storm Gate" });
  if (dirStorm.status !== "OK") throw new Error(`direct_sequence storm failed: ${dirStorm.result}`);

  // grow the adopted flow so its record reads runs/clears, then leave the storm unadopted
  const dirCalm = await T("direct_sequence", { sceneNumber: 2, program: "The Calm Gate" });
  if (dirCalm.status !== "OK") throw new Error(`direct_sequence calm failed: ${dirCalm.result}`);

  const recalm = await T("direct_sequence", { sceneNumber: 2, program: "The Calm Gate" });
  if (recalm.status !== "OK") throw new Error(`direct_sequence calm again failed: ${recalm.result}`);

  console.log(`fixture ready: project=${project.id}`);
  console.log(`title: Storm Gate ${MARK}`);
}

main()
  .catch((err) => {
    console.error("fixture crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
