// Detached probe 141 runner (the tool session reaps children -
// double-fork detach is the law). Runs the bisect ladder
// scripts/probe-141-dye.py under Blender. Log: probe141-run.log.
// Usage: node scripts/detached-probe141.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/probe141-run.log`;

if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} probe141 -> scripts/probe-141-dye.py ----\n`);
  const child = spawn("python3", ["scripts/probe-141-dye.py"], {
    cwd: CWD,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      BLENDER: "/home/z/blender-5.2.2-linux-x64/blender",
      DATABASE_URL: "file:/home/z/my-project/db/custom.db",
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/probe141.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log("detached: probe141 launching (scripts/probe-141-dye.py), log -> probe141-run.log");
