// Generic double-fork detached ops runner (the tool session reaps
// single-fork children - the detached-night law, complete). The child
// runs ONE long command detached with its log at <name>.log and its
// pid at <name>.pid.
// Usage: node scripts/detached-ops.mjs <name> -- <command> [args...]
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";

const name = process.argv[2];
const sep = process.argv.indexOf("--");
const cmd = process.argv.slice(sep + 1);
if (!name || sep === -1 || cmd.length === 0) {
  console.error("usage: node scripts/detached-ops.mjs <name> -- <command> [args...]");
  process.exit(1);
}
const OUT = `${CWD}/${name}.log`;

if (process.argv[3] === "--child") {
  const out = fs.openSync(OUT, "a");
  fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} ${name}: ${cmd.join(" ")} ----\n`);
  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: CWD,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env },
  });
  child.unref();
  fs.writeFileSync(`${CWD}/${name}.pid`, String(child.pid));
  process.exit(0);
}

const mid = spawn(process.execPath, [import.meta.filename, name, "--child", "--", ...cmd], {
  cwd: CWD,
  detached: true,
  stdio: "ignore",
});
mid.unref();
console.log(`detached: ${name} launching (${cmd.join(" ")}), log -> ${name}.log`);
