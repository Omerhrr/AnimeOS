// SMOKE 225 - THE REBUILD LAW MADE DURABLE (box-rebuild.sh's own
// teeth). The box has died twice; the third death rides one command.
// The smoke asserts the script's LAW from its source: the drift
// check FIRST, the clone verified against the remote's own answer,
// the env path, the schema, the probes (never guessed), the chain
// relaunched - and THE TOKEN LAW: the token arrives by env/arg,
// the script refuses without it, and NO token literal is committed.
// Run: npx tsx scripts/smoke225-boxrebuild.ts
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

console.log("box-rebuild - the rebuild law made durable");

const p = path.join(process.cwd(), "scripts", "box-rebuild.sh");
ok(fs.existsSync(p), "the rebuild script exists in the repo (the clone carries it)");
const s = fs.readFileSync(p, "utf8");

// ── the order law (the 222 + 225 rides, byte-faithful) ──
const idxOf = (needle: string) => s.indexOf(needle);
ok(idxOf("git ls-remote") >= 0 && idxOf("git ls-remote") < idxOf("git clone"), "THE DRIFT CHECK FIRST: the remote is verified before the clone");
ok(s.includes('CLONED_HEAD') && s.includes('!= "$REMOTE_HEAD"'), "the clone is verified against the remote's own answer (no silent drift)");
ok(s.includes('DB_URL="file:/home/z/my-project/db/custom.db"') && s.includes('DATABASE_URL='), "the env path is the law (carried by DB_URL into the .env write)");
ok(idxOf("npm install") < idxOf("prisma db push"), "the install precedes the schema");
ok(s.includes("scripts/probe222-window.ts"), "the window's shape is measured, never guessed");
ok(s.includes("scripts/night122-restore") || s.includes("window-watch223.mjs"), "the chain relaunch rides (the standing watch)");
ok(s.includes("watch223.pid") && s.includes("ps -p"), "the chain's pid is verified alive, not assumed");
ok(s.includes("session-open.ts") && s.includes("standing gates re-run before any commit"), "the script names the next law (the 228 growth: the arrival eye re-reads the reborn box, then the standing gates)");

// ── the token law ──
ok(s.includes("ANIMEOS_TOKEN") && s.includes('exit 2'), "the token arrives by env/arg and the refusal is the law (exit 2)");
ok(!/ghp_[A-Za-z0-9]{10,}/.test(s), "NO token literal is committed (the grep the standing law runs)");
ok(s.includes("REMOTE_HEAD") && s.includes("cut -f1"), "the remote HEAD is read by the script itself");

// ── the executable bit ──
try {
  const mode = execSync(`stat -c "%a" "${p}"`).toString().trim();
  ok(mode === "755" || mode === "775", `the script carries its executable bit (${mode})`);
} catch {
  ok(false, "the executable bit could not be read");
}

console.log(`\nSMOKE 225: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
