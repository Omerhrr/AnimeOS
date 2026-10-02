// Detached night 120 runner (the tool session reaps children -
// double-fork detach is the law). Logs to night120-<phase>.log.
// Phases: reset (delete the scene's jobs/clips + RENDER scores) |
// drain (6/6 real Blender clips) | rescore (median of 3).
// Usage: node scripts/detached-night120.mjs reset|drain|rescore
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const phase = process.argv[2] ?? "drain";
const OUT = `${CWD}/night120-${phase}.log`;
const TARGETS = { reset: "scripts/reset-sc12-renders.ts", drain: "scripts/night111-run.ts", rescore: "scripts/night111-rescore.ts" };
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
  fs.writeFileSync(`${CWD}/night120-${phase}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, phase, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log(`detached: night 120 ${phase} launching (${target}), log -> night120-${phase}.log`);
