// THE 162 PROBE (evidence first): the judge's own sampling spread.
// Re-reads the SAME inputs the rescore judged (the strip + the face/
// figure crops off the standing boxes), 7 raw calls per cell, NO
// persistence - the spread at the swing cells (S001, S005) against
// the stable control (S002) names the damping constant's own work.
import { PrismaClient } from "@prisma/client";
import {
  loadIdentityShot,
  renderPosterForShot,
  extractRenderPosterFilmstrip,
  readRenderFaceBoxes,
  extractFaceCropStrip,
  extractFigureCropStrip,
  prepareIdentityContext,
  rawIdentityCall,
  parseIdentityVerdict,
} from "../src/lib/identity";

const db = new PrismaClient();
const N = 7;

(async () => {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } } }, orderBy: { number: "asc" } });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id, number: { in: [1, 2, 5] } }, orderBy: { number: "asc" } });
  for (const s of shots) {
    const shot = await loadIdentityShot(s.id);
    if (!shot) { console.log(`S00${s.number}: shot missing`); continue; }
    const poster = await renderPosterForShot(s.id);
    if (!poster) { console.log(`S00${s.number}: no poster`); continue; }
    const strip = await extractRenderPosterFilmstrip(poster.clipAbs, poster.jobId);
    const faceBoxes = strip ? readRenderFaceBoxes(poster.jobId) : null;
    const faceStrip = strip && faceBoxes ? await extractFaceCropStrip(poster.jobId, faceBoxes, strip.framePaths ?? []) : null;
    const figureStrip = strip && faceBoxes ? await extractFigureCropStrip(poster.jobId, faceBoxes, strip.framePaths ?? []) : null;
    const ctx = await prepareIdentityContext(shot, { imageData: strip ? strip.dataUrl : poster.dataUrl, error: "" });
    if (!ctx.ok) { console.log(`S00${s.number}: ctx failed`); continue; }
    const sims: number[] = [];
    const styles: number[] = [];
    const faces: number[] = [];
    for (let i = 0; i < N; i++) {
      const call = await rawIdentityCall(ctx, strip?.frames, faceStrip, figureStrip);
      if (!call.ok) { console.log(`  sample ${i + 1}: ${call.error.slice(0, 80)}`); continue; }
      const v = parseIdentityVerdict(call.raw, ctx.sheets.map((x) => x.name));
      if (!v) { console.log(`  sample ${i + 1}: unparsable`); continue; }
      for (const c of v.entries) {
        const sim = Math.round((c.similarity ?? 0) * 100);
        sims.push(sim);
        faces.push(Math.round((c.aspects?.face ?? 0) * 100));
        styles.push(Math.round((c.aspects?.style ?? 0) * 100));
        console.log(`  sample ${i + 1}: ${c.characterName} sim=${sim} face=${Math.round((c.aspects?.face ?? 0) * 100)} style=${Math.round((c.aspects?.style ?? 0) * 100)}`);
      }
    }
    if (sims.length) {
      const sorted = [...sims].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const spread = sorted[sorted.length - 1] - sorted[0];
      console.log(`S00${s.number} SPREAD: n=${sims.length} samples=${JSON.stringify(sims)} median=${med} min=${sorted[0]} max=${sorted[sorted.length - 1]} spread=${spread} | face=${JSON.stringify(faces)} style=${JSON.stringify(styles)}`);
    }
  }
  await db.$disconnect();
})().catch((e) => { console.error("PROBE162 FAILED:", e); process.exit(1); });
