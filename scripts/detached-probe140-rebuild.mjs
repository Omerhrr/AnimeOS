// Detached probe 140 rebuild runner (the double-fork detach law) -
// the sandbox wipe took the untracked probe ledger; the 140 gate
// reads its receipts, so the probe re-runs honestly (the resume law).
import { spawn } from "node:child_process";
import fs from "node:fs";
const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/probe140-rebuild.log`;
if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} probe140 rebuild ----\n`);
  const child = spawn("python3", ["scripts/probe-140-face.py"], {
    cwd: CWD, detached: true, stdio: ["ignore", out, out],
    env: { ...process.env, BLENDER: "/home/z/blender-5.2.2-linux-x64/blender", DATABASE_URL: "file:/home/z/my-project/db/custom.db",
           PROBE_OUT: "/home/z/my-project/inspect/probe140" },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/probe140-rebuild.pid`, String(child.pid));
  process.exit(0);
}
const mid = spawn(process.execPath, [import.meta.filename, "--child"], { cwd: CWD, detached: true, stdio: "ignore" });
mid.unref();
console.log("detached: probe140 rebuild launching, log -> probe140-rebuild.log");
