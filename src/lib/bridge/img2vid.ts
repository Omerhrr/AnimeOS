// ─────────────────────────────────────────────────────────────
// IMG2VID PROVIDER SLOT (interpolation model behind the driver chain)
//
// The third way a shot moves: an external img2vid interpolation model
// turns the shot's key art + pose pair into real character motion
// inside the frame. AnimeOS ships the CLIENT + driver integration;
// point ANIMEOS_IMG2VID_HOST at any service that speaks this tiny
// protocol and hero shots start routing to it automatically:
//
//   POST http://{host}/jobs
//        {"jobId", "imageUrl", "poseStart", "poseEnd", "movement",
//         "shotType", "fps", "frames", "width", "height", "mode"}
//     → 201 {"jobId", "status": "queued"}   (409 when busy)
//   GET  http://{host}/jobs/{jobId}
//     → {"status": "queued" | "running" | "done" | "error",
//        "progress": 0..1, "videoUrl": "http://..." (when done),
//        "error": "..." (when failed)}
//
// The client downloads the finished clip into
// public/renders/{jobId}.mp4 - the same output contract as the
// Blender bridge and the MOTION engine. When the env var is unset
// (the default) the slot is invisible: the driver chain never
// touches it and nothing else changes.
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const HOST_ENV_KEY = "ANIMEOS_IMG2VID_HOST";

/** Read lazily so operators (and tests) can set the env after import. */
export function img2vidHost(): string | null {
  return process.env[HOST_ENV_KEY] || null;
}

export function img2vidStatus(): { available: boolean; host: string | null } {
  const host = img2vidHost();
  return { available: Boolean(host), host };
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
