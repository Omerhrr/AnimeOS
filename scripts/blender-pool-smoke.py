#!/usr/bin/env python3
"""Blender WARM POOL smoke (iteration 103 - THE WORKERS STAY WARM).

Drives a REAL bridge server in pool mode (plain python3; the server
itself does not need bpy - the pool workers are Blender processes):

  1. boot: server on :8133 with --pool 1; /status must name the pool
     and show a free warm slot once the worker finishes ITS one-time
     Blender boot (the boot this mode exists to pay only ONCE)
  2. job 1: a real PREVIEW render through the WARM worker - the job
     completes over the socket path, the mp4 lands, /status counts
     served=1
  3. job 2: the SAME worker serves again - served=2 is the REUSE
     proof (one process, two jobs), and the warm wall is named
  4. the cold fallback: the pool worker is killed; job 3 still
     completes through the proven cold-spawn path (served stays 2)

Run: python3 scripts/blender-pool-smoke.py
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
PORT = 8133
BASE = f"http://127.0.0.1:{PORT}"

failures = 0


def check(name, ok, detail=""):
    global failures
    print(f"{'PASS' if ok else 'FAIL'} {name}{'' if ok else f' - {detail}'}")
    if not ok:
        failures += 1


def get(path, timeout=10):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=timeout) as r:
        return json.loads(r.read().decode())


def post(path, body, timeout=30):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def wait_for(cond, timeout_s, what):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            if cond():
                return True
        except Exception:
            pass
        time.sleep(1.0)
    return False


def job_payload(job_id, duration=0.8):
    return {
        "jobId": job_id,
        "shot": {"number": 1, "description": "pool smoke shot", "shotType": "MEDIUM", "movement": "STATIC", "duration": duration},
        "scene": {"number": 1, "title": "Pool Smoke", "fogDensity": 0.3, "lightningIntensity": 0.0, "energyIntensity": 0.4, "cameraDistance": 1.0, "rimLightIntensity": 0.5},
        "project": {"title": "Pool Smoke", "visualStyle": "DONGHUA", "resolution": "640x360", "fps": 24},
        "mode": "PREVIEW",
    }


def run_job(job_id, timeout_s=600):
    t0 = time.time()
    out, code = post("/render", job_payload(job_id)), None
    if not out.get("ok"):
        return {"ok": False, "error": f"/render refused: {out}", "wall": 0, "path": out.get("worker")}
    path = out.get("worker")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            p = get(f"/progress?job_id={job_id}", timeout=10)
            if p.get("error"):
                return {"ok": False, "error": p["error"], "wall": time.time() - t0, "path": path}
            if p.get("done"):
                return {"ok": not p.get("error"), "wall": time.time() - t0, "progress": p, "path": path}
        except Exception:
            pass
        time.sleep(1.0)
    return {"ok": False, "error": "timeout", "wall": time.time() - t0, "path": path}


def wait_slot_free(timeout_s=45):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            if get("/status").get("pool", {}).get("busy", 0) == 0:
                return True
        except Exception:
            pass
        time.sleep(1.0)
    return False


def main():
    bin_candidates = [
        os.path.join(os.environ.get("HOME", "/home/z"), "blender-5.2.2-linux-x64", "blender"),
        shutil_which("blender"),
    ]
    blender_bin = next((b for b in bin_candidates if b and os.path.exists(b)), None)
    check("S0 the blender binary stands", blender_bin is not None, str(bin_candidates))

    env = dict(os.environ, ANIMEOS_BLENDER_BIN=blender_bin or "")
    server = subprocess.Popen(
        [sys.executable, BRIDGE, "--", "--port", str(PORT), "--pool", "1"],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        # 1. the boot: the server answers immediately; the WORKER's one-time boot finishes within 150s
        ok = wait_for(lambda: get("/status").get("pool", {}).get("free", 0) >= 1, 150, "warm slot")
        st = get("/status")
        check("S1 the pool is named by /status with a free warm slot after one boot",
              ok and st["pool"]["size"] == 1 and st["pool"]["alive"] == 1,
              json.dumps(st.get("pool", {})))

        # 2. job 1 through the warm worker
        r1 = run_job("poolsmoke1")
        wait_slot_free()
        check("S2 job 1 completed (warm path)", r1["ok"], json.dumps({k: r1.get(k) for k in ("error", "wall")}))
        mp4b64 = (r1.get("progress") or {}).get("mp4_base64")
        check("S3 job 1 landed a clip (the mp4 rides the progress)", bool(mp4b64) and len(mp4b64) > 1000, f"bytes={len(mp4b64 or '')}")
        st = get("/status")
        check("S4 the pool counts served=1 (the warm worker earned the job)",
              st["pool"]["served"] == 1, json.dumps(st["pool"]))

        # 3. job 2 through the SAME worker - the reuse proof
        r2 = run_job("poolsmoke2")
        wait_slot_free()
        st = get("/status")
        check("S5 job 2 completed on the SAME warm worker (served=2 - the boot paid once)",
              r2["ok"] and st["pool"]["served"] == 2, json.dumps(st["pool"]))
        check("S6 the warm walls are named (both jobs' seconds on the record)",
              r1["wall"] > 0 and r2["wall"] > 0, f"{r1['wall']:.1f}s vs {r2['wall']:.1f}s")

        # 4. the cold fallback: kill the worker; job 3 still completes
        ready = os.path.join(ROOT, "public", "renders", ".pool-9410.ready")
        pid = None
        if os.path.exists(ready):
            with open(ready) as fh:
                pid = int(fh.read().strip() or 0)
        if pid:
            os.kill(pid, signal.SIGKILL)
        time.sleep(2.0)
        r3 = run_job("poolsmoke3")
        check("S7 the cold fallback still renders (a dead warm worker never loses a job)",
              r3["ok"], json.dumps({k: r3.get(k) for k in ("error", "wall")}))
        st = get("/status")
        check("S8 the cold job did NOT ride the pool (served stays 2)",
              st["pool"]["served"] == 2, json.dumps(st["pool"]))
    finally:
        # the pool worker is a detached Blender - kill it by its ready-file pid
        for port in (9410,):
            ready = os.path.join(ROOT, "public", "renders", f".pool-{port}.ready")
            try:
                with open(ready) as fh:
                    pid = int(fh.read().strip() or 0)
                if pid:
                    os.kill(pid, signal.SIGKILL)
                os.unlink(ready)
            except Exception:
                pass
        server.send_signal(signal.SIGTERM)
        try:
            server.wait(timeout=10)
        except Exception:
            server.kill()

    print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURE(S)'} - blender-pool-smoke")
    sys.exit(0 if failures == 0 else 1)


def shutil_which(name):
    from shutil import which
    return which(name)


if __name__ == "__main__":
    main()
