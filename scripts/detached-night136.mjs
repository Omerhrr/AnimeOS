// Detached night 136 runner (the tool session reaps children -
// double-fork detach is the law). Logs to night136-<phase>.log.
// Phases: reset (delete the scene's jobs/clips + RENDER scores) |
// drain (6/6 real Blender clips at the 136 laws - TOON_LAW_VERSION
// 132, the trim's own boldness rung; the pool restarts per the law -
// kill the resident worker, the spawner respawns fresh on the new
// code) | rescore (median of 3, both strips ride when the render
// carries boxes).
// Usage: node scripts/detached-night136.mjs reset|drain|rescore
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const phase = process.argv[2] ?? "drain";
const OUT = `${CWD}/night136-${phase}.log`;
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
      // THE STANDING DB PATH (the sandbox's own .env law): the
      // container-level DATABASE_URL points here - the driver honors
      // an explicit override so every phase rides the same file
      DATABASE_URL: process.env.DATABASE_URL_OVERRIDE || "file:/home/z/my-project/db/custom.db",
      ANIMEOS_INK: "hull",
      ANIMEOS_SCORE_SAMPLES: "3",
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/night136-${phase}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, phase, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log(`detached: night 136 ${phase} launching (${target}), log -> night136-${phase}.log`);
