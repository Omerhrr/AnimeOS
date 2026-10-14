// ITERATION 211 PROBE - THE CLOSEUP INSTRUMENT'S QUESTION (the S002
// paired arm). The 210 board's blocker converged on S002 (all four
// cells' worst) and the tension stands with both receipts: the eye's
// clean closeup read vs the judge's 35 (style 20). The 162 finding
// named the front-scale reads BIMODAL (the banned sheet-detail
// comparison resurfacing stochastically vs the scale-law-compliant
// mode). THIS probe maps the mode on the FRESH clip: 3 rounds x 5
// samples (the same instrument, the same pixels), each round's
// per-entry reads logged raw - the mode map answers the instrument
// question BEFORE any lever moves (the 201 discipline: one variable,
// the eye's receipts first).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 2 } });
  if (!shot) throw new Error("S002 missing");
  const { scoreShotIdentityMedian } = await import("../src/lib/identity");
  for (let round = 1; round <= 3; round++) {
    if (round > 1) await new Promise((r) => setTimeout(r, 10_000));
    const res = await scoreShotIdentityMedian(shot.id, "RENDER", 5);
    if (!res.ok) { console.log(`round ${round}: REFUSED - ${String(res.error).slice(0, 120)}`); continue; }
    const v = res.scored.verdict;
    console.log(`round ${round}: SHOT WORST ${Math.round(v.worst * 100)}%`);
    for (const e of v.entries) {
      const aspects = Object.entries(e.aspects ?? {})
        .map(([k, n]) => `${k} ${Math.round((n as number) * 100)}`)
        .join(", ");
      console.log(`  ${e.characterName}: ${Math.round(e.similarity * 100)} [${aspects}] note: ${e.note.slice(0, 110)}`);
    }
  }
  await db.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
