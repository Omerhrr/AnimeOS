// E2E iteration 129 - THE SHEET DEPICTS THE DESIGN. The 128 night
// moved the distribution more than any night before it (mean 57 /
// median 57 / p10 40) and its notes named the frontier in the judge's
// own words: "the palette has drifted from teal/gold to dark
// purple/mustard" - THE SHEET-VS-DESIGN TENSION. Wei's AI sheet
// depicts pale-green+gold while the committed design says dark
// plum+gold; the 128 anchor chose the design for the RENDER, but the
// JUDGE compares against the SHEET - so the sheet itself must depict
// the committed design. The answer, landed in art.ts:
//   1. THE DESIGN DYES RIDE THE SHEET PROMPT - generateCharacterModelSheet
//      compiles the design text with the SAME characterDesignDna the
//      render's conformance anchor rides, and states the dyes as
//      COSTUME COLOR LAW in the prompt (after the anchor, overriding
//      the style token's default palette for this figure).
//   2. THE DYE WORDS ARE DETERMINISTIC - describeDye names each hex's
//      coarse color class (the image channel follows color words, the
//      exact hex rides beside every name).
//   3. THE RE-ANCHOR IS CANONICAL - the regeneration rides the standing
//      reanchor law (REANCHOR production event + IDENTITY_REANCHOR
//      continuity event, the drift baseline restarts), then the sheet
//      DNA is re-read so the build compiles through the NEW sheet.
// No bridge/toon_pass change this iteration - TOON_LAW_VERSION stays
// 128 and the pool serves unchanged laws.
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

// ── source-law assertions ──
const artSrc = read("src/lib/ai/art.ts");
expect("art imports the design compile", artSrc.includes(`import { characterDesignDna } from "@/lib/animation/design"`));
expect("sheet gen compiles the design dyes", /const design = characterDesignDna\(\{/.test(artSrc));
expect("sheet gen rides the dye clause", /const dyeClause = sheetDesignDyeClause\(dyes\)/.test(artSrc));
expect("sheet prompt assembled by the pure builder", /buildSheetPrompt\(\{ styleTokens, name: character\.name, anchor, dyeClause \}\)/.test(artSrc));
expect("compile fields match the render's conformance compile",
  /modelSheetPrompt: character\.modelSheetPrompt,/.test(artSrc) &&
  /stateClothing: latestState\?\.clothing \?\? null,/.test(artSrc));
// the 128 conformance law stands untouched
const paletteSrc = read("src/lib/blender/sheet-palette.ts");
expect("128 anchor factor stands", paletteSrc.includes("export const DESIGN_ANCHOR_FACTOR = 0.75"));
expect("115 value-class cap stands", paletteSrc.includes("export const PULL_LUM_CAP = 0.15"));
// the bridge is byte-untouched this iteration
const toonSrc = read("bridges/blender/toon_pass.py");
expect("TOON_LAW_VERSION holds the 133 (advanced legitimately: the 140 wide-end paint statement)", /TOON_LAW_VERSION\s*=\s*133/.test(toonSrc));

// ── the REAL TS-module probe (tsx) ──
const TS_PROBE = `
import { describeDye, sheetDesignDyeClause, buildSheetPrompt, SheetDesignDyes } from "../src/lib/ai/art";
import { characterDesignDna } from "../src/lib/animation/design";
import { PULL_LUM_CAP, relLum } from "../src/lib/blender/sheet-palette";
const out: Record<string, unknown> = {};

// the describeDye canon: the cast's own dyes land their honest coarse names
out.dye = {
  weiRobe: describeDye("#3a2230"),      // dark plum
  linRobe: describeDye("#2f6d63"),      // deep jade-teal
  accent: describeDye("#a8842c"),       // gold
  hair: describeDye("#16161d"),         // near-black
  chenRobe: describeDye("#5b4a8f"),     // violet
  hanRobe: describeDye("#4a5560"),      // deep slate blue
  specBrown: describeDye("#8b4513"),    // brown
  paper: describeDye("#e2ddd5"),        // near-white
  shadow: describeDye("#060608"),       // near-black
};
out.deterministic =
  describeDye("#3a2230") === describeDye("#3a2230") &&
  describeDye("#a8842c") === describeDye("#a8842c");

// the clause: full dyes, robe-only, absent
const full: SheetDesignDyes = { robe: "#3a2230", accent: "#a8842c", hair: "#16161d", hairStyle: "topknot" };
out.clauseFull = sheetDesignDyeClause(full);
out.clauseRobeOnly = sheetDesignDyeClause({ robe: "#2f6d63" });
out.clauseAbsent = sheetDesignDyeClause({});

// the compile is design-true: the role-aware dyes the 128 law carries
// (synthetic notes carry NO color words, so the role fallbacks land -
// the same shape the standing rows compile to; "black" anywhere would
// map the robe to #1a1b21 per the ROBE_COLORS table)
const wei = characterDesignDna({ name: "Demon Lord Wei", role: "ANTAGONIST", appearance: JSON.stringify({ notes: "tall imposing figure, long dark hair, cold eyes" }), modelSheetPrompt: null, stateClothing: null, stateWeapon: "wields a dark blade" });
const lin = characterDesignDna({ name: "Lin Yue", role: "PROTAGONIST", appearance: JSON.stringify({ notes: "young sect disciple, hair in a topknot, calm face" }), modelSheetPrompt: null, stateClothing: "Sect Elder Robes", stateWeapon: "practice sword" });
out.weiRobe = wei.robeColor; out.weiAccent = wei.robeAccent; out.weiHair = wei.hairColor; out.weiHairStyle = wei.hairStyle;
out.linRobe = lin.robeColor; out.linAccent = lin.robeAccent; out.linHair = lin.hairColor; out.linHairStyle = lin.hairStyle;

// the sheet prompt law: the clause rides AFTER the anchor, the style
// tokens first; the override language is present; the no-design form
// is the byte-exact 122 shape.
const styleTokens = "cinematic Chinese donghua art style, jade-teal and gold palette";
const anchor = "28-year-old; protagonist; face: calm, disciplined; Sect Elder Robes; wields a practice sword";
const clause = sheetDesignDyeClause({ robe: lin.robeColor, accent: lin.robeAccent, hair: lin.hairColor, hairStyle: lin.hairStyle });
const withDye = buildSheetPrompt({ styleTokens, name: "Lin Yue", anchor, dyeClause: clause });
out.withDye = withDye;
out.order = {
  styleFirst: withDye.indexOf(styleTokens) === 0,
  anchorBeforeClause: withDye.indexOf(anchor) < (clause ? withDye.indexOf("COSTUME COLOR LAW") : -1),
  overrideStated: withDye.includes("override any default style palette"),
};
const withoutDye = buildSheetPrompt({ styleTokens, name: "Lin Yue", anchor, dyeClause: null });
out.legacyForm =
  withoutDye === [
    styleTokens,
    "character reference model sheet of Lin Yue",
    "turnaround sheet with full-body front view, three-quarter view and side profile of the SAME character",
    "identical face, hairstyle and outfit in every view, neutral A-pose",
    anchor,
    "plain light neutral studio background, flat even lighting, full body visible head to toe",
    "professional character design sheet, high quality, detailed",
    "no text, no labels, no watermark, single sheet",
  ].join(", ");
out.cap = PULL_LUM_CAP;
out.linRobeLum = relLum(lin.robeColor);
console.log("TS_PROBE_JSON " + JSON.stringify(out));
`;

const probeFile = path.join(ROOT, "scripts", ".probe-129-sheet.ts");
fs.writeFileSync(probeFile, TS_PROBE);
const tr = spawnSync("npx", ["tsx", probeFile], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
const tOut = tr.stdout?.includes("TS_PROBE_JSON")
  ? JSON.parse(tr.stdout.slice(tr.stdout.indexOf("TS_PROBE_JSON ") + "TS_PROBE_JSON ".length).split("\n")[0])
  : null;
if (!tOut) {
  expect("TS probe ran", false, (tr.stderr || tr.stdout || "").slice(0, 400));
} else {
  const d = tOut.dye as Record<string, string>;
  expect("dye: Wei robe reads dark plum", d.weiRobe === "dark plum", d.weiRobe);
  expect("dye: Lin robe reads deep jade-teal", d.linRobe === "deep jade-teal", d.linRobe);
  expect("dye: canon accent reads gold", d.accent === "gold", d.accent);
  expect("dye: hair reads near-black", d.hair === "near-black", d.hair);
  expect("dye: Chen Hao robe reads violet", d.chenRobe === "violet", d.chenRobe);
  expect("dye: Elder Han robe reads slate", d.hanRobe === "deep slate blue", d.hanRobe);
  expect("dye: brown lands brown", d.specBrown === "brown", d.specBrown);
  expect("dye: paper reads near-white", d.paper === "near-white", d.paper);
  expect("dye: shadow reads near-black", d.shadow === "near-black", d.shadow);
  expect("dye words deterministic", tOut.deterministic === true);

  const cf = String(tOut.clauseFull);
  expect("clause names the law", cf.startsWith("COSTUME COLOR LAW"), cf.slice(0, 60));
  expect("clause carries the override language", cf.includes("override any default style palette"));
  expect("clause carries all three hexes", cf.includes("#3a2230") && cf.includes("#a8842c") && cf.includes("#16161d"));
  expect("clause carries the hair style", cf.includes("hair worn in a topknot"));
  const crobe = String(tOut.clauseRobeOnly);
  expect("robe-only clause stays minimal", crobe.includes("#2f6d63") && !crobe.includes("hair"), crobe);
  expect("absent dyes -> no clause", tOut.clauseAbsent === null);

  expect("compile: Wei robe is the antagonist dye #3a2230", tOut.weiRobe === "#3a2230", tOut.weiRobe);
  expect("compile: Wei accent is the gold #a8842c", tOut.weiAccent === "#a8842c", tOut.weiAccent);
  expect("compile: Lin robe is the protagonist dye #2f6d63", tOut.linRobe === "#2f6d63", tOut.linRobe);
  expect("compile: Lin hair compiles topknot", tOut.linHairStyle === "topknot", tOut.linHairStyle);

  const order = tOut.order as Record<string, boolean>;
  expect("prompt: style tokens first", order.styleFirst);
  expect("prompt: clause rides after the anchor", order.anchorBeforeClause);
  expect("prompt: override stated against the default palette", order.overrideStated);
  expect("prompt: no-design form is the byte-exact 122 shape", tOut.legacyForm === true);
  expect("the 115 value-class cap still guards the conformance", tOut.cap === 0.15);
}
fs.rmSync(probeFile, { force: true });

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
