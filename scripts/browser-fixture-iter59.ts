// Browser E2E fixture for iteration 59: seeds a small production whose
// hero shot is DIRECTED (2-beat grammar with wind) and IGNITED (a named
// fx program), renders it to REVIEW, then runs the PIXEL REVIEW on the
// finished clip so the render view can show the pixel review strip
// (overall %, provider, criteria chips, issues, the reviewed frame).
// Run: npx tsx scripts/browser-fixture-iter59.ts
import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { reviewRenderJob } from "../src/lib/engine/render-review";

const MARK = "iter59-pixel-judge-fixture";

async function main() {
  // fresh fixture each run
  const prev = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (prev) await db.project.delete({ where: { id: prev.id } });

  const owner = await db.user.findUnique({ where: { email: "director@studio.dev" } });
  if (!owner) throw new Error("seeded director missing - run the studio seed first");
  const user = { id: owner.id, name: owner.name ?? "Lin Director", role: owner.role };

  const created = await executeTool("fixture", "create_project", {
    title: `Cloudsea Gate ${MARK}`,
    logline: "a pixel-review fixture: the blade that gets judged",
    visualStyle: "DONGHUA",
  }, user);
  if (created.status !== "OK") throw new Error(`create_project failed: ${created.result}`);
  const project = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!project) throw new Error("fixture project missing");
  const T = (name: string, args: Record<string, unknown>) => executeTool(project.id, name, args, user);

  await T("create_episode", { seasonNumber: 1, number: 1, title: "The Judged Cut" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate storm dailies" });
  await T("create_shot", {
    sceneNumber: 1, number: 1,
    description: "E2E Storm cultivator Yun draws the obsidian blade at the gate as the gust lands - the blade draws a ribbon of light",
    shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE", duration: 3.0,
  });
  await T("create_character", {
    name: "E2E Storm cultivator Yun", role: "PROTAGONIST",
    appearance: "a young sword cultivator in storm-grey layered robes with a topknot and a wind-torn sash, obsidian blade",
    personality: "stoic",
  });
  await T("set_shot_grammar", {
    sceneNumber: 1, shotNumber: 1,
    grammar: JSON.stringify([
      { move: "CRANE", from: 0, to: 0.5, wind: 0.9, note: "crane down through the gust" },
      { move: "DOLLY_IN", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", note: "push in as the cut lands" },
    ]),
  });
  await T("set_shot_fx", {
    sceneNumber: 1, shotNumber: 1,
    fx: JSON.stringify([
      { kind: "TRAIL", intensity: 0.9, note: "the blade draws a ribbon" },
      { kind: "AURA", intensity: 0.6, note: "the qi shell charges" },
    ]),
  });

  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } }, number: 1 } });
  if (!scene) throw new Error("fixture scene missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 1 } });
  if (!shot) throw new Error("fixture shot missing");

  console.log("job queued - rendering the directed shot...");
  const job = await createRenderJob(project.id, shot.id, "PREVIEW");
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  console.log(`job ${final.status} -> ${final.outputUrl ?? "no output"}`);
  if (final.status !== "REVIEW") throw new Error(`fixture render did not reach REVIEW: ${final.status}`);

  console.log("running the pixel review on the finished clip...");
  const review = await reviewRenderJob(job.id);
  if (!review.ok) throw new Error(`pixel review failed: ${review.error}`);
  console.log(`pixel review: ${review.review.state} ${review.review.overall !== null ? Math.round(review.review.overall * 100) + "%" : "unmeasured"} (${review.review.provider}), ${review.review.issuesFound} issue(s)`);
  console.log("FIXTURE READY");
  process.exit(0);
}

main().catch((e) => {
  console.error("fixture failed:", e);
  process.exit(1);
});
