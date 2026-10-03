// Generic detached runner (the tool session reaps children -
// double-fork detach is the law). Usage:
//   node scripts/detached-run.mjs <log-name> <target-script> [extra env as K=V ...]
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const name = process.argv[2];
const target = process.argv[3];
const extraEnv = {};
for (const kv of process.argv.slice(4)) {
  const i = kv.indexOf("=");
  if (i > 0) extraEnv[kv.slice(0, i)] = kv.slice(i + 1);
}
if (!name || !target) { console.error("usage: detached-run.mjs <log-name> <script> [K=V ...]"); process.exit(1); }

const OUT = `${CWD}/${name}.log`;

if (process.argv[2] === "--child") { /* unreachable guard */ }

if (process.env.DETACHED_CHILD === "1") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} -> ${target} ----\n`);
  const child = spawn("npx", ["tsx", target], {
    cwd: CWD,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      DATABASE_URL: "file:/home/z/my-project/AnimeOS/db/custom.db",
      ...extraEnv,
    },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/${name}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, name, target, ...process.argv.slice(4)], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
  env: { ...process.env, DETACHED_CHILD: "1" },
});
mid.unref();
console.log(`detached: ${target} launching, log -> ${name}.log`);
