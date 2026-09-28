// Iteration 80 LIVE RUN: the repair loop over the Immortal Path cast's
// named BELOW members (the standing is the work order), then the
// re-measure. Driven in-process over the real runtime: REAL sheet-DNA
// vision reads, REAL re-renders over the engine, REAL re-scores, REAL
// re-anchors where the re-render cannot lift.
// Run: npx tsx scripts/run-repair-immortal.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { castIdentityMeasurement, castIdentityLine } from "../src/lib/identity";

const PROJECT_TITLE = "Immortal Path";

async function main() {
  const owner = await db.user.findUnique({ where: { email: "director@studio.dev" } });
  if (!owner) throw new Error("owner account missing");
  const project = await db.project.findFirst({ where: { title: { contains: PROJECT_TITLE } }, orderBy: { createdAt: "asc" } });
  if (!project) throw new Error("Immortal Path production missing");

  console.log(`== THE GAP IS REPAIRED: ${project.title} (${project.id.slice(-6)}) ==\n`);
  const before = await castIdentityMeasurement(project.id, "RENDER");
  console.log(`BEFORE:\n${castIdentityLine(before)}\n`);
  const belowNames = before.members.filter((m) => m.standing === "BELOW").map((m) => `${m.name} (worst ${(m.worst! * 100).toFixed(0)}% at ${m.worstRef})`);
  console.log(`the work order: ${belowNames.join(", ") || "none"}\n`);
  if (belowNames.length === 0) {
    console.log("Nothing to repair - the cast already clears the bar.");
    return;
  }

  const res = await executeTool(project.id, "identity_repair_pass", { members: 2, shotsPerMember: 1, reanchor: true }, { id: owner.id, name: owner.name, role: owner.role });
  console.log(`TOOL ${res.status}:\n${res.result}\n`);

  const after = await castIdentityMeasurement(project.id, "RENDER");
  console.log(`AFTER:\n${castIdentityLine(after)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("live run failed:", err);
    process.exit(1);
  });
