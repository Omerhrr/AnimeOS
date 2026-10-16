// SMOKE 221 - THE V4 LAW (the scene-presence guard) + the prompt law
// UNREMOVED, on the REAL production shots (E7 Sc12, the six cells).
// Pure - no model calls, no writes.
//
// Run: npx tsx scripts/smoke221-aikeyframe.ts
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_STYLE_PIN,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  buildKeyframePrompt,
} from "../src/lib/ai/keyframe";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

async function main() {
  console.log("SMOKE 221 - the v4 law on the six cells\n");

  assert(AI_KEYFRAME_LAW_VERSION === 4 && aiKeyframeCohort() === "kf-v4", "the law versions itself (kf-v4 - the scene-presence guard is the pixels' law)");

  const eps = await db.episode.findMany({ include: { season: true } });
  const ep = eps.find((e) => e.number === 7 && e.season?.number === 1);
  if (!ep) throw new Error("no ep7");
  const scenes = await db.scene.findMany({ where: { episodeId: ep.id } });
  const sc = scenes.find((s) => s.number === 12);
  if (!sc) throw new Error("no sc12");
  const shots = await db.shot.findMany({ where: { sceneId: sc.id }, orderBy: { number: "asc" } });
  if (shots.length !== 6) throw new Error(`expected 6 shots, found ${shots.length}`);

  console.log("- the six cells' prompt law (the 216-219 law UNREMOVED by v4):");
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
    assert(!p.includes("SCENE-PRESENCE LAW") && !p.includes("anchor probe"), `${tag} carries NO scene clause (the guard is a SELECTION law, never a prompt clause - the 219 refusal's own shape)`);
  }

  console.log("\n- the scoped laws (evidence-scoped, unchanged):");
  const prompts = new Map<number, string>();
  for (const sh of shots) {
    const built = await buildKeyframePrompt(sh.id);
    if (!built.ok) throw new Error(`S${sh.number}: ${built.error}`);
    prompts.set(sh.number, built.build.prompt);
  }
  assert(prompts.get(2)?.includes("SHADOW-DYE LAW") && prompts.get(3)?.includes("SHADOW-DYE LAW"), "S002+S003 carry the SHADOW-DYE LAW (218 stands)");
  assert(prompts.get(3)?.includes("model sheet's OWN simple stylized toon style"), "S003 carries the ONE-medium close-face target (218 stands)");
  assert(prompts.get(6)?.includes("MUST NOT mix, average, or swap"), "S006 carries the CONTRAST clause (215 stands)");

  await db.$disconnect();
  console.log(`\nSMOKE 221: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
