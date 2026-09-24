import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { platformPreset } from "@/lib/comic/publish";

// ─────────────────────────────────────────────────────────────
// UPLOAD ADAPTERS - the credential-gated half of the delivery spine
//
// Iteration 38 stages per-platform publish packages (conformance,
// metadata, subtitles) and honestly refuses to pretend they were
// uploaded. This module is the next half of the promise: REAL upload
// adapters that perform the documented network flow when the
// creator's credentials are present in the environment:
//
//   • YOUTUBE  - the resumable-upload flow: POST the video metadata
//     to googleapis with the Bearer token, read the session's
//     Location header, PUT the mp4 bytes to it.
//   • TIKTOK / DOUYIN - the init-then-put flow: POST the post_info /
//     source_info init, read the upload_url back, PUT the bytes.
//   • BILIBILI - the submit flow: multipart POST with the access key,
//     the metadata and the file in one call.
//   • STUDIO_INGEST - a local package drop: never a network call.
//
// The adapters read the platform endpoints from the environment with
// the documented defaults (ANIMEOS_<PLATFORM>_API_BASE), so a
// self-hosted gateway or an air-gapped relay can sit in front, and
// the E2E can prove the real byte flow against a local receiver.
// Every outcome - OK, FAILED, or the honest "no credentials" - is
// appended to the staged package's PUBLISH event, so the delivery
// history stays auditable. NOTHING is uploaded silently: an upload
// only ever runs when someone calls it.
// ─────────────────────────────────────────────────────────────

export interface UploadOutcome {
  kind: "upload" | "skip";
  platform: string;
  ok: boolean;
  detail: string;
  at: string;
}

const UPLOAD_TIMEOUT_MS = 120_000; // a cut can be tens of MB

interface PlatformEndpoint {
  envBase: string; // env key overriding the endpoint (test seams, relays)
  defaultBase: string;
  envToken: string;
  tokenStyle: "bearer" | "query";
}

const ENDPOINTS: Record<string, PlatformEndpoint> = {
  YOUTUBE: { envBase: "ANIMEOS_YT_API_BASE", defaultBase: "https://www.googleapis.com/upload/youtube/v3/videos", envToken: "ANIMEOS_YT_ACCESS_TOKEN", tokenStyle: "bearer" },
  BILIBILI: { envBase: "ANIMEOS_BILI_API_BASE", defaultBase: "https://member.bilibili.com/x/vu/web/add/v3", envToken: "ANIMEOS_BILI_ACCESS_KEY", tokenStyle: "query" },
  TIKTOK: { envBase: "ANIMEOS_TIKTOK_API_BASE", defaultBase: "https://open.tiktokapis.com/v2/post/publish/video/init/", envToken: "ANIMEOS_TIKTOK_TOKEN", tokenStyle: "bearer" },
  DOUYIN: { envBase: "ANIMEOS_DOUYIN_API_BASE", defaultBase: "https://open.douyin.com/v2/post/publish/video/init/", envToken: "ANIMEOS_DOUYIN_TOKEN", tokenStyle: "bearer" },
};

function endpointFor(platform: string): PlatformEndpoint | null {
  return ENDPOINTS[platform] ?? null;
}

function credentialsPresent(platform: string): boolean {
  const ep = endpointFor(platform);
  if (!ep) return true; // ingest: no credentials involved
  return Boolean(String(process.env[ep.envToken] ?? "").trim());
}

/** The resumable / init-then-put flow shared by YouTube, TikTok and Douyin. */
async function uploadTwoStep(
  platform: string,
  meta: Record<string, unknown>,
  file: string,
  fileName: string,
): Promise<UploadOutcome> {
  const ep = endpointFor(platform)!;
  const base = String(process.env[ep.envBase] ?? "").trim() || ep.defaultBase;
  const token = String(process.env[ep.envToken] ?? "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=UTF-8" };
  if (ep.tokenStyle === "bearer") headers.Authorization = `Bearer ${token}`;
  const url = platform === "YOUTUBE"
    ? `${base}?uploadType=resumable&part=snippet,status`
    : base;

  const init = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(meta),
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!init.ok) {
    const body = (await init.text()).slice(0, 160);
    return { kind: "upload", platform, ok: false, detail: `init failed: ${init.status} ${body}`, at: new Date().toISOString() };
  }
  const contentType = init.headers.get("content-type") ?? "";
  let uploadUrl = init.headers.get("location") ?? init.headers.get("Location");
  if (!uploadUrl && contentType.includes("json")) {
    try {
      const body = (await init.json()) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      uploadUrl = String(data.upload_url ?? data.uploadUrl ?? "");
    } catch { uploadUrl = null; }
  }
  if (!uploadUrl) {
    return { kind: "upload", platform, ok: false, detail: "init succeeded but carried no upload url", at: new Date().toISOString() };
  }

  const bytes = fs.readFileSync(file);
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", ...(ep.tokenStyle === "bearer" ? { Authorization: `Bearer ${token}` } : {}) },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!put.ok) {
    const body = (await put.text()).slice(0, 160);
    return { kind: "upload", platform, ok: false, detail: `byte transfer failed: ${put.status} ${body}`, at: new Date().toISOString() };
  }
  return { kind: "upload", platform, ok: true, detail: `uploaded ${fileName} (${(bytes.length / (1024 * 1024)).toFixed(1)}MB) via ${platform === "YOUTUBE" ? "resumable" : "init+put"} flow`, at: new Date().toISOString() };
}

/** The single multipart submit used by Bilibili. */
async function uploadMultipart(
  platform: string,
  meta: Record<string, unknown>,
  file: string,
  fileName: string,
): Promise<UploadOutcome> {
  const ep = endpointFor(platform)!;
  const base = String(process.env[ep.envBase] ?? "").trim() || ep.defaultBase;
  const token = String(process.env[ep.envToken] ?? "").trim();
  const form = new FormData();
  form.set("access_key", token);
  form.set("meta", JSON.stringify(meta));
  const bytes = fs.readFileSync(file);
  form.set("file", new Blob([new Uint8Array(bytes)], { type: "video/mp4" }), fileName);
  const res = await fetch(base, { method: "POST", body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 160);
    return { kind: "upload", platform, ok: false, detail: `submit failed: ${res.status} ${body}`, at: new Date().toISOString() };
  }
  return { kind: "upload", platform, ok: true, detail: `submitted ${fileName} (${(bytes.length / (1024 * 1024)).toFixed(1)}MB) multipart`, at: new Date().toISOString() };
}

/** Platform metadata shaped the way each platform's submit expects. */
export function metadataFor(platform: string, pkg: { title: string; description: string; tags: string[] }): Record<string, unknown> {
  if (platform === "YOUTUBE") {
    return { snippet: { title: pkg.title, description: pkg.description, tags: pkg.tags }, status: { privacyStatus: "private", selfDeclaredMadeForKids: false } };
  }
  if (platform === "TIKTOK" || platform === "DOUYIN") {
    return { post_info: { title: pkg.title.slice(0, 90), privacy_level: "SELF_ONLY" }, source_info: { source: "PULL_FROM_FILE" } };
  }
  return { title: pkg.title, desc: pkg.description, tags: pkg.tags.join(",") };
}

/**
 * Upload one staged package to its platform. Reads the PUBLISH event
 * back, verifies the cut is still on disk, checks the credentials
 * and runs the platform's real flow. Appends the outcome to the
 * event's payload so the feed keeps the whole history. Ingest is an
 * honest skip (a local package drop is the deliverable).
 */
export async function uploadStagedPackage(eventId: string): Promise<{ ok: true; outcome: UploadOutcome } | { ok: false; error: string }> {
  const event = await db.productionEvent.findUnique({ where: { id: eventId } });
  if (!event || event.type !== "PUBLISH") return { ok: false, error: "Publish event not found" };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.payload ?? "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, error: "the publish event's payload is unreadable - stage the package again" };
  }
  const platform = String(payload.platform ?? "");
  const cut = (payload.cut ?? {}) as Record<string, unknown>;
  const url = String(cut.url ?? "");
  if (!platformPreset(platform)) return { ok: false, error: `unknown platform "${platform}"` };

  let outcome: UploadOutcome;
  if (platform === "STUDIO_INGEST") {
    outcome = {
      kind: "skip",
      platform,
      ok: true,
      detail: "ingest is a local package drop - the cut + sidecar files are the deliverable, no network call",
      at: new Date().toISOString(),
    };
  } else if (!credentialsPresent(platform)) {
    const ep = endpointFor(platform)!;
    outcome = {
      kind: "upload",
      platform,
      ok: false,
      detail: `no upload credentials (${ep.envToken}) - the package stays staged for manual upload`,
      at: new Date().toISOString(),
    };
  } else {
    const file = path.join(process.cwd(), "public", url.replace(/^\//, "").split("?")[0]);
    if (!fs.existsSync(file)) {
      outcome = { kind: "upload", platform, ok: false, detail: "the cut file is missing on disk - export the cut again", at: new Date().toISOString() };
    } else {
      const fileName = String(cut.file ?? path.basename(file));
      const meta = metadataFor(platform, {
        title: String(payload.title ?? ""),
        description: String((payload as { description?: string }).description ?? ""),
        tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
      });
      outcome = platform === "BILIBILI"
        ? await uploadMultipart(platform, meta, file, fileName)
        : await uploadTwoStep(platform, meta, file, fileName);
    }
  }

  // the outcome rides the event: updates list + a summary suffix
  const updates = Array.isArray(payload.updates) ? [...payload.updates as unknown[]] : [];
  updates.push({ kind: outcome.kind, ok: outcome.ok, detail: outcome.detail, at: outcome.at });
  payload.updates = updates;
  const attempts = updates.filter((u) => (u as { kind?: string }).kind === "upload").length;
  const summary = `${event.summary.split(" - uploaded")[0]} - uploaded: last ${outcome.ok ? "OK" : "FAILED"} (${outcome.detail.slice(0, 80)}), ${attempts} attempt(s)`;
  await db.productionEvent.update({
    where: { id: eventId },
    data: { payload: JSON.stringify(payload), summary: summary.slice(0, 900) },
  });

  return { ok: true, outcome } as const;
}

/** The latest staged package event for an episode number + platform. */
export async function findStagedPackage(projectId: string, episodeNumber: number, platform: string): Promise<string | null> {
  const epTag = `EP${String(episodeNumber).padStart(2, "0")}`;
  const rows = await db.productionEvent.findMany({
    where: { projectId, type: "PUBLISH" },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload ?? "{}") as { platform?: string };
      if (payload.platform === platform && row.summary.includes(epTag)) return row.id;
    } catch { /* skip unreadable rows */ }
  }
  return null;
}
