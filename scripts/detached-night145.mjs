// Detached night 145 runner (the tool session reaps children -
// double-fork detach is the law). Logs to night145-<phase>.log.
// Phases: reset (delete the scene's jobs/clips + RENDER scores -
// the arc ledger is NEVER touched, the 142 survival law) |
// drain (6/6 real Blender clips at the standing laws - the wide
// rung ladder: ESTABLISHING + WIDE preview at 1024, the tight
// framings keep 640, FINAL 1280; ANIME 125, TOON 133, PRESENCE
// 108 - the cohort a125/t133/p108 rides unchanged) | rescore
// (median of 3; the verdict APPENDS to the arc ledger tagged
// ANIMEOS_NIGHT_TAG=night-145 - the SECOND night on the durable
// receipt ledger: the first two-night median settles, the verdict
// loses its PROVISIONAL flag; the sweep row is overwritten, the
// arc remembers).
// Usage: node scripts/detached-night145.mjs reset|drain|rescore
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const phase = process.argv[2] ?? "drain";
const OUT = `${CWD}/night145-${phase}.log`;
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
      // THE NIGHT TAG (iteration 145): the arc append reads this -
      // without it the default tag is the calendar date; the ledger's
      // night identity is the iteration, not the wall clock
      ANIMEOS_NIGHT_TAG: "night-145",
      ANIMEOS_INK: "hull",
      ANIMEOS_SCORE_SAMPLES: "3",
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/night145-${phase}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, phase, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log(`detached: night 145 ${phase} launching (${target}), log -> night145-${phase}.log`);
