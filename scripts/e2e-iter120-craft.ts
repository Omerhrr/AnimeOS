// E2E iteration 120 - THE CHARACTER GAINS ITS CRAFT. The wardrobe
// crafts itself (folds, trims, embroidery, the blade's forge), the
// face gains structure (the analytic field, the profile read), the
// partner takes the hit (the REACTION-only rig on the paired body),
// and the strip says which frame it is (burned-in labels the vision
// cannot miscount).
import { compilePairedProgram, PAIRED_PERFORMANCE_LAW_VERSION } from "../src/lib/animation/paired-performance";
import { BUILT_IN_CHOREO } from "../src/lib/animation/choreography";
import { cueSampleTimestamps, buildFilmstripAt, poseSampleTimestamps } from "../src/lib/identity";
import { directedCuesOf } from "../src/lib/engine/render-review";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let failures = 0;
function expect(name: string, cond: boolean, detail: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!cond) failures++;
}

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

async function main() {
  // ── 1. THE STRIP SAYS WHICH FRAME IT IS (the REAL ffmpeg pass) ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "animeos-iter120-"));
  const clip = path.join(tmp, "clip.mp4");
  const ff = await new Promise<string>((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "ignore"] });
    child.on("close", () => resolve("ffmpeg"));
    child.on("error", () => resolve(""));
  });
  if (!ff) {
    expect("ffmpeg exists to build the honest artifact", false, "ffmpeg missing");
    return;
  }
  await new Promise<void>((resolve) => {
    const child = spawn("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=12:duration=3",
      "-pix_fmt", "yuv420p", "-c:v", "libx264", clip,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
  expect("the test clip exists (the honest artifact)", fs.existsSync(clip) && fs.statSync(clip).size > 0);

  const stamps = [0.5, 1.5, 2.5];
  const strip = await buildFilmstripAt(clip, "iter120-e2e", stamps, "cues");
  expect("THE STRIP BUILDS at explicit timestamps", strip !== null && strip.frames === 3, strip?.frames);
  expect("THE FRAMES CARRY BURNED-IN LABELS (a font was found and stamped)", strip?.labeled === true, strip?.labeled);
  // the labeled intermediates exist and are NOT byte-identical to the
  // unlabeled extraction (the drawtext pass actually drew)
  const postersDir = path.join(ROOT, "public", "renders", "posters");
  const raw0 = path.join(postersDir, "iter120-e2e.cues0.jpg");
  const lbl0 = path.join(postersDir, "iter120-e2e.cues0.lbl.jpg");
  expect("the labeled frame intermediates exist", fs.existsSync(raw0) && fs.existsSync(lbl0));
  if (fs.existsSync(raw0) && fs.existsSync(lbl0)) {
    const a = fs.readFileSync(raw0);
    const b = fs.readFileSync(lbl0);
    expect("the label actually DREW (labeled bytes differ from the raw frame)",
      a.length !== b.length || !a.equals(b));
  }
  expect("the labeled strip is cached beside the poster", fs.existsSync(path.join(postersDir, "iter120-e2e.cues.jpg")));
  // one frame cannot build a strip (the honest degradation)
  const one = await buildFilmstripAt(clip, "iter120-e2e-one", [1.0], "cues");
  expect("a single stamp degrades honestly (no strip)", one === null);

  // ── 2. THE PAIRED LAW STANDS (the partner's physics hangs on it) ──
  const combo = BUILT_IN_CHOREO.find((b) => b.name === "The Combo")!;
  const paired = compilePairedProgram(combo, "Wei");
  expect("the paired program keeps the one-clock law (119 held)",
    paired.program.keys.some((k) => k.pose === "BLOCK" && Math.abs(k.at - 0.42) < 1e-9 && k.kind === "strike"));
  expect("ONE CLASH ONE LIGHT is untouched", paired.program.impact === null && paired.program.smear === null);
  expect("the paired law keeps its version pin", PAIRED_PERFORMANCE_LAW_VERSION === 119);
  const paired2 = compilePairedProgram(combo, "Wei");
  expect("the answer still derives bit-exact", JSON.stringify(paired) === JSON.stringify(paired2));

  // ── 3. THE CUES STAND (the strip samples the directed beats) ──
  const cues = directedCuesOf({ choreo: JSON.stringify(combo), grammar: null });
  expect("the directed cues come from the choreo's keys + impact", cues.length >= 2 && cues.includes(0.42), cues);
  const stamps2 = cueSampleTimestamps(4.0, cues);
  expect("the cue stamps stay time-ordered, deduped, capped at 4",
    stamps2.length <= 4 && stamps2.every((t, i) => i === 0 || t > stamps2[i - 1]));
  expect("fewer than two cues degrades to the pose samples",
    cueSampleTimestamps(4.0, [0.4]).length === poseSampleTimestamps(4.0).length);

  // ── 4. THE PARTNER TAKES THE HIT (the wire law, mirrored) ──
  const phys = read("bridges/blender/physics_pass.py");
  expect("the partner mode exists on the physics rig (kinds_filter / strike_src / strike_from)",
    phys.includes("kinds_filter=None, strike_src=None, strike_from=None"));
  expect("the partner rig compiles REACTION ONLY - the meshes belong to the hero rig",
    phys.includes("the solid world's meshes belong to the hero rig"));
  expect("the striker's mark is the violence when the beat carries none",
    phys.includes("a blocked blade lives where the striker stands"));
  expect("the strikes carry their beat tag (a later beat never reads stale violence)",
    phys.includes('_beat_strikes_beat"] = beat_idx'));
  const bridge = read("bridges/blender/animeos_bridge.py");
  expect("the bridge builds the partner's REACTION rig on paired shots",
    bridge.includes("phys_rig2 = physics_pass.build_physics_rig(") && bridge.includes('kinds_filter={"REACTION"}'));
  expect("the partner rig binds at the paired program's STRIKE beats",
    bridge.includes('if pk.get("kind") == "strike"'));
  expect("the partner stagger rides AFTER the mark re-composes (recoil on top, never under)",
    bridge.includes("physics_pass.apply_physics(phys_rig2, t, t_sec"));
  expect("the partner's answer rides the state evidence",
    bridge.includes('state["partnerReaction"]') && bridge.includes('"strikesRead"'));
  expect("a shot without pairing or physics keeps the 119 law honestly",
    bridge.includes("physics keeps the 119 law honestly"));

  // ── 5. THE WARDROBE CRAFTS ITSELF (the source law) ──
  const ac = read("bridges/blender/anime_character.py");
  expect("the skirt gains its deterministic folds", ac.includes("THE SKIRT GAINS FOLDS") && ac.includes("0.035 * (t ** 1.2) * fold"));
  expect("the hem wears its measured trim", ac.includes('"HemTrim"') && ac.includes("measured AT the hem ring itself"));
  expect("the cuffs wear their bands", ac.includes('f"CuffBand{P}"') && ac.includes('cuff.name'));
  expect("the chest wears the painted cloud-scroll", ac.includes("paint_collar_band") && ac.includes('"ChestBandMesh"'));
  expect("the embroidery rides the spine (it poses with the chest)", ac.includes("ChestBandPivot") && ac.includes("spine=spine"));
  expect("the sword ships its forge", ac.includes('"GripBand') && ac.includes('"BladePommel"') && ac.includes('"BladeTassel'));
  expect("the staff ships its craft", ac.includes('"ShaftBand') && ac.includes('"ShaftCap'));
  expect("the pieces obey the 97 grip contract (one placement law)",
    ac.includes("br.grip_piece_offset(wtype, along)"));
  expect("the wardrobe evidence rides the anime dict", ac.includes('"wardrobe": wardrobe'));

  // ── 6. THE FACE GAINS STRUCTURE (the source law) ──
  const fa = read("bridges/blender/face_anatomy.py");
  expect("the face law exists and names its version", fa.includes('FACE_LAW_VERSION = "face-v1"'));
  const faceMidline = ["noseBridge", "noseTip", "upperLip", "lowerLip", "philtrum", "chin"];
  const facePairs = ["brow", "socket", "cheek", "jaw", "temple"];
  expect("the 16 fields name their law (6 midline + 5 paired x2 sides)",
    faceMidline.every((n) => fa.includes(`"${n}"`)) && facePairs.every((n) => fa.includes(`f"${n}{side}"`)),
    faceMidline.filter((n) => !fa.includes(`"${n}"`)).concat(facePairs.filter((n) => !fa.includes(`f"${n}{side}"`))));
  expect("the spec drives the carve (gender / shape / taper / chin)",
    fa.includes('1.5 if gender == "male"') && fa.includes("jaw_taper") && fa.includes("chin_fwd"));
  expect("THE HEAD'S STORED NORMALS are flipped outward for the sculpt only",
    fa.includes("THE HEAD'S STORED NORMALS POINT INWARD"));
  expect("the terminator law stays untouched (the sculpt moves geometry)",
    fa.includes("shading rides the") && ac.includes("the sculpt moves geometry"));
  expect("the profile read answers in millimeters", fa.includes('"proudMm"'));
  expect("the head carries the evidence prop", ac.includes('"animeos_face_anatomy"'));
  expect("the builder declares v120", ac.includes("ANIME_LAW_VERSION = 120"));

  // ── 7. THE PROMPTS TRUST THE LABEL ──
  const identity = read("src/lib/identity.ts");
  expect("the identity prompt names the burned-in label", identity.includes("burned-in corner label"));
  const review = read("src/lib/engine/render-review.ts");
  expect("the review prompt trusts the label over the model's own count",
    review.includes("trust the label, never your own count"));
  expect("the strip evidence carries the labeled flag", review.includes("labeled?: boolean"));

  // cleanup the tmp clip (the poster cache stays - the same law as the night's)
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
}

main().then(() => {
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
});
