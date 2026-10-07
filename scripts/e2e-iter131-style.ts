// E2E iteration 131 - THE MANNEQUIN FACE/STYLE ROUTE. The 130 night's
// distribution hit its ceiling on the face/style cells ('a simplified
// chibi-style drift' S002 face 30, 'the face and hair lack the sharp
// details' S004, 'a simplified low-poly 3D style' S005 style 20) plus
// the named closeup hair probe (S003 hair 60 - the 129 notes read the
// near-black mass as 'teal instead of black'). The probe BEFORE the pen
// (probe-131-style.py) rendered the standing frames and the eye read
// them: the hanging hair strands are rigid wires, the closeup hair dome
// reads indigo (the near-black dye's bands are SO dark that the frame's
// own compound lifts - the DoF sky mix, the mist pull, the glint's blue-
// leaning additive floor - dominate the read), the world's flats are
// naked (the 126 brush's Generated coords lay one patch across a whole
// ground plane), and MEDIUM renders a ~35px head while the staging
// refuses it as 'tight'. The four laws, all framing- or dye-honest:
//   1. THE DARK MASS READS (toon_pass): a near-black hair dye derives
//      its bands from a lifted MASS dye (hue preserved, capped under
//      the glint); the glint derives from the mass with a NEUTRAL
//      additive floor (the 115 floor's blue lean dies on darks).
//   2. THE STRAND FALLS (anime_character): hanging strands bow with a
//      deterministic S-sway (phase per strand), tips taper sharp, and
//      the side locks split TWO per side - the hairline reads strands,
//      not rods. The spring names ride unchanged.
//   3. THE SET'S OWN BRUSH (toon_pass): tagged set surfaces brush on
//      WORLD coordinates (Geometry.Position - scale-true, crawl-free
//      on the static world) at PAINTERLY_SET_SCALE with a gentler
//      PAINTERLY_SET_GAIN swing; the figure keeps the 126 law.
//   4. THE MEDIUM FACE RUNG (toon_pass): the staging table follows the
//      DISTANCE, not the label - a mild MEDIUM stage (six decals at
//      1.12/1.06/1.03/1.00, emission 0.95); the tight framings refuse
//      exactly as 113/121 left them.
// Probes import the REAL modules in a REAL headless Blender (the laws
// are node-level) and the pure functions in tsx.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
function expect(name: string, cond: boolean, detail: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!cond) failures++;
}

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BLENDER = process.env.ANIMEOS_BLENDER_BIN || "/home/z/blender-5.2.2-linux-x64/blender";

// ── 1. THE SOURCE LAWS ──
const tp = read("bridges/blender/toon_pass.py");
expect("the toon pass declares the current law version (advanced legitimately to 133)", tp.includes("TOON_LAW_VERSION = 133"), "v133");
expect("THE DARK MASS READS: the dials live (dark wall, bounded lift, neutral glint floor)",
  tp.includes("HAIR_DARK_LUM = 0.05") && tp.includes("HAIR_MASS_LIFT = 3.6")
  && tp.includes("HAIR_MASS_CAP = 0.055") && tp.includes("HAIR_GLINT_FLOOR = 0.02")
  && tp.includes("HAIR_GLINT_GAIN = 1.45"), "the constants");
expect("the mass lift is HUE-PRESERVING (one factor scales every channel; the cap bounds it)",
  /k = min\(HAIR_MASS_LIFT, HAIR_MASS_CAP \/ max\(max\(rgb\[:3\]\), 1e-4\)\)/.test(tp)
  && /return tuple\(min\(HAIR_MASS_CAP, c \* k\) for c in rgb\[:3\]\)/.test(tp), "hair_mass_dye");
expect("the glint derives from the MASS with a neutral additive floor",
  tp.includes("def hair_glint_from_mass") && /c \* HAIR_GLINT_GAIN \+ HAIR_GLINT_FLOOR/.test(tp), "hair_glint_from_mass");
expect("the mass rides only under the dark wall (the earned mid-tones stay byte-exact)",
  /if lum >= HAIR_DARK_LUM:\s*\n\s*return tuple\(rgb\[:3\]\)/.test(tp), "the dark wall");
expect("THE SET'S OWN BRUSH: the dials live (world scale, gentler gain)",
  tp.includes("PAINTERLY_SET_SCALE = 2.2") && tp.includes("PAINTERLY_SET_GAIN = 0.6"), "the set dials");
expect("the set brush reads WORLD coordinates (Geometry.Position - the TexCoord node carries none on 4.x/5.x)",
  tp.includes("ShaderNodeNewGeometry") && tp.includes('geo.outputs["Position"]')
  && !tp.includes('ptc.outputs["Position"]'), "the world coords");
expect("the set's swing scales by the gain and the evidence names it",
  /swing = swing \* PAINTERLY_SET_GAIN/.test(tp) && tp.includes('"setSwing"'), "the set swing");
expect("THE MASS AS A FRAMING RUNG: the lift rides the painterly depth (the canon framings read the true dark)",
  /if kind == "hair" and painterly > 0:/.test(tp)
  && tp.includes('"rung": "stood down - the canon framings read the true dark (the 129 receipt)"')
  && tp.includes('"rung": "wide-end (the lifted mass reads where the texels are few)"'), "the mass rung");
expect("THE MEDIUM FACE RUNG'S NEXT STEP: the moderate stage rides (the 121 craft move at MEDIUM's own scale)",
  /"MEDIUM":\s*\{"eye": 1\.30, "brow": 1\.15, "mouth": 1\.06, "nose": 1\.02, "strength": 1\.0\}/.test(tp), "the MEDIUM row");
const ac = read("bridges/blender/anime_character.py");
expect("the builder declares the 131 law version", ac.includes("ANIME_LAW_VERSION = 125"), "v124");
expect("THE STRAND FALLS: the sway, the taper and the phase live",
  ac.includes("STRAND_SWAY_AMP = 0.011") && ac.includes("STRAND_TIP_TAPER = 0.32")
  && ac.includes("def strand_fall"), "the strand law");
expect("the side locks split TWO per side with air between (the hairline reads strands)",
  /for k in range\(2\):\s*\n\s*y_off = -0\.004 - 0\.006 \* k/.test(ac)
  && ac.includes('clump(f"SideLock{nm}{k}"'), "the split locks");
expect("the spring names ride unchanged (the solver sways the tip, the fall is the rest shape)",
  ac.includes('clump(f"HairTail{k}", spine'), "HairTail springs");
expect("the strand evidence rides the anime state", ac.includes('"hairStrandSway"'), "the evidence");

// ── 2. THE REAL BLENDER PROBE (node-level laws under the real bpy) ──
const PROBE = `
import importlib.util, json, os, sys
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(BRIDGE))
import toon_pass as tp
import anime_character as ac
import bpy

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# the canon: the mass lift is hue-preserving and capped
dark = m.hex_to_rgb("#1a1a1a")
mass = tp.hair_mass_dye(dark)
k = round(mass[0] / dark[0], 6)
ok("the mass lift scales EVERY channel by one factor (hue preserved)",
   abs(k - mass[1] / dark[1]) < 1e-6 and abs(k - mass[2] / dark[2]) < 1e-6
   and abs(k - tp.HAIR_MASS_LIFT) < 1e-9, (round(k, 4),))
ok("the mass stays under the cap (a dark is a dark)",
   max(mass) <= tp.HAIR_MASS_CAP + 1e-9, (round(max(mass), 4), tp.HAIR_MASS_CAP))
lum = 0.2126 * mass[0] + 0.7152 * mass[1] + 0.0722 * mass[2]
ok("the mass's own luminance is a READABLE dark (past the compound lifts' reach)",
   0.03 <= lum <= 0.05, round(lum, 4))
ok("a dye at the wall returns unchanged (the earned mid-tones stand)",
   tp.hair_mass_dye(m.hex_to_rgb("#6a4a32")) == tuple(m.hex_to_rgb("#6a4a32")), "the mid-tone control")
ok("a violet-tinted near-black keeps its hue (the lift never invents a color)",
   abs((tp.hair_mass_dye(m.hex_to_rgb("#1a1420"))[2] - tp.hair_mass_dye(m.hex_to_rgb("#1a1420"))[0])
       / (m.hex_to_rgb("#1a1420")[2] - m.hex_to_rgb("#1a1420")[0]) - k) < 1e-6, "the hue ratio holds")
glint = tp.hair_glint_from_mass(mass)
ok("the mass glint's additive floor is NEUTRAL (no blue lean on any channel)",
   abs(glint[0] - glint[1]) < 1e-9 and abs(glint[1] - glint[2]) < 1e-9, (tuple(round(v, 4) for v in glint),))
ok("the mass glint is bounded under 1.0", max(glint) <= 1.0 + 1e-9, round(max(glint), 4))
ok("the glint canon is deterministic", tp.hair_glint_from_mass(mass) == tp.hair_glint_from_mass(mass), True)

# the node-level proof: the near-black hair's LIT band reads the mass
prof = m.material_profile({})
mat = m.graded_mat(bpy, "hair", "E131Hair", "#1a1a1a", prof)
mat.use_fake_user = True
scn = bpy.context.scene
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
look = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                     {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                     framing_ctx={"shotType": "CLOSEUP", "dist": 0.7 * tp.FIGURE_H, "lens": 85.0, "resX": 640})
def emissions(m_):
    out = []
    for n in m_.node_tree.nodes:
        if n.type == "EMISSION":
            c = n.inputs["Color"].default_value
            out.append((round(c[0], 4), round(c[1], 4), round(c[2], 4)))
    return out
ems = emissions(mat)
# THE MASS AS A FRAMING RUNG (132): at the canon close look the TRUE
# DARK reads (the 129 receipt - the strongest hair cell on record);
# the lit band is the dye's own color, no lift, the rung named.
ok("the CLOSEUP's near-black reads the TRUE DARK (the lit band is the dye itself, the lift stood down)",
   len(ems) >= 2 and ems[1] == (round(dark[0], 4), round(dark[1], 4), round(dark[2], 4)), (ems, dark))
ok("the look evidence names the stood-down rung (the canon framings read the true dark)",
   (look.get("hairMass") or {}).get("lifted") == 0
   and (look.get("hairMass") or {}).get("stoodDown", 0) >= 1
   and "true dark" in str((look.get("hairMass") or {}).get("rung")), look.get("hairMass"))
# the wide end: the lifted mass reads where the texels are few (the
# 131 canon's new home - the same hue-preserving lift the canon proves)
matw = m.graded_mat(bpy, "hair", "E132HairWide", "#1a1a1a", prof)
matw.use_fake_user = True
lookw132 = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                         {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                         framing_ctx={"shotType": "WIDE", "dist": 6.0 * tp.FIGURE_H, "lens": 35.0, "resX": 640})
ems_w = emissions(matw)
ok("the WIDE's near-black reads the MASS (the lifted bands, hue preserved)",
   len(ems_w) >= 2 and ems_w[1] == (round(mass[0], 4), round(mass[1], 4), round(mass[2], 4)), (ems_w, mass))
ok("the wide evidence names the lift and the wide-end rung",
   (lookw132.get("hairMass") or {}).get("lifted", 0) >= 1
   and abs((lookw132.get("hairMass") or {}).get("lum", 0) - round(lum, 4)) < 5e-4
   and "neutral" in str((lookw132.get("hairMass") or {}).get("glint"))
   and (lookw132.get("hairMass") or {}).get("rung") == "wide-end", lookw132.get("hairMass"))

# the set brush at WIDE: world coords, the set scale, the gentler swing
setm = m.graded_mat(bpy, "cloth", "E131Set", "#3a4a52", prof)
setm["animeos_set_surface"] = True
setm.use_fake_user = True
figm = m.graded_mat(bpy, "cloth", "E131Fig", "#4a8177", prof)
figm.use_fake_user = True
lookw = tp.apply_look(bpy, scn, "TOON", "PREVIEW", m.hex_to_rgb,
                      {"lut": "tribulation", "factors": dict(m.COMP_BASE)},
                      framing_ctx={"shotType": "WIDE", "dist": 6.0 * tp.FIGURE_H, "lens": 35.0, "resX": 640})
def noise_src(mat_):
    for n in mat_.node_tree.nodes:
        if n.name == "PainterlyNoise":
            for l in n.inputs["Vector"].links:
                return l.from_node.type, round(float(n.inputs["Scale"].default_value), 3)
    return None
ok("the set's brush reads NEW_GEOMETRY world position at PAINTERLY_SET_SCALE",
   noise_src(setm) == ("NEW_GEOMETRY", tp.PAINTERLY_SET_SCALE), noise_src(setm))
ok("the figure's brush keeps the 126 Generated coords (byte-exact)",
   noise_src(figm) == ("TEX_COORD", tp.PAINTERLY_NOISE_SCALE), noise_src(figm))
pr = lookw.get("painterlyRung") or {}
ok("the evidence names the set brush and its gentler swing",
   pr.get("setBrush") is True and abs(pr.get("setSwing", 0) - round(tp.painterly_swing_for(0.55) * tp.PAINTERLY_SET_GAIN, 3)) < 1e-6
   and abs(pr.get("swing", 0) - tp.painterly_swing_for(0.55)) < 1e-6, pr)

# THE STRAND FALLS + a real figure build first (the stage needs the
# decal meshes to exist - the worker builds before it stages)
dna = {"name": "E131 Probe", "hairStyle": "topknot", "hairColor": "#1a1a1a",
       "robeColor": "#1f5c5c", "robeAccent": "#c4b454", "skinTone": "#e8d5c4",
       "weaponType": "sword", "bladeColor": "#5eead4"}
hero_mats = {
    "robe": m.graded_mat(bpy, "cloth", "E131Robe", "#1f5c5c", prof),
    "accent": m.graded_mat(bpy, "cloth", "E131Accent", "#c4b454", prof),
    "skin": m.graded_mat(bpy, "skin", "E131Skin", "#e8d5c4", prof),
    "hair": m.graded_mat(bpy, "hair", "E131HairMat", "#1a1a1a", prof),
    "blade": m.emission_mat(bpy, "E131Blade", "#5eead4", 6.8),
    "boots": m.graded_mat(bpy, "cloth", "E131Boots", "#241a12", prof),
}
fig = ac.build_anime_character(bpy, scn, dna, hero_mats, br=m._grip_law())
names = fig["anime"]["hair"]
ok("the split side locks ride the build (two fall strands per side)",
   "SideLockL0" in names and "SideLockL1" in names and "SideLockR0" in names, names)
ok("the strand-sway evidence rides the anime state (the count names the bowed falls)",
   (fig["anime"].get("hairStrandSway") or {}).get("lawVersion") == "strand-fall-v1"
   and (fig["anime"].get("hairStrandSway") or {}).get("strands", 0) >= 6, fig["anime"].get("hairStrandSway"))
ok("the spring names ride unchanged (the solver's contract holds)",
   "HairTail0" in names and "HairTail1" in names and "HairTail2" in names, names)
sway = ac.strand_fall([(0.0, 0.0, 0.3), (0.0, 0.0, 0.1), (0.0, 0.0, -0.1)], 0)
ok("the sway never moves the anchors (root and tip keep their stations)",
   sway[0][0] == 0.0 and sway[0][1] == 0.0 and sway[-1][2] == -0.1, sway)

# the MEDIUM face rung: the staging follows the distance, the tight framings refuse
med = tp.stage_face_paint_for_framing(bpy, "MEDIUM")
ok("MEDIUM stages six decals at the MODERATE rung (1.30/1.15/1.06/1.02, push full - the 132 next step)",
   med.get("staged") == 6 and (med.get("scale") or {}).get("eye") == 1.30
   and (med.get("scale") or {}).get("nose") == 1.02 and "reads" in str(med.get("note")), med)
cu = tp.stage_face_paint_for_framing(bpy, "CLOSEUP")
ok("the CLOSEUP still refuses (the earned 113 paint stands untouched)",
   cu.get("staged") == 0 and "113" in str(cu.get("note")), cu)

print("PROBE_FAILS " + json.dumps(fails))
`;

function main() {
  // the REAL Blender probe: the real modules under the real bpy
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e131-"));
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
