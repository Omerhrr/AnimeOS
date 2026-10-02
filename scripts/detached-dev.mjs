// Start the dev server fully detached (double-fork detach law: the
// platform tool-session reaps background children it can still see).
// Usage: node scripts/detached-dev.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/dev.out.log`;

// grandchild: the actual server (session leader, detached stdio)
if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  const child = spawn("./node_modules/.bin/next", ["dev", "-p", "3000"], {
    cwd: CWD,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      DATABASE_URL: "file:/home/z/my-project/AnimeOS/db/custom.db",
      ANIMEOS_RENDER_WORKERS: "1",
      ANIMEOS_BRIDGE_WORKERS: "1",
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/dev.pid`, String(child.pid));
  process.exit(0);
}

// middle: fork the grandchild detached, then exit (orphaning it to init)
const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log("detached: dev server launching, log -> dev.out.log");
