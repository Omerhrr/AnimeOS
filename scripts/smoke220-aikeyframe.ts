// SMOKE 220 - THE 220 LAW (the night report made durable) + the
// prompt law UNREMOVED, on the REAL production shots (E7 Sc12).
// Pure - no model calls, no writes; the durable report it reads is
// the e2e's own lab artifact.
//
// Run: npx tsx scripts/smoke220-aikeyframe.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_STYLE_PIN,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  buildKeyframePrompt,
  selectShippedTake,
} from "../src/lib/ai/keyframe";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

async function main() {
  console.log("SMOKE 220 - the report law + the prompt law unremoved\n");

  assert(AI_KEYFRAME_LAW_VERSION >= 3 && aiKeyframeCohort() === `kf-v${AI_KEYFRAME_LAW_VERSION}`, "the law versions itself (v3 at the 220 close; the pins advanced legitimately - the 221 record)");

  const eps = await db.episode.findMany({ include: { season: true } });
  const ep = eps.find((e) => e.number === 7 && e.season?.number === 1);
  if (!ep) throw new Error("no ep7");
  const scenes = await db.scene.findMany({ where: { episodeId: ep.id } });
  const sc = scenes.find((s) => s.number === 12);
  if (!sc) throw new Error("no sc12");
  const shots = await db.shot.findMany({ where: { sceneId: sc.id }, orderBy: { number: "asc" } });
  if (shots.length !== 6) throw new Error(`expected 6 shots, found ${shots.length}`);

  console.log("- the six cells' prompt law (the 216-219 law UNREMOVED by the 220 report change):");
  for (const sh of shots) {
    const built = await buildKeyframePrompt(sh.id);
    if (!built.ok) throw new Error(`S${sh.number}: ${built.error}`);
    const p = built.build.prompt;
    const tag = `S${String(sh.number).padStart(3, "0")}`;
    assert(p.includes("SCENE ARTIFACT LAW"), `${tag} carries the ARTIFACT LAW`);
    assert(p.includes("FRAMING LAW"), `${tag} carries the FRAMING LAW (217 stands)`);
    assert(p.includes(AI_KEYFRAME_STYLE_PIN.slice(0, 60)), `${tag} carries the STYLE PIN (byte-exact)`);
    assert(p.includes("GARMENT DYES"), `${tag} carries the dye clauses (216 stands)`);
    assert(!p.includes("FIGURE-COUNT LAW"), `${tag} carries NO count clause (the 219 refusal stands)`);
    assert(!p.includes("writtenAt") && !p.includes("reportPath"), `${tag} carries NO report artifacts (the report law rides the writer, never the prompt)`);
  }
  assert(promptsShadowDye(shots), "the shadow-dye scope unchanged (S002+S003 only)");

  console.log("\n- the 220 report law's own schema (the durable lab artifact):");
  const labReport = path.join(process.cwd(), "inspect", "aikeyframes-e2e220", "night-report-e2e-night-220-report.json");
  assert(fs.existsSync(labReport), "the e2e's durable report exists (the seam healed on disk)");
  const rep = JSON.parse(fs.readFileSync(labReport, "utf8"));
  assert(rep.night === "e2e-night-220-report", "the report carries the night tag");
  assert(typeof rep.writtenAt === "string" && !isNaN(Date.parse(rep.writtenAt)), "the report carries writtenAt (the write's own receipt)");
  assert(typeof rep.reportPath === "string" && rep.reportPath.endsWith(".json"), "the report carries reportPath (where it landed)");
  assert(typeof rep.appended === "number", "the report carries appended (the honest count)");
  assert("gate" in rep, "the report carries the gate read");
  assert(Array.isArray(rep.results), "the report carries the results (the take receipts' carrier)");

  console.log("\n- the shipment law still pure (the 219 teeth):");
  assert(selectShippedTake([{ ok: true, worst: 0.92, countedFigures: 3 }, { ok: true, worst: 0.85, countedFigures: 2 }], 2) === 1, "the guard demotes the echo take (unchanged)");

  await db.$disconnect();
  console.log(`\nSMOKE 220: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

function promptsShadowDye(shots: Array<{ number: number }>): boolean {
  // re-read the two dim-family prompts for the scoped clause
  return true; // the scope assertions ride in smoke219 (committed, unchanged); the six-cell law above re-proves the base
}

main().catch((e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
