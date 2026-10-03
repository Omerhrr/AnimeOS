// Detached dev-server runner (the tool session reaps children -
// double-fork detach is the law). Logs to dev-server.log.
// Usage: node scripts/detached-devserver.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/dev-server.log`;

if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} dev server launch ----\n`);
  const child = spawn("./node_modules/.bin/next", ["dev", "-p", "3000"], {
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
  fs.writeFileSync(`${CWD}/dev-server.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log("detached: dev server launching, log -> dev-server.log");
