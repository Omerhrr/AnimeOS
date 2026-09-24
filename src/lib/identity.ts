import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { detectCast } from "@/lib/ai/art";
import { publicImageAsDataUrl } from "@/lib/continuity-art";

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
  verdict: IdentityVerdict;
  scoredAt: string;
}

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
 * the sheeted cast and data-URLs the panel + every sheet.
 */
async function prepareIdentityContext(shot: IdentityShot) {
  if (!shot.artworkUrl) return { ok: false as const, error: "This shot has no panel art to score yet" };
  const episode = shot.scene.episode;
  const project = episode.season.project;
  const cast = detectCast(project.characters, shot.description).filter((c) => c.modelSheetUrl);
  if (cast.length === 0) {
    return { ok: false as const, error: "No featured character with a model sheet - generate a sheet first (the anchor is what identity is scored against)" };
  }
  const artData = publicImageAsDataUrl(shot.artworkUrl);
  if (!artData) return { ok: false as const, error: "Panel art is missing on disk" };
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
 * model: the panel art and every featured character's model sheet go
 * in as one image set; the raw verdict flows into the same persist
 * path as scoreShotIdentityFromRaw.
 */
export async function scoreShotIdentity(shotId: string): Promise<
  { ok: true; scored: IdentityScoredShot } | { ok: false; error: string }
> {
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };
  const ctx = await prepareIdentityContext(shot);
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
  return persistIdentityVerdict(shot, ctx, raw);
}

/**
 * Score ONE panel from a PRE-RETRIEVED raw verdict (the strict-JSON
 * body the vision model is asked for). Same validation, same
 * persistence, same events as the real path - the E2E drives this
 * when the vision provider is rate-limited (the provider loop itself
 * is proven by the live path and by earlier iterations).
 */
export async function scoreShotIdentityFromRaw(shotId: string, raw: string): Promise<
  { ok: true; scored: IdentityScoredShot } | { ok: false; error: string }
> {
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };
  const ctx = await prepareIdentityContext(shot);
  if (!ctx.ok) return ctx;
  return persistIdentityVerdict(shot, ctx, raw);
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
): Promise<{ ok: true; scored: IdentityScoredShot } | { ok: false; error: string }> {
  const verdict = parseIdentityVerdict(raw, ctx.sheets.map((s) => s.name));
  if (!verdict) return { ok: false, error: `vision model returned unparsable verdict: ${raw.slice(0, 120)}` };

  const scoredAt = new Date();
  await db.identityScore.upsert({
    where: { shotId: shot.id },
    create: {
      projectId: ctx.project.id,
      shotId: shot.id,
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

  // replace prior identity events for this shot so the stream stays readable
  const tag = `[identity ${ctx.shotRef}]`;
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
      verdict,
      scoredAt: scoredAt.toISOString(),
    },
  };
}

/**
 * Batch score: panels with art + an anchored cast, worst EXISTING
 * scores first, then never-scored panels (art-freshness order).
 * Capped - every panel is a real vision call.
 */
export async function scoreProjectIdentity(projectId: string, limit = 4): Promise<{ scored: IdentityScoredShot[]; errors: Array<{ ref: string; error: string }> }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { characters: { include: { states: true } } },
  });
  if (!project) return { scored: [], errors: [] };

  const rows = await db.shot.findMany({
    where: { scene: { episode: { season: { projectId } } }, artworkUrl: { not: null } },
    include: {
      identityScore: true,
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
      const wa = a.identityScore?.worst ?? -1; // unscored first... no: scored-worst first
      const wb = b.identityScore?.worst ?? -1;
      if (wa === -1 && wb === -1) return 0;
      if (wa === -1) return 1; // unscored after known-bad
      if (wb === -1) return -1;
      return wa - wb; // lowest similarity first
    })
    .slice(0, Math.max(1, Math.min(8, Math.round(limit) || 4)));

  const scored: IdentityScoredShot[] = [];
  const errors: Array<{ ref: string; error: string }> = [];
  for (const row of candidates) {
    const res = await scoreShotIdentity(row.id);
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
  worst: number | null; // null = never scored
  castSize: number;
  note: string | null;
  scoredAt: string | null;
  entries: IdentityScoreEntry[];
}

export interface IdentityPanelData {
  rows: IdentityPanelRow[]; // scored rows, worst first
  queue: Array<{ shotId: string; ref: string; description: string; worst: number; entries: IdentityScoreEntry[] }>; // worst < threshold
  shots: Array<{ shotId: string; ref: string; description: string; hasArt: boolean }>; // score-now picker
  threshold: number;
  average: number | null;
}

/** Panel feed for the Continuity view's identity panel. */
export async function identityPanelData(projectId: string): Promise<IdentityPanelData> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { characters: { include: { states: true } } },
  });
  if (!project) return { rows: [], queue: [], shots: [], threshold: IDENTITY_REPAINT_THRESHOLD, average: null };

  const rows = await db.shot.findMany({
    where: { scene: { episode: { season: { projectId } } }, artworkUrl: { not: null } },
    include: {
      identityScore: true,
      scene: { include: { episode: { include: { season: { select: { number: true } } } } } },
    },
    orderBy: [{ artGeneratedAt: "desc" }],
    take: 60,
  });

  const hasAnchoredCast = (description: string) =>
    detectCast(project.characters, description).some((c) => c.modelSheetUrl);

  const panelRows: IdentityPanelRow[] = rows
    .filter((r) => r.identityScore && hasAnchoredCast(r.description))
    .map((r) => {
      let entries: IdentityScoreEntry[] = [];
      try {
        const parsed = JSON.parse(r.identityScore!.scores);
        if (Array.isArray(parsed)) entries = parsed as IdentityScoreEntry[];
      } catch {
        entries = [];
      }
      return {
        shotId: r.id,
        ref: `E${r.scene.episode.number} Sc${r.scene.number} S${String(r.number).padStart(3, "0")}`,
        description: r.description,
        artUrl: r.artworkUrl,
        worst: r.identityScore!.worst,
        castSize: r.identityScore!.castSize,
        note: r.identityScore!.note,
        scoredAt: r.identityScore!.scoredAt.toISOString(),
        entries,
      };
    })
    .sort((a, b) => (a.worst ?? 1) - (b.worst ?? 1));

  const queue = panelRows
    .filter((r) => (r.worst ?? 1) < IDENTITY_REPAINT_THRESHOLD)
    .map((r) => ({ shotId: r.shotId, ref: r.ref, description: r.description, worst: r.worst as number, entries: r.entries }));

  const shots = rows.slice(0, 30).map((r) => ({
    shotId: r.id,
    ref: `E${r.scene.episode.number} Sc${r.scene.number} S${String(r.number).padStart(3, "0")}`,
    description: r.description,
    hasArt: Boolean(r.artworkUrl),
  }));

  const worstValues = panelRows.map((r) => r.worst).filter((v): v is number => v !== null);
  const average = worstValues.length > 0 ? worstValues.reduce((a, b) => a + b, 0) / worstValues.length : null;

  return { rows: panelRows, queue, shots, threshold: IDENTITY_REPAINT_THRESHOLD, average };
}
