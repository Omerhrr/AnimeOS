// NIGHT 205 RUNNER - the fourteenth drift's re-arm, with the
// completion's missing step restored (the 204 seam, taught).
//
// The 204 arm was restore -> HARD gate -> complete; but the wipe
// had taken the night-203 clips with the sandbox, and the
// completion's RENDER source needs FINISHED clips on disk
// (renderPosterForShot returns null without a RenderJob). THE SEAM:
// the arm had no drain. This runner carries the whole ladder:
//   drain    - the 6/6 real Blender re-drain (door-free; the build
//              rides the COMMITTED r3 designSpecs - the render
//              assembly tolerates absent sheet DNA, adherentDna
//              receives null and the spec rides on top)
//   restore  - the 122 idempotent restore (anchored sheets skip;
//              the image channel's 429s refuse honestly; the
//              COMMITTED designs re-wire byte-exact every pass)
//   complete - the 203 completion (the refused four, S003-S006,
//              the arc upsert keyed shotId+source+night - re-runs
//              are safe, no duplicates, ANIMEOS_NIGHT_TAG=night-203)
// The watcher (watch205.mjs, untracked) rides the cycle: restore
// every 10 min while the door refuses; when the door breathes AND
// the drain is 6/6: the HARD gate then the completion.
// Usage: node scripts/detached-night205.mjs drain|restore|complete
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const phase = process.argv[2] ?? "drain";
const OUT = `${CWD}/night205-${phase}.log`;
const TARGETS = {
  drain: "scripts/night111-run.ts",
  restore: "scripts/night122-restore.ts",
  complete: "scripts/night203-complete.ts",
};
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
      DATABASE_URL: process.env.DATABASE_URL_OVERRIDE || "file:/home/z/my-project/db/custom.db",
      // THE LEDGER IDENTITY: the completion completes night-203 (the
      // upsert key; the four refused rows belong to that night) - the
      // drain appends nothing, the tag rides harmless
      ANIMEOS_NIGHT_TAG: "night-203",
      ANIMEOS_INK: "hull",
      ANIMEOS_SCORE_SAMPLES: "3",
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/night205-${phase}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, phase, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log(`detached: night 205 ${phase} launching (${target}), log -> night205-${phase}.log`);
