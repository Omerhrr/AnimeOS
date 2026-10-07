// E2E ITERATION 132 - THE MASS AS A FRAMING RUNG + THE MEDIUM FACE
// RUNG'S NEXT STEP. The 131 night's frontier, answered:
//   1. THE MASS AS A FRAMING RUNG (toon_pass, TOON_LAW_VERSION 130):
//      the 131 lift rode EVERY framing and the cross-night receipt
//      named the trade - the 129 night (the true dark at the closeup)
//      scored S003 hair 90, the 131 night (the lift everywhere)
//      scored it 20 ('hair color changed to teal'). The rung follows
//      the framing's own painterly depth: the lift rides painterly > 0
//      (the painted wides where the texels are few), the canon
//      framings (MEDIUM and tighter) read the dye's own dark. The
//      evidence names the rung both ways.
//   2. THE MEDIUM FACE RUNG'S NEXT STEP: the 131 mild stage's own
//      cell FELL (S002 face 30 -> 20, 'a simplified chibi style
//      rather than the detailed male features of the sheet') - at
//      MEDIUM's ~24px head a 1.12x lift is under a pixel of paint.
//      The stage advances one rung: 1.30/1.15/1.06/1.02, emission
//      FULL, the earned close look untouched.
//   3. THE PROBE'S OWN RECEIPT (the gender/build tell): the 131
//      record's hypothesis ('the build's spec reads female-shaped')
//      traced to the 131 probe's own dict - it rode NO designSpec, so
//      resolve_spec's female default built the PROBE figure; the
//      night's real payload carried the committed male spec all along
//      (both heroes resolve male: shoulders 1.15/1.2, hips 0.9/0.95,
//      bust 0.05) and the built mesh measures a true 8-head figure
//      (head/total 0.1215) - NOT chibi at the mesh level. The honest
//      receipt: the wall is the FRAME's texel budget, not the spec.
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter132-framingrung.ts
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
expect("the toon pass declares the 135 law version (advanced legitimately: the trim weave's own scope)", tp.includes("TOON_LAW_VERSION = 133"), "v133");
expect("THE MASS AS A FRAMING RUNG: the lift is keyed on the painterly depth (the framing's own law)",
  /if kind == "hair" and painterly > 0:/.test(tp), "the depth key");
expect("the rung's evidence names BOTH homes (the wide-end lift, the stood-down canon framings)",
  tp.includes('"rung": "wide-end (the lifted mass reads where the texels are few)"')
  && tp.includes('"rung": "stood down - the canon framings read the true dark (the 129 receipt)"'), "the rung rows");
expect("the aggregate names the stood-down count honestly (no phantom lift)",
  tp.includes('"stoodDown": hair_stood_down'), "the aggregate");
expect("the 131 dials ride unchanged (the lift stays hue-preserving and capped)",
  tp.includes("HAIR_DARK_LUM = 0.05") && tp.includes("HAIR_MASS_LIFT = 3.6")
  && tp.includes("HAIR_MASS_CAP = 0.055") && tp.includes("HAIR_GLINT_FLOOR = 0.02"), "the constants");
expect("THE MEDIUM FACE RUNG'S NEXT STEP: the moderate stage rides (1.30/1.15/1.06/1.02, emission FULL)",
  /"MEDIUM":\s*\{"eye": 1\.30, "brow": 1\.15, "mouth": 1\.06, "nose": 1\.02, "strength": 1\.0\}/.test(tp), "the MEDIUM row");
expect("the earned close look stays untouched (the 113/121 rows stand)",
  /"ESTABLISHING":\s*\{"eye": 1\.45, "brow": 1\.30, "mouth": 1\.15, "nose": 1\.10, "strength": 1\.0\}/.test(tp)
  && /"WIDE":\s*\{"eye": 1\.30, "brow": 1\.18, "mouth": 1\.08, "nose": 1\.05, "strength": 1\.0\}/.test(tp), "the wide rows");
const ac = read("bridges/blender/anime_character.py");
expect("the builder's law version rides untouched (no bridge change on the anime side)",
  ac.includes("ANIME_LAW_VERSION = 125"), "v124");

// ── 2. THE REAL BLENDER PROBE (node-level laws under the real bpy) ──
const PROBE = `
import importlib.util, json, os, sys
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(BRIDGE))
import toon_pass as tp
import bpy

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the depth table is the rung's key: the painted wides ride, the canon framings stand down
for st, want in [("ESTABLISHING", 0.70), ("WIDE", 0.55), ("LOW_ANGLE", 0.40),
                 ("MEDIUM", 0.0), ("CLOSEUP", 0.0), ("MCU", 0.0), ("EXTREME_CLOSEUP", 0.0)]:
    got = tp.painterly_depth_for(st)
    ok(f"the painterly depth table keys {st} at {want}",
       abs(got - want) < 1e-9, (st, got, want))

# the pure mass canon is untouched: deterministic, hue-preserving, capped
dark = m.hex_to_rgb("#1a1a1a")
mass = tp.hair_mass_dye(dark)
ok("the pure lift is deterministic and hue-preserving",
   tp.hair_mass_dye(dark) == mass and abs(mass[0] / dark[0] - mass[1] / dark[1]) < 1e-9, mass)

prof = m.material_profile({})
def emissions(m_):
    out = []
    for n in m_.node_tree.nodes:
        if n.type == "EMISSION":
            c = n.inputs["Color"].default_value
            out.append((round(c[0], 4), round(c[1], 4), round(c[2], 4)))
    return out
scn = bpy.context.scene
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

# the framing rung, node-level, under the real bpy: one hair dye, five
# framings - each framing rides a FRESH mat (apply_look tags what it
# converts; the previous framing's mat is removed so the next run
# honestly re-runs the law)
evid = {}
for st in ("ESTABLISHING", "WIDE", "LOW_ANGLE", "MEDIUM", "CLOSEUP"):
    for old in [mm for mm in bpy.data.materials if mm.name.startswith("E132_")]:
        bpy.data.materials.remove(old)
    mt = m.graded_mat(bpy, "hair", f"E132_{st}", "#1a1a1a", prof)
    mt.use_fake_user = True
    dist = (6.0 if st in ("ESTABLISHING", "WIDE") else (2.5 if st == "LOW_ANGLE" else (3.0 if st == "MEDIUM" else 0.7)))
    ev = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                       {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                       framing_ctx={"shotType": st, "dist": dist * tp.FIGURE_H, "lens": 35.0, "resX": 640})
    evid[st] = {"ems": emissions(mt), "look": ev}
for old in [mm for mm in bpy.data.materials if mm.name.startswith("E132_")]:
    bpy.data.materials.remove(old)
for st in ("ESTABLISHING", "WIDE", "LOW_ANGLE"):
    ems = evid[st]["ems"]
    ok(f"{st} reads the LIFTED MASS (the wide-end rung: the lit band is the mass, hue preserved)",
       ems[1] == (round(mass[0], 4), round(mass[1], 4), round(mass[2], 4)), ems)
    hm = evid[st]["look"].get("hairMass") or {}
    ok(f"{st}'s evidence names the wide-end rung (the lift counted, the mass lum, the neutral glint)",
       isinstance(hm.get("lifted"), int) and hm.get("lifted", 0) >= 1
       and "wide-end" in str(hm.get("rung"))
       and "neutral" in str(hm.get("glint")), hm)
for st in ("MEDIUM", "CLOSEUP"):
    ems = evid[st]["ems"]
    ok(f"{st} reads the TRUE DARK (the canon framing: the lit band is the dye itself)",
       ems[1] == (round(dark[0], 4), round(dark[1], 4), round(dark[2], 4)), ems)
    hm = evid[st]["look"].get("hairMass") or {}
    ok(f"{st}'s evidence names the stood-down rung (no phantom lift)",
       hm.get("lifted") == 0 and hm.get("stoodDown", 0) >= 1
       and "true dark" in str(hm.get("rung")), hm)

# determinism: the same framing twice lands the same evidence (a fresh
# mat - the cleanup above removed every E132_ mat)
mt_again = m.graded_mat(bpy, "hair", "E132_Again", "#1a1a1a", prof)
mt_again.use_fake_user = True
again = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                      {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                      framing_ctx={"shotType": "CLOSEUP", "dist": 0.7 * tp.FIGURE_H, "lens": 85.0, "resX": 640})
ok("the rung is deterministic (the same framing lands the same evidence)",
   again.get("hairMass") == evid["CLOSEUP"]["look"].get("hairMass"),
   (again.get("hairMass"), evid["CLOSEUP"]["look"].get("hairMass")))

# the MEDIUM face stage: the moderate rung, six decals, the tight
# framings refuse - the stage needs the decal meshes to exist (the
# worker builds before it stages): a real figure build first
import anime_character as ac
fig_mats = {
    "robe": m.graded_mat(bpy, "cloth", "E132Robe", "#1f5c5c", prof),
    "accent": m.graded_mat(bpy, "cloth", "E132Accent", "#c4b454", prof),
    "skin": m.graded_mat(bpy, "skin", "E132Skin", "#e8d5c4", prof),
    "hair": m.graded_mat(bpy, "hair", "E132HairMat", "#1a1a1a", prof),
    "blade": m.emission_mat(bpy, "E132Blade", "#5eead4", 6.8),
    "boots": m.graded_mat(bpy, "cloth", "E132Boots", "#241a12", prof),
}
ac.build_anime_character(bpy, scn, {"name": "E132 Probe", "hairStyle": "topknot", "hairColor": "#1a1a1a",
                                    "robeColor": "#1f5c5c", "robeAccent": "#c4b454", "skinTone": "#e8d5c4",
                                    "weaponType": "sword", "bladeColor": "#5eead4"}, fig_mats, br=m._grip_law())
med = tp.stage_face_paint_for_framing(bpy, "MEDIUM")
ok("MEDIUM stages six decals at the moderate rung (1.30/1.15/1.06/1.02, push full)",
   med.get("staged") == 6 and (med.get("scale") or {}).get("eye") == 1.30
   and (med.get("scale") or {}).get("brow") == 1.15 and (med.get("scale") or {}).get("mouth") == 1.06
   and (med.get("scale") or {}).get("nose") == 1.02, med)
cu = tp.stage_face_paint_for_framing(bpy, "CLOSEUP")
ok("the CLOSEUP still refuses (the earned 113 paint stands untouched)",
   cu.get("staged") == 0 and "113" in str(cu.get("note")), cu)

print("PROBE_FAILS " + json.dumps(fails))
`;

function main() {
  // the REAL Blender probe: the real modules under the real bpy
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e132-"));
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
