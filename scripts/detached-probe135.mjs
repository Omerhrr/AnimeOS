// Detached probe 135 runner (the tool session reaps children -
// double-fork detach is the law, the detached-night receipt). The
// child SUPERVISES the python probe: every cut that finishes lands
// in probe135-results.json and a restart resumes from there.
// Usage: node scripts/detached-probe135.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/probe135-run.log`;
const RESULTS = "/home/z/my-project/inspect/probe135/probe135-results.json";

if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  const log = (s) => fs.appendFileSync(OUT, s + "\n");
  log(`---- ${new Date().toISOString()} probe 135 supervisor ----`);
  let attempt = 0;
  const landedCount = () => {
    try { return Object.keys(JSON.parse(fs.readFileSync(RESULTS, "utf8"))).length; } catch { return 0; }
  };
  const tick = () => {
    attempt += 1;
    const landed = landedCount();
    log(`attempt ${attempt}: ${landed}/5 cuts landed`);
    if (landed >= 5 || attempt > 10) { log("supervisor done"); process.exit(0); }
    // the python probe is a NORMAL child of the supervisor (the
    // double-fork already detached the supervisor's own tree from
    // the tool session; if the supervisor dies the probe dies with
    // it and the next attempt resumes from the results json)
    const child = spawn("python3", ["-u", "scripts/probe-135-trim.py"], {
      cwd: CWD,
      stdio: ["ignore", out, out],
      env: {
        ...process.env,
        BLENDER: "/home/z/blender-5.2.2-linux-x64/blender",
      },
    });
    const watchdog = setTimeout(() => {
      log(`attempt ${attempt}: timed out, killing probe (resumes on the next attempt)`);
      try { child.kill("SIGKILL"); } catch {}
    }, 25 * 60 * 1000);
    child.on("exit", () => { clearTimeout(watchdog); setTimeout(tick, 3000); });
  };
  tick();
} else {
  const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
    cwd: CWD,
    detached: true,
    stdio: "ignore",
  });
  mid.unref();
  console.log("detached: probe 135 supervisor launching, log -> probe135-run.log");
}
