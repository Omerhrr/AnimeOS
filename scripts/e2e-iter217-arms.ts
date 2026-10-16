// E2E 217 - THE PRESENTATION-PULL ARMS, end to end.
//
// Three legs:
//   1. THE LAW'S SHAPE (structural, no model): the framing clause, the
//      close-face clause, the anchor-view law's wiring (the 121 view
//      convention exported and riding both sides), the 216 class
//      unremoved beneath.
//   2. THE TWO-NIGHT EXIT (lab receipt scope): TWO nights in a lab
//      receipt - the gate reads nights 2, PROVISIONAL exits - the
//      second-night law's own assert, the 216 lab leg's honest twin.
//   3. ONE REAL KEYFRAME (S003, the close rung): the anchor-view law
//      rides END TO END - the recipe names the view receipt
//      ("Lin Yue:close"), the SAME instrument scores, read-only.
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter217-arms.ts
import fs from "fs";
import { db } from "../src/lib/db";
import {
  framingViewFor,
  framingViewUrl,
  identityThresholdFor,
} from "../src/lib/identity";
import {
  AI_KEYFRAME_SOURCE,
  AI_KEYFRAME_FRAMING_CLAUSE,
  buildKeyframePrompt,
  generateKeyframeForShot,
  isCloseRung,
  keyframeCloseFaceClause,
  scoreAiKeyframeForShot,
} from "../src/lib/ai/keyframe";
import {
  writeArcReceiptLine,
  foldArcReceiptLines,
} from "../src/lib/identity-arc";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

const LAB_RECEIPT = "receipts/e2e-lab-217.jsonl";

async function main() {
  console.log("E2E 217 - the presentation-pull arms\n");
  console.log("LEG 1 - the law's shape (structural):");
  const keyframeSrc = fs.readFileSync("src/lib/ai/keyframe.ts", "utf8");
  const identitySrc = fs.readFileSync("src/lib/identity.ts", "utf8");
  // the 216 class still stands beneath
  assert(identitySrc.includes('"PANEL" | "RENDER" | "AI_KEYFRAME"'), "the 216 union stands (three members)");
  assert(keyframeSrc.includes("source: AI_KEYFRAME_SOURCE"), "the night appends WITH THE SOURCE NAMED (216 stands)");
  assert(keyframeSrc.includes("keyframeDyeClause") && keyframeSrc.includes("keyframeContrastClause") && keyframeSrc.includes("keyframeWeaponClause"), "the 216 arms stand (dye/contrast/weapon)");
  // the 217 arms
  assert(keyframeSrc.includes("AI_KEYFRAME_FRAMING_CLAUSE") && AI_KEYFRAME_FRAMING_CLAUSE.includes("NOT a character model sheet"), "the FRAMING CLAUSE rides the prompt law (the film frame named)");
  assert(keyframeSrc.includes("keyframeCloseFaceClause(shot.shotType)") && keyframeCloseFaceClause("CLOSEUP") !== null, "the CLOSE-FACE clause rides the CLOSE rung");
  assert(keyframeCloseFaceClause("MEDIUM") === null && keyframeCloseFaceClause("WIDE") === null, "the CLOSE-FACE clause stays OFF the wide rungs (framing-conditional)");
  assert(keyframeSrc.includes("keyframeCloseFaceClause(shot.shotType)"), "the close-face clause is spliced in the builder");
  assert(typeof isCloseRung === "function" && isCloseRung("CLOSEUP") && !isCloseRung("ESTABLISHING"), "the CLOSE rung map rides (the 121 view letter's own set)");
  assert(/export function framingViewUrl/.test(identitySrc), "the 121 view convention is EXPORTED (one function, both sides)");
  assert(keyframeSrc.includes("framingViewUrl({ designSheetUrl: m.designSheetUrl, modelSheetUrl: m.sheetUrl }, viewName)"), "the anchor-view law rides the SAME convention (design turnaround first)");
  assert(keyframeSrc.includes("anchorViews.push(") && keyframeSrc.includes("anchorViews"), "the anchor-view receipt lands in the recipe");
  assert(keyframeSrc.includes("anchorViews: scored.recipe.anchorViews"), "the night result carries the anchor-view receipt");
  assert(framingViewFor("CLOSEUP") === "close" && framingViewFor("MEDIUM") === "three" && framingViewFor("ESTABLISHING") === "front", "the view map letters unchanged (close/three/front)");
  const probeUrl = framingViewUrl({ designSheetUrl: "/designs/x/r2/turn_sheet.png", modelSheetUrl: null }, "close");
  assert(probeUrl === "/designs/x/r2/turn_close.png", `the convention resolves the view (${probeUrl})`);
  assert(framingViewUrl({ designSheetUrl: null, modelSheetUrl: "/sheets/plain.png?v=1" }, "close") === null, "a plain sheet carries no views (the honest fallback)");

  console.log("\nLEG 2 - the two-night exit (lab receipt scope):");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } } });
  if (!scene) throw new Error("E7 missing");
  try { fs.unlinkSync(LAB_RECEIPT); } catch { /* absent - fine */ }
  for (const night of ["night-217-lab-a", "night-217-lab-b"]) {
    writeArcReceiptLine(
      {
        projectId: project.id,
        source: AI_KEYFRAME_SOURCE,
        night,
        cohort: "lab217",
        worst: 0.85,
        scores: [
          { characterName: "Lin Yue", similarity: 0.85, aspects: { face: 0.9, hair: 0.85, wardrobe: 0.9, palette: 0.95, style: 0.8 }, note: `lab receipt - ${night}` },
        ],
        scoredAt: new Date().toISOString(),
        ref: { episode: 7, scene: 12, shot: 1 },
      },
      LAB_RECEIPT,
    );
  }
  const folded = foldArcReceiptLines(fs.readFileSync(LAB_RECEIPT, "utf8").split("\n"));
  assert(folded.length === 2, "the lab receipt folds TWO nights");
  const read = await episodeReleaseVerdict(project.id, scene.episodeId, AI_KEYFRAME_SOURCE, { receiptPath: LAB_RECEIPT });
  assert(read.nights === 2, `the gate counts two nights (${read.nights})`);
  assert(read.provisional === false, "PROVISIONAL EXITS at the second night (the 141 band's own answer)");
  console.log(`  the lab verdict: ${read.verdict} (two nights, the arc's own median)`);
  fs.unlinkSync(LAB_RECEIPT);
  console.log("  lab receipt removed - the production ledger untouched");

  console.log("\nLEG 3 - one real keyframe (S003, the CLOSE rung, the anchor-view law end to end):");
  const s3 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 3 } });
  if (!s3) throw new Error("S003 missing");
  const built = await buildKeyframePrompt(s3.id);
  assert(built.ok, "the prompt builds for S003");
  if (built.ok) {
    assert(built.build.prompt.includes("FRAMING LAW"), "S003's prompt carries the FRAMING LAW");
    assert(built.build.prompt.includes("CLOSE-FACE LAW"), "S003's prompt carries the CLOSE-FACE LAW (the close rung)");
  }
  const s2 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 2 } });
  if (s2) {
    const built2 = await buildKeyframePrompt(s2.id);
    if (built2.ok) {
      assert(built2.build.prompt.includes("FRAMING LAW"), "S002's prompt carries the FRAMING LAW");
      assert(!built2.build.prompt.includes("CLOSE-FACE LAW"), "S002's prompt does NOT carry the CLOSE-FACE LAW (medium rung)");
    }
  }
  const gen = await generateKeyframeForShot(s3.id);
  assert(gen.ok, `the keyframe generates (${gen.ok ? `mode ${gen.recipe.mode}, anchored: [${gen.recipe.anchoredSheets.join(", ")}], views: [${(gen.recipe.anchorViews ?? []).join(", ")}]` : "FAILED"})`);
  if (gen.ok) {
    assert(gen.recipe.mode === "anchored", "the recipe names the ANCHORED mode");
    assert(gen.recipe.anchoredSheets.includes("Lin Yue"), "Lin's committed sheet rode (the wardrobe/dye carrier)");
    assert((gen.recipe.anchorViews ?? []).includes("Lin Yue:close"), "the ANCHOR-VIEW receipt: Lin's close view rode as the second anchor");
    assert(gen.dataUrl.startsWith("data:image/png;base64,"), "the pixels ride as a data URL");
    const scored = await scoreAiKeyframeForShot(s3.id, 3);
    assert(scored.ok, `the SAME instrument scores the keyframe (${scored.ok ? `${scored.sampleCount} reads` : "FAILED"})`);
    if (scored.ok) {
      const cloneNames = scored.verdict.entries.filter((e) => /clone/i.test(e.characterName));
      assert(cloneNames.length === 0, "the judge is asked only about the SHEETED cast (no clone ghost)");
      for (const e of scored.verdict.entries) {
        const a = Object.entries(e.aspects ?? {}).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}`).join("/");
        console.log(`  ${e.characterName}: ${Math.round(e.similarity * 100)} [${a}]`);
      }
      console.log(`  S003 damped worst: ${Math.round(scored.verdict.worst * 100)} over ${scored.sampleCount} reads (floor 70)`);
      assert(scored.recipe.anchorViews?.includes("Lin Yue:close"), "the scored recipe keeps the anchor-view receipt");
    }
  }

  await db.$disconnect();
  console.log(`\nE2E 217: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
