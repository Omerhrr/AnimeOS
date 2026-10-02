// Detached re-score runner (the tool session reaps children -
// double-fork detach is the law). Logs to rescore114.log.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/rescore114.log`;

if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  const child = spawn("npx", ["tsx", "scripts/night111-rescore.ts"], {
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
  fs.writeFileSync(`${CWD}/rescore114.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log("detached: re-score 114 launching, log -> rescore114.log");
