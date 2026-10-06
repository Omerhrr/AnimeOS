// E2E ITERATION 134 - THE DRAWN FACE'S GENDER LAW + THE SIDEBURN TUCK
// (ANIME_LAW_VERSION 124 -> 125). The 133 night's frontier, answered:
//   1. THE GENDER LAW (paint_eye / paint_brow): the judge READ the
//      waist-up face and named its style - 'a feminine anime style
//      with large eyes and a beauty mark not present in the canonical
//      male reference'. The paint now reads the spec's own gender: the
//      MALE eye is a narrower, shorter iris (0.44/0.58 vs the shoujo
//      0.5/0.74), a smaller pupil, ONE small catch-light (the double
//      glint is the feminine tell), and the flick GATES ON LASHES
//      (none under 0.55, full by 0.85); the MALE brow carries a
//      thickness floor 1.55 and an arch cap 0.28. The female draw is
//      byte-kept (the else branches hold the legacy constants).
//   2. THE BEAUTY MARK'S OWNER - THE BISECT OF RECORD (the honest
//      payload, real worker_run cuts, one blob cx 24.7 through it all):
//      C-series (9 cuts) refuted the paint knobs (male-eye, no-flick,
//      clear-locks, male-brow, no-low, decal-lift); D-series (4) the
//      ink hull (ink-off rode it, shells 0; the D/E numeric boxes were
//      640-scale coords on 960 frames - honest receipt, the zooms
//      carried the read; D4 freestyle refused, not a legal mode);
//      E-series (3) the light/tier (key-flip did not swap the cheek,
//      fill-boost did not lift it, the hero carve + bake-down did not
//      move it, the bake cache stands EMPTY); F-series (3) convicted
//      the HAIRCAP: F1 bangs-none rode the mark, F2 CAP-HIDDEN KILLED
//      it (marks 0, framing identical at dist 1.302). The cap's side
//      rim dove past the ear and its terminal ring read as the dash.
//   3. THE SIDEBURN TUCK (build_hair's cap): the deep tail gates on
//      BEHIND-THE-EAR (back = clamp(sin ph + 0.30, 0, 1); the tail
//      blends deep*back + 0.35*(1-back)) - in front of the ear line
//      the rim ends at the temple arc (the cheek keeps its skin, the
//      side locks carry the fall), behind it the nape coverage stands.
//      G1 (the law render, cap STANDING): marks 0 at dist 1.302, the
//      zoom's cheek clean, the temple arc natural; G2 wide: the
//      silhouette sane.
// Run: npx tsx scripts/e2e-iter134-facegender.ts
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
const ac = read("bridges/blender/anime_character.py");
expect("the character law advances to 125 (the drawn face's gender law + the sideburn tuck)",
  ac.includes("ANIME_LAW_VERSION = 125"), "v125");
expect("the eye paint reads the spec's own gender",
  ac.includes('male = str((spec.get("body") or {}).get("gender")) == "male"'), "the gender read");
expect("the male iris is narrower and shorter (0.44 / 0.58)",
  /if male:\n        ir = np\.sqrt\(\(u \/ 0\.44\) \*\* 2 \+ \(\(v \+ 0\.02\) \/ 0\.58\) \*\* 2\)/.test(ac)
  && /else:\n        ir = np\.sqrt\(\(u \/ 0\.5\) \*\* 2 \+ \(\(v \+ 0\.02\) \/ 0\.74\) \*\* 2\)/.test(ac), "the iris pair");
expect("the male pupil rides the same factor (0.18 / 0.30)",
  /if male:\n        pr = np\.sqrt\(\(u \/ 0\.18\) \*\* 2 \+ \(\(v \+ 0\.02\) \/ 0\.30\) \*\* 2\)/.test(ac), "the pupil pair");
expect("the male eye carries ONE small catch-light (the double glint is the feminine tell)",
  /lights = \(\(-0\.15, 0\.28, 0\.09\),\) if male else \(\(-0\.17, 0\.3, 0\.15\), \(0\.16, -0\.3, 0\.07\)\)/.test(ac), "the glints");
expect("the flick gates on lashes for the male spec (none under 0.55, full by 0.85)",
  /fk = max\(0\.0, min\(1\.0, \(float\(spec\["eyes"\]\.get\("lashes", 1\.0\)\) - 0\.55\) \/ 0\.30\)\) if male else 1\.0/.test(ac), "the gate");
expect("the male brow carries the thickness floor and the arch cap",
  /thickness = max\(thickness, 1\.55\)/.test(ac) && /arch = min\(arch, 0\.28\)/.test(ac), "the brow floor/cap");
expect("the sideburn tuck gates the cap's deep tail on behind-the-ear",
  /back = _clamp\(math\.sin\(ph\) \+ 0\.30, 0, 1\)/.test(ac)
  && /th_max = hairline \+ \(1\.0 - front\) \* \(deep \* back \+ 0\.35 \* \(1\.0 - back\)\)/.test(ac), "the tuck");
const tp = read("bridges/blender/toon_pass.py");
expect("the toon pass holds its 132 version (no look-side change this iteration)",
  tp.includes("TOON_LAW_VERSION = 131"), "v131");
const br = read("bridges/blender/animeos_bridge.py");
expect("the presence law holds its 108 rung (the 133 grammar stands)",
  br.includes("PRESENCE_LAW_VERSION = 108"), "v108");

// ── 2. THE REAL BLENDER PROBE (the paint metrics + the cap profile
//       under the real bpy on a real figure build) ──
const PROBE = `
import importlib.util, json, math, os, sys
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(BRIDGE))
import numpy as np
import anime_character as ac
import bpy

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# THE HONEST PAYLOAD (byte-exact with the C/D/E/F/G probes)
LIN_SPEC = {"body": {"gender": "male", "build": "lean", "shoulders": 1.15, "hips": 0.9, "bust": 0.05, "headScale": 0.9},
            "face": {"shape": "angular", "jawTaper": 0.6, "chinFwd": 0.02, "cheek": 0.85},
            "eyes": {"size": 0.8, "tilt": -0.2, "color": "#1a1a2e", "shape": "almond", "lashes": 0.5},
            "brows": {"thickness": 1.25, "arch": 0.4},
            "mouth": {"width": 0.9, "color": "#8b4513"},
            "hair": {"style": "topknot", "length": 0.95, "bangs": "parted", "volume": 1.3, "color": "#1a1a1a"},
            "outfit": {"type": "hanfu", "length": 1.0, "sleeves": "bell", "collar": "crossed", "sash": True}}
sp_m = ac.resolve_spec({"name": "Lin Yue", "designSpec": LIN_SPEC})
sp_f = ac.resolve_spec({"name": "Lin Yue", "designSpec": json.loads(json.dumps({**LIN_SPEC, "body": {**LIN_SPEC["body"], "gender": "female"}}))})
ok("the resolved male spec rides the 125 law and the male gender",
   sp_m["lawVersion"] == 125 and sp_m["body"]["gender"] == "male", (sp_m["lawVersion"], sp_m["body"]["gender"]))

# ── THE PAINT METRICS (pure numpy on the real paint functions) ──
def ink_metrics(img):
    a = img[..., 3]
    rgb = img[..., :3]
    S = a.shape[0]
    def uv(yy, xx):
        return xx / (S - 1) * 2 - 1, 1 - yy / (S - 1) * 2
    # catch-lights: pure-white cores (the sclera is 0.97/0.96/0.95, the
    # glints are (1,1,1)); 4-connected blobs of area >= 4
    white = (rgb.min(axis=2) > 0.995) & (a > 0.5)
    seen = np.zeros_like(white, bool)
    blobs = 0
    H, W = white.shape
    for sy in range(H):
        for sx in range(W):
            if not white[sy, sx] or seen[sy, sx]:
                continue
            stack = [(sy, sx)]; seen[sy, sx] = True; n = 0
            while stack:
                cy, cx = stack.pop(); n += 1
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    ny, nx = cy+dy, cx+dx
                    if 0 <= ny < H and 0 <= nx < W and white[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; stack.append((ny, nx))
            if n >= 4:
                blobs += 1
    # iris dark mass in the central box (the lash/brow/low lines sit
    # outside it)
    yy, xx = np.mgrid[0:S, 0:S]
    u, v = uv(yy, xx)
    box = (np.abs(u) < 0.6) & (v > -0.55) & (v < 0.25)
    dark = (a > 0.5) & (rgb.mean(axis=2) < 0.22) & box
    # the flick window: ink ABOVE the per-column lash band (the lash
    # line itself widens with u - the window clears it); the male gate
    # closed means nothing draws up there
    lashes = 0.5
    top_u = 0.74 - 0.5 * u ** 2 + 0.06 * u
    band_top = top_u + 0.11 * lashes * (1.0 + 0.6 * u) + 0.05
    win = (u > 0.72) & (u <= 1.0) & (v > band_top)
    flick = (a > 0.3) & win
    return blobs, int(dark.sum()), int(flick.sum())

me, md, mf = ink_metrics(ac.paint_eye(sp_m))
fe, fd, ff = ink_metrics(ac.paint_eye(sp_f))
ok("the male eye carries ONE catch-light", me == 1, me)
ok("the female eye keeps BOTH glints (the shoujo draw byte-kept)", fe == 2, fe)
ok("the male iris mass is the smaller dark (0.44/0.58 vs 0.5/0.74)", 0 < md < fd * 0.9, (md, fd))
ok("the male flick draws none at lashes 0.5 (the gate closed)", mf == 0, mf)
ok("the female flick draws (the gate stays open at lashes 1.0)", ff > 0, ff)
ok("the paint is deterministic (byte-equal twice)",
   np.array_equal(ac.paint_eye(sp_m), ac.paint_eye(sp_m)), "byte-equal")

def brow_metrics(img):
    a = img[..., 3]
    S0 = a.shape
    col = int((0.1 + 1) / 2 * (S0[1] - 1))   # the arch center column
    rows = np.where(a[:, col] > 0.3)[0]
    extent = (rows.max() - rows.min() + 1) if len(rows) else 0
    peak = rows.min() if len(rows) else -1    # the topmost ink row
    return extent, peak

bm_ext, bm_peak = brow_metrics(ac.paint_brow(sp_m))
bf_ext, bf_peak = brow_metrics(ac.paint_brow(sp_f))
ok("the male brow band is the thicker ink (the 1.55 floor)", bm_ext > bf_ext, (bm_ext, bf_ext))
ok("the male brow arch rides no higher (the 0.28 cap)", bm_peak >= bf_peak, (bm_peak, bf_peak))

# ── THE CAP PROFILE under the real bpy (the sideburn tuck on a real
#       build of the honest spec) ──
prof = m.material_profile({})
scn = bpy.context.scene
for ob in list(scn.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
fig_mats = {
    "robe": m.principled_mat(bpy, "E134Robe", "#1f5c5c", 0.7),
    "accent": m.principled_mat(bpy, "E134Accent", "#c4b454", 0.7),
    "skin": m.principled_mat(bpy, "E134Skin", "#e8d5c4", 0.6),
    "hair": m.principled_mat(bpy, "E134Hair", "#1a1a1a", 0.5),
    "blade": m.emission_mat(bpy, "E134Blade", "#5eead4", 6.0),
    "boots": m.principled_mat(bpy, "E134Boots", "#241a12", 0.8),
}
fig = ac.build_anime_character(bpy, scn, {"name": "E134 Probe", "hairStyle": "topknot", "hairColor": "#1a1a1a",
                                          "robeColor": "#1f5c5c", "robeAccent": "#c4b454", "skinTone": "#e8d5c4",
                                          "weaponType": "sword", "bladeColor": "#5eead4",
                                          "designSpec": LIN_SPEC}, fig_mats, br=m._grip_law())
cap = bpy.data.objects.get("HairCap")
ok("the real build wears the HairCap", cap is not None)
hs = 0.9  # the honest spec's headScale
rad = (0.133 + 0.006) * hs
thetas, phis = [], []
for vt in cap.data.vertices:
    x, y, z = vt.co
    th = math.acos(max(-1.0, min(1.0, (z - 0.14) / rad)))
    ph = math.atan2(y, x)
    thetas.append(th); phis.append(ph)
thetas = np.array(thetas); phis = np.array(phis)
sinp, cosp = np.sin(phis), np.cos(phis)
sidefront = (sinp < -0.15) & (cosp > 0.30)
markband = np.abs(phis - (-0.63)) < 0.13
nape = sinp > 0.85
deadfront = np.abs(phis - (-math.pi / 2)) < 0.06
ok("the side-front rim ends at the temple arc (the old law dove to 2.05+; the near-silhouette column may reach 1.40 where the rim hides beside the face mass)",
   sidefront.any() and thetas[sidefront].max() <= 1.45, round(float(thetas[sidefront].max()), 3) if sidefront.any() else "empty")
ok("the mark's own azimuth band is clear (the cheek keeps its skin)",
   markband.any() and thetas[markband].max() <= 1.30, round(float(thetas[markband].max()), 3) if markband.any() else "empty")
ok("the nape coverage stands (the back hemisphere keeps the deep tail)",
   nape.any() and thetas[nape].max() >= 2.2, round(float(thetas[nape].max()), 3) if nape.any() else "empty")
ok("the 113 front hairline stands (the brow-line edge is untouched)",
   deadfront.any() and abs(thetas[deadfront].max() - 1.02) <= 0.03,
   round(float(thetas[deadfront].max()), 3) if deadfront.any() else "empty")
ok("the cap grid is the authored 13x36 (the base mesh, un-subdivided)",
   len(cap.data.vertices) == 13 * 36, len(cap.data.vertices))

print("PROBE_FAILS " + json.dumps(fails))
`;

function main() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e134-"));
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
