// E2E iteration 130 - THE DYE'S HUE CLASS. The 129 night answered the
// sheet-vs-design tension (the sheet re-anchored so it DEPICTS the
// committed design) and its own judge notes named the blind spot in
// the same breath: Lin's re-anchored sheet painted the robe BLUE
// (#285578) under a dye clause that said 'deep jade-teal #2f6d63' -
// the value classes matched (dLum 0.067) so the acceptance passed AND
// the honest-read anchor stood down, the build carried the blue into
// every wide framing ('palette uses blue instead of the canonical
// teal/green', S002 palette 70 -> 20). The answer: the dye's class is
// VALUE and HUE - the shared designDyeClass measure judges the 115
// value step AND the 130 hue family (on the HSV color circle, gated
// by a chroma floor - greys/slates/near-blacks have no hue to judge),
// the render path's anchor reads it, and the sheet acceptance reads
// the SAME measure - a sheet the acceptance refuses is exactly a
// sheet the anchor would rescue.
// The probes import the REAL modules (tsx) - the laws are pure.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
function expect(name: string, cond: boolean, detail: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!cond) failures++;
}

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── the REAL TS-module probe (tsx, the hue class law) ──
const TS_PROBE = `
import {
  planSheetConformance, designDyeClass, hueOf, satOf, hueDist,
  blendHex, DESIGN_HUE_BAND, HUE_CHROMA_FLOOR, PULL_LUM_CAP, DESIGN_ANCHOR_FACTOR,
} from "../src/lib/blender/sheet-palette";
const out: Record<string, unknown> = {};

out.constants = { band: DESIGN_HUE_BAND, floor: HUE_CHROMA_FLOOR, cap: PULL_LUM_CAP, factor: DESIGN_ANCHOR_FACTOR };

// THE HUE CANON: the exact hues of the night's named dyes
out.hue = {
  jade: Number(hueOf("#2f6d63").toFixed(2)),      // the committed design (teal family)
  blue: Number(hueOf("#285578").toFixed(2)),      // the 129 sheet's blue depiction
  buildBlue: Number(hueOf("#2b5a8a").toFixed(2)), // the build DNA the blue carried in
  maroon: Number(hueOf("#462828").toFixed(2)),    // Wei's sheet cluster (red)
  plum: Number(hueOf("#3a2230").toFixed(2)),      // Wei's committed design (red-violet)
  violet: Number(hueOf("#472956").toFixed(2)),    // Chen Hao's honest violet
};

// THE WRAP: red (0 degrees) vs plum (325 degrees) reads the SHORT way
out.wrap = Number(hueDist("#462828", "#3a2230").toFixed(4));

// THE DYE CLASS CANON - the drift verdicts that decide tonight
out.class = {
  // the 129 blind spot: blue inside the value class, off the jade hue
  linSheet: designDyeClass("#285578", "#2f6d63"),
  linBuild: designDyeClass("#2b5a8a", "#2f6d63"),
  // the 128 named case: pale sage - VALUE only (its chroma is under the floor)
  pale: designDyeClass("#9bbcb3", "#2f6d63"),
  // the 128 honest case survives the hue law
  honest: designDyeClass("#3f7d72", "#2f6d63"),
  // Chen Hao's violet survives (dHue inside the band)
  chen: designDyeClass("#472956", "#5b4a8f"),
  // Wei: the sheet cluster is out (maroon vs plum), the build DNA is in
  weiSheet: designDyeClass("#462828", "#3a2230"),
  weiBuild: designDyeClass("#5c1826", "#3a2230"),
  // near-black hair: hue exempt, value only
  hair: designDyeClass("#16161d", "#16161d"),
};

// THE ANCHOR ANSWERS FOR REAL - the 129 regression case: the blue
// build DNA vs the committed jade, the real sheet palette riding
const linRows = planSheetConformance(
  { robe: "#2b5a8a", accent: "#c9b896", hair: "#1a1a1a", boots: "#241a12" },
  ["#a9a9aa", "#163957", "#071c36", "#285578"], 0.75, undefined,
  { robe: "#2f6d63", accent: "#3f8f7a", hair: "#16161d" },
);
out.linRows = linRows;

// the 128 named case STILL anchors - now naming the value class
const named = planSheetConformance(
  { robe: "#9bbcb3", accent: "#3f8f7a", hair: "#0d0d0d", boots: "#241a12" },
  ["#9bbcb3", "#dfe4ec", "#476565", "#0d0d0d", "#a8842c"], 0.75, undefined,
  { robe: "#2f6d63", accent: "#3f8f7a", hair: "#16161d" },
);
out.named = named;

// the honest case keeps the standing law (no anchor, the pull proceeds)
const honest = planSheetConformance(
  { robe: "#3f7d72" }, ["#9bbcb3", "#dfe4ec", "#476565", "#0d0d0d", "#a8842c"], 0.75, undefined,
  { robe: "#2f6d63" },
);
out.honest = honest;

// the absent-design call stays byte-equal to the legacy call
const absent = planSheetConformance({ robe: "#9bbcb3", accent: "#3f8f7a" }, ["#9bbcb3", "#dfe4ec", "#476565", "#0d0d0d", "#a8842c"], 0.75);
const absentLegacy = planSheetConformance({ robe: "#9bbcb3", accent: "#3f8f7a" }, ["#9bbcb3", "#dfe4ec", "#476565", "#0d0d0d", "#a8842c"], 0.75, undefined, undefined);
out.absentEqual = JSON.stringify(absent) === JSON.stringify(absentLegacy);

// determinism: the same reads land the same verdicts
out.deterministic =
  JSON.stringify(designDyeClass("#285578", "#2f6d63")) === JSON.stringify(designDyeClass("#285578", "#2f6d63"))
  && hueOf("#285578") === hueOf("#285578") && satOf("#285578") === satOf("#285578");

console.log("TS_PROBE_JSON " + JSON.stringify(out));
`;

async function main() {
  // ── 1. THE HUE CLASS LAW (source) ──
  const sp = read("src/lib/blender/sheet-palette.ts");
  expect("the hue band and the chroma floor are named laws",
    sp.includes("export const DESIGN_HUE_BAND = 0.08") && sp.includes("export const HUE_CHROMA_FLOOR = 0.25"), "the dials");
  expect("the hue measures are exported and pure (hueOf, satOf, hueDist)",
    sp.includes("export function hueOf(hex: string): number")
      && sp.includes("export function satOf(hex: string): number")
      && sp.includes("export function hueDist(a: string, b: string): number"), "the measures");
  expect("the shared dye-class measure exists and judges value AND hue",
    sp.includes("export function designDyeClass(from: string, designDye: string): DyeClassRead")
      && sp.includes("out: valueOut || hueOut"), "the measure");
  expect("the 115 value expression stands inside the shared measure (the 128 pin holds)",
    sp.includes("Math.abs(relLum(from) - relLum(designDye)) > PULL_LUM_CAP"), "the value measure");
  expect("the hue judgment is chroma-floored on BOTH dyes (weak hue is noise)",
    sp.includes("satOf(from) >= HUE_CHROMA_FLOOR && satOf(designDye) >= HUE_CHROMA_FLOOR"), "the floor");
  expect("the anchor block reads the shared measure (one law, both consumers)",
    sp.includes("designDyeClass(from, designDye)") && sp.includes("if (dyeClass?.out && designDye)"), "the call");
  expect("the anchor names WHICH class led (value / hue / both)",
    sp.includes("the value and hue classes") && sp.includes('"the hue class"') && sp.includes('"the value class"'), "the naming");
  expect("the anchored row keeps its 128 naming spine (the hexes and the phrase ride)",
    sp.includes("anchored: `design anchor: the sheet's own render reads ${from} but the committed design says ${designDye} - the design's dye leads"), "the spine");
  expect("the anchored row stands the sheet's palette down for the role (the 128 shape)",
    sp.includes("continue;\n    }\n    let nearest = palette[0];"), "the stand-down");
  expect("the 128 factor and the 115 cap stand untouched",
    sp.includes("export const DESIGN_ANCHOR_FACTOR = 0.75") && sp.includes("export const PULL_LUM_CAP = 0.15"), "the pins");

  expect("the render path is byte-untouched this iteration (the anchor wiring stands)",
    read("src/lib/engine/render.ts").includes("castDesigns[i] ?? {}"), "render.ts");

  // ── 2. THE LAWS ANSWER FOR REAL (tsx, the REAL module) ──
  const probeFile = path.join(ROOT, "scripts", ".probe-130-inline.ts");
  fs.writeFileSync(probeFile, TS_PROBE);
  const tr = spawnSync("npx", ["tsx", probeFile], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  fs.rmSync(probeFile, { force: true });
  const tOut = tr.stdout?.includes("TS_PROBE_JSON")
    ? tr.stdout.slice(tr.stdout.indexOf("TS_PROBE_JSON ") + "TS_PROBE_JSON ".length).split("\n")[0]
    : null;
  if (!tOut) {
    expect("the real TS-module probe runs", false, { status: tr.status, err: (tr.stderr || "").slice(0, 300) });
    return finish();
  }
  const probe = JSON.parse(tOut);

  expect("the dials answer (band 0.08, floor 0.25, the 115 cap and the 128 factor untouched)",
    probe.constants.band === 0.08 && probe.constants.floor === 0.25
      && probe.constants.cap === 0.15 && probe.constants.factor === 0.75, probe.constants);

  expect("the hue canon lands: jade ~170, the sheet's blue ~206, the build's blue ~210",
    Math.abs(probe.hue.jade - 170.3) < 1 && Math.abs(probe.hue.blue - 206.25) < 1
      && Math.abs(probe.hue.buildBlue - 210.3) < 1.5, probe.hue);
  expect("the color-circle wrap reads the short way (maroon 0 deg vs plum 325 deg = 0.0972)",
    Math.abs(probe.wrap - 0.0972) < 0.001, probe.wrap);

  expect("THE 129 BLIND SPOT READS: the blue sheet cluster is OUT of the jade's class by HUE (value in)",
    probe.class.linSheet.out === true && probe.class.linSheet.hueOut === true
      && probe.class.linSheet.valueOut === false && probe.class.linSheet.judgedHue === true, probe.class.linSheet);
  expect("the blue the BUILD carried in is OUT of the design's class (the render path now sees it)",
    probe.class.linBuild.out === true && probe.class.linBuild.hueOut === true, probe.class.linBuild);
  expect("the 128 pale case stays a VALUE verdict (its chroma sits under the floor - hue exempt)",
    probe.class.pale.out === true && probe.class.pale.valueOut === true
      && probe.class.pale.hueOut === false && probe.class.pale.judgedHue === false, probe.class.pale);
  expect("the 128 honest case survives the hue law (in class, no anchor)",
    probe.class.honest.out === false, probe.class.honest);
  expect("Chen Hao's violet survives (dHue inside the band - the honest read keeps the sheet as law)",
    probe.class.chen.out === false && probe.class.chen.dHue !== null && probe.class.chen.dHue <= 0.08, probe.class.chen);
  expect("Wei's sheet cluster reads OUT (maroon vs plum) but the BUILD DNA reads IN (the render already wears the design)",
    probe.class.weiSheet.out === true && probe.class.weiSheet.hueOut === true
      && probe.class.weiBuild.out === false, [probe.class.weiSheet, probe.class.weiBuild]);
  expect("near-black hair is hue exempt (value only - the 115 law unchanged)",
    probe.class.hair.out === false && probe.class.hair.judgedHue === false, probe.class.hair);

  const linRows = probe.linRows as Array<{ role: string; from: string; to: string; anchored?: string; skipped?: string }>;
  const linRobe = linRows.find((r) => r.role === "robe")!;
  expect("THE REGRESSION CASE ANCHORS: the blue build robe pulls back to the exact 0.75 blend of the committed jade",
    linRobe.anchored !== undefined && linRobe.to === blendOf("#2b5a8a", "#2f6d63", 0.75), linRobe);
  expect("the anchor names the hue class as its lead",
    typeof linRobe.anchored === "string" && linRobe.anchored.includes("(the hue class)")
      && linRobe.anchored.includes("#2b5a8a") && linRobe.anchored.includes("#2f6d63")
      && linRobe.anchored.includes("the design's dye leads"), linRobe.anchored);
  const linAccent = linRows.find((r) => r.role === "accent")!;
  expect("the drifted accent anchors too (value and hue classes named together)",
    linAccent.anchored !== undefined && linAccent.anchored.includes("(the value and hue classes)"), linAccent.anchored);
  expect("Lin's near-black hair keeps the standing skip (no anchor, no pull)",
    linRows.find((r) => r.role === "hair")?.skipped === "already true to the sheet"
      && linRows.find((r) => r.role === "boots")?.anchored === undefined, linRows);

  const named = probe.named as Array<{ role: string; to: string; anchored?: string }>;
  const namedRobe = named.find((r) => r.role === "robe")!;
  expect("the 128 named case still anchors to the exact blend - now naming the VALUE class",
    namedRobe.anchored !== undefined && namedRobe.to === "#4a8177"
      && namedRobe.anchored.includes("(the value class)"), namedRobe);
  const honest = probe.honest as Array<{ anchored?: string }>;
  expect("the honest dye takes NO anchor (the 128 pin holds under the hue law)",
    honest.every((r) => r.anchored === undefined), honest);
  expect("the absent-design call is byte-equal to the legacy call", probe.absentEqual === true, probe.absentEqual);
  expect("the measures are deterministic", probe.deterministic === true, probe.deterministic);

  // ── 3. THE BRIDGE STANDS UNTOUCHED (no law-change restart owed) ──
  const tp = read("bridges/blender/toon_pass.py");
  expect("TOON_LAW_VERSION advanced legitimately to 131 (the 135 trim weave's own scope)",
    tp.includes("TOON_LAW_VERSION = 131"), "v131");

  finish();
}

function blendOf(a: string, b: string, f: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [a1, a2, a3] = p(a), [b1, b2, b3] = p(b);
  const c = (x: number, y: number) => Math.max(0, Math.min(255, Math.round(x + (y - x) * f)));
  return "#" + [c(a1, b1), c(a2, b2), c(a3, b3)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function finish() {
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
