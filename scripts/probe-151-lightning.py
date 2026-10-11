#!/usr/bin/env python3
"""THE LIGHTNING CONVICTION PROBE (iteration 151) - the 149 probe
named the lightning as one of the two transport seams the hair's
foreign hue may ride. The strike windows are DETERMINISTIC from the
job id (lightning_windows - the seed law), so the conviction rides
the EXISTING night-150 S006 clip: compute the windows, map them to
frame indices, extract the strike frames and the quiet frames, and
meter the hero's dark mass in both sets. The receipt: the strike
frames' foreign chroma SPIKES over the quiet frames -> the strobe is
convicted as a transport seam; the lever (a bounded strobe energy)
waits with its own verify arm.
"""
import json, math, os, subprocess, sys

ROOT = "/home/z/my-project/AnimeOS"
OUT = "/home/z/my-project/inspect/probe151"
os.makedirs(OUT, exist_ok=True)
CLIP = os.path.join(ROOT, "public", "renders", "cmv2yr5qy0061ksuuk9cfc82q.mp4")  # the night-150 S006 drain clip
JOB_ID = "cmv2yr5qy0061ksuuk9cfc82q"

# the drain's S006 scene params (the standing defaults the drain rode)
LIGHTNING = 0.55
DURATION = 3.6
FPS = 12.0  # the preview ladder's fps (86 frames / 3.6s ~= 23.9 -> check below)

def fnv1a(s):
    h = 2166136261
    for ch in str(s):
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h

def mulberry32(seed):
    cell = [seed & 0xFFFFFFFF]
    def rng():
        cell[0] = (cell[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = cell[0]
        t = (t + 0x6D2B79F5) & 0xFFFFFFFF
        r = (t ^ (t >> 15)) * (1 | t) & 0xFFFFFFFF
        r = (r + ((r ^ (r >> 7)) * (61 | r)) & 0xFFFFFFFF) ^ r
        return (r ^ (r >> 14)) & 0xFFFFFFFF
    return rng, cell

# mirror the bridge's mulberry32 exactly (the bridge's own body)
def mulberry32_bridge(seed):
    cell = [seed & 0xFFFFFFFF]
    def rng():
        cell[0] = (cell[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = cell[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61)))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return rng

def lightning_windows(job_id, lightning, duration_sec):
    if lightning <= 0.03:
        return []
    a = fnv1a(job_id)
    rng = mulberry32_bridge(a)
    windows = []
    for _ in range(1 + int(lightning * 2)):
        windows.append((0.12 + rng() * 0.74, 0.08 + 0.1 * lightning, 0.35 + 0.35 * lightning))
    return windows

def frames_meta(mp4):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=nb_frames,avg_frame_rate,duration", "-of", "json", mp4],
                       capture_output=True, text=True)
    return json.loads(r.stdout)["streams"][0]

def meter(png, box):
    from PIL import Image
    im = Image.open(png).convert("RGB")
    w, h = im.size
    x0, y0, x1, y1 = box
    px = list(im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1))).getdata())
    px.sort(key=lambda p: sum(p))
    dark = px[: max(1, len(px) // 4)]
    n = len(dark)
    mean = [sum(p[i] for p in dark) / n for i in range(3)]
    spread = max(mean) - min(mean)
    return {"rgb": [round(v, 1) for v in mean], "spread": round(spread, 1)}

def extract(mp4, t, png):
    subprocess.run(["ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", mp4, "-frames:v", "1",
                    "-loglevel", "error", png], timeout=60, check=True)

BOX = (0.52, 0.05, 0.95, 0.35)  # Wei's head region in the two-shot (the standing meter box)

def main():
    st = frames_meta(CLIP)
    nb = int(st["nb_frames"]); dur = float(st["duration"]); fps = nb / dur
    windows = lightning_windows(JOB_ID, LIGHTNING, dur)
    print(f"clip: {nb} frames / {dur:.2f}s / {fps:.2f} fps; windows: {[(round(s,3), round(d,3), round(a,2)) for s,d,a in windows]}")
    strike_ts, quiet_ts = [], []
    for f in range(1, nb + 1):
        t = (f - 0.5) / fps
        hit = any(s <= t <= s + d for s, d, _a in windows)
        (strike_ts if hit else quiet_ts).append(t)
    print(f"strike frames: {len(strike_ts)}, quiet frames: {len(quiet_ts)}")
    strike_m, quiet_m = [], []
    for i, t in enumerate(strike_ts[:4]):
        png = os.path.join(OUT, f"strike-{i}.png")
        extract(CLIP, t, png); strike_m.append(meter(png, BOX))
    # the quiet frames sampled at the same phase spacing (the pose moves - the
    # median over 6 quiet samples brackets the motion)
    for i in range(6):
        t = quiet_ts[int(i * len(quiet_ts) / 6)]
        png = os.path.join(OUT, f"quiet-{i}.png")
        extract(CLIP, t, png); quiet_m.append(meter(png, BOX))
    def med(vals):
        s = sorted(v["spread"] for v in vals)
        return round(s[len(s)//2], 1) if s else None
    rep = {
        "strike": strike_m, "quiet": quiet_m,
        "strikeMedianSpread": med(strike_m), "quietMedianSpread": med(quiet_m),
    }
    print(json.dumps(rep, indent=1))
    json.dump(rep, open(os.path.join(OUT, "lightning-meter.json"), "w"), indent=1)
    sm, qm = rep["strikeMedianSpread"], rep["quietMedianSpread"]
    if sm is None or qm is None:
        print("CONVICTION INCONCLUSIVE - missing arm"); sys.exit(1)
    if sm > qm * 1.25:
        print(f"LIGHTNING CONVICTED: the strike frames' foreign chroma median {sm} vs quiet {qm} (spike {round(sm/max(qm,0.1),2)}x) - the strobe transports the foreign hue; the bounded-strobe lever owes its verify arm")
    elif sm < qm * 1.1:
        print(f"LIGHTNING EXONERATED: the strike frames' median {sm} vs quiet {qm} - the strobe does not carry the mass's foreign chroma")
    else:
        print(f"LIGHTNING MIXED: strike {sm} vs quiet {qm} - the spike is present but small")

if __name__ == "__main__":
    main()
