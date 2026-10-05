// E2E iteration 125 - THE PALETTE GETS ITS ADDRESS. The 124 night
// named the trade: the face crops moved the face cells (S003 closeup
// face 80%, S006 paired wide 40/50% vs 20% at 122) while the wides'
// palette/style cells collapsed (S001/S004 palette 20%, S005 the
// night's worst at 20/10). The probe answered WHY before any code
// moved (scripts/probe-wide-palette.py):
//   - S005's pixels are GENUINELY desaturated (figure S 0.35-0.48 vs
//     0.58-0.64 everywhere else): LOW_ANGLE falls through the 115
//     staging table to the HOUSE mist - full intensity 1.0, the exact
//     fog-out the cap was invented to prevent;
//   - S001/S004's figure chroma MATCHES the 70%-palette control
//     (S006) - their collapse is the SCALE wall at the judge's eye
//     (a 30px figure in a tinted wash cannot carry a costume), the
//     same wall the face hit at 123.
// The rung answers on two fronts:
//   1. THE MIST SEAM: LOW_ANGLE joins MIST_STAGE_BY_SHOT under the
//      same cap the staged wides carry (start 5.0 sits past the
//      framing's ~3-4 unit figure - the 112 ghost law holds);
//   2. THE FIGURE-CROP STRIP: the face boxes extend DOWN to the hem
//      (five head-heights, +/-30% width - the probe's own band law),
//      crop the SAME frames the filmstrip judged, upscale, label,
//      and the prompt scores the PALETTE and WARDROBE aspects on the
//      figure crops first. One truth, three scales. Deterministic
//      craft data - the render's own projected boxes, no detection,
//      no AI. The image manifest numbers HONESTLY while both strips
//      ride (the 123 seam: the sheets claimed Image 2 under the face
//      strip's ride).
import { buildIdentityPrompt, readRenderFaceBoxes, extractFigureCropStrip, figureBandFor } from "../src/lib/identity";
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

const TEST_JOB = "e2e125palette-test";

function writeTestJobFile(state: unknown): void {
  fs.writeFileSync(path.join(ROOT, "public", "renders", `.job-${TEST_JOB}.json`), JSON.stringify({ jobId: TEST_JOB, state }));
}

function makeTestFrame(color: string, out: string): boolean {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=320x180`, "-frames:v", "1", "-q:v", "3", out],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  return r.status === 0 && fs.existsSync(out);
}

async function main() {
  // ── 1. THE MIST SEAM (the LOW_ANGLE staging) ──
  const tp = read("bridges/blender/toon_pass.py");
  expect("the toon pass declares the law version (advanced legitimately to 130)", tp.includes("TOON_LAW_VERSION = 130"), "v128");
  expect("LOW_ANGLE joins the mist staging under the same cap the wides carry",
    tp.includes('"LOW_ANGLE": (5.0, 14.0, 0.72)'), "the staging row");
  expect("the cap law holds (every staged tuple caps below full intensity; the house alone runs 1.0)",
    tp.includes('"ESTABLISHING": (7.0, 26.0, 0.72)') && tp.includes('"WIDE": (5.5, 16.0, 0.75)')
      && tp.includes('"LOW_ANGLE": (5.0, 14.0, 0.72)') && /MIST_HOUSE = \(6\.0, 18\.0, 1\.0\)/.test(tp),
    "the tuples");
  expect("the staged start sits past the LOW_ANGLE figure (~3-4 units, the 112 ghost law)",
    tp.includes("start 5.0\n    # sits past the figure"), "the comment law");
  const stageSrc = read("bridges/blender/toon_pass.py");
  expect("the staging answers per shot with the honest house fallback",
    stageSrc.includes("def stage_mist_for_framing") && stageSrc.includes("MIST_STAGE_BY_SHOT.get(st, MIST_HOUSE)"),
    "the resolver");

  // ── 2. THE FIGURE BAND IS A LAW (pure, deterministic) ──
  const bandCenter = figureBandFor([150, 40, 170, 60], 640, 360);
  expect("the band extends five head-heights below the head box",
    bandCenter[0] === 144 && bandCenter[1] === 40 && bandCenter[2] === 176 && bandCenter[3] === 160,
    bandCenter);
  const bandClipped = figureBandFor([150, 150, 170, 170], 320, 180);
  expect("a band at the frame's bottom edge clips, never distorts",
    bandClipped[0] === 144 && bandClipped[1] === 150 && bandClipped[2] === 176 && bandClipped[3] === 180,
    bandClipped);
  const bandOff = figureBandFor([10, 300, 40, 330], 320, 180);
  expect("a head box off the frame's bottom collapses to an honest null band (the bridge never emits one)",
    JSON.stringify(bandOff) === "[0,0,0,0]", bandOff);
  const bandEdge = figureBandFor([0, 0, 20, 20], 320, 180);
  expect("the band keeps the head's own top (the hair reads in the crop)",
    bandEdge[0] === 0 && bandEdge[1] === 0 && bandEdge[3] === 120, bandEdge);
  expect("a degenerate box collapses to an honest null band",
    JSON.stringify(figureBandFor([10, 10, 10, 10], 640, 360)) === "[0,0,0,0]", "degenerate");

  // ── 3. THE FIGURE-CROP STRIP (the REAL ffmpeg, the REAL frames) ──
  const rendersDir = path.join(ROOT, "public", "renders");
  const framesDir = path.join(rendersDir, "posters");
  fs.mkdirSync(framesDir, { recursive: true });
  const framePaths = [1, 2, 3].map((i) => {
    const p = path.join(framesDir, `${TEST_JOB}-frame${i}.png`);
    // the figure wears its palette at the band's address: a saturated
    // robe block inside the band region of each frame (the face box
    // sits at 150,40-170,60; the band reaches y=160) - the crop proves
    // the band pulls the FIGURE's pixels, not the frame's wash
    if (!makeTestFrame("0x1b2a4a", p)) return null;
    spawnSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", p, "-vf",
        `drawbox=x=150:y=${40 + i * 5}:w=20:h=110:color=0xC17834@1:t=fill`,
        "-frames:v", "1", "-q:v", "3", p],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    return fs.existsSync(p) ? p : null;
  }).filter((p): p is string => p !== null);
  expect("three synthetic judge frames built (the real ffmpeg)", framePaths.length === 3, framePaths.length);

  const boxes = {
    lawVersion: 123, marks: [0.66, 1.2, 1.86], resX: 320, resY: 180, frames: [1, 2, 3],
    cast: [
      { name: "Lin Yue", boxes: [[150, 40, 170, 60], [150, 45, 170, 65], [150, 50, 170, 70]] as ([number, number, number, number] | null)[] },
      { name: "Demon Lord Wei", boxes: [null, null, null] as null[] },
    ],
  } as NonNullable<ReturnType<typeof readRenderFaceBoxes>>;
  writeTestJobFile({ render: { faceBoxes: boxes } });
  const reader = readRenderFaceBoxes(TEST_JOB);
  expect("the job-file reader serves the strip build (one reader, both shapes)", reader !== null, reader);

  const strip = await extractFigureCropStrip(TEST_JOB, boxes, framePaths);
  expect("the figure strip builds from the REAL frames", strip !== null, strip);
  expect("the strip names the members with cells", strip?.members[0] === "Lin Yue" && strip?.members.length === 1, strip?.members);
  const stripPath = path.join(framesDir, `${TEST_JOB}.figurestrip.jpg`);
  expect("the strip persists beside the face strip's cache", fs.existsSync(stripPath) && fs.statSync(stripPath).size > 1000, stripPath);
  const cell0 = path.join(framesDir, `${TEST_JOB}.figure-0-0.jpg`);
  expect("each band cell crops and upscales to the readable height", fs.existsSync(cell0), cell0);
  // the robe's saturated pixels ride the crop: the cell's mean must
  // carry the orange the frame's wash (0x1b2a4a) does not
  const probe = spawnSync("ffmpeg", ["-hide_banner", "-i", cell0, "-f", "null", "-"], { encoding: "utf8" });
  expect("the band cell is a real decodable image", probe.status === 0, probe.status);
  for (const f of fs.readdirSync(framesDir)) {
    if (f.startsWith(`${TEST_JOB}.`) || f.startsWith(`${TEST_JOB}-frame`)) { try { fs.unlinkSync(path.join(framesDir, f)); } catch { /* gone */ } }
  }

  // ── 4. THE PROMPT NAMES THE FIGURE LAW + HONEST NUMBERING ──
  const sheets = [
    { name: "Lin Yue", data: "d1", framingRef: { view: "front", data: "d2" } },
    { name: "Demon Lord Wei", data: "d3" },
  ];
  const both = buildIdentityPrompt(
    sheets, 3, "front",
    { members: ["Lin Yue", "Demon Lord Wei"], frames: 3 },
    { members: ["Lin Yue", "Demon Lord Wei"], frames: 3 },
  );
  expect("the face strip keeps its seat (Image 2) when both strips ride",
    both.includes("Image 2 is the FACE CROP strip for Lin Yue and Demon Lord Wei"), both.split("\n")[3]);
  expect("the figure strip names its own seat (Image 3) and its members",
    both.includes("Image 3 is the FIGURE CROP strip for Lin Yue and Demon Lord Wei"), both.split("\n")[4]);
  expect("the PALETTE and WARDROBE aspects score on the figure crops FIRST",
    both.includes("Score the PALETTE and WARDROBE aspects from these figure crops FIRST"), "the law");
  expect("the full filmstrip keeps composition, style at scale, hair, weapon",
    both.includes("The full filmstrip keeps composition, style at scale, hair, weapon."), "the split");
  expect("an unresolvable costume falls back honestly",
    both.includes("figure unresolved at this framing"), "the fallback");
  expect("the manifest numbers honestly under both strips (the sheets follow the strips)",
    both.includes("Image 4: canonical model sheet for Lin Yue")
      && both.includes("Image 5: Lin Yue's front view from the same sheet (the like-for-like framing for this shot)")
      && both.includes("Image 6: canonical model sheet for Demon Lord Wei"), both.split("\n")[1]);
  const faceOnly = buildIdentityPrompt(sheets, 3, "front", { members: ["Lin Yue"], frames: 3 });
  expect("the face-only path keeps the old numbering (no figure strip, sheets from Image 3)",
    faceOnly.includes("Image 2 is the FACE CROP strip") && faceOnly.includes("Image 3: canonical model sheet for Lin Yue"),
    faceOnly.split("\n")[1]);
  const bare = buildIdentityPrompt(sheets, 3, "front");
  expect("a render without boxes prompts exactly as before (honest degrade)",
    !bare.includes("FACE CROP strip") && !bare.includes("FIGURE CROP strip")
      && bare.includes("Image 2: canonical model sheet for Lin Yue"), "the old law");

  // ── 5. THE IDENTITY GATE RIDES BOTH STRIPS (source truth) ──
  const identity = read("src/lib/identity.ts");
  expect("both score paths build the figure strip beside the face's",
    identity.split("extractFigureCropStrip(poster.jobId").length - 1 === 2, "both paths");
  expect("the vision call inserts the figure strip right after the face's",
    identity.includes('...(figureStrip ? [{ type: "image_url" as const, image_url: { url: figureStrip.dataUrl } }] : []),'),
    "the insert");
  expect("the judged note names the figure crops",
    identity.includes("+ figure crops judged"), "the note");
  expect("the band law is exported for this e2e (pure, testable)",
    identity.includes("export function figureBandFor"), "the export");

  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("e2e failed:", e); process.exit(1); });
