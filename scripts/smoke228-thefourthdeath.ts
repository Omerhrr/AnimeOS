// SMOKE 228 - THE FOURTH DEATH (the box wiped while the chain rode).
// The 225 rebuild law rode the fourth death as one command AND
// EXPOSED ITS OWN THREE GAPS, all graduated: (a) the arrival eye's
// refusal line died with the body - the session-opens ledger is the
// box's MEMORY and is now CARRIED ACROSS the clone (append-only,
// deduped by openedAt); (b) "the db file itself survived both
// deaths" was FALSE this time - the standing seed rides after the
// schema, the standing rows are born back (the watch's first leg
// needs the project); (c) the watch wrapper hardcoded the APP db
// path while every direct run rode the PARENT path - two databases,
// the split-brain closed (ONE path, every rider). The smoke asserts
// the grown law exact and the prior laws UNREMOVED.
// Run: npx tsx scripts/smoke228-thefourthdeath.ts
import fs from "fs";
import path from "path";
import { MAX_GENERATIONS, buildCrashHandoff } from "./window-watch223";
import { stoppedByLaw } from "./session-open";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

console.log("smoke 228 - the fourth death");

// ── part 0: the prior laws UNREMOVED ──
console.log("part 0: the prior laws stand");
const corpse = buildCrashHandoff({ generation: 1, reason: "the fourth death's shape", probeCycles: 6, startedAt: "2026-10-17T04:00:00.000Z", endedAt: "2026-10-17T05:00:00.000Z" });
ok(corpse.outcome === "crashed" && corpse.nextGeneration === 2, "the 226 crash law stands (a crash writes its line and hands off)");
ok(stoppedByLaw({ generation: 9, nextGeneration: null, outcome: "rode" }) === "rode", "the 227 law stands (a RODE stop is the answer)");
ok(stoppedByLaw({ generation: MAX_GENERATIONS, nextGeneration: null, outcome: "expired" }) === "bound", "the 227 law stands (the bound is expired coverage, a handoff)");

// ── part 1: the grown rebuild law (the memory survives the body) ──
console.log("part 1: the rebuild law grows the memory and the seed");
const s = fs.readFileSync(path.join(process.cwd(), "scripts", "box-rebuild.sh"), "utf8");
ok(s.includes("FOURTH DEATH"), "the header names the fourth death (the law's own story is honest)");
ok(s.includes('REMOTE_HEAD=$(git ls-remote') && s.indexOf("git ls-remote") < s.indexOf("== THE MEMORY CARRIED ASIDE"), "the drift check rides first (before anything moves)");
ok(s.includes('ASIDE="${PARENT}/.session-opens-carry"') && s.indexOf("== THE MEMORY CARRIED ASIDE") < s.indexOf('rm -rf "$APP"'), "the arrival ledger is carried aside BEFORE the wipe (the box's memory is not the box)");
ok(s.indexOf("== THE MEMORY MERGED BACK") > s.indexOf("clone verified at") && s.indexOf("== THE MEMORY MERGED BACK") < s.indexOf("== THE ENV =="), "the memory is merged back AFTER the clone, before anything else reads it");
ok(s.includes('grep -oE \'"openedAt":"[^"]*"\'') && s.includes("grep -qF \"$OPENED\""), "the merge dedupes by openedAt (append-only, the remote's committed lines win)");
ok(s.indexOf("npx prisma db push") < s.indexOf("== THE SEED") && s.indexOf("== THE SEED") < s.indexOf("== THE PROBES"), "the seed rides between the schema and the probes (the standing rows are born back before anything names them)");
ok(s.includes('DB_URL="file:/home/z/my-project/db/custom.db"'), "the env path law stands (the PARENT path - the path that survives the rm -rf)");
ok(s.includes('TOKEN="${ANIMEOS_TOKEN:-${1:-}}"') && s.includes("the token law is not a warning"), "the token law stands (never committed, never hardcoded)");
ok(s.includes("grep -oE '[0-9]+' watch223.pid"), "the chain relaunch keeps the double-shape pid check (the 226 law)");

// ── part 2: the split-brain closed (ONE db path, every rider) ──
console.log("part 2: the unification (one database, every rider)");
const mjs = fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.mjs"), "utf8");
ok(mjs.includes('DATABASE_URL: "file:/home/z/my-project/db/custom.db"'), "the wrapper carries the PARENT path (the .env law's own path)");
ok(!mjs.includes("file:/home/z/my-project/AnimeOS/db/custom.db"), "the APP path is GONE from the wrapper (the split-brain closed)");
const riders = ["window-watch223.ts", "session-open.ts", "night122-restore.ts", "night222-v4aikeyframe.ts", "probe222-swordprior.ts", "probe222-window.ts", "box-rebuild.sh"];
const withAppPath = riders.filter((f) => fs.readFileSync(path.join(process.cwd(), "scripts", f), "utf8").includes("AnimeOS/db/custom.db"));
ok(withAppPath.length === 0, `no chain file hardcodes the APP path (checked ${riders.length}: ${withAppPath.join(", ") || "all clean"})`);
ok(mjs.includes("JSON.stringify({ pid: child.pid, generation"), "the 226 pid file law stands (JSON, the generation carried)");

// ── part 3: the seed law (idempotent, the rows born back) ──
console.log("part 3: the seed's idempotence (named, never re-seeded)");
const seedDriver = fs.readFileSync(path.join(process.cwd(), "scripts", "seed140.ts"), "utf8");
ok(seedDriver.includes("ensureSeed()"), "the seed driver rides ensureSeed directly (no HTTP layer, headless)");
const seedLaw = fs.readFileSync(path.join(process.cwd(), "src", "lib", "seed.ts"), "utf8");
ok(seedLaw.indexOf("findFirst()") < seedLaw.indexOf("db.project.create"), "the seed reads before it creates (an existing project is named, not re-seeded)");

// ── part 4: the refusal path (the corpse's branch, exact) ──
console.log("part 4: the refusal path and the pid truth law");
const openSrc = fs.readFileSync(path.join(process.cwd(), "scripts", "session-open.ts"), "utf8");
ok(openSrc.includes('action: "rebuild"') && openSrc.includes("process.exit(2)"), "never-launched -> rebuild -> exit 2 (the arrival does not improvise a rebuild)");
ok(openSrc.includes("bash scripts/box-rebuild.sh"), "the refusal names the one command");
const watchSrc = fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.ts"), "utf8");
ok(watchSrc.includes("fs.writeFileSync(PID_FILE_PATH, JSON.stringify({ pid: process.pid, generation"), "the watch writes its OWN pid (the deepest truth wins - the eye reads the rider, not the vehicle)");
ok(watchSrc.indexOf("acquireLock();") < watchSrc.indexOf("fs.writeFileSync(PID_FILE_PATH"), "the pid truth write rides at lock time (before the first probe)");

console.log(`\nsmoke 228: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
