// E2E ITERATION 135 - THE TRIM WEAVE'S OWN SCOPE (TOON_LAW_VERSION 130 -> 131).
// The 134 night's named ceiling, answered by the eye before the pen:
//   1. THE JUDGE NAMED THE TRIM at the framings where the trim owns
//      texels: 'a flat teal shape without gold embroidery' (S003, the
//      closeup - wardrobe 20) and S002's wardrobe 40 at the waist-up
//      MEDIUM. The 128 embroidery rung wrote the weave INSIDE the
//      painterly block, so the trim read FLAT PAINT at exactly those
//      framings (the weave rode the brush's wide-end table only).
//   2. THE LAW (toon_pass): the weave owns its own scope table
//      (TRIM_WEAVE_BY_SHOT: MEDIUM/MCU/CLOSEUP/ECU) and rides WITHOUT
//      the brush at the weave-only framings (painterly stays 0 - the
//      126/127 brush scope stands byte-exact; the hair's true dark
//      keys on painterly and never sees this table; the 121 hard band
//      edges stand - the weave rides inside the band emissions only).
//      The evidence names its own scope: 'the trim weave's own rung
//      (135)' vs 'the wide-end brush scope (128)'.
//   3. THE PROBE'S OWN CATCH - THE TAG'S SIDE DOORS: the probe's A2
//      ground went warm and the mound's contrast collapsed into the
//      sky (sky byte-identical [95,105,123] across A1/A2/B1 - no
//      light-state artifact). The node check convicted SetMat holding
//      EmbroideryRamp while UNTAGGED: the 114 loop tagged the
//      designed-DNA build only - the legacy plate (env-less payloads)
//      and the library env asset staged world materials OUTSIDE it,
//      and the 135 scope widened the weave's reach to every canon
//      framing. THE FIX: one staging sweep at the END of the set
//      block in worker_run (props and cast build after - their mats
//      stay figure-owned), idempotent under the designed build's own
//      tag. The re-run acquits: weave holders exactly the figure's
//      cloth (AccentMat/RobeMat/BootsMat).
//   4. THE EYE-READ RECEIPT (probe135, 5/5 cuts, real renders): the
//      A2 zoom's gold X-sash READS as woven (the stitch wave's chalky
//      thread tone, bounded column variation); collar sat 0.455 ->
//      0.223 at MEDIUM (thread mixed into the dye); B1 (weave + 960
//      texel route) reads [99,115,106] vs A2's [100,115,107] - the
//      weave, not the texel budget, moves the trim read; the 960
//      route stays on the shelf. C2's closeup holds the 121 bands.
// Run: npx tsx scripts/e2e-iter135-trimscope.ts
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
expect("the toon law holds the 132 (advanced legitimately: the trim's own boldness rung)",
  tp.includes("TOON_LAW_VERSION = 132"), "v132");
expect("the weave's scope table names the four trim-texel framings",
  tp.includes('TRIM_WEAVE_BY_SHOT = {"MEDIUM": 1.0, "MCU": 1.0, "CLOSEUP": 1.0, "ECU": 1.0}'), "the table");
expect("the gate refuses every framing outside the table (the wide end rides the brush's own scope)",
  /return TRIM_WEAVE_BY_SHOT\.get\(str\(shot_type or "MEDIUM"\)\.upper\(\), 0\.0\)/.test(tp), "the .get default");
expect("the composition: the weave rides the brush's framings PLUS its own table",
  /weave_on = p_depth > 0 or \(trim_weave_for\(framing_ctx\.get\("shotType"\)\) > 0 if isinstance\(framing_ctx, dict\) else False\)/.test(tp), "weave_on");
expect("the weave block gates on cloth, non-set, and its own flag",
  /if weave and kind == "cloth" and not mat\.get\("animeos_set_surface"\):/.test(tp), "the guard");
expect("the evidence names its own scope (the 135 rung vs the 128 brush scope)",
  tp.includes('"the trim weave\'s own rung (135)"') && tp.includes('("the wide-end brush scope (128)" if p_depth > 0 else'), "the scope pair");
expect("the evidence rides the weave gate (None when the weave is off)",
  /"embroideryRung": \(None if not weave_on else \{"depth": p_depth/.test(tp), "the evidence gate");
expect("the weave-only framings derive the cooled shadow band inline (the brush never ran there)",
  /_emb_shadow = \(rgb\[0\] \* SHADOW_COOL\[0\], rgb\[1\] \* SHADOW_COOL\[1\], rgb\[2\] \* SHADOW_COOL\[2\]\)/.test(tp), "the inline derivation");
expect("the brush's wide-end scope stands byte-exact (the pale bank still keys on painterly)",
  /elif p_depth > 0 and kind == "cloth" and not mat\.get\("animeos_set_surface"\) and _is_pale_cloth\(rgb\):/.test(tp), "the 126/127 scope");
expect("the trim's address counting gates on the weave, not the brush",
  /if weave_on and kind == "cloth" and not mat\.get\("animeos_set_surface"\):/.test(tp), "the counting gate");
const br = read("bridges/blender/animeos_bridge.py");
expect("the presence law holds its 108 rung (no presence change this iteration)",
  br.includes("PRESENCE_LAW_VERSION = 108"), "v108");
expect("the tag's side doors close: the staging sweep runs at the end of the set block",
  br.includes("_tagged_set") && br.includes('state["setSurfaceMats"] = _tagged_set'), "the sweep");
expect("the sweep is the 114 law's own sentence (every material that exists now is set-owned)",
  br.includes("THE SET CARRIES ITS OWN TAG, EVERY STAGING PATH (iteration"), "the sweep's comment");

// ── 2. THE REAL BLENDER PROBE (the node truth on the REAL worker_run,
//       the env-less payload - the exact staging path that leaked) ──
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
ok("the gate rides the four trim-texel framings",
   all(tp.trim_weave_for(s) == 1.0 for s in ("MEDIUM", "MCU", "CLOSEUP", "ECU")))
ok("the gate refuses the wide end and the unknowns (the brush's own scope answers there)",
   tp.trim_weave_for("WIDE") == 0.0 and tp.trim_weave_for("ESTABLISHING") == 0.0 and tp.trim_weave_for("FOO") == 0.0)
ok("the gate defaults MEDIUM (the codebase's standing rung convention)",
   tp.trim_weave_for(None) == 1.0)

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
    out_dir = tempfile.mkdtemp(prefix="e135-")
    job = os.path.join(out_dir, "job.json")
    shot = {"number": 2, "description": "Lin Yue enters the temple, robes whipping in the wind, rain trailing off his shoulders",
            "shotType": shot_type, "lens": lens, "movement": "TRACKING",
            "lighting": "Backlight + interior shadows", "duration": 0.8,
            "cast": [LIN]}
    payload = {"shot": shot,
               "scene": {"number": 1, "title": "e135", "fogDensity": 0.45,
                         "lightningIntensity": 0.3, "energyIntensity": 0.6,
                         "cameraDistance": 1.0, "rimLightIntensity": 0.5},
               "project": {"title": "e135", "visualStyle": "DONGHUA",
                           "resolution": "320x180", "fps": 2},
               "mode": "PREVIEW"}
    json.dump({"jobId": f"e135-{shot_type}", "payload": payload, "outDir": out_dir}, open(job, "w"))
    m.worker_run(job)
    st = json.load(open(job))
    import bpy
    rows = {}
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        names = [n.name for n in mat.node_tree.nodes]
        rows[mat.name] = {"tagged": bool(mat.get("animeos_set_surface")),
                          "weave": "EmbroideryRamp" in names and "EmbroideryMix" in names}
    return st, rows

# ── MEDIUM: the weave's own rung (the env-less payload = the legacy
#    plate - the exact path whose SetMat held weave nodes untagged) ──
st_m, rows_m = build("MEDIUM", "35mm")
look_m = ((st_m.get("render") or {}).get("look") or {})
er = look_m.get("embroideryRung")
ok("the look rides the 132 law", look_m.get("lawVersion") == 132, look_m.get("lawVersion"))
ok("the evidence names the trim weave's own rung (135)",
   isinstance(er, dict) and er.get("scope") == "the trim weave's own rung (135)", er)
ok("the rung's depth is 0 (the brush NEVER rode the MEDIUM - the weave alone)",
   isinstance(er, dict) and er.get("depth") == 0.0, er and er.get("depth"))
ok("the rung names both addresses (the trim and the hem cloth)",
   isinstance(er, dict) and er.get("trims", 0) >= 1 and er.get("hems", 0) >= 1, er)
ok("the painterly rung stays null at MEDIUM (the 126/127 brush scope byte-kept)",
   look_m.get("painterlyRung") is None, look_m.get("painterlyRung"))
hm = look_m.get("hairMass")
ok("the hair's true dark stands (the 129 receipt - stood down at the canon framings)",
   isinstance(hm, dict) and hm.get("lifted") == 0 and hm.get("stoodDown", 0) >= 1, hm)
ok("the staging sweep tagged the legacy plate (the side door closed on its own path)",
   rows_m.get("SetMat", {}).get("tagged") is True, rows_m.get("SetMat"))
ok("the world holds NO weave nodes (the probe's A2 ground convict is acquitted)",
   rows_m.get("SetMat", {}).get("weave") is False, rows_m.get("SetMat"))
ok("the trim weaves (the accent sash carries the stitch wave)",
   rows_m.get("AccentMat", {}).get("weave") is True, rows_m.get("AccentMat"))
ok("the robe cloth weaves inside its hem band (the yuanbian region)",
   rows_m.get("RobeMat", {}).get("weave") is True, rows_m.get("RobeMat"))
ok("the skin never weaves (the face's paleness IS the character)",
   rows_m.get("SkinMat", {}).get("weave") is False, rows_m.get("SkinMat"))
hair_rows = [r for n, r in rows_m.items() if "hair" in n.lower()]
ok("the hair never weaves",
   hair_rows and all(r["weave"] is False for r in hair_rows), hair_rows)
weave_holders = sorted(n for n, r in rows_m.items() if r["weave"])
ok("the weave holders are exactly the figure's cloth (the re-run's acquittal)",
   weave_holders == ["AccentMat", "BootsMat", "RobeMat"], weave_holders)

# ── WIDE: the 128 composition byte-kept (the brush + the weave compose) ──
st_w, rows_w = build("WIDE", "35mm")
look_w = ((st_w.get("render") or {}).get("look") or {})
er_w = look_w.get("embroideryRung")
pw_w = look_w.get("painterlyRung")
ok("the wide end names the brush scope (the 128 composition stands)",
   isinstance(er_w, dict) and er_w.get("scope") == "the wide-end brush scope (128)", er_w)
ok("the wide end's brush rode (the painterly rung present)",
   isinstance(pw_w, dict) and pw_w.get("depth", 0) > 0, pw_w)
ok("the wide end's world is tagged and clean too",
   rows_w.get("SetMat", {}).get("tagged") is True and rows_w.get("SetMat", {}).get("weave") is False, rows_w.get("SetMat"))

print("PROBE_FAILS " + json.dumps(fails))
`;

function main() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e135-"));
  const pyFile = path.join(probeDir, "probe.py");
  const pyFull = `import json, os, sys
ROOT = ${JSON.stringify(ROOT)}
${PROBE}`;
  fs.writeFileSync(pyFile, pyFull);
  const r = spawnSync(BLENDER, ["-b", "--factory-startup", "-P", pyFile, "--"], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000,
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
