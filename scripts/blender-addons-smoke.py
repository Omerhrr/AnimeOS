# Smoke-test THE FORGE OPENS (iteration 118) in the REAL Blender:
# every bundled addon enables under policy "all" (rigify honestly
# core/available, zero failures), the re-ensure is idempotent, the
# pool's factory purge re-closes them and the re-ensure recovers,
# the policies honor off/list, and the canonical pose vocabulary
# builds and verifies as a real Pose Asset library. Run:
#   python3 scripts/blender-addons-smoke.py
import json, os, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BL = next(
    p for p in (
        "/home/z/blender-5.2.2-linux-x64/blender",
        "/home/z/blender-4.3.2-linux-x64/blender",
    )
    if os.path.exists(p)
)

RUNNER = r'''
import json, os, sys, time
HERE = %(here)r
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import addon_utils
import animeos_addons as aa

out = {}
# 1. THE FORGE OPENS - policy all
s1 = aa.ensure_builtins()
out["s1"] = s1
open_ = len(s1["alreadyOn"]) + len(s1["enabledNow"]) + len(s1["availableCore"])
out["open_total"] = open_
out["bundled_total"] = len(addon_utils.modules())
out["rigify_core"] = "rigify" in (s1["availableCore"] + s1["alreadyOn"])
out["failed"] = s1["failed"]

# 2. THE RE-ENSURE IS IDEMPOTENT (the warm pool's per-job cost)
s2 = aa.ensure_builtins()
out["s2_enabled_now"] = len(s2["enabledNow"])
out["s2_ms"] = s2["ms"]

# 3. THE PURGE RE-CLOSES - and the re-ensure recovers
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
s3 = aa.ensure_builtins()
out["s3_enabled_now"] = len(s3["enabledNow"])
out["s3_open_total"] = len(s3["alreadyOn"]) + len(s3["enabledNow"]) + len(s3["availableCore"])

# 4. THE POLICIES HONOR off / list
os.environ["ANIMEOS_ADDONS"] = "off"
s4 = aa.ensure_builtins()
out["s4_skipped_all"] = len(s4["skipped"]) == len(addon_utils.modules()) and not (s4["alreadyOn"] or s4["enabledNow"])
os.environ["ANIMEOS_ADDONS"] = "cycles,node_wrangler"
s5 = aa.ensure_builtins()
out["s5_list"] = sorted(set(s5["alreadyOn"] + s5["enabledNow"] + s5["availableCore"]) & {"cycles", "node_wrangler", "rigify"}) == ["cycles", "node_wrangler"]
del os.environ["ANIMEOS_ADDONS"]

# 5. THE CATALOG NAMES THE BENCHES
out["catalog_modules"] = sorted(aa.FORGE_CATALOG.keys())
out["catalog_benches"] = sorted(set(m["bench"] for m in aa.FORGE_CATALOG.values()))

# 6. THE POSE LIBRARY BUILDS AND VERIFIES
import animeos_pose_library as pl
lib = os.path.join(%(tmp)r, "smoke_poses_v1.blend")
summary = pl.build_library(lib)
verified = pl.verify_library(lib)
out["pose_assets"] = summary["assets"]
out["pose_verify_ok"] = verified == summary["expected"]
out["pose_bones"] = summary["bones"]

print("ADDONS_SMOKE " + json.dumps(out))
'''

failures = 0
def expect(name, cond, detail=""):
    global failures
    print(f"{'PASS' if cond else 'FAIL'} {name}{'' if cond else f' - {detail}'}")
    if not cond:
        failures += 1

with tempfile.TemporaryDirectory(prefix="anime-addons-") as tmp:
    runner = RUNNER % {"here": os.path.join(ROOT, "bridges", "blender"), "tmp": tmp}
    rp = os.path.join(tmp, "runner.py")
    with open(rp, "w") as fh:
        fh.write(runner)
    t0 = time.time()
    proc = subprocess.run([BL, "-b", "--python", rp], capture_output=True, text=True, timeout=600, cwd=ROOT)
    el = time.time() - t0
    print(f"[addons-smoke] blender exit={proc.returncode} elapsed={el:.1f}s")
    if proc.returncode != 0:
        print("STDERR tail:", proc.stderr[-1500:])
        sys.exit(1)
    line = next((l for l in proc.stdout.splitlines() if l.startswith("ADDONS_SMOKE ")), None)
    if not line:
        print("FAIL no ADDONS_SMOKE line"); sys.exit(1)
    out = json.loads(line[len("ADDONS_SMOKE "):])

expect("every bundled addon opens under policy all", out["open_total"] == out["bundled_total"] == 13,
       f"open={out['open_total']} bundled={out['bundled_total']}")
expect("rigify is honestly available (core), never failed", out["rigify_core"], json.dumps(out["failed"]))
expect("zero failed enables", len(out["failed"]) == 0, json.dumps(out["failed"]))
expect("the re-ensure is a no-op (idempotent, warm)", out["s2_enabled_now"] == 0, out["s2_enabled_now"])
expect("the re-ensure is cheap (the per-job cost)", out["s2_ms"] < 250, f"{out['s2_ms']}ms")
expect("the factory purge re-closes the non-defaults", out["s3_enabled_now"] >= 4, out["s3_enabled_now"])
expect("the re-ensure recovers the forge after the purge", out["s3_open_total"] == 13, out["s3_open_total"])
expect("policy off skips everything", out["s4_skipped_all"])
expect("policy list opens exactly the named set", out["s5_list"])
expect("the catalog carries 13 modules", len(out["catalog_modules"]) == 13, out["catalog_modules"])
expect("the pose library builds 13 canonical pose assets", len(out["pose_assets"]) == 13, out["pose_assets"])
expect("the library verifies round-trip (assets re-readable)", out["pose_verify_ok"])
expect("the library's bones are the production rig's names",
       sorted(out["pose_bones"]) == ["Head", "LElbow", "LHip", "LKnee", "LPalm", "LShoulder", "Pelvis",
                                     "RElbow", "RHip", "RKnee", "RPalm", "RShoulder", "Spine"], out["pose_bones"])

# the committed library must match the freshly built one (roster truth)
committed = os.path.join(ROOT, "public", "pose-library", "animeos_poses_v1.blend")
expect("the committed pose library exists", os.path.isfile(committed), committed)

print(f"\n{'ALL GREEN' if failures == 0 else f'{failures} FAILURES'}")
sys.exit(1 if failures else 0)
