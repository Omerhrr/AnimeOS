#!/usr/bin/env python3
"""THE EYE BEFORE THE PEN (iteration 127) - the 126 night named the
pale-dye VALUE wall ("a plain white robe instead of the detailed
light green") and the invisible brush. Before judging the 127 fix,
this probe reads the 127 night's OWN frames - the SAME marks the
filmstrip judged - and measures HSV saturation + value in the FIGURE
band (head box extended down five head-heights) vs the whole frame,
per shot, and drops PNGs for the director's own eye.
"""
import glob
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
HEAD_HEIGHTS = 5.0
WIDTH_FACTOR = 0.30


def shots_map():
    """job file -> (clip, shotType, faceBoxes cast) from THIS night."""
    out = []
    for jf in sorted(glob.glob("public/renders/.job-cmus*.json")):
        st = json.load(open(jf))
        r = st.get("render") or {}
        stg = (r.get("setStage") or {}).get("shotType") or "?"
        clip = st.get("mp4Path")
        boxes = (r.get("faceBoxes") or {}).get("cast") or []
        out.append((jf.split(".job-")[1][:8], clip, stg, boxes))
    return out


def probe_duration(clip):
    out = subprocess.run([FFMPEG, "-i", clip, "-f", "null", "-"], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "time=" in line:
            t = line.split("time=")[1].split(" ")[0]
            hh, mm, ss = t.split(":")
            return int(hh) * 3600 + int(mm) * 60 + float(ss)
    return None


def extract_frame(clip, t, png):
    subprocess.run([FFMPEG, "-y", "-ss", f"{t:.3f}", "-i", clip, "-frames:v", "1", png], capture_output=True)
    return os.path.exists(png)


def stats(img, box):
    x0, y0, x1, y1 = box
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(img.width, int(x1)), min(img.height, int(y1))
    if x1 <= x0 or y1 <= y0:
        return None
    px = img.crop((x0, y0, x1, y1)).convert("RGB")
    data = list(px.getdata())
    n = len(data)
    if not n:
        return None
    s_sum = v_sum = 0.0
    for r, g, b in data:
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        s_sum += s
        v_sum += v
    return (s_sum / n, v_sum / n)


def figure_band(img, head):
    x0, y0, x1, y1 = head
    w = x1 - x0
    fh = (y1 - y0) * HEAD_HEIGHTS
    cx = (x0 + x1) / 2.0
    bw = w * (1.0 + 2 * WIDTH_FACTOR)
    return (cx - bw / 2.0, y0, cx + bw / 2.0, min(img.height, y0 + fh))


def main():
    os.makedirs("probe127", exist_ok=True)
    for jid, clip, stg, boxes in shots_map():
        if not clip or not os.path.exists(clip.lstrip("/")) and not os.path.exists(clip):
            print(f"{jid} {stg}: NO CLIP")
            continue
        path = clip if os.path.exists(clip) else clip.lstrip("/")
        dur = probe_duration(path)
        if not dur:
            print(f"{jid} {stg}: NO DURATION")
            continue
        print(f"\n== {jid} {stg} ({os.path.basename(path)}) {dur:.1f}s")
        for mk in MARKS:
            png = f"probe127/{jid}_{stg}_{int(mk*100)}.png"
            if not extract_frame(path, dur * mk, png):
                continue
            img = Image.open(png)
            fs = stats(img, (0, 0, img.width, img.height))
            line = f"  mark {int(mk*100)}%  whole S={fs[0]:.2f} V={fs[1]:.2f}"
            if boxes:
                for member in boxes[:2]:
                    head = member.get("boxes", [None])[mk is MARKS[1] and 1 or 0]
                    if not head:
                        continue
                    band = figure_band(img, head)
                    bs = stats(img, band)
                    if bs:
                        line += f" | {member['name'][:14]:14s} fig S={bs[0]:.2f} V={bs[1]:.2f}"
            print(line)


if __name__ == "__main__":
    main()
