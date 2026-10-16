// E2E 216 - THE AI-KEYFRAME RENDER SOURCE CLASS, end to end.
//
// Three legs:
//   1. THE LAW'S SHAPE (structural, no model): the third source
//      member, the one-bar function, the class's night engine naming
//      the source in the arc append, the gate reading it.
//   2. THE GATE AT THE SOURCE'S OWN BAR (lab receipt scope - the
//      production ledger untouched): a lab AI_KEYFRAME reading folded
//      into a lab receipt, episodeReleaseVerdict reading the arc at
//      the 0.7 floor, provisional at one night - the honest verdict.
//   3. ONE REAL KEYFRAME (S003, the anchor arm's landed cell):
//      generated FROM the committed sheet through the edit channel,
//      scored by the SAME instrument - the class working end to end,
//      read-only on production.
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter216-aikeyframe.ts
import fs from "fs";
import { db } from "../src/lib/db";
import {
  identityThresholdFor,
  type IdentitySource,
} from "../src/lib/identity";
import {
  AI_KEYFRAME_SOURCE,
  buildKeyframePrompt,
  generateKeyframeForShot,
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

const LAB_RECEIPT = "receipts/e2e-lab-216.jsonl";

async function main() {
  console.log("E2E 216 - the AI-keyframe render source class\n");
  console.log("LEG 1 - the law's shape (structural):");
  const keyframeSrc = fs.readFileSync("src/lib/ai/keyframe.ts", "utf8");
  const identitySrc = fs.readFileSync("src/lib/identity.ts", "utf8");
  const matrixSrc = fs.readFileSync("src/lib/identity-matrix.ts", "utf8");
  assert(identitySrc.includes('"PANEL" | "RENDER" | "AI_KEYFRAME"'), "the IdentitySource union carries the third member");
  assert(identitySrc.includes('source === "PANEL" ? IDENTITY_REPAINT_THRESHOLD : IDENTITY_RENDER_THRESHOLD'), "one bar function: the panel bar vs the shipping bar (the keyframe rides the shipping bar)");
  assert(matrixSrc.includes("identityThresholdFor(source)"), "the gate floors ride the one bar function (both floor sites)");
  assert(keyframeSrc.includes("source: AI_KEYFRAME_SOURCE"), "the night engine appends the arc WITH THE SOURCE NAMED");
  assert(keyframeSrc.includes("episodeReleaseVerdict(projectId, episodeId, AI_KEYFRAME_SOURCE"), "the night reads the SAME release gate at the source's own bar");
  assert(keyframeSrc.includes('c.modelSheetUrl') || keyframeSrc.includes(".filter((c) => c.modelSheetUrl)"), "the anchor rides sheets only (the clone ghost rides out in-class)");
  assert(keyframeSrc.includes("keyframeDyeClause") && keyframeSrc.includes("keyframeContrastClause") && keyframeSrc.includes("keyframeWeaponClause"), "the three arms ride the prompt law as named functions");
  assert(keyframeSrc.includes("images.generations.edit"), "the anchor channel is the edit channel (the sheet as base image)");
  const sources: IdentitySource[] = ["PANEL", "RENDER", "AI_KEYFRAME"];
  assert(sources.map(identityThresholdFor).join("/") === "0.6/0.7/0.7", "thresholds: panel 0.6, render 0.7, ai-keyframe 0.7");

  console.log("\nLEG 2 - the gate at the source's own bar (lab receipt scope):");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({
    where: { number: 12, episode: { number: 7 } },
  });
  if (!scene) throw new Error("E7 missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 1 } });
  if (!shot) throw new Error("S001 missing");

  // a lab reading: the class's own shape, ONE night, above the floor
  try { fs.unlinkSync(LAB_RECEIPT); } catch { /* absent - fine */ }
  writeArcReceiptLine(
    {
      projectId: project.id,
      source: AI_KEYFRAME_SOURCE,
      night: "night-216-lab",
      cohort: "lab216",
      worst: 0.85,
      scores: [
        { characterName: "Lin Yue", similarity: 0.85, aspects: { face: 0.9, hair: 0.85, wardrobe: 0.9, palette: 0.95, style: 0.8 }, note: "lab receipt - the class's own shape" },
      ],
      scoredAt: new Date().toISOString(),
      ref: { episode: 7, scene: 12, shot: 1 },
    },
    LAB_RECEIPT,
  );
  const folded = foldArcReceiptLines(fs.readFileSync(LAB_RECEIPT, "utf8").split("\n"));
  assert(folded.length === 1 && folded[0].source === "AI_KEYFRAME", "the lab receipt folds one AI_KEYFRAME line");
  const read = await episodeReleaseVerdict(project.id, scene.episodeId, AI_KEYFRAME_SOURCE, { receiptPath: LAB_RECEIPT });
  assert(read.floor === 0.7, `the gate's floor at the source's own bar: ${(read.floor * 100).toFixed(0)}%`);
  assert(read.arc === true, "the gate read the arc (not the pre-arc fallback)");
  assert(read.nights === 1 && read.provisional === true, "one night reads PROVISIONAL - a single-night read cannot carry a build decision");
  assert(read.readings >= 1, `the arc's readings joined: ${read.readings}`);
  console.log(`  the lab verdict: ${read.verdict} (the honest shape at one night)`);
  fs.unlinkSync(LAB_RECEIPT);
  console.log("  lab receipt removed - the production ledger untouched");

  console.log("\nLEG 3 - one real keyframe (S003, the anchor arm's landed cell):");
  const s3 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 3 } });
  if (!s3) throw new Error("S003 missing");
  const built = await buildKeyframePrompt(s3.id);
  assert(built.ok, "the prompt builds for S003");
  const gen = await generateKeyframeForShot(s3.id);
  assert(gen.ok, `the keyframe generates (${gen.ok ? `mode ${gen.recipe.mode}, anchored: [${gen.recipe.anchoredSheets.join(", ")}]` : "FAILED"})`);
  if (gen.ok) {
    assert(gen.recipe.mode === "anchored", "the recipe names the ANCHORED mode");
    assert(gen.recipe.anchoredSheets.includes("Lin Yue"), "Lin's committed sheet rode the edit channel");
    assert(gen.dataUrl.startsWith("data:image/png;base64,"), "the pixels ride as a data URL");
    const scored = await scoreAiKeyframeForShot(s3.id, 3);
    assert(scored.ok, `the SAME instrument scores the keyframe (${scored.ok ? `${scored.sampleCount} reads` : "FAILED"})`);
    if (scored.ok) {
      const cloneNames = scored.verdict.entries.filter((e) => /clone/i.test(e.characterName));
      assert(cloneNames.length === 0, "the judge is asked only about the SHEETED cast (no clone ghost in the entries)");
      for (const e of scored.verdict.entries) {
        const a = Object.entries(e.aspects ?? {}).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}`).join("/");
        console.log(`  ${e.characterName}: ${Math.round(e.similarity * 100)} [${a}]`);
      }
      console.log(`  S003 damped worst: ${Math.round(scored.verdict.worst * 100)} over ${scored.sampleCount} reads (floor 70)`);
      assert(scored.sampleCount >= 1 && scored.sampleCount <= 3, "the damped read count rides the samples cap");
    }
  }

  await db.$disconnect();
  console.log(`\nE2E 216: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
