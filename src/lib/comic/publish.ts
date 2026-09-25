import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { probeMedia } from "@/lib/bridge/motion";
import { buildSpeechProgram } from "@/lib/animation/lipsync";
import { parseDialogue } from "@/lib/comic/dialogue";

// ─────────────────────────────────────────────────────────────
// PLATFORM PUBLISHING - the delivery spine's last mile
//
// An episode cut (public/renders/cuts/{slug}.mp4 + manifest) is not
// shipped until it is PACKAGED for where it will actually be seen.
// This module stages a per-platform publish package:
//
//   • CONFORMANCE - the real cut (probed on disk) is checked
//     against the platform preset: duration cap, canvas/aspect,
//     file size, frame rate. A 16:9 cut on a 9:16 platform fails
//     honestly instead of uploading a letterboxed afterthought.
//   • METADATA - title, description, tags built from the
//     production's real fields and clamped to the platform's
//     limits, plus a provenance credits line (designed, directed,
//     rendered - not generated).
//   • SUBTITLES - an SRT built from the episode's dialogue timed
//     through the cut manifest's shot slots (VOICE cue windows when
//     takes exist, even spread when they do not).
//   • INTEGRATION SLOT - per-platform upload credentials are read
//     from the environment and reported HONESTLY: no adapter makes
//     network calls in this build, so a package is always staged
//     locally (event + file paths), never "uploaded". A configured
//     environment reads as "credentials present, adapter pending".
//
// Every staged package lands a PUBLISH production event the render
// view's publishing panel lists, so the studio's delivery history
// stays auditable like every other spine artifact.
// ─────────────────────────────────────────────────────────────

export interface PlatformPreset {
  id: string;
  label: string;
  blurb: string;
  orientation: "LANDSCAPE" | "VERTICAL";
  width: number;
  height: number;
  maxDurationSec: number;
  maxFileSizeMb: number;
  maxBitrateKbps: number;
  titleMaxChars: number;
  descMaxChars: number;
  maxTags: number;
  tagMaxChars: number;
  subtitleFormat: "srt" | "none";
  envKeys: string[]; // upload-adapter credentials (honest slot, read-only here)
  notes: string[];
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: "YOUTUBE",
    label: "YouTube",
    blurb: "16:9 episode upload with an SRT sidecar",
    orientation: "LANDSCAPE",
    width: 1920,
    height: 1080,
    maxDurationSec: 12 * 3600,
    maxFileSizeMb: 256 * 1024,
    maxBitrateKbps: 68000,
    titleMaxChars: 100,
    descMaxChars: 5000,
    maxTags: 15,
    tagMaxChars: 30,
    subtitleFormat: "srt",
    envKeys: ["ANIMEOS_YT_CLIENT_ID", "ANIMEOS_YT_REFRESH_TOKEN"],
    notes: ["upload the SRT as the episode's subtitle track", "made-for-kids flag must be set by the creator"],
  },
  {
    id: "BILIBILI",
    label: "Bilibili",
    blurb: "16:9 donghua premiere slot with CC subtitles",
    orientation: "LANDSCAPE",
    width: 1920,
    height: 1080,
    maxDurationSec: 10 * 3600,
    maxFileSizeMb: 8 * 1024,
    maxBitrateKbps: 60000,
    titleMaxChars: 80,
    descMaxChars: 2000,
    maxTags: 10,
    tagMaxChars: 20,
    subtitleFormat: "srt",
    envKeys: ["ANIMEOS_BILI_ACCESS_KEY"],
    notes: ["cover image is required by the platform - export one from the hero panel", "upload the SRT as a CC subtitle"],
  },
  {
    id: "DOUYIN",
    label: "Douyin",
    blurb: "9:16 vertical short - a 16:9 cut fails here",
    orientation: "VERTICAL",
    width: 1080,
    height: 1920,
    maxDurationSec: 5 * 60,
    maxFileSizeMb: 4 * 1024,
    maxBitrateKbps: 20000,
    titleMaxChars: 55,
    descMaxChars: 1000,
    maxTags: 5,
    tagMaxChars: 24,
    subtitleFormat: "none",
    envKeys: ["ANIMEOS_DOUYIN_OPEN_ID", "ANIMEOS_DOUYIN_TOKEN"],
    notes: ["captions burn into the frame on this platform - the cut must carry them", "re-frame a 16:9 episode to 9:16 before staging"],
  },
  {
    id: "TIKTOK",
    label: "TikTok",
    blurb: "9:16 vertical short, international lane",
    orientation: "VERTICAL",
    width: 1080,
    height: 1920,
    maxDurationSec: 10 * 60,
    maxFileSizeMb: 4 * 1024,
    maxBitrateKbps: 20000,
    titleMaxChars: 150,
    descMaxChars: 2200,
    maxTags: 8,
    tagMaxChars: 24,
    subtitleFormat: "none",
    envKeys: ["ANIMEOS_TIKTOK_TOKEN"],
    notes: ["captions burn into the frame on this platform", "vertical re-frame or native 9:16 cut required"],
  },
  {
    id: "STUDIO_INGEST",
    label: "Studio ingest",
    blurb: "mezzanine package for distributor hand-off (Youku / Tencent / iQiyi lanes)",
    orientation: "LANDSCAPE",
    width: 1920,
    height: 1080,
    maxDurationSec: 24 * 3600,
    maxFileSizeMb: 100 * 1024,
    maxBitrateKbps: 120000,
    titleMaxChars: 120,
    descMaxChars: 6000,
    maxTags: 20,
    tagMaxChars: 40,
    subtitleFormat: "srt",
    envKeys: [],
    notes: ["deliver the package folder: cut + SRT + sidecar metadata", "distributor specs override presets when contracted"],
  },
];

const PRESET_BY_ID = new Map(PLATFORM_PRESETS.map((p) => [p.id, p]));

export function platformPreset(id: string): PlatformPreset | null {
  return PRESET_BY_ID.get(String(id ?? "").trim().toUpperCase()) ?? null;
}

// ─── Conformance ────────────────────────────────────────────

export interface ConformanceCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface CutMedia {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  bytes: number;
}

function aspectRatio(w: number, h: number): number {
  return h > 0 ? w / h : 0;
}

/** The real cut checked against the preset. Pure - the E2E drives it. */
export function checkConformance(preset: PlatformPreset, media: CutMedia): ConformanceCheck[] {
  const checks: ConformanceCheck[] = [];

  checks.push({
    label: "duration",
    ok: media.durationMs > 0 && media.durationMs <= preset.maxDurationSec * 1000,
    detail: `${(media.durationMs / 1000).toFixed(1)}s vs a ${(preset.maxDurationSec / 60).toFixed(0)}min cap`,
  });

  const cutAspect = aspectRatio(media.width, media.height);
  const presetAspect = aspectRatio(preset.width, preset.height);
  const aspectOk = Math.abs(cutAspect - presetAspect) / presetAspect < 0.045;
  const resolutionOk = media.width >= preset.width && media.height >= preset.height;
  checks.push({
    label: "canvas",
    ok: aspectOk,
    detail: aspectOk
      ? `${media.width}x${media.height} matches the ${preset.orientation.toLowerCase()} ${preset.width}x${preset.height} frame${resolutionOk ? "" : " - upscale before upload"}`
      : `${media.width}x${media.height} is a ${(cutAspect).toFixed(2)} frame on a ${(presetAspect).toFixed(2)} platform - re-frame or crop before upload`,
  });

  checks.push({
    label: "file size",
    ok: media.bytes > 0 && media.bytes <= preset.maxFileSizeMb * 1024 * 1024,
    detail: media.bytes > 0
      ? `${(media.bytes / (1024 * 1024)).toFixed(1)}MB vs a ${(preset.maxFileSizeMb / 1024).toFixed(1)}GB cap`
      : "cut file missing on disk",
  });

  const fpsOk = media.fps >= 23.9 && media.fps <= 60.1;
  checks.push({
    label: "frame rate",
    ok: fpsOk,
    detail: `${media.fps.toFixed(2)}fps (broadcast-safe 23.98-60)`,
  });

  const durSec = Math.max(1, media.durationMs / 1000);
  const estKbps = Math.round((media.bytes * 8) / durSec / 1000);
  checks.push({
    label: "bitrate",
    ok: estKbps <= preset.maxBitrateKbps,
    detail: `~${estKbps}kbps vs a ${preset.maxBitrateKbps}kbps cap`,
  });

  return checks;
}

// ─── Subtitles ──────────────────────────────────────────────

export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

function srtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const msPart = total % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(msPart).padStart(3, "0")}`;
}

/** An SRT document from timed dialogue cues. Pure - the E2E drives it. */
export function buildSrt(cues: SubtitleCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${c.text.trim()}`)
    .join("\n\n")
    .concat(cues.length > 0 ? "\n" : "");
}

// ─── The package ────────────────────────────────────────────

export const PACKAGE_CREDITS =
  "Designed and directed with the AnimeOS pipeline: every frame is rendered from authored camera grammar, character rigs and per-shot design - a directed production, not generated footage.";

export interface PublishPackage {
  platform: string;
  platformLabel: string;
  title: string;
  description: string;
  tags: string[];
  subtitle: { format: "srt" | "none"; filename: string | null; cues: number; content: string | null; note: string };
  conformance: ConformanceCheck[];
  ready: boolean; // every conformance check passed
  checklist: string[];
  integration: { configured: boolean; detail: string; envKeys: string[] };
  cut: { url: string; file: string; durationMs: number; width: number; height: number; fps: number; bytes: number };
  package: { dir: string; files: string[] } | null; // the staged hand-off folder (package.json + srt + checklist)
}

export interface PublishBuildInput {
  preset: PlatformPreset;
  project: { title: string; visualStyle: string; animationType: string };
  episode: { number: number; title: string; synopsis?: string | null };
  media: CutMedia;
  cutUrl: string;
  subtitleCues: SubtitleCue[];
  subtitleNote: string;
}

function styleTag(visualStyle: string): string {
  const map: Record<string, string> = { DONGHUA: "donghua", ANIME: "anime", KOREAN: "korean", WESTERN: "western", CUSTOM: "original" };
  return map[String(visualStyle ?? "").toUpperCase()] ?? "animation";
}

function animationTag(animationType: string): string {
  const t = String(animationType ?? "").toLowerCase();
  if (t === "2d") return "2d animation";
  if (t === "3d") return "3d animation";
  if (t === "hybrid") return "hybrid animation";
  return "animated series";
}

/** Assemble the platform package from real production fields. Pure - the E2E drives it. */
export function buildPublishPackage(input: PublishBuildInput): PublishPackage {
  const { preset, project, episode, media } = input;
  const epNum = String(episode.number).padStart(2, "0");
  const configured = preset.envKeys.length === 0
    ? true
    : preset.envKeys.every((k) => Boolean(String(process.env[k] ?? "").trim()));

  const title = `${project.title} - EP${epNum} ${episode.title}`.slice(0, preset.titleMaxChars);

  const synopsis = String(episode.synopsis ?? "").trim();
  const description = [
    synopsis || `${project.title} episode ${episode.number}: ${episode.title}`,
    "",
    PACKAGE_CREDITS,
  ]
    .join("\n")
    .slice(0, preset.descMaxChars);

  const tags = [
    ...new Set(
      [
        project.title.toLowerCase().split(/\s+/).slice(0, 3).join(""),
        styleTag(project.visualStyle),
        animationTag(project.animationType),
        `EP${epNum}`,
        ...episode.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 2),
      ].map((t) => t.slice(0, preset.tagMaxChars)),
    ),
  ].slice(0, preset.maxTags);

  const conformance = checkConformance(preset, media);
  const ready = conformance.every((c) => c.ok);

  const subtitle = preset.subtitleFormat === "none"
    ? { format: "none" as const, filename: null, cues: 0, content: null, note: "this platform burns captions into the frame - no sidecar subtitle" }
    : input.subtitleCues.length === 0
      ? { format: preset.subtitleFormat, filename: null, cues: 0, content: null, note: `no SPEECH dialogue found in this episode - no ${preset.subtitleFormat.toUpperCase()} built` }
      : {
          format: preset.subtitleFormat,
          filename: `${path.basename(input.cutUrl).replace(/\.mp4$/, "")}.${preset.subtitleFormat}`,
          cues: input.subtitleCues.length,
          content: buildSrt(input.subtitleCues),
          note: input.subtitleNote,
        };

  const checklist = [
    `cut file: ${path.basename(input.cutUrl)}`,
    preset.subtitleFormat !== "none" && subtitle.content ? `subtitle sidecar: ${subtitle.filename} (${subtitle.cues} cues)` : "no subtitle sidecar for this platform",
    "paste the package title / description / tags into the upload form",
    ...preset.notes,
    preset.envKeys.length > 0 && !configured
      ? `upload runs manual until credentials are set (${preset.envKeys.join(", ")})`
      : preset.envKeys.length > 0
        ? "credentials present - hand the package to the upload adapter when wired"
        : "ingest package drop - no platform credentials involved",
  ];

  return {
    platform: preset.id,
    platformLabel: preset.label,
    title,
    description,
    tags,
    subtitle,
    conformance,
    ready,
    checklist,
    integration: {
      configured,
      detail: preset.envKeys.length === 0
        ? "ingest is a local package drop - no platform credentials involved"
        : configured
          ? "credentials present in the environment - the upload adapter is not wired in this build, the package is staged for hand-off"
          : `no upload credentials in the environment (${preset.envKeys.join(", ")}) - the package is staged for manual upload`,
      envKeys: preset.envKeys,
    },
    cut: { url: input.cutUrl, file: path.basename(input.cutUrl), durationMs: media.durationMs, width: media.width, height: media.height, fps: media.fps, bytes: media.bytes },
    package: null,
  };
}

/**
 * Write the hand-off folder for a staged package: package.json (the
 * full metadata + conformance record), the SRT sidecar when one was
 * built, and checklist.txt. Local, honest - the folder is what the
 * creator zips for ingest or drags onto an upload form. Returns null
 * when the write fails (the package still stages; the event notes it).
 */
export function writePackageFolder(pkg: PublishPackage, epTag: string): PublishPackage["package"] {
  try {
    const slug = path.basename(pkg.cut.file).replace(/\.mp4$/, "");
    const dir = path.join(process.cwd(), "public", "renders", "cuts", "packages", epTag, pkg.platform.toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    const files: string[] = [];
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ ...pkg, package: null }, null, 2));
    files.push("package.json");
    if (pkg.subtitle.content) {
      const srtName = pkg.subtitle.filename ?? `${slug}.srt`;
      fs.writeFileSync(path.join(dir, srtName), pkg.subtitle.content);
      files.push(srtName);
    }
    fs.writeFileSync(path.join(dir, "checklist.txt"), [...pkg.checklist, ""].join("\n"));
    files.push("checklist.txt");
    const publicDir = `/renders/cuts/packages/${epTag}/${pkg.platform.toLowerCase()}`;
    return { dir: publicDir, files };
  } catch {
    return null;
  }
}

// ─── Staging (server) ───────────────────────────────────────

const CUT_EVENT_PREFIX = "Episode cut muxed - EP";

export interface PublishEventRow {
  id: string;
  platform: string;
  platformLabel: string;
  ready: boolean;
  checksPassed: number;
  checksTotal: number;
  title: string;
  url: string;
  file: string;
  subtitleCues: number;
  subtitleFormat: string;
  packageDir: string | null;
  createdAt: string;
}

/** The publishing panel's feed: recently staged packages. */
export async function listPublishEvents(projectId: string, take = 8): Promise<PublishEventRow[]> {
  const rows = await db.productionEvent.findMany({
    where: { projectId, type: "PUBLISH" },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.flatMap((r) => {
    try {
      const p = JSON.parse(r.payload ?? "{}") as Record<string, unknown>;
      const cut = (p.cut ?? {}) as Record<string, unknown>;
      const subtitle = (p.subtitle ?? {}) as Record<string, unknown>;
      return [{
        id: r.id,
        platform: String(p.platform ?? "?"),
        platformLabel: String(p.platformLabel ?? p.platform ?? "?"),
        ready: Boolean(p.ready),
        checksPassed: Number(p.checksPassed ?? 0),
        checksTotal: Number(p.checksTotal ?? 0),
        title: String(p.title ?? r.summary),
        url: String(cut.url ?? ""),
        file: String(cut.file ?? ""),
        subtitleCues: Number(subtitle.cues ?? 0),
        subtitleFormat: String(subtitle.format ?? "none"),
        packageDir: p.package && typeof p.package === "object" ? String((p.package as { dir?: unknown }).dir ?? "") || null : null,
        createdAt: r.createdAt.toISOString(),
      }];
    } catch {
      return [];
    }
  });
}

/**
 * Stage a publish package for one episode on one platform: finds the
 * episode's latest cut on the delivery spine, probes it, builds the
 * metadata + subtitles, conformance-checks and lands a PUBLISH event.
 * No network calls - staging is local and honest by design.
 */
export async function stagePublishPackage(
  episodeId: string,
  platformId: string,
): Promise<{ ok: true; pkg: PublishPackage } | { ok: false; error: string }> {
  const preset = platformPreset(platformId);
  if (!preset) {
    return { ok: false, error: `unknown platform "${platformId}" - available: ${PLATFORM_PRESETS.map((p) => p.id).join(", ")}` };
  }

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      season: { include: { project: true } },
      scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: { number: "asc" }, include: { audioCues: true } } } },
    },
  });
  if (!episode) return { ok: false, error: "Episode not found" };
  const project = episode.season.project;

  // the episode's latest cut event on the spine
  const epTag = `EP${String(episode.number).padStart(2, "0")}`;
  const cutEvents = await db.productionEvent.findMany({
    where: { projectId: project.id, type: "RENDER", summary: { startsWith: CUT_EVENT_PREFIX } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const cutEvent = cutEvents.find((e) => e.summary.includes(epTag));
  if (!cutEvent) {
    return { ok: false, error: `no cut exported for EP${String(episode.number).padStart(2, "0")} yet - export one from the Episode cut panel first` };
  }
  let cutUrl = "";
  try {
    cutUrl = String((JSON.parse(cutEvent.payload ?? "{}") as { url?: unknown }).url ?? "");
  } catch {
    cutUrl = "";
  }
  if (!cutUrl) return { ok: false, error: "the cut event carries no file url - export the cut again" };

  const cutAbs = path.join(process.cwd(), "public", cutUrl.replace(/^\//, "").split("?")[0]);
  if (!fs.existsSync(cutAbs)) return { ok: false, error: `the cut file is missing on disk (${cutUrl}) - export the cut again` };
  const bytes = fs.statSync(cutAbs).size;

  // the cut manifest carries the per-shot timeline the subtitles ride
  const manifestAbs = cutAbs.replace(/\.mp4$/, ".json");
  interface CutManifest {
    shots?: Array<{ shotId: string; startMs: number; durationMs: number }>;
  }
  let manifest: CutManifest | null = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestAbs, "utf8")) as CutManifest;
  } catch {
    manifest = null;
  }

  const shotsById = new Map(episode.scenes.flatMap((s) => s.shots).map((s) => [s.id, s]));
  const subtitleCues: SubtitleCue[] = [];
  let subtitleNote = "timed through the cut manifest's shot slots (VOICE cue windows when takes exist)";
  if (manifest?.shots?.length) {
    for (const slot of manifest.shots) {
      const shot = shotsById.get(slot.shotId);
      if (!shot || !shot.dialogue) continue;
      const speech = parseDialogue(shot.dialogue).filter((l) => l.kind === "SPEECH" && l.text.trim().length > 0);
      if (speech.length === 0) continue;
      const voiceCues = shot.audioCues
        .filter((c) => c.kind === "VOICE")
        .sort((a, b) => a.startMs - b.startMs)
        .map((c) => ({ startMs: c.startMs, durationMs: c.voiceDurationMs ?? 0 }));
      const program = buildSpeechProgram({
        dialogue: shot.dialogue,
        shotDurationMs: Math.max(400, Math.round(slot.durationMs)),
        voiceTakes: voiceCues,
      });
      for (const span of program.spans) {
        subtitleCues.push({ startMs: slot.startMs + span.startMs, endMs: slot.startMs + span.endMs, text: span.text });
      }
    }
  } else {
    subtitleNote = "cut manifest missing - subtitles skipped (re-export the cut to restore them)";
  }
  subtitleCues.sort((a, b) => a.startMs - b.startMs);

  const probe = await probeMedia(cutAbs);
  const media: CutMedia = {
    durationMs: Math.round((probe?.durationSec ?? 0) * 1000),
    width: probe?.width ?? preset.width,
    height: probe?.height ?? preset.height,
    fps: probe?.fps ?? 24,
    bytes,
  };

  const pkg = buildPublishPackage({
    preset,
    project: { title: project.title, visualStyle: project.visualStyle, animationType: project.animationType },
    episode: { number: episode.number, title: episode.title, synopsis: episode.synopsis },
    media,
    cutUrl,
    subtitleCues,
    subtitleNote,
  });

  const checksPassed = pkg.conformance.filter((c) => c.ok).length;
  const pkgFolder = writePackageFolder(pkg, epTag);
  if (pkgFolder) {
    pkg.package = pkgFolder;
  }
  await db.productionEvent.create({
    data: {
      projectId: project.id,
      actor: "USER",
      type: "PUBLISH",
      summary: `Publish package staged - ${epTag} -> ${preset.label}: ${checksPassed}/${pkg.conformance.length} checks passed, ${pkg.ready ? "ready for upload" : "fix conformance before uploading"}${pkgFolder ? `, hand-off folder ${pkgFolder.dir}` : ""}`,
      payload: JSON.stringify({
        platform: pkg.platform,
        platformLabel: pkg.platformLabel,
        ready: pkg.ready,
        checksPassed,
        checksTotal: pkg.conformance.length,
        title: pkg.title,
        description: pkg.description,
        subtitle: { format: pkg.subtitle.format, cues: pkg.subtitle.cues, filename: pkg.subtitle.filename },
        integration: pkg.integration,
        cut: pkg.cut,
        conformance: pkg.conformance,
        tags: pkg.tags,
        package: pkgFolder,
      }),
    },
  });

  return { ok: true, pkg };
}
