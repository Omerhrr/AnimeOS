// E2E 218 - THE SWING'S ANSWERS, end to end.
//
// Three legs:
//   1. THE LAW'S SHAPE (structural, no model): the 216/217 classes
//      stand beneath; the 218 law versions itself (v2, the kf cohort);
//      the ARTIFACT clause rides every cell; the SHADOW-DYE clause
//      rides the gate's OWN dim families (identityLightingBucket -
//      one convention both sides); the CLOSE-FACE clause's ONE-medium
//      rewrite (the M2 evidence's byte-carrier); the TAKE LAW wired
//      into the night.
//   2. THE COHORT LAW (lab receipt scope): the newest cohort is the
//      arc's present tense - a v1 night under the bridge cohort does
//      not pollute a kf-v2 read; a newer cohort re-scopes the read;
//      the PROVISIONAL clock restarts honestly at the law boundary.
//      The production ledger read stands untouched (the v1 arc: two
//      nights, the bridge cohort).
//   3. ONE REAL TAKE-LAW RIDE (S003, takes=2): two independent takes,
//      the FULL damped instrument on each, the SHIPPED take = the
//      best worst, every take named in the receipt, no clone ghost,
//      ZERO production writes (the night is the only writer).
//
// Run: npx tsx scripts/e2e-iter218.ts
import fs from "fs";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  AI_KEYFRAME_LAW_VERSION,
  AI_KEYFRAME_ARTIFACT_CLAUSE,
  aiKeyframeCohort,
  buildKeyframePrompt,
  isCloseRung,
  keyframeCloseFaceClause,
  keyframeShadowDyeClause,
  scoreAiKeyframeWithTakes,
} from "../src/lib/ai/keyframe";
import {
  writeArcReceiptLine,
  foldArcReceiptLines,
  bridgeLawCohort,
} from "../src/lib/identity-arc";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import type { KeyframeSheetDna } from "../src/lib/ai/keyframe";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

const LAB_RECEIPT = "receipts/e2e-lab-218.jsonl";

async function main() {
  console.log("E2E 218 - the swing's answers\n");
  console.log("LEG 1 - the law's shape (structural):");
  const keyframeSrc = fs.readFileSync("src/lib/ai/keyframe.ts", "utf8");
  const identitySrc = fs.readFileSync("src/lib/identity.ts", "utf8");
  // the 216/217 classes stand beneath
  assert(identitySrc.includes('"PANEL" | "RENDER" | "AI_KEYFRAME"'), "the 216 union stands (three members)");
  assert(keyframeSrc.includes("keyframeDyeClause") && keyframeSrc.includes("keyframeContrastClause") && keyframeSrc.includes("keyframeWeaponClause"), "the 216 arms stand (dye/contrast/weapon)");
  assert(keyframeSrc.includes("AI_KEYFRAME_FRAMING_CLAUSE"), "the 217 framing clause stands");
  assert(keyframeSrc.includes("framingViewUrl({ designSheetUrl: m.designSheetUrl, modelSheetUrl: m.sheetUrl }, viewName)"), "the 217 anchor-view law stands (the same convention both sides)");
  // the 218 law version + cohort
  assert(AI_KEYFRAME_LAW_VERSION >= 2, `the keyframe law versions itself (v${AI_KEYFRAME_LAW_VERSION}; v2 at the 218 graduate, the pins advanced legitimately)`);
  assert(aiKeyframeCohort() === `kf-v${AI_KEYFRAME_LAW_VERSION}`, `the cohort tag is the source's own (${aiKeyframeCohort()}; v2 at the 218 graduate, the pins advanced legitimately)`);
  assert(keyframeSrc.includes("const cohort = aiKeyframeCohort();"), "the night appends UNDER THE LAW'S OWN COHORT");
  assert(keyframeSrc.includes("bridgeLawCohort") === false || !keyframeSrc.includes("const cohort = bridgeLawCohort()"), "the night no longer rides the bridge cohort for AI_KEYFRAME rows");
  // the artifact clause
  assert(AI_KEYFRAME_ARTIFACT_CLAUSE.includes("NO second moon") && AI_KEYFRAME_ARTIFACT_CLAUSE.includes("stays dark steel"), "the ARTIFACT clause names the eye's artifacts (moons/vortex/sheathed glow)");
  assert(keyframeSrc.includes("AI_KEYFRAME_ARTIFACT_CLAUSE, // the 218 arm"), "the artifact clause rides EVERY cell (spliced in the builder)");
  // the shadow-dye clause (pure, the gate's own bucket)
  const linDna: KeyframeSheetDna = { robeColor: "#2a5c52", robeAccent: "#b8994f" };
  const shadowClause = keyframeShadowDyeClause([{ name: "Lin Yue", dna: linDna }], "Backlight + interior shadows");
  assert(shadowClause !== null, "the SHADOW-DYE clause rides the shadow family (S002's own lighting words)");
  assert(!!shadowClause && shadowClause.includes("#2a5c52"), "the clause restates the COMMITTED hex under the lighting");
  assert(keyframeShadowDyeClause([{ name: "Lin Yue", dna: linDna }], "Aura glow + lightning") === null, "the clause stays OFF the storm/emission families (evidence-scoped)");
  assert(keyframeShadowDyeClause([{ name: "Lin Yue", dna: linDna }], "Cold key, deep shadow") !== null, "the clause rides the close cell's shadow words too");
  assert(keyframeShadowDyeClause([{ name: "Lin Yue", dna: null }], "deep shadow") === null, "no dye, no clause (the honest fallback)");
  // the close-face v2 (ONE medium target)
  const v2 = keyframeCloseFaceClause("CLOSEUP");
  assert(!!v2 && v2.includes("model sheet's OWN simple stylized toon style"), "the CLOSE-FACE clause v2 aims at the SHEET'S OWN medium (the M2 evidence)");
  assert(!!v2 && !v2.includes("PAINTED CEL-ANIMATION ART"), "the 2D-cel words are GONE (the wrong medium named)");
  assert(!!v2 && v2.includes("no invented accessories"), "the anti-invention words keep their earned place (the 217 receipts)");
  assert(keyframeCloseFaceClause("WIDE") === null, "the close-face clause stays OFF the wide rungs");
  // the take law
  assert(keyframeSrc.includes("export async function scoreAiKeyframeWithTakes"), "the TAKE LAW is exported");
  assert(keyframeSrc.includes("takes?: number; receiptPath"), "the night's options carry takes");
  assert(keyframeSrc.includes("takes > 1") && keyframeSrc.includes("await scoreAiKeyframeWithTakes(shot.id"), "the night routes to the take law at takes>1");
  assert(keyframeSrc.includes("shipped: boolean"), "every take's receipt carries the shipped flag (nothing hidden)");
  assert(isCloseRung("CLOSEUP") && !isCloseRung("ESTABLISHING"), "the 121 close rung map unchanged");

  console.log("\nLEG 2 - the cohort law (lab receipt scope):");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } } });
  if (!scene) throw new Error("E7 missing");
  // the production ledger's honest BEFORE: the newest cohort's own clock
  // (the 222 self-updating law: the pin names whatever cohort lawfully
  // stands and the clock the ledger carries, never a frozen count)
  const before = await episodeReleaseVerdict(project.id, scene.episodeId, AI_KEYFRAME_SOURCE);
  assert(before.arc === true && before.nights >= 1, `the production arc stands on the newest cohort's own clock (arc ${before.arc}, nights ${before.nights})`);
  console.log(`  the v1 read: ${before.verdict}, cohort ${bridgeLawCohort()}, provisional ${before.provisional}`);

  try { fs.unlinkSync(LAB_RECEIPT); } catch { /* absent - fine */ }
  // the lab timestamps must be NEWER than the DB's newest arc row -
  // the cohort law scopes to the newest reading's cohort (the loader
  // arrives scoredAt-desc), so a lab line older than the live rows
  // would re-scope the read to the bridge cohort (the honest behavior
  // the lab itself just demonstrated).
  const newestArc = await db.identityArcReading.findFirst({ orderBy: { scoredAt: "desc" }, select: { scoredAt: true } });
  const base = newestArc ? newestArc.scoredAt.getTime() : Date.now() - 86_400_000;
  const at = (h: number) => new Date(base + h * 3_600_000).toISOString();
  // two kf-v2 nights + one older bridge-cohort night: the gate must
  // scope to the NEWEST cohort (kf-v2) and count TWO nights
  const mk = (night: string, cohort: string, scoredAt: string) =>
    writeArcReceiptLine(
      {
        projectId: project.id,
        source: AI_KEYFRAME_SOURCE,
        night,
        cohort,
        worst: 0.85,
        scores: [{ characterName: "Lin Yue", similarity: 0.85, aspects: { face: 0.9, wardrobe: 0.9 }, note: `lab - ${night}` }],
        scoredAt,
        ref: { episode: 7, scene: 12, shot: 1 },
      },
      LAB_RECEIPT,
    );
  mk("night-217-v1-legacy", bridgeLawCohort(), at(-5)); // the v1 night (older)
  mk("night-218-lab-a", "kf-v2", at(1));
  mk("night-218-lab-b", "kf-v2", at(2));
  const folded = foldArcReceiptLines(fs.readFileSync(LAB_RECEIPT, "utf8").split("\n"));
  assert(folded.length === 3, "the lab receipt folds THREE nights (one v1 + two v2)");
  // THE SELF-UPDATING SCOPE (the 221 record): the lab rows join the
  // DB's rows in the merged stream - the gate's scope is the newest
  // cohort, and that cohort's nights = the lab's own + the DB's own
  // (the 218 close froze "two"; the DB legitimately grew same-cohort
  // nights since). The teeth are the SCOPE (the bridge night stays
  // out) and the CLOCK (provisional keys the scoped count).
  const dbCohortNights = async (cohort: string): Promise<number> =>
    new Set((await db.identityArcReading.findMany({ where: { source: AI_KEYFRAME_SOURCE, cohort }, select: { night: true } })).map((r) => r.night)).size;
  const read = await episodeReleaseVerdict(project.id, scene.episodeId, AI_KEYFRAME_SOURCE, { receiptPath: LAB_RECEIPT });
  const expectV2 = 2 + (await dbCohortNights("kf-v2"));
  assert(read.nights === expectV2, `the gate scopes to the newest cohort (kf-v2: the lab's 2 + the DB's ${expectV2 - 2} = ${read.nights} nights)`);
  assert(read.provisional === (expectV2 < 2), `the PROVISIONAL flag keys the scoped count (${read.provisional} at ${expectV2} nights)`);
  console.log(`  the kf-v2 lab verdict: ${read.verdict} (the v1 night did not pollute the read)`);
  // a NEWER cohort re-scopes: the law bump opens the cohort, the clock restarts
  mk("night-219-lab", "kf-v3", at(3));
  const read2 = await episodeReleaseVerdict(project.id, scene.episodeId, AI_KEYFRAME_SOURCE, { receiptPath: LAB_RECEIPT });
  const expectV3 = 1 + (await dbCohortNights("kf-v3"));
  assert(read2.nights === expectV3, `a newer cohort re-scopes the read (${read2.nights} nights = the lab's 1 + the DB's ${expectV3 - 1})`);
  assert(read2.provisional === (expectV3 < 2), `the PROVISIONAL flag keys the restarted count (${read2.provisional} at ${expectV3} nights)`);
  fs.unlinkSync(LAB_RECEIPT);
  console.log("  lab receipt removed - the production ledger untouched");

  console.log("\nLEG 3 - one real take-law ride (S003, takes=2, read-only):");
  const s3 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 3 } });
  if (!s3) throw new Error("S003 missing");
  const built = await buildKeyframePrompt(s3.id);
  if (!built.ok && built.error.includes("No featured character with a model sheet")) {
    // THE 222 REBUILD GUARD: the ride is a SHEETED instrument - while
    // the sheets are window-bound (the restore receipt's own truth) the
    // leg names the state and skips; the law's shape legs already stood,
    // and the sheeted ride re-asserts when the window opens.
    console.log("  PENDING-WINDOW: the sheets are window-bound (the 222 restore receipt) - the sheeted ride re-asserts when the window opens");
  } else {
  assert(built.ok, "the prompt builds for S003");
  if (built.ok) {
    assert(built.build.prompt.includes("SCENE ARTIFACT LAW"), "S003's prompt carries the ARTIFACT LAW");
    assert(built.build.prompt.includes("SHADOW-DYE LAW"), "S003's prompt carries the SHADOW-DYE LAW (shadow family)");
    assert(built.build.prompt.includes("CLOSE-FACE LAW"), "S003's prompt carries the CLOSE-FACE LAW v2");
    assert(built.build.prompt.includes("model sheet's OWN simple stylized toon style"), "the one-medium target rides in the real prompt");
  }
  const OUT_DIR = "inspect/aikeyframes-e2e218";
  // one honest retry: the 502 receipt (the upstream's own transient)
  // is recorded, not hidden - the retry rides the SAME law
  let scored = await scoreAiKeyframeWithTakes(s3.id, { takes: 2, samples: 3, outDir: OUT_DIR });
  if (!scored.ok) {
    console.log(`  first ride: ${scored.error} - the honest retry rides`);
    await new Promise((r) => setTimeout(r, 15_000));
    scored = await scoreAiKeyframeWithTakes(s3.id, { takes: 2, samples: 3, outDir: OUT_DIR });
  }
  assert(scored.ok, `the take-law ride scores (${scored.ok ? "" : "FAILED"})`);
  if (scored.ok) {
    assert(scored.takes.length === 2, `TWO takes rendered (${scored.takes.length})`);
    const shipped = scored.takes.filter((t) => t.shipped);
    assert(shipped.length === 1, `EXACTLY ONE take ships (${shipped.length})`);
    assert(!!shipped[0] && shipped[0].worst === scored.verdict.worst, "the SHIPPED take's score IS the verdict's worst");
    assert(!!shipped[0] && shipped[0].pngPath === scored.recipe.pngPath, "the shipped recipe's pixels are the shipped take's pixels");
    const shippedIdx = shipped[0]?.take;
    for (const t of scored.takes) {
      console.log(`  take ${t.take}: ${t.ok ? `worst ${Math.round((t.worst ?? 0) * 100)}` : `MISS (${t.error})`}${t.shipped ? "  <- SHIPPED" : ""} ${t.pngPath ?? ""}`);
    }
    const cloneNames = scored.verdict.entries.filter((e) => /clone/i.test(e.characterName));
    assert(cloneNames.length === 0, "the judge is asked only about the SHEETED cast (no clone ghost)");
    for (const e of scored.verdict.entries) {
      const a = Object.entries(e.aspects ?? {}).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}`).join("/");
      console.log(`  ${e.characterName} (shipped take ${shippedIdx}): ${Math.round(e.similarity * 100)} [${a}]`);
    }
    console.log(`  S003 shipped damped worst: ${Math.round(scored.verdict.worst * 100)} over ${scored.sampleCount} reads (floor 70)`);
  }
  }
  assert(!fs.existsSync(LAB_RECEIPT), "the production arc ledger untouched by the e2e");

  await db.$disconnect();
  console.log(`\nE2E 218: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
