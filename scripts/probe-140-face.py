#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 140) - the 139 night's verdict:
the r3 statement rode (the probe's B4 composition IN PRODUCTION, the
face reads more mature) and the named cell HELD anyway - S004's face
20 for the third night across three different builds. The accusation
is no longer the build's proportions: it is the LOOK's language at
the small figure ('a severe style downgrade to a simple chibi
aesthetic'; S006-Lin: 'a simplified 3D render rather than the 2D
illustration of the sheet'). The proportion lever is SPENT (the
dials sit at their clamp floors). THE 140 FRONTIER, two named cells:

  CELL 1 - THE PAINT RUNG (S004, Wei, WIDE @ 1024): the toon look's
  own statement at the wide-end framings - the 132/136 boldness
  lineage's sibling. The judge's 'simplified 3D render' language
  names the MEDIUM: a 2D illustration carries confident ink and
  flatter, harder bands; the standing WIDE look rides ramp
  (0.50, 0.85, 0.025) + 1.4px PREVIEW ink + the painterly swing.
  The probe's P-cuts monkey-patch the standing toon_pass constants
  IN-PROCESS before worker_run (the render is in-process - the
  patch rides; the look EVIDENCE in the state is the witness).

  CELL 2 - THE S003 FACE-GENDER/AGE CELL (Lin Yue, CLOSEUP @ 640):
  'wrong gender/age features' named twice (138 S002, 139 S003).
  Lin's committed r2 rides ADULT-STERN dials (jawTaper 0.6 angular,
  cheek 0.85, eyes 0.8, tilt -0.2) while the sheet's face reads a
  soft YOUTHFUL bishounen - the gap IS the cell. The probe's F-cuts
  move the spec dials INSIDE the standing clamps (the male law's
  brow floor and lash gate ride untouched - the 134 receipts are
  not put at risk). The mole half is SKIPPED honestly: the fresh
  sheet carries no mole (inventing one would be a lie).

The series (each cut is ONE delta on the drain's OWN assembled
payload - probe140-cast.json, regenerated this iteration through the
REAL lib functions; everything else rides the standing laws
byte-exact: ANIME 125 / TOON 132 / PRESENCE 108, the 138 ladder):

  S003 (Lin, CLOSEUP):      S004 (Wei, WIDE):
    a1-stand                  a1-stand
    f1-jaw   0.72 / 1.0       p1-ramp   WIDE -> (0.42, 0.78, 0.015)
    f2-eye   0.92 / -0.1      p2-ink    PREVIEW 1.4 -> 2.0
    f3-youth f1+f2            p4-statement  p1+p2

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-140-face.py
(the detached supervisor law: every cut that finishes lands in
probe140-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe140-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe140")
RESULTS = os.path.join(ROOT, "probe140-results.json")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

_payload = json.load(open(CAST))
S003 = dict(_payload["S003"])
S004 = dict(_payload["S004"])
SCENE = dict(_payload["scene"])
# the probe's scene number keeps the probe's own identity honest - the
# bridge keys nothing on it, the title marks the probe in the ledger
SCENE["number"] = 1
SCENE["title"] = "probe140"

RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
here = os.path.dirname(os.path.abspath(bridge))
if here not in sys.path:
    sys.path.insert(0, here)
import toon_pass as tp

# THE PROBE'S OWN PAINT PATCHES (named honestly): the job file carries
# probe140-paint.json beside it when the cut is a P-cut; the patch
# precedes worker_run and the look evidence in the state is the
# witness that the patched values rode.
paint = os.path.join(os.path.dirname(job), "probe140-paint.json")
patch_note = None
if os.path.exists(paint):
    p = json.load(open(paint))
    patch_note = p
    if "ramp" in p:
        tp.STYLE_RAMP_BY_SHOT = dict(tp.STYLE_RAMP_BY_SHOT)
        tp.STYLE_RAMP_BY_SHOT["WIDE"] = tuple(p["ramp"])
    if "ink" in p:
        tp.HULL_INK_PX = dict(tp.HULL_INK_PX)
        tp.HULL_INK_PX["PREVIEW"] = float(p["ink"])

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
look = ev.get("look") or {}
presence = ev.get("presence") or {}
rung_ev = {
    "resX": look.get("resX"),
    "presence": {k: presence.get(k) for k in ("lawVersion", "subjectH", "headH", "fill", "dist", "lens", "aimZ", "rung") if k in presence},
    "twoShot": ev.get("twoShot"),
    "figureSource": ev.get("figureSource"),
    "probePaintPatch": patch_note,
    "lookKeys": sorted(look.keys())[:24],
}
json.dump(rung_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def patch_face_dials(shot, dials):
    """Deep-copy the shot and patch the named designSpec dials on the
    SOLO cast member (S003 carries Lin alone). The patch is the cut's
    only delta - the payload rides the drain's own assembly
    byte-exact otherwise. All dials ride INSIDE the standing clamps."""
    s = json.loads(json.dumps(shot))
    if dials and s.get("cast"):
        ds = s["cast"][0].setdefault("designSpec", {})
        if "jaw" in dials:
            ds.setdefault("face", {})["jawTaper"] = dials["jaw"]
        if "cheek" in dials:
            ds.setdefault("face", {})["cheek"] = dials["cheek"]
        if "eye" in dials:
            ds.setdefault("eyes", {})["size"] = dials["eye"]
        if "tilt" in dials:
            ds.setdefault("eyes", {})["tilt"] = dials["tilt"]
    return s


def run_cut(tag, shot, face_dials=None, paint_patch=None):
    out_dir = tempfile.mkdtemp(prefix=f"p140-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": patch_face_dials(shot, face_dials),
        "scene": dict(SCENE),
        "project": {"title": "probe140", "visualStyle": "DONGHUA",
                    "resolution": "1920x1080", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe140-{tag}", "payload": payload, "outDir": out_dir}, fh)
    if paint_patch:
        with open(os.path.join(out_dir, "probe140-paint.json"), "w") as fh:
            json.dump(paint_patch, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag} / face={face_dials} paint={paint_patch}] clip={ok} -> {mp4}", flush=True)
    if not ok:
        print((r.stderr or r.stdout)[-800:], flush=True)
        return None
    pngs = sorted(f for f in os.listdir(out_dir) if f.endswith(".png"))
    mid = os.path.join(OUT, f"{tag}.png")
    if pngs:
        subprocess.run(["cp", os.path.join(out_dir, pngs[len(pngs) // 2]), mid], check=False)
    else:
        subprocess.run(["ffmpeg", "-y", "-i", mp4, "-vf", "select=eq(n\\,2)", "-vframes", "1", mid],
                       capture_output=True, timeout=120)
    state = {}
    sp = os.path.join(out_dir, "cut-state.json")
    if os.path.exists(sp):
        state = json.load(open(sp))
    print(f"    frame -> {mid}  state: {json.dumps(state)[:400]}", flush=True)
    return {"state": state, "frame": mid, "outDir": out_dir}


def zoom(png, name, x0, y0, x1, y1, k):
    """The eye's receipt: k-times zoom of the named box."""
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = (int(w * x0), int(h * y0), int(w * x1), int(h * y1))
        crop = im.crop(box)
        crop = crop.resize((crop.width * k, crop.height * k), Image.LANCZOS)
        out = os.path.join(OUT, name)
        crop.save(out)
        print(f"    zoom -> {out} (box {box}, {k}x)", flush=True)
        return out
    except Exception as exc:  # noqa: BLE001
        print(f"    zoom FAILED {name}: {exc}", flush=True)
        return None


def load_results():
    if os.path.exists(RESULTS):
        try:
            return json.load(open(RESULTS))
        except Exception:
            pass
    return {}


def save_results(res):
    json.dump(res, open(RESULTS, "w"), indent=1, default=str)


def main():
    os.makedirs(OUT, exist_ok=True)
    res = load_results()

    # ── CELL 2 first: the S003 face cuts (the cheap 640 closeups) ──
    s3_series = [
        ("a1-stand", None, None),
        ("f1-jaw", {"jaw": 0.72, "cheek": 1.0}, None),
        ("f2-eye", {"eye": 0.92, "tilt": -0.1}, None),
        ("f3-youth", {"jaw": 0.72, "cheek": 1.0, "eye": 0.92, "tilt": -0.1}, None),
    ]
    # ── CELL 1: the S004 paint cuts (the 1024 wide) ──
    s4_series = [
        ("a1-stand", None, None),
        ("p1-ramp", None, {"ramp": [0.42, 0.78, 0.015]}),
        ("p2-ink", None, {"ink": 2.0}),
        ("p4-statement", None, {"ramp": [0.42, 0.78, 0.015], "ink": 2.0}),
    ]
    plan = ([("S003", S003, t) for t in s3_series]
            + [("S004", S004, t) for t in s4_series])
    for shot_key, shot, (tag, face_dials, paint_patch) in plan:
        if tag in res:
            print(f"[{tag}] already done - resume skips", flush=True)
            continue
        r = run_cut(tag, shot, face_dials, paint_patch)
        if r is None:
            print(f"[{tag}] FAILED - stopping (the supervisor restarts)", flush=True)
            save_results(res)
            sys.exit(1)
        entry = {"state": r["state"], "frame": r["frame"]}
        if shot_key == "S003":
            z = zoom(r["frame"], f"{tag}-face-3x.png", 0.28, 0.08, 0.78, 0.72, 3)
            if z:
                entry["zoom"] = z
        else:
            z = zoom(r["frame"], f"{tag}-fig-2x.png", 0.36, 0.10, 0.68, 0.92, 2)
            if z:
                entry["zoom"] = z
        res[tag] = entry
        save_results(res)
    print(f"PROBE COMPLETE - {len(res)} cuts on the ledger", flush=True)


if __name__ == "__main__":
    main()
