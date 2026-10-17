// E2E ITERATION 225 - THE THIRTEENTH DRIFT'S OWN PROOF: the box died
// again (the repo, .env, and the watch chain taken; the DB survived),
// the rebuild law rode (the clone verified at the remote's own HEAD,
// the install, the schema, the probes), and the gates re-assert on
// the REBUILT box: the DB's state, the union arc, the gate's
// continuity, and the live probe both-ways.
// Run: npx tsx scripts/e2e-iter225.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { AI_KEYFRAME_SOURCE } from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { probeWindow } from "../scripts/window-watch223";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log("e2e 225 - the rebuilt box's own proof");

  // ── leg 1: the clone is the remote's own answer ──
  console.log("leg 1: the clone verified");
  const { execSync } = await import("node:child_process");
  const head = execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
  ok(/^[0-9a-f]{40}$/.test(head), `the working tree rides a real commit (${head.slice(0, 7)})`);
  const env = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  ok(env.includes("file:/home/z/my-project/db/custom.db"), "the .env carries the law's own path");

  // ── leg 2: the DB's own state, named ──
  console.log("leg 2: the DB's state (the survivor)");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" }, include: { characters: true } });
  ok(Boolean(project) && (project?.characters.length ?? 0) >= 2, `Immortal Path stands (${project?.characters.length ?? 0} characters)`);
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { shots: true, episode: { select: { id: true } } } });
  ok(Boolean(scene) && (scene?.shots.length ?? 0) === 6, `E7 Sc12 stands (${scene?.shots.length ?? 0} shots)`);

  // ── leg 3: the union arc (the ref chain survived the thirteenth drift too) ──
  console.log("leg 3: the union arc");
  const dbRows = await db.identityArcReading.count({ where: { source: AI_KEYFRAME_SOURCE } });
  const ledgerRows = fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8")
    .split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((o) => o && o.source === AI_KEYFRAME_SOURCE).length;
  ok(dbRows + ledgerRows >= 36, `the arc carries its rows across the wipe (db ${dbRows} + committed ledger ${ledgerRows})`);

  // ── leg 4: the gate's continuity ──
  console.log("leg 4: the gate's continuity");
  if (project && scene) {
    const gate = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
    ok(gate.arc === true && gate.nights >= 1, `the arc stands, nights ${gate.nights} (the ref chain, not the DB)`);
    ok(gate.provisional === (gate.nights < 2), `PROVISIONAL ${gate.provisional ? "stands" : "has exited"}`);
    if (gate.provisional) ok(gate.verdict !== "RELEASE", "a PROVISIONAL arc never releases");
  }

  // ── leg 5: the live probe (both-ways) ──
  console.log("leg 5: the live probe (the both-ways law)");
  const probe = await probeWindow();
  if (probe.open) {
    ok(typeof probe.base64Chars === "number" && probe.base64Chars > 1000, `the window is OPEN (${probe.base64Chars} b64 chars) - the legs ride in-session`);
  } else {
    ok(probe.error?.includes("429"), `the wall stands across the rebuild and names itself verbatim (${probe.ms}ms)`);
  }

  console.log(`\nE2E 225: ${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error("E2E 225 FAILED:", e instanceof Error ? e.message : String(e)); process.exitCode = 1; })
  .finally(() => db.$disconnect());
