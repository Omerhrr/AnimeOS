#!/usr/bin/env node
// THE CASCADE (the 140 discipline): every standing gate rides after
// the statement revision - 117..138 in number order, then the 103
// warm-up phase a (the A7 living truth). No gate skipped.
import { spawnSync } from "node:child_process";

const GATES = [
  "e2e-iter117-choreographer.ts",
  "e2e-iter118-forge.ts",
  "e2e-iter119-duel.ts",
  "e2e-iter120-craft.ts",
  "e2e-iter121-style.ts",
  "e2e-iter123-face.ts",
  "e2e-iter125-palette.ts",
  "e2e-iter126-rungs.ts",
  "e2e-iter127-valuewall.ts",
  "e2e-iter128-anchor.ts",
  "e2e-iter129-sheet.ts",
  "e2e-iter130-hueclass.ts",
  "e2e-iter131-style.ts",
  "e2e-iter132-framingrung.ts",
  "e2e-iter133-mediumrung.ts",
  "e2e-iter134-facegender.ts",
  "e2e-iter135-trimscope.ts",
  "e2e-iter136-boldness.ts",
  "e2e-iter137-restore.ts",
  "e2e-iter138-widerung.ts",
  "e2e-iter139-statement.ts",
  "e2e-iter140-paint.ts",
  "e2e-iter141-conviction.ts",
];

let bad = 0;
for (const g of GATES) {
  const t0 = Date.now();
  const r = spawnSync("npx", ["tsx", `scripts/${g}`], {
    cwd: "/home/z/my-project/AnimeOS",
    encoding: "utf8",
    timeout: 1500_000,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "file:/home/z/my-project/db/custom.db" },
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  // THE GATE'S OWN CANON: every gate exits 0 only when its failures
  // count is zero (the exit status is the truth; the green phrase
  // varies - "ALL GREEN", "E2E GREEN", "ALL GREEN - iteration N (a)")
  const green = r.status === 0;
  console.log(`[${green ? "GREEN" : "FAIL"}] ${g} (${Math.round((Date.now() - t0) / 1000)}s) ${green ? "" : "-> " + out.slice(-400)}`);
  if (!green) bad += 1;
}
// the 103 warm-up's A7 (the living truth) rides phase a only
const r103 = spawnSync("npx", ["tsx", "scripts/e2e-iter103-warmworkers.ts"], {
  cwd: "/home/z/my-project/AnimeOS", encoding: "utf8", timeout: 900_000,
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "file:/home/z/my-project/db/custom.db", PHASE: "a" },
});
const out103 = `${r103.stdout ?? ""}\n${r103.stderr ?? ""}`;
const green103 = r103.status === 0;
console.log(`[${green103 ? "GREEN" : "FAIL"}] e2e-iter103-warmworkers (phase a) ${green103 ? "" : "-> " + out103.slice(-400)}`);
if (!green103) bad += 1;

console.log(bad === 0 ? "\nCASCADE ALL GREEN" : `\nCASCADE: ${bad} GATE(S) RED`);
process.exit(bad === 0 ? 0 : 1);
