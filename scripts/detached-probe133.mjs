// Detached probe 133 runner (the tool session reaps children -
// double-fork detach is the law, the detached-night receipt). The
// child SUPERVISES the python probe: every cut that finishes lands
// in probe133-results.json and a restart resumes from there.
// Usage: node scripts/detached-probe133.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const OUT = `${CWD}/probe133-run.log`;
const RESULTS = "/home/z/my-project/inspect/probe133/probe133-results.json";

if (process.argv[2] === "--child") {
  const out = fs.openSync(OUT, "a");
  const log = (s) => fs.appendFileSync(OUT, s + "\n");
  log(`---- ${new Date().toISOString()} probe 133 supervisor ----`);
  let attempt = 0;
  const landedCount = () => {
    try { return Object.keys(JSON.parse(fs.readFileSync(RESULTS, "utf8"))).length; } catch { return 0; }
  };
  const tick = () => {
    attempt += 1;
    const landed = landedCount();
    log(`attempt ${attempt}: ${landed}/6 cuts landed`);
    if (landed >= 6 || attempt > 12) { log("supervisor done"); process.exit(0); }
    // the python probe is a NORMAL child of the supervisor (the
    // double-fork already detached the supervisor's own tree from
    // the tool session; if the supervisor dies the probe dies with
    // it and the next attempt resumes from the results json)
    const child = spawn("python3", ["-u", "scripts/probe-133-medium.py"], {
      cwd: CWD,
      stdio: ["ignore", out, out],
      env: {
        ...process.env,
        BLENDER: "/home/z/blender-5.2.2-linux-x64/blender",
        PROBE_OUT: "/home/z/my-project/inspect/probe133",
      },
    });
    child.on("exit", (code) => { log(`probe exited ${code}`); setTimeout(tick, 3000); });
  };
  tick();
} else {
  const mid = spawn(process.execPath, [import.meta.filename, "--child"], {
    cwd: CWD,
    detached: true,
    stdio: "ignore",
  });
  mid.unref();
  console.log("detached: probe 133 supervisor launching, log -> probe133-run.log");
}
