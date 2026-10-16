// E2E 219 - THE FIGURE-COUNT GUARD, end to end.
//
// Four legs:
//   1. THE LAW'S SHAPE (structural, no model): the 216/217/218
//      classes stand beneath; the keyframe law versions itself v3
//      (the guard is the pixels' law now); the guard's exports
//      (parse/count/select) exist; the take receipt carries the
//      guard's reading; the k>1 wiring rides in the take law.
//   2. THE GUARD'S TEETH (pure selectShippedTake): the gallery case
//      - a 92 take counting 3 against an 85 take counting 2, the
//      expected 2 - the 85 SHIPS (the 219A receipt's own numbers);
//      matching counts defer to the damped worst; null counts (the
//      guard abstained) restore the 218 behavior; expected null
//      (build failed) likewise; a failed take never ships.
//   3. THE COHORT LAW (lab receipt scope): the v3 cohort is REAL -
//      a lab kf-v3 row newer than the DB's newest re-scopes the
//      read (nights 1, PROVISIONAL); the v2 night does not pollute
//      it. The production read stands untouched (the v2 law's
//      single-night clock: nights 1, PROVISIONAL - honest).
//   4. ONE REAL GUARD RIDE (S006, takes=2, read-only): two takes,
//      every take's countedFigures named (or null = the guard
//      abstained), EXACTLY ONE shipped, the shipped take OBEYS the
//      selection law given the observed counts, no clone ghost,
//      ZERO production writes.
//
// Run: npx tsx scripts/e2e-iter219.ts
import fs from "fs";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  buildKeyframePrompt,
  countFiguresInFrame,
  parseFigureCount,
  selectShippedTake,
  scoreAiKeyframeWithTakes,
} from "../src/lib/ai/keyframe";
import {
  writeArcReceiptLine,
  foldArcReceiptLines,
  bridgeLawCohort,
} from "../src/lib/identity-arc";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

const LAB_RECEIPT = "receipts/e2e-lab-219.jsonl";

async function main() {
  console.log("E2E 219 - the figure-count guard\n");

  console.log("LEG 1 - the law's shape (structural):");
  const keyframeSrc = fs.readFileSync("src/lib/ai/keyframe.ts", "utf8");
  // the 216/217/218 classes stand beneath
  assert(keyframeSrc.includes("keyframeDyeClause") && keyframeSrc.includes("keyframeContrastClause") && keyframeSrc.includes("keyframeWeaponClause"), "the 216 arms stand (dye/contrast/weapon)");
  assert(keyframeSrc.includes("AI_KEYFRAME_FRAMING_CLAUSE"), "the 217 framing clause stands");
  assert(keyframeSrc.includes("AI_KEYFRAME_ARTIFACT_CLAUSE"), "the 218 artifact clause stands");
  assert(keyframeSrc.includes("keyframeShadowDyeClause"), "the 218 shadow-dye clause stands");
  assert(keyframeSrc.includes("model sheet's OWN simple stylized toon style"), "the 218 close-face v2 stands (ONE medium target)");
  // the 219 version + cohort
  assert(AI_KEYFRAME_LAW_VERSION === 3, `the keyframe law versions itself (v${AI_KEYFRAME_LAW_VERSION})`);
  assert(aiKeyframeCohort() === "kf-v3", `the cohort tag is the source's own (${aiKeyframeCohort()})`);
  // the guard's shape
  assert(keyframeSrc.includes("export async function countFiguresInFrame"), "the count call is exported");
  assert(keyframeSrc.includes("export function selectShippedTake"), "the shipment law is exported (pure - the teeth)");
  assert(keyframeSrc.includes("export function parseFigureCount"), "the count parser is exported");
  assert(keyframeSrc.includes("countedFigures?: number | null"), "the take receipt carries the guard's reading (null = abstained)");
  assert(keyframeSrc.includes("if (k > 1 && okScored.recipe.pngPath)"), "the guard rides the take law at k>1 (the single-take pass byte-exact)");
  assert(keyframeSrc.includes("selectShippedTake(takes, expectedFigures)"), "the shipment routes through the selection law");
  assert(keyframeSrc.includes("const expectedFigures: number | null = built.ok ? built.build.members.length : null;"), "the expected count is the SHEETED cast's count (the anchors' own number)");

  console.log("\nLEG 2 - the guard's teeth (pure selectShippedTake):");
  // the gallery case - the 219A receipt's own numbers: the 92 echo
  // vs the 85 true frame, expected 2 -> the TRUE FRAME ships
  const gallery = selectShippedTake(
    [
      { ok: true, worst: 0.92, countedFigures: 3 },
      { ok: true, worst: 0.85, countedFigures: 2 },
    ],
    2,
  );
  assert(gallery === 1, `the ECHO take is demoted (a 92 counting 3 loses to an 85 counting 2) - got index ${gallery}`);
  // matching counts: the damped worst breaks the tie
  assert(selectShippedTake([{ ok: true, worst: 0.9, countedFigures: 2 }, { ok: true, worst: 0.85, countedFigures: 2 }], 2) === 0, "matching counts defer to the damped worst");
  // the guard abstains on BOTH: the 218 behavior (the worst decides)
  assert(selectShippedTake([{ ok: true, worst: 0.92, countedFigures: null }, { ok: true, worst: 0.85, countedFigures: null }], 2) === 0, "null counts restore the 218 behavior (the worst decides)");
  // one abstains, one matches: the match outranks the abstention
  assert(selectShippedTake([{ ok: true, worst: 0.92, countedFigures: null }, { ok: true, worst: 0.85, countedFigures: 2 }], 2) === 1, "a matching take outranks an abstaining take (the guard's vote counts when present)");
  // expected null (the build failed): the worst decides
  assert(selectShippedTake([{ ok: true, worst: 0.92, countedFigures: 3 }, { ok: true, worst: 0.85, countedFigures: 2 }], null) === 0, "expected null (no build) - the worst decides, the guard never guesses");
  // failed takes never ship; all fail -> -1
  assert(selectShippedTake([{ ok: false, countedFigures: null }, { ok: true, worst: 0.5, countedFigures: 2 }], 2) === 1, "a failed take never ships");
  assert(selectShippedTake([{ ok: false, countedFigures: null }], 2) === -1, "all takes failed -> -1 (the caller's honest error path)");
  // the parser's teeth
  assert(parseFigureCount("3") === 3, "the parser reads a bare digit");
  assert(parseFigureCount("The frame contains 2 people.") === 2, "the parser reads the digit in a sentence");
  assert(parseFigureCount("") === null && parseFigureCount("no digits here") === null, "the parser refuses digitless answers (honest miss)");

  console.log("\nLEG 3 - the cohort law (lab receipt scope):");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } } });
  if (!scene) throw new Error("E7 missing");
  // the production ledger's honest BEFORE: the v2 law's single night
  const before = await episodeReleaseVerdict(project.id, scene.episodeId, AI_KEYFRAME_SOURCE);
  assert(before.arc === true && before.nights === 1, `the production read stands on the v2 night (arc ${before.arc}, nights ${before.nights})`);
  assert(before.provisional === true, "the v2 law's clock is PROVISIONAL (one night - the second never rode; the law moved)");
  console.log(`  the v2 read: ${before.verdict} (the 218 night's committed receipt)`);
  try { fs.unlinkSync(LAB_RECEIPT); } catch { /* absent - fine */ }
  const newestArc = await db.identityArcReading.findFirst({ orderBy: { scoredAt: "desc" }, select: { scoredAt: true } });
  const base = newestArc ? newestArc.scoredAt.getTime() : Date.now() - 86_400_000;
  const at = (h: number) => new Date(base + h * 3_600_000).toISOString();
  const mk = (night: string, cohort: string, scoredAt: string, worst: number) =>
    writeArcReceiptLine(
      {
        projectId: project.id,
        source: AI_KEYFRAME_SOURCE,
        night,
        cohort,
        worst,
        scores: [{ characterName: "Lin Yue", similarity: worst, aspects: { face: 0.9, wardrobe: 0.9 }, note: `lab - ${night}` }],
        scoredAt,
        ref: { episode: 7, scene: 12, shot: 1 },
      },
      LAB_RECEIPT,
    );
  mk("night-218-lab-v2", "kf-v2", at(1), 0.85);
  mk("night-219-lab-v3", "kf-v3", at(2), 0.88);
  const folded = foldArcReceiptLines(fs.readFileSync(LAB_RECEIPT, "utf8").split("\n"));
  assert(folded.length === 2, "the lab receipt folds TWO cohorts (one v2 + one v3)");
  const read = await episodeReleaseVerdict(project.id, scene.episodeId, AI_KEYFRAME_SOURCE, { receiptPath: LAB_RECEIPT });
  assert(read.nights === 1, `the gate scopes to the NEWEST cohort (kf-v3) and counts ONE night (${read.nights})`);
  assert(read.provisional === true, "the v3 law's clock starts PROVISIONAL (the honest restart)");
  assert(read.verdict !== "UNSCORED", "the v3 night's reading answers (the law's arc is live)");
  fs.unlinkSync(LAB_RECEIPT);
  console.log("  lab receipt removed - the production ledger untouched");

  console.log("\nLEG 4 - one real guard ride (S006, takes=2, read-only):");
  const s6 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 6 } });
  if (!s6) throw new Error("S006 missing");
  const built = await buildKeyframePrompt(s6.id);
  assert(built.ok, "the prompt builds for S006 (the two-member cell)");
  if (built.ok) {
    assert(built.build.members.length === 2, `the expected count is TWO (the sheeted cast: ${built.build.members.map((m) => m.name).join(" + ")})`);
    assert(built.build.prompt.includes("MUST NOT mix, average, or swap"), "S006's prompt carries the CONTRAST clause (215 stands)");
    // the count CLAUSE did not earn its place - the prompt does NOT carry it
    assert(!built.build.prompt.includes("FIGURE-COUNT LAW"), "the 219A count clause is NOT in the production prompt (the evidence refused it)");
  }
  const OUT_DIR = "inspect/aikeyframes-e2e219";
  let scored = await scoreAiKeyframeWithTakes(s6.id, { takes: 2, samples: 3, outDir: OUT_DIR });
  if (!scored.ok) {
    console.log(`  first ride: ${scored.error} - the honest retry rides`);
    await new Promise((r) => setTimeout(r, 15_000));
    scored = await scoreAiKeyframeWithTakes(s6.id, { takes: 2, samples: 3, outDir: OUT_DIR });
  }
  assert(scored.ok, `the guard ride scores (${scored.ok ? "" : "FAILED"})`);
  if (scored.ok) {
    assert(scored.takes.length === 2, `TWO takes rendered (${scored.takes.length})`);
    const okTakes = scored.takes.filter((t) => t.ok);
    const withCounts = okTakes.filter((t) => t.countedFigures != null);
    assert(okTakes.length > 0 && withCounts.length > 0, `the guard answered on the ok takes (${withCounts.length}/${okTakes.length} counted)`);
    const shipped = scored.takes.filter((t) => t.shipped);
    assert(shipped.length === 1, `EXACTLY ONE take ships (${shipped.length})`);
    const sh = shipped[0];
    assert(!!sh && sh.worst === scored.verdict.worst, "the SHIPPED take's score IS the verdict's worst");
    assert(!!sh && sh.pngPath === scored.recipe.pngPath, "the shipped recipe's pixels are the shipped take's pixels");
    // THE SHIPMENT OBEYS THE LAW given the observed counts:
    const expected = built.ok ? built.build.members.length : null;
    const observed = scored.takes.map((t) => ({ ok: t.ok, worst: t.worst, countedFigures: t.countedFigures ?? null }));
    const lawIdx = selectShippedTake(observed, expected);
    const lawTake = observed[lawIdx];
    assert(!!lawTake && sh.worst === lawTake.worst && sh.countedFigures === lawTake.countedFigures, "the shipped take IS the selection law's answer given the observed counts");
    for (const t of scored.takes) {
      console.log(`  take ${t.take}: ${t.ok ? `worst ${Math.round((t.worst ?? 0) * 100)}, counted ${t.countedFigures ?? "abstained"}` : `MISS (${t.error})`}${t.shipped ? "  <- SHIPPED" : ""}`);
    }
    // the guard's own live agreement: the shipped png's count, read again
    if (sh?.pngPath && sh.countedFigures != null) {
      const b64 = fs.readFileSync(sh.pngPath).toString("base64");
      const live = await countFiguresInFrame(`data:image/png;base64,${b64}`);
      assert(live.ok && live.count === sh.countedFigures, `the live count call re-reads the shipped pixels (${live.ok ? live.count : "miss"})`);
    }
    const cloneNames = scored.verdict.entries.filter((e) => /clone/i.test(e.characterName));
    assert(cloneNames.length === 0, "the judge is asked only about the SHEETED cast (no clone ghost)");
    for (const e of scored.verdict.entries) {
      const a = Object.entries(e.aspects ?? {}).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}`).join("/");
      console.log(`  ${e.characterName} (shipped): ${Math.round(e.similarity * 100)} [${a}]`);
    }
    console.log(`  S006 shipped damped worst: ${Math.round(scored.verdict.worst * 100)} over ${scored.sampleCount} reads (floor 70)`);
  }
  assert(!fs.existsSync(LAB_RECEIPT), "the production arc ledger untouched by the e2e");

  await db.$disconnect();
  console.log(`\nE2E 219: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
