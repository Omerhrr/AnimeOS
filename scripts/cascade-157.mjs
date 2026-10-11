// CASCADE 155 - the full gate chain, one clean run (the resume law
// re-creates this untracked runner every box): 117..155 + 103a, then
// the toon + fx-transport + anime + camera + anatomy smokes.
// Usage: node scripts/cascade-157.mjs   (log -> cascade157.log)
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const CWD = "/home/z/my-project/AnimeOS";
const LOG = `${CWD}/cascade157.log`;
const ENV = {
  ...process.env,
  DATABASE_URL: "file:/home/z/my-project/db/custom.db",
  ANIMEOS_INK: "hull",
  ANIMEOS_BLENDER_BIN: "/home/z/blender-5.2.2-linux-x64/blender",
};

const GATES = [
  "e2e-iter117-choreographer", "e2e-iter118-forge", "e2e-iter119-duel",
  "e2e-iter120-craft", "e2e-iter121-style", "e2e-iter123-face",
  "e2e-iter125-palette", "e2e-iter126-rungs", "e2e-iter127-valuewall",
  "e2e-iter128-anchor", "e2e-iter129-sheet", "e2e-iter130-hueclass",
  "e2e-iter131-style", "e2e-iter132-framingrung", "e2e-iter133-mediumrung",
  "e2e-iter134-facegender", "e2e-iter135-trimscope", "e2e-iter136-boldness",
  "e2e-iter137-restore", "e2e-iter138-widerung", "e2e-iter139-statement",
  "e2e-iter140-paint", "e2e-iter141-conviction", "e2e-iter142-arc",
  "e2e-iter144-durable", "e2e-iter146-joinarc", "e2e-iter147-ticklaw",
  "e2e-iter149-reference", "e2e-iter152-gradebound", "e2e-iter155-widefill", "e2e-iter157-scalelaw",
];
// the HYBRID smokes run under plain python3 and spawn blender
// themselves (the BLENDER env); the PURE smokes run under blender -P
const SMOKES_PY = ["blender-toon-smoke.py", "blender-fxtransport-smoke.py", "blender-anime-smoke.py"];
const SMOKES_BLENDER = ["blender-camera-smoke.py", "blender-anatomy-smoke.py"];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG, line + "\n");
}

function runGate(name, args, env) {
  const t0 = Date.now();
  const r = spawnSync("npx", args, { cwd: CWD, env: { ...ENV, ...env }, encoding: "utf8", timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const fails = (out.match(/FAIL /g) ?? []).length;
  const green = r.status === 0 && fails === 0;
  log(`${green ? "GREEN" : "RED"} ${name} (${Math.round((Date.now() - t0) / 1000)}s, ${fails} fail lines, exit ${r.status})`);
  if (!green) {
    fs.appendFileSync(LOG, out.split("\n").filter((l) => /FAIL|Error|error/i.test(l)).slice(-15).join("\n") + "\n");
  }
  return green;
}

function main() {
  fs.writeFileSync(LOG, `---- cascade 157 start ${new Date().toISOString()} ----\n`);
  let reds = [];
  // 103a first (the warm source asserts)
  if (!runGate("103a-warmworkers", ["tsx", "scripts/e2e-iter103-warmworkers.ts"], { PHASE: "a" })) reds.push("103a");
  for (const g of GATES) {
    if (!runGate(g, ["tsx", `scripts/${g}.ts`], {})) reds.push(g);
  }
  for (const s of SMOKES_PY) {
    const t0 = Date.now();
    const r = spawnSync("python3", [`scripts/${s}`], {
      cwd: CWD, env: { ...ENV, BLENDER: "/home/z/blender-5.2.2-linux-x64/blender" }, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const fails = (out.match(/FAIL /g) ?? []).length;
    const green = r.status === 0 && fails === 0;
    log(`${green ? "GREEN" : "RED"} smoke ${s} (${Math.round((Date.now() - t0) / 1000)}s, exit ${r.status})`);
    if (!green) {
      fs.appendFileSync(LOG, out.split("\n").filter((l) => /FAIL|Error|error/i.test(l)).slice(-15).join("\n") + "\n");
      reds.push(s);
    }
  }
  for (const s of SMOKES_BLENDER) {
    const t0 = Date.now();
    const r = spawnSync("/home/z/blender-5.2.2-linux-x64/blender", ["-b", "--factory-startup", "-P", `scripts/${s}`, "--"], {
      cwd: CWD, env: ENV, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const fails = (out.match(/FAIL /g) ?? []).length;
    const green = r.status === 0 && fails === 0;
    log(`${green ? "GREEN" : "RED"} smoke ${s} (${Math.round((Date.now() - t0) / 1000)}s, exit ${r.status})`);
    if (!green) {
      fs.appendFileSync(LOG, out.split("\n").filter((l) => /FAIL|Error|error/i.test(l)).slice(-15).join("\n") + "\n");
      reds.push(s);
    }
  }
  log(reds.length === 0 ? "CASCADE 155 ALL GREEN" : `CASCADE 155 REDS: ${reds.join(", ")}`);
  fs.writeFileSync(`${CWD}/cascade157.done`, reds.length === 0 ? "ALL GREEN" : reds.join(", "));
}

main();
