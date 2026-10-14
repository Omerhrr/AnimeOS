// WATCH 208 - THE COMPLETION'S RIDER (the fifteenth drift's re-arm).
//
// The 205 watcher's law, carried: 10-minute probes, the 12h cap.
// The arm's shape on the rebuilt box:
//   - the RESTORE is already whole (the door breathed the first pass:
//     4/4 sheets anchored, Lin 514 / Wei 517 wired byte-exact, 4/4
//     DNA read - zero refusals against the 205 pass's 31);
//   - the DRAIN rides (6/6 target); the FIRST drain paid the
//     cold-start tax (S001-S003 fell back to MOTION - the warm-pool
//     law re-honored after), the repair drain redoes only those
//     three, so the done-key is the DB TRUTH (check-drain-whole.ts:
//     all six shots' latest jobs BLENDER + clips), NOT a log regex
//     (the repair run prints 3/3 - the 205 done-key lesson, taught
//     twice, caught before it lied);
//   - when the drain is whole: the HARD gate (e2e-iter137-restore)
//     then the COMPLETION (night203-complete, the four refused reads
//     S003-S006, the arc upsert keyed shotId+source+night - re-runs
//     safe, no duplicates).
// Done marker: chain208.done with the completion's own tail line.
// Usage: node scripts/watch208.mjs  (detached by the caller)
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/watch208.log`;
const DONE = `${CWD}/chain208.done`;
const POLL_MS = 10 * 60 * 1000;
const CAP_MS = 12 * 60 * 60 * 1000;

const log = (m) => fs.appendFileSync(OUT, `${new Date().toISOString()} ${m}\n`);

const VERDICT = `${CWD}/drain-whole.verdict`;

async function drainWhole() {
  const code = await run("npx", ["tsx", "scripts/check-drain-whole.ts"], "drain-whole check");
  if (code !== 0) return false;
  try {
    // THE VERDICT FILE (the 208 seam, caught before it lied): the log
    // marker embeds a timestamp so a literal-slice regex never matches
    // (lastIndexOf -1, the watch re-probes forever); the check writes
    // its own verdict file instead - race-free, parse-free.
    return fs.readFileSync(VERDICT, "utf8").trim() === "WHOLE 6/6";
  } catch { return false; }
}

function run(cmd, args, tag) {
  return new Promise((resolve) => {
    const out = fs.openSync(OUT, "a");
    fs.appendFileSync(OUT, `\n---- ${new Date().toISOString()} ${tag} ----\n`);
    const c = spawn(cmd, args, { cwd: CWD, stdio: ["ignore", out, out], env: { ...process.env, DATABASE_URL: "file:/home/z/my-project/db/custom.db", ANIMEOS_NIGHT_TAG: "night-203", ANIMEOS_INK: "hull", ANIMEOS_SCORE_SAMPLES: "3" } });
    c.on("exit", (code) => resolve(code));
    c.on("error", () => resolve(-1));
  });
}

async function main() {
  const t0 = Date.now();
  log("watch208 armed: drain 6/6 -> HARD gate -> completion (10-min probes, 12h cap)");
  while (Date.now() - t0 < CAP_MS) {
    if (fs.existsSync(DONE)) { log("done marker present - exiting"); return; }
    if (await drainWhole()) {
      log("DRAIN 6/6 detected - riding the HARD gate");
      const gate = await run("npx", ["tsx", "scripts/e2e-iter137-restore.ts"], "HARD gate");
      log(`HARD gate exit ${gate}`);
      if (gate !== 0) { log("HARD gate refused - re-probing in 10 min (the gate's honesty is the arm's honesty)"); }
      else {
        log("HARD gate passed - launching the completion");
        const comp = await run("npx", ["tsx", "scripts/night203-complete.ts"], "completion");
        log(`completion exit ${comp}`);
        const tail = (() => { try { return fs.readFileSync(OUT, "utf8").split("---- completion ----")[1] ?? ""; } catch { return ""; } })();
        fs.writeFileSync(DONE, `completion exit ${comp}\n${tail.split("\nCOMPLETION:")[1] ?? tail.slice(-400)}`);
        log("chain208.done written - the completion's receipt recorded");
        return;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  log("12h cap reached - the watch retires honestly (no completion this window)");
}
main();
