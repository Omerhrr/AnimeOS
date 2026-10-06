// THE DETACHED PROBE 136 (the 135 pattern): the boldness series runs
// detached so a tool interruption never kills a cut; the log and pid
// land beside the probe; every finished cut persists in
// probe136-results.json and a restart resumes from there.
//
// Usage: node scripts/detached-probe136.mjs [cut,cut,...]
import { spawn } from "node:child_process";
import { writeFileSync, existsSync, readFileSync, appendFileSync, openSync } from "node:fs";

const ROOT = process.cwd();
const LOG = "/home/z/my-project/inspect/probe136-run.log";
const PID = "/home/z/my-project/inspect/probe136-run.pid";

const only = process.argv[2] ?? "";
const env = {
  ...process.env,
  BLENDER: process.env.BLENDER ?? "/home/z/blender-5.2.2-linux-x64/blender",
  PROBE_OUT: process.env.PROBE_OUT ?? "/home/z/my-project/inspect/probe136",
  ...(only ? { PROBE_CUTS: only } : {}),
};

if (!existsSync("/home/z/my-project/inspect")) {
  console.error("inspect dir missing - create it first");
  process.exit(1);
}

const out = openSync(LOG, "a");
const child = spawn("python3", ["scripts/probe-136-boldness.py"], {
  cwd: ROOT,
  env,
  detached: true,
  stdio: ["ignore", out, out],
});
child.unref();
writeFileSync(PID, String(child.pid));
appendFileSync(LOG, `\n=== detached probe136 pid ${child.pid} started ${new Date().toISOString()} cuts=${only || "all"} ===\n`);
console.log(`detached probe136 pid ${child.pid} -> ${LOG}`);
