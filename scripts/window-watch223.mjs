// Window watch 223 detach wrapper (the tool session reaps children -
// double-fork detach is the law, the detached-night129 shape). Logs
// to watch223.log, pid to watch223.pid. The tsx watch refuses a
// double-ride by its own lock (receipts/watch223.lock). THE STANDING
// WATCH (the 224 law): the generation rides through - an expired
// generation spawns the next via this same wrapper (the chain).
// Usage: node scripts/window-watch223.mjs [watchHours] [waitMs] [generation]
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const hours = process.argv[2] ?? "8";
const waitMs = process.argv[3] ?? "600000";
const generation = process.argv[4] ?? "1";
const OUT = `${CWD}/watch223.log`;
const TARGET = "scripts/window-watch223.ts";

if (process.argv[5] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} watch generation ${generation} (${hours}h, wait ${waitMs}ms) -> ${TARGET} ----\n`);
  const child = spawn("npx", ["tsx", TARGET, hours, waitMs, generation], {
    cwd: CWD,
    detached: true,
    stdio: ["ignore", out, out],
    // THE 228 UNIFICATION: ONE database path is the law. The rebuild's
    // .env names the PARENT path (/home/z/my-project/db/custom.db - the
    // path that survives the rebuild's rm -rf, the 225 law's own
    // reason); the wrapper's old APP path made the watch's children
    // ride a DIFFERENT database than every direct tsx run - the
    // split-brain never manifested only because the wall kept the
    // legs un-ridden. One path, every rider.
    env: { ...process.env, DATABASE_URL: "file:/home/z/my-project/db/custom.db" },
  });
  child.unref();
  // THE 226 LAW: the pid file carries its generation (the arrival
  // eye reads it - no more inferring the riding generation). Plain
  // pid files (the pre-226 shape) stay readable: session-open.ts's
  // parsePidFile takes both.
  fs.writeFileSync(`${CWD}/watch223.pid`, JSON.stringify({ pid: child.pid, generation: Number(generation) || 1, startedAt: new Date().toISOString() }));
  console.log(`watch generation ${generation} detached: pid ${child.pid}, log ${OUT}`);
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, hours, waitMs, generation, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
