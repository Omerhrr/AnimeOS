// SMOKE 216 - THE AI-KEYFRAME PROMPT LAW ON THE REAL PRODUCTION SHOTS.
// Read-only: no generation, no writes - the class's prompt builder is
// asserted clause by clause against the committed sheets' own DNA.
// Run: DATABASE_URL=file:... npx tsx scripts/smoke216-aikeyframe.ts
import { db } from "../src/lib/db";
import { buildKeyframePrompt } from "../src/lib/ai/keyframe";
import { identityThresholdFor, identityBarLabelFor } from "../src/lib/identity";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  PASS: ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL: ${label}`);
  }
}

async function main() {
  console.log("SMOKE 216 - the keyframe prompt law (read-only)\n");

  // the bar law: one function, every source answers its own line
  assert(identityThresholdFor("PANEL") === 0.6, "PANEL answers the 0.6 repaint bar");
  assert(identityThresholdFor("RENDER") === 0.7, "RENDER answers the 0.7 shipping bar");
  assert(identityThresholdFor("AI_KEYFRAME") === 0.7, "AI_KEYFRAME answers the 0.7 shipping bar (candidate shipping pixels, not a plan)");
  assert(identityBarLabelFor("AI_KEYFRAME") === "70% ai-keyframe", "the bar's words name the ai-keyframe line");

  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({
    where: { number: 12, episode: { number: 7 } },
    include: { environment: true },
  });
  if (!scene) throw new Error("E7 Sc12 missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  const shotByNum = (n: number) => shots.find((s) => s.number === n)!;

  // S001 - the establishing cell: the dye clause + the SHEATHED weapon clause
  const s1 = await buildKeyframePrompt(shotByNum(1).id);
  assert(s1.ok, "S001 prompt builds");
  if (s1.ok) {
    assert(s1.build.prompt.includes("#2a5c52"), "S001 carries Lin's committed robe dye #2a5c52 as binding color law");
    assert(s1.build.prompt.includes("SHEATHED"), "S001 carries the weapon law (the draw beat owns the emission)");
    assert(s1.build.prompt.includes("model sheet(s)"), "S001 names the anchor instruction");
    assert(s1.build.members.length === 1 && s1.build.members[0].name === "Lin Yue", "S001's anchors: Lin's sheet only (the clone ghost rides out)");
    assert(!s1.build.prompt.includes("MUST NOT mix"), "S001 (one member) rides no contrast clause");
  }

  // S005 - the draw beat: NO sheathed clause (the shot's own language owns the emission)
  const s5 = await buildKeyframePrompt(shotByNum(5).id);
  assert(s5.ok, "S005 prompt builds");
  if (s5.ok) {
    assert(!s5.build.prompt.includes("SHEATHED"), "S005 (the draw beat) rides no sheathed law - the azure coil is the beat");
  }

  // S006 - the two-shot: BOTH dyes + the contrast clause + both anchors
  const s6 = await buildKeyframePrompt(shotByNum(6).id);
  assert(s6.ok, "S006 prompt builds");
  if (s6.ok) {
    assert(s6.build.prompt.includes("#2a5c52") && s6.build.prompt.includes("#3b2d5c"), "S006 carries BOTH members' committed dyes");
    assert(s6.build.prompt.includes("MUST NOT mix"), "S006 (two members) rides the contrast clause");
    assert(s6.build.members.length === 2, "S006 anchors BOTH sheeted members (the images array)");
    assert(s6.build.members.every((m) => !!m.sheetUrl), "S006's anchors all name a committed sheet file");
  }

  await db.$disconnect();
  console.log(`\nSMOKE 216: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
