// ─────────────────────────────────────────────────────────────
// FLOW SEAM (the Veo 3.1 door - the engine under Google Flow)
//
// The 247 graduation: the OWNER asked "what if we add Google Flow
// to AnimeOS" and the honest answer named the door. Google Flow
// (the app) has NO API - it is a subscription surface whose credits
// live on a consumer account; the MODEL under it (Veo 3.1) speaks
// the Gemini API's predictLongRunning protocol, and THIS module is
// the studio's one door to that protocol:
//
//   POST {base}/models/{model}:predictLongRunning
//        x-goog-api-key: <the key - env only, never disk>
//        {"instances":[{"prompt", "image"?}], "parameters":{...}}
//     → 200 {"name": "models/.../operations/<id>"}   (an operation)
//   GET  {base}/{operation.name}
//        → {"done": true, "response": {...generatedSamples[].video.uri}}
//
// THE LAWS THIS DOOR RIDES (each named, each tested):
//   • THE KEY LAW    - the key arrives by env (ANIMEOS_FLOW_KEY),
//     read lazily, never logged, never written to any receipt,
//     never committed - the token law's twin.
//   • THE OPT-IN LAW - the door opens only when ANIMEOS_FLOW is
//     explicitly on/probe/true AND the key is present (the img2vid
//     demotion precedent: the studio's output is designed, not
//     generated - a generative door is a choice, never a default).
//   • THE PROVENANCE LAW - every receipt names the author: engine
//     FLOW, the model id, the operation name, seconds, resolution,
//     the cost estimate, and the SynthID note (Google's own
//     provenance watermark rides the generated pixels - named,
//     never hidden).
//   • THE OUTPUT CONTRACT - the finished clip downloads into
//     public/renders/{jobId}.mp4, the same door every engine uses;
//     the key rides the download HEADER, never the URL.
//   • THE JUDGE KEEPS ITS TEETH - FLOW pixels ride the same vision
//     review, the same floors (p10 >= floor AND mean >= floor), the
//     same night-tagged arc appends, the same medians law (the
//     medians move only as the nights do). If the read sits under
//     the floor, BELOW stays honest - the door changes the author,
//     never the bar.
//   • THE SEAM LAW   - the probe rides THIS module directly; the
//     production driver chain (render.ts) is untouched until the
//     judge's first FLOW read answers - the wiring is the
//     post-probe graduation, earned by the judge's own verdict.
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const OPT_ENV_KEY = "ANIMEOS_FLOW";
const KEY_ENV_KEY = "ANIMEOS_FLOW_KEY";
const MODEL_ENV_KEY = "ANIMEOS_FLOW_MODEL";
const BASE_ENV_KEY = "ANIMEOS_FLOW_BASE";

export const DEFAULT_FLOW_MODEL = "veo-3.1-generate-preview";
export const DEFAULT_FLOW_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Ingredients-to-video: the model takes at most 3 reference images. */
export const FLOW_INGREDIENTS_MAX = 3;

/** The durations the model honors (seconds), per its own contract. */
export const FLOW_DURATIONS = [4, 6, 8] as const;

export type FlowResolution = "720p" | "1080p" | "4k";
export type FlowAspect = "16:9" | "9:16";

/** Read lazily so operators (and tests) can set the env after import. */
export function flowOptIn(): boolean {
  const flag = String(process.env[OPT_ENV_KEY] ?? "").trim().toLowerCase();
  return ["on", "probe", "true", "1"].includes(flag);
}

/** THE KEY LAW: the key lives in the environment, only in the environment. */
export function flowKey(): string | null {
  const key = String(process.env[KEY_ENV_KEY] ?? "").trim();
  return key.length > 0 ? key : null;
}

export function flowModel(): string {
  return String(process.env[MODEL_ENV_KEY] ?? "").trim() || DEFAULT_FLOW_MODEL;
}

export function flowBase(): string {
  return String(process.env[BASE_ENV_KEY] ?? "").trim() || DEFAULT_FLOW_BASE;
}

export interface FlowStatus {
  available: boolean;
  optIn: boolean;
  keyed: boolean;
  model: string;
  base: string;
  /** The named reason when the door is closed - never guessed. */
  closedReason: "opt-in closed" | "key absent" | null;
}

/** The door's own state: which law keeps it shut, named exactly. */
export function flowStatus(): FlowStatus {
  const optIn = flowOptIn();
  const keyed = flowKey() !== null;
  const closedReason = !optIn ? "opt-in closed" : !keyed ? "key absent" : null;
  return {
    available: optIn && keyed,
    optIn,
    keyed,
    model: flowModel(),
    base: flowBase(),
    closedReason,
  };
}

/** Clamp a requested duration onto the model's own contract. */
export function flowDurationClamp(seconds: number): (typeof FLOW_DURATIONS)[number] {
  const s = Math.min(8, Math.max(4, Math.round(seconds)));
  let best: (typeof FLOW_DURATIONS)[number] = 4;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const d of FLOW_DURATIONS) {
    const dist = Math.abs(d - s);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────
// THE COST TABLE (the model's own published per-second prices -
// the honest arithmetic the probe reports BEFORE the call).
// ─────────────────────────────────────────────────────────────

const COST_PER_SECOND: Record<string, Partial<Record<FlowResolution, number>>> = {
  "veo-3.1-generate-preview": { "720p": 0.40, "1080p": 0.40, "4k": 0.60 },
  "veo-3.1-fast-generate-preview": { "720p": 0.10, "1080p": 0.12, "4k": 0.30 },
  "veo-3.1-lite-generate-preview": { "720p": 0.05, "1080p": 0.08 },
};

/** Per-second price for a model/resolution, or null when unpublished (honest). */
export function flowCostPerSecond(model: string, resolution: FlowResolution): number | null {
  return COST_PER_SECOND[model]?.[resolution] ?? null;
}

/** The clip's estimated cost, or null when the table does not name the pair. */
export function flowCostEstimate(model: string, seconds: number, resolution: FlowResolution): number | null {
  const per = flowCostPerSecond(model, resolution);
  return per === null ? null : Math.round(per * seconds * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// THE PROMPT (pure - the ride's smoke asserts on its words). The
// identity-lock law rides verbatim from the img2vid precedent: the
// sheets are the identity, the ingredients carry it, and the words
// name what the model must hold.
// ─────────────────────────────────────────────────────────────

export interface FlowPromptInput {
  poseStart: string | null;
  poseEnd: string | null;
  movement: string | null;
  shotType: string;
  lighting: string | null;
  ingredientsCount: number;
  /** Whether an authored first frame rides the request (the other anchor). */
  hasFirstFrame?: boolean;
  speechLines?: string[] | null;
}

export function buildFlowPrompt(input: FlowPromptInput): string {
  const beat = input.poseStart && input.poseEnd && input.poseStart !== input.poseEnd
    ? `The main character performs a smooth, physical movement: ${input.poseStart}, flowing continuously into ${input.poseEnd} by the end of the clip.`
    : input.poseStart || input.poseEnd
      ? `The main character holds ${input.poseStart ?? input.poseEnd} with subtle living motion - breathing, weight shifts, cloth drift.`
      : "The scene stays alive with subtle ambient motion.";
  const camera = MOVEMENT_GLOSS[input.movement?.toUpperCase() ?? ""] ?? "the camera holds still";
  const framing = SHOT_GLOSS[input.shotType.toUpperCase()] ?? "medium view";
  const ingredients = input.ingredientsCount > 0
    ? `The reference images are the character sheets of record: ${input.ingredientsCount} ingredient(s) - the character's face, hair, outfit and palette hold to them at every distance, wide or close.`
    : null;
  // THE ANCHOR LAW: the identity-lock words name what ACTUALLY rides -
  // never an anchor the request cannot back (the judge reads drift
  // honestly, so the words must too).
  const anchor = input.ingredientsCount > 0
    ? "Keep the character's face, hair, outfit, colors and art style EXACTLY as in the reference images - same identity, same palette."
    : input.hasFirstFrame
      ? "Keep the character's face, hair, outfit, colors and art style EXACTLY as in the source frame - same identity, same palette."
      : "UNANCHORED GENERATION - no sheet of record and no authored frame rides this request; the judge will read the drift honestly.";
  const speech = (input.speechLines ?? []).filter((l) => l?.trim()).slice(0, 2);
  const speechLine = speech.length > 0
    ? `The main character SPEAKS out loud: "${speech.map((l) => l.trim().slice(0, 120)).join(" ... ")}" - the lips and jaw articulate the words in natural lip-sync.`
    : null;
  const parts = [
    "Render this as a cinematic anime (donghua) shot.",
    ingredients,
    beat,
    speechLine,
    `Camera work: ${camera}, ${framing}.`,
    input.lighting ? `Lighting mood: ${input.lighting}.` : null,
    anchor,
    "Consistent single character, smooth natural motion, no cuts, no text, no watermark.",
  ];
  return parts.filter(Boolean).join(" ");
}

const MOVEMENT_GLOSS: Record<string, string> = {
  ORBIT: "the camera orbits around the subject",
  DOLLY_IN: "the camera pushes in toward the subject",
  STATIC: "the camera holds still",
  PAN: "the camera pans across the scene",
  TRACKING: "the camera tracks alongside the subject",
  CRANE: "the camera cranes up and over the scene",
};

const SHOT_GLOSS: Record<string, string> = {
  ESTABLISHING: "wide establishing view",
  WIDE: "wide view, subject small in a large environment",
  MEDIUM: "medium view, waist-up on the subject",
  CLOSEUP: "close view on the subject",
  EXTREME_CLOSEUP: "extreme close view on one detail",
  LOW_ANGLE: "low-angle view looking up at the subject",
};

// ─────────────────────────────────────────────────────────────
// THE REQUEST BUILDER (pure - the exact bytes the door receives).
// Shape per the model's own protocol: the prompt (and the first
// frame, when the studio authors one) ride instances; the shape
// parameters and the ingredients ride parameters.
// ─────────────────────────────────────────────────────────────

export interface FlowIngredient {
  /** base64 data URL or https URL of a reference image (a sheet of record). */
  image: string;
  /** "asset" = character/object identity; "style" = the look of record. */
  referenceType: "asset" | "style";
}

export interface FlowRequestInput {
  prompt: string;
  firstFrame?: string | null;
  lastFrame?: string | null;
  ingredients: FlowIngredient[];
  durationSeconds: number;
  resolution: FlowResolution;
  aspect: FlowAspect;
}

export interface FlowRequestBody {
  instances: Array<{ prompt: string; image?: string }>;
  parameters: {
    aspectRatio: FlowAspect;
    resolution: FlowResolution;
    durationSeconds: number;
    referenceImages?: Array<{ image: string; referenceType: "asset" | "style" }>;
    lastFrame?: string;
  };
}

/**
 * Build the request body. THE HONEST CAP: an ingredient beyond the
 * model's own 3 rides out NAMED - the caller's receipt says so;
 * nothing is silently dropped.
 */
export function buildFlowRequest(input: FlowRequestInput): { body: FlowRequestBody; droppedIngredients: number } {
  const kept = input.ingredients.slice(0, FLOW_INGREDIENTS_MAX);
  const droppedIngredients = input.ingredients.length - kept.length;
  const instance: { prompt: string; image?: string } = { prompt: input.prompt };
  if (input.firstFrame) instance.image = input.firstFrame;
  const parameters: FlowRequestBody["parameters"] = {
    aspectRatio: input.aspect,
    resolution: input.resolution,
    durationSeconds: flowDurationClamp(input.durationSeconds),
  };
  if (kept.length > 0) {
    parameters.referenceImages = kept.map((i) => ({ image: i.image, referenceType: i.referenceType }));
  }
  if (input.lastFrame) parameters.lastFrame = input.lastFrame;
  return { body: { instances: [instance], parameters }, droppedIngredients };
}

// ─────────────────────────────────────────────────────────────
// THE PROVENANCE (pure - every receipt names the author).
// ─────────────────────────────────────────────────────────────

export interface FlowProvenance {
  engine: "FLOW";
  model: string;
  operation: string | null;
  seconds: number;
  resolution: FlowResolution;
  aspect: FlowAspect;
  ingredients: number;
  synthid: true;
  costUsdEstimate: number | null;
  note: string;
}

export function flowProvenance(input: {
  model: string; operation: string | null; seconds: number;
  resolution: FlowResolution; aspect: FlowAspect; ingredients: number;
  costUsdEstimate: number | null;
}): FlowProvenance {
  return {
    engine: "FLOW",
    model: input.model,
    operation: input.operation,
    seconds: input.seconds,
    resolution: input.resolution,
    aspect: input.aspect,
    ingredients: input.ingredients,
    synthid: true,
    costUsdEstimate: input.costUsdEstimate,
    note: "SynthID watermark rides the pixels - Google's own provenance mark, named never hidden",
  };
}

// ─────────────────────────────────────────────────────────────
// THE DOOR (the only two calls that touch the network).
// ─────────────────────────────────────────────────────────────

export interface FlowSubmitResult {
  submitted: boolean;
  operationName?: string;
  model?: string;
  costUsdEstimate?: number | null;
  error?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function submitFlowJob(input: FlowRequestInput): Promise<FlowSubmitResult> {
  // THE OPT-IN LAW first, then THE KEY LAW - each refusal named.
  if (!flowOptIn()) {
    return { submitted: false, error: "ANIMEOS_FLOW is not on - the door stays closed (the opt-in law: a generative author is a choice, never a default)" };
  }
  const key = flowKey();
  if (!key) {
    return { submitted: false, error: "ANIMEOS_FLOW_KEY not set - the key arrives by env, never on disk (the key law)" };
  }
  const model = flowModel();
  const { body } = buildFlowRequest(input);
  try {
    const res = await fetchWithTimeout(
      `${flowBase()}/models/${model}:predictLongRunning`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      },
      30_000,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { submitted: false, model, error: `flow door responded ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = (await res.json()) as { name?: string };
    if (!data?.name) return { submitted: false, model, error: "flow door returned no operation name" };
    const estimate = flowCostEstimate(model, body.parameters.durationSeconds, body.parameters.resolution);
    return { submitted: true, operationName: data.name, model, costUsdEstimate: estimate };
  } catch (err) {
    return { submitted: false, model, error: err instanceof Error ? err.message : "flow submit failed" };
  }
}

export interface FlowPollResult {
  polled: boolean;
  done?: boolean;
  error?: string;
  mp4Path?: string; // set when the finished clip landed this poll
}

/** Poll the operation; when done, download the clip into public/renders. */
export async function pollFlowJob(jobId: string, operationName: string): Promise<FlowPollResult> {
  const key = flowKey();
  if (!key) return { polled: false, error: "ANIMEOS_FLOW_KEY not set - the key arrives by env, never on disk (the key law)" };
  try {
    const res = await fetchWithTimeout(
      `${flowBase()}/${operationName}`,
      { method: "GET", headers: { "x-goog-api-key": key } },
      30_000,
    );
    if (!res.ok) return { polled: false, error: `flow operation responded ${res.status}` };
    const data = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
    };
    if (data?.error?.message) return { polled: true, done: true, error: `flow operation failed: ${data.error.message}` };
    if (!data?.done) return { polled: true, done: false };
    const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) return { polled: true, done: true, error: "flow operation finished without a clip uri" };
    // THE OUTPUT CONTRACT - the key rides the HEADER, never the URL.
    const clip = await fetchWithTimeout(uri, { method: "GET", headers: { "x-goog-api-key": key } }, 120_000);
    if (!clip.ok) return { polled: true, done: true, error: `clip download responded ${clip.status}` };
    const buf = Buffer.from(await clip.arrayBuffer());
    if (buf.length === 0) return { polled: true, done: true, error: "clip download was empty" };
    const dir = path.join(process.cwd(), "public", "renders");
    fs.mkdirSync(dir, { recursive: true });
    const outAbs = path.join(dir, `${jobId}.mp4`);
    fs.writeFileSync(outAbs, buf);
    return { polled: true, done: true, mp4Path: outAbs };
  } catch (err) {
    return { polled: false, error: err instanceof Error ? err.message : "flow poll failed" };
  }
}
