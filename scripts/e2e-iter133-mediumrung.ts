// E2E ITERATION 133 - THE MEDIUM'S OWN GRAMMAR (THE MEDIUM DISTANCE
// RUNG). The 132 night's frontier, answered:
//   1. THE FRAMING WALL NAMED BY THE NUMBERS: S002's face cell rode
//      20 TWICE through the moderate stage - 'the MEDIUM wall is the
//      framing's texel budget, not the paint'. The geometry: the
//      presence solve sized the MEDIUM from the WHOLE figure at fill
//      0.74 - the full figure owns 74% of frame height, which is
//      film grammar's FULL SHOT, not the waist-up MEDIUM the sheet
//      comparison assumes.
//   2. THE RUNG (the presence law, PRESENCE_LAW_VERSION 107 -> 108):
//      the MEDIUM solves from the WAIST-UP body (the upper
//      MEDIUM_UPPER_SHARE = 0.42 of the measured figure) - dist ~3.1
//      pulls in to ~1.3 and the head's texels multiply; the aim pins
//      to the chest and lifts MEDIUM_HEADROOM = 0.11 above it so the
//      crown keeps its headroom (the probe's first cut clipped the
//      topknot - the eye caught it before any night could).
//   3. THE PROBE BEFORE THE PEN (scripts/probe-133-medium.py, 6 real
//      cuts): A1 control dist 3.099 head-span 44px vs A2 waist-up
//      dist 1.302 head-span 61px and the face reads DRAWN (eyes,
//      brows, crossed collar, gold trim). The wash bisect (S005)
//      took its receipts for the next rung: the framing wash table
//      was INERT on the probe's mats (nodes 0), the comp graph owns
//      a real mute (comp-off swung the crops hard), the keep bank
//      (1.60) moved the torso +0.02 - the robe's chroma under the
//      wide-end grades keeps its own iteration, honestly recorded.
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter133-mediumrung.ts
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
const br = read("bridges/blender/animeos_bridge.py");
expect("the presence law advances to 108 (the MEDIUM's own grammar)",
  br.includes("PRESENCE_LAW_VERSION = 108"), "v108");
expect("the waist-up share rides (the upper body solves the MEDIUM)",
  br.includes("MEDIUM_UPPER_SHARE = 0.42"), "0.42");
expect("the headroom rides (the crown keeps its frame)",
  br.includes("MEDIUM_HEADROOM = 0.11"), "0.11");
expect("the solve cuts the MEDIUM down to the waist-up body (the pair never)",
  /medium = \(st == "MEDIUM"\) and not pair\n            if medium:\n                size \*= MEDIUM_UPPER_SHARE/.test(br), "the solve");
expect("the MEDIUM aim pins to the chest (the dist seam never flips it)",
  /if medium:\n                    aim = "chest"\n                    _aim_z = float\(subject\.get\("chest"\) or subject\["h"\] \* 0\.62\) \+ float\(subject\["h"\]\) \* MEDIUM_HEADROOM/.test(br), "the aim pin");
expect("the aim lifts the headroom above the chest (the lens rides it)",
  /elif medium:\n                    h = _aim_z/.test(br), "the lens height");
expect("the rung names itself in the framing (the evidence's source)",
  br.includes('self.rung = "the waist-up MEDIUM (the 133 rung: the upper body solves, the crown keeps its headroom)"'), "the rung line");
expect("the presence evidence reads the framing's own aim (no duplicate derivation)",
  /"aim": fr0\.aim,/.test(br) && /"rung": fr0\.rung,/.test(br), "the evidence");
const tp = read("bridges/blender/toon_pass.py");
expect("the toon pass holds its 132 version (no bridge change on the look side)",
  tp.includes("TOON_LAW_VERSION = 130"), "v130");
const ac = read("bridges/blender/anime_character.py");
expect("the builder's law version rides untouched",
  ac.includes("ANIME_LAW_VERSION = 125"), "v124");

// ── 2. THE REAL BLENDER PROBE (the framing law under the real bpy) ──
const PROBE = `
import importlib.util, json, math, os, sys
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(BRIDGE))
import anime_character as ac
import bpy, mathutils

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# a REAL figure build: the honest measured box rides every solve
prof = m.material_profile({})
scn = bpy.context.scene
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
fig_mats = {
    "robe": m.principled_mat(bpy, "E133Robe", "#1f5c5c", 0.7),
    "accent": m.principled_mat(bpy, "E133Accent", "#c4b454", 0.7),
    "skin": m.principled_mat(bpy, "E133Skin", "#e8d5c4", 0.6),
    "hair": m.principled_mat(bpy, "E133Hair", "#1a1a1a", 0.5),
    "blade": m.emission_mat(bpy, "E133Blade", "#5eead4", 6.0),
    "boots": m.principled_mat(bpy, "E133Boots", "#241a12", 0.8),
}
fig = ac.build_anime_character(bpy, scn, {"name": "E133 Probe", "hairStyle": "topknot", "hairColor": "#1a1a1a",
                                          "robeColor": "#1f5c5c", "robeAccent": "#c4b454", "skinTone": "#e8d5c4",
                                          "weaponType": "sword", "bladeColor": "#5eead4"}, fig_mats, br=m._grip_law())
bpy.context.view_layer.update()
root = fig.get("root")
subj = m.measure_subject(root)
ok("the measured box is honest (a real figure: h, headH, chest, face)",
   subj is not None and subj.get("h", 0) > 0.5 and subj.get("headH", 0) > 0.05
   and subj.get("chest", 0) > 0.3 and subj.get("face", 0) > subj.get("chest", 0), subj)

SHOT = {"shotType": "MEDIUM", "lens": "35mm", "cast": ["Lin Yue"]}
SCENE = {"cameraDistance": 1.0}

# THE RUNG: the MEDIUM solves the WAIST-UP body
fr = m._Framing(SHOT, SCENE, dict(subj))
tan_half = 10.125 / 50.0
want = (subj["h"] * m.MEDIUM_UPPER_SHARE) / (m.SUBJECT_FILL["MEDIUM"] * 2.0 * tan_half)
ok("the MEDIUM solves the waist-up body (dist rides the upper share)",
   abs(fr.dist - want) < 1e-6, (fr.dist, want))
ok("the rung pulls in (the old full-figure solve was ~3.1; the rung lands ~1.3)",
   1.0 < fr.dist < 1.6, fr.dist)
ok("the aim pins to the chest (the dist seam never flips it)",
   fr.aim == "chest", fr.aim)
ok("the aim lifts the headroom above the chest",
   abs(fr.target[2] - (subj["chest"] + subj["h"] * m.MEDIUM_HEADROOM)) < 1e-6,
   (fr.target[2], subj["chest"] + subj["h"] * m.MEDIUM_HEADROOM))
ok("the rung names itself (the evidence's source)",
   isinstance(fr.rung, str) and "waist-up MEDIUM" in fr.rung and "133" in fr.rung, fr.rung)
# THE HEADROOM LAW: the crown stays inside the frame
frame_h = (subj["h"] * m.MEDIUM_UPPER_SHARE) / m.SUBJECT_FILL["MEDIUM"]
ok("the crown keeps its headroom (frame top clears the measured box)",
   fr.target[2] + frame_h / 2.0 >= subj["h"] - 1e-6,
   (fr.target[2] + frame_h / 2.0, subj["h"]))
ok("the waist rides in frame (the frame bottom sits below the chest)",
   fr.target[2] - frame_h / 2.0 < subj["chest"], (fr.target[2] - frame_h / 2.0, subj["chest"]))

# THE PROBE'S OWN RECEIPT: the S002-shaped subject lands the probe's A2 solve (the fresh build's box measures within a hair of the probe's)
s002 = dict(subj)
fr_probe = m._Framing(SHOT, SCENE, s002)
ok("the probe's A2 receipt reproduces (dist ~1.302 at the honest box)",
   abs(fr_probe.dist - 1.302) < 0.005, round(fr_probe.dist, 3))

# THE OTHER FRAMINGS KEEP THE 107 LAW (the rung is the MEDIUM's alone)
wide = m._Framing({"shotType": "WIDE", "lens": "35mm", "cast": ["Lin Yue"]}, SCENE, dict(subj))
want_wide = subj["h"] / (m.SUBJECT_FILL["WIDE"] * 2.0 * (10.125 / 35.0))  # the TABLE's own glass: WIDE rides 35mm
ok("the WIDE keeps the full-figure solve (no rung, no cut-down)",
   abs(wide.dist - want_wide) < 1e-6 and wide.rung is None, (wide.dist, want_wide, wide.rung))
lo = m._Framing({"shotType": "LOW_ANGLE", "lens": "50mm", "cast": ["Lin Yue"]}, SCENE, dict(subj))
want_lo = subj["h"] / (m.SUBJECT_FILL["LOW_ANGLE"] * 2.0 * (10.125 / 35.0))  # the TABLE's own glass: LOW_ANGLE rides 35mm
ok("the LOW_ANGLE keeps the full-figure solve",
   abs(lo.dist - want_lo) < 1e-6 and lo.rung is None, (lo.dist, want_lo))
cu = m._Framing({"shotType": "CLOSEUP", "lens": "85mm", "cast": ["Lin Yue"]}, SCENE, dict(subj))
want_cu = subj["headH"] / (m.SUBJECT_FILL["CLOSEUP"] * 2.0 * (10.125 / 85.0))
ok("the CLOSEUP keeps the HEAD solve and the face aim (the 113 law stands)",
   abs(cu.dist - want_cu) < 1e-6 and cu.aim == "face" and cu.rung is None,
   (cu.dist, want_cu, cu.aim))

# THE PAIR MEDIUM KEEPS THE PAIR SOLVE (the two-shot's subject is the PAIR)
pair_subj = dict(subj)
pair_subj["pair"] = True
pair_subj["spanX"] = 1.4
pair_subj["cx"] = 0.2
fr_pair = m._Framing(SHOT, SCENE, pair_subj)
ok("the pair MEDIUM never cuts down (the full-h solve rides the union box)",
   fr_pair.dist > 3.0 and fr_pair.rung is None, (fr_pair.dist, fr_pair.rung))

# THE SIGHTLINE CONSISTENCY: the walk's internal framing rides the SAME law
sl = m.solve_sightline(scn, bpy, SHOT, SCENE, dict(subj))
fr_after = m._Framing(SHOT, SCENE, dict(subj, h=round(subj["h"] * sl["scale"], 4)))
ok("the sightline's internal solve lands the rung too (one law, both consumers)",
   abs(sl["dist"] - fr_after.dist) < 0.02, (sl["dist"], round(fr_after.dist, 3)))

# DETERMINISM: the same subject twice lands the byte-equal solve
fr_again = m._Framing(SHOT, SCENE, dict(subj))
ok("the rung is deterministic",
   fr_again.dist == fr.dist and fr_again.target == fr.target and fr_again.rung == fr.rung, "byte-equal")

print("PROBE_FAILS " + json.dumps(fails))
`;

function main() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e133-"));
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
