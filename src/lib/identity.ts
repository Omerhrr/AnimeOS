import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { db } from "@/lib/db";
import { detectCast } from "@/lib/ai/art";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import { probeMedia, ffmpegPath } from "@/lib/bridge/motion";
import { affinityBetween, embedPublicImage } from "@/lib/embedding";

// ─────────────────────────────────────────────────────────────
// IDENTITY-SIMILARITY SCORING FOR PANELS
//
// The qualitative art checks (ART_DRIFT verdicts, universe-fact
// holds) answer "does this hold?"; identity scoring answers the
// casting-director question numerically: HOW CLOSE is the character
// in this panel to their canonical model sheet, per aspect?
//
// One vision call per panel: the panel art plus every featured
// character's model sheet go in together, the model returns a strict
// JSON verdict with a 0..1 similarity per character and per aspect
// (face, hair, wardrobe, weapon, palette, style). The verdict
// persists on the panel (one IdentityScore row per shot, replaced on
// re-score), the worst similarity across the panel's cast becomes
// the panel's headline number, and a low worst lands an
// IDENTITY_DRIFT continuity event (WARNING) next to the score so the
// re-paint loop can pick it up.
// ─────────────────────────────────────────────────────────────

export const IDENTITY_REPAINT_THRESHOLD = 0.6; // worst below this = drift warning + re-paint offer

export const IDENTITY_ASPECTS = ["face", "hair", "wardrobe", "weapon", "palette", "style"] as const;
export type IdentityAspect = (typeof IDENTITY_ASPECTS)[number];

export interface IdentityScoreEntry {
  characterName: string;
  similarity: number; // 0..1
  aspects: Partial<Record<IdentityAspect, number>>;
  note: string;
}

export interface IdentityVerdict {
  entries: IdentityScoreEntry[];
  worst: number;
  note: string;
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

interface VisionIdentityBody {
  note?: string;
  characters?: Array<{
    name?: unknown;
    similarity?: unknown;
    aspects?: Record<string, unknown>;
    note?: unknown;
  }>;
}

/**
 * Parse the vision model's strict-JSON verdict against the panel's
 * anchored cast: known names kept (clamped, aspects filtered to the
 * six tracked axes), cast members the model did not mention score 0
 * with an explicit note so an absent character is never read as a
 * good score. Pure - the E2E exercises it without a model.
 */
export function parseIdentityVerdict(raw: string, castNames: string[]): IdentityVerdict | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let body: VisionIdentityBody;
  try {
    body = JSON.parse(match[0]) as VisionIdentityBody;
  } catch {
    return null;
  }
  const byName = new Map<string, NonNullable<VisionIdentityBody["characters"]>[number]>();
  for (const row of body.characters ?? []) {
    const name = String(row?.name ?? "").trim();
    if (name) byName.set(name, row);
  }
  const entries: IdentityScoreEntry[] = castNames.map((name) => {
    const row = byName.get(name);
    if (!row) {
      return { characterName: name, similarity: 0, aspects: {}, note: "not detected in the panel by the vision model" };
    }
    const aspects: Partial<Record<IdentityAspect, number>> = {};
    for (const aspect of IDENTITY_ASPECTS) {
      const v = row.aspects?.[aspect];
      if (v !== undefined && v !== null) aspects[aspect] = clamp01(v);
    }
    return {
      characterName: name,
      similarity: clamp01(row.similarity),
      aspects,
      note: String(row.note ?? "").slice(0, 300),
    };
  });
  if (entries.length === 0) return null;
  const worst = Math.min(...entries.map((e) => e.similarity));
  const note = String(body.note ?? "").slice(0, 300);
  return { entries, worst, note };
}

export interface IdentityScoredShot {
  shotId: string;
  ref: string;
  episode: number;
  source: IdentitySource;
  verdict: IdentityVerdict;
  scoredAt: string;
}

/** What the vision model looked at: the storyboard panel or a frame from the finished clip. */
export type IdentitySource = "PANEL" | "RENDER";

/** The shot row shape the identity pipeline needs (project + cast + sheets). */
type IdentityShot = NonNullable<Awaited<ReturnType<typeof loadIdentityShot>>>;

async function loadIdentityShot(shotId: string) {
  return db.shot.findUnique({
    where: { id: shotId },
    include: {
      scene: {
        include: {
          episode: {
            include: {
              season: { include: { project: { include: { characters: { include: { states: true } } } } } },
            },
          },
        },
      },
    },
  });
}

/**
 * Guard + image loading shared by the real and raw paths: resolves
 * the sheeted cast and data-URLs the artifact under judgment (the
 * panel art by default, or a caller-supplied render poster) plus
 * every sheet.
 */
async function prepareIdentityContext(
  shot: IdentityShot,
  override?: { imageData: string; error: string }, // a RENDER source hands its poster here
) {
  const episode = shot.scene.episode;
  const project = episode.season.project;
  const cast = detectCast(project.characters, shot.description).filter((c) => c.modelSheetUrl);
  if (cast.length === 0) {
    return { ok: false as const, error: "No featured character with a model sheet - generate a sheet first (the anchor is what identity is scored against)" };
  }
  let artData: string;
  if (override) {
    artData = override.imageData;
  } else {
    if (!shot.artworkUrl) return { ok: false as const, error: "This shot has no panel art to score yet" };
    const data = publicImageAsDataUrl(shot.artworkUrl);
    if (!data) return { ok: false as const, error: "Panel art is missing on disk" };
    artData = data;
  }
  const sheets = cast
    .map((c) => ({ name: c.name, data: publicImageAsDataUrl(c.modelSheetUrl as string) }))
    .filter((s): s is { name: string; data: string } => Boolean(s.data));
  if (sheets.length === 0) return { ok: false as const, error: "Model sheets are missing on disk" };
  const shotRef = `E${episode.number} Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;
  return { ok: true as const, episode, project, sheets, artData, shotRef };
}

function buildIdentityPrompt(sheets: Array<{ name: string }>): string {
  const manifest = sheets.map((s, i) => `Image ${i + 2}: canonical model sheet for ${s.name}`).join(", ");
  return [
    "You are a casting director for an animation production checking character identity.",
    `Image 1 is a story panel. ${manifest}.`,
    "For EACH named character, judge how closely the panel's depiction matches their canonical sheet and score similarity from 0 to 1, plus a score per aspect: face, hair, wardrobe, weapon, palette, style (0 to 1 each, only when the aspect is visible - omit aspects that cannot be judged).",
    "Reply with STRICT JSON only, no markdown fences:",
    '{"note": "one sentence about the panel", "characters": [{"name": "<sheet name>", "similarity": 0.0, "aspects": {"face": 0.0, "hair": 0.0}, "note": "what matches or drifted"}]}',
    "Judge only what is visible: a weapon kept off-frame is not a drift, a recolored blade is.",
  ].join("\n");
}

/**
 * Score ONE panel against its sheeted cast with the REAL vision
 * model: the artifact (panel art, or a render's poster frame) and
 * every featured character's model sheet go in as one image set; the
 * raw verdict flows into the same persist path as
 * scoreShotIdentityFromRaw.
 */
export async function scoreShotIdentity(shotId: string, source: IdentitySource = "PANEL"): Promise<
  { ok: true; scored: IdentityScoredShot } | { ok: false; error: string }
> {
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };
  const poster = source === "RENDER" ? await renderPosterForShot(shotId) : null;
  if (source === "RENDER" && poster === null) {
    return { ok: false, error: "This shot has no finished render to score yet - render it first" };
  }
  const ctx = await prepareIdentityContext(shot, poster ? { imageData: poster.dataUrl, error: "" } : undefined);
  if (!ctx.ok) return ctx;

  let raw = "";
  try {
    const zai = await ZAI.create();
    const res = (await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildIdentityPrompt(ctx.sheets) },
            { type: "image_url", image_url: { url: ctx.artData } },
            ...ctx.sheets.map((s) => ({ type: "image_url" as const, image_url: { url: s.data } })),
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    raw = res.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "identity scoring failed" };
  }
  return persistIdentityVerdict(shot, ctx, raw, source);
}

/**
 * Score ONE panel from a PRE-RETRIEVED raw verdict (the strict-JSON
 * body the vision model is asked for). Same validation, same
 * persistence, same events as the real path - the E2E drives this
 * when the vision provider is rate-limited (the provider loop itself
 * is proven by the live path and by earlier iterations).
 */
export async function scoreShotIdentityFromRaw(shotId: string, raw: string, source: IdentitySource = "PANEL"): Promise<
  { ok: true; scored: IdentityScoredShot } | { ok: false; error: string }
> {
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };
  const poster = source === "RENDER" ? await renderPosterForShot(shotId) : null;
  if (source === "RENDER" && poster === null) {
    return { ok: false, error: "This shot has no finished render to score yet - render it first" };
  }
  const ctx = await prepareIdentityContext(shot, poster ? { imageData: poster.dataUrl, error: "" } : undefined);
  if (!ctx.ok) return ctx;
  return persistIdentityVerdict(shot, ctx, raw, source);
}

/**
 * Shared persistence tail: parse the raw verdict against the panel's
 * sheeted cast, upsert the IdentityScore row, replace prior identity
 * events and land the IDENTITY_VERIFIED / IDENTITY_DRIFT event.
 */
async function persistIdentityVerdict(
  shot: IdentityShot,
  ctx: { ok: true; episode: { number: number }; project: { id: string }; sheets: Array<{ name: string }>; shotRef: string },
  raw: string,
  source: IdentitySource = "PANEL",
): Promise<{ ok: true; scored: IdentityScoredShot } | { ok: false; error: string }> {
  const verdict = parseIdentityVerdict(raw, ctx.sheets.map((s) => s.name));
  if (!verdict) return { ok: false, error: `vision model returned unparsable verdict: ${raw.slice(0, 120)}` };

  const scoredAt = new Date();
  await db.identityScore.upsert({
    where: { shotId_source: { shotId: shot.id, source } },
    create: {
      projectId: ctx.project.id,
      shotId: shot.id,
      source,
      scores: JSON.stringify(verdict.entries),
      worst: verdict.worst,
      castSize: verdict.entries.length,
      note: verdict.note,
      scoredAt,
    },
    update: {
      scores: JSON.stringify(verdict.entries),
      worst: verdict.worst,
      castSize: verdict.entries.length,
      note: verdict.note,
      scoredAt,
    },
  });

  // replace prior identity events for this shot + source so the stream stays readable
  const tag = `[identity ${ctx.shotRef} ${source}]`;
  await db.continuityEvent.deleteMany({
    where: { projectId: ctx.project.id, kind: { in: ["IDENTITY_VERIFIED", "IDENTITY_DRIFT"] }, description: { startsWith: tag } },
  });
  const drifted = verdict.worst < IDENTITY_REPAINT_THRESHOLD;
  const scoreLine = verdict.entries
    .map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`)
    .join(", ");
  await db.continuityEvent.create({
    data: {
      projectId: ctx.project.id,
      entityType: "CHARACTER",
      entityName: verdict.entries[0]?.characterName ?? ctx.sheets[0]?.name ?? "cast",
      kind: drifted ? "IDENTITY_DRIFT" : "IDENTITY_VERIFIED",
      episodeNumber: ctx.episode.number,
      description: `${tag} ${scoreLine} - worst ${(verdict.worst * 100).toFixed(0)}%${verdict.note ? ` (${verdict.note})` : ""}`.slice(0, 900),
      severity: drifted ? "WARNING" : "INFO",
    },
  });

  return {
    ok: true,
    scored: {
      shotId: shot.id,
      ref: ctx.shotRef,
      episode: ctx.episode.number,
      source,
      verdict,
      scoredAt: scoredAt.toISOString(),
    },
  };
}

/**
 * Extract ONE representative frame from a finished render clip with
 * ffmpeg (40% into the clip - past the fade-in, before the tail) and
 * return it as a data URL. The poster is cached per job id under
 * public/renders/posters/. Returns null when ffmpeg or the clip is
 * unavailable - the caller reports the gap honestly.
 */
export async function extractRenderPoster(clipAbsPath: string, jobId: string): Promise<string | null> {
  try {
    if (!fs.existsSync(clipAbsPath)) return null;
    const postersDir = path.join(process.cwd(), "public", "renders", "posters");
    fs.mkdirSync(postersDir, { recursive: true });
    const out = path.join(postersDir, `${jobId}.jpg`);
    if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
      const ff = (ffmpegPath() as string | null) ?? "ffmpeg";
      const probe = await probeMedia(clipAbsPath);
      const dur = Math.max(0.5, probe?.durationSec ?? 5);
      const at = (dur * 0.4).toFixed(2);
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn(ff, ["-y", "-ss", at, "-i", clipAbsPath, "-frames:v", "1", "-q:v", "3", out], {
          stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("close", (code) => resolve(code === 0));
        child.on("error", () => resolve(false));
      });
      if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) return null;
    }
    const b64 = fs.readFileSync(out).toString("base64");
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

interface RenderPoster {
  dataUrl: string;
  jobId: string;
}

/** The latest finished clip for a shot, as a poster data URL. */
async function renderPosterForShot(shotId: string): Promise<RenderPoster | null> {
  const job = await db.renderJob.findFirst({
    where: { shotId, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!job?.outputUrl) return null;
  const clipAbs = path.join(process.cwd(), "public", job.outputUrl.split("?")[0].replace(/^\//, ""));
  const dataUrl = await extractRenderPoster(clipAbs, job.id);
  return dataUrl ? { dataUrl, jobId: job.id } : null;
}

/**
 * Score ONE shot's FINISHED RENDER (a frame pulled from the clip)
 * against its cast's model sheets. The shipping pixels answer the
 * casting-director question - the panel score judges the storyboard,
 * this judges what actually lands in the cut. Persists under source
 * RENDER so both verdicts live side by side.
 */
export async function scoreRenderIdentity(shotId: string): Promise<
  { ok: true; scored: IdentityScoredShot } | { ok: false; error: string }
> {
  return scoreShotIdentity(shotId, "RENDER");
}

/**
 * Batch score: panels with art + an anchored cast (PANEL) or shots
 * with finished clips (RENDER), worst EXISTING scores first, then
 * never-scored. Capped - every score is a real vision call.
 */
export async function scoreProjectIdentity(projectId: string, limit = 4, source: IdentitySource = "PANEL"): Promise<{ scored: IdentityScoredShot[]; errors: Array<{ ref: string; error: string }> }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { characters: { include: { states: true } } },
  });
  if (!project) return { scored: [], errors: [] };

  const rows = await db.shot.findMany({
    where: source === "RENDER"
      ? {
          scene: { episode: { season: { projectId } } },
          renderJobs: { some: { outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } } },
        }
      : { scene: { episode: { season: { projectId } } }, artworkUrl: { not: null } },
    include: {
      identityScores: true,
      scene: { include: { episode: { include: { season: { select: { number: true } } } } } },
    },
    orderBy: { artGeneratedAt: "desc" },
    take: 40,
  });

  const castByDescription = (description: string) =>
    detectCast(project.characters, description).filter((c) => c.modelSheetUrl);

  const candidates = rows
    .filter((r) => castByDescription(r.description).length > 0)
    .sort((a, b) => {
      const sa = a.identityScores.find((s) => s.source === source);
      const sb = b.identityScores.find((s) => s.source === source);
      const wa = sa?.worst ?? -1;
      const wb = sb?.worst ?? -1;
      if (wa === -1 && wb === -1) return 0;
      if (wa === -1) return 1; // unscored after known-bad
      if (wb === -1) return -1;
      return wa - wb; // lowest similarity first
    })
    .slice(0, Math.max(1, Math.min(8, Math.round(limit) || 4)));

  const scored: IdentityScoredShot[] = [];
  const errors: Array<{ ref: string; error: string }> = [];
  for (const row of candidates) {
    const res = source === "RENDER" ? await scoreRenderIdentity(row.id) : await scoreShotIdentity(row.id, "PANEL");
    if (res.ok) scored.push(res.scored);
    else errors.push({ ref: `E${row.scene.episode.number} Sc${row.scene.number} S${String(row.number).padStart(3, "0")}`, error: res.error });
  }
  return { scored, errors };
}

export interface IdentityPanelRow {
  shotId: string;
  ref: string;
  description: string;
  artUrl: string | null;
  source: IdentitySource; // what the vision model judged: the panel or a render frame
  worst: number | null; // null = never scored
  castSize: number;
  note: string | null;
  scoredAt: string | null;
  entries: IdentityScoreEntry[];
}

export interface IdentityPanelData {
  rows: IdentityPanelRow[]; // scored rows, worst first
  queue: Array<{ shotId: string; ref: string; description: string; source: IdentitySource; worst: number; entries: IdentityScoreEntry[] }>; // worst < threshold
  shots: Array<{ shotId: string; ref: string; description: string; hasArt: boolean }>; // score-now picker
  threshold: number;
  average: number | null;
  embeddings: Record<string, AffinityRowData>; // per-shot provider-free affinity rows
  drift: IdentityDriftData; // per-character curves over episode order
}

/** Panel feed for the Continuity view's identity panel. */
export async function identityPanelData(projectId: string): Promise<IdentityPanelData> {
  const [project, drift] = await Promise.all([
    db.project.findUnique({
    where: { id: projectId },
    include: { characters: { include: { states: true } } },
  }),
    identityDriftData(projectId).catch(() => ({ characters: [], watch: [], headline: "identity drift curves unavailable" } as IdentityDriftData)),
  ]);
  if (!project) return { rows: [], queue: [], shots: [], threshold: IDENTITY_REPAINT_THRESHOLD, average: null, embeddings: {}, drift };

  const rows = await db.shot.findMany({
    where: { scene: { episode: { season: { projectId } } }, artworkUrl: { not: null } },
    include: {
      identityScores: true,
      scene: { include: { episode: { include: { season: { select: { number: true } } } } } },
    },
    orderBy: [{ artGeneratedAt: "desc" }],
    take: 60,
  });

  const hasAnchoredCast = (description: string) =>
    detectCast(project.characters, description).some((c) => c.modelSheetUrl);

  const panelRows: IdentityPanelRow[] = rows
    .filter((r) => r.identityScores.length > 0 && hasAnchoredCast(r.description))
    .flatMap((r) =>
      r.identityScores.map((score) => {
        let entries: IdentityScoreEntry[] = [];
        try {
          const parsed = JSON.parse(score.scores);
          if (Array.isArray(parsed)) entries = parsed as IdentityScoreEntry[];
        } catch {
          entries = [];
        }
        return {
          shotId: r.id,
          ref: `E${r.scene.episode.number} Sc${r.scene.number} S${String(r.number).padStart(3, "0")}`,
          description: r.description,
          artUrl: r.artworkUrl,
          source: (score.source === "RENDER" ? "RENDER" : "PANEL") as IdentitySource,
          worst: score.worst,
          castSize: score.castSize,
          note: score.note,
          scoredAt: score.scoredAt.toISOString(),
          entries,
        };
      }),
    )
    .sort((a, b) => (a.worst ?? 1) - (b.worst ?? 1));

  const queue = panelRows
    .filter((r) => (r.worst ?? 1) < IDENTITY_REPAINT_THRESHOLD)
    .map((r) => ({ shotId: r.shotId, ref: r.ref, description: r.description, source: r.source, worst: r.worst as number, entries: r.entries }));

  const shots = rows.slice(0, 30).map((r) => ({
    shotId: r.id,
    ref: `E${r.scene.episode.number} Sc${r.scene.number} S${String(r.number).padStart(3, "0")}`,
    description: r.description,
    hasArt: Boolean(r.artworkUrl),
  }));

  const worstValues = panelRows.map((r) => r.worst).filter((v): v is number => v !== null);
  const average = worstValues.length > 0 ? worstValues.reduce((a, b) => a + b, 0) / worstValues.length : null;

  const embeddings = await db.panelEmbedding.findMany({
    where: { projectId, shotId: { in: rows.map((r) => r.id) } },
  });
  const embeddingMap: Record<string, AffinityRowData> = {};
  for (const e of embeddings) {
    let rows: AffinityEntry[] = [];
    try {
      const parsed = JSON.parse(e.rows);
      if (Array.isArray(parsed)) rows = parsed as AffinityEntry[];
    } catch {
      rows = [];
    }
    embeddingMap[e.shotId] = { worst: e.worst, hashHex: e.hashHex, computedAt: e.computedAt.toISOString(), entries: rows };
  }

  return { rows: panelRows, queue, shots, threshold: IDENTITY_REPAINT_THRESHOLD, average, embeddings: embeddingMap, drift };
}

// ─────────────────────────────────────────────────────────────
// PER-CHARACTER IDENTITY DRIFT CURVES
//
// One scored panel is a data point; the SEQUENCE of a character's
// scores over episode order is a curve, and the curve answers the
// question a single score cannot: is this character's resemblance
// to their sheet stable across the show, improving, or slowly
// sliding? Pure rollup + a loader, both exported for the E2E.
// ─────────────────────────────────────────────────────────────

export interface DriftPoint {
  episode: number;
  scene: number;
  shot: number;
  score: number; // that panel's similarity for this character
  scoredAt: string;
}

export type DriftTrend = "IMPROVING" | "DECLINING" | "STABLE" | "FLAT";

export interface CharacterDrift {
  characterName: string;
  points: DriftPoint[]; // ordered by episode, then scene, then shot
  first: number | null; // earliest point's score
  last: number | null; // latest point's score
  delta: number | null; // last - first (null with fewer than 2 points)
  trend: DriftTrend;
  worstAspect: string | null; // lowest-mean aspect across the curve
  panels: number;
}

export const DRIFT_TREND_THRESHOLD = 0.05; // |delta| below this reads as stable

function driftTrend(delta: number | null, panels: number): DriftTrend {
  if (panels < 2 || delta == null) return "FLAT";
  if (delta <= -DRIFT_TREND_THRESHOLD) return "DECLINING";
  if (delta >= DRIFT_TREND_THRESHOLD) return "IMPROVING";
  return "STABLE";
}

/**
 * Roll IdentityScore rows (one per shot) into per-character curves.
 * Every cast member mentioned in ANY scored panel gets a curve,
 * points ordered by episode/scene/shot. Pure - the E2E drives it.
 */
export function identityDriftFromRows(
  rows: Array<{ scores: string; episode: number; scene: number; shot: number; scoredAt: Date | string }>,
): CharacterDrift[] {
  interface Acc {
    points: DriftPoint[];
    aspectSums: Map<string, { sum: number; n: number }>;
  }
  const byChar = new Map<string, Acc>();
  for (const row of rows) {
    let entries: IdentityScoreEntry[] = [];
    try {
      const parsed = JSON.parse(row.scores);
      if (Array.isArray(parsed)) entries = parsed as IdentityScoreEntry[];
    } catch {
      continue;
    }
    const at = row.scoredAt instanceof Date ? row.scoredAt.toISOString() : String(row.scoredAt);
    for (const entry of entries) {
      if (!entry || typeof entry.characterName !== "string") continue;
      const name = entry.characterName;
      const acc: Acc = byChar.get(name) ?? { points: [], aspectSums: new Map() };
      acc.points.push({
        episode: row.episode,
        scene: row.scene,
        shot: row.shot,
        score: Math.min(1, Math.max(0, Number(entry.similarity) || 0)),
        scoredAt: at,
      });
      for (const [aspect, v] of Object.entries(entry.aspects ?? {})) {
        const num = Number(v);
        if (!Number.isFinite(num)) continue;
        const cur = acc.aspectSums.get(aspect) ?? { sum: 0, n: 0 };
        cur.sum += num;
        cur.n += 1;
        acc.aspectSums.set(aspect, cur);
      }
      byChar.set(name, acc);
    }
  }
  return [...byChar.entries()].map(([characterName, acc]) => {
    const points = acc.points.sort(
      (a, b) => a.episode - b.episode || a.scene - b.scene || a.shot - b.shot || a.scoredAt.localeCompare(b.scoredAt),
    );
    const first = points.length > 0 ? points[0].score : null;
    const last = points.length > 0 ? points[points.length - 1].score : null;
    const delta = first != null && last != null && points.length >= 2 ? last - first : null;
    let worstAspect: string | null = null;
    let worstMean = 1.01;
    for (const [aspect, { sum, n }] of acc.aspectSums) {
      const mean = sum / n;
      if (mean < worstMean) {
        worstMean = mean;
        worstAspect = aspect;
      }
    }
    return {
      characterName,
      points,
      first,
      last,
      delta,
      trend: driftTrend(delta, points.length),
      worstAspect,
      panels: points.length,
    };
  }).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)); // steepest decline first
}

export interface IdentityDriftData {
  characters: CharacterDrift[]; // every curved character, steepest decline first
  watch: CharacterDrift[]; // the DECLINING subset
  headline: string;
}

/** Per-character drift curves over episode order for one production. */
export async function identityDriftData(projectId: string): Promise<IdentityDriftData> {
  const rows = await db.identityScore.findMany({
    // PANEL rows only: a shot scored from both its storyboard and its
    // render would double-count as two points on the same episode slot
    where: { projectId, source: "PANEL" },
    include: { shot: { include: { scene: { include: { episode: true } } } } },
    orderBy: { scoredAt: "asc" },
    take: 400,
  });
  const characters = identityDriftFromRows(
    rows.map((r) => ({
      scores: r.scores,
      episode: r.shot.scene.episode.number,
      scene: r.shot.scene.number,
      shot: r.shot.number,
      scoredAt: r.scoredAt,
    })),
  );
  const watch = characters.filter((c) => c.trend === "DECLINING");
  const headline = characters.length === 0
    ? "no identity drift curves yet - score a few panels"
    : watch.length > 0
      ? `${watch.length} of ${characters.length} curved character(s) DECLINING over episode order: ${watch.map((c) => `${c.characterName} ${(c.delta! * 100).toFixed(0)}%`).join(", ")}`
      : `${characters.length} character curve(s), none declining`;
  return { characters, watch, headline };
}

// ─────────────────────────────────────────────────────────────
// PROVIDER-FREE AFFINITY PASS (the embedding tripwire)
// ─────────────────────────────────────────────────────────────

export const AFFINITY_WATCH_THRESHOLD = 0.5; // heuristic tripwire line, NOT the identity bar

export interface AffinityEntry {
  characterName: string;
  palette: number; // cosine of the 4x4x4 palette histograms
  structure: number; // bit agreement of the 64-bit dHashes
  combined: number; // mean of both
  note: string;
}

export interface AffinityVerdict {
  entries: AffinityEntry[];
  worst: number;
}

export interface AffinityRowData {
  worst: number;
  hashHex: string;
  computedAt: string;
  entries: AffinityEntry[];
}

export interface AffinityScoredShot {
  shotId: string;
  ref: string;
  episode: number;
  verdict: AffinityVerdict;
  computedAt: string;
}

/** Parse stored affinity rows defensively. */
export function parseAffinityRows(raw: string | null | undefined): AffinityEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((r) => ({
        characterName: String(r.characterName ?? "?"),
        palette: Number(r.palette ?? 0),
        structure: Number(r.structure ?? 0),
        combined: Number(r.combined ?? 0),
        note: String(r.note ?? ""),
      }));
  } catch {
    return [];
  }
}

/** Describe an affinity in one honest line. Pure. */
export function describeAffinity(entry: AffinityEntry): string {
  return `${entry.characterName} ${(entry.combined * 100).toFixed(0)}% affinity (palette ${(entry.palette * 100).toFixed(0)}%, structure ${(entry.structure * 100).toFixed(0)}%)`;
}

/**
 * PROVIDER-FREE affinity pass for ONE panel: embed the panel art and
 * every sheeted featured character's model sheet locally (dHash +
 * palette histogram), compare with pure math, persist a
 * PanelEmbedding row. No network, no model - instant.
 */
export async function scoreShotEmbedding(shotId: string): Promise<
  { ok: true; scored: AffinityScoredShot } | { ok: false; error: string }
> {
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };
  if (!shot.artworkUrl) return { ok: false, error: "This shot has no panel art to embed yet" };
  const episode = shot.scene.episode;
  const project = episode.season.project;
  const cast = detectCast(project.characters, shot.description).filter((c) => c.modelSheetUrl);
  if (cast.length === 0) {
    return { ok: false, error: "No featured character with a model sheet - the affinity pass compares against sheets too" };
  }

  const panelEmbed = await embedPublicImage(shot.artworkUrl);
  if (!panelEmbed) return { ok: false, error: "Panel art is missing on disk or unreadable" };

  const entries: AffinityEntry[] = [];
  for (const member of cast) {
    const sheetEmbed = await embedPublicImage(member.modelSheetUrl as string);
    if (!sheetEmbed) continue;
    const aff = affinityBetween(panelEmbed.palette, panelEmbed.hash, sheetEmbed.palette, sheetEmbed.hash);
    entries.push({
      characterName: member.name,
      palette: aff.palette,
      structure: aff.structure,
      combined: aff.combined,
      note: aff.combined < AFFINITY_WATCH_THRESHOLD
        ? "far from the sheet in palette or structure - likely a different composition or grade, check the vision score"
        : "artwork-level tripwire only: the vision identity score stays the authority",
    });
  }
  if (entries.length === 0) return { ok: false, error: "Model sheets are missing on disk or unreadable" };

  const worst = Math.min(...entries.map((e) => e.combined));
  const computedAt = new Date();
  await db.panelEmbedding.upsert({
    where: { shotId: shot.id },
    create: {
      projectId: project.id,
      shotId: shot.id,
      hashHex: panelEmbed.hashHex,
      rows: JSON.stringify(entries),
      worst,
      computedAt,
    },
    update: {
      hashHex: panelEmbed.hashHex,
      rows: JSON.stringify(entries),
      worst,
      computedAt,
    },
  });

  return {
    ok: true,
    scored: {
      shotId: shot.id,
      ref: `E${episode.number} Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`,
      episode: episode.number,
      verdict: { entries, worst },
      computedAt: computedAt.toISOString(),
    },
  };
}

/**
 * Batch the free pass over a production: art-bearing panels with a
 * sheeted cast, capped. Cheapest-first ordering is unnecessary - the
 * whole pass is local math.
 */
export async function scoreProjectEmbeddings(projectId: string, limit = 8): Promise<{ scored: AffinityScoredShot[]; errors: Array<{ ref: string; error: string }> }> {
  const rows = await db.shot.findMany({
    where: { scene: { episode: { season: { projectId } } }, artworkUrl: { not: null } },
    include: {
      panelEmbedding: true,
      scene: { include: { episode: { include: { season: { select: { number: true } } } } } },
    },
    orderBy: { artGeneratedAt: "desc" },
    take: 40,
  });
  if (rows.length === 0) return { scored: [], errors: [] };

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { characters: { include: { states: true } } },
  });
  if (!project) return { scored: [], errors: [] };

  const hasSheetedCast = (description: string) => detectCast(project.characters, description).some((c) => c.modelSheetUrl);
  const candidates = rows
    .filter((r) => hasSheetedCast(r.description))
    .sort((a, b) => (a.panelEmbedding?.worst ?? -1) - (b.panelEmbedding?.worst ?? -1))
    .slice(0, Math.max(1, Math.min(12, Math.round(limit) || 8)));

  const scored: AffinityScoredShot[] = [];
  const errors: Array<{ ref: string; error: string }> = [];
  for (const row of candidates) {
    const res = await scoreShotEmbedding(row.id);
    if (res.ok) scored.push(res.scored);
    else errors.push({ ref: `E${row.scene.episode.number} Sc${row.scene.number} S${String(row.number).padStart(3, "0")}`, error: res.error });
  }
  return { scored, errors };
}
