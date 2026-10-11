// ─────────────────────────────────────────────────────────────
// E2E ITERATION 162 - THE DAMPING CONSTANT (the sampling-variance
// probe's own lever). The 161 night measured the seam: the stable
// cells held EXACTLY across four nights while the swing cells
// wandered +/-15-30 on receipt-identical pixels. The probe
// (probe162-spread.ts) then read the judge's own sampling spread -
// 7 raw calls per cell over the SAME strip + crops, no persistence:
//   S001 [35,65,35,35,65,55,75]  median 55, spread 40, BIMODAL
//        (35 x4 vs 65 x2 - the banned sheet-detail comparison
//        resurfacing stochastically vs the scale-law-compliant mode)
//   S002 [75,60,60,45,45,45,55]  median 55, spread 30 (the control)
//   S005 [35,65,35,35,35,65,35]  median 35, spread 30, 5:2 split
// The median-of-3 was a coin flip between the modes. The 117 law's
// own ceiling permits 7; the damping constant re-sizes to 5 - the
// same instrument, a tighter read, not a moved goalpost.
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

const rescore = fs.readFileSync("scripts/night111-rescore.ts", "utf8");

check("A1 the damping constant rides 5 (the committed default)",
  /ANIMEOS_SCORE_SAMPLES \?\? 5/.test(rescore), "the default");
check("A2 the 117 ceiling stands (min 1, max 7 - the env cannot exceed the law)",
  /Math\.max\(1, Math\.min\(7,/.test(rescore), "the clamp");
check("A3 the receipt rides the source (the bimodal naming)",
  rescore.includes("BIMODAL") && rescode_named(rescore), "the comment");
check("A4 the envelope env still overrides (the runners keep their own say)",
  rescore.includes("process.env.ANIMEOS_SCORE_SAMPLES"), "the env");

function rescode_named(src: string): boolean {
  return src.includes("the banned sheet-detail comparison resurfacing stochastically") &&
    src.includes("damping constant re-sizes to 5");
}

const probe = fs.readFileSync("scripts/probe162-spread.ts", "utf8");
check("B1 the probe instrument rides (7 raw calls, NO persistence)",
  probe.includes("const N = 7") && probe.includes("rawIdentityCall") &&
  !probe.includes("upsert") && !probe.includes("identityScore.upsert"), "read-only");
check("B2 the probe rides the same inputs the judge saw (the strip + the boxes + the crops)",
  probe.includes("extractRenderPosterFilmstrip") && probe.includes("readRenderFaceBoxes") &&
  probe.includes("extractFaceCropStrip") && probe.includes("extractFigureCropStrip"), "the inputs");
check("B3 the probe names the cells (the swing cells vs the control)",
  probe.includes("number: { in: [1, 2, 5] }"), "S001/S002/S005");

const identity = fs.readFileSync("src/lib/identity.ts", "utf8");
check("C1 the median law stands (the verdict is the median of its samples - the 117 letter)",
  identity.includes("THE VERDICT IS THE MEDIAN OF ITS SAMPLES (iteration 117)"), "117");
check("C2 the probe's door rides (the four exports, no behavior change)",
  /export async function loadIdentityShot/.test(identity) &&
  /export async function prepareIdentityContext/.test(identity) &&
  /export async function rawIdentityCall/.test(identity) &&
  /export async function renderPosterForShot/.test(identity), "the exports");

console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - e2e-iter162-damping`);
process.exit(failures === 0 ? 0 : 1);
