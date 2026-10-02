// Detached night 115 runner (the tool session reaps children -
// double-fork detach is the law). Logs to night115.log.
// Usage: node scripts/detached-night115.mjs crew|drain
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const phase = process.argv[2] ?? "crew";
const OUT = `${CWD}/night115-${phase}.log`;
const TARGETS = { crew: "scripts/night115-crew-wei.ts", drain: "scripts/night111-run.ts", rescore: "scripts/night111-rescore.ts" };
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
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/night115-${phase}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, phase, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log(`detached: night 115 ${phase} launching (${target}), log -> night115-${phase}.log`);
