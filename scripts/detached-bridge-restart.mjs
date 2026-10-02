// Detached resident-bridge restart (the tool session reaps children -
// the double-fork detach is the law). A RESIDENT RESTART IS PART OF
// EVERY LAW CHANGE - the pool worker serves stale modules otherwise.
// Logs to bridge-resident.log in the repo root.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/bridge-resident.log`;
const BLENDER = "/home/z/blender-5.2.2-linux-x64/blender";

if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} resident restart on current code ----\n`);
  const child = spawn(BLENDER, ["-b", "-P", `${CWD}/bridges/blender/animeos_bridge.py`, "--", "--port", "8101", "--pool", "1"], {
    cwd: CWD,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      DATABASE_URL: "file:/home/z/my-project/AnimeOS/db/custom.db",
      ANIMEOS_RENDER_WORKERS: "1",
      ANIMEOS_BRIDGE_WORKERS: "1",
      ANIMEOS_INK: "hull",
      ANIMEOS_BLENDER_BIN: BLENDER,
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/bridge-resident.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log("detached: resident bridge restarting on current code, log -> bridge-resident.log");
