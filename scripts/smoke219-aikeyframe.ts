// SMOKE 219 - THE V3 PROMPT LAW (unchanged from v2 - the count CLAUSE
// did not earn its place) + THE GUARD'S SHAPE, on the REAL production
// shots (E7 Sc12, the six cells). Pure - no model calls, no writes.
//
// Run: npx tsx scripts/smoke219-aikeyframe.ts
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_STYLE_PIN,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  buildKeyframePrompt,
  selectShippedTake,
  parseFigureCount,
} from "../src/lib/ai/keyframe";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

async function main() {
  // THE 222 REBUILD GUARD: the sheeted prompts need the sheets - while
  // the restore's window-bound remainder stands, this smoke names the
  // state and exits honestly (the 222 law: the named pending state is
  // the honesty; the guard falls through when the sheets land).
  {
    const anySheet = await db.character.findFirst({ where: { modelSheetUrl: { not: null } }, select: { id: true } });
    if (!anySheet) {
      console.log("PENDING-WINDOW: the sheets are window-bound (the 222 restore receipt) - the sheeted prompt law re-asserts when the window opens");
      await db.$disconnect();
      process.exit(0);
    }
  }
  console.log("SMOKE 219 - the v3 law on the six cells\n");

  assert(AI_KEYFRAME_LAW_VERSION >= 3 && aiKeyframeCohort() === `kf-v${AI_KEYFRAME_LAW_VERSION}`, "the law versions itself (v3 at the 219 graduate; the pins advanced legitimately - the 221 record)");

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

  console.log("\n- the law every cell rides (the 218 prompt law UNREMOVED in v3):");
  for (const [n, p] of prompts) {
    assert(p.includes("SCENE ARTIFACT LAW"), `S${String(n).padStart(3, "0")} carries the ARTIFACT LAW`);
    assert(p.includes("FRAMING LAW"), `S${String(n).padStart(3, "0")} carries the FRAMING LAW (217 stands)`);
    assert(p.includes(AI_KEYFRAME_STYLE_PIN.slice(0, 60)), `S${String(n).padStart(3, "0")} carries the STYLE PIN (byte-exact)`);
    assert(p.includes("#2a5c52") || p.includes("#3b2d5c"), `S${String(n).padStart(3, "0")} carries the committed dye hexes`);
    assert(p.includes("GARMENT DYES"), `S${String(n).padStart(3, "0")} carries the dye clauses (216 stands)`);
  }

  console.log("\n- the refused arm stays refused (the 219A evidence):");
  for (const [n, p] of prompts) {
    assert(!p.includes("FIGURE-COUNT LAW"), `S${String(n).padStart(3, "0")} carries NO count clause (the gallery receipt refused it)`);
  }

  console.log("\n- the shadow-dye law (the gate's own dim families, 218 stands):");
  assert(prompts.get(2)?.includes("SHADOW-DYE LAW") ?? false, "S002 carries the SHADOW-DYE LAW");
  assert(prompts.get(3)?.includes("SHADOW-DYE LAW") ?? false, "S003 carries the SHADOW-DYE LAW");
  for (const n of [1, 4, 5, 6]) {
    assert(!(prompts.get(n)?.includes("SHADOW-DYE LAW") ?? true), `S${String(n).padStart(3, "0")} stays OFF the clause (evidence-scoped)`);
  }

  console.log("\n- the close-face law v2 (ONE medium target, 218 stands):");
  assert(prompts.get(3)?.includes("model sheet's OWN simple stylized toon style") ?? false, "S003 (CLOSEUP) carries the ONE-medium target");
  assert(!(prompts.get(3)?.includes("PAINTED CEL-ANIMATION ART") ?? true), "the wrong-medium 2D-cel words stay gone");

  console.log("\n- the weapon law (the draw beat owns the emission, 215/218 stand):");
  assert(prompts.get(1)?.includes("SHEATHED at the hip") ?? false, "S001 carries the sheathed-steel law");
  assert(!(prompts.get(5)?.includes("SHEATHED at the hip") ?? true), "S005 (the draw beat) carries NO sheathed law");

  console.log("\n- the contrast law (the two-figure cell, 215 stands):");
  assert(prompts.get(6)?.includes("MUST NOT mix, average, or swap") ?? false, "S006 (Lin + Wei) carries the CONTRAST clause");
  assert(!(prompts.get(2)?.includes("MUST NOT mix, average, or swap") ?? true), "S002 (solo) stays OFF the contrast clause");

  console.log("\n- the guard's own shape (the 219 law, pure teeth):");
  // the gallery case: the echo take loses to the true frame
  assert(selectShippedTake([{ ok: true, worst: 0.92, countedFigures: 3 }, { ok: true, worst: 0.85, countedFigures: 2 }], 2) === 1, "the guard demotes the echo take (92 counting 3 loses to 85 counting 2)");
  assert(selectShippedTake([{ ok: true, worst: 0.92, countedFigures: null }, { ok: true, worst: 0.85, countedFigures: null }], 2) === 0, "the abstaining guard restores the 218 behavior");
  assert(parseFigureCount("2") === 2 && parseFigureCount("none") === null, "the count parser reads a digit, refuses digitless answers");

  await db.$disconnect();
  console.log(`\nSMOKE 219: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
