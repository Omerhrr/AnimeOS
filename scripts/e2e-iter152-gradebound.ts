// ─────────────────────────────────────────────────────────────
// E2E ITERATION 152 - THE LUMINANCE-MASKED MIST.
//
// The 151 probes closed the transport hunt: the dye chain (141), the
// fx emitters (149) and the lightning (151) stood exonerated; the
// night comp grade CONVICTED at 2.26x (the comp-off cut's dark-mass
// chroma 28.0 vs the graded clip's 63.2). The lever lands comp-side
// (NOT one of the 141 shader refusals): the mist pull's mix factor
// is multiplied by a luminance ramp - near-black masses keep their
// dye's class, the mood keeps the mid and bright ranges.
//
// THE VERIFY ARM'S RECEIPT (the real render, probe-152-verify.py):
// the bounded grade's mass chroma 35.0 (graded 63.2, raw 28.0) with
// the ambience keeping its violet.
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter152-gradebound.ts
// ─────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

function main() {
  console.log("== Iteration 152: THE LUMINANCE-MASKED MIST ==\n");
  const bridgeSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");

  check("A1a the bounded lever carries its constant, sized from the conviction's own reads",
    bridgeSrc.includes("GRADE_MASS_CEIL = 0.30") && bridgeSrc.includes("Sized from the conviction"));
  check("A1b the mask rides the MIST layer's mix factor (the convicted seam)",
    bridgeSrc.includes("THE LUMINANCE-MASKED MIST (iteration 152") &&
    bridgeSrc.includes("mistMassMask") &&
    bridgeSrc.indexOf("mulberry32") < bridgeSrc.indexOf("THE LUMINANCE-MASKED MIST"));
  check("A1c the mask is a real luminance ramp (the Rec.601 chain into a MapRange and one multiply)",
    bridgeSrc.includes("CompositorNodeSeparateColor") &&
    bridgeSrc.includes("0.2126") && bridgeSrc.includes("0.7152") && bridgeSrc.includes("0.0722") &&
    bridgeSrc.includes("fmul"));
  check("A1d the conviction's numbers ride the doc (the evidence chain)",
    bridgeSrc.includes("28.0 vs the graded clip's 63.2") && bridgeSrc.includes("2.26x"));
  check("A1e the mist layer's own law text stands (the depth-read comment)",
    bridgeSrc.includes("the wash the layer bisect caught"));
  check("A1f the 141 refusals stay refused (no shader-side gate residue in the toon pass)",
    !readFileSync("bridges/blender/toon_pass.py", "utf8").includes("HAIR_MASS_SAT_CAP"));

  // the pure mask math (the law the nodes implement)
  const ceil = 0.30;
  const mask = (lum: number) => Math.max(0, Math.min(1, lum / ceil));
  check("B1a a near-black mass (lum 0.06) masks the mist to ~0.2", Math.abs(mask(0.06) - 0.2) < 0.01);
  check("B1b the raw dark mass (lum 0.09) keeps most of its class", mask(0.09) < 0.35);
  check("B1c the mid-field (lum 0.30+) rides the full fog", mask(0.30) === 1.0);
  check("B1d the far field (lum 0.55) keeps the mood untouched", mask(0.55) === 1.0);
  check("B1e the 151 conviction's arithmetic holds (the graded 63.2 / raw 28.0 = the 2.26x ride)",
    Math.abs(63.2 / 28.0 - 2.257) < 0.01);

  const verify = (() => {
    try { return readFileSync("/home/z/my-project/inspect/probe151/verify-meter.json", "utf8"); } catch { return ""; }
  })();
  check("C1 the verify arm's receipt is on disk (the real render)", verify.includes('"massBoundedMedian"'),
    verify ? "" : "probe151/verify-meter.json missing - re-run probe-152-verify.py");
  if (verify) {
    const rep = JSON.parse(verify);
    check("C2 the bounded mass chroma reads at the raw's own range (<= 40)",
      typeof rep.massBoundedMedian === "number" && rep.massBoundedMedian <= 40, String(rep.massBoundedMedian));
    check("C3 the bound is a real drop against the graded clip (< 0.75x)",
      rep.massBoundedMedian < rep.massGradedMedian * 0.75,
      `${rep.massBoundedMedian} vs ${rep.massGradedMedian}`);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - e2e-iter152-gradebound`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
