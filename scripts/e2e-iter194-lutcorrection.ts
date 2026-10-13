// E2E ITERATION 194 - THE LUT CORRECTION: THE VIOLET WASH DIES,
// THE STORM CHARACTER STANDS.
//
// The 175 paired arm measured the tribulation tint's own ride at
// +16.3deg of hue toward violet on a teal robe (standing 225.7deg /
// S 0.583 vs the neutral arm 209.3deg / S 0.634 - the chroma washed
// -0.051), and the 179 arm measured the same lie at S004 (face
// +5.9deg, robe -6.7deg). The 141c r5 arm already held the answer:
// the neutral depth-fog gray (0.36, 0.36, 0.36) keeps the depth read
// and kills the hue lie. This iteration lands that ONE variable in
// BOTH mirrors (comp.ts + the bridge, the bit-exact mirror law) and
// leaves the storm's character byte-exact: the red-forward gain and
// the 1.12 sat ARE the tribulation; the tint no longer lies about
// the cast's dyes.
//
// Asserts (source law - the comp graph carries no version of its
// own, the 152 precedent; the e2e asserts the source):
//   1. comp.ts tribulation.mistTint === [0.36, 0.36, 0.36, 1.0]
//   2. the bridge's Python mirror carries the same corrected tint
//      (the bit-exact mirror law, read from the file itself)
//   3. the storm character byte-exact: lift [1.0,0.96,1.03,1.0],
//      gain [1.08,0.97,1.0,1.0], sat 1.12 (the 175 receipt's own
//      numbers)
//   4. the other three scripts byte-exact (ONE variable changed)
//   5. parseCompProfile's keyword law intact: lightning ->
//      tribulation still compiles (the 175 mechanism receipt)
//   6. the receipts ride the doc: the 175 numbers + the 141c r5 arm
import fs from "node:fs";
import path from "node:path";
import { COMP_LUTS, parseCompProfile } from "../src/lib/blender/comp";

let fails = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
};

const trib = COMP_LUTS.tribulation;

// 1. THE CORRECTED TINT (the real module)
ok(
  JSON.stringify(trib.mistTint) === JSON.stringify([0.36, 0.36, 0.36, 1.0]),
  `tribulation.mistTint is the corrected neutral gray ${JSON.stringify(trib.mistTint)}`
);

// 2. THE BIT-EXACT MIRROR (the bridge's own file)
const bridgeSrc = fs.readFileSync(
  path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py"),
  "utf8"
);
const bridgeLine = bridgeSrc
  .split("\n")
  .find((l) => l.includes('"tribulation"') && l.includes("mistTint"));
ok(
  Boolean(bridgeLine?.includes("(0.36, 0.36, 0.36, 1.0)")),
  "the bridge's tribulation carries the corrected tint (bit-exact mirror)"
);
ok(
  !bridgeLine?.includes("(0.3, 0.24, 0.38"),
  "the violet tint is gone from the bridge (no stale (0.3, 0.24, 0.38))"
);

// 3. THE STORM CHARACTER BYTE-EXACT (the 175 receipt's numbers)
ok(
  JSON.stringify(trib.lift) === JSON.stringify([1.0, 0.96, 1.03, 1.0]),
  "tribulation.lift byte-exact (the storm's lift)"
);
ok(
  JSON.stringify(trib.gain) === JSON.stringify([1.08, 0.97, 1.0, 1.0]),
  "tribulation.gain byte-exact (the red-forward push)"
);
ok(trib.sat === 1.12, "tribulation.sat byte-exact (1.12 - the intensity)");

// 4. THE OTHER THREE SCRIPTS BYTE-EXACT (ONE variable changed)
ok(
  JSON.stringify(COMP_LUTS.moonlight.mistTint) ===
    JSON.stringify([0.24, 0.29, 0.44, 1.0]),
  "moonlight untouched"
);
ok(
  JSON.stringify(COMP_LUTS.dawn.mistTint) ===
    JSON.stringify([0.55, 0.44, 0.34, 1.0]),
  "dawn untouched"
);
ok(
  JSON.stringify(COMP_LUTS.neutral.mistTint) ===
    JSON.stringify([0.36, 0.4, 0.46, 1.0]),
  "neutral untouched (the corrected gray is the 141c r5 arm, not neutral's own tint)"
);

// 5. THE KEYWORD LAW INTACT (lightning -> tribulation)
const prof = parseCompProfile({
  lighting: "Lightning detonation over the ridge",
});
ok(
  prof.lut === "tribulation",
  `parseCompProfile's keyword law intact (lightning -> ${prof.lut})`
);

// 6. THE RECEIPTS RIDE THE DOC
const self = fs.readFileSync(__filename, "utf8");
ok(self.includes("+16.3"), "the 175 receipt's hue-shift number rides the doc");
ok(self.includes("225.7") && self.includes("209.3"), "the 175 arm hues ride the doc");
ok(self.includes("(0.36, 0.36, 0.36)"), "the 141c r5 arm's gray rides the doc");
ok(self.includes("+5.9") || self.includes("179"), "the S004 arm's receipt rides the doc");

console.log(fails === 0 ? "ALL GREEN" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
