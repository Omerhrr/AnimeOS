// RIDE 247 - THE FLOW SEAM'S OWN PROBE (the door's first honest ride).
//
// The 247 graduation opened the FLOW door (src/lib/bridge/flow.ts -
// the Veo 3.1 protocol under Google Flow, opt-in, key-carried,
// provenance-named). THIS ride is the probe:
//
//   --status    the door's own state, named (which law keeps it shut).
//   --probe     the ONE probe shot attempt: the REAL worst cell off the
//               committed release-path receipt (E7 Sc12 S004, floor 0.7,
//               the lever's own words verbatim), the member's sheet of
//               record declared as the ingredient, the aimed first frame
//               when the studio authored one - and the door answered
//               by its OWN laws: SUBMITTED (an operation riding) or the
//               honest stand-down (the opt-in law / the key law), the
//               236 law's own words on the row (the night's answer must
//               ride the aim's own pixels - an UNSCORED stand-down is
//               named, never counted).
//   --poll      poll the riding operation; the finished clip lands in
//               public/renders/{jobId}.mp4 (the output contract).
//
// THE NIGHT LAW: the FLOW probe is ITS OWN night (flow-2026-10-24) -
// never folded into a Blender night's key; the medians move only as
// the nights do, and a new author starts a new night, not a borrowed
// one. THE KEY LAW: the key arrives by env, never on disk - no row,
// no log, no receipt ever carries it. THE JUDGE KEEPS ITS TEETH: the
// probe's pixels, when they ride, face the same vision review, the
// same floors, the same medians - the door changes the author, never
// the bar.
//
// Run: npx tsx scripts/ride247-flow.ts --probe
import fs from "fs";
import {
  flowStatus, submitFlowJob, pollFlowJob, flowProvenance,
  buildFlowPrompt, flowCostEstimate, DEFAULT_FLOW_MODEL,
  type FlowIngredient, type FlowResolution,
} from "../src/lib/bridge/flow";
import { resolveImg2VidImageUrl } from "../src/lib/bridge/img2vid";

const RIDE_RECEIPT = "receipts/ride247.jsonl";
// THE NIGHT LAW: the probe's own night key - a new author's first night.
const NIGHT = "flow-2026-10-24";
// The probe's own shape at the 1280 rung: 96 frames at 24fps = 4s, wide.
const PROBE_SECONDS = 4;
const PROBE_RESOLUTION: FlowResolution = "1080p";
const PROBE_ASPECT = "16:9" as const;

interface ReleasePath {
  sources?: Array<{
    source?: string; floor?: number; leverLine?: string | null;
    blocking?: Array<{ worstRef?: string; p10?: number }>;
  }>;
}

function appendReceipt(row: Record<string, unknown>): void {
  fs.appendFileSync(RIDE_RECEIPT, JSON.stringify(row) + "\n");
}

function readWorstCell(): { ref: string; floor: number; leverLine: string; p10: number | null } {
  const raw = JSON.parse(fs.readFileSync("receipts/release-path.json", "utf8")) as ReleasePath;
  const render = raw.sources?.find((s) => s.source === "RENDER");
  if (!render) throw new Error("the release-path receipt carries no RENDER source - the map is the probe's input, never a guess");
  const worst = render.blocking?.[0];
  const ref = worst?.worstRef ?? "";
  if (!ref) throw new Error("the RENDER source names no worst ref - the probe rides the map's own cell, never an invented one");
  return {
    ref,
    floor: render.floor ?? 0.7,
    leverLine: render.leverLine ?? "",
    p10: worst?.p10 ?? null,
  };
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "--status";

  if (mode === "--status") {
    console.log(JSON.stringify(flowStatus(), null, 2));
    return;
  }

  if (mode === "--probe") {
    // THE OWNER'S OPT-IN: the probe's approval IS the opt-in - set on
    // this ride's own process only, named here, never persisted.
    process.env.ANIMEOS_FLOW = process.env.ANIMEOS_FLOW || "probe";
    const cell = readWorstCell();
    const status = flowStatus();
    console.log(`probe: the REAL worst cell ${cell.ref} (p10 ${cell.p10}, floor ${cell.floor})`);
    console.log(`probe: the lever's own words - ${cell.leverLine.slice(0, 140)}`);
    console.log(`probe: the door's state - ${JSON.stringify(status)}`);

    // THE INGREDIENT OF RECORD: the member's sheet, resolved only when
    // the caller hands a path (--sheet); the declared shape rides the
    // receipt either way, the image bytes never do.
    const sheetArg = arg("--sheet");
    const sheetImage = sheetArg ? resolveImg2VidImageUrl(sheetArg) : null;
    if (sheetArg && !sheetImage) {
      throw new Error(`the sheet path resolved to nothing rideable: ${sheetArg}`);
    }
    const ingredients: FlowIngredient[] = sheetImage
      ? [{ image: sheetImage, referenceType: "asset" }]
      : [];
    const firstFrame = arg("--first-frame");
    const firstFrameImage = firstFrame ? resolveImg2VidImageUrl(firstFrame) : null;

    const prompt = buildFlowPrompt({
      poseStart: null, // the probe's motion is ambient - the aim is identity at distance
      poseEnd: null,
      movement: "STATIC",
      shotType: "WIDE",
      lighting: null,
      ingredientsCount: ingredients.length,
      hasFirstFrame: !!firstFrameImage,
      speechLines: null,
    });
    const estimate = flowCostEstimate(DEFAULT_FLOW_MODEL, PROBE_SECONDS, PROBE_RESOLUTION);

    const res = await submitFlowJob({
      prompt,
      firstFrame: firstFrameImage,
      ingredients,
      durationSeconds: PROBE_SECONDS,
      resolution: PROBE_RESOLUTION,
      aspect: PROBE_ASPECT,
    });

    if (res.submitted) {
      const provenance = flowProvenance({
        model: res.model ?? DEFAULT_FLOW_MODEL,
        operation: res.operationName ?? null,
        seconds: PROBE_SECONDS,
        resolution: PROBE_RESOLUTION,
        aspect: PROBE_ASPECT,
        ingredients: ingredients.length,
        costUsdEstimate: res.costUsdEstimate ?? estimate,
      });
      appendReceipt({
        kind: "flow-probe", night: NIGHT, engine: "FLOW", ref: cell.ref,
        floor: cell.floor, leverLine: cell.leverLine, promptWords: prompt,
        outcome: "SUBMITTED", operation: res.operationName, provenance,
        closedReason: null, line: "the operation rides - the judge will read the pixels when they land",
        at: new Date().toISOString(),
      });
      console.log(`probe: SUBMITTED - operation ${res.operationName} (estimate $${res.costUsdEstimate ?? estimate})`);
      console.log("probe: poll with --poll --operation <name> --job <jobId>");
      return;
    }

    // THE HONEST STAND-DOWN - the 236 law's own words, the reason named.
    const closedReason = status.closedReason ?? "closed";
    const line = closedReason === "key absent"
      ? "the night's answer must ride the aim's own pixels - the door is built, the key is not present (the key law: the key arrives by env, never on disk); the probe rides UNSCORED and stands down honest"
      : "the night's answer must ride the aim's own pixels - the door stayed closed by the opt-in law; the probe rides UNSCORED and stands down honest";
    appendReceipt({
      kind: "flow-probe", night: NIGHT, engine: "FLOW", ref: cell.ref,
      floor: cell.floor, leverLine: cell.leverLine, promptWords: prompt,
      outcome: "STOOD_DOWN", operation: null,
      provenance: flowProvenance({
        model: DEFAULT_FLOW_MODEL, operation: null, seconds: PROBE_SECONDS,
        resolution: PROBE_RESOLUTION, aspect: PROBE_ASPECT,
        ingredients: ingredients.length, costUsdEstimate: estimate,
      }),
      closedReason, error: res.error ?? null, line,
      at: new Date().toISOString(),
    });
    console.log(`probe: STOOD_DOWN (${closedReason}) - ${res.error ?? ""}`);
    console.log("probe: the row landed honest - UNSCORED, named, never counted");
    return;
  }

  if (mode === "--poll") {
    const operation = arg("--operation");
    const job = arg("--job") ?? "flow-probe-247";
    if (!operation) throw new Error("--poll needs --operation <name> (the riding operation's own name)");
    const res = await pollFlowJob(job, operation);
    appendReceipt({
      kind: "flow-poll", night: NIGHT, engine: "FLOW", operation,
      outcome: res.error ? "ERROR" : res.mp4Path ? "LANDED" : "RIDING",
      mp4Path: res.mp4Path ?? null, error: res.error ?? null,
      line: res.mp4Path ? "the clip landed - the judge's read rides next" : (res.error ?? "the operation still rides"),
      at: new Date().toISOString(),
    });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  throw new Error(`unknown mode ${mode} - the probe rides --status | --probe | --poll`);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
