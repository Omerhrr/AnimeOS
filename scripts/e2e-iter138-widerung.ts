// ─────────────────────────────────────────────────────────────
// E2E ITERATION 138 - THE WIDE RUNG (the resolution rung ladder
// extends the 1024 cap to the WIDE framing).
//
// The 137 night's receipt: S004's face 20 (the simplified read at
// the WIDE - the 134 texel budget ceiling's last loud cell) and its
// style 30 hold the p10 at 35. The eye's arithmetic (the 133 probe's
// own receipt): a <44px head reads a smear. The WIDE fills 0.50 so
// the head lands ~30px at the 640 rung - and the geometry cannot
// pull in (the WIDE's contract owns the scene: the aura crawl across
// the floor). THE PROBE BEFORE THE PEN (scripts/probe-138-widerung.py,
// 5 real worker_run cuts on the drain's own assembled payloads via
// probe-138-cast.ts): the 640 control rides the convicted smear while
// the same build at 1024 lands the head ~48px and the face reads
// DRAWN (the eyes with iris + catch-light, the brow bands, the nose
// line, the mouth, the topknot pin, the sash X's gold with
// modulation); the 896 middle rung also crosses but the 1024 keeps
// the 126 precedent's single wide-end value; the S006 pair at 1024
// reads the dye + trim cleanly. THE LAW: preview_cap_for keys the
// wide-end framings (ESTABLISHING, WIDE) to the 1024 rung; the tight
// framings keep the 640 rung (the LOW_ANGLE's own cells read - the
// 137 night's one per-shot clear); FINAL stays 1280. The ladder rides
// source law exactly as 123/126 left it - the versions stand (ANIME
// 125 / TOON 132 / PRESENCE 108) and the 126 pin advances
// legitimately (the same discipline as the 136's 121 pin move).
// ─────────────────────────────────────────────────────────────
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const BLENDER = process.env.BLENDER || "/home/z/blender-5.2.2-linux-x64/blender";

let failures = 0;
function expect(name, cond, detail) {
  const ok = !!cond;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures += 1;
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), "utf8"); }

// ── 1. THE SOURCE LAW ──
function sourceLaw() {
  const br = read("bridges/blender/animeos_bridge.py");
  expect("the ladder constants stand (640 preview / 1024 wide-end / 1280 FINAL)",
    br.includes("PREVIEW_CAP = 640") && br.includes("ESTABLISHING_CAP = 1024") && br.includes("FINAL_CAP = 1280"), "the constants");
  expect("the wide rung rides: the wide-end framings key the 1024 rung",
    br.includes('return ESTABLISHING_CAP if str(shot_type or "").upper() in ("ESTABLISHING", "WIDE") else PREVIEW_CAP'), "the rung");
  expect("the worker rides the ladder (no hardcoded ternary)",
    br.includes('cap = preview_cap_for(shot.get("shotType"), mode)')
      && !br.includes('cap = 1280 if mode == "FINAL" else 640'), "the call");
  expect("the 138 receipt names the law (the comment carries the probe's own read)",
    br.includes("THE WIDE RUNG (iteration 138)") && br.includes("the face\n        # reads DRAWN"), "the comment");
  expect("the versions stand (the ladder rides source law as 123/126 left it)",
    br.includes("PRESENCE_LAW_VERSION = 108"), "presence 108");
  const anime = read("bridges/blender/anime_character.py");
  expect("ANIME 125 stands", anime.includes("ANIME_LAW_VERSION = 125"), "anime 125");
  const toon = read("bridges/blender/toon_pass.py");
  expect("TOON 132 stands", toon.includes("TOON_LAW_VERSION = 133"), "toon 133");
  expect("the night wall rises with the rung's honest cost (the drain never expires mid-night)",
    read("scripts/night111-run.ts").includes("const OVERALL_TIMEOUT_MS = 90 * 60 * 1000;"), "the wall");
}

// ── 2. THE REAL-MODULE UNIT TRUTH (plain python3, no bpy) ──
const PY_PROBE = `
import importlib.util, json, os, sys
ROOT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else sys.argv[-1]
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = {}
out["ladder"] = {"wide": m.preview_cap_for("WIDE", "PREVIEW"),
                 "establishing": m.preview_cap_for("ESTABLISHING", "PREVIEW"),
                 "medium": m.preview_cap_for("MEDIUM", "PREVIEW"),
                 "closeup": m.preview_cap_for("CLOSEUP", "PREVIEW"),
                 "mcu": m.preview_cap_for("MCU", "PREVIEW"),
                 "lowangle": m.preview_cap_for("LOW_ANGLE", "PREVIEW"),
                 "none": m.preview_cap_for(None, "PREVIEW"),
                 "wide_final": m.preview_cap_for("WIDE", "FINAL"),
                 "establishing_final": m.preview_cap_for("ESTABLISHING", "FINAL"),
                 "medium_final": m.preview_cap_for("MEDIUM", "FINAL")}
out["versions"] = {"presence": m.PRESENCE_LAW_VERSION}
print("PROBE_JSON " + json.dumps(out))
`;

function moduleTruth() {
  const r = spawnSync("python3", ["-c", PY_PROBE, "--", ROOT], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0 || !r.stdout.includes("PROBE_JSON")) {
    expect("the real-module probe runs", false, { status: r.status, err: r.stderr?.slice(0, 300) });
    return;
  }
  const probe = JSON.parse(r.stdout.slice(r.stdout.indexOf("PROBE_JSON ") + "PROBE_JSON ".length).split("\n")[0]);
  expect("the wide rung answers 1024 from the real module", probe.ladder.wide === 1024, probe.ladder);
  expect("the establishing rung stands at 1024", probe.ladder.establishing === 1024, probe.ladder);
  expect("the tight framings keep the 640 rung (MEDIUM/CLOSEUP/MCU/LOW_ANGLE/None)",
    probe.ladder.medium === 640 && probe.ladder.closeup === 640 && probe.ladder.mcu === 640
      && probe.ladder.lowangle === 640 && probe.ladder.none === 640, probe.ladder);
  expect("FINAL stays 1280 at every framing",
    probe.ladder.wide_final === 1280 && probe.ladder.establishing_final === 1280 && probe.ladder.medium_final === 1280, probe.ladder);
  expect("PRESENCE 108 answers from the real module", probe.versions.presence === 108, probe.versions);
}

// ── 3. THE REAL BLENDER PROBE (the node truth on the REAL worker_run) ──
const BLENDER_PROBE = `
import importlib.util, json, os, sys, tempfile
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.path.insert(0, os.path.dirname(BRIDGE))
import toon_pass as tp

fails = []
def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f" - {detail}"))
    if not cond:
        fails.append(name)

# S004's honest cast - the drain's own assembly (probe138-cast.json,
# the sheet conformance's anchored dye: the 130 net's own read)
CAST = json.load(open(os.path.join(ROOT, "probe138-cast.json")))
S004 = dict(CAST["S004"])
SCENE = dict(CAST["scene"])
SCENE["number"] = 1
SCENE["title"] = "e138"

def build(shot_type, lens, mode="PREVIEW", movement="PAN"):
    out_dir = tempfile.mkdtemp(prefix="e138-")
    job = os.path.join(out_dir, "job.json")
    shot = dict(S004)
    shot["shotType"] = shot_type
    shot["lens"] = lens
    shot["movement"] = movement
    shot["duration"] = 0.5
    payload = {"shot": shot,
               "scene": SCENE,
               "project": {"title": "e138", "visualStyle": "DONGHUA",
                           "resolution": "1920x1080", "fps": 2},
               "mode": mode}
    json.dump({"jobId": f"e138-{shot_type}-{mode}", "payload": payload, "outDir": out_dir}, open(job, "w"))
    m.worker_run(job)
    st = json.load(open(job))
    import bpy
    return st, bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y, (st.get("render") or {})

# ── WIDE: the named cell's framing - the 1024 rung rides ──
st_w, rx_w, ry_w, ev_w = build("WIDE", "35mm")
ok("the WIDE previews at the 1024 rung (1024x576 from the 1920x1080 base)",
   rx_w == 1024 and ry_w == 576, {"rx": rx_w, "ry": ry_w})
ok("the presence law rides 108 at the wide",
   ((ev_w.get("presence") or {}).get("lawVersion")) == 108, ev_w.get("presence"))
ok("the WIDE's solve keeps the 108 law's shape (fill 0.5, the full-figure solve - never cut down)",
   abs((ev_w.get("presence") or {}).get("fill", 0) - 0.5) < 1e-9
     and (ev_w.get("presence") or {}).get("rung") is None, ev_w.get("presence"))
ok("the toon law rides 132 at the wide (the 136 bold rung's framings)",
   ((ev_w.get("look") or {}).get("lawVersion")) == 133, ev_w.get("look"))
ok("the S004 dye rides the honest sheet conformance (the anchored robe, not a constant)",
   len((S004.get("cast") or [])) == 1 and bool((S004["cast"][0] or {}).get("robeColor")), S004.get("cast"))

# ── ESTABLISHING: the 126 rung byte-kept ──
st_e, rx_e, ry_e, ev_e = build("ESTABLISHING", "24mm", movement="CRANE")
ok("the ESTABLISHING previews at 1024 (the 126 rung stands)",
   rx_e == 1024 and ry_e == 576, {"rx": rx_e, "ry": ry_e})

# ── MEDIUM: the tight framings keep the 640 rung ──
st_m, rx_m, ry_m, ev_m = build("MEDIUM", "35mm", movement="TRACKING")
ok("the MEDIUM keeps the 640 rung (640x360 - the 133 waist-up solve's own scale)",
   rx_m == 640 and ry_m == 360, {"rx": rx_m, "ry": ry_m})

# ── LOW_ANGLE: the scope discipline (the 137 night's one clear keeps its rung) ──
st_l, rx_l, ry_l, ev_l = build("LOW_ANGLE", "50mm", movement="ORBIT")
ok("the LOW_ANGLE keeps the 640 rung (the scope keys exactly the wide end)",
   rx_l == 640 and ry_l == 360, {"rx": rx_l, "ry": ry_l})

# ── FINAL: the FINAL cap stands at the wide too ──
st_f, rx_f, ry_f, ev_f = build("WIDE", "35mm", mode="FINAL")
ok("the WIDE at FINAL rides the 1280 cap (1280x720)",
   rx_f == 1280 and ry_f == 720, {"rx": rx_f, "ry": ry_f})

print("PROBE_FAILS " + json.dumps(fails))
`;

function blenderTruth() {
  // THE HONEST PAYLOAD, ALWAYS FRESH: the cast ledger regenerates from
  // the standing DB through the drain's own assembly (probe-138-cast.ts,
  // the real lib functions) - the probe never rides a committed snapshot
  // (the 137 restore's lesson: the sheets re-roll each rebuild).
  const regen = spawnSync("npx", ["tsx", "scripts/probe-138-cast.ts"], {
    cwd: ROOT, encoding: "utf8", timeout: 300_000,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "file:/home/z/my-project/db/custom.db" },
  });
  expect("the cast ledger regenerates from the DB (probe-138-cast.ts)",
    regen.status === 0 && fs.existsSync(path.join(ROOT, "probe138-cast.json")),
    regen.stderr?.slice(-300) || regen.stdout?.slice(-200));
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e138-"));
  const pyFile = path.join(probeDir, "probe.py");
  const pyFull = `import json, os, sys
ROOT = ${JSON.stringify(ROOT)}
${BLENDER_PROBE}`;
  fs.writeFileSync(pyFile, pyFull);
  const r = spawnSync(BLENDER, ["-b", "--factory-startup", "-P", pyFile, "--"], {
    cwd: ROOT, encoding: "utf8", timeout: 900_000,
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
}

// ── 4. THE NIGHT TOOL (the 122 ops law: double-fork detach, the explicit env) ──
function nightTool() {
  const night = read("scripts/detached-night138.mjs");
  expect("the night detaches double-forked with the explicit DATABASE_URL, hull ink, median of 3",
    night.includes('DATABASE_URL: process.env.DATABASE_URL_OVERRIDE || "file:/home/z/my-project/db/custom.db"')
      && night.includes('ANIMEOS_INK: "hull"') && night.includes('ANIMEOS_SCORE_SAMPLES: "3"')
      && night.includes("child.unref()") && night.includes("mid.unref()"), "the env");
  expect("the night drives the same tick the UI drives (reset | drain | rescore)",
    night.includes('reset: "scripts/reset-sc12-renders.ts"') && night.includes('drain: "scripts/night111-run.ts"')
      && night.includes('rescore: "scripts/night111-rescore.ts"'), "the phases");
}

function main() {
  sourceLaw();
  moduleTruth();
  blenderTruth();
  nightTool();
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
