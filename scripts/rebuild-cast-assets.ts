// Rebuild the standing production's CHARACTER library assets through
// the current craft laws (iteration 107's law: a law that changes the
// pixels is an asset change - the triad's surface/face/presence all
// change how the asset is built and surfaced, so the .blend library
// re-versions). Characters only: the environment's meshes did not
// move under the triad.
import { db } from "../src/lib/db";
import { buildBlenderAsset, inspectBlenderAsset } from "../src/lib/blender/assets";

async function main() {
  const p = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!p) throw new Error("the standing production is missing");
  const cast = await db.character.findMany({ where: { projectId: p.id }, orderBy: { name: "asc" } });
  for (const c of cast) {
    const res = await buildBlenderAsset(p.id, "CHARACTER", c.name);
    if (!res.ok) {
      console.log(`BUILD FAILED for ${c.name}: ${res.log.slice(-300)}`);
      continue;
    }
    console.log(`built: char ${c.name} v${res.version} (${res.objects} objects, ${res.tris.toLocaleString()} tris, ${(res.buildMs / 1000).toFixed(1)}s)`);
    const insp = await inspectBlenderAsset(res.assetId);
    if (insp.ok && !insp.skipped) {
      console.log(`inspected: char ${c.name} identity ${insp.score !== null ? `${Math.round(insp.score * 100)}%` : "n/a"}${insp.note ? ` - ${insp.note}` : ""}`);
    } else if (insp.error) {
      console.log(`inspect skipped/failed: ${insp.error}`);
    }
  }
}
main().finally(() => db.$disconnect());
