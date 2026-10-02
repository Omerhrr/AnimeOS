// Detached night 117 runner (the tool session reaps children -
// double-fork detach is the law). Logs to night117-<phase>.log.
// Usage: node scripts/detached-night117.mjs drain|rescore
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const phase = process.argv[2] ?? "drain";
const OUT = `${CWD}/night117-${phase}.log`;
const TARGETS = { drain: "scripts/night111-run.ts", rescore: "scripts/night111-rescore.ts" };
const target = TARGETS[phase];
if (!target) { console.error(`unknown phase: ${phase}`); process.exit(1); }

if (process.argv[3] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} phase ${phase} -> ${target} ----\n`);
  const child = spawn("npx", ["tsx", target], {
    cwd: CWD,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      DATABASE_URL: "file:/home/z/my-project/AnimeOS/db/custom.db",
      ANIMEOS_INK: "hull",
      ANIMEOS_SCORE_SAMPLES: "3",
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/night117-${phase}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, phase, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log(`detached: night 117 ${phase} launching (${target}), log -> night117-${phase}.log`);
