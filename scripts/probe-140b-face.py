#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN, CONTINUED (iteration 140b) - probe-140's
own receipts redirected the pen:

  1. THE TAG COLLISION (the harness bug, named honestly): both
     series opened with 'a1-stand' and the resume ledger skipped
     S004's standing control. The p-cuts ride the real S004 wide
     payload but lacked their baseline - 140b renders it as
     w1-stand (unique tags this time).
  2. THE YOUTH HYPOTHESIS REJECTED BY THE EYE: the f-cuts moved
     the face SOFTER/YOUNGER and the read held (giant glossy
     eyes, thin floating brows). The 139 cell is not 'too adult' -
     the face-filling closeup reads FEMININE. The male ink must
     read at the closeup: the aperture shrinks to the male floor
     (eyes.size 0.8 -> 0.70) and the brow ink goes heavy
     (thickness -> 2.0, the clamp's own ceiling; the 134 male
     floor law keeps its floor - the spec raises ABOVE it).

The m-cuts (each ONE delta on the drain's OWN assembled S003
payload, inside the standing clamps - the male law untouched):

  m1-eye070   eyes.size 0.8 -> 0.70 (the male floor - the aperture)
  m2-male     eyes.size 0.70 + brows.thickness 2.0 (the male statement)

Run: BLENDER=/home/z/blender-5.2.2-linux-x64/blender \
     python3 scripts/probe-140b-face.py
(the detached supervisor law: probe140b-results.json, resume-safe;
tags are unique per shot - the 140 lesson)
"""
import json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
CAST = os.path.join(ROOT, "probe140-cast.json")
OUT = os.environ.get("PROBE_OUT", "/home/z/my-project/inspect/probe140")
RESULTS = os.path.join(ROOT, "probe140b-results.json")
BLENDER = os.environ.get("BLENDER", "/home/z/blender-5.2.2-linux-x64/blender")

_payload = json.load(open(CAST))
S003 = dict(_payload["S003"])
S004 = dict(_payload["S004"])
SCENE = dict(_payload["scene"])
SCENE["number"] = 1
SCENE["title"] = "probe140b"

RENDER = r'''
import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
presence = ev.get("presence") or {}
rung_ev = {
    "presence": {k: presence.get(k) for k in ("lawVersion", "subjectH", "headH", "fill", "dist", "lens", "aimZ", "rung") if k in presence},
}
json.dump(rung_ev, open(os.path.join(os.path.dirname(job), "cut-state.json"), "w"), indent=1, default=str)
'''


def patch_face_dials(shot, dials):
    s = json.loads(json.dumps(shot))
    if dials and s.get("cast"):
        ds = s["cast"][0].setdefault("designSpec", {})
        if "eye" in dials:
            ds.setdefault("eyes", {})["size"] = dials["eye"]
        if "brow" in dials:
            ds.setdefault("brows", {})["thickness"] = dials["brow"]
    return s


def run_cut(tag, shot, face_dials=None):
    out_dir = tempfile.mkdtemp(prefix=f"p140b-{tag}-")
    job = os.path.join(out_dir, "job.json")
    payload = {
        "shot": patch_face_dials(shot, face_dials),
        "scene": dict(SCENE),
        "project": {"title": "probe140b", "visualStyle": "DONGHUA",
                    "resolution": "1920x1080", "fps": 8},
        "mode": "PREVIEW",
    }
    with open(job, "w") as fh:
        json.dump({"jobId": f"probe140b-{tag}", "payload": payload, "outDir": out_dir}, fh)
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as fh:
        fh.write(RENDER)
        render_py = fh.name
    r = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", render_py, "--", BRIDGE, job],
                       capture_output=True, text=True, timeout=5400)
    st = json.load(open(job))
    mp4 = st.get("mp4Path")
    ok = bool(mp4) and os.path.exists(mp4)
    print(f"[{tag} / dials={face_dials}] clip={ok} -> {mp4}", flush=True)
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
    print(f"    frame -> {mid}  state: {json.dumps(state)[:300]}", flush=True)
    return {"state": state, "frame": mid}


def zoom(png, name, x0, y0, x1, y1, k):
    try:
        from PIL import Image
        im = Image.open(png).convert("RGB")
        w, h = im.size
        box = (int(w * x0), int(h * y0), int(w * x1), int(h * y1))
        crop = im.crop(box)
        crop = crop.resize((crop.width * k, crop.height * k), Image.LANCZOS)
        out = os.path.join(OUT, name)
        crop.save(out)
        print(f"    zoom -> {out}", flush=True)
        return out
    except Exception as exc:  # noqa: BLE001
        print(f"    zoom FAILED {name}: {exc}", flush=True)
        return None


def main():
    os.makedirs(OUT, exist_ok=True)
    res = json.load(open(RESULTS)) if os.path.exists(RESULTS) else {}

    # S004's standing control (the collision victim - unique tag now)
    series = [
        ("w1-stand", S004, None, "fig"),
        ("m1-eye070", S003, {"eye": 0.70}, "face"),
        ("m2-male", S003, {"eye": 0.70, "brow": 2.0}, "face"),
    ]
    for tag, shot, dials, kind in series:
        if tag in res:
            print(f"[{tag}] already done - resume skips", flush=True)
            continue
        r = run_cut(tag, shot, dials)
        if r is None:
            print(f"[{tag}] FAILED - stopping (the supervisor restarts)", flush=True)
            json.dump(res, open(RESULTS, "w"), indent=1, default=str)
            sys.exit(1)
        entry = {"state": r["state"], "frame": r["frame"]}
        if kind == "face":
            z = zoom(r["frame"], f"{tag}-face-3x.png", 0.28, 0.08, 0.78, 0.72, 3)
        else:
            z = zoom(r["frame"], f"{tag}-fig-2x.png", 0.36, 0.10, 0.68, 0.92, 2)
        if z:
            entry["zoom"] = z
        res[tag] = entry
        json.dump(res, open(RESULTS, "w"), indent=1, default=str)
    print(f"PROBE140B COMPLETE - {len(res)} cuts on the ledger", flush=True)


if __name__ == "__main__":
    main()
