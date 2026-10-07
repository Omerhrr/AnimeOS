// ─────────────────────────────────────────────────────────────
// E2E ITERATION 140 - THE PAINT STATEMENT + LIN'S MALE INK.
//
// The 139 night's verdict: the r3 statement rode (the probe's B4
// composition IN PRODUCTION, the face reading mature) and the named
// cell HELD anyway - S004's face 20 for the third night across three
// different builds. The accusation is no longer the build's
// proportions: it is the LOOK's language at the small figure ('a
// severe style downgrade to a simple chibi aesthetic'; S006-Lin: 'a
// simplified 3D render rather than the 2D illustration of the
// sheet'). The proportion lever is SPENT.
//
// THE PROBE BEFORE THE PEN (probe-140-face.py + probe-140b-face.py,
// 10 real worker_run cuts on the drain's own assembled payload -
// probe140-cast.json regenerated fresh through the REAL lib
// functions):
//   S003 (Lin, CLOSEUP): a1-stand + the youth cuts f1-jaw/f2-eye/
//     f3-youth (REJECTED by the eye - the face already reads young;
//     softer/youthful moved the WRONG direction) + the male-statement
//     cuts m1-eye070 / m2-male (ANSWERED: the aperture shrinks to
//     the male floor, the brow ink reads - the face reads a stern
//     young MAN).
//   S004 (Wei, WIDE): a1-stand + the paint cuts p1-ramp (the flatter
//     WIDE row reads poster-crisp 2D illustration vs the standing
//     softness), p2-ink (the ink gain NOT WITNESSABLE at 1024 - CUT
//     AND REFUSED), p4-statement.
//
// THE LAW: (1) Lin's COMMITTED design advances r2 -> r3 (EXACTLY two
// dials: eyes.size 0.8 -> 0.70 - the male floor, the aperture;
// brows.thickness 1.25 -> 2.0 - the male ink ceiling; the dye
// language, hair, body, face shape byte-exact r2; the sheet art does
// NOT move - the designSheet rides the r2 turnaround; the design is
// DATA: the drain reads Character.designSpec per job). (2) The toon
// look's WIDE-END PAINT STATEMENT: STYLE_RAMP_BY_SHOT's WIDE row
// (0.50, 0.85, 0.025) -> (0.42, 0.78, 0.015) - the flatter, harder
// 2D-illustration band at the wide-end framings; TOON_LAW_VERSION
// 132 -> 133; the canon framings byte-exact; ESTABLISHING waits for
// its own receipt; the ink statement refused (the visibility bar).
// ANIME 125 / PRESENCE 108 stand (no build-law bump - the dials ride
// inside the standing resolve_spec clamps: 0.70 IS the male eye
// floor, 2.0 the brow ceiling).
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

const LIN_R2 = "public/designs/cmuq1s4i00007ppgsjqryw9r5/r2/dna.json";
const LIN_R3 = "public/designs/cmuq1s4i00007ppgsjqryw9r5/r3/dna.json";
const WEI_R3 = "public/designs/cmuqieinq000cpxz7lp5ohq41/r3/dna.json";

// ── 1. THE SOURCE LAW (the design history + the wiring + the pins) ──
function sourceLaw() {
  const r2 = JSON.parse(read(LIN_R2));
  const r3 = JSON.parse(read(LIN_R3));
  // the honest revision: EXACTLY two dials differ, everything else
  // byte-equal (the dye language, the hair, the body, the face shape)
  const diffs: string[] = [];
  (function walk(a: any, b: any, p: string) {
    if (a && b && typeof a === "object" && typeof b === "object") {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${p}.${k}`);
    } else if (a !== b) diffs.push(p);
  })(r2, r3, "");
  expect("Lin's r3 revision moves EXACTLY the two male-statement dials",
    diffs.length === 2
    && diffs.includes(".designSpec.eyes.size")
    && diffs.includes(".designSpec.brows.thickness"), diffs);
  expect("the r3 dials ride the probe's m2 receipt (eyes at the male floor 0.70, the brow at the ink ceiling 2.0)",
    r3.designSpec.eyes.size === 0.7 && r3.designSpec.brows.thickness === 2.0,
    { eyes: r3.designSpec.eyes.size, brows: r3.designSpec.brows.thickness });
  expect("the r2 dials are the standing truth the revision moves FROM (0.8 / 1.25)",
    r2.designSpec.eyes.size === 0.8 && r2.designSpec.brows.thickness === 1.25,
    { eyes: r2.designSpec.eyes.size, brows: r2.designSpec.brows.thickness });
  expect("the r3 dye language is untouched (the dye law stands)",
    JSON.stringify(r3.robeColor) === JSON.stringify(r2.robeColor)
      && JSON.stringify(r3.robeAccent) === JSON.stringify(r2.robeAccent)
      && JSON.stringify(r3.hairColor) === JSON.stringify(r2.hairColor), "the dyes");
  expect("the r3 body and face shape are byte-exact r2 (headScale 0.9, jawTaper 0.6 - the youth hypothesis rejected)",
    r3.designSpec.body.headScale === 0.9 && r3.designSpec.face.jawTaper === 0.6
      && JSON.stringify(r3.designSpec.body) === JSON.stringify(r2.designSpec.body)
      && JSON.stringify(r3.designSpec.face) === JSON.stringify(r2.designSpec.face), "the body/face");
  const wei = JSON.parse(read(WEI_R3));
  expect("Wei's r3 stands byte-exact (the 139 statement is not revisited)",
    wei.designSpec.body.headScale === 0.85 && wei.designSpec.hair.volume === 0.9
      && wei.designSpec.eyes.size === 0.7, "wei r3");
  const toon = read("bridges/blender/toon_pass.py");
  expect("the toon law advances 132 -> 133 (the wide-end paint statement)",
    toon.includes("TOON_LAW_VERSION = 133") && !toon.includes("TOON_LAW_VERSION = 132"), "the version");
  expect("the WIDE row rides the probe's p1 receipt (0.42, 0.78, 0.015)",
    toon.includes('"WIDE":            (0.42, 0.78, 0.015),'), "the row");
  expect("the canon framings byte-exact (CLOSEUP 0.62/1.00/0.040 - the earned close look is canon)",
    toon.includes('"CLOSEUP":         (0.62, 1.00, 0.040),'), "the canon");
  expect("MEDIUM and LOW_ANGLE byte-exact (the statement is the WIDE row alone)",
    toon.includes('"MEDIUM":          (0.58, 0.95, 0.035),')
      && toon.includes('"LOW_ANGLE":       (0.55, 0.92, 0.030),'), "the rows");
  expect("ESTABLISHING byte-exact (waits for its own receipt)",
    toon.includes('"ESTABLISHING":    (0.46, 0.80, 0.020),'), "the row");
  expect("the ink statement CUT AND REFUSED (HULL_INK_PX stands 1.4/2.2 - the visibility bar)",
    toon.includes('HULL_INK_PX = {"PREVIEW": 1.4, "FINAL": 2.2}')
      && toon.includes("CUT AND REFUSED"), "the refusal");
  const restore = read("scripts/night122-restore.ts");
  expect("the restore law wires Lin's r3 byte-exact (the sandbox-rebuild law advances)",
    restore.includes("cmuq1s4i00007ppgsjqryw9r5/r3/dna.json") && restore.includes("r3 is the 140 statement"), "the wiring");
  expect("the restore keeps BOTH sheets honest (the designSheets ride the r2 turnarounds)",
    restore.includes('sheet: "/designs/cmuq1s4i00007ppgsjqryw9r5/r2/turn_sheet.png"')
      && restore.includes('sheet: "/designs/cmuqieinq000cpxz7lp5ohq41/r2/turn_sheet.png"'), "the sheets");
  expect("the 139 gate's pins advanced legitimately (the 140 revision names them)",
    read("scripts/e2e-iter139-statement.ts").includes("the 140 statement revision advances this pin"), "the pin");
  const anime = read("bridges/blender/anime_character.py");
  const bridge = read("bridges/blender/animeos_bridge.py");
  expect("no build-law bump (ANIME 125 / PRESENCE 108 stand - the dials ride the standing clamps)",
    anime.includes("ANIME_LAW_VERSION = 125") && bridge.includes("PRESENCE_LAW_VERSION = 108"), "the versions");
  expect("the clamp law is the dials' own net (the male eye floor 0.70, the brow ceiling 2.0)",
    anime.includes('"size": _num(e0, "size", 0.92 if gender == "male" else 1.0, 0.7, 1.4)')
      && anime.includes('"thickness": _num(br0, "thickness", 1.25 if gender == "male" else 1.0, 0.5, 2.0),'), "the clamps");
  // the probe receipts on the ledger (the honest A/B the law serves)
  const p140 = JSON.parse(read("probe140-results.json"));
  const p140b = JSON.parse(read("probe140b-results.json"));
  expect("the probe's ledger carries the named cuts (a1-stand, f1..f3, p1/p2/p4 + w1-stand, m1/m2)",
    ["a1-stand", "f1-jaw", "f2-eye", "f3-youth", "p1-ramp", "p2-ink", "p4-statement"].every((t) => t in p140)
      && ["w1-stand", "m1-eye070", "m2-male"].every((t) => t in p140b),
    { p140: Object.keys(p140), p140b: Object.keys(p140b) });
}

// ── 2. THE REAL-MODULE UNIT TRUTH (plain python3, no bpy) ──
const PY_PROBE = `
import importlib.util, json, os, sys
ROOT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else sys.argv[-1]
AC = os.path.join(ROOT, "bridges", "blender", "anime_character.py")
spec = importlib.util.spec_from_file_location("ac", AC)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
lin_r3 = json.load(open(os.path.join(ROOT, "public/designs/cmuq1s4i00007ppgsjqryw9r5/r3/dna.json")))
lin_r2 = json.load(open(os.path.join(ROOT, "public/designs/cmuq1s4i00007ppgsjqryw9r5/r2/dna.json")))
wei_r3 = json.load(open(os.path.join(ROOT, "public/designs/cmuqieinq000cpxz7lp5ohq41/r3/dna.json")))
s3 = m.resolve_spec(lin_r3)
s2 = m.resolve_spec(lin_r2)
sw = m.resolve_spec(wei_r3)
# the clamp law: an out-of-floor design still clamps (the net stands)
below = m.resolve_spec({"designSpec": {"eyes": {"size": 0.2}, "brows": {"thickness": 9.0}}})
out = {
  "linR3": {"head": s3["body"]["headScale"], "eye": s3["eyes"]["size"],
            "brow": s3["brows"]["thickness"], "lash": s3["eyes"]["lashes"], "law": s3["lawVersion"]},
  "linR2": {"head": s2["body"]["headScale"], "eye": s2["eyes"]["size"], "brow": s2["brows"]["thickness"]},
  "weiR3": {"head": sw["body"]["headScale"], "hair": sw["hair"]["volume"], "eye": sw["eyes"]["size"]},
  "clamps": {"eye": below["eyes"]["size"], "brow": below["brows"]["thickness"]},
}
print("PROBE_JSON " + json.dumps(out))
`;

function moduleTruth() {
  const r = spawnSync("python3", ["-c", PY_PROBE, "--", ROOT], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0 || !r.stdout.includes("PROBE_JSON")) {
    expect("the real-module probe runs", false, { status: r.status, err: r.stderr?.slice(0, 300) });
    return;
  }
  const probe = JSON.parse(r.stdout.slice(r.stdout.indexOf("PROBE_JSON ") + "PROBE_JSON ".length).split("\n")[0]);
  expect("Lin's r3 answers the male statement from the REAL module (0.9 / 0.7 / 2.0)",
    probe.linR3.head === 0.9 && probe.linR3.eye === 0.7 && probe.linR3.brow === 2.0, probe.linR3);
  expect("Lin's r3 lash rides 0.5 (the male flick gate stands - the 134 law untouched)",
    probe.linR3.lash === 0.5, probe.linR3);
  expect("Lin's r2 answers the old dials (the spec's own 1.25 - the male 1.55 floor lives in the paint_brow draw, the 134 law)",
    probe.linR2.head === 0.9 && probe.linR2.eye === 0.8 && probe.linR2.brow === 1.25, probe.linR2);
  expect("Wei's r3 answers the 139 dials (0.85 / 0.9 / 0.7 - byte-exact)",
    probe.weiR3.head === 0.85 && probe.weiR3.hair === 0.9 && probe.weiR3.eye === 0.7, probe.weiR3);
  expect("the clamp law holds (0.2 eye clamps to the 0.70 floor, 9.0 brow to the 2.0 ceiling)",
    probe.clamps.eye === 0.7 && probe.clamps.brow === 2.0, probe.clamps);
  expect("ANIME 125 answers from the real module (no law bump)",
    probe.linR3.law === 125, probe.linR3.law);
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
  expect("Lin's DB design carries the r3 dials",
    linSpec?.body?.headScale === 0.9 && linSpec?.eyes?.size === 0.7 && linSpec?.brows?.thickness === 2.0, linSpec);
  expect("Wei's DB design carries the r3 dials (the 139 statement stands)",
    weiSpec?.body?.headScale === 0.85 && weiSpec?.hair?.volume === 0.9 && weiSpec?.eyes?.size === 0.7, weiSpec);
  expect("Lin's designSheet points at the r2 turnaround (the art did not change)",
    lin.designSheetUrl === "/designs/cmuq1s4i00007ppgsjqryw9r5/r2/turn_sheet.png", lin.designSheetUrl);
  expect("Wei's designSheet points at the r2 turnaround (the art did not change)",
    wei.designSheetUrl === "/designs/cmuqieinq000cpxz7lp5ohq41/r2/turn_sheet.png", wei.designSheetUrl);
}

// ── 4. THE DRAIN'S OWN ASSEMBLY (the REAL lib functions) ──
function drainAssembly() {
  const regen = spawnSync("npx", ["tsx", "scripts/probe-140-cast.ts"], {
    cwd: ROOT, encoding: "utf8", timeout: 300_000,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "file:/home/z/my-project/db/custom.db" },
  });
  expect("the cast ledger regenerates from the DB (probe-140-cast.ts)",
    regen.status === 0 && fs.existsSync(path.join(ROOT, "probe140-cast.json")),
    regen.stderr?.slice(-300) || regen.stdout?.slice(-200));
  const cast = JSON.parse(read("probe140-cast.json"));
  const s3 = cast.S003?.cast?.[0];
  expect("S003's solo cast is Lin and carries the r3 dials through the drain's own assembly",
    s3?.name === "Lin Yue"
      && (s3?.designSpec as any)?.body?.headScale === 0.9
      && (s3?.designSpec as any)?.eyes?.size === 0.7
      && (s3?.designSpec as any)?.brows?.thickness === 2.0,
    { name: s3?.name, spec: s3?.designSpec });
  const s4 = cast.S004?.cast?.[0];
  expect("S004's solo cast is Wei and carries the r3 dials (the 139 statement stands)",
    s4?.name === "Demon Lord Wei"
      && (s4?.designSpec as any)?.body?.headScale === 0.85
      && (s4?.designSpec as any)?.hair?.volume === 0.9
      && (s4?.designSpec as any)?.eyes?.size === 0.7,
    { name: s4?.name, spec: s4?.designSpec });
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

# the module answers (the paint statement's own witness)
ok("style_ramp_for CLOSEUP answers the canon row (the earned close look byte-exact)",
   tp.style_ramp_for("CLOSEUP") == (0.62, 1.00, 0.040), tp.style_ramp_for("CLOSEUP"))
ok("style_ramp_for WIDE answers the 140 statement row (0.42, 0.78, 0.015)",
   tp.style_ramp_for("WIDE") == (0.42, 0.78, 0.015), tp.style_ramp_for("WIDE"))
ok("the toon law rides 133 (the paint statement is lawed)",
   tp.TOON_LAW_VERSION == 133, tp.TOON_LAW_VERSION)
ok("the ink refusal stands (HULL_INK_PX 1.4/2.2)",
   tp.HULL_INK_PX.get("PREVIEW") == 1.4 and tp.HULL_INK_PX.get("FINAL") == 2.2, tp.HULL_INK_PX)

CAST = json.load(open(os.path.join(ROOT, "probe140-cast.json")))
S003 = dict(CAST["S003"])
S004 = dict(CAST["S004"])
SCENE = dict(CAST["scene"])
SCENE["number"] = 1
SCENE["title"] = "e140"

# the S003 closeup cut: Lin's r3 rides the REAL worker_run (the male
# statement in production - the eye's own witness)
out_dir = tempfile.mkdtemp(prefix="e140-s3-")
job = os.path.join(out_dir, "job.json")
shot = dict(S003)
shot["duration"] = 0.5
payload = {"shot": shot,
           "scene": SCENE,
           "project": {"title": "e140", "visualStyle": "DONGHUA",
                       "resolution": "1920x1080", "fps": 2},
           "mode": "PREVIEW"}
json.dump({"jobId": "e140-s003-close", "payload": payload, "outDir": out_dir}, open(job, "w"))
m.worker_run(job)
st = json.load(open(job))
ev = st.get("render") or {}
presence = ev.get("presence") or {}
mp4 = st.get("mp4Path")
ok("Lin's r3 cut lands a real clip at the CLOSEUP", bool(mp4) and os.path.exists(mp4), mp4)
ok("the closeup solve rides 108 (lens 85, the face-filling framing the cell names)",
   presence.get("lawVersion") == 108 and presence.get("lens") == 85, presence)
ok("the closeup canon ramp rode (style_ramp_for CLOSEUP untouched by the wide statement)",
   tp.style_ramp_for("CLOSEUP") == (0.62, 1.00, 0.040), "the canon")

# the S004 wide cut: the 133 look rides the REAL worker_run
out_dir2 = tempfile.mkdtemp(prefix="e140-s4-")
job2 = os.path.join(out_dir2, "job.json")
shot2 = dict(S004)
shot2["duration"] = 0.5
payload2 = {"shot": shot2,
            "scene": SCENE,
            "project": {"title": "e140", "visualStyle": "DONGHUA",
                        "resolution": "1920x1080", "fps": 2},
            "mode": "PREVIEW"}
json.dump({"jobId": "e140-s004-wide", "payload": payload2, "outDir": out_dir2}, open(job2, "w"))
m.worker_run(job2)
st2 = json.load(open(job2))
ev2 = st2.get("render") or {}
look2 = ev2.get("look") or {}
mp42 = st2.get("mp4Path")
ok("the 133 cut lands a real clip at the WIDE", bool(mp42) and os.path.exists(mp42), mp42)
ok("the toon law rides 133 in the render state (the statement is IN the frame)",
   look2.get("lawVersion") == 133, look2.get("lawVersion"))

print("PROBE_FAILS " + json.dumps(fails))
`;

function blenderTruth() {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e140-"));
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

// ── 6. THE NIGHT TOOL (the 140 runner rides the 122 ops law) ──
function nightTool() {
  const night = read("scripts/detached-night140.mjs");
  expect("the 140 night detaches double-forked with the explicit DATABASE_URL, hull ink, median of 3",
    night.includes('DATABASE_URL: process.env.DATABASE_URL_OVERRIDE || "file:/home/z/my-project/db/custom.db"')
      && night.includes('ANIMEOS_INK: "hull"') && night.includes('ANIMEOS_SCORE_SAMPLES: "3"')
      && night.includes("child.unref()") && night.includes("mid.unref()"), "the env");
  expect("the 140 night drives the same tick the UI drives (reset | drain | rescore)",
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
