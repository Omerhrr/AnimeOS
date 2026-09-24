// ─────────────────────────────────────────────────────────────
// IMG2VID PREVIZ SLOT (interpolation model behind the driver chain)
//
// The OPTIONAL third way a shot moves: an interpolation model turns
// the shot's key art + pose pair into a previz animatic of the
// character motion inside the frame. This is NOT a final-render
// path: the designed engines (the Blender stand-in, the MOTION
// engine) remain the render path of record. The slot exists for
// (1) fast motion previz and (2) benchmarking the rig's blocking
// against an interpolated approximation. Two providers speak the
// same driver contract:
//
//   1. HOST   - point ANIMEOS_IMG2VID_HOST at any service that
//      speaks this tiny protocol:
//        POST http://{host}/jobs
//             {"jobId", "imageUrl", "poseStart", "poseEnd", ...}
//          → 201 {"jobId", "status": "queued"}   (409 when busy)
//        GET  http://{host}/jobs/{jobId}
//          → {"status", "progress", "videoUrl", "error"}
//
//   2. ZAI    - the built-in provider, now OPT-IN: it takes jobs
//      only when ANIMEOS_IMG2VID is explicitly set to on/zai/true
//      ("off" and unset both leave the slot closed). Demoted to
//      default-off: the studio's output is designed, not generated,
//      and an interpolation model is previz, never the deliverable.
//
// Both download the finished clip into public/renders/{jobId}.mp4 -
// the same output contract as the Blender bridge and the MOTION
// engine. With no host attached and no explicit opt-in the slot is
// invisible: the driver chain never touches it.
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { POSE_GLOSS } from "@/lib/animation/poses";

const HOST_ENV_KEY = "ANIMEOS_IMG2VID_HOST";
const PROVIDER_ENV_KEY = "ANIMEOS_IMG2VID";

export type Img2VidProvider = "host" | "zai";

/** Read lazily so operators (and tests) can set the env after import. */
export function img2vidHost(): string | null {
  return process.env[HOST_ENV_KEY] || null;
}

/**
 * Which provider takes img2vid jobs: the attached host wins, else
 * the built-in model ONLY on explicit opt-in (on/zai/true/previz).
 * Demoted to default-off: previz is a choice, not a default.
 */
export function img2vidProvider(): Img2VidProvider | null {
  if (img2vidHost()) return "host";
  const flag = String(process.env[PROVIDER_ENV_KEY] ?? "").trim().toLowerCase();
  return ["on", "zai", "true", "1", "previz"].includes(flag) ? "zai" : null;
}

export function img2vidStatus(): { available: boolean; host: string | null; provider: Img2VidProvider | null } {
  const host = img2vidHost();
  const provider = img2vidProvider();
  return { available: provider !== null, host, provider };
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface Img2VidSubmitPayload {
  jobId: string;
  imageUrl: string | null; // key art (public path, or absolute URL when ANIMEOS_PUBLIC_URL is set)
  poseStart: string | null;
  poseEnd: string | null;
  movement: string | null;
  shotType: string;
  fps: number;
  frames: number;
  width: number;
  height: number;
  mode: "PREVIEW" | "FINAL";
  // LIP-SYNC: spoken lines for speaking closeups - a host provider
  // that understands speech passes them to its model; others ignore.
  speechLines?: string[] | null;
}

export interface Img2VidSubmitResult {
  submitted: boolean;
  error?: string;
}

export async function submitImg2VidJob(payload: Img2VidSubmitPayload): Promise<Img2VidSubmitResult> {
  const host = img2vidHost();
  if (!host) return { submitted: false, error: "ANIMEOS_IMG2VID_HOST not set" };
  try {
    const res = await fetchWithTimeout(
      `http://${host}/jobs`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      6000
    );
    if (!res.ok) return { submitted: false, error: `img2vid /jobs responded ${res.status}` };
    return { submitted: true };
  } catch (err) {
    return { submitted: false, error: err instanceof Error ? err.message : "img2vid submit failed" };
  }
}

export interface Img2VidPollResult {
  polled: boolean;
  status?: "queued" | "running" | "done" | "error";
  progress?: number;
  done?: boolean;
  error?: string;
  mp4Path?: string; // set when the finished clip was downloaded this poll
}

/** Poll the provider; when the job is done, download the clip into public/renders. */
export async function pollImg2VidJob(jobId: string): Promise<Img2VidPollResult> {
  const host = img2vidHost();
  if (!host) return { polled: false, error: "ANIMEOS_IMG2VID_HOST not set" };
  try {
    const res = await fetchWithTimeout(`http://${host}/jobs/${encodeURIComponent(jobId)}`, undefined, 6000);
    if (!res.ok) return { polled: false, error: `img2vid /jobs responded ${res.status}` };
    const data = (await res.json()) as { status?: string; progress?: number; videoUrl?: string; error?: string };
    const status = data.status === "done" || data.status === "error" || data.status === "queued" || data.status === "running"
      ? data.status
      : "running";
    const done = status === "done" || status === "error";
    if (status === "error") {
      return { polled: true, status, done: true, error: data.error ?? "img2vid job failed" };
    }
    if (status !== "done" || !data.videoUrl) {
      return { polled: true, status, progress: typeof data.progress === "number" ? data.progress : undefined, done: false };
    }
    // download the finished clip (same contract as the Blender bridge)
    const dir = path.join(process.cwd(), "public", "renders");
    fs.mkdirSync(dir, { recursive: true });
    const outAbs = path.join(dir, `${jobId}.mp4`);
    const clip = await fetchWithTimeout(data.videoUrl, undefined, 30_000);
    if (!clip.ok) return { polled: true, status, done: true, error: `clip download responded ${clip.status}` };
    const buf = Buffer.from(await clip.arrayBuffer());
    if (buf.length === 0) return { polled: true, status, done: true, error: "clip download was empty" };
    fs.writeFileSync(outAbs, buf);
    return { polled: true, status, done: true, progress: 1, mp4Path: outAbs };
  } catch (err) {
    return { polled: false, error: err instanceof Error ? err.message : "img2vid poll failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// ZAI PROVIDER - the built-in real interpolation model
//
// z.ai async video generation: an image (the shot's key art) plus a
// pose/camera prompt go in; the model interpolates real character
// motion between the poses; the finished clip downloads back into
// public/renders/{jobId}.mp4 like every other driver.
// ─────────────────────────────────────────────────────────────

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

/** Clip length the model is asked for (seconds), clamped to a sane window. */
export function img2vidDurationClamp(seconds: number): number {
  return Math.min(10, Math.max(3, Math.round(seconds)));
}

/**
 * The animation prompt sent to the video model: identity lock on the
 * key art's character, the pose beat in performance words, the
 * camera program - plus SPEECH DIRECTION when the shot is a speaking
 * closeup (lips articulate the lines). Pure - E2E asserts on its wording.
 */
export function buildImg2VidPrompt(input: {
  poseStart: string | null;
  poseEnd: string | null;
  movement: string | null;
  shotType: string;
  lighting: string | null;
  speechLines?: string[] | null;
}): string {
  const start = input.poseStart ? POSE_GLOSS[input.poseStart] ?? null : null;
  const endPose = input.poseEnd ? POSE_GLOSS[input.poseEnd] ?? null : null;
  const beat = start && endPose && start !== endPose
    ? `The main character performs a smooth, physical movement: ${start}, flowing continuously into ${endPose} by the end of the clip.`
    : start || endPose
      ? `The main character holds ${start ?? endPose} with subtle living motion - breathing, weight shifts, cloth drift.`
      : "The scene stays alive with subtle ambient motion.";
  const camera = MOVEMENT_GLOSS[input.movement?.toUpperCase() ?? ""] ?? "the camera holds still";
  const framing = SHOT_GLOSS[input.shotType.toUpperCase()] ?? "medium view";
  const speech = (input.speechLines ?? []).filter((l) => l?.trim()).slice(0, 2);
  const speechLine = speech.length > 0
    ? `The main character SPEAKS out loud: "${speech.map((l) => l.trim().slice(0, 120)).join(" ... ")}" - the lips and jaw articulate the words in natural lip-sync, mouth opening on vowels, closing on lips, with subtle head emphasis on the stresses.`
    : null;
  const parts = [
    "Animate this exact frame into a cinematic anime clip.",
    beat,
    speechLine,
    `Camera work: ${camera}, ${framing}.`,
    input.lighting ? `Lighting mood: ${input.lighting}.` : null,
    "Keep the character's face, hair, outfit, colors and art style EXACTLY as in the source frame - same identity, same palette. Consistent single character, smooth natural motion, no cuts, no text, no watermark.",
  ];
  return parts.filter(Boolean).join(" ");
}

/** Max key-art bytes we inline as a data URL (base64 inflates 4/3). */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Resolve the key art into something the video service can fetch:
 * absolute URLs pass through; local public paths become data URLs
 * read straight off disk (no public host required).
 */
export function resolveImg2VidImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const clean = imageUrl.split("?")[0];
  const file = path.join(process.cwd(), "public", path.normalize(clean).replace(/^([.][.][/\\])+/, ""));
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) return null;
  const ext = path.extname(file).toLowerCase().replace(".", "") || "png";
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
}

export interface Img2VidZaiSubmitPayload {
  jobId: string;
  imageUrl: string | null;
  poseStart: string | null;
  poseEnd: string | null;
  movement: string | null;
  shotType: string;
  lighting: string | null;
  duration: number; // seconds
  mode: "PREVIEW" | "FINAL";
  speechLines?: string[] | null;
}

export interface Img2VidZaiSubmitResult {
  submitted: boolean;
  taskId?: string;
  error?: string;
}

/** Submit an img2vid job to the z.ai video model; returns the async task id. */
export async function submitImg2VidZaiJob(payload: Img2VidZaiSubmitPayload): Promise<Img2VidZaiSubmitResult> {
  if (img2vidProvider() !== "zai") return { submitted: false, error: "z.ai img2vid provider is off" };
  try {
    const zai = await ZAI.create();
    const prompt = buildImg2VidPrompt(payload);
    const image = resolveImg2VidImageUrl(payload.imageUrl);
    const res = (await zai.video.generations.create({
      prompt,
      ...(image ? { image_url: image } : {}),
      quality: payload.mode === "FINAL" ? "quality" : "speed",
      with_audio: false,
      duration: img2vidDurationClamp(payload.duration),
    })) as { id?: string; task_status?: string };
    if (!res?.id) return { submitted: false, error: "video model returned no task id" };
    return { submitted: true, taskId: res.id };
  } catch (err) {
    return { submitted: false, error: err instanceof Error ? err.message : "img2vid z.ai submit failed" };
  }
}

export interface Img2VidZaiPollResult {
  polled: boolean;
  status?: "queued" | "running" | "done" | "error";
  done?: boolean;
  error?: string;
  mp4Path?: string; // set when the finished clip was downloaded this poll
}

/** Poll the z.ai video task; when done, download the clip into public/renders. */
export async function pollImg2VidZaiJob(jobId: string, taskId: string): Promise<Img2VidZaiPollResult> {
  try {
    const zai = await ZAI.create();
    const res = (await zai.async.result.query(taskId)) as {
      task_status?: string;
      video_result?: Array<{ url?: string }>;
      video_url?: string;
      url?: string;
    };
    const raw = String(res?.task_status ?? "PROCESSING").toUpperCase();
    if (raw === "FAIL") {
      return { polled: true, status: "error", done: true, error: "video model reported task failure" };
    }
    if (raw !== "SUCCESS") {
      return { polled: true, status: "running", done: false };
    }
    const videoUrl = res?.video_result?.[0]?.url || res?.video_url || res?.url || null;
    if (!videoUrl) return { polled: true, status: "error", done: true, error: "video model finished without a clip url" };
    // download the finished clip (same contract as the host provider)
    const dir = path.join(process.cwd(), "public", "renders");
    fs.mkdirSync(dir, { recursive: true });
    const outAbs = path.join(dir, `${jobId}.mp4`);
    const clip = await fetchWithTimeout(videoUrl, undefined, 120_000);
    if (!clip.ok) return { polled: true, status: "error", done: true, error: `clip download responded ${clip.status}` };
    const buf = Buffer.from(await clip.arrayBuffer());
    if (buf.length === 0) return { polled: true, status: "error", done: true, error: "clip download was empty" };
    fs.writeFileSync(outAbs, buf);
    return { polled: true, status: "done", done: true, mp4Path: outAbs };
  } catch (err) {
    return { polled: false, error: err instanceof Error ? err.message : "img2vid z.ai poll failed" };
  }
}
