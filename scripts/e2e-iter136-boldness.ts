// E2E ITERATION 136 - THE TRIM'S OWN BOLDNESS RUNG (TOON_LAW_VERSION 131 -> 132).
// The 135 night's remnant, answered by the eye before the pen:
//   1. THE FRAMINGS WHERE THE TRIM OWNS FEW TEXELS STILL READ IT FLAT:
//      S001's establishing ('lack the intricate embroidery', wardrobe 40)
//      and S006-Wei's pair ('the wardrobe lacks the gold trim of the
//      model sheet'). The eye's own arithmetic: the sash strap at the
//      establishing is ~4px wide - the 21.0 stitch's ~10 alternations
//      alias into one mean tone and the strap reads SMOOTH.
//   2. THE EYE-READ RECEIPT (probe-136-boldness, 7 real cuts on the
//      honest payloads): A1 (the standing law) reads flat gold straps;
//      the coarser stitches resolve the thread (stitch 7.0 carries
//      ~1-2 alternations at the strap); the W6 A/B on the REAL pair
//      payload (Lin + Wei, the honest DNA palettes) shows the thread
//      alternation visible under the bold vs flat straps under the
//      standing law - the winner: stitch 7.0 + strength 0.75.
//   3. THE LAW (toon_pass): TRIM_WEAVE_BOLD_BY_SHOT keys the wide end
//      (LOW_ANGLE/WIDE/ESTABLISHING - the brush's own framings, where
//      the trim is small); there the stitch coarsens (21.0 -> 7.0) and
//      the thread rides farther (0.55 -> 0.75). The 135 scope's own
//      framings (MEDIUM/MCU/CLOSEUP/ECU) keep the standing values
//      BYTE-EXACT (the 135 receipt stands). The 126 discipline holds
//      (CONSTANT steps, never a gradient); the 121 hard band edges
//      stand; the evidence names the boldness honestly (bold +
//      'the trim's own boldness rung (136)').
//   4. THE NODE TRUTH: the stitch node carries its own name
//      (EmbroideryStitch) - the e2e reads the REAL worker_run's node
//      values: 7.0/0.75 at the wide end, 21.0/0.55 at the trim's own
//      framings, on the same builds.
// Run: npx tsx scripts/e2e-iter136-boldness.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
function expect(name: string, cond: unknown, detail?: unknown) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures++;
}

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BLENDER = process.env.ANIMEOS_BLENDER_BIN || "/home/z/blender-5.2.2-linux-x64/blender";

// ── 1. THE SOURCE LAWS ──
const tp = read("bridges/blender/toon_pass.py");
expect("the toon law advances to 132 (the trim's own boldness rung)",
  tp.includes("TOON_LAW_VERSION = 133"), "v133");
expect("the boldness table names the three wide-end framings (the brush's own scope, where the trim is small)",
  tp.includes('TRIM_WEAVE_BOLD_BY_SHOT = {"LOW_ANGLE": 1.0, "WIDE": 1.0, "ESTABLISHING": 1.0}'), "the table");
expect("the bold stitch lands the probe's winner (7.0 - the strap's ~1-2 alternations)",
  tp.includes("TRIM_WEAVE_BOLD_STITCH = 7.0"), "stitch 7.0");
expect("the bold strength lands the probe's winner (0.75 - the thread rides farther)",
  tp.includes("TRIM_WEAVE_BOLD_STRENGTH = 0.75"), "strength 0.75");
expect("the bold gate refuses every framing outside the table",
  /return TRIM_WEAVE_BOLD_BY_SHOT\.get\(str\(shot_type or "MEDIUM"\)\.upper\(\), 0\.0\)/.test(tp), "the .get default");
expect("the boldness keys the brush's framings AND its own table (the wide end only)",
  /weave_bold = p_depth > 0 and \(trim_weave_bold_for\(framing_ctx\.get\("shotType"\)\) > 0 if isinstance\(framing_ctx, dict\) else False\)/.test(tp), "weave_bold");
expect("the cel tree carries the boldness flag",
  /def _cel_tree\(mat, rgb, kind, hex_to_rgb=None, ramp=None, painterly=0\.0, trim=False, weave=False, weave_bold=False\):/.test(tp), "the signature");
expect("the stitch node reads the bold conditional (the wide end coarsens)",
  /_stitch = TRIM_WEAVE_BOLD_STITCH if weave_bold else EMBROIDERY_STITCH/.test(tp), "the stitch conditional");
expect("the stitch node carries its own name (the node truth's address)",
  tp.includes('w_ax.name = "EmbroideryStitch"'), "the name");
expect("the strength node reads the bold conditional (the thread rides farther)",
  /e_k\.inputs\[1\]\.default_value = \(TRIM_WEAVE_BOLD_STRENGTH if weave_bold else EMBROIDERY_STRENGTH\)/.test(tp), "the strength conditional");
expect("the evidence names the boldness honestly (bold + the 136 rung sentence)",
  tp.includes('"bold": bool(weave_bold)') && tp.includes('"the trim\'s own boldness rung (136)"'), "the evidence");
expect("the evidence's dials answer the bold conditionals (the rung reads the ACTIVE values)",
  /"strength": \(TRIM_WEAVE_BOLD_STRENGTH if weave_bold else EMBROIDERY_STRENGTH\)/.test(tp)
  && /"stitch": \(TRIM_WEAVE_BOLD_STITCH if weave_bold else EMBROIDERY_STITCH\)/.test(tp), "the active dials");
expect("the 135 scope table stands byte-exact (the trim's own framings)",
  tp.includes('TRIM_WEAVE_BY_SHOT = {"MEDIUM": 1.0, "MCU": 1.0, "CLOSEUP": 1.0, "ECU": 1.0}'), "the 135 table");
expect("the standing stitch stands (the 135 receipt's own values)",
  tp.includes("EMBROIDERY_STITCH = 21.0") && tp.includes("EMBROIDERY_STRENGTH = 0.55"), "the standing dials");
expect("the 135 composition stands (the weave rides the brush's framings PLUS its own table)",
  /weave_on = p_depth > 0 or \(trim_weave_for\(framing_ctx\.get\("shotType"\)\) > 0 if isinstance\(framing_ctx, dict\) else False\)/.test(tp), "weave_on");
expect("the evidence's scope pair stands (the 135 rung vs the 128 brush scope)",
  tp.includes('"the trim weave\'s own rung (135)"') && tp.includes('("the wide-end brush scope (128)" if p_depth > 0 else'), "the scope pair");
const br = read("bridges/blender/animeos_bridge.py");
expect("the presence law holds its 108 rung (no presence change this iteration)",
  br.includes("PRESENCE_LAW_VERSION = 108"), "v108");
expect("the tag's staging sweep stands (the 135 side-door fix)",
  br.includes("_tagged_set") && br.includes('state["setSurfaceMats"] = _tagged_set'), "the sweep");

// ── 2. THE REAL BLENDER PROBE (the node truth on the REAL worker_run) ──
const PROBE = `
import importlib.util, json, os, sys, tempfile
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(BRIDGE))
import toon_pass as tp

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the gate's own unit truth (the table's glass)
ok("the bold gate rides the three wide-end framings",
   all(tp.trim_weave_bold_for(s) == 1.0 for s in ("WIDE", "ESTABLISHING", "LOW_ANGLE")))
ok("the bold gate refuses the trim's own framings and the unknowns (the 135 scope keeps the standing stitch)",
   all(tp.trim_weave_bold_for(s) == 0.0 for s in ("MEDIUM", "MCU", "CLOSEUP", "ECU", "FOO", None)))

LIN_SPEC = {"body": {"gender": "male", "build": "lean", "shoulders": 1.15, "hips": 0.9, "bust": 0.05, "headScale": 0.9},
            "face": {"shape": "angular", "jawTaper": 0.6, "chinFwd": 0.02, "cheek": 0.85},
            "eyes": {"size": 0.8, "tilt": -0.2, "color": "#1a1a2e", "shape": "almond", "lashes": 0.5},
            "brows": {"thickness": 1.25, "arch": 0.4},
            "mouth": {"width": 0.9, "color": "#8b4513"},
            "hair": {"style": "topknot", "length": 0.95, "bangs": "parted", "volume": 1.3, "color": "#1a1a1a"},
            "outfit": {"type": "hanfu", "length": 1.0, "sleeves": "bell", "collar": "crossed", "sash": True}}
LIN = {"name": "Lin Yue", "hairStyle": "topknot", "hairColor": "#1a1a1a",
       "robeColor": "#1f5c5c", "robeAccent": "#c4b454", "skinTone": "#e8d5c4",
       "weaponType": "sword", "bladeColor": "#5eead4", "designSpec": LIN_SPEC}

def build(shot_type, lens):
    out_dir = tempfile.mkdtemp(prefix="e136-")
    job = os.path.join(out_dir, "job.json")
    shot = {"number": 1, "description": "Establishing shot - Azure Mountain summit, temple ruin in the storm, clouds churning below the peak; Lin Yue a lone figure on the summit path",
            "shotType": shot_type, "lens": lens, "movement": "CRANE",
            "lighting": "Moonlight + storm clouds", "duration": 0.8,
            "cast": [LIN]}
    payload = {"shot": shot,
               "scene": {"number": 1, "title": "e136", "fogDensity": 0.45,
                         "lightningIntensity": 0.3, "energyIntensity": 0.6,
                         "cameraDistance": 1.0, "rimLightIntensity": 0.5},
               "project": {"title": "e136", "visualStyle": "DONGHUA",
                           "resolution": "320x180", "fps": 2},
               "mode": "PREVIEW"}
    json.dump({"jobId": f"e136-{shot_type}", "payload": payload, "outDir": out_dir}, open(job, "w"))
    m.worker_run(job)
    st = json.load(open(job))
    import bpy
    rows = {}
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        names = [n.name for n in mat.node_tree.nodes]
        row = {"tagged": bool(mat.get("animeos_set_surface")),
               "weave": "EmbroideryRamp" in names and "EmbroideryMix" in names}
        if "EmbroideryStitch" in names:
            row["stitch"] = mat.node_tree.nodes["EmbroideryStitch"].inputs[1].default_value
        if "EmbroideryStrength" in names:
            row["strength"] = mat.node_tree.nodes["EmbroideryStrength"].inputs[1].default_value
        rows[mat.name] = row
    return st, rows

# ── ESTABLISHING: the named flat-read framing - the boldness rides ──
st_e, rows_e = build("ESTABLISHING", "24mm")
look_e = ((st_e.get("render") or {}).get("look") or {})
er_e = look_e.get("embroideryRung")
pw_e = look_e.get("painterlyRung")
ok("the look rides the 133 law at the establishing (the 140 statement)", look_e.get("lawVersion") == 133, look_e.get("lawVersion"))
ok("the establishing's rung names the boldness (bold True, the 136 sentence)",
   isinstance(er_e, dict) and er_e.get("bold") is True
   and er_e.get("boldness") == "the trim's own boldness rung (136)", er_e)
ok("the establishing's rung dials read the BOLD values (stitch 7.0, strength 0.75)",
   isinstance(er_e, dict) and er_e.get("stitch") == 7.0 and er_e.get("strength") == 0.75, er_e)
ok("the establishing's scope still names the 128 brush scope (the composition stands)",
   isinstance(er_e, dict) and er_e.get("scope") == "the wide-end brush scope (128)", er_e)
ok("the establishing's brush rode (the painterly rung present - the two statements compose)",
   isinstance(pw_e, dict) and pw_e.get("depth", 0) > 0, pw_e)
ok("the trim's stitch NODE reads the bold value (7.0 - the node truth)",
   rows_e.get("AccentMat", {}).get("stitch") == 7.0, rows_e.get("AccentMat"))
ok("the trim's strength NODE reads the bold value (0.75)",
   rows_e.get("AccentMat", {}).get("strength") == 0.75, rows_e.get("AccentMat"))
ok("the hem cloth's stitch rides the bold too (the robe's yuanbian address)",
   rows_e.get("RobeMat", {}).get("stitch") == 7.0 and rows_e.get("RobeMat", {}).get("weave") is True, rows_e.get("RobeMat"))
ok("the establishing's world is tagged and clean (the 135 sweep stands)",
   rows_e.get("SetMat", {}).get("tagged") is True and rows_e.get("SetMat", {}).get("weave") is False, rows_e.get("SetMat"))

# ── WIDE: the pair shot's framing - the boldness rides there too ──
st_w, rows_w = build("WIDE", "28mm")
er_w = ((st_w.get("render") or {}).get("look") or {}).get("embroideryRung")
ok("the wide's rung is bold (stitch 7.0 - the pair shot's framing)",
   isinstance(er_w, dict) and er_w.get("bold") is True and er_w.get("stitch") == 7.0, er_w)

# ── MEDIUM: the 135 receipt byte-kept (the standing stitch, no bold) ──
st_m, rows_m = build("MEDIUM", "35mm")
look_m = ((st_m.get("render") or {}).get("look") or {})
er_m = look_m.get("embroideryRung")
ok("the MEDIUM's rung refuses the boldness (bold False, no sentence)",
   isinstance(er_m, dict) and er_m.get("bold") is False and er_m.get("boldness") is None, er_m)
ok("the MEDIUM's rung dials read the STANDING values (stitch 21.0, strength 0.55 - the 135 receipt)",
   isinstance(er_m, dict) and er_m.get("stitch") == 21.0 and er_m.get("strength") == 0.55, er_m)
ok("the MEDIUM's scope names the trim weave's own rung (135) at depth 0",
   isinstance(er_m, dict) and er_m.get("scope") == "the trim weave's own rung (135)" and er_m.get("depth") == 0.0, er_m)
ok("the MEDIUM's painterly rung stays null (the 126/127 brush scope byte-kept)",
   look_m.get("painterlyRung") is None, look_m.get("painterlyRung"))
ok("the MEDIUM's stitch NODE reads the standing value (21.0 - the node truth)",
   rows_m.get("AccentMat", {}).get("stitch") == 21.0, rows_m.get("AccentMat"))
ok("the MEDIUM's strength NODE reads the standing value (0.55 - float32-honest)",
   rows_m.get("AccentMat", {}).get("strength") is not None and abs(rows_m.get("AccentMat", {}).get("strength") - 0.55) < 1e-5,
   rows_m.get("AccentMat"))
weave_holders = sorted(n for n, r in rows_m.items() if r["weave"])
ok("the MEDIUM's weave holders are exactly the figure's cloth (the 135 acquittal stands)",
   weave_holders == ["AccentMat", "BootsMat", "RobeMat"], weave_holders)

# ── CLOSEUP: the 135 scope's own framings refuse the bold ──
st_c, rows_c = build("CLOSEUP", "85mm")
er_c = ((st_c.get("render") or {}).get("look") or {}).get("embroideryRung")
ok("the closeup's rung refuses the boldness too (the 135 scope's framings keep the standing stitch)",
   isinstance(er_c, dict) and er_c.get("bold") is False and er_c.get("stitch") == 21.0, er_c)

print("PROBE_FAILS " + json.dumps(fails))
`;

function main() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e136-"));
  const pyFile = path.join(probeDir, "probe.py");
  const pyFull = `import json, os, sys
ROOT = ${JSON.stringify(ROOT)}
${PROBE}`;
  fs.writeFileSync(pyFile, pyFull);
  const r = spawnSync(BLENDER, ["-b", "--factory-startup", "-P", pyFile, "--"], {
    cwd: ROOT, encoding: "utf8", timeout: 900_000,
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  for (const line of out.split("\n")) {
    if (line.startsWith("PASS ") || line.startsWith("FAIL ")) console.log(line);
  }
  const mm = out.match(/PROBE_FAILS (.*)/);
  if (!mm) {
    expect("the Blender probe ran", false, out.slice(-600));
  } else {
    const inner = JSON.parse(mm[1]);
    expect("the Blender probe's own canon holds", inner.length === 0, inner);
  }
  fs.rmSync(probeDir, { recursive: true, force: true });
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
