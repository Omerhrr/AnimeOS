// ─────────────────────────────────────────────────────────────
// E2E ITERATION 157 - THE RUNG-AWARE ASPECT CONTRACT (the scale
// law). The 156 night's controlled answer named the seam: the wide
// fill lift moved the figures materially and the judge's wide
// numbers did not move - the crops rode (every entry's note carried
// '+ face crops judged + figure crops judged') and the wides still
// floored, the model's own notes comparing them against the SHEET's
// fine detail ('the intricate gold embroidery', 'the detailed
// painterly style of the reference') which a wide's scale cannot
// resolve. The 121 law told the judge what to omit; the 157 law
// tells it what a rung OWES. The score stays the model's own
// reading - the eye's instrument recalibrated by naming, never the
// hand editing the read.
// ─────────────────────────────────────────────────────────────
import { framingViewFor, buildIdentityPrompt } from "../src/lib/identity";
import fs from "node:fs";

let failures = 0;
function expect(name: string, cond: unknown, detail?: unknown) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures++;
}

const src = fs.readFileSync("src/lib/identity.ts", "utf8");

// ── 1. THE SOURCE LAWS ──
expect("the 121 framing contract still rides (unremoved, the omission law stands)",
  src.includes("THE FRAMING CONTRACT (iteration 121)") &&
  src.includes("omit an aspect the framing cannot show rather than scoring it low"), "the 121 law");
expect("the 157 scale law rides as a named const",
  src.includes("SCALE_LAW_157") && src.includes("THE 157 SCALE LAW (the rung-aware aspect contract"), "the const");
expect("the law splices into the framing contract for the front-scale views ONLY",
  src.includes('${framingView === "front" ? SCALE_LAW_157 : ""}'), "the splice");
expect("the law names its evidence (the 156 controlled answer rides the comment)",
  src.includes("controlled answer named the seam") && src.includes("THE RUNG-AWARE ASPECT CONTRACT (iteration 157)"), "the evidence");
expect("the law's letter: the sheet's fine detail is the closeup grammar's own comparison",
  src.includes("is the CLOSEUP grammar's own comparison"), "the letter");
expect("the law's letter: the similarity reads what the framing reveals, never what it hides",
  src.includes("what the framing REVEALS, never of what it hides"), "the letter");
expect("the law's letter: no 'simplified' or 'flat' call for a clean read at scale",
  src.includes("do not call the style 'simplified' or 'flat'"), "the letter");
expect("the law's letter: the aspects score from their strips when they ride",
  src.includes("score from the face crops when they ride") &&
  src.includes("score from the figure crops when they ride"), "the strips");
expect("the 123 face-strip law untouched", src.includes("THE JUDGE SEES THE FACE (iteration 123)"), "123");
expect("the 125 figure-strip law untouched", src.includes("THE PALETTE GETS ITS ADDRESS (iteration 125)"), "125");
// THE 159 COMPLETION (the law's own sentence finished - the probe
// read the judge's own crops: Wei's face 20 on a clearly-resolved
// crop, Lin's 40 on a resolved face - the crops resolve STRUCTURE,
// not paint texture)
expect("the 159 completion rides: the crops resolve STRUCTURE, not paint texture",
  src.includes("THE FACE AND HAIR CROPS RESOLVE STRUCTURE, NOT PAINT TEXTURE") &&
  src.includes("THE 159 COMPLETION (the law's own sentence finished)"), "159");
expect("the 159 letter: the face judges on structure (proportion, feature placement, the shapes)",
  src.includes("judge the face on its structure (proportion, feature placement"), "the letter");
expect("the 159 letter: the hair judges on silhouette, mass and color class under the scene's ambient light",
  src.includes("the hair on its silhouette, mass and the dye's color class as it reads under the scene's own ambient light"), "the letter");
expect("the 159 letter: a soft crop is the scale's own honest read, not a drift",
  src.includes("a soft crop is the scale's own honest read, not a drift"), "the letter");

// ── 2. THE REAL PROMPT BUILD (the real function, no mocks) ──
const sheets = [{ name: "Lin Yue" }];
const strips = { members: ["Lin Yue"], frames: 3 };
const frontPrompt = buildIdentityPrompt(sheets, 3, "front", strips, strips);
const closePrompt = buildIdentityPrompt(sheets, 3, "close", strips, strips);
const threePrompt = buildIdentityPrompt(sheets, 3, "three", strips, strips);

expect("the FRONT prompt carries the scale law (the wides' own contract)",
  frontPrompt.includes("THE SCALE LAW") && frontPrompt.includes("small BY DESIGN"), frontPrompt.slice(0, 120));
expect("the front prompt keeps the 121 omission law",
  frontPrompt.includes("omit an aspect the framing cannot show"), "121 + 157 ride together");
expect("the CLOSE prompt does NOT carry the scale law (the closeup keeps its own comparison)",
  !closePrompt.includes("THE SCALE LAW"), closePrompt.slice(0, 120));
expect("the THREE prompt does NOT carry the scale law (the medium keeps its own)",
  !threePrompt.includes("THE SCALE LAW"), "the medium");
expect("the front prompt still carries the strip laws (the crops keep riding)",
  frontPrompt.includes("FACE CROP strip") && frontPrompt.includes("FIGURE CROP strip"), "the strips");
expect("the front prompt still names the filmstrip law",
  frontPrompt.includes("filmstrip of 3 frames"), "the artifact law");

// ── 3. THE RUNG MAP (the law rides exactly the wides) ──
expect("ESTABLISHING maps to front",
  framingViewFor("ESTABLISHING") === "front", framingViewFor("ESTABLISHING"));
expect("WIDE maps to front",
  framingViewFor("WIDE") === "front", framingViewFor("WIDE"));
expect("WS maps to front",
  framingViewFor("WS") === "front", framingViewFor("WS"));
expect("LOW_ANGLE maps to front",
  framingViewFor("LOW_ANGLE") === "front", framingViewFor("LOW_ANGLE"));
expect("CLOSEUP maps to close (the tights keep their own grammar)",
  framingViewFor("CLOSEUP") === "close", framingViewFor("CLOSEUP"));
expect("MEDIUM maps to three (the 133 rung keeps its own)",
  framingViewFor("MEDIUM") === "three", framingViewFor("MEDIUM"));

console.log(failures === 0 ? "\nALL GREEN - e2e-iter157-scalelaw" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
