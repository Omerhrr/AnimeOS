// SMOKE 236 - THE CRAFT LEVER, ROUTED, AND THE CORPSE QUESTION
// GROWN. The 235 rides answered the named cells twice and the wall
// did not move (S002 38% -> 25% WORSE, S004 55% -> 55% UNCHANGED;
// the acceptance stood down honest both times), and the carry line
// named the only lever left - "the craft lever for a score is the
// craft, never a moved goalpost". The lever law
// (src/lib/craft-lever.ts) makes that sentence executable: the
// cell's own framing names the rung (the FACE at close/med - the
// shots the audience reads the face on; the PAINT at wide - the 139
// frontier's own named sentence), the proportion rung is refused
// (spent - probe-140's own verdict), and the lever speaks only
// under the honest receipt (a lever aimed without it is a moved
// goalpost wearing the craft's name). The plan law grows to carry
// the aim on every call (framings in, lever null when unknown -
// named, never guessed). And the corpse question
// (renderJobHeartbeatAlive) grows to the stall law's own arithmetic
// - 120s of NO ADVANCE, not 15s of quiet mtime - the 235 ride's own
// seam (the OOM scar false-negatived the heartbeat window on a
// heavy frame; the door declared a corpse and queued a duplicate,
// and the duplicate's thrash took the second pool worker). This
// smoke asserts the exact words, the routing, the plan's aim lines,
// and the corpse law's real teeth on the real file.
// Run: npx tsx scripts/smoke236-craftlever.ts
import fs from "fs";
import path from "path";
import {
  craftLeverForCell,
  CRAFT_LEVER_LAW_VERSION,
  CRAFT_LEVER_SENTENCE,
  PROPORTION_REFUSAL,
} from "../src/lib/craft-lever";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION } from "../src/lib/render-night-plan";
import { buildRepairWorkOrders } from "../src/lib/repair-work-order";
import { buildReleaseReview, type RepairBudget } from "../src/lib/release-review";
import { renderJobHeartbeatAlive, RENDER_RESUME_STALL_MS } from "../src/lib/identity-repair";
import type { EpisodeReleaseRead, MatrixCell } from "../src/lib/identity-matrix";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

// ── shape 1: the lever law's exact words ──
console.log("shape: the lever law's exact words");
ok(CRAFT_LEVER_SENTENCE === "the craft lever for a score is the craft, never a moved goalpost", "the lever's sentence is the carry's own sentence, verbatim (the 149 law)");
ok(PROPORTION_REFUSAL === "the proportion lever is spent (probe-140's own verdict)", "the proportion refusal names probe-140's own verdict");
const face = craftLeverForCell({ ref: "E7 Sc12 S002", framing: "med", carry: "STAND_DOWN_HONEST" });
ok(face.ok && face.lever.rung === "face" && face.lever.framing === "med", "the med cell routes to the FACE rung");
ok(
  face.ok && face.lever.line === "E7 Sc12 S002: the judge reads the build's face at this framing - the face craft's own answer is the lever; the proportion lever is spent (probe-140's own verdict).",
  "the face line, exact words (the spent rung refused beside it)",
);
const closeFace = craftLeverForCell({ ref: "E7 Sc12 S001", framing: "close", carry: "STAND_DOWN_HONEST" });
ok(closeFace.ok && closeFace.lever.rung === "face", "the close cell routes to the FACE rung too (the shots the audience reads the face on)");
const paint = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "STAND_DOWN_HONEST" });
ok(paint.ok && paint.lever.rung === "paint" && paint.lever.framing === "wide", "the wide cell routes to the PAINT rung");
ok(
  paint.ok && paint.lever.line === "E7 Sc12 S004: the judge reads the paint at this framing - the toon look's own language at the wide-end framing is the lever.",
  "the paint line, exact words (the 139 frontier's own sentence)",
);
const regen = craftLeverForCell({ ref: "E7 Sc12 S003", framing: "med", carry: "REGEN_OWED" });
ok(
  !regen.ok && regen.line === "E7 Sc12 S003: the cell owes the reference work first (the sheet acceptance answered REGEN_OWED) - the craft lever waits for the reference it must honor.",
  "a REGEN_OWED cell refuses the lever, exact words (the reference work first)",
);
const none = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "NONE" });
ok(
  !none.ok && none.line === "E7 Sc12 S004: the acceptance waits for its own night - the lever speaks only under the honest receipt (the craft lever for a score is the craft, never a moved goalpost).",
  "a NONE carry refuses the lever, exact words (the honest receipt is the precondition)",
);

// ── shape 2: the plan carries the aim ──
console.log("shape: the plan carries the aim");
const BUDGET: RepairBudget = { members: 4, shotsPerMember: 3 };
function cell(key: string, p10: number, n: number, verdict: "HOLD" | "BELOW" | "RELEASE", floor: number, worstRef: string | null): MatrixCell {
  return {
    key, n, p10, verdict: verdict as MatrixCell["verdict"], worstRef,
    mean: p10 + 0.05, median: p10 + 0.03, worst: p10 - 0.02, best: p10 + 0.1,
    belowFloor: verdict === "RELEASE" ? 0 : 2,
    belowFraction: verdict === "RELEASE" ? 0 : 2 / n,
  };
}
function read(over: Partial<EpisodeReleaseRead> & { source: string; verdict: EpisodeReleaseRead["verdict"] }): EpisodeReleaseRead {
  const floor = over.floor ?? 0.7;
  return {
    episodeId: "ep1",
    source: over.source,
    floor,
    readings: over.readings ?? 12,
    verdict: over.verdict,
    overall: over.overall ?? cell(`${over.source}:all`, over.verdict === "RELEASE" ? 0.85 : 0.62, 12, over.verdict === "UNSCORED" ? "HOLD" : over.verdict, floor, "E7 Sc12 S001"),
    arc: over.arc ?? false,
    nights: over.nights ?? 2,
    provisional: over.provisional ?? false,
    blocking: over.blocking ?? [],
    repairBudget: { ...BUDGET, shotsPerPass: 12 },
    spanLine: over.spanLine ?? "12 arc reading(s) across 2 night(s)",
    gapLine: over.gapLine ?? `${over.source} sits below`,
  };
}
function reviewOf(reads: EpisodeReleaseRead[]) {
  return buildReleaseReview({
    projectId: "p1",
    episodeId: "ep1",
    episodeTag: "E7",
    episodeTitle: "The Storm Over Azure Mountain",
    reads,
    repairBudget: BUDGET,
    now: new Date("2026-10-19T00:00:00Z"),
  });
}
const review = reviewOf([
  read({ source: "AI_KEYFRAME", verdict: "RELEASE" }),
  read({
    source: "RENDER",
    verdict: "BELOW",
    blocking: [
      { key: "med", verdict: "BELOW", p10: 0.35, n: 2, belowFloor: 1, worstRef: "E7 Sc12 S002" } as MatrixCell,
      { key: "storm", verdict: "BELOW", p10: 0.55, n: 2, belowFloor: 1, worstRef: "E7 Sc12 S004" } as MatrixCell,
    ],
  }),
]);
const renderOrder = buildRepairWorkOrders(review)[0];
ok(renderOrder && renderOrder.answeredBy === "repair-pass" && renderOrder.namedRefs.includes("E7 Sc12 S002") && renderOrder.namedRefs.includes("E7 Sc12 S004"), "the RENDER order names both cells");
const queues = [
  { member: "Lin Yue", below: [ { ref: "E7 Sc12 S002", shotId: "shot-s002", similarity: 0.38 }, { ref: "E7 Sc12 S001", shotId: "shot-s001", similarity: 0.55 } ] },
  { member: "Demon Lord Wei", below: [ { ref: "E7 Sc12 S004", shotId: "shot-s004", similarity: 0.55 } ] },
];
const carry = [
  { characterName: "Lin Yue", night: "acceptance-2026-10-18", verdict: "STAND_DOWN_HONEST" as const, line: "Lin Yue rides the acceptance's own answer (acceptance-2026-10-18): the honest receipt stands." },
  { characterName: "Demon Lord Wei", night: "acceptance-2026-10-18", verdict: "NONE" as const, line: "Demon Lord Wei carries no acceptance answer yet." },
];
const framings = { "shot-s002": "med" as const, "shot-s001": "close" as const, "shot-s004": "wide" as const };
const aimed = renderNightPlan({ order: renderOrder, queues, carry, night: "repair-2026-10-19", framings });
ok(aimed.ok && aimed.calls.length === 2, "the plan builds with the framings carried");
ok(aimed.ok && aimed.calls[0].ref === "E7 Sc12 S002" && aimed.calls[0].lever === "E7 Sc12 S002: the judge reads the build's face at this framing - the face craft's own answer is the lever; the proportion lever is spent (probe-140's own verdict).", "call 1 aims the FACE rung, the lever line verbatim");
ok(aimed.ok && aimed.calls[1].ref === "E7 Sc12 S004" && aimed.calls[1].lever === null, "call 2 rides lever null (the carry does not arm it - named, never guessed)");
ok(aimed.ok && aimed.lines.some((l) => l === `night repair-2026-10-19 call 1 aims: ${aimed.calls[0].lever}`), "the aim line rides the plan's own lines");
ok(aimed.ok && !aimed.lines.some((l) => l.includes("call 2 aims:")), "no aim line for a lever the carry did not arm");
const unarmed = renderNightPlan({ order: renderOrder, queues: [queues[0]], carry: [carry[0]], night: "n", framings: {} });
ok(unarmed.ok && unarmed.calls[0].lever === null && !unarmed.lines.some((l) => l.includes("aims:")), "framings absent -> lever null on every call (the plan does not guess)");
const regenCarry = renderNightPlan({
  order: renderOrder,
  queues: [queues[0]],
  carry: [{ characterName: "Lin Yue", night: "acceptance-2026-10-18", verdict: "REGEN_OWED", line: "Lin Yue rides the acceptance's own answer (acceptance-2026-10-18): the reference moved." }],
  night: "n",
  framings,
});
ok(regenCarry.ok && regenCarry.calls[0].lever === null && !regenCarry.lines.some((l) => l.includes("aims:")), "a REGEN_OWED carry does not arm the lever in the plan (the reference work first)");

// ── shape 3: the corpse question reads the stall law ──
console.log("shape: the corpse question reads the stall law");
ok(RENDER_RESUME_STALL_MS === 240 * 500 && RENDER_RESUME_STALL_MS === 120_000, "the resume window IS the stall law's own arithmetic (240 ticks x 500ms = 120s), derived");
const repairSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/identity-repair.ts"), "utf8");
ok(!repairSrc.includes("RENDER_RESUME_HEARTBEAT_MS"), "the 15s quiet-mtime window is gone from the source (the seam the 235 ride named)");
ok(!/15_000|15 \* 1000/.test(repairSrc), "no 15s literal survives anywhere in the repair law");
ok(repairSrc.includes("RENDER_RESUME_STALL_MS = REPAIR_STALL_TICKS * REPAIR_TICK_MS"), "the window is DERIVED from the stall law's own constants (the two laws cannot drift)");
ok(repairSrc.indexOf("JSON.parse(fs.readFileSync(file") < repairSrc.indexOf("Date.now() - st.mtimeMs"), "the file's own truth answers before the clock (the 107 precedent, in source order)");
ok(repairSrc.includes("renderJobHeartbeatAlive(latest.id, { progress: latest.progress, stage: latest.stage })"), "the resume door passes the last-known row (the content comparison is real, not optional prose)");
for (const ride of ["scripts/ride233-themap.ts", "scripts/ride234-acceptance.ts", "scripts/ride235-nights.ts"]) {
  const s = fs.readFileSync(path.join(process.cwd(), ride), "utf8");
  ok(s.includes("renderJobHeartbeatAlive(latest.id, { progress: latest.progress, stage: latest.stage })"), `${ride} passes the last-known row (every corpse door speaks the 236 law)`);
}

// the real teeth on the real file (fs, the smoke's own sandbox)
const rendersDir = path.join(process.cwd(), "public", "renders");
fs.mkdirSync(rendersDir, { recursive: true });
const jobFile = path.join(rendersDir, ".job-smoke236.json");
fs.writeFileSync(jobFile, JSON.stringify({ jobId: "smoke236", progress: 42, stage: "rendering frame 5/101", done: false, error: null, mp4Path: null }));
const now = Date.now();
ok(renderJobHeartbeatAlive("smoke236", { progress: 10, stage: "rendering frame 2/101" }) === true, "a live mtime is life (the stall window has not closed)");
fs.utimesSync(jobFile, new Date(now - 200_000), new Date(now - 200_000)); // quiet for 200s - past the stall window
ok(renderJobHeartbeatAlive("smoke236", { progress: 10, stage: "rendering frame 2/101" }) === true, "a quiet mtime is NOT death when the file's own content advanced past the row (the 107 precedent - the writeback may be dead, the work is not)");
ok(renderJobHeartbeatAlive("smoke236", { progress: 10, stage: null }) === true, "a stage the row has not seen is advance too (the file's own truth)");
ok(renderJobHeartbeatAlive("smoke236", { progress: 90, stage: "rendering frame 5/101" }) === false, "no advance within the stall window IS a corpse (the same arithmetic the wait's stall law speaks)");
ok(renderJobHeartbeatAlive("smoke236") === false, "without a last-known row, the grown window alone answers (120s of quiet is death, not 15s)");
fs.rmSync(jobFile, { force: true });
ok(renderJobHeartbeatAlive("smoke236-missing") === false, "an absent job file is honestly dead (never a guess)");

// ── shape 4: the wiring source law ──
console.log("shape: the wiring source law");
ok(CRAFT_LEVER_LAW_VERSION === 236 && RENDER_NIGHT_PLAN_LAW_VERSION === 238, `the laws stand as numbered (lever v${CRAFT_LEVER_LAW_VERSION}, plan v${RENDER_NIGHT_PLAN_LAW_VERSION})`);
const leverSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/craft-lever.ts"), "utf8");
ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(leverSrc), "the lever law stays pure (no db, no fs)");
const planSrc2 = fs.readFileSync(path.join(process.cwd(), "src/lib/render-night-plan.ts"), "utf8");
ok(planSrc2.includes('craftLeverForCell') && planSrc2.includes('from "./craft-lever"'), "the plan reuses the lever law (byte-exact, no re-derivation)");
ok(planSrc2.includes("framings?: Record<string,"), "the framings arrive as the argument (the caller gathered them from the live shots)");

console.log(`\nsmoke 236: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
