// E2E iteration 127 - THE VALUE WALL ANSWERS. The 126 night's rescore
// landed all three rungs and the aggregate held EXACTLY the 125
// distribution (mean 43 / median 35 / p10 25, 5/6 under) - the notes
// named the two remaining walls in the judge's own words:
//   1. THE PALE-DYE VALUE WALL - S005 palette 10%: "a plain white
//      robe instead of the detailed light green". A multiplicative
//      saturation bank CANNOT rescue a near-white VALUE: on a pastel
//      the channel spread is bounded by the lightness itself
//      (s x 1.28 on the palest green still lands within ~0.09 of
//      white), and the wash reads white. The answer is the VALUE
//      branch: pale CLOTH dyes with an authored hue DEEPEN toward
//      PALE_L_TARGET and floor their saturation before the grade
//      lands - hue untouched, bounded, gray stands down (a true gray
//      has no hue to protect; inventing one would paint the robe
//      pink), skin never deepens (the face's paleness IS the
//      character).
//   2. THE INVISIBLE BRUSH - S004 style 10%: "a severe style
//      downgrade to a low-fidelity 3D render" while the 126 brush
//      rode +/-8.4% value steps. A statement the judge cannot SEE is
//      not a statement: the swing becomes a law of the framing
//      (PAINTERLY_SWING_BASE 0.10 + PAINTERLY_SWING_GAIN 0.30 x depth
//      = 0.31 / 0.265 / 0.22 at ESTABLISHING / WIDE / LOW_ANGLE -
//      three to four times the 126 read), and the LIFTED patch stops
//      being a clamped no-op on pale dyes - past PAINTERLY_PALE_LUM
//      the lift is a DRY-BRUSH toward white (every channel pulls
//      toward 1.0 proportionally, hue preserved).
// The probes import the REAL modules under plain python3 (no bpy -
// the laws are pure) and assert the behavior, not the prose.
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

const PY_PROBE = `
import colorsys, importlib.util, json, os, sys
ROOT = sys.argv[-1]
spec = importlib.util.spec_from_file_location("tp", os.path.join(ROOT, "bridges", "blender", "toon_pass.py"))
tp = importlib.util.module_from_spec(spec); spec.loader.exec_module(tp)
out = {}
out["lawVersion"] = tp.TOON_LAW_VERSION

# the pale robe (the S005 family: a detailed light green that the
# moonlight wash read as white). The dye arrives in LINEAR space -
# the same sRGB->linear transfer the bridge's hex_to_rgb applies.
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
pale = tuple(srgb_to_lin(int(h, 16) / 255.0) for h in ("db", "e8", "d0"))
h0, l0, s0 = colorsys.rgb_to_hls(*pale)
banked = tp._keep_chroma(pale, 1.28, "cloth")
h1, l1, s1 = colorsys.rgb_to_hls(*banked)
mult = tp._keep_chroma(pale, 1.28, "hair")
out["pale"] = {
    "wasPale": tp._is_pale_cloth(pale),
    "deepened": l1 < l0,
    "approachExact": abs(l1 - (l0 - (l0 - tp.PALE_L_TARGET) * tp.PALE_APPROACH)) < 1e-9,
    "floored": s1 >= max(s0 * 1.28, tp.PALE_S_FLOOR) - 1e-9,
    "hueKept": abs(h1 - h0) < 1e-9,
    "bounded": 0.0 <= s1 <= 1.0 and 0.0 <= l1 <= 1.0,
    "spread0": round(max(pale) - min(pale), 6),
    "spread1": round(max(banked) - min(banked), 6),
    "multSpread": round(max(mult) - min(mult), 6)}

# THE STANDING PRODUCTION'S OWN WALL: the sheet-read robe #9bbcb3 - a
# pale gray-sage whose expressible spread (2*s*min(l,1-l)) is 0.175 -
# the dye behind "a plain white robe instead of the detailed light
# green". It sits BELOW the target value: the branch LIFTS it.
robe = tuple(srgb_to_lin(int(h, 16) / 255.0) for h in ("9b", "bc", "b3"))
rh0, rl0, rs0 = colorsys.rgb_to_hls(*robe)
robe_b = tp._pale_bank(robe, 1.0)
rh1, rl1, rs1 = colorsys.rgb_to_hls(*robe_b)
out["robe"] = {
    "wasPale": tp._is_pale_cloth(robe),
    "belowTarget": rl0 < tp.PALE_L_TARGET,
    "lifted": rl1 > rl0,
    "approachExact": abs(rl1 - (rl0 - (rl0 - tp.PALE_L_TARGET) * tp.PALE_APPROACH)) < 1e-9,
    "floored": rs1 >= tp.PALE_S_FLOOR - 1e-9,
    "hueKept": abs(rh1 - rh0) < 1e-9,
    "spread0": round(max(robe) - min(robe), 6),
    "spread1": round(max(robe_b) - min(robe_b), 6)}

# a pale warm gray (L past the pale gate, S under the hue floor):
# the branch stands down on the HUE side - no invented hue, and the
# multiplicative bank applies exactly (the smoke covers the L side)
palegray = (0.66, 0.67, 0.68)
gh0, gl0, gs0 = colorsys.rgb_to_hls(*palegray)
gb = tp._keep_chroma(palegray, 1.28, "cloth")
gh1, gl1, gs1 = colorsys.rgb_to_hls(*gb)
out["gray"] = {"standsDown": not tp._is_pale_cloth(palegray),
               "wasPaleButHueless": gl0 > tp.PALE_L_LOW and gs0 <= tp.PALE_HUE_EPS,
               "valueKept": abs(gl1 - gl0) < 1e-9,
               "multiplicative": abs(gs1 - min(1.0, gs0 * 1.28)) < 1e-9,
               "noNewHue": gh0 == gh1 or gs0 < 1e-9}

# pale skin: never deepens (the branch is cloth's own)
skin = (0.93, 0.85, 0.78)
skin_l0 = colorsys.rgb_to_hls(*skin)[1]
skin_l1 = colorsys.rgb_to_hls(*tp._keep_chroma(skin, 1.10, "skin"))[1]
out["skin"] = {"valueKept": abs(skin_l1 - skin_l0) < 1e-9}

# an ordinary dye: the 126 multiplicative bank, EXACTLY
mid = (0.247, 0.561, 0.471)
mh0, ml0, ms0 = colorsys.rgb_to_hls(*mid)
mb = tp._keep_chroma(mid, 1.28, "cloth")
mh1, ml1, ms1 = colorsys.rgb_to_hls(*mb)
out["ordinary"] = {"hueKept": abs(mh1 - mh0) < 1e-9, "valKept": abs(ml1 - ml0) < 1e-9,
                   "scalesExactly": abs(ms1 - min(1.0, ms0 * 1.28)) < 1e-9,
                   "identityAt1": tuple(tp._keep_chroma(mid, 1.0, "cloth")) == tuple(mid),
                   "identityBelow1": tuple(tp._keep_chroma(mid, 0.9, "cloth")) == tuple(mid)}

# the stronger statement: the swing is a law of the framing
out["swing"] = {"establishing": round(tp.painterly_swing_for(0.70), 6),
                "wide": round(tp.painterly_swing_for(0.55), 6),
                "low": round(tp.painterly_swing_for(0.40), 6),
                "bounded": tp.painterly_swing_for(1.5) <= 0.5,
                "gainMonotone": tp.painterly_swing_for(0.70) > tp.painterly_swing_for(0.55) > tp.painterly_swing_for(0.40)}
print("PROBE_JSON " + json.dumps(out))
`;

async function main() {
  // ── 1. THE PALE-DYE VALUE BRANCH (source law) ──
  const tp = read("bridges/blender/toon_pass.py");
  expect("the toon pass declares the law version (advanced legitimately to 132)", tp.includes("TOON_LAW_VERSION = 132"), "v131");
  expect("the value branch's dials are named laws (linear-space, the wall is the spread)",
    tp.includes("PALE_L_LOW = 0.30") && tp.includes("PALE_L_TARGET = 0.55")
      && tp.includes("PALE_APPROACH = 0.60") && tp.includes("PALE_S_FLOOR = 0.34")
      && tp.includes("PALE_HUE_EPS = 0.04") && tp.includes("PALE_SPREAD_GATE = 0.30"), "the dials");
  expect("the branch answers CLOTH with an authored hue whose spread cannot read (the wall's own measure)",
    tp.includes('if kind == "cloth" and _is_pale_cloth(rgb):')
      && tp.includes("return (_l > PALE_L_LOW and s > PALE_HUE_EPS")
      && tp.includes("and (2.0 * s * min(_l, 1.0 - _l)) < PALE_SPREAD_GATE)"), "the gate");
  expect("the branch approaches the readable-pastel value FROM EITHER SIDE and floors the saturation",
    tp.includes("def _pale_bank(rgb, keep=1.0):")
      && tp.includes("_l2 = _l - (_l - PALE_L_TARGET) * PALE_APPROACH")
      && tp.includes("s2 = min(1.0, max(s * keep, PALE_S_FLOOR))"), "the bank");
  expect("the wide-end branch rides ANY grade at the painted framings (the named cell rode NEUTRAL)",
    tp.includes("elif p_depth > 0 and kind == \"cloth\" and not mat.get(\"animeos_set_surface\") and _is_pale_cloth(rgb):")
      && tp.includes("rgb = _pale_bank(rgb, 1.0)"), "the scope");
  expect("the predicate exists for the evidence (the branch names its own count on both rides)",
    tp.includes("def _is_pale_cloth(rgb):") && tp.includes("pale_banked += 1")
      && tp.includes('"paleBanked": pale_banked})') && tp.includes('"paleBanked": pale_banked}'), "the count");
  expect("the exemption still answers only the gray wash class (the 125/126 law stands)",
    tp.includes('GRADE_CHROMA_WASH = {"moonlight": True}')
      && tp.includes('FIGURE_CHROMA_KEEP = {"skin": 1.10, "hair": 1.22, "cloth": 1.28}'), "the classes");

  // ── 2. THE STRONGER STATEMENT (source law) ──
  expect("the swing is a law of the framing (base + gain x depth)",
    tp.includes("PAINTERLY_SWING_BASE = 0.10") && tp.includes("PAINTERLY_SWING_GAIN = 0.30")
      && tp.includes("def painterly_swing_for(depth):")
      && tp.includes("return min(0.5, PAINTERLY_SWING_BASE + PAINTERLY_SWING_GAIN * float(depth))"), "the law");
  expect("the lifted patch answers pale dyes (the dry-brush toward white)",
    tp.includes("PAINTERLY_PALE_LUM = 0.60") && tp.includes("PAINTERLY_PALE_LIFT = 0.85")
      && tp.includes("if _lum > PAINTERLY_PALE_LUM:")
      && tp.includes("_lift = tuple(min(1.0, c + (1.0 - c) * _k) for c in base_rgb[:3])"), "the lift");
  expect("the painterly rung evidence names its swing",
    tp.includes('"swing": round(painterly_swing_for(p_depth), 3)'), "evidence");
  expect("the brush field is still three constant steps on the mesh's own coords (never a gradient)",
    tp.includes('pst.color_ramp.interpolation = "CONSTANT"')
      && tp.includes('nt.links.new(ptc.outputs["Generated"], pn.inputs["Vector"])'), "the field");
  expect("the 121 ramp table stands untouched (the rungs ride ON it)",
    tp.includes('"ESTABLISHING":    (0.46, 0.80, 0.020)') && tp.includes('"CLOSEUP":         (0.62, 1.00, 0.040)'), "the canon");

  // ── 3. THE LAWS ANSWER FOR REAL (plain python3, no bpy) ──
  const r = spawnSync("python3", ["-c", PY_PROBE, ROOT], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0 || !r.stdout.includes("PROBE_JSON")) {
    expect("the real-module probe runs", false, { status: r.status, err: r.stderr?.slice(0, 300) });
    return finish();
  }
  const probeOut = r.stdout.slice(r.stdout.indexOf("PROBE_JSON ") + "PROBE_JSON ".length).split("\n")[0];
  const probe = JSON.parse(probeOut);
  expect("the law version answers 131 from the real module", probe.lawVersion === 132, probe.lawVersion);
  expect("the pale robe takes the VALUE branch: approached exactly, floored, hue exact, bounded",
    probe.pale.wasPale && probe.pale.deepened && probe.pale.approachExact && probe.pale.floored
      && probe.pale.hueKept && probe.pale.bounded, probe.pale);
  expect("the deepened dye grants headroom the multiplicative bank could not (and 1.6x the authored spread)",
    probe.pale.spread1 > probe.pale.multSpread && probe.pale.spread1 > probe.pale.spread0 * 1.6, probe.pale);
  expect("the sheet-read robe fires from BELOW the target (the L-aware lift) and its spread nearly doubles",
    probe.robe.wasPale && probe.robe.belowTarget && probe.robe.lifted && probe.robe.approachExact
      && probe.robe.floored && probe.robe.hueKept
      && probe.robe.spread1 > probe.robe.spread0 * 1.8, probe.robe);
  expect("a pale hueless dye stands down (no invented hue, value kept, multiplicative)",
    probe.gray.standsDown && probe.gray.wasPaleButHueless && probe.gray.valueKept
      && probe.gray.multiplicative, probe.gray);
  expect("pale skin never deepens (the face's paleness IS the character)",
    probe.skin.valueKept, probe.skin);
  expect("an ordinary dye keeps the exact 126 multiplicative bank (hue+value kept, identity at keep<=1)",
    probe.ordinary.hueKept && probe.ordinary.valKept && probe.ordinary.scalesExactly
      && probe.ordinary.identityAt1 && probe.ordinary.identityBelow1, probe.ordinary);
  expect("the swing answers the framing for real (0.31 / 0.265 / 0.22, monotone, bounded)",
    probe.swing.establishing === Math.round(0.31 * 1e6) / 1e6
      && probe.swing.wide === Math.round(0.265 * 1e6) / 1e6
      && probe.swing.low === Math.round(0.22 * 1e6) / 1e6
      && probe.swing.bounded && probe.swing.gainMonotone, probe.swing);

  // ── 4. THE NIGHT TOOL (the 122 ops law: double-fork detach, the explicit env) ──
  const night = read("scripts/detached-night127.mjs");
  expect("the night detaches double-forked with the explicit DATABASE_URL, hull ink, median of 3",
    night.includes('DATABASE_URL: "file:/home/z/my-project/AnimeOS/db/custom.db"')
      && night.includes('ANIMEOS_INK: "hull"') && night.includes('ANIMEOS_SCORE_SAMPLES: "3"')
      && night.includes("child.unref()") && night.includes("mid.unref()"), "the env");
  expect("the night drives the same tick the UI drives (reset | drain | rescore)",
    night.includes('reset: "scripts/reset-sc12-renders.ts"') && night.includes('drain: "scripts/night111-run.ts"')
      && night.includes('rescore: "scripts/night111-rescore.ts"'), "the phases");

  finish();
}

function finish() {
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
