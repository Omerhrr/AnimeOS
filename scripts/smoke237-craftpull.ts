// SMOKE 237 - THE LEVER PULLS: the aim becomes the render's craft.
// The 236 plan aimed every call with a line of prose - and prose
// renders nothing: the judge scored the same craft a third time. The
// 237 graduation wires the pull end to end: the plan's calls carry
// the RUNG beside the line (render-night-plan.ts v237), the payload
// carries shot.craftAim (render.ts - aimed only, byte-exact without),
// the pass threads the aim by ref and names it on the row, and the
// worker grows the rung's own craft arm (animeos_bridge.py: the FACE
// framings ride the 1024 texel rung - the 138/164 precedent; the
// PAINT rides 24 samples + denoising - the 140 statement's language
// stays byte-exact, the quality is the craft, never the goalpost).
// This smoke asserts the rung routing, the wire's every seam, and
// the bridge's additive arms - the standing craft answers byte-exact
// wherever the aim is absent.
// Run: npx tsx scripts/smoke237-craftpull.ts
import fs from "fs";
import path from "path";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION, type PlanMemberQueue } from "../src/lib/render-night-plan";
import { carriedAcceptanceVerdicts, carryEntriesFromRideReceipts, ACCEPTANCE_CARRY_LAW_VERSION } from "../src/lib/acceptance-carry";
import type { RepairWorkOrder } from "../src/lib/repair-work-order";
import type { CarriedVerdict } from "../src/lib/acceptance-carry";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

// ── shape 1: the plan carries the rung ──
console.log("shape: the plan carries the rung beside the line");
const ORDER: RepairWorkOrder = {
  source: "RENDER",
  verdict: "BELOW",
  night: "repair-2026-10-20",
  budget: { members: 4, shotsPerMember: 3, shotsPerPass: 4 },
  namedRefs: ["E7 Sc12 S002", "E7 Sc12 S004"],
  answeredBy: "repair-pass",
  orderLine: "RENDER sits BELOW - the named cells ride first.",
};
const QUEUES: PlanMemberQueue[] = [
  {
    member: "Lin Yue",
    below: [
      { shotId: "shot-s002", ref: "E7 Sc12 S002", similarity: 0.25 },
      { shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.55 },
    ],
  },
];
const FRAMINGS: Record<string, "close" | "med" | "wide"> = { "shot-s002": "med", "shot-s004": "wide" };
const honest = (v: CarriedVerdict, line: string) => [{ characterName: "Lin Yue", verdict: v, night: "acceptance-2026-10-18", line }];

const aimed = renderNightPlan({ order: ORDER, queues: QUEUES, carry: honest("STAND_DOWN_HONEST", "the honest receipt stands - the reference does not move, and the craft lever for a score is the craft, never a moved goalpost"), night: "repair-2026-10-20", framings: FRAMINGS });
ok(aimed.ok && aimed.calls.length === 2, "the aimed plan carries both calls");
const c1 = aimed.ok ? aimed.calls[0] : null;
const c2 = aimed.ok ? aimed.calls[1] : null;
ok(!!c1 && c1.ref === "E7 Sc12 S002" && c1.rung === "face", "the med cell's call carries the FACE rung (the matrix's own bucket)");
ok(!!c1 && c1.lever === "E7 Sc12 S002: the judge reads the build's face at this framing - the face craft's own answer is the lever; the proportion lever is spent (probe-140's own verdict).", "the face aim's line rides byte-exact with its rung");
ok(!!c2 && c2.ref === "E7 Sc12 S004" && c2.rung === "paint", "the wide cell's call carries the PAINT rung");
ok(!!c2 && c2.lever === "E7 Sc12 S004: the judge reads the paint at this framing - the toon look's own language at the wide-end framing is the lever.", "the paint aim's line rides byte-exact with its rung");
ok(!!c1 && !!c2 && (c1.rung === null) === (c1.lever === null) && (c2.rung === null) === (c2.lever === null), "the rung and the line ride together (an aim is both or neither)");

const unframed = renderNightPlan({ order: ORDER, queues: QUEUES, carry: honest("STAND_DOWN_HONEST", "the honest receipt stands"), night: "repair-2026-10-20" });
ok(unframed.ok && unframed.calls.every((c) => c.rung === null && c.lever === null), "a shot the framings map lacks rides lever null AND rung null - named, never guessed");

const waiting = renderNightPlan({ order: ORDER, queues: QUEUES, carry: honest("NONE", "the acceptance waits for its own night"), night: "repair-2026-10-20", framings: FRAMINGS });
ok(waiting.ok && waiting.calls.every((c) => c.rung === null && c.lever === null), "a NONE carry arms nothing - the lever speaks only under the honest receipt");

const regenOwed = renderNightPlan({ order: ORDER, queues: QUEUES, carry: honest("REGEN_OWED", "the cell owes the reference work first"), night: "repair-2026-10-20", framings: FRAMINGS });
ok(regenOwed.ok && regenOwed.calls.every((c) => c.rung === null && c.lever === null), "a REGEN_OWED cell arms nothing - the reference work comes first");

// ── shape 1b: the classifier reads the acceptance's own shapes ──
console.log("shape: the classifier reads the acceptance's own shapes (the 237 growth)");
const nightCallRow = {
  kind: "night-call",
  night: "repair-2026-10-18-ii",
  members: [{ name: "Demon Lord Wei", reanchored: false, reanchorNote: "the honest receipt stands - the build (#4a2242) wears the design's class (dLum 0.018, dHue 0.036); the reference does not move" }],
};
const { entries } = { entries: carryEntriesFromRideReceipts([nightCallRow]) };
ok(entries.length === 1 && entries[0].verdict === "STAND_DOWN_HONEST" && entries[0].characterName === "Demon Lord Wei", "a night-call row's honest receipt classifies STAND_DOWN_HONEST (the 235-ii shape - Wei's answer joins the carry)");
const acceptanceRow = { kind: "acceptance", night: "acceptance-2026-10-18", members: [{ name: "Lin Yue", reanchored: false, reanchorNote: "the honest receipt stands - the build (#1b4d3e) wears the design's class" }] };
ok(carryEntriesFromRideReceipts([acceptanceRow])[0]?.verdict === "STAND_DOWN_HONEST", "the dedicated acceptance row still classifies (the 234 shape byte-exact)");
const regenRow = { kind: "night-call", night: "repair-2026-10-20", members: [{ name: "Lin Yue", reanchored: true, reanchorNote: "accepted" }] };
ok(carryEntriesFromRideReceipts([regenRow])[0]?.verdict === "REGEN_OWED", "an accepted sheet in a night-call row classifies REGEN_OWED (the reference moved)");
const closingRow = { kind: "closing", night: undefined, members: [{ name: "Lin Yue", reanchored: false, reanchorNote: "the honest receipt stands" }] };
ok(carryEntriesFromRideReceipts([closingRow as never]).length === 0, "a row without a night carries nothing (the closing rows ride no acceptance beat)");

// ── shape 2: the wire's every seam (the TS source law) ──
console.log("shape: the wire's every seam (the TS source law)");
ok(RENDER_NIGHT_PLAN_LAW_VERSION === 237 && ACCEPTANCE_CARRY_LAW_VERSION === 237, `the laws stand as numbered (plan v${RENDER_NIGHT_PLAN_LAW_VERSION}, carry v${ACCEPTANCE_CARRY_LAW_VERSION})`);
const renderSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/engine/render.ts"), "utf8");
ok(renderSrc.includes("export interface CraftAim") && renderSrc.includes('rung: "face" | "paint"'), "the render engine names the CraftAim (rung + line)");
ok(renderSrc.includes("craft?: CraftAim | null,") || renderSrc.includes("craft?: CraftAim | null"), "createRenderJob grows the craft aim (optional - the standing callers byte-exact)");
ok(renderSrc.includes("...(craft ? { craftAim: { rung: craft.rung, line: craft.line } } : {})"), "the payload carries craftAim ONLY when aimed (an unaimed render rides no aim)");
ok(!/\.\.\.\(craft \? \{ craftAim[^]*craftAim: null/.test(renderSrc), "no aim ever rides as a null field - absent, never null");
const repairSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/identity-repair.ts"), "utf8");
ok(repairSrc.includes("craftAims?: Array<CraftAim & { ref: string }>"), "the pass grows the craftAims opt (ref-keyed, the plan's own shape)");
ok(repairSrc.includes('opts?.craftAims?.find((a) => a.ref === t.ref) ?? null'), "the pass matches the aim by ref (named, never guessed)");
ok(repairSrc.includes("...(aim ? { craftAim: { rung: aim.rung, line: aim.line } } : {})"), "the shot row names the aim it pulled (the ledger honest at the seam)");
ok(repairSrc.includes("createRenderJob(projectId, shotId, \"PREVIEW\", craft ?? null)"), "renderAndWait threads the aim into the fallback queue (the resume door keeps its law)");
const rideSrc = fs.readFileSync(path.join(process.cwd(), "scripts/ride237-nights.ts"), "utf8");
ok(rideSrc.includes("const craft = call.rung && call.lever ? { rung: call.rung, line: call.lever } : null;"), "the prerender aims the queue (the bridge renders the aimed craft across the boundary)");
ok(rideSrc.includes("craftAims,"), "the ride passes the craftAims (the pass's re-queue pulls the aimed arm)");
ok(rideSrc.includes('const NIGHT = "repair-2026-10-20"'), "the aimed night owns its own key (the fold law - the medians move only as the nights do)");
ok(rideSrc.includes("identityFramingBucket(s.shotType)"), "the framings map rides the matrix's own read (one law, two runtimes)");

// ── shape 3: the bridge's additive arms (the pull's own runtime) ──
console.log("shape: the bridge's additive arms (the pull's own runtime)");
const br = fs.readFileSync(path.join(process.cwd(), "bridges/blender/animeos_bridge.py"), "utf8");
ok(br.includes('CRAFT_AIM_LAW_VERSION = "craft-v1"') && br.includes('CRAFT_RUNGS = ("face", "paint")'), "the craft aim law stands as named (craft-v1, the two rungs)");
ok(br.includes('if rung not in CRAFT_RUNGS:') && br.includes('rung = str(raw.get("rung") or "").strip().lower()'), "a corrupt or unknown aim degrades honestly to None (the standing craft answers)");
ok(br.includes('cap = preview_cap_for(shot.get("shotType"), mode)'), "the ladder's own call site stands byte-exact (the 138/164 pins keep answering)");
ok(br.includes('if str(shot.get("shotType") or "").upper() not in ("WIDE", "WS", "ESTABLISHING", "OTS"):') && br.includes("cap = ESTABLISHING_CAP"), "the FACE arm lifts the matrix's close/med framings to the 1024 rung (the identityFramingBucket mirror - one law, two runtimes)");
ok(br.includes('if _aim and _aim["rung"] == "face" and str(mode or "PREVIEW").upper() != "FINAL":'), "the FACE arm fires only under the face aim, never at FINAL (1280 stays)");
ok(br.includes("(24 if (_tight_preview or _paint_aim) else 10)"), "the PAINT arm rides 24 samples beside the tight-preview law (the wide framings keep the 10-sample fast path unaimed)");
ok(br.includes("scn.cycles.use_denoising = (mode == \"FINAL\") or _paint_aim"), "the PAINT arm denoises the aimed preview (FINAL keeps the 48-sample denoised law)");
ok(br.includes('if _aim:\n            state["craftAim"] = _aim'), "the aimed render names the rung it pulled in its own evidence (the receipts honest at the seam)");
ok(br.includes("_paint_aim = bool(_aim and _aim[\"rung\"] == \"paint\" and str(mode or \"PREVIEW\").upper() != \"FINAL\")"), "the PAINT arm fires only under the paint aim, never at FINAL");

console.log(`\nsmoke 237: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
