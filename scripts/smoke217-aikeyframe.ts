// SMOKE 217 - THE PROMPT LAW CLAUSE-BY-CLAUSE ON THE REAL PRODUCTION
// SHOTS (read-only, no model calls).
//
// The six E7 Sc12 cells assert the 217 law exactly where it should
// ride: the FRAMING clause on ALL six (the presentation pull named on
// the board, not one cell), the CLOSE-FACE clause on the close rung
// ONLY (S003), the 216 arms (dye/contrast/weapon/style) unremoved,
// and the anchor-view side asserted through the rung + view map (the
// image-side wiring is the e2e's real-generation leg).
//
// Run: DATABASE_URL=file:... npx tsx scripts/smoke217-aikeyframe.ts
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_FRAMING_CLAUSE,
  buildKeyframePrompt,
  isCloseRung,
  keyframeCloseFaceClause,
} from "../src/lib/ai/keyframe";
import { detectCast } from "../src/lib/ai/art";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

const EXPECTED: Array<{ n: number; close: boolean; twoMembers: boolean }> = [
  { n: 1, close: false, twoMembers: false },
  { n: 2, close: false, twoMembers: false },
  { n: 3, close: true, twoMembers: false },
  { n: 4, close: false, twoMembers: false },
  { n: 5, close: false, twoMembers: false },
  { n: 6, close: false, twoMembers: true },
];

async function main() {
  console.log("SMOKE 217 - the prompt law on the real six cells\n");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } } });
  if (!scene) throw new Error("E7 Sc12 missing");

  for (const exp of EXPECTED) {
    const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: exp.n } });
    if (!shot) throw new Error(`S00${exp.n} missing`);
    const built = await buildKeyframePrompt(shot.id);
    assert(built.ok, `S00${exp.n}: the prompt builds`);
    if (!built.ok) continue;
    const p = built.build.prompt;
    const members = built.build.members;
    console.log(`S00${exp.n} [${shot.shotType}] members: ${members.map((m) => m.name).join(", ")}`);
    assert(p.includes("FRAMING LAW (binding)"), `S00${exp.n}: the FRAMING clause rides (every cell - the pull is board-wide)`);
    assert(p.includes(AI_KEYFRAME_FRAMING_CLAUSE.slice(0, 60)), `S00${exp.n}: the framing clause is the exported law (byte-exact)`);
    if (exp.close) {
      assert(p.includes("CLOSE-FACE LAW (binding)"), `S00${exp.n}: the CLOSE-FACE clause rides the close rung`);
    } else {
      assert(!p.includes("CLOSE-FACE LAW"), `S00${exp.n}: no close-face clause off the rung`);
    }
    assert(p.includes("COLOR LAW (binding") || members.every((m) => !m.dna?.robeColor), `S00${exp.n}: the dye law rides for the sheeted members (216 stands)`);
    assert(p.includes("Anime cel-shading style"), `S00${exp.n}: the STYLE PIN stands (214, byte-exact)`);
    if (exp.twoMembers) {
      assert(p.includes("MUST NOT mix, average, or swap"), `S00${exp.n}: the CONTRAST clause rides the two-member cell`);
    }
    // the rung logic agrees with the shot's own framing
    assert(isCloseRung(shot.shotType) === exp.close, `S00${exp.n}: the rung map reads ${shot.shotType} as ${exp.close ? "CLOSE" : "non-close"}`);
    // the close-face clause function agrees with the splice
    assert((keyframeCloseFaceClause(shot.shotType) !== null) === exp.close, `S00${exp.n}: the clause function agrees with the rung`);
    // the anchor members all carry sheets (the clone ghost rides out)
    assert(members.length > 0 && members.every((m) => m.sheetUrl), `S00${exp.n}: every anchor member carries a sheet`);
  }

  await db.$disconnect();
  console.log(`\nSMOKE 217: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
