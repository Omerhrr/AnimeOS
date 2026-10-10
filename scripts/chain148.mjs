// CHAIN 148 - the drain->rescore watcher (the resume law re-creates
// this untracked watcher every box). Watches night148-drain.log for
// the drain's completion line (NIGHT RESULT 6/6), then chains the
// rescore phase automatically - no polling gaps, the night never
// sits half-done because a tool call expired.
// 30s x 240 = 2h cap, then it gives up and says so.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const LOG = `${CWD}/night148-drain.log`;
const MARKER = `${CWD}/chain148.done`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const t0 = Date.now();
  while (Date.now() - t0 < 120 * 60 * 1000) {
    let txt = "";
    try { txt = fs.readFileSync(LOG, "utf8"); } catch { await sleep(30_000); continue; }
    if (/NIGHT RESULT 6\/6/.test(txt)) {
      console.log(`CHAIN: drain complete at ${new Date().toISOString()} - chaining rescore`);
      const child = spawn("node", ["scripts/detached-night148.mjs", "rescore"], {
        cwd: CWD, detached: true, stdio: "ignore",
      });
      child.unref();
      fs.writeFileSync(MARKER, `rescore chained at ${new Date().toISOString()}`);
      process.exit(0);
    }
    if (/aborting|FAILED|three consecutive/.test(txt)) {
      console.log(`CHAIN: the drain FAILED - not chaining. Log tail:\n${txt.slice(-600)}`);
      fs.writeFileSync(MARKER, `drain failed - chain aborted at ${new Date().toISOString()}`);
      process.exit(1);
    }
    await sleep(30_000);
  }
  console.log("CHAIN: 2h cap reached without a 6/6 drain - giving up");
  fs.writeFileSync(MARKER, `chain timeout at ${new Date().toISOString()}`);
  process.exit(1);
}

main();
