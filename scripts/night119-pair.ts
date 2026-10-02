// ─────────────────────────────────────────────────────────────
// NIGHT 119 PREP - THE DUEL PERFORMS: run the choreographer's
// consult over the scene's shots so the paired performance law
// lands BEFORE the drain (the consult also runs inside every
// createRenderJob - this prep is the verification pass that names
// the derivation per shot, then the drain's own consults keep it).
// Run: DATABASE_URL=file:... npx tsx scripts/night119-pair.ts
// ─────────────────────────────────────────────────────────────

import { db } from "../src/lib/db";
import { consultActionChoreographer } from "../src/lib/crew/choreographer-consult";

async function main() {
  const prod = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!prod) throw new Error("Immortal Path missing");

  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: prod.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" }, include: { audioCues: true } });
  console.log(`scene: ${scene.title} - ${shots.length} shot(s)`);

  for (const shot of shots) {
    // only shots whose action columns are ALREADY directed (the 117
    // consult filled them) can gain a pairing now - a shot the expert
    // never directed gets its consult at submit time, honestly
    if (!shot.grammar && !shot.fx && !shot.physics) {
      console.log(`S00${shot.number}: no directed action columns - the submit-time consult will speak`);
      continue;
    }
    const res = await consultActionChoreographer(prod.id, {
      id: shot.id,
      number: shot.number,
      description: shot.description,
      lighting: shot.lighting,
      movement: shot.movement,
      duration: shot.duration,
      grammar: shot.grammar,
      fx: shot.fx,
      physics: shot.physics,
      audioCues: shot.audioCues.map((c) => ({ kind: c.kind, label: c.label, startMs: c.startMs })),
    });
    if (res.decline) {
      console.log(`S00${shot.number}: the consult declines - ${res.decline}`);
      continue;
    }
    if (res.directed.length === 0) {
      console.log(`S00${shot.number}: nothing new to fill (the columns hold)`);
      continue;
    }
    console.log(`S00${shot.number}: filled ${res.directed.join(", ")}`);
    if (res.directed.includes("pairedChoreo")) {
      const after = await db.shot.findUnique({ where: { id: shot.id }, select: { pairedChoreo: true } });
      const keys = after?.pairedChoreo ? (JSON.parse(after.pairedChoreo) as { keys: Array<{ pose: string; at: number }> }).keys : [];
      console.log(`   ${res.line}`);
      console.log(`   the answer: ${keys.map((k) => `${k.pose.toLowerCase()}@${k.at}`).join(" -> ")}`);
    }
  }
  console.log("night 119 pairing prep done");
}

main()
  .catch((e) => { console.error("pair prep failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
