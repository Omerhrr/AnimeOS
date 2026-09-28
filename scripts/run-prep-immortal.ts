// THE REAL RUN, PREPARATION: give Immortal Path's BELOW-bound cast the
// artifacts the repair loop answers to - canonical model sheets (REAL
// image gens), PREVIEW renders of each member's named shots (REAL
// engine), and RENDER-source identity scores (REAL vision channel).
// Idempotent: every step skips when its artifact already exists.
// Run: npx tsx scripts/run-prep-immortal.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreRenderIdentity, castIdentityMeasurement, castIdentityLine } from "../src/lib/identity";

const PROJECT_TITLE = "Immortal Path";
const MEMBERS = ["Lin Yue", "Demon Lord Wei"];
const SHOT_DESCRIPTIONS = [2, 3, 4]; // seed shots: 2,3 = Lin Yue; 4 = Wei

async function main() {
  const owner = await db.user.findUnique({ where: { email: "director@studio.dev" } });
  if (!owner) throw new Error("owner account missing");
  const ownerUser = { id: owner.id, name: owner.name, role: owner.role };
  const project = await db.project.findFirst({ where: { title: { contains: PROJECT_TITLE } }, orderBy: { createdAt: "asc" } });
  if (!project) throw new Error("Immortal Path production missing");

  console.log(`== PREP: ${project.title} (${project.id.slice(-6)}) ==\n`);

  // 1. canonical sheets (REAL image gens, skipped when anchored)
  for (const name of MEMBERS) {
    const row = await db.character.findFirst({ where: { projectId: project.id, name } });
    if (!row) throw new Error(`character missing: ${name}`);
    if (row.modelSheetUrl) {
      console.log(`sheet ${name}: already anchored (${row.modelSheetUrl})`);
      continue;
    }
    const res = await executeTool(project.id, "generate_model_sheet", { characterName: name }, ownerUser);
    const after = await db.character.findFirst({ where: { projectId: project.id, name } });
    console.log(`sheet ${name}: tool ${res.status} anchored=${Boolean(after?.modelSheetUrl)} ${res.status !== "OK" ? res.result.slice(0, 140) : ""}`);
  }

  // 2. PREVIEW renders of the named shots (skipped when a finished job exists)
  const shots = await db.shot.findMany({
    where: { scene: { episode: { season: { projectId: project.id } } }, number: { in: SHOT_DESCRIPTIONS } },
    orderBy: { number: "asc" },
  });
  for (const shot of shots) {
    const existing = await db.renderJob.findFirst({ where: { shotId: shot.id, status: { in: ["REVIEW", "APPROVED"] }, outputUrl: { not: null } } });
    if (existing) {
      console.log(`render S00${shot.number}: already finished (${existing.outputUrl})`);
      continue;
    }
    const job = await createRenderJob(project.id, shot.id, "PREVIEW");
    if (!job) {
      console.log(`render S00${shot.number}: no-job`);
      continue;
    }
    let ticked = await tickRenderJob(job.id);
    for (let i = 0; i < 420 && ticked && ticked.status === "RENDERING"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      ticked = await tickRenderJob(job.id);
    }
    console.log(`render S00${shot.number}: ${ticked?.status} ${ticked?.outputUrl ?? ""}`);
  }

  // 3. RENDER-source identity scores (REAL vision, skipped when scored)
  for (const shot of shots) {
    const scored = await db.identityScore.findFirst({ where: { shotId: shot.id, source: "RENDER" } });
    if (scored) {
      console.log(`score S00${shot.number}: already scored (${scored.scores.slice(0, 90)})`);
      continue;
    }
    const res = await scoreRenderIdentity(shot.id);
    console.log(`score S00${shot.number}: ${res.ok ? "ok" : `failed - ${"error" in res ? res.error : ""}`.slice(0, 140)}`);
  }

  const after = await castIdentityMeasurement(project.id, "RENDER");
  console.log(`\nSTANDING:\n${castIdentityLine(after)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("prep failed:", err);
    process.exit(1);
  });
