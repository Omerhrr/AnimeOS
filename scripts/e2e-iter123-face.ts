// E2E iteration 123 - THE JUDGE SEES THE FACE. The 122 night's
// re-score named the frontier: face cells 10-30% at every framing
// wider than a closeup ("a simplified featureless oval") while
// hair/wardrobe/palette rode 60-90 on the SAME frames - the judge
// receives full frames only, and a wide face parks at ~10px of a
// 512-wide render. The rung answers on four fronts:
//   1. THE FACE'S OWN ADDRESS: the bridge projects each cast head
//      into screen space at the pose-sample marks (deterministic
//      world_to_camera_view) and the boxes ride the render evidence;
//   2. THE FACE-CROP STRIP: identity.ts crops the SAME frames the
//      filmstrip judged, upscales, labels, and the prompt scores the
//      FACE aspect on the crops first;
//   3. THE RESOLUTION RUNG: the preview cap 512 -> 640 (every cell
//      gains pixels; the cost class reads honestly);
//   4. THE NOSE IS A LINE + THE ANATOMIZED PROXY: the nose decal is
//      drawn (line + tick + base shadow at 128px), and the shading
//      proxy wears the facial field so the toon band traces the face.
import { buildIdentityPrompt, readRenderFaceBoxes, extractFaceCropStrip } from "../src/lib/identity";
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

const TEST_JOB = "e2e123face-test";

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
  // ── 1. THE FACE'S OWN ADDRESS (the bridge projects the heads) ──
  const bridge = read("bridges/blender/animeos_bridge.py");
  expect("the bridge declares the face-box law and its marks",
    bridge.includes("FACE_BOX_LAW_VERSION = 123") && bridge.includes("FACE_BOX_MARKS = (0.22, 0.40, 0.62)"),
    "the constants");
  expect("the projection is the deterministic camera solve (world_to_camera_view, no detection)",
    bridge.includes("def head_screen_boxes") && bridge.includes("world_to_camera_view"),
    "the projector");
  expect("the head family is the measure_subject law (HeadMesh, duplicate suffix split)",
    bridge.includes('ob.name.split(".")[0] != "HeadMesh"'), "the family");
  expect("the capture rides the frame loop at the mark frames",
    bridge.includes("if f in face_mark_frames:") && bridge.includes('state["render"]["faceBoxes"] = face_boxes_ev'),
    "the hook");
  expect("a short clip nudges colliding marks (every mark gets its own capture)",
    bridge.includes("while _fm in face_mark_frames and _fm < frames_total:"), "the nudge");
  expect("an off-frame head is an honest null cell",
    bridge.includes('out.append({"name": str(name), "box": None})'), "the null");

  // ── 2. THE RESOLUTION RUNG ──
  expect("the preview cap steps to 640 (the wide face gains pixels)",
    bridge.includes('cap = 1280 if mode == "FINAL" else 640'), "the cap");

  // ── 3. THE NOSE IS A LINE (the decal craft) ──
  const ac = read("bridges/blender/anime_character.py");
  expect("the nose is drawn, not a blob (line + tip tick + base shadow at 128px)",
    ac.includes("def paint_nose(w=128, h=128):") && ac.includes("THE NOSE IS A LINE, NOT A BLOB"), "the paint");
  expect("the nose plane answers its texture (19mm at 6 segments)",
    ac.includes('_decal_plane(bpy, scn, "NoseMesh", nose, 0.019, 0.019, nose_m, hm, segs=6)'), "the plane");
  expect("the builder declares v123",
    ac.includes("ANIME_LAW_VERSION = 123"), "the pin");

  // ── 4. THE ANATOMIZED PROXY (the toon band sees the face) ──
  expect("the shading proxy wears the facial field (the transferred normals carry the anatomy)",
    ac.includes("proxy_anatomy = _face_anatomy_mod.apply_face_anatomy(proxy, spec)") && ac.includes("animeos_face_proxy_anatomy"),
    "the carve");
  expect("the proxy evidence rides the figure's anime dict",
    ac.includes('"faceProxyAnatomy": proxy_anatomy'), "the evidence");

  // ── 5. readRenderFaceBoxes (real file law) ──
  expect("a job file without boxes degrades to null", readRenderFaceBoxes(TEST_JOB) === null, "missing");
  writeTestJobFile({
    render: {
      faceBoxes: {
        lawVersion: 123, marks: [0.66, 1.2, 1.86], resX: 640, resY: 360,
        frames: [3, 6, 9],
        cast: [
          { name: "Lin Yue", boxes: [[40, 20, 200, 220], [44, 24, 204, 224], [38, 18, 198, 218]] },
          { name: "Demon Lord Wei", boxes: [[300, 30, 460, 230], null, [310, 40, 470, 240]] },
        ],
      },
    },
  });
  const fb = readRenderFaceBoxes(TEST_JOB);
  expect("a valid job file parses: two members, three marks each",
    fb !== null && fb.cast.length === 2 && fb.marks.length === 3 && fb.resX === 640
    && fb.cast[0].boxes.length === 3 && fb.cast[1].boxes[1] === null, fb);
  writeTestJobFile({
    render: {
      faceBoxes: {
        lawVersion: 123, marks: [0.66, 1.2, 1.86], resX: 640, resY: 360,
        cast: [{ name: "Lin Yue", boxes: [[1, 2, 3]] }],
      },
    },
  });
  expect("a malformed box row (wrong arity) degrades to null", readRenderFaceBoxes(TEST_JOB) === null, "arity");
  writeTestJobFile({
    render: {
      faceBoxes: {
        lawVersion: 123, marks: [0.66, 1.2, 1.86], resX: 640, resY: 360,
        cast: [{ name: "Lin Yue", boxes: [[100, 50, 90, 220], null, null] }],
      },
    },
  });
  expect("an inverted box (xmax <= xmin) degrades to null", readRenderFaceBoxes(TEST_JOB) === null, "inverted");
  // THE REAL WORKER SHAPE: the job file IS the state - `render` rides
  // at the TOP level (the e2e fixture wrapper reads too, one reader
  // both shapes - the anime smoke's worker render proves the shape)
  writeTestJobFile({
    render: {
      faceBoxes: {
        lawVersion: 123, marks: [0.66, 1.2, 1.86], resX: 640, resY: 360,
        cast: [{ name: "Lin Yue", boxes: [[40, 20, 200, 220], null, [38, 18, 198, 218]] }],
      },
    },
  });
  const fbTop = readRenderFaceBoxes(TEST_JOB);
  expect("the REAL job-file shape (top-level render, a null mid-mark) parses",
    fbTop !== null && fbTop.resX === 640 && fbTop.cast[0].boxes[1] === null, fbTop);
  try { fs.unlinkSync(path.join(ROOT, "public", "renders", `.job-${TEST_JOB}.json`)); } catch { /* gone */ }
  expect("a missing job file degrades to null (old renders ride the full strip alone)",
    readRenderFaceBoxes(TEST_JOB) === null, "missing");

  // ── 6. THE FACE-CROP STRIP (real pixels through ffmpeg) ──
  const postersDir = path.join(ROOT, "public", "renders", "posters");
  fs.mkdirSync(postersDir, { recursive: true });
  const framePaths = [0, 1, 2].map((i) => {
    const p = path.join(postersDir, `${TEST_JOB}.strip${i}.jpg`);
    return makeTestFrame(["red", "green", "blue"][i], p) ? p : null;
  }).filter((p): p is string => p !== null);
  expect("the synthetic judge frames exist on disk", framePaths.length === 3, framePaths);
  const boxes: NonNullable<ReturnType<typeof readRenderFaceBoxes>> = {
    lawVersion: 123, marks: [0.66, 1.2, 1.86], resX: 320, resY: 180, frames: [1, 2, 3],
    cast: [
      { name: "Lin Yue", boxes: [[30, 20, 150, 140], [30, 20, 150, 140], [30, 20, 150, 140]] },
      { name: "Demon Lord Wei", boxes: [[170, 30, 290, 150], null, [170, 30, 290, 150]] },
    ],
  };
  const strip = await extractFaceCropStrip(TEST_JOB, boxes, framePaths);
  expect("the crop strip builds from real frames (two labeled rows, upscaled cells)",
    strip !== null && strip.members.length === 2 && strip.dataUrl.startsWith("data:image/jpeg;base64,")
    && strip.dataUrl.length > 1000, strip ? { members: strip.members, bytes: strip.dataUrl.length } : "null");
  expect("the strip's own frame cache wrote beside the poster",
    fs.existsSync(path.join(postersDir, `${TEST_JOB}.facestrip.jpg`)), "the cache");
  const allNull: NonNullable<ReturnType<typeof readRenderFaceBoxes>> = {
    lawVersion: 123, marks: [0.66, 1.2, 1.86], resX: 320, resY: 180, frames: [1, 2, 3],
    cast: [{ name: "Lin Yue", boxes: [null, null, null] }],
  };
  expect("a cast that never faces the lens degrades honestly (no strip)",
    await extractFaceCropStrip(TEST_JOB, allNull, framePaths) === null, "all-null");
  expect("too few source frames degrades honestly",
    await extractFaceCropStrip(TEST_JOB, boxes, framePaths.slice(0, 1)) === null, "one frame");
  for (const f of fs.readdirSync(postersDir)) {
    if (f.startsWith(`${TEST_JOB}.`)) { try { fs.unlinkSync(path.join(postersDir, f)); } catch { /* gone */ } }
  }

  // ── 7. THE PROMPT NAMES THE FACE LAW ──
  const sheets = [
    { name: "Lin Yue", data: "d1", framingRef: { view: "front", data: "d2" } },
    { name: "Demon Lord Wei", data: "d3" },
  ];
  const prompt = buildIdentityPrompt(sheets, 3, "front", { members: ["Lin Yue", "Demon Lord Wei"], frames: 3 });
  expect("the face law names the crop strip and its members",
    prompt.includes("Image 2 is the FACE CROP strip for Lin Yue and Demon Lord Wei"), prompt.split("\n")[3]);
  expect("the face aspect scores on the crops FIRST (the full frame's scale cannot resolve a face)",
    prompt.includes("Score the FACE aspect from these crops FIRST"), "the law");
  expect("the full frames keep the other aspects (hair, wardrobe, weapon, palette, style)",
    prompt.includes("The full filmstrip owns hair, wardrobe, weapon, palette and style."), "the split");
  expect("an unresolvable crop falls back honestly (never invented, never penalized)",
    prompt.includes("face unresolved at this framing"), "the fallback");
  const noFace = buildIdentityPrompt(sheets, 3, "front");
  expect("a render without face boxes prompts exactly as before (honest degrade)",
    !noFace.includes("FACE CROP strip"), "the old law");

  // ── 8. THE IDENTITY GATE RIDES THE STRIP (source truth) ──
  const identity = read("src/lib/identity.ts");
  expect("the score paths read the render's own boxes",
    identity.includes("readRenderFaceBoxes(poster.jobId)") && identity.includes("extractFaceCropStrip(poster.jobId"),
    "both paths");
  expect("the vision call inserts the crop strip right after the full frames",
    identity.includes("...(faceStrip ? [{ type: \"image_url\" as const, image_url: { url: faceStrip.dataUrl } }] : []),"),
    "the insert");
  expect("the judged note names the face crops",
    identity.includes("+ face crops judged"), "the note");
  expect("the strip crops the SAME frames the filmstrip judged (one truth, two scales)",
    identity.includes("framePaths: frames") && identity.includes("strip.framePaths ?? []"), "the frames");
}

main().then(() => {
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
});
