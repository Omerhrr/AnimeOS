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
    env: { ...process.env, DATABASE_URL: "file:/home/z/my-project/AnimeOS/db/custom.db" },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/watch223.pid`, String(child.pid));
  console.log(`watch generation ${generation} detached: pid ${child.pid}, log ${OUT}`);
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, hours, waitMs, generation, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
