// ITERATION 141 - THE CONVICTION GATE: the 140 night's two named cells
// answered by the THIRTEEN-CUT PROBE on the real pipeline, and the
// law that follows the evidence honestly:
//
//  CELL 1 - THE TEAL-VS-BLACK DYE CELL: the dye chain measured CLEAN
//  through the REAL lib assembly (the riding hairColor is the sheet
//  DNA's own near-black read, 'already true to the sheet'; the
//  committed design still says #0d0d0d); the probe's bisect exonerated
//  fog, sheet wash, mass lift, rim, shadow-cool, comp mist, bloom and
//  the preview's own sample count; a pure-black dye still rendered the
//  mass at sRGB (0, 16, 52) - R EXACTLY ZERO: the additive deep-blue
//  term is the scene's own fx LIGHT TRANSPORT. THE LAW'S LEVER IS
//  LIGHT-SIDE, not material-side - and both material-side burns the
//  iteration attempted were CUT AND REFUSED by their own receipts
//  (the HSV S-clamp redistributed the flood's energy into R/G and
//  bounced the face +58 bright; the mass-lerp variant read mid-grey).
//  TOON 133 STANDS - the gate refuses to land a lever the eye refused.
//
//  CELL 2 - THE FOREHEAD ELLIPSE: the probe's e-cuts answered it - the
//  pale oval across the brow IS the skin's lit-band boundary (the e2
//  cut moved it with the band Size; the e1 cut cleared the shadow
//  floor). The smooth lever was CUT AND REFUSED by its own receipt
//  (the face's cel planes washed +60 across every frame). The oval
//  stands as the understood shading read it is.
//
// The gate asserts: the dye chain's truth (through the REAL lib
// functions), the refusal's truth (TOON 133 byte-stands; the probe's
// receipts carry the convictions), and the night tool staged.
import { db } from "../src/lib/db";
import { detectCast } from "../src/lib/ai/art";
import { characterDesignDna } from "../src/lib/animation/design";
import { adherentDna, sheetDnaFresh } from "../src/lib/blender/adherence";
import { planSheetConformance, extractSheetPalette } from "../src/lib/blender/sheet-palette";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}

const BOOTS_DEFAULT = "#2a2a30";

async function main() {
  // ── 1. the dye chain's truth through the REAL lib functions ──
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({ where: { episode: { season: { projectId: project.id } } }, orderBy: { number: "asc" } });
  if (!scene) throw new Error("scene missing");
  const episodeNumber = (await db.episode.findFirst({ where: { id: scene.episodeId } }))?.number ?? 7;
  const castRows = await db.character.findMany({ where: { projectId: project.id }, include: { states: true } });
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  const s003 = shots.find((s) => s.number === 3);
  if (!s003) throw new Error("S003 missing");
  const detected = detectCast(castRows, s003.description).slice(0, 2);
  check("the S003 closeup detects its cast", detected.length >= 1, `detected ${detected.length}`);
  const lin = detected.find((c) => c.name === "Lin Yue") ?? detected[0];
  const st = [...lin.states]
    .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
    .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())[0];
  const regex = characterDesignDna({
    name: lin.name, role: lin.role, appearance: lin.appearance, modelSheetPrompt: lin.modelSheetPrompt,
    stateClothing: st?.clothing ?? null, stateWeapon: st?.weapon ?? null,
  });
  const fresh = sheetDnaFresh(lin.sheetDna, lin.modelSheetUrl);
  const dna = adherentDna(regex, fresh);
  // THE CONVICTION: the riding hair dye is NEAR-BLACK - the teal is
  // not in the dye chain (the probe's first receipt)
  const hairHex = (dna.hairColor ?? "").toLowerCase();
  const hairRgb = hairHex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  check("the riding hair dye exists as a hex", !!hairRgb, hairHex);
  if (hairRgb) {
    const r = parseInt(hairRgb[1], 16), g = parseInt(hairRgb[2], 16), b = parseInt(hairRgb[3], 16);
    check("the riding hair dye is NEAR-BLACK (every channel under 0.2)", r < 51 && g < 51 && b < 51,
      `#${hairHex} rgb(${r},${g},${b}) - the teal is not the dye's`);
  }
  // the committed design still says #0d0d0d (the design law the dyes serve)
  const designSpec = lin.designSpec ? JSON.parse(lin.designSpec) : null;
  check("Lin's committed design carries the r3 male dials", !!designSpec?.eyes && designSpec.eyes.size === 0.7 && designSpec.brows?.thickness === 2,
    `eyes ${designSpec?.eyes?.size} brows ${designSpec?.brows?.thickness}`);
  check("the committed design's own hair dye is near-black", /^#0[0-9a-f]0[0-9a-f]0[0-9a-f]$/.test((designSpec?.hair?.color ?? "").toLowerCase()),
    designSpec?.hair?.color);
  // the sheet conformance's hair row: 'already true to the sheet' or
  // value-guarded - never a teal pull
  if (lin.modelSheetUrl) {
    const sheetPath = path.join(process.cwd(), "public", lin.modelSheetUrl.split("?")[0]);
    if (fs.existsSync(sheetPath)) {
      const palette = await extractSheetPalette(await fs.promises.readFile(sheetPath));
      const rows = planSheetConformance(
        { robe: dna.robeColor, accent: dna.robeAccent, hair: dna.hairColor, boots: BOOTS_DEFAULT },
        palette, dna.conformFactor, undefined,
        { robe: regex.robeColor, accent: regex.robeAccent, hair: regex.hairColor },
      );
      const hairRow = rows.find((r) => r.role === "hair");
      check("the conformance's hair row refuses to re-dye", !!hairRow && (hairRow.skipped !== undefined || hairRow.to === hairRow.from || hairRow.anchored !== undefined),
        `hair row: ${hairRow?.from} -> ${hairRow?.to}${hairRow?.skipped ? ` (${hairRow.skipped.slice(0, 60)})` : ""}${hairRow?.anchored ? " (anchored)" : ""}`);
    }
  }

  // ── 2. the refusal's truth: TOON 133 byte-stands ──
  const toonSrc = fs.readFileSync("bridges/blender/toon_pass.py", "utf8");
  const ver = toonSrc.match(/TOON_LAW_VERSION = (\d+)/);
  check("TOON_LAW_VERSION stands at 133 (the gate refused the material-side lever)", ver?.[1] === "133", ver?.[1]);
  check("no chroma-gate residue in the toon pass", !toonSrc.includes("HAIR_MASS_GATE_PULL") && !toonSrc.includes("HAIR_MASS_SAT_CAP") && !toonSrc.includes("SKIN_BAND_SMOOTH"),
    "the refusals carry their receipts in the record, not in the code");

  // ── 3. the probe's conviction ledger (the receipts on disk) ──
  const res141 = JSON.parse(fs.readFileSync("probe141-results.json", "utf8"));
  const a1 = res141["S003:a1-stand"]?.hairMeter;
  const b4 = res141["S003:b4-black"]?.hairMeter;
  check("the probe's control read exists (the teal reproduced)", !!a1?.rgb && a1.rgb[2] > a1.rgb[0] * 1.5,
    `a1 ${JSON.stringify(a1)}`);
  check("THE CONVICTION: a pure-black dye still renders blue (R collapses, B stands)", !!b4?.rgb && b4.rgb[0] < 5 && b4.rgb[2] > 30,
    `b4-black ${JSON.stringify(b4)} - the additive term is the fx light transport's`);
  const nofog = res141["S003:b1-nofog"]?.hairMeter;
  const nowash = res141["S003:b2-nowash"]?.hairMeter;
  const nolift = res141["S003:b3-nolift"]?.hairMeter;
  check("fog exonerated (the mist pull did not move the read)", !!nofog?.rgb && Math.abs(nofog.rgb[2] - a1.rgb[2]) < 3, JSON.stringify(nofog));
  check("sheet wash exonerated", !!nowash?.rgb && Math.abs(nowash.rgb[2] - a1.rgb[2]) < 3, JSON.stringify(nowash));
  check("mass lift exonerated at the canon framing", !!nolift?.rgb && Math.abs(nolift.rgb[2] - a1.rgb[2]) < 3, JSON.stringify(nolift));

  // ── 4. the night tool staged (the 141 night rides the 140 driver's law) ──
  check("the detached night driver staged", fs.existsSync("scripts/detached-night141.mjs"), "scripts/detached-night141.mjs");

  console.log(`\n${fail === 0 ? "ALL GREEN" : "RED"} - iteration 141 (${pass} asserts, ${fail} fail)`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error("gate failed:", e); process.exit(1); });
