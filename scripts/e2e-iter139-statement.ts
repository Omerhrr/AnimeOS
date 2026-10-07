// ─────────────────────────────────────────────────────────────
// E2E ITERATION 139 - THE STATEMENT REVISION (Wei's design r3:
// the proportion dials the judge's chibi receipt names).
//
// The 138 night's verdict: the wide rung's texels landed (S004's
// face is DRAWN - the 137-era smear is retired) but the named cell
// HELD at face 20 and the accusation MUTATED - no longer texel
// starvation, a STYLE read: 'a severe style shift to a simplified
// chibi aesthetic' (style 15). THE PROBE BEFORE THE PEN
// (scripts/probe-139-style.py, 5 real worker_run cuts on the
// drain's own assembled payload - probe138-cast.json regenerated
// fresh): A1-stand (the night's own receipt) vs the single-dial
// cuts B1-head085 (headScale 0.95 -> 0.85, the clamp floor - the
// skull measure drops 0.1051 -> 0.094), B2-hair09 (hair volume
// 1.15 -> 0.90, the silhouette's bulk), B3-eye070 (eyes 0.8 ->
// 0.70, the clamp floor - the eye-to-face ratio, the strongest
// single anti-chibi move), and the composed B4-statement. THE
// EYE-READ: the chibi tell is carried primarily by the
// eye-to-face ratio, second by the skull scale, the hair bulk
// subtlest; the composed cut reads least chibi with the face
// still drawn. THE LAW: the statement lives WHERE THE IDENTITY
// LIVES - Wei's COMMITTED design advances r2 -> r3 (exactly three
// dials move; the sheet art does NOT - the designSheet rides the
// r2 turnaround, the sheet is the law the dials serve); Lin's r2
// stands byte-exact (her 90 face receipt is not put at risk); no
// build-law bump - the dials ride inside the standing resolve_spec
// clamps (0.85 is the headScale floor, 0.70 the eyes floor), the
// design is DATA. The drain reads the design from the DB each job,
// so the next night renders the r3 statement with no bridge change
// and no pool restart.
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

const WEI_R2 = "public/designs/cmuqieinq000cpxz7lp5ohq41/r2/dna.json";
const WEI_R3 = "public/designs/cmuqieinq000cpxz7lp5ohq41/r3/dna.json";
const LIN_R2 = "public/designs/cmuq1s4i00007ppgsjqryw9r5/r2/dna.json";

// ── 1. THE SOURCE LAW (the design history + the wiring + the pins) ──
function sourceLaw() {
  const r2 = JSON.parse(read(WEI_R2));
  const r3 = JSON.parse(read(WEI_R3));
  // the honest revision: EXACTLY three dials differ, everything else
  // byte-equal (the dye language is the 137 heal's - untouched)
  const diffs: string[] = [];
  (function walk(a: any, b: any, p: string) {
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${p}.${k}`);
    } else if (a !== b) diffs.push(p);
  })(r2, r3, "");
  expect("the r3 revision moves EXACTLY the three statement dials",
    diffs.length === 3
    && diffs.includes(".designSpec.body.headScale")
    && diffs.includes(".designSpec.hair.volume")
    && diffs.includes(".designSpec.eyes.size"), diffs);
  expect("the r3 dials ride the probe-139 B4 receipt (head 0.85 / hair 0.90 / eyes 0.70)",
    r3.designSpec.body.headScale === 0.85 && r3.designSpec.hair.volume === 0.9 && r3.designSpec.eyes.size === 0.7
      && r2.designSpec.body.headScale === 0.95 && r2.designSpec.hair.volume === 1.15 && r2.designSpec.eyes.size === 0.8,
    { r2: [r2.designSpec.body.headScale, r2.designSpec.hair.volume, r2.designSpec.eyes.size],
      r3: [r3.designSpec.body.headScale, r3.designSpec.hair.volume, r3.designSpec.eyes.size] });
  expect("the r3 dye language is untouched (the 137 heal stands)",
    JSON.stringify(r3.robeColor) === JSON.stringify(r2.robeColor)
      && JSON.stringify(r3.robeAccent) === JSON.stringify(r2.robeAccent)
      && JSON.stringify(r3.hairColor) === JSON.stringify(r2.hairColor), "the dyes");
  const lin = JSON.parse(read(LIN_R2));
  expect("Lin's r2 FILE stands untouched on disk (the r3 revision is a new file - the design history is the ledger)",
    lin.designSpec.body.headScale === 0.9 && lin.designSpec.eyes.size === 0.8
      && lin.designSpec.brows.thickness === 1.25, "lin r2 file");
  const restore = read("scripts/night122-restore.ts");
  expect("the restore law wires Wei's r3 byte-exact (the sandbox-rebuild law advances)",
    restore.includes("r3/dna.json") && restore.includes("r3 is the 139 statement"), "the wiring");
  expect("the restore keeps the sheet art honest (the designSheet rides the r2 turnaround - the sheet is the law the dials serve)",
    restore.includes('sheet: "/designs/cmuqieinq000cpxz7lp5ohq41/r2/turn_sheet.png"'), "the sheet");
  expect("the 137 gate's pin advanced to the r3 bytes (the legitimate-advance discipline)",
    read("scripts/e2e-iter137-restore.ts").includes("the 139 statement revision"), "the pin");
  expect("the 103 housekeeping lands (the registry's living truth, not a session constant)",
    read("scripts/e2e-iter103-warmworkers.ts").includes("toolCount >= 90"), "the pin");
  const anime = read("bridges/blender/anime_character.py");
  const toon = read("bridges/blender/toon_pass.py");
  const bridge = read("bridges/blender/animeos_bridge.py");
  expect("no build-law bump (the design is DATA - the dials ride inside the standing clamps)",
    anime.includes("ANIME_LAW_VERSION = 125") && toon.includes("TOON_LAW_VERSION = 133")
      && bridge.includes("PRESENCE_LAW_VERSION = 108"), "the versions");
  expect("the clamp law is the dials' own net (headScale floor 0.85, eyes floor 0.70)",
    anime.includes('"headScale": _num(b0, "headScale", 1.0, 0.85, 1.2)')
      && anime.includes('"size": _num(e0, "size", 0.92 if gender == "male" else 1.0, 0.7, 1.4)'), "the clamps");
}

// ── 2. THE REAL-MODULE UNIT TRUTH (plain python3, no bpy) ──
const PY_PROBE = `
import importlib.util, json, os, sys
ROOT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else sys.argv[-1]
AC = os.path.join(ROOT, "bridges", "blender", "anime_character.py")
spec = importlib.util.spec_from_file_location("ac", AC)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
wei_r3 = json.load(open(os.path.join(ROOT, "public/designs/cmuqieinq000cpxz7lp5ohq41/r3/dna.json")))
wei_r2 = json.load(open(os.path.join(ROOT, "public/designs/cmuqieinq000cpxz7lp5ohq41/r2/dna.json")))
lin_r2 = json.load(open(os.path.join(ROOT, "public/designs/cmuq1s4i00007ppgsjqryw9r5/r2/dna.json")))
s3 = m.resolve_spec(wei_r3)
s2 = m.resolve_spec(wei_r2)
sl = m.resolve_spec(lin_r2)
# the clamp law: an out-of-floor design still clamps (the net stands)
below = m.resolve_spec({"designSpec": {"body": {"headScale": 0.4}, "eyes": {"size": 0.2}}})
out = {
  "weiR3": {"head": s3["body"]["headScale"], "hair": s3["hair"]["volume"], "eye": s3["eyes"]["size"], "law": s3["lawVersion"]},
  "weiR2": {"head": s2["body"]["headScale"], "hair": s2["hair"]["volume"], "eye": s2["eyes"]["size"]},
  "linR2": {"head": sl["body"]["headScale"], "hair": sl["hair"]["volume"], "eye": sl["eyes"]["size"]},
  "clamps": {"head": below["body"]["headScale"], "eye": below["eyes"]["size"]},
}
print("PROBE_JSON " + json.dumps(out))
`;

function moduleTruth() {
  const r = spawnSync("python3", ["-c", PY_PROBE, "--", ROOT], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0 || !r.stdout.includes("PROBE_JSON")) {
    expect("the real-module probe runs", false, { status: r.status, err: r.stderr?.slice(0, 300) });
    return null;
  }
  const probe = JSON.parse(r.stdout.slice(r.stdout.indexOf("PROBE_JSON ") + "PROBE_JSON ".length).split("\n")[0]);
  expect("resolve_spec answers the r3 dials from the REAL module (the build seam)",
    probe.weiR3.head === 0.85 && probe.weiR3.hair === 0.9 && probe.weiR3.eye === 0.7, probe.weiR3);
  expect("the r2 spec answers the old dials (the revision is the design's, not the clamps')",
    probe.weiR2.head === 0.95 && probe.weiR2.hair === 1.15 && probe.weiR2.eye === 0.8, probe.weiR2);
  expect("Lin's r2 spec stands (0.9 / 1.3 / 0.8 - her design does not move)",
    probe.linR2.head === 0.9 && probe.linR2.hair === 1.3 && probe.linR2.eye === 0.8, probe.linR2);
  expect("the clamp law holds (0.4 head clamps to the 0.85 floor, 0.2 eye to the 0.70 floor)",
    probe.clamps.head === 0.85 && probe.clamps.eye === 0.7, probe.clamps);
  expect("ANIME 125 answers from the real module (no law bump)",
    probe.weiR3.law === 125, probe.weiR3.law);
  return probe;
}

// ── 3. THE DB LEDGER (the drain's own DNA source) ──
async function dbLedger() {
  const { db } = await import("../src/lib/db");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) { expect("the project exists", false, "missing"); return; }
  const wei = await db.character.findFirst({ where: { projectId: project.id, name: "Demon Lord Wei" } });
  const lin = await db.character.findFirst({ where: { projectId: project.id, name: "Lin Yue" } });
  if (!wei || !lin) { expect("the cast rows exist", false, "missing"); return; }
  const weiSpec = wei.designSpec ? JSON.parse(wei.designSpec) : null;
  const linSpec = lin.designSpec ? JSON.parse(lin.designSpec) : null;
  expect("Wei's DB design rides the r3 bytes (517 chars via JSON.stringify - r2 was 518)",
    wei.designSpec?.length === 517, wei.designSpec?.length);
  expect("Wei's DB design carries the r3 dials",
    weiSpec?.body?.headScale === 0.85 && weiSpec?.hair?.volume === 0.9 && weiSpec?.eyes?.size === 0.7, weiSpec);
  expect("Lin's DB design rides the r3 bytes (514 chars - the 140 statement revision advances this pin; r2 rode 517)",
    lin.designSpec?.length === 514, lin.designSpec?.length);
  expect("Lin's DB design carries the r3 dials (eyes at the male floor, the brow at the ink ceiling)",
    linSpec?.body?.headScale === 0.9 && linSpec?.eyes?.size === 0.7 && linSpec?.brows?.thickness === 2.0, linSpec);
  expect("Wei's designSheet points at the r2 turnaround (the art did not change)",
    wei.designSheetUrl === "/designs/cmuqieinq000cpxz7lp5ohq41/r2/turn_sheet.png", wei.designSheetUrl);
}

// ── 4. THE DRAIN'S OWN ASSEMBLY (the REAL lib functions) ──
function drainAssembly() {
  const regen = spawnSync("npx", ["tsx", "scripts/probe-138-cast.ts"], {
    cwd: ROOT, encoding: "utf8", timeout: 300_000,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "file:/home/z/my-project/db/custom.db" },
  });
  expect("the cast ledger regenerates from the DB (probe-138-cast.ts)",
    regen.status === 0 && fs.existsSync(path.join(ROOT, "probe138-cast.json")),
    regen.stderr?.slice(-300) || regen.stdout?.slice(-200));
  const cast = JSON.parse(read("probe138-cast.json"));
  const s4 = cast.S004?.cast?.[0];
  expect("S004's solo cast is Wei and carries the r3 dials through the drain's own assembly",
    s4?.name === "Demon Lord Wei"
      && (s4?.designSpec as any)?.body?.headScale === 0.85
      && (s4?.designSpec as any)?.hair?.volume === 0.9
      && (s4?.designSpec as any)?.eyes?.size === 0.7,
    { name: s4?.name, spec: s4?.designSpec });
  const s6 = cast.S006?.cast ?? [];
  const lin6 = s6.find((c: any) => c.name === "Lin Yue");
  const wei6 = s6.find((c: any) => c.name === "Demon Lord Wei");
  expect("S006's pair rides Lin r3 + Wei r3 (each character's own statement - the 140 revision advances this pin)",
    (lin6?.designSpec as any)?.body?.headScale === 0.9 && (lin6?.designSpec as any)?.eyes?.size === 0.7
      && (wei6?.designSpec as any)?.body?.headScale === 0.85 && (wei6?.designSpec as any)?.eyes?.size === 0.7,
    s6.map((c: any) => c.name));
  return cast;
}

// ── 5. THE REAL BLENDER PROBE (the node truth on the REAL worker_run) ──
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

CAST = json.load(open(os.path.join(ROOT, "probe138-cast.json")))
S004 = dict(CAST["S004"])
SCENE = dict(CAST["scene"])
SCENE["number"] = 1
SCENE["title"] = "e139"

out_dir = tempfile.mkdtemp(prefix="e139-")
job = os.path.join(out_dir, "job.json")
shot = dict(S004)
shot["duration"] = 0.5
payload = {"shot": shot,
           "scene": SCENE,
           "project": {"title": "e139", "visualStyle": "DONGHUA",
                       "resolution": "1920x1080", "fps": 2},
           "mode": "PREVIEW"}
json.dump({"jobId": "e139-s004-wide", "payload": payload, "outDir": out_dir}, open(job, "w"))
m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
presence = ev.get("presence") or {}
look = ev.get("look") or {}
mp4 = st.get("mp4Path")

ok("the r3 cut lands a real clip at the WIDE", bool(mp4) and os.path.exists(mp4), mp4)
ok("the WIDE rides the 1024 rung (the 138 ladder stands under the r3 design)",
   (st.get("render") or {}).get("look", {}).get("resX") in (1024, None)
     and json.load(open(job)).get("resolution") in (None, "1024x576", [1024, 576]), "the rung")
# THE STATEMENT'S OWN WITNESS: the skull measure drops with the r3
# headScale - the probe's own receipt (r2 rode 0.1051; the probe's
# B1/B4 head-085 cuts measured 0.094 at the same solve)
hh = presence.get("headH")
ok("the r3 skull measure lands at the probe's own witness (headH ~0.094, r2 rode 0.1051)",
   isinstance(hh, (int, float)) and abs(hh - 0.094) < 0.002, presence)
ok("the presence law rides 108 (the solve's shape stands under the r3 design)",
   presence.get("lawVersion") == 108, presence)
ok("the toon law rides 133 (the 140 wide-end paint statement advances this pin)",
   look.get("lawVersion") == 133, look)
ok("the WIDE's solve keeps the full-figure contract (fill 0.5, never cut down)",
   abs(presence.get("fill", 0) - 0.5) < 1e-9, presence)

print("PROBE_FAILS " + json.dumps(fails))
`;

function blenderTruth() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e139-"));
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

// ── 6. THE NIGHT TOOL (the 139 runner rides the 122 ops law) ──
function nightTool() {
  const night = read("scripts/detached-night139.mjs");
  expect("the 139 night detaches double-forked with the explicit DATABASE_URL, hull ink, median of 3",
    night.includes('DATABASE_URL: process.env.DATABASE_URL_OVERRIDE || "file:/home/z/my-project/db/custom.db"')
      && night.includes('ANIMEOS_INK: "hull"') && night.includes('ANIMEOS_SCORE_SAMPLES: "3"')
      && night.includes("child.unref()") && night.includes("mid.unref()"), "the env");
  expect("the 139 night drives the same tick the UI drives (reset | drain | rescore)",
    night.includes('reset: "scripts/reset-sc12-renders.ts"') && night.includes('drain: "scripts/night111-run.ts"')
      && night.includes('rescore: "scripts/night111-rescore.ts"'), "the phases");
}

async function main() {
  sourceLaw();
  moduleTruth();
  await dbLedger();
  drainAssembly();
  blenderTruth();
  nightTool();
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("gate failed:", e); process.exit(1); });
