// E2E ITERATION 228 - THE FOURTH DEATH'S OWN PROOF. The box was
// wiped while the chain rode - the fourth death, the first to take
// the DB. The 225 rebuild law rode it as one command AND EXPOSED
// its own gaps, graduated: the arrival ledger CARRIED ACROSS the
// clone (the box's memory survives the body), the standing seed
// after the schema (the rows born back), the split-brain DB closed
// (ONE path, every rider), the pid truth law (the watch writes its
// OWN pid - the eye reads the rider, not the vehicle). Every leg
// here reads the REAL box: the ledger's arc (refusal -> relaunch),
// the reborn DB (the seed's rows, the restore leg's pure-DB steps),
// the riding chain's own /proc environ, the wall's verbatim, the
// restore receipt, and the pure prior laws.
// Run: npx tsx scripts/e2e-iter228.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { LOCK_PATH } from "../scripts/window-watch223";
import { PID_PATH, SESSION_OPEN_LEDGER_PATH, decideSessionAction, readDrift, stoppedByLaw } from "../scripts/session-open";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log("e2e 228 - the fourth death, named and closed");

  // ── leg 1: the drift check ──
  console.log("leg 1: the drift check");
  const drift = readDrift();
  ok(drift.match && /^[0-9a-f]{40}$/.test(drift.remoteHead ?? ""), `the remote and the box agree at ${drift.localHead?.slice(0, 7)}`);

  // ── leg 2: the real ledger arc (the fourth death's story) ──
  console.log("leg 2: the arrival ledger's arc");
  const opens = fs.readFileSync(SESSION_OPEN_LEDGER_PATH, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { watch?: string; drift?: string; chain?: string; action?: string; generation?: number | null; openedAt?: string });
  ok(opens.length >= 6 && opens.every((o) => o.watch === "session-open"), `${opens.length} arrivals on the ledger, every one the arrival's own line`);
  const refusalIdx = opens.findIndex((o) => o.chain === "never-launched" && o.action === "rebuild");
  const relaunchIdx = opens.findIndex((o) => o.action === "relaunch");
  ok(refusalIdx >= 0 && opens[refusalIdx].drift === "match", `the corpse's refusal is on the ledger (line ${refusalIdx + 1}: never-launched -> rebuild, drift match)`);
  ok(relaunchIdx > refusalIdx, `the relaunch follows the refusal (line ${relaunchIdx + 1}: the rebirth read, the dead+promised branch rode for real)`);
  const lastOpen = opens[opens.length - 1];
  ok(lastOpen.drift === "match" && (lastOpen.action === "stand-down" || lastOpen.action === "relaunch"), `the last arrival is lawful: ${lastOpen.action} (${lastOpen.openedAt?.slice(0, 19)})`);

  // ── leg 3: the reborn DB (the seed's rows, the restore leg's steps) ──
  console.log("leg 3: the reborn database");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" }, include: { characters: true } });
  ok(!!project && project.characters.length === 5, `the project born back: ${project?.characters.length ?? 0} characters (the seed's rows, not a shell)`);
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { shots: true } });
  ok(!!scene && scene.shots.length === 6, `E7 Sc12 born back: ${scene?.shots.length ?? 0} shots`);
  const lin = await db.character.findFirst({ where: { projectId: project!.id, name: "Lin Yue" } });
  const wei = await db.character.findFirst({ where: { projectId: project!.id, name: "Demon Lord Wei" } });
  const linDna = lin?.sheetDna ? (JSON.parse(lin.sheetDna) as Record<string, string>) : null;
  const weiDna = wei?.sheetDna ? (JSON.parse(wei.sheetDna) as Record<string, string>) : null;
  ok(linDna?.robeColor === "#2a5c52" && linDna?.bootsColor === "#1f1f1f", "the DB carries the seeded Lin DNA (the dye law's pins - the restore leg's pure-DB step rode for real)");
  ok(weiDna?.robeColor === "#3b2d5c" && weiDna?.weaponType === "none", "the DB carries the seeded Wei DNA");
  ok((lin?.designSpec?.length ?? 0) === 514 && (lin?.designSheetUrl ?? "").includes("/designs/"), `the committed design wired byte-exact (Lin ${lin?.designSpec?.length ?? 0} chars - the 213 law's own number)`);
  ok(await db.identityArcReading.count({ where: { source: "AI_KEYFRAME" } }) === 0, "the union arc's db half: 0 rows (the union law unchanged - the committed ledger carries the 36)");
  const committedArc = fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { source?: string })
    .filter((r) => r.source === "AI_KEYFRAME");
  ok(committedArc.length === 36, `the committed ledger half stands: ${committedArc.length} AI_KEYFRAME rows in git (171 RENDER rows ride beside them - the union law counts by source)`);

  // ── leg 4: the riding chain's pid truth (the rider, not the vehicle) ──
  console.log("leg 4: the pid truth law, proven on the real chain");
  const pidReading = (() => { try { return JSON.parse(fs.readFileSync(PID_PATH, "utf8")) as { pid: number; generation: number }; } catch { return null; } })();
  const lockReading = (() => { try { return JSON.parse(fs.readFileSync(LOCK_PATH, "utf8")) as { pid: number }; } catch { return null; } })();
  ok(pidReading != null && lockReading != null && pidReading.pid === lockReading.pid, `the pid file and the lock name the SAME pid (${pidReading?.pid}) - the watch's own write won`);
  ok(pidReading?.generation === 1, `the riding generation is named in the pid file (${pidReading?.generation})`);
  const alive = pidReading ? fs.existsSync(`/proc/${pidReading.pid}`) : false;
  ok(alive, `the named pid is a live process (/proc/${pidReading?.pid} exists)`);
  const envUrl = (() => { try { return (fs.readFileSync(`/proc/${pidReading!.pid}/environ`, "utf8").split("\0").find((e) => e.startsWith("DATABASE_URL=")) ?? ""); } catch { return ""; } })();
  ok(envUrl === "DATABASE_URL=file:/home/z/my-project/db/custom.db", `the riding chain's own env carries the unified path (${envUrl.replace("DATABASE_URL=", "")}) - the split-brain is closed at runtime`);

  // ── leg 5: the wall, verbatim (the rebuild's own probe refreshed it) ──
  console.log("leg 5: the window's shape (durable)");
  const wr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "inspect", "aiart222", "window-report.json"), "utf8")) as { shape?: string; channels?: Array<{ channel: string; state: string; detail: string }> };
  const blocked = (wr.channels ?? []).filter((c) => c.state === "BLOCKED");
  ok(wr.shape === "account-total" && blocked.length === 4, `the shape is named: ${wr.shape} (${blocked.length}/4 channels blocked)`);
  ok(blocked.every((c) => c.detail.includes("429")), "every channel's 429 verbatim on the receipt (the wall's own words, nothing paraphrased)");

  // ── leg 6: the restore receipt (the leg's real ride on the fresh DB) ──
  console.log("leg 6: the restore receipt");
  const rr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "receipts", "restore-receipt.json"), "utf8")) as { members?: Array<{ name: string; sheet: string; sheetError?: string; dnaSource: string }>; complete?: boolean };
  const linRow = (rr.members ?? []).find((m) => m.name === "Lin Yue");
  const weiRow = (rr.members ?? []).find((m) => m.name === "Demon Lord Wei");
  ok(linRow?.dnaSource === "committed-seed" && (linRow?.sheetError ?? "").includes("429"), "Lin: the seed stands, the sheet's 429 verbatim");
  ok(weiRow?.dnaSource === "committed-seed" && (weiRow?.sheetError ?? "").includes("429"), "Wei: the seed stands, the sheet's 429 verbatim");
  ok(rr.complete === false, "the receipt is honestly incomplete (the sheets wait for the window - nothing claimed that did not land)");

  // ── leg 7: the pure prior laws (the branches, replayed) ──
  console.log("leg 7: the pure laws replayed");
  ok(stoppedByLaw({ generation: 9, nextGeneration: null, outcome: "rode" }) === "rode" && decideSessionAction({ chain: "dead", expected: { generation: 9, stopped: true, stoppedReason: "rode", lastOutcome: "rode" } }).action === "stand-down", "a rode stop stands down forever (the 227 law kept)");
  ok(decideSessionAction({ chain: "dead", expected: { generation: 14, stopped: true, stoppedReason: "bound", lastOutcome: "expired" } }).action === "relaunch", "a bound stop relaunches a fresh chain (the 227 law kept)");
  ok(decideSessionAction({ chain: "dead", expected: { generation: 1, stopped: false, stoppedReason: null, lastOutcome: null } }).action === "relaunch" && decideSessionAction({ chain: "dead", expected: { generation: 1, stopped: false, stoppedReason: null, lastOutcome: null } }).generation === 1, "dead mid-flight with an empty ledger: generation 1 rides again (the branch the fourth death rode for real)");

  console.log(`\nE2E 228: ${pass} pass, ${fail} fail`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E 228 FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
