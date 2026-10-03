// THE 123 PIXEL PROOF: re-render ONE standing-production shot through
// the real worker at the new laws (preview cap 640, face boxes on the
// marks, the drawn nose, the anatomized proxy), then read the face
// boxes out of the job file. The strip build runs in tsx afterwards.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = "/home/z/my-project/AnimeOS";
const BLENDER = "/home/z/blender-5.2.2-linux-x64/blender";
const SRC_JOB = path.join(ROOT, "public", "renders", ".job-cmus8ftmq002zpwbly9ihzlpn.json");

const job = JSON.parse(fs.readFileSync(SRC_JOB, "utf8"));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "iter123-"));
const jobFile = path.join(outDir, "job.json");
fs.writeFileSync(jobFile, JSON.stringify({ jobId: "iter123-proof", payload: job.payload, outDir }));

const runner = [
  "import importlib.util,sys",
  "spec=importlib.util.spec_from_file_location('b', sys.argv[-2]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  "m.worker_run(sys.argv[-1])",
].join("\n");
const runnerFile = path.join(outDir, "runner.py");
fs.writeFileSync(runnerFile, runner);

console.log("[proof] rendering shot", job.payload?.shot?.shotType, "duration", job.payload?.shot?.duration, "->", outDir);
const t0 = Date.now();
const r = spawnSync(BLENDER, ["-b", "--factory-startup", "-P", runnerFile, "--", path.join(ROOT, "bridges", "blender", "animeos_bridge.py"), jobFile], {
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 40 * 60 * 1000,
  env: { ...process.env, ANIMEOS_INK: "hull" },
});
console.log("[proof] blender exit", r.status, "in", Math.round((Date.now() - t0) / 1000), "s");
if (r.stderr) console.log("[proof] stderr tail:", r.stderr.slice(-400));

const st = JSON.parse(fs.readFileSync(jobFile, "utf8"));
const fb = st?.state?.render?.faceBoxes;
console.log("[proof] figureSource:", st?.state?.figureSource);
console.log("[proof] mp4:", st?.mp4Path, fs.existsSync(st?.mp4Path || "") ? "EXISTS" : "MISSING");
console.log("[proof] faceBoxes:", JSON.stringify(fb));
const look = st?.state?.render?.look || {};
console.log("[proof] look:", JSON.stringify({ look: look.look, lawVersion: look.lawVersion, inkOffset: look.inkOffset }));
const fp = st?.state?.render?.facePaint || {};
console.log("[proof] facePaint:", JSON.stringify({ staged: fp.staged, scale: fp.scale, strengthPushed: fp.strengthPushed }));
