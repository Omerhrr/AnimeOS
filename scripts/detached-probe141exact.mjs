// Detached probe 141b runner (the double-fork detach law).
import { spawn } from "node:child_process";
import fs from "node:fs";
const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/probe141exact-run.log`;
if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} probe141exact ----\n`);
  const child = spawn("python3", ["scripts/probe-141f-exact.py"], {
    cwd: CWD, detached: true, stdio: ["ignore", out, out],
    env: { ...process.env, BLENDER: "/home/z/blender-5.2.2-linux-x64/blender", DATABASE_URL: "file:/home/z/my-project/db/custom.db" },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/probe141exact.pid`, String(child.pid));
  process.exit(0);
}
const mid = spawn(process.execPath, [import.meta.filename, "--child"], { cwd: CWD, detached: true, stdio: "ignore" });
mid.unref();
console.log("detached: probe141exact launching, log -> probe141exact-run.log");
