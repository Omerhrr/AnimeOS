// SMOKE 247 - THE FLOW SEAM'S OWN LAWS: the door to the engine under
// Google Flow (Veo 3.1) opened as the 247 graduation, born under the
// img2vid demotion precedent - OPT-IN (a generative author is a
// choice, never a default), KEY-CARRIED (the key arrives by env,
// never on disk - the token law's twin), PROVENANCE-NAMED (engine
// FLOW, the model id, the operation, the cost estimate, the SynthID
// note), OUTPUT-CONTRACTED (public/renders/{jobId}.mp4, the key on
// the download header, never the URL), and SEAMED (the probe rides
// the bridge module directly - the production driver chain is
// untouched until the judge's first FLOW read answers). THE JUDGE
// KEEPS ITS TEETH: FLOW pixels face the same vision review, the
// same floors (p10 >= floor AND mean >= floor), the same medians
// law - the door changes the author, never the bar. THIS smoke pins
// the door's own bytes (the env laws, no key literal), the pure
// laws exact (status reasons, prompt words, request shape with the
// honest 3-ingredient cap, the duration clamp onto the model's own
// contract, the cost table, the provenance), the submit refusals
// exact, THE REAL LANDED ROW re-read honest (the probe's own night
// key flow-2026-10-24, the REAL worst cell E7 Sc12 S004 off the
// committed map, the STOOD_DOWN outcome with its named reason and
// the 236 law's own words), and the receipt free of key bytes.
//
// Run: npx tsx scripts/smoke247-flowseam.ts
import fs from "fs";
import {
  flowStatus, flowOptIn, flowKey, flowModel, flowBase,
  flowDurationClamp, flowCostPerSecond, flowCostEstimate,
  buildFlowPrompt, buildFlowRequest, flowProvenance, submitFlowJob,
  FLOW_INGREDIENTS_MAX, DEFAULT_FLOW_MODEL, DEFAULT_FLOW_BASE,
} from "../src/lib/bridge/flow";

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; } else { fail++; console.log(`  FAIL: ${msg}`); } }

// ── shape 1: the door's own bytes - the env laws, no key literal ──
console.log("shape: the door's own bytes - the laws live in the source");
const src = fs.readFileSync("src/lib/bridge/flow.ts", "utf8");
ok(src.includes('const KEY_ENV_KEY = "ANIMEOS_FLOW_KEY";'), "the key's env name is the law's own (ANIMEOS_FLOW_KEY)");
ok(src.includes('const OPT_ENV_KEY = "ANIMEOS_FLOW";'), "the opt-in's env name is the law's own (ANIMEOS_FLOW)");
ok(src.includes("read lazily"), "the key reads lazily (operators and tests set the env after import)");
ok(src.includes("never on disk") && src.includes("the token law's twin"), "the key law names itself beside the token law");
ok(!/AIza[0-9A-Za-z_\-]{10,}/.test(src), "no key literal rides the source (the standing grep)");
ok(src.includes("x-goog-api-key") && src.includes("never the URL"), "the download carries the key on the HEADER, never the URL");
ok(src.includes("SynthID"), "the SynthID note rides the provenance (named, never hidden)");
ok(src.includes("p10 >= floor AND mean >= floor"), "the judge's own floors named in the door's header (the teeth stay in the law)");

// ── shape 2: the opt-in law exact - a closed door names which law shut it ──
console.log("shape: the opt-in law exact");
delete process.env.ANIMEOS_FLOW;
delete process.env.ANIMEOS_FLOW_KEY;
ok(flowOptIn() === false, "env unset: the opt-in reads closed");
const st1 = flowStatus();
ok(st1.available === false && st1.closedReason === "opt-in closed", "closed door names the opt-in law, never guessed");
ok(st1.model === DEFAULT_FLOW_MODEL && st1.base === DEFAULT_FLOW_BASE, "the model and base carry the defaults");
process.env.ANIMEOS_FLOW = "probe";
const st2 = flowStatus();
ok(st2.optIn === true && st2.keyed === false && st2.closedReason === "key absent", "opt-in on, key absent: the reason names the key law");
ok(st2.available === false, "opt-in alone does not open the door (both laws must answer)");
process.env.ANIMEOS_FLOW_KEY = "test-key-shape-only";
ok(flowStatus().available === true, "opt-in + key: the door reads available");
ok(flowKey() === "test-key-shape-only", "the key reads from env only");
delete process.env.ANIMEOS_FLOW_KEY;

// ── shape 3: the submit refusals exact (the door refuses by name) ──
console.log("shape: the submit refusals exact");
const reqFixture = {
  prompt: "fixture prompt", ingredients: [] as never[],
  durationSeconds: 4, resolution: "1080p" as const, aspect: "16:9" as const,
};
async function shape3(): Promise<void> {
  delete process.env.ANIMEOS_FLOW;
  delete process.env.ANIMEOS_FLOW_KEY;
  const refused1 = await submitFlowJob(reqFixture);
  ok(refused1.submitted === false && (refused1.error ?? "").includes("the opt-in law"), "closed opt-in: the refusal names the opt-in law");
  process.env.ANIMEOS_FLOW = "probe";
  const refused2 = await submitFlowJob(reqFixture);
  ok(refused2.submitted === false && (refused2.error ?? "").includes("ANIMEOS_FLOW_KEY not set") && (refused2.error ?? "").includes("never on disk"), "key absent: the refusal names the key law verbatim");
  delete process.env.ANIMEOS_FLOW;
}

// ── shape 4: the prompt's own words (pure - the identity-lock law rides) ──
console.log("shape: the prompt's words carry the identity-lock law");
const prompt = buildFlowPrompt({
  poseStart: null, poseEnd: null, movement: "STATIC", shotType: "WIDE",
  lighting: null, ingredientsCount: 1, speechLines: null,
});
ok(prompt.includes("cinematic anime (donghua) shot"), "the prompt names the craft (donghua, not generic video)");
ok(prompt.includes("reference images are the character sheets of record"), "the ingredients are named the sheets of record");
ok(prompt.includes("wide or close"), "the face-hold law rides the prompt (identity at every distance - the wide cell's own fight)");
ok(prompt.includes("EXACTLY as in the reference images"), "the identity-lock words ride verbatim (the img2vid precedent's own law)");
const promptSpeak = buildFlowPrompt({
  poseStart: null, poseEnd: null, movement: "DOLLY_IN", shotType: "CLOSEUP",
  lighting: "storm light", ingredientsCount: 0, speechLines: ["hold the line"],
});
ok(promptSpeak.includes("the camera pushes in toward the subject") && promptSpeak.includes("close view"), "the camera gloss rides the movement and shot type");
ok(promptSpeak.includes("SPEAKS out loud") && promptSpeak.includes("hold the line"), "the speech line rides when the shot speaks");
ok(!/reference images are the character sheets/.test(promptSpeak) && promptSpeak.includes("UNANCHORED GENERATION"), "zero anchors: the UNANCHORED warning rides (the anchor law - never an anchor the request cannot back)");
const promptFramed = buildFlowPrompt({
  poseStart: null, poseEnd: null, movement: "STATIC", shotType: "WIDE",
  lighting: null, ingredientsCount: 0, hasFirstFrame: true, speechLines: null,
});
ok(promptFramed.includes("EXACTLY as in the source frame") && !promptFramed.includes("UNANCHORED"), "first frame only: the lock names the source frame (the other anchor)");

// ── shape 5: the request shape exact (the bytes the door receives) ──
console.log("shape: the request shape exact");
const ing = (n: number) => Array.from({ length: n }, (_, i) => ({ image: `data:image/png;base64,ing${i}`, referenceType: "asset" as const }));
const built = buildFlowRequest({
  prompt: "p", firstFrame: "data:image/png;base64,ff", lastFrame: "data:image/png;base64,lf",
  ingredients: ing(2), durationSeconds: 4, resolution: "1080p", aspect: "16:9",
});
ok(built.body.instances.length === 1 && built.body.instances[0].prompt === "p", "one instance carries the prompt");
ok(built.body.instances[0].image === "data:image/png;base64,ff", "the first frame rides the instance (the studio-authored key pose)");
ok(built.body.parameters.lastFrame === "data:image/png;base64,lf", "the last frame rides parameters (the bridge law)");
ok(built.body.parameters.referenceImages?.length === 2 && built.body.parameters.referenceImages[0].referenceType === "asset", "the ingredients ride parameters with their reference type");
ok(built.body.parameters.durationSeconds === 4 && built.body.parameters.resolution === "1080p" && built.body.parameters.aspectRatio === "16:9", "the shape parameters carry the probe's own rung");
const overcapped = buildFlowRequest({ prompt: "p", ingredients: ing(5), durationSeconds: 4, resolution: "720p", aspect: "16:9" });
ok(overcapped.body.parameters.referenceImages?.length === FLOW_INGREDIENTS_MAX && overcapped.droppedIngredients === 2, "THE HONEST CAP: the 4th+ ingredient rides out NAMED (droppedIngredients), never silently");
const clampedLong = buildFlowRequest({ prompt: "p", ingredients: ing(1), durationSeconds: 30, resolution: "720p", aspect: "16:9" });
ok(clampedLong.body.parameters.durationSeconds === 8, "the duration clamps onto the model's own contract (30 -> 8)");
ok(flowDurationClamp(96 / 24) === 4, "the 96-frame rung at 24fps clamps to 4s (the probe's own shape)");
ok(flowDurationClamp(5) === 6 || flowDurationClamp(5) === 4, "an off-contract duration lands on the nearest honored length");

// ── shape 6: the cost table exact (the honest arithmetic before the call) ──
console.log("shape: the cost table exact");
ok(flowCostPerSecond("veo-3.1-generate-preview", "1080p") === 0.40, "standard 1080p: $0.40/s");
ok(flowCostPerSecond("veo-3.1-generate-preview", "4k") === 0.60, "standard 4k: $0.60/s");
ok(flowCostPerSecond("veo-3.1-fast-generate-preview", "720p") === 0.10, "fast 720p: $0.10/s");
ok(flowCostPerSecond("veo-3.1-fast-generate-preview", "1080p") === 0.12, "fast 1080p: $0.12/s");
ok(flowCostPerSecond("veo-3.1-fast-generate-preview", "4k") === 0.30, "fast 4k: $0.30/s");
ok(flowCostPerSecond("veo-3.1-lite-generate-preview", "720p") === 0.05 && flowCostPerSecond("veo-3.1-lite-generate-preview", "1080p") === 0.08, "lite: $0.05/$0.08 per second");
ok(flowCostPerSecond("veo-3.1-lite-generate-preview", "4k") === null, "an unpublished pair reads null (honest, never guessed)");
ok(flowCostEstimate(DEFAULT_FLOW_MODEL, 4, "1080p") === 1.6, "the probe's own shape estimates $1.60 (4s x $0.40)");

// ── shape 7: the provenance law (every receipt names the author) ──
console.log("shape: the provenance law");
const prov = flowProvenance({
  model: DEFAULT_FLOW_MODEL, operation: "models/veo-3.1-generate-preview/operations/abc",
  seconds: 4, resolution: "1080p", aspect: "16:9", ingredients: 1, costUsdEstimate: 1.6,
});
ok(prov.engine === "FLOW", "the author is named FLOW");
ok(prov.synthid === true, "synthid rides always (the watermark is in the pixels, named never hidden)");
ok(prov.note.includes("named never hidden"), "the note's own words pin the law");
const provStanddown = flowProvenance({
  model: DEFAULT_FLOW_MODEL, operation: null, seconds: 4,
  resolution: "1080p", aspect: "16:9", ingredients: 0, costUsdEstimate: null,
});
ok(provStanddown.operation === null && provStanddown.costUsdEstimate === null, "a stand-down's provenance carries the honest nulls");

// ── shape 8: THE REAL LANDED ROW re-reads honest (the probe's own receipt) ──
console.log("shape: the REAL landed probe row re-reads honest");
const rideSrc = fs.readFileSync("scripts/ride247-flow.ts", "utf8");
ok(rideSrc.includes('const NIGHT = "flow-2026-10-24";'), "the probe's night key is ITS OWN (a new author starts a new night - never a repair- tag)");
ok(!rideSrc.includes('NIGHT = "repair-'), "the probe never borrows a Blender night key (the medians move only as the nights do)");
ok(rideSrc.includes('const RIDE_RECEIPT = "receipts/ride247.jsonl";'), "the ride receipts under its own key");
ok(rideSrc.includes("receipts/release-path.json"), "the probe's cell comes off the committed map (never a guess)");
ok(rideSrc.includes("the night's answer must ride the aim's own pixels"), "the 236 law's own words ride the stand-down");
ok(rideSrc.includes("PROBE_SECONDS = 4") && rideSrc.includes('PROBE_RESOLUTION: FlowResolution = "1080p"'), "the probe's own rung: 4s at 1080p (the 96-frame shape)");
const rows = fs.readFileSync("receipts/ride247.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
ok(rows.length >= 1, "the probe's receipt carries its row(s)");
// THE LATEST ATTEMPT: the receipt is append-only history; the smoke pins
// the newest flow-probe row (the ride's own fold law at the receipt seam).
const probeRowsAll = rows.filter((r) => r.kind === "flow-probe") as Array<{ night?: string; engine?: string; ref?: string; floor?: number; outcome?: string; closedReason?: string | null; line?: string; promptWords?: string; leverLine?: string; provenance?: { engine?: string; synthid?: boolean; operation?: string | null } }>;
const probe = probeRowsAll[probeRowsAll.length - 1];
ok(probe !== undefined, "the flow-probe row is on the receipts");
ok(probe?.night === "flow-2026-10-24", "the landed row rides the probe's OWN night");
ok(probe?.engine === "FLOW", "the landed row names the author FLOW");
ok(probe?.ref === "E7 Sc12 S004", "the landed row names the REAL worst cell off the committed map");
ok(probe?.floor === 0.7, "the landed row carries the floor (0.7) beside the cell");
ok((probe?.leverLine ?? "").includes("the texels at the small figure"), "the lever's own words ride the row verbatim");
ok(probe?.outcome === "STOOD_DOWN", "the landed outcome is the honest STOOD_DOWN (UNSCORED, named, never counted)");
ok(probe?.closedReason === "key absent", "the stand-down's reason names the key law (key absent)");
ok((probe?.line ?? "").includes("the door is built, the key is not present"), "the 236 law's own words on the landed line");
ok(probe?.provenance?.engine === "FLOW" && probe?.provenance?.synthid === true && probe?.provenance?.operation === null, "the landed provenance carries the honest nulls");
ok((probe?.promptWords ?? "").includes("UNANCHORED GENERATION"), "the landed prompt carries the anchor law's own words (the craft seam the first attempt taught, grown before the smoke)");
ok(!/AIza[0-9A-Za-z_\-]{10,}/.test(fs.readFileSync("receipts/ride247.jsonl", "utf8")), "no key bytes ride the receipt (the standing grep, the key law's teeth)");

// ── shape 9: the seam law (the driver chain waits for the judge's answer) ──
console.log("shape: the seam law - the driver chain untouched until the judge answers");
const renderSrc = fs.readFileSync("src/lib/engine/render.ts", "utf8");
ok(!renderSrc.includes("bridge/flow"), "render.ts does not import the FLOW door yet (the wiring is the post-probe graduation, earned by the judge's own verdict)");
ok(renderSrc.includes("IMG2VID") && renderSrc.includes("SIMULATOR"), "the driver chain's existing doors stand untouched");

shape3().then(() => {
  console.log(`\nsmoke247: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
});
