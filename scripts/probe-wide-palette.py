#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 125) - the 124 night named the
frontier: the wides' palette/style cells collapsed (S001 palette 20%,
S004 20%, S005 20%) while the face cells moved UP. The judge's words:
'low-poly 3D model', 'desaturated under the deep ramp + mist'. Before
any craft moves, this probe reads the night's OWN frames - the SAME
frames the filmstrip judged (22/40/62% marks) - and measures:
  - HSV saturation + value in the FIGURE band (head box extended down
    ~5 head-heights, the body the palette cell judges)
  - the same over the whole frame (the mist's far field)
  - the SET band behind the figure (the mist's reach)
and extracts PNGs for the director's own eye. Hypotheses:
  H1 the ramp's 0.80 floor darkens the figure (V drops, S holds)
  H2 the mist tint desaturates figure+set (S drops toward the tint)
  H3 the pixels are fine - the judge's eye is dragged by the mushy
     face crops (halo) - saturation stats would then read healthy.
"""
import json
import os
import subprocess
import sys

CWD = "/home/z/my-project/AnimeOS"
sys.path.insert(0, CWD)
os.chdir(CWD)

from PIL import Image  # noqa: E402
import colorsys  # noqa: E402

FFMPEG = "ffmpeg"
MARKS = [0.22, 0.40, 0.62]
SHOTS = {
    "S001": ("/renders/cmusht9zd0087pwblp1h696zs.mp4", "ESTABLISHING"),
    "S004": ("/renders/cmusihb92009ppwblh5aua3tl.mp4", "WIDE"),
    "S005": ("/renders/cmusinuwc00a7pwbl1gidhro6.mp4", "LOW_ANGLE"),
    "S006": ("/renders/cmusiv4dy00aqpwblqtkpewhl.mp4", "WIDE"),
}

# the night's per-shot palette/style scores (the 124 rescore, medianed)
NIGHT_SCORES = {
    "S001": {"palette": 0.20, "style": 0.20, "shot_worst": 0.35},
    "S004": {"palette": 0.20, "style": 0.30, "shot_worst": 0.35},
    "S005": {"palette": 0.20, "style": 0.10, "shot_worst": 0.20},
    "S006": {"palette": 0.70, "style": 0.40, "shot_worst": 0.60},
}


def probe_duration(clip):
    out = subprocess.run(
        [FFMPEG, "-i", clip, "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    for line in out.splitlines():
        if "time=" in line:
            t = line.split("time=")[1].split(" ")[0]
            hh, mm, ss = t.split(":")
            return int(hh) * 3600 + int(mm) * 60 + float(ss)
    return None


def extract_frame(clip, t, png):
    subprocess.run(
        [FFMPEG, "-y", "-ss", f"{t:.3f}", "-i", clip, "-frames:v", "1", png],
        capture_output=True,
    )
    return os.path.exists(png)


def stats(img, box):
    """mean S/V over box (x0,y0,x1,y1) - HSV per pixel."""
    x0, y0, x1, y1 = [max(0, int(v)) for v in box]
    x1, y1 = min(img.width, x1), min(img.height, y1)
    if x1 <= x0 or y1 <= y0:
        return None
    px = img.crop((x0, y0, x1, y1)).convert("RGB")
    data = list(px.getdata())
    n = len(data)
    if not n:
        return None
    s_sum = v_sum = 0.0
    for r, g, b in data:
        _, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        s_sum += s
        v_sum += v
    return {"S": s_sum / n, "V": v_sum / n, "n": n}


def main():
    outdir = os.path.join(CWD, "probe-iter125")
    os.makedirs(outdir, exist_ok=True)
    print(f"probe dir: {outdir}")
    report = {}
    for sid, (clip_rel, framing) in SHOTS.items():
        clip = os.path.join(CWD, "public", clip_rel.lstrip("/"))
        dur = probe_duration(clip)
        if not dur:
            print(f"{sid}: no duration - skip")
            continue
        job_id = os.path.basename(clip).replace(".mp4", "")
        # the job file: jobId prefix == clip basename prefix (the mp4 is
        # named by the job); boxes are PIXEL coords (cropFaceCell law)
        jobfile = os.path.join(CWD, "public", "renders", f".job-{job_id}.json")
        boxes_by_mark = {}
        if os.path.exists(jobfile):
            j = json.load(open(jobfile))
            r = j.get("render") or (j.get("state") or {}).get("render") or {}
            fb = r.get("faceBoxes") or {}
            marks = fb.get("marks") or []
            cast = fb.get("cast") or []
            if cast:
                c = cast[0]  # the hero row (the strip's first row)
                boxes_by_mark = {k: b for k, b in enumerate(c.get("boxes") or []) if b}
        rows = []
        for i, f in enumerate(MARKS):
            t = min(dur - 0.1, max(0.1, dur * f))
            png = os.path.join(outdir, f"{sid}-f{i}.png")
            if not extract_frame(clip, t, png):
                continue
            img = Image.open(png).convert("RGB")
            W, H = img.size
            whole = stats(img, (0, 0, W, H))
            fig = None
            if i in boxes_by_mark or boxes_by_mark:
                box = boxes_by_mark.get(i) or next(iter(boxes_by_mark.values()))
                x0, y0, x1, y1 = box
                hw = x1 - x0
                hh = y1 - y0
                figband = (x0 - 0.3 * hw, y0, x1 + 0.3 * hw, min(H, y1 + 5.0 * hh))
                fig = stats(img, figband)
            setband = stats(img, (0, 0, W, int(H * 0.30)))  # the far field above
            rows.append({"t": round(t, 2), "whole": whole, "figure": fig, "setTop": setband})
        report[sid] = {"framing": framing, "night": NIGHT_SCORES.get(sid), "rows": rows}
        for i, row in enumerate(rows):
            f = row["figure"] or {}
            w = row["whole"] or {}
            s = row["setTop"] or {}
            print(
                f"{sid} f{i} t={row['t']}s | FIGURE S={f.get('S', 0):.3f} V={f.get('V', 0):.3f}"
                f" | WHOLE S={w.get('S', 0):.3f} V={w.get('V', 0):.3f}"
                f" | SETTOP S={s.get('S', 0):.3f} V={s.get('V', 0):.3f}"
            )
        print(f"  night: {NIGHT_SCORES.get(sid)}")
    json.dump(report, open(os.path.join(outdir, "report.json"), "w"), indent=1)
    print("report.json written")


if __name__ == "__main__":
    main()
