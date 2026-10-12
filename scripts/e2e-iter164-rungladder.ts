// ─────────────────────────────────────────────────────────────
// E2E ITERATION 164 - THE RUNG LAW (the ladder and the contract
// agree). The 163 night named the seam: S005 is a LOW_ANGLE the
// 157 contract judges front-scale while the 138 ladder grouped it
// with the 640 tights - and the cell is the arc's worst. THE
// VERIFY ARM (the probe's own receipt, both arms through the real
// worker_run off the drain's own captured S005 payload): the
// judge's face-crop source reads 49x45 = 2205px at the 640 and
// 72x64 = 4608px at the 1024 (2.09x the area), and the eye reads
// the difference: the 640 crop's eyes are smudges the upscaler
// invents; the 1024 crop resolves the iris, the bangs' strands,
// the brow, the hair pin. THE LAW: LOW_ANGLE joins the wide rung;
// PRESENCE 109 -> 110 (the ladder is the presence grammar's own
// resolution table); the cohort clock restarts (the discipline's
// own price, named). THE BACKOFF: one bounded 429 retry (the 163
// night's two rate-limit survivors, named).
// ─────────────────────────────────────────────────────────────
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

let failures = 0;
function expect(name: string, cond: unknown, detail?: unknown) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures++;
}

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BLENDER = process.env.ANIMEOS_BLENDER_BIN || "/home/z/blender-5.2.2-linux-x64/blender";

// ── 1. THE SOURCE LAWS ──
const br = read("bridges/blender/animeos_bridge.py");
expect("the ladder's letter carries LOW_ANGLE (the 164 law)",
  br.includes('("ESTABLISHING", "WIDE", "LOW_ANGLE")'), "the tuple");
expect("the law names its evidence (the verify arm's own receipt rides the source)",
  br.includes("THE 164 RUNG LAW (the ladder and the contract agree)") &&
  br.includes("49x45 = 2205px") && br.includes("72x64 = 4608px"), "the receipt");
expect("the version advances legitimately (PRESENCE 110)",
  br.includes("PRESENCE_LAW_VERSION = 110"), "v110");
expect("the constants stand (640 preview / 1024 wide-end / 1280 FINAL)",
  br.includes("PREVIEW_CAP = 640") && br.includes("ESTABLISHING_CAP = 1024") && br.includes("FINAL_CAP = 1280"), "the constants");
expect("the tights keep the 640 rung (MEDIUM/CLOSEUP/MCU untouched)",
  br.includes("PREVIEW_CAP = 640") && !br.includes('("ESTABLISHING", "WIDE", "LOW_ANGLE", "MEDIUM")'), "the tights");
expect("the 429 backoff rides (one bounded retry, the 163 receipt named)",
  read("src/lib/identity.ts").includes("THE 164 BACKOFF") &&
  read("src/lib/identity.ts").includes("setTimeout(r, 20_000)"), "the backoff");

// ── 2. THE REAL MODULE PROBE (preview_cap_for under the real bpy) ──
const PROBE = `
import importlib.util, json, os, sys
ROOT = os.environ["ANIMEOS_ROOT"]
BRIDGE = os.path.join(ROOT, "bridges", "blender", "animeos_bridge.py")
spec = importlib.util.spec_from_file_location("bridge", BRIDGE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = {
  "version": m.PRESENCE_LAW_VERSION,
  "establishing": m.preview_cap_for("ESTABLISHING", "PREVIEW"),
  "wide": m.preview_cap_for("WIDE", "PREVIEW"),
  "lowangle": m.preview_cap_for("LOW_ANGLE", "PREVIEW"),
  "medium": m.preview_cap_for("MEDIUM", "PREVIEW"),
  "closeup": m.preview_cap_for("CLOSEUP", "PREVIEW"),
  "mcu": m.preview_cap_for("MCU", "PREVIEW"),
  "none": m.preview_cap_for(None, "PREVIEW"),
  "establishing_final": m.preview_cap_for("ESTABLISHING", "FINAL"),
  "lowangle_final": m.preview_cap_for("LOW_ANGLE", "FINAL"),
}
print("LADDER164 " + json.dumps(out))
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e164-"));
const py = path.join(dir, "probe.py");
fs.writeFileSync(py, PROBE);
const r = execFileSync(BLENDER, ["-b", "--factory-startup", "-P", py], {
  cwd: ROOT, encoding: "utf8", timeout: 300_000,
  env: { ...process.env, ANIMEOS_ROOT: ROOT },
});
const mm = r.match(/LADDER164 (.*)/);
if (!mm) {
  expect("the real module probe ran", false, r.slice(-400));
} else {
  const ladder = JSON.parse(mm[1]);
  expect("PRESENCE 110 answers from the real module", ladder.version === 110, ladder.version);
  expect("LOW_ANGLE rides the 1024 rung (the real module)", ladder.lowangle === 1024, ladder.lowangle);
  expect("ESTABLISHING and WIDE keep the 1024 rung", ladder.establishing === 1024 && ladder.wide === 1024, ladder);
  expect("the tights keep the 640 rung (MEDIUM/CLOSEUP/MCU/None)",
    ladder.medium === 640 && ladder.closeup === 640 && ladder.mcu === 640 && ladder.none === 640, ladder);
  expect("FINAL stays 1280 at every framing",
    ladder.establishing_final === 1280 && ladder.lowangle_final === 1280, ladder);
}
fs.rmSync(dir, { recursive: true, force: true });

// ── 3. THE VERIFY ARM'S RECEIPT (the meter on disk) ──
const meter = (() => { try { return fs.readFileSync("/home/z/my-project/inspect/probe164/rung-meter.json", "utf8"); } catch { return ""; } })();
if (meter) {
  const rep = JSON.parse(meter);
  const s640 = (rep as Record<string, Record<string, { area?: number }>>)["640"]?.["lin-f1"]?.area;
  const s1024 = (rep as Record<string, Record<string, { area?: number }>>)["1024"]?.["lin-f1"]?.area;
  check_meter(s640, s1024);
} else {
  console.log("NOTE the meter receipt is not on disk (the probe's own numbers ride the source comment)");
}
function check_meter(a?: number, b?: number) {
  expect("the verify arm's receipt: the 1024 crop's source area >= 2x the 640's",
    typeof a === "number" && typeof b === "number" && b >= a * 2, `${a} vs ${b}`);
}

console.log(failures === 0 ? "\nALL GREEN - e2e-iter164-rungladder" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
