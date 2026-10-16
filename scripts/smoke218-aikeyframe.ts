// SMOKE 218 - THE V2 PROMPT LAW, clause by clause, on the REAL
// production shots (E7 Sc12, the six cells). Pure - no model calls,
// no writes. The law's own receipts asserted where they ride.
//
// Run: npx tsx scripts/smoke218-aikeyframe.ts
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
  console.log("SMOKE 218 - the v2 prompt law on the six cells\n");

  assert(AI_KEYFRAME_LAW_VERSION >= 2 && aiKeyframeCohort() === `kf-v${AI_KEYFRAME_LAW_VERSION}`, "the law versions itself (v2 at the 218 graduate; the pins advanced legitimately - the 221 record)");

  const eps = await db.episode.findMany({ include: { season: true } });
  const ep = eps.find((e) => e.number === 7 && e.season?.number === 1);
  if (!ep) throw new Error("no ep7");
  const scenes = await db.scene.findMany({ where: { episodeId: ep.id } });
  const sc = scenes.find((s) => s.number === 12);
  if (!sc) throw new Error("no sc12");
  const shots = await db.shot.findMany({ where: { sceneId: sc.id }, orderBy: { number: "asc" } });
  if (shots.length !== 6) throw new Error(`expected 6 shots, found ${shots.length}`);

  const prompts = new Map<number, string>();
  for (const sh of shots) {
    const built = await buildKeyframePrompt(sh.id);
    if (!built.ok) throw new Error(`S${sh.number}: ${built.error}`);
    prompts.set(sh.number, built.build.prompt);
    console.log(`S${String(sh.number).padStart(3, "0")} built (${built.build.prompt.length} chars, members: ${built.build.members.map((m) => m.name).join("+")})`);
  }

  console.log("\n- the law every cell rides:");
  for (const [n, p] of prompts) {
    assert(p.includes("SCENE ARTIFACT LAW"), `S${String(n).padStart(3, "0")} carries the ARTIFACT LAW`);
    assert(p.includes("FRAMING LAW"), `S${String(n).padStart(3, "0")} carries the FRAMING LAW (217 stands)`);
    assert(p.includes(AI_KEYFRAME_STYLE_PIN.slice(0, 60)), `S${String(n).padStart(3, "0")} carries the STYLE PIN (byte-exact)`);
    assert(p.includes("#2a5c52") || p.includes("#3b2d5c"), `S${String(n).padStart(3, "0")} carries the committed dye hexes`);
    assert(p.includes("GARMENT DYES"), `S${String(n).padStart(3, "0")} carries the dye clauses (216 stands)`);
  }

  console.log("\n- the shadow-dye law (the 218 arm, the gate's own dim families):");
  assert(prompts.get(2)?.includes("SHADOW-DYE LAW") ?? false, "S002 (Backlight + interior shadows -> shadow) carries the SHADOW-DYE LAW");
  assert(prompts.get(2)?.includes("Lin Yue's robe stays exactly #2a5c52") ?? false, "S002's clause names Lin's committed hex");
  assert(prompts.get(3)?.includes("SHADOW-DYE LAW") ?? false, "S003 (Cold key, deep shadow -> shadow) carries the SHADOW-DYE LAW");
  for (const n of [1, 4, 5, 6]) {
    assert(!(prompts.get(n)?.includes("SHADOW-DYE LAW") ?? true), `S${String(n).padStart(3, "0")} stays OFF the clause (storm/emission families - evidence-scoped)`);
  }

  console.log("\n- the close-face law v2 (ONE medium target):");
  assert(prompts.get(3)?.includes("model sheet's OWN simple stylized toon style") ?? false, "S003 (CLOSEUP) carries the ONE-medium target (the M2 evidence)");
  assert(!(prompts.get(3)?.includes("PAINTED CEL-ANIMATION ART") ?? true), "the wrong-medium 2D-cel words are gone from the real prompt");
  assert(!(prompts.get(2)?.includes("CLOSE-FACE LAW") ?? true), "S002 (MEDIUM) stays OFF the close-face clause");

  console.log("\n- the weapon law (the draw beat owns the emission):");
  assert(prompts.get(1)?.includes("SHEATHED at the hip") ?? false, "S001 carries the sheathed-steel law (216 stands)");
  assert(!(prompts.get(5)?.includes("SHEATHED at the hip") ?? true), "S005 (the draw beat) carries NO sheathed law - the beat owns the emission");

  console.log("\n- the contrast law (the two-figure cell):");
  assert(prompts.get(6)?.includes("MUST NOT mix, average, or swap") ?? false, "S006 (Lin + Wei) carries the CONTRAST clause (215 stands)");
  assert(!(prompts.get(2)?.includes("MUST NOT mix, average, or swap") ?? true), "S002 (solo) stays OFF the contrast clause");

  await db.$disconnect();
  console.log(`\nSMOKE 218: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
