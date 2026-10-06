// E2E iteration 126 - THE THREE RUNGS. The 125 night's rescore named
// the frontier twice over: the STYLE cell at scale reads the wides as
// 'simplified 2D cutout' / 'flat vector art' / 'low-poly' (10-40
// everywhere the figure is small), and the ESTABLISHING figure sits
// behind a 30px wall (S001 25% - even the figure crops are mush
// there). The A/B had already acquitted the house mist and named the
// DIRECTED moonlight grade as the gray that drains the costume's
// chroma WITH the set (S005 S=0.43 under moonlight vs 0.72-0.80 for
// the same figure under tribulation). The director's steer approved
// all three named rungs at once:
//   1. THE FIGURE-MATERIAL GRADE EXEMPTION - the grade is the
//      director's world and is NOT overridden; under a gray wash
//      class (moonlight) the figure's own cel dyes BANK chroma
//      before the grade lands (saturation scaled per material kind,
//      bounded, hue and value untouched). The tagged set surfaces
//      keep the full wash - the world grays, the cast keeps its
//      chroma. The chroma-rich grades (tribulation 1.12, dawn/neutral
//      1.06) take no exemption.
//   2. THE ESTABLISHING-SCALE RUNG - the resolution ladder gains a
//      third rung: ESTABLISHING previews at 1024 (the ~30px figure
//      gains ~1.6x linear, the crops feed the judge real texels), the
//      tight framings keep 640, FINAL stays 1280.
//   3. THE PAINTERLY STYLE RUNG - the 121 ramp's bands are still FLAT
//      FIELDS, and a constant-color field 200px wide IS vector art.
//      A deterministic tri-tone brush layer rides INSIDE each cel
//      band at the wide framings (noise on the mesh's own Generated
//      coords, quantized to three CONSTANT steps, mixing between a
//      sunk and a lifted patch) - the hard band edges stay (the 121
//      law intact, the measurer never sees the brush), the interiors
//      breathe like brushwork. MEDIUM and tighter stay canon.
// The probes below import the REAL modules under plain python3 (no
// bpy - the laws are pure) and assert the behavior, not the prose.
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
spec2 = importlib.util.spec_from_file_location("br", os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py"))
br = importlib.util.module_from_spec(spec2); spec2.loader.exec_module(br)
out = {}
out["lawVersion"] = tp.TOON_LAW_VERSION
out["depths"] = {k: tp.painterly_depth_for(k) for k in ("ESTABLISHING", "WIDE", "LOW_ANGLE", "MEDIUM", "CLOSEUP", None)}
rgb = (0.247, 0.561, 0.471)
banked = tp._keep_chroma(rgb, 1.28)
h0, l0, s0 = colorsys.rgb_to_hls(*rgb)
h1, l1, s1 = colorsys.rgb_to_hls(*banked)
out["keep"] = {"hueKept": abs(h1 - h0) < 1e-9, "valKept": abs(l1 - l0) < 1e-9,
               "s0": round(s0, 6), "s1": round(s1, 6), "bounded": 0.0 <= s1 <= 1.0,
               "scalesExactly": abs(s1 - min(1.0, s0 * 1.28)) < 1e-9,
               "identityAt1": tuple(tp._keep_chroma(rgb, 1.0)) == tuple(rgb),
               "identityBelow1": tuple(tp._keep_chroma(rgb, 0.9)) == tuple(rgb)}
out["ladder"] = {"establishing_preview": br.preview_cap_for("ESTABLISHING", "PREVIEW"),
                 "wide_preview": br.preview_cap_for("WIDE", "PREVIEW"),
                 "medium_preview": br.preview_cap_for("MEDIUM", "PREVIEW"),
                 "lowangle_preview": br.preview_cap_for("LOW_ANGLE", "PREVIEW"),
                 "none_preview": br.preview_cap_for(None, "PREVIEW"),
                 "establishing_final": br.preview_cap_for("ESTABLISHING", "FINAL"),
                 "wide_final": br.preview_cap_for("WIDE", "FINAL")}
out["swing"] = {"at": round(tp.painterly_swing_for(0.70), 6), "wide": round(tp.painterly_swing_for(0.55), 6), "low": round(tp.painterly_swing_for(0.40), 6), "bounded": tp.painterly_swing_for(1.5) <= 0.5}
print("PROBE_JSON " + json.dumps(out))
`;

async function main() {
  // ── 1. THE PAINTERLY STYLE RUNG (source law) ──
  const tp = read("bridges/blender/toon_pass.py");
  expect("the toon pass declares the law version (advanced legitimately to 131)", tp.includes("TOON_LAW_VERSION = 131"), "v131");
  expect("the painterly rung is a WIDE-end rung (the canon close look untouched)",
    tp.includes('PAINTERLY_BY_SHOT = {"LOW_ANGLE": 0.40, "WIDE": 0.55, "ESTABLISHING": 0.70}')
      && tp.includes("PAINTERLY_SWING_BASE = 0.10") && tp.includes("PAINTERLY_SWING_GAIN = 0.30")
      && tp.includes("PAINTERLY_NOISE_SCALE = 2.6"), "the table");
  expect("the brush field is three constant steps on the mesh's own coords (the brush, not a gradient)",
    tp.includes('pst.color_ramp.interpolation = "CONSTANT"')
      && tp.includes('nt.links.new(ptc.outputs["Generated"], pn.inputs["Vector"])'), "the field");
  expect("the brush wraps BOTH bands (lit + shadow)",
    tp.includes("_brush_wrap(em, shadow_base, cool.outputs[2] if color_in is not None else None)")
      && tp.includes("_brush_wrap(em_lit, rgb, color_in)"), "the wraps");
  expect("the swing bounds itself (never gradient dirt)", tp.includes("swing = painterly_swing_for(painterly)"), "the bound");
  expect("the 121 ramp table stands untouched (the rung rides ON it)",
    tp.includes('"ESTABLISHING":    (0.46, 0.80, 0.020)') && tp.includes('"CLOSEUP":         (0.62, 1.00, 0.040)'), "the canon");

  // ── 2. THE FIGURE-MATERIAL GRADE EXEMPTION (source law) ──
  expect("only the gray wash class takes the exemption (the 125 law stands - the grade is NOT overridden)",
    tp.includes('GRADE_CHROMA_WASH = {"moonlight": True}'), "the wash classes");
  expect("the keep table: skin mild, hair mid, cloth strongest",
    tp.includes('FIGURE_CHROMA_KEEP = {"skin": 1.10, "hair": 1.22, "cloth": 1.28}'), "the keeps");
  expect("the tagged set surfaces keep the full wash (the world grays)",
    tp.includes('if mat.get("animeos_set_surface"):') && tp.includes("set_excluded += 1"), "the tag check");
  expect("the bank is bounded by construction (HLS saturates at 1.0)",
    tp.includes("colorsys.hls_to_rgb(h, _l, min(1.0, s * keep))"), "the bound");
  expect("the evidence rides the look (painterlyRung + gradeExemption)",
    tp.includes('"painterlyRung"') && tp.includes('"gradeExemption"'), "evidence");

  // ── 3. THE ESTABLISHING-SCALE RUNG (source law) ──
  const br = read("bridges/blender/animeos_bridge.py");
  expect("the rung ladder: 640 preview, 1024 establishing, 1280 FINAL",
    br.includes("PREVIEW_CAP = 640") && br.includes("ESTABLISHING_CAP = 1024") && br.includes("FINAL_CAP = 1280"), "the ladder");
  expect("the worker rides the ladder (the hardcoded ternary is gone)",
    br.includes('cap = preview_cap_for(shot.get("shotType"), mode)')
      && !br.includes('cap = 1280 if mode == "FINAL" else 640'), "the call");
  expect("the style law still reads the shot's real output width (the ink solves at the new rung too)",
    br.includes('"resX": out_w}'), "the framing ctx");

  // ── 4. THE LAWS ANSWER FOR REAL (plain python3, no bpy) ──
  const r = spawnSync("python3", ["-c", PY_PROBE, ROOT], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0 || !r.stdout.includes("PROBE_JSON")) {
    expect("the real-module probe runs", false, { status: r.status, err: r.stderr?.slice(0, 300) });
    return finish();
  }
  const probeOut = r.stdout.slice(r.stdout.indexOf("PROBE_JSON ") + "PROBE_JSON ".length).split("\n")[0];
  const probe = JSON.parse(probeOut);
  expect("the law version answers 131 from the real module", probe.lawVersion === 131, probe.lawVersion);
  expect("the painterly depth answers the framing for real",
    probe.depths.ESTABLISHING === 0.7 && probe.depths.WIDE === 0.55 && probe.depths.LOW_ANGLE === 0.4
      && probe.depths.MEDIUM === 0 && probe.depths.CLOSEUP === 0 && probe.depths["null"] === 0, probe.depths);
  expect("chroma banks with hue and value kept, exactly scaled, bounded",
    probe.keep.hueKept && probe.keep.valKept && probe.keep.bounded && probe.keep.scalesExactly
      && probe.keep.s1 > probe.keep.s0, probe.keep);
  expect("keep <= 1.0 is the identity (no wash, no bank)",
    probe.keep.identityAt1 && probe.keep.identityBelow1, probe.keep);
  expect("the ladder answers for real (1024 establishing / 640 the rest / 1280 FINAL)",
    probe.ladder.establishing_preview === 1024 && probe.ladder.wide_preview === 640
      && probe.ladder.medium_preview === 640 && probe.ladder.lowangle_preview === 640
      && probe.ladder.none_preview === 640 && probe.ladder.establishing_final === 1280
      && probe.ladder.wide_final === 1280, probe.ladder);
  expect("the brush swing is the 127 statement law (base + gain x depth, bounded)",
    probe.swing.at === Math.round(0.31 * 1e6) / 1e6 && probe.swing.wide === Math.round(0.265 * 1e6) / 1e6
      && probe.swing.low === Math.round(0.22 * 1e6) / 1e6 && probe.swing.bounded, probe.swing);

  // ── 5. THE NIGHT TOOL (the 122 ops law: double-fork detach, the explicit env) ──
  const night = read("scripts/detached-night126.mjs");
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
