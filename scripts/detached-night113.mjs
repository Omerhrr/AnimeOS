// Detached night driver runner (the tool session reaps children -
// double-fork detach is the law). Logs to night113.log.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/night113.log`;

if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  const child = spawn("npx", ["tsx", "scripts/night111-run.ts"], {
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
  fs.writeFileSync(`${CWD}/night113.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log("detached: night 113 driver launching, log -> night113.log");
