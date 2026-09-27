// Browser E2E fixture for iteration 63: seeds a small production whose
// sequence language is legible - a named sequence program, a learned
// flow adopted from it (BATTLE), and two scenes directed by both paths
// - so the Manifest view shows the three ledgers (programs, flows, the
// call sheet) with beats, world bindings and render state.
// Run: bun scripts/browser-fixture-iter63.ts
import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";

const MARK = "iter63-call-sheet-fixture";

async function main() {
  // fresh fixture each run
  const prev = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (prev) await db.project.delete({ where: { id: prev.id } });

  const owner = await db.user.findUnique({ where: { email: "director@studio.dev" } });
  if (!owner) throw new Error("seeded director missing - run the studio seed first");
  const user = { id: owner.id, name: owner.name ?? "Lin Director", role: owner.role };

  const created = await executeTool("fixture", "create_project", {
    title: `Cloudsea Raid ${MARK}`,
    logline: "a call-sheet fixture: the sentence the studio remembers",
    visualStyle: "DONGHUA",
  }, user);
  if (created.status !== "OK") throw new Error(`create_project failed: ${created.result}`);
  const project = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!project) throw new Error("fixture project missing");
  const T = (name: string, args: Record<string, unknown>) => executeTool(project.id, name, args, user);

  const program = await T("design_sequence", { name: "The Gate Raid", description: "find the gate, break the gate", slots: JSON.stringify([
    { grammar: "The Reveal", fx: "The Slash", note: "the reveal flares" },
    { grammar: "The Assault", physics: "The Clash" },
  ]) });
  if (program.status !== "OK") throw new Error(`design_sequence failed: ${program.result}`);
  const adopt = await T("learn_sequence_flow", { name: "Raid grammar", register: "BATTLE", program: "The Gate Raid" });
  if (adopt.status !== "OK") throw new Error(`learn_sequence_flow failed: ${adopt.result}`);

  await T("create_episode", { seasonNumber: 1, number: 1, title: "The Remembered Sentence" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate approach" });
  await T("create_scene", { episodeNumber: 1, number: 2, title: "The gates break" });
  for (const scn of [1, 2]) {
    for (const n of [1, 2]) {
      await T("create_shot", {
        sceneNumber: scn, number: n,
        description: `E2E Storm cultivator Yun moves through the gate assault - scene ${scn} beat ${n}`,
        shotType: n === 1 ? "ESTABLISHING" : "MEDIUM", movement: "STATIC", duration: 3.0,
      });
    }
  }
  const directed = await T("direct_sequence", { sceneNumber: 1, program: "The Gate Raid" });
  if (directed.status !== "OK") throw new Error(`direct_sequence (program) failed: ${directed.result}`);
  const consult = await T("direct_sequence", { sceneNumber: 2, register: "BATTLE" });
  if (consult.status !== "OK") throw new Error(`direct_sequence (consult) failed: ${consult.result}`);

  console.log("FIXTURE READY");
  console.log(`PROJECT_ID=${project.id}`);
}

main()
  .catch((err) => { console.error("fixture crashed:", err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
