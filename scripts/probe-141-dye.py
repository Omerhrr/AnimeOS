#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 141) - the 140 night's two named
cells bisected on the REAL pipeline:

  CELL 1 - THE TEAL-VS-BLACK DYE CELL (named every night: 'hair is
  teal instead of black'). The dye chain measured CLEAN on the drain's
  own assembly (probe-141-cast.ts): the riding hairColor is #1a1a1a
  (near-black, 'already true to the sheet' - the sheet DNA's own read,
  no teal anywhere in the dye). So the teal enters DOWNSTREAM - the
  look pass or the frame's own lifts. The 129 notes named the
  compound: the DoF's sky mix, the mist layer's pull, the glint's
  additive floor. The bisect ladder (each cut ONE delta, everything
  else byte-exact):

    a1-stand    the control (the teal present - the reproduction)
    b1-nofog    scene.fogDensity 0.45 -> 0.0   (the mist pull bisected)
    b2-nowash   PALETTE_WASH_BY_SHOT['CLOSEUP'] -> 0.0 (the sheet wash bisected)
    b3-nolift   HAIR_MASS_LIFT 3.6 -> 1.0      (the mass lift bisected; the
                state's own hairMass.rung names whether it even rides here)
    b4-black    hairColor -> #000000           (the dye's own contribution)
    e1-skinfloor SKIN_FLOOR 0.55 -> 0.62       (CELL 2: the forehead
                ellipse - if the pale oval IS the skin's lit-band edge,
                moving the floor moves the boundary and the eye sees it)

    s5-stand    S005 (LOW_ANGLE, the azure-blade framing) control - the
                teal's travel check across framings

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-141-dye.py
(the detached supervisor law: every cut that finishes lands in
probe141-results.json and a restart resumes from there)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe141-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe141")
RESULTS = os.path.join(ROOT, "probe141-results.json")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

_payload = json.load(open(CAST))
S003 = dict(_payload["S003"])
S005 = dict(_payload["S005"])
SCENE = dict(_payload["scene"])
# the probe's own scene number keeps the probe's identity honest
SCENE["number"] = 1
SCENE["title"] = "probe141"

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

# THE PROBE'S OWN LOOK PATCHES (named honestly): the job file carries
# probe141-look.json beside it when the cut patches the look; the
# patch precedes worker_run and the state's look evidence is the
# witness that the patched values rode.
look = os.path.join(os.path.dirname(job), "probe141-look.json")
patch_note = None
if os.path.exists(look):
    p = json.load(open(look))
    patch_note = p
    if "wash" in p:
        tp.PALETTE_WASH_BY_SHOT = dict(tp.PALETTE_WASH_BY_SHOT)
        tp.PALETTE_WASH_BY_SHOT["CLOSEUP"] = float(p["wash"])
    if "mass_lift" in p:
        tp.HAIR_MASS_LIFT = float(p["mass_lift"])
    if "skin_floor" in p:
        tp.SKIN_FLOOR = float(p["skin_floor"])

m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
look_ev = ev.get("look") or {}
presence = ev.get("presence") or {}
run_ev = {
    "resX": look_ev.get("resX"),
    "presence": {k: presence.get(k) for k in ("lawVersion", "subjectH", "headH", "fill", "dist", "lens", "aimZ", "rung") if k in presence},
    "lookKeys": sorted(look_ev.keys())[:24],
    "hairMass": look_ev.get("hairMass"),
    "probeLookPatch": patch_note,
}
json.dump(run_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def patch_shot(shot, hair_hex=None, fog=None):
    """Deep-copy the shot; the patch is the cut's only delta."""
    s = json.loads(json.dumps(shot))
    if hair_hex and s.get("cast"):
        s["cast"][0]["hairColor"] = hair_hex
    return s


def run_cut(tag, shot, hair_hex=None, fog=None, look_patch=None):
    out_dir = tempfile.mkdtemp(prefix=f"p141-{tag}-")
    job = os.path.join(out_dir, "job.json")
    scene = dict(SCENE)
    if fog is not None:
        scene["fogDensity"] = fog
    payload = {
        "shot": patch_shot(shot, hair_hex),
        "scene": scene,
        "project": {"title": "probe141", "visualStyle": "DONGHUA",
                    "resolution": "1920x1080", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe141-{tag}", "payload": payload, "outDir": out_dir}, fh)
    if look_patch:
        with open(os.path.join(out_dir, "probe141-look.json"), "w") as fh:
            json.dump(look_patch, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag}] clip={ok} -> {mp4}", flush=True)
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
    meter = hair_meter(mid)
    print(f"    frame -> {mid}  hairMeter: {meter}  state: {json.dumps(state)[:300]}", flush=True)
    return {"state": state, "frame": mid, "outDir": out_dir, "hairMeter": meter}


def hair_meter(png):
    """THE DYE METER: the frame's darkest-quartile mean RGB inside the
    upper hair band (the topknot region at the closeup solve) - a
    near-black read sits at (10-40); teal leans G and B over R."""
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        # the hair band: the upper-middle third of the frame
        box = (int(w * 0.30), int(h * 0.04), int(w * 0.70), int(h * 0.38))
        px = list(im.crop(box).getdata())
        px.sort(key=lambda p: p[0] + p[1] + p[2])
        dark = px[: max(1, len(px) // 4)]
        n = len(dark)
        r = sum(p[0] for p in dark) / n
        g = sum(p[1] for p in dark) / n
        b = sum(p[2] for p in dark) / n
        lean = "TEAL" if (g > r * 1.35 and b > r * 1.35) else ("cool" if b > r * 1.25 else "neutral")
        return {"rgb": [round(r, 1), round(g, 1), round(b, 1)], "lean": lean}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


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

    s3_series = [
        ("a1-stand", {}),
        ("b1-nofog", {"fog": 0.0}),
        ("b2-nowash", {"look": {"wash": 0.0}}),
        ("b3-nolift", {"look": {"mass_lift": 1.0}}),
        ("b4-black", {"hair": "#000000"}),
        ("e1-skinfloor", {"look": {"skin_floor": 0.62}}),
    ]
    s5_series = [("s5-stand", {})]
    plan = ([("S003", S003, t) for t in s3_series]
            + [("S005", S005, t) for t in s5_series])
    for shot_key, shot, (tag, delta) in plan:
        key = f"{shot_key}:{tag}"
        if key in res:
            print(f"[{key}] already done - resume skips", flush=True)
            continue
        r = run_cut(tag, shot,
                    hair_hex=delta.get("hair"),
                    fog=delta.get("fog"),
                    look_patch=delta.get("look"))
        if r is None:
            print(f"[{key}] FAILED - stopping (the supervisor restarts)", flush=True)
            save_results(res)
            sys.exit(1)
        res[key] = r
        save_results(res)
    print("PROBE141 COMPLETE - the bisect ladder stands", flush=True)


if __name__ == "__main__":
    main()
