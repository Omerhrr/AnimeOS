import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { db } from "@/lib/db";
import { detectCast } from "@/lib/ai/art";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import { probeMedia, ffmpegPath } from "@/lib/bridge/motion";
import { robustAffinityBetween, embedPublicImage } from "@/lib/embedding";

// ─────────────────────────────────────────────────────────────
// IDENTITY-SIMILARITY SCORING FOR PANELS AND RENDERS
//
// The qualitative art checks (ART_DRIFT verdicts, universe-fact
// holds) answer "does this hold?"; identity scoring answers the
// casting-director question numerically: HOW CLOSE is the character
// in this panel (or in a frame of their finished render) to their
// canonical model sheet, per aspect?
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

export const IDENTITY_REPAINT_THRESHOLD = 0.6; // the PANEL bar - storyboard art drifts cheap, repaint it

// THE BAR IS MEASURED (iteration 78): a RENDER is not a storyboard.
// The shipping pixels - the frames the cut actually plays - answer to
// a higher line than the panel sketch they came from. The 0.7 bar is
// not a guess either: it was set from MEASURED render-source scores
// (scoreRenderIdentity over the painted pipeline's finished clips,
// vision-judged against the same model sheets the panels answer to -
// measure_identity_bar re-runs the measurement any time the studio
// asks). A worst below the render bar = drift warning on the SHIPPING
// pixels; the panel bar stays 0.6 because a loose sketch is a plan,
// not a promise.
export const IDENTITY_RENDER_THRESHOLD = 0.7;

/** The identity bar a score answers to, by what was judged. */
export function identityThresholdFor(source: IdentitySource): number {
  return source === "RENDER" ? IDENTITY_RENDER_THRESHOLD : IDENTITY_REPAINT_THRESHOLD;
}

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

// ── THE SHEET ANSWERS IN THE SHOT'S FRAMING (iteration 121) ─────
// A canonical model sheet is a full-body standing turnaround (five
// views stitched side by side); a shot is FRAMED. Judging a
// head-and-shoulders clip against only the full-body sheet made the
// judge score the FRAMING, not the character (S002's wardrobe 0% -
// "the framing shows head+shoulders"; the wides read their sheets as
// thin strips). The turnaround's five views already render to disk
// next to the stitched sheet, so the law attaches the view whose
// framing matches the shot's (the like-for-like reference) and the
// prompt states the framing contract: an aspect the framing cannot
// show is OMITTED, never scored low.
const FRAMING_SHEET_VIEW: Record<string, "close" | "three" | "front"> = {
  EXTREME_CLOSEUP: "close",
  CLOSEUP: "close",
  MCU: "close",
  MEDIUM: "three",
  LOW_ANGLE: "front",
  WIDE: "front",
  ESTABLISHING: "front",
  WS: "front",
};

/** The turnaround view whose framing matches the shot's framing. */
export function framingViewFor(shotType: string | null | undefined): "close" | "three" | "front" {
  return FRAMING_SHEET_VIEW[String(shotType ?? "MEDIUM").toUpperCase()] ?? "front";
}

/** The sibling per-view render next to the stitched sheet (only the
 * generated turnarounds carry views on disk - an uploaded sheet has
 * none and the stitched sheet alone rides).
 *
 * THE DESIGNED TURNAROUND ANSWERS FIRST (iteration 122): the render
 * pipeline constructs the character through the design crew's landed
 * build (designSheetUrl), so the like-for-like framing reference is
 * THAT turnaround's own view - the anchored image-gen sheet stays the
 * canonical art, but its flat full-frame never carries the views.
 * A cast member whose design never landed (or an uploaded sheet)
 * falls to the model-sheet check exactly as before. */
function framingViewUrl(c: { modelSheetUrl?: string | null; designSheetUrl?: string | null }, view: string): string | null {
  for (const url of [c.designSheetUrl, c.modelSheetUrl]) {
    if (url && /turn_sheet\.png$/.test(url)) return url.replace(/turn_sheet\.png$/, `turn_${view}.png`);
  }
  return null;
}

export interface IdentitySheet {
  name: string;
  data: string;
  framingRef?: { view: string; data: string };
}

/**
 * Guard + image loading shared by the real and raw paths: resolves
 * the sheeted cast and data-URLs the artifact under judgment (the
 * panel art by default, or a caller-supplied render poster) plus
 * every sheet - each sheet riding its framing-matched view when that
 * view exists on disk.
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
  const framingView = framingViewFor((shot as { shotType?: string | null }).shotType);
  const sheets = cast
    .map((c): IdentitySheet | null => {
      const data = publicImageAsDataUrl(c.modelSheetUrl as string);
      if (!data) return null;
      const viewUrl = framingViewUrl(c, framingView);
      const viewData = viewUrl ? publicImageAsDataUrl(viewUrl) : null;
      return { name: c.name, data, ...(viewData ? { framingRef: { view: framingView, data: viewData } } : {}) };
    })
    .filter((s): s is IdentitySheet => s !== null);
  if (sheets.length === 0) return { ok: false as const, error: "Model sheets are missing on disk" };
  const shotRef = `E${episode.number} Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;
  return { ok: true as const, episode, project, sheets, artData, shotRef, framingView };
}

/** THE SHEET ANSWERS IN THE SHOT'S FRAMING (iteration 121) - exported
 * for the e2e: the prompt is a law, its image manifest and framing
 * contract are asserted. */
export function buildIdentityPrompt(sheets: Array<{ name: string; framingRef?: { view: string } }>, filmstripFrames?: number, framingView?: string, faceStrip?: { members: string[]; frames: number }): string {
  let n = 2;
  const manifest = sheets
    .map((s) => {
      const sheet = `Image ${n}: canonical model sheet for ${s.name}`;
      n += 1;
      const ref = s.framingRef ? `; Image ${n}: ${s.name}'s ${s.framingRef.view} view from the same sheet (the like-for-like framing for this shot)` : "";
      n += s.framingRef ? 1 : 0;
      return sheet + ref;
    })
    .join(", ");
  // THE SCORE MATCHES THE POSE (iteration 81): a RENDER artifact is a
  // filmstrip of the clip - the model judges the pose-matched frame.
  const artifact = filmstripFrames && filmstripFrames > 1
    ? `Image 1 is a filmstrip of ${filmstripFrames} frames from the same finished shot, left to right in time order (each frame carries a burned-in corner label naming its position - trust the label). Judge the character's identity in the frame whose POSE most closely matches the canonical sheet's pose (a model sheet is a neutral standing turnaround); score THAT frame and name it in the note by its burned-in label ('frame <k> of ${filmstripFrames}').`
    : "Image 1 is a story panel.";
  // THE FRAMING CONTRACT (iteration 121): the judge scores the
  // character, never the framing - an aspect the framing cannot show
  // is omitted, not penalized.
  const framing = framingView
    ? `This shot is framed as a ${framingView}-scale view. The framing reference image(s) show each character at a comparable framing - prefer them for close comparisons. Judge each aspect ONLY on what this shot's framing reveals: a head-and-shoulders framing cannot show the full wardrobe and an establishing wide cannot show the face - omit an aspect the framing cannot show rather than scoring it low, and say 'framing hides <aspect>' in the note when you omit.`
    : "";
  // THE JUDGE SEES THE FACE (iteration 123): the face crop strip rides
  // beside the full frames - the face aspect scores on the crops first.
  const faceLaw = faceStrip
    ? `Image 2 is the FACE CROP strip for ${faceStrip.members.join(" and ")} (one row per character, one labeled cell per filmstrip frame, '<name> f<k>'): each crop pulls that character's face from the SAME frames you see in Image 1, upscaled to readable size. Score the FACE aspect from these crops FIRST - they resolve what the full frame's scale cannot (a face that reads featureless in a wide frame may read clearly in its crop). The full filmstrip owns hair, wardrobe, weapon, palette and style. If a crop still cannot resolve the face, say 'face unresolved at this framing' and fall back to the full frame honestly.`
    : "";
  return [
    "You are a casting director for an animation production checking character identity.",
    `${artifact} ${manifest}.`,
    framing,
    faceLaw,
    "For EACH named character, judge how closely the panel's depiction matches their canonical sheet and score similarity from 0 to 1, plus a score per aspect: face, hair, wardrobe, weapon, palette, style (0 to 1 each, only when the aspect is visible - omit aspects that cannot be judged).",
    "Reply with STRICT JSON only, no markdown fences:",
    '{"note": "one sentence about the panel", "characters": [{"name": "<sheet name>", "similarity": 0.0, "aspects": {"face": 0.0, "hair": 0.0}, "note": "what matches or drifted"}]}',
    "Judge only what is visible: a weapon kept off-frame is not a drift, a recolored blade is.",
  ].filter(Boolean).join("\n");
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
  // THE SCORE MATCHES THE POSE (iteration 81): the RENDER artifact is a
  // FILMSTRIP of the clip when it can be built (up to three frames,
  // temporal order) - the vision model judges the frame whose pose
  // matches the sheet's turnaround, not whatever the 40% mark parked
  // on. A strip that cannot be built degrades to the single poster and
  // the stored note names which artifact was judged.
  const strip = poster ? await extractRenderPosterFilmstrip(poster.clipAbs, poster.jobId) : null;
  const artData = strip ? strip.dataUrl : poster!.dataUrl;
  // THE JUDGE SEES THE FACE (iteration 123): the render's own face
  // boxes + the strip's own frames -> the labeled face-crop strip. A
  // job without boxes (an older render, a motion stand-in) degrades
  // to the full strip alone, honestly.
  const faceBoxes = poster && strip ? readRenderFaceBoxes(poster.jobId) : null;
  const faceStrip = poster && strip && faceBoxes ? await extractFaceCropStrip(poster.jobId, faceBoxes, strip.framePaths ?? []) : null;
  const poseNote: string | null = strip
    ? `pose-matched over ${strip.frames} frames${faceStrip ? " + face crops judged" : ""}`
    : poster ? "single frame (40% mark)" : null;
  const ctx = await prepareIdentityContext(shot, poster ? { imageData: artData, error: "" } : undefined);
  if (!ctx.ok) return ctx;

  const call = await rawIdentityCall(ctx, strip?.frames, faceStrip);
  if (!call.ok) return { ok: false, error: call.error };
  return persistIdentityVerdict(shot, ctx, call.raw, source, poseNote ?? undefined);
}

/**
 * THE VERDICT IS THE MEDIAN OF ITS SAMPLES (iteration 117).
 *
 * The night of iteration 116 caught the seam: the SAME pixels
 * re-scored an hour apart re-rolled -20/-25 per cell - one vision
 * call per shot lets one verdict's variance move the distribution
 * the publish gate reads. The law: the same artifact goes to the
 * vision channel N times, every parsable verdict is kept, and the
 * PERSISTED verdict is the per-entry MEDIAN (similarity and aspects;
 * each entry's note is the median-closest sample's note). One law,
 * same tail: the medianed verdict persists through the exact path a
 * single verdict would, so the gate, the events and the UI read the
 * same row shape - just a steadier truth.
 */
export async function scoreShotIdentityMedian(
  shotId: string,
  source: IdentitySource = "RENDER",
  samples = 3,
): Promise<{ ok: true; scored: IdentityScoredShot; sampleCount: number } | { ok: false; error: string }> {
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };
  const poster = source === "RENDER" ? await renderPosterForShot(shotId) : null;
  if (source === "RENDER" && poster === null) {
    return { ok: false, error: "This shot has no finished render to score yet - render it first" };
  }
  const strip = poster ? await extractRenderPosterFilmstrip(poster.clipAbs, poster.jobId) : null;
  const artData = strip ? strip.dataUrl : poster!.dataUrl;
  const faceBoxes = poster && strip ? readRenderFaceBoxes(poster.jobId) : null;
  const faceStrip = poster && strip && faceBoxes ? await extractFaceCropStrip(poster.jobId, faceBoxes, strip.framePaths ?? []) : null;
  const poseNote: string | null = strip
    ? `pose-matched over ${strip.frames} frames${faceStrip ? " + face crops judged" : ""}`
    : poster ? "single frame (40% mark)" : null;
  const ctx = await prepareIdentityContext(shot, poster ? { imageData: artData, error: "" } : undefined);
  if (!ctx.ok) return ctx;

  const names = ctx.sheets.map((s) => s.name);
  const n = Math.max(1, Math.min(7, Math.round(samples)));
  const verdicts: IdentityVerdict[] = [];
  let lastError = "";
  for (let i = 0; i < n; i++) {
    const call = await rawIdentityCall(ctx, strip?.frames, faceStrip);
    if (!call.ok) { lastError = call.error; continue; }
    const v = parseIdentityVerdict(call.raw, names);
    if (v) verdicts.push(v);
    else lastError = "unparsable verdict";
  }
  if (verdicts.length === 0) return { ok: false, error: lastError || "no sample returned a verdict" };

  // The median per entry, per aspect; the note rides the
  // median-closest sample (the entry's own words, not an average).
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const entries: IdentityScoreEntry[] = names.map((name) => {
    const rows = verdicts
      .map((v) => v.entries.find((e) => e.characterName === name))
      .filter((e): e is IdentityScoreEntry => !!e);
    if (rows.length === 0) {
      return { characterName: name, similarity: 0, aspects: {}, note: "not detected in the panel by the vision model" };
    }
    const sim = median(rows.map((r) => r.similarity));
    const aspects: Partial<Record<IdentityAspect, number>> = {};
    for (const aspect of IDENTITY_ASPECTS) {
      const vals = rows.map((r) => r.aspects[aspect]).filter((v): v is number => v !== undefined);
      if (vals.length > 0) aspects[aspect] = median(vals);
    }
    const noteRow = [...rows].sort((a, b) => Math.abs(a.similarity - sim) - Math.abs(b.similarity - sim))[0];
    return { characterName: name, similarity: sim, aspects, note: noteRow.note };
  });
  // Synthesize the canonical verdict body and persist it through the
  // SAME tail a single verdict rides - one row shape, steadier truth.
  // (worst recomputes inside the parse, min over the medianed entries.)
  const note = verdicts[verdicts.length - 1].note;
  const body = {
    note,
    characters: entries.map((e) => ({
      name: e.characterName,
      similarity: e.similarity,
      aspects: e.aspects,
      note: e.note,
    })),
  };
  const scored = await persistIdentityVerdict(shot, ctx, JSON.stringify(body), source, poseNote ?? undefined);
  if (!scored.ok) return scored;
  return { ...scored, sampleCount: verdicts.length };
}

/** One raw vision call over the prepared context - the single
 * variance source both the plain and the medianed score share. */
async function rawIdentityCall(
  ctx: Extract<Awaited<ReturnType<typeof prepareIdentityContext>>, { ok: true }>,
  frames: number | undefined,
  faceStrip?: { dataUrl: string; members: string[]; frames: number } | null,
): Promise<{ ok: true; raw: string } | { ok: false; error: string }> {
  try {
    const zai = await ZAI.create();
    const res = (await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildIdentityPrompt(ctx.sheets, frames, ctx.framingView, faceStrip ? { members: faceStrip.members, frames: faceStrip.frames } : undefined) },
            { type: "image_url", image_url: { url: ctx.artData } },
            // THE JUDGE SEES THE FACE (iteration 123): the face crop
            // strip rides right after the full frames
            ...(faceStrip ? [{ type: "image_url" as const, image_url: { url: faceStrip.dataUrl } }] : []),
            // each sheet rides its framing-matched view right after it
            // (THE SHEET ANSWERS IN THE SHOT'S FRAMING, iteration 121)
            ...ctx.sheets.flatMap((s) => [
              { type: "image_url" as const, image_url: { url: s.data } },
              ...(s.framingRef ? [{ type: "image_url" as const, image_url: { url: s.framingRef.data } }] : []),
            ]),
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    return { ok: true, raw: res.choices?.[0]?.message?.content ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "identity scoring failed" };
  }
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
  poseNote?: string, // THE SCORE MATCHES THE POSE: which artifact was judged
): Promise<{ ok: true; scored: IdentityScoredShot } | { ok: false; error: string }> {
  const verdict = parseIdentityVerdict(raw, ctx.sheets.map((s) => s.name));
  if (!verdict) return { ok: false, error: `vision model returned unparsable verdict: ${raw.slice(0, 120)}` };
  // the stored note names the artifact the model judged (pose-matched
  // filmstrip vs the single poster) before the model's own words
  const storedNote = poseNote ? `${poseNote}; ${verdict.note}`.slice(0, 400) : verdict.note;

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
      note: storedNote,
      scoredAt,
    },
    update: {
      scores: JSON.stringify(verdict.entries),
      worst: verdict.worst,
      castSize: verdict.entries.length,
      note: storedNote,
      scoredAt,
    },
  });

  // replace prior identity events for this shot + source so the stream stays readable
  const tag = `[identity ${ctx.shotRef} ${source}]`;
  await db.continuityEvent.deleteMany({
    where: { projectId: ctx.project.id, kind: { in: ["IDENTITY_VERIFIED", "IDENTITY_DRIFT"] }, description: { startsWith: tag } },
  });
  // the bar is the SOURCE's bar: the shipping pixels answer to 0.7,
  // the storyboard sketch keeps the 0.6 repaint line (THE BAR IS
  // MEASURED, iteration 78)
  const bar = identityThresholdFor(source);
  const drifted = verdict.worst < bar;
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
      description: `${tag} ${scoreLine} - worst ${(verdict.worst * 100).toFixed(0)}% vs the ${source === "RENDER" ? "70% shipping-pixel" : "60% panel"} bar${poseNote || verdict.note ? ` (${[poseNote, verdict.note].filter(Boolean).join("; ")})` : ""}`.slice(0, 900),
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
  clipAbs: string;
}

// ── THE SCORE MATCHES THE POSE (iteration 81, Frontier 1 deeper) ──
//
// A model sheet is a NEUTRAL TURNAROUND; a shot is a performance.
// Scoring one arbitrary frame (40% in) judges whatever pose the clip
// happened to park on - a mid-strike frame scored against a standing
// sheet measures the POSE, not the character, and the measured cast
// gap carried some of that noise. The re-score path now hands the
// vision model a FILMSTRIP of the clip (up to three frames, temporal
// order) and the pose-matching law: judge the frame whose pose most
// closely matches the sheet's canonical pose, and say which one.
// Pure law here, ffmpeg out there, honest degradation everywhere:
// a clip too short for a strip or a failed montage falls back to the
// single poster and the stored note says which artifact was judged.

export const POSE_FRAME_COUNT = 3;

// THE STRIP SAYS WHICH FRAME IT IS (iteration 120): a bold system font
// stamps each frame's label - the first candidate that exists on disk
// wins; none found degrades to unlabeled strips (honestly named once
// per process, never per frame).
const LABEL_FONTS = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
];
let labelFont: string | null | undefined;

function findLabelFont(): string | null {
  if (labelFont !== undefined) return labelFont;
  labelFont = LABEL_FONTS.find((f) => fs.existsSync(f)) ?? null;
  return labelFont;
}

/**
 * Stamp "frame k of N" (plus the sample's percent mark) into a
 * frame's top-left corner. The law this serves: the vision judges a
 * strip left to right and keeps miscounting its own frames ("frame 5
 * of 3") - a burned-in label is ground truth the model cannot
 * miscount. Returns the labeled path, or the input path when no font
 * or ffmpeg fails (the strip still builds - it just stays unlabeled).
 */
async function stampFrameLabel(framePath: string, text: string): Promise<string> {
  const font = findLabelFont();
  if (!font) return framePath;
  const ff = (ffmpegPath() as string | null) ?? "ffmpeg";
  const labeled = framePath.replace(/\.jpg$/, ".lbl.jpg");
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn(
      ff,
      [
        "-y", "-i", framePath,
        "-vf",
        `drawtext=fontfile=${font}:text='${text}':fontsize=40:fontcolor=white:borderw=4:bordercolor=black@0.85:box=0:x=18:y=18`,
        "-frames:v", "1", "-q:v", "3", labeled,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
  if (ok && fs.existsSync(labeled) && fs.statSync(labeled).size > 0) return labeled;
  return framePath;
}

/**
 * Pure: the filmstrip's sample timestamps. Clips long enough for a
 * strip sample at the 22% / 40% / 62% marks (fade-in past, tail
 * before); a clip too short for three distinct samples degrades to
 * ONE frame at the 40% mark. Deterministic - the same duration always
 * lands the same timestamps.
 */
export function poseSampleTimestamps(durationSec: number): number[] {
  const dur = Math.max(0.5, Number.isFinite(Number(durationSec)) ? Number(durationSec) : 0.5);
  if (dur < 1.2) return [Math.min(dur * 0.4, Math.max(0.1, dur - 0.1))];
  const raw = [0.22, 0.4, 0.62].map((f) => Math.min(dur - 0.1, Math.max(0.1, dur * f)));
  const out: number[] = [];
  for (const t of raw) {
    if (!out.some((x) => Math.abs(x - t) < 0.05)) out.push(Math.round(t * 100) / 100);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Extract up to POSE_FRAME_COUNT frames from the finished clip and
 * hstack them into ONE filmstrip JPEG (left to right in time order).
 * One frame degrades to that frame alone; a failed montage returns
 * null (the caller falls back to the single poster, honestly named).
 * The strip is cached per job id beside the poster.
 */
export async function extractRenderPosterFilmstrip(clipAbsPath: string, jobId: string): Promise<{ dataUrl: string; frames: number; framePaths?: string[] } | null> {
  // the same honest binary resolution the single poster uses (the
  // detect cache may be cold - PATH carries the fallback)
  const probe = await probeMedia(clipAbsPath).catch(() => null);
  const stamps = poseSampleTimestamps(probe?.durationSec ?? 0);
  if (stamps.length <= 1) return null;
  return buildFilmstripAt(clipAbsPath, jobId, stamps, "strip");
}

/**
 * THE INSPECTION SEES THE PERFORMANCE (iteration 119): build a
 * filmstrip at EXPLICIT timestamps. One frame degrades to that frame
 * alone (null - the caller falls back, honestly named); a failed
 * montage returns null. The strip is cached under
 * `<jobId>.<cacheName>.jpg` beside the poster.
 */
export async function buildFilmstripAt(clipAbsPath: string, jobId: string, stamps: number[], cacheName = "cues"): Promise<{ dataUrl: string; frames: number; labeled: boolean; framePaths: string[] } | null> {
  try {
    if (!fs.existsSync(clipAbsPath)) return null;
    if (!Array.isArray(stamps) || stamps.length < 2) return null;
    const ff = (ffmpegPath() as string | null) ?? "ffmpeg";
    const postersDir = path.join(process.cwd(), "public", "renders", "posters");
    fs.mkdirSync(postersDir, { recursive: true });
    const frames: string[] = [];
    let labeled = false;
    for (let i = 0; i < stamps.length; i++) {
      const f = path.join(postersDir, `${jobId}.${cacheName}${i}.jpg`);
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn(ff, ["-y", "-ss", stamps[i].toFixed(2), "-i", clipAbsPath, "-frames:v", "1", "-q:v", "3", f], {
          stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("close", (code) => resolve(code === 0));
        child.on("error", () => resolve(false));
      });
      if (ok && fs.existsSync(f) && fs.statSync(f).size > 0) frames.push(f);
      else return null; // a partial strip is a lie - degrade honestly
    }
    // THE STRIP SAYS WHICH FRAME IT IS (iteration 120): burn the
    // frame's index and sample mark into the corner before the
    // hstack - the vision layer reads ground truth, not its own count.
    const stampable = findLabelFont() !== null;
    const stripFrames: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const text = stampable ? `frame ${i + 1}/${frames.length} - ${stamps[i].toFixed(2)}s` : "";
      const use = stampable ? await stampFrameLabel(frames[i], text) : frames[i];
      if (use !== frames[i]) labeled = true;
      stripFrames.push(use);
    }
    const out = path.join(postersDir, `${jobId}.${cacheName}.jpg`);
    const inputs = stripFrames.flatMap((f) => ["-i", f]);
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(ff, ["-y", ...inputs, "-filter_complex", `hstack=inputs=${stripFrames.length}`, "-q:v", "3", out], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });
    if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) return null;
    const b64 = fs.readFileSync(out).toString("base64");
    return { dataUrl: `data:image/jpeg;base64,${b64}`, frames: frames.length, labeled, framePaths: frames };
  } catch {
    return null;
  }
}

/** THE JUDGE SEES THE FACE (iteration 123). The render evidence's own
 * face boxes (the bridge projects each cast head at the pose-sample
 * marks - deterministic world_to_camera_view, no detection) + the
 * frames the filmstrip already extracted -> one labeled crop strip:
 * one row per cast member, one cell per mark, each crop upscaled to a
 * readable height. The vision model finally sees the face at MEDIUM /
 * WIDE / ESTABLISHING where the full frame parks it at ~10-30px.
 * Degrades honestly to null (the caller rides the full strip alone).
 * Pure craft data over craft pixels - the AI is the eye, never the
 * hand. */
export interface RenderFaceBoxes {
  marks: number[];
  resX: number;
  resY: number;
  frames: Array<number | null>;
  cast: Array<{ name: string; boxes: Array<[number, number, number, number] | null> }>;
}

/**
 * Read the face boxes a render left in its job file (the job file IS
 * the state - the worker rewrites it in place, `render` rides at the
 * top level; the same file the tick and the staleness tools read,
 * iteration 105's law). Validates the shape; anything unexpected
 * degrades to null.
 */
export function readRenderFaceBoxes(jobId: string): RenderFaceBoxes | null {
  try {
    const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
    if (!fs.existsSync(p)) return null;
    const job = JSON.parse(fs.readFileSync(p, "utf-8")) as { render?: { faceBoxes?: unknown }; state?: { render?: { faceBoxes?: unknown } } };
    // the worker writes `render` at the top level; a `state` wrapper
    // (the e2e fixture shape) reads too - one reader, both shapes
    const fb = (((job.render ?? job.state?.render) ?? {}) as { faceBoxes?: RenderFaceBoxes }).faceBoxes;
    if (!fb || !Array.isArray(fb.marks) || fb.marks.length < 2) return null;
    if (!Array.isArray(fb.cast) || fb.cast.length === 0) return null;
    if (!Number.isFinite(fb.resX) || !Number.isFinite(fb.resY) || fb.resX < 8 || fb.resY < 8) return null;
    for (const c of fb.cast) {
      if (!c || typeof c.name !== "string" || !Array.isArray(c.boxes) || c.boxes.length !== fb.marks.length) return null;
      for (const b of c.boxes) {
        if (b === null) continue;
        if (!Array.isArray(b) || b.length !== 4 || b.some((v) => !Number.isFinite(v))) return null;
        if (b[2] <= b[0] || b[3] <= b[1]) return null;
      }
    }
    return fb;
  } catch {
    return null;
  }
}

/** Crop one (frame, box) cell to a readable height. */
function cropFaceCell(framePath: string, outPath: string, box: [number, number, number, number], resX: number, resY: number): Promise<boolean> {
  const ff = (ffmpegPath() as string | null) ?? "ffmpeg";
  const [x0, y0, x1, y1] = box;
  const w = Math.max(2, Math.min(resX - x0, x1 - x0));
  const h = Math.max(2, Math.min(resY - y0, y1 - y0));
  return new Promise<boolean>((resolve) => {
    const child = spawn(
      ff,
      ["-y", "-i", framePath, "-vf", `crop=${w}:${h}:${x0}:${y0},scale=-2:224`, "-frames:v", "1", "-q:v", "3", outPath],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

/**
 * Build the face-crop strip from the boxes + the filmstrip's own frame
 * files (the SAME frames the full strip judged - one truth, two
 * scales). Rows per cast member, cells per mark, labeled '<name> f<k>'.
 */
export async function extractFaceCropStrip(
  jobId: string,
  boxes: RenderFaceBoxes,
  framePaths: string[],
): Promise<{ dataUrl: string; members: string[]; frames: number } | null> {
  try {
    if (framePaths.length < 2 || boxes.cast.length === 0) return null;
    const ff = (ffmpegPath() as string | null) ?? "ffmpeg";
    const postersDir = path.join(process.cwd(), "public", "renders", "posters");
    fs.mkdirSync(postersDir, { recursive: true });
    const rows: Array<Array<string>> = [];
    const members: string[] = [];
    for (const c of boxes.cast) {
      const cells: string[] = [];
      for (let k = 0; k < c.boxes.length; k++) {
        const b = c.boxes[k];
        const src = framePaths[k];
        if (b === null || !src || !fs.existsSync(src)) continue;
        const cell = path.join(postersDir, `${jobId}.face-${members.length}-${k}.jpg`);
        if (!(await cropFaceCell(src, cell, b, boxes.resX, boxes.resY))) continue;
        if (!fs.existsSync(cell) || fs.statSync(cell).size === 0) continue;
        const labeled = await stampFrameLabel(cell, `${c.name} f${k + 1}`);
        cells.push(labeled);
      }
      if (cells.length > 0) {
        rows.push(cells);
        members.push(c.name);
      }
    }
    if (rows.length === 0) return null;
    // hstack each row, pad rows to the widest, vstack the rows
    const rowPaths: string[] = [];
    for (let r = 0; r < rows.length; r++) {
      const out = path.join(postersDir, `${jobId}.face-row${r}.jpg`);
      const inputs = rows[r].flatMap((f) => ["-i", f]);
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn(ff, ["-y", ...inputs, "-filter_complex", `hstack=inputs=${rows[r].length}`, "-q:v", "3", out], {
          stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("close", (code) => resolve(code === 0));
        child.on("error", () => resolve(false));
      });
      if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) return null;
      rowPaths.push(out);
    }
    const out = path.join(postersDir, `${jobId}.facestrip.jpg`);
    let ok: boolean;
    if (rowPaths.length === 1) {
      fs.copyFileSync(rowPaths[0], out);
      ok = fs.existsSync(out) && fs.statSync(out).size > 0;
    } else {
      // vstack requires equal widths: pad every row to the widest row's
      // width with black (no distortion - cells keep their aspect; a
      // row that lost a cell to an off-frame head just ends early).
      const widths = await Promise.all(rowPaths.map((p) => rowWidth(p)));
      const target = Math.max(...widths);
      if (target <= 0) return null;
      const inputs = rowPaths.flatMap((f) => ["-i", f]);
      const chains = rowPaths.map((_, i) => `[${i}:v]pad=${target}:224:0:0:black[r${i}]`).join(";");
      const stack = rowPaths.map((_, i) => `[r${i}]`).join("") + `vstack=inputs=${rowPaths.length}`;
      ok = await new Promise<boolean>((resolve) => {
        const child = spawn(ff, ["-y", ...inputs, "-filter_complex", `${chains};${stack}`, "-q:v", "3", out], {
          stdio: ["ignore", "ignore", "ignore"],
        });
        child.on("close", (code) => resolve(code === 0));
        child.on("error", () => resolve(false));
      });
    }
    if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) return null;
    const b64 = fs.readFileSync(out).toString("base64");
    return { dataUrl: `data:image/jpeg;base64,${b64}`, members, frames: Math.max(boxes.marks.length, 1) };
  } catch {
    return null;
  }
}

/** PNG/JPEG width probe via ffprobe (fallback: assume 672). */
async function rowWidth(p: string): Promise<number> {
  const ff = (ffmpegPath() as string | null) ?? "ffmpeg";
  return new Promise<number>((resolve) => {
    const child = spawn(ff, ["-hide_banner", "-i", p], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stderr.on("data", (d) => { out += String(d); });
    child.on("close", () => {
      const m = /(\d{2,5})x(\d{2,5})/.exec(out);
      resolve(m ? parseInt(m[1], 10) : 0);
    });
    child.on("error", () => resolve(0));
  });
}

export const CUE_FRAME_COUNT = 4;

/**
 * THE CUE TIMES ARE THE LAW (iteration 119): the inspector's sample
 * timestamps come from the shot's DIRECTED cues - the choreography's
 * key moments (the wind-up, the strike, the hold) and the grammar
 * beats' boundaries - normalized 0..1, clamped inside the clip,
 * deduped (nothing closer than 0.05s apart), capped at
 * CUE_FRAME_COUNT, and always time-ordered. Fewer than two distinct
 * cues degrades to the pose-sample marks (the 81 fallback). A cue at
 * the very tail is pulled 0.1s inside so a frame exists to pull.
 * Deterministic: the same duration and cues always land the same
 * stamps.
 */
export function cueSampleTimestamps(durationSec: number, cues: number[]): number[] {
  const dur = Math.max(0.5, Number.isFinite(Number(durationSec)) ? Number(durationSec) : 0.5);
  const clean = (Array.isArray(cues) ? cues : [])
    .map((c) => Number(c))
    .filter((c) => Number.isFinite(c) && c > 0 && c < 1)
    .sort((a, b) => a - b);
  if (clean.length < 2) return poseSampleTimestamps(dur);
  const picked: number[] = [];
  for (const c of clean) {
    if (picked.length >= CUE_FRAME_COUNT) break;
    const t = Math.min(dur - 0.1, Math.max(0.1, dur * c));
    if (!picked.some((x) => Math.abs(x - t) < 0.05)) picked.push(Math.round(t * 100) / 100);
  }
  return picked.sort((a, b) => a - b);
}

/** The latest finished clip for a shot, as a poster data URL (plus the
 * clip path so the pose-matched path can build its filmstrip). */
async function renderPosterForShot(shotId: string): Promise<RenderPoster | null> {
  const job = await db.renderJob.findFirst({
    where: { shotId, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!job?.outputUrl) return null;
  const clipAbs = path.join(process.cwd(), "public", job.outputUrl.split("?")[0].replace(/^\//, ""));
  const dataUrl = await extractRenderPoster(clipAbs, job.id);
  return dataUrl ? { dataUrl, jobId: job.id, clipAbs } : null;
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
  queue: Array<{ shotId: string; ref: string; description: string; source: IdentitySource; worst: number; entries: IdentityScoreEntry[] }>; // worst < the source's bar (panels 0.6, shipping renders 0.7)
  shots: Array<{ shotId: string; ref: string; description: string; hasArt: boolean }>; // score-now picker
  threshold: number; // the PANEL bar (0.6)
  renderThreshold: number; // the RENDER bar (0.7) - the shipping pixels answer higher
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
  if (!project) return { rows: [], queue: [], shots: [], threshold: IDENTITY_REPAINT_THRESHOLD, renderThreshold: IDENTITY_RENDER_THRESHOLD, average: null, embeddings: {}, drift };

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

  // the drift queue splits on the SOURCE's bar: a render frame that
  // would have passed the old 0.6 line is drift at the shipping bar
  const queue = panelRows
    .filter((r) => (r.worst ?? 1) < identityThresholdFor(r.source))
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

  return { rows: panelRows, queue, shots, threshold: IDENTITY_REPAINT_THRESHOLD, renderThreshold: IDENTITY_RENDER_THRESHOLD, average, embeddings: embeddingMap, drift };
}

// ─────────────────────────────────────────────────────────────
// THE BAR IS MEASURED (iteration 78)
//
// The render bar is not a vibe, it is a measurement. Every
// render-source identity score is one reading of what the painted
// pipeline actually ships; aggregated, the readings answer the bar
// question honestly: how many shipping frames cleared 0.7, where is
// the average, what is the worst, and what does that say about the
// next repaint pass. Pure rollup over the IdentityScore rows - the
// scores themselves are earned by real vision calls upstream.
// ─────────────────────────────────────────────────────────────

export interface IdentityBarMeasurement {
  source: "RENDER";
  bar: number; // the shipping-pixel bar the readings answer to
  scored: number; // measured renders
  average: number | null; // mean worst across the measured renders
  worst: number | null; // the pipeline's weakest shipping frame
  best: number | null;
  clearing: number; // renders at/above the bar
  below: number; // renders under the bar (the repaint queue)
  share: number | null; // clearing / scored (null when nothing measured)
  rows: Array<{ shotId: string; ref: string; worst: number; castSize: number; scoredAt: string }>;
}

/** Aggregate the production's REAL render-source identity scores
 * against the 0.7 shipping bar. The scores must exist first - run
 * scoreProjectIdentity(source RENDER) or measure_identity_bar to
 * earn them (one real vision call per render). */
export async function identityBarMeasurement(projectId: string): Promise<IdentityBarMeasurement> {
  const rows = await db.identityScore.findMany({
    where: { projectId, source: "RENDER" },
    orderBy: { worst: "asc" as const },
    include: { shot: { include: { scene: { include: { episode: { include: { season: { select: { number: true } } } } } } } } },
  });
  const readings = rows.map((r) => ({
    shotId: r.shotId,
    ref: `E${r.shot.scene.episode.number} Sc${r.shot.scene.number} S${String(r.shot.number).padStart(3, "0")}`,
    worst: r.worst,
    castSize: r.castSize,
    scoredAt: r.scoredAt.toISOString(),
  }));
  const values = readings.map((r) => r.worst);
  const clearing = values.filter((v) => v >= IDENTITY_RENDER_THRESHOLD).length;
  return {
    source: "RENDER",
    bar: IDENTITY_RENDER_THRESHOLD,
    scored: readings.length,
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    worst: values.length ? Math.min(...values) : null,
    best: values.length ? Math.max(...values) : null,
    clearing,
    below: values.length - clearing,
    share: values.length ? clearing / values.length : null,
    rows: readings,
  };
}

/** The measurement as one honest line (the DSH/pulse read). */
export function identityBarMeasurementLine(m: IdentityBarMeasurement): string {
  if (m.scored === 0) {
    return `render-source identity: nothing measured yet - the 70% shipping bar stands untested (run measure_identity_bar to score finished renders against it)`;
  }
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  return `render-source identity over ${m.scored} measured render(s): avg worst ${pct(m.average!)}, worst ${pct(m.worst!)}, best ${pct(m.best!)}, ${m.clearing} of ${m.scored} clear the ${pct(m.bar)} shipping bar (${pct(m.share!)}${m.below > 0 ? ` - ${m.below} in the repaint queue` : " - the pipeline holds the bar"})`;
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
  reanchoredAt: string | null; // latest IDENTITY_REANCHOR event for this character
  baseline: number; // points counted after the latest re-anchor (else all)
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
 * points ordered by episode/scene/shot. `reanchors` maps a character
 * name to the ISO timestamp of their latest IDENTITY_REANCHOR event:
 * the trend baseline RESTARTS there - points before the re-anchor
 * keep their history on the curve but no longer drag the delta, so
 * an old decline cannot poison the new sheet's baseline. Pure - the
 * E2E drives it.
 */
export function identityDriftFromRows(
  rows: Array<{ scores: string; episode: number; scene: number; shot: number; scoredAt: Date | string }>,
  reanchors: Record<string, string> = {},
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
    const reanchoredAt = reanchors[characterName] ?? null;
    const afterReanchor = reanchoredAt ? points.filter((p) => p.scoredAt > reanchoredAt) : points;
    const baselinePoints = reanchoredAt && afterReanchor.length >= 2 ? afterReanchor : points;
    const first = baselinePoints.length > 0 ? baselinePoints[0].score : null;
    const last = baselinePoints.length > 0 ? baselinePoints[baselinePoints.length - 1].score : null;
    const delta = first != null && last != null && baselinePoints.length >= 2 ? last - first : null;
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
      trend: driftTrend(delta, baselinePoints.length),
      worstAspect,
      panels: points.length,
      reanchoredAt,
      baseline: baselinePoints.length,
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
  const [rows, reanchorEvents] = await Promise.all([
    db.identityScore.findMany({
      // PANEL rows only: a shot scored from both its storyboard and its
      // render would double-count as two points on the same episode slot
      where: { projectId, source: "PANEL" },
      include: { shot: { include: { scene: { include: { episode: true } } } } },
      orderBy: { scoredAt: "asc" },
      take: 400,
    }),
    // the re-anchor markers: a regenerated canonical sheet restarts the
    // trend baseline so an old decline cannot poison the new sheet
    db.continuityEvent.findMany({
      where: { projectId, kind: "IDENTITY_REANCHOR", entityName: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const reanchors: Record<string, string> = {};
  for (const ev of reanchorEvents) {
    if (!reanchors[ev.entityName]) reanchors[ev.entityName] = ev.createdAt.toISOString();
  }
  const characters = identityDriftFromRows(
    rows.map((r) => ({
      scores: r.scores,
      episode: r.shot.scene.episode.number,
      scene: r.shot.scene.number,
      shot: r.shot.number,
      scoredAt: r.scoredAt,
    })),
    reanchors,
  );
  const watch = characters.filter((c) => c.trend === "DECLINING");
  const reanchored = characters.filter((c) => c.reanchoredAt);
  const headline = characters.length === 0
    ? "no identity drift curves yet - score a few panels"
    : watch.length > 0
      ? `${watch.length} of ${characters.length} curved character(s) DECLINING over episode order: ${watch.map((c) => `${c.characterName} ${(c.delta! * 100).toFixed(0)}%`).join(", ")} - reanchor_character regenerates a sheet and restarts its curve baseline`
      : reanchored.length > 0
        ? `${characters.length} character curve(s), none declining - ${reanchored.map((c) => c.characterName).join(", ")} re-anchored (baseline restarted)`
        : `${characters.length} character curve(s), none declining`;
  return { characters, watch, headline };
}

// ─────────────────────────────────────────────────────────────
// PROVIDER-FREE AFFINITY PASS (the embedding tripwire)
// ─────────────────────────────────────────────────────────────

export const AFFINITY_WATCH_THRESHOLD = 0.5; // heuristic tripwire line, NOT the identity bar

export interface AffinityEntry {
  characterName: string;
  palette: number; // cosine of the global 4x4x4 palette histograms
  structure: number; // bit agreement of the global 64-bit dHashes
  blockStructure: number; // mean per-block 16-bit agreement (composition-robust)
  blockPalette: number; // mean per-quadrant palette cosine (composition-robust)
  combined: number; // mean of the two ROBUST axes (block-dominant)
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

/** Parse stored affinity rows defensively (old rows read as zeros on the block axes). */
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
        blockStructure: Number(r.blockStructure ?? 0),
        blockPalette: Number(r.blockPalette ?? 0),
        combined: Number(r.combined ?? 0),
        note: String(r.note ?? ""),
      }));
  } catch {
    return [];
  }
}

/** Describe an affinity in one honest line. Pure. */
export function describeAffinity(entry: AffinityEntry): string {
  return `${entry.characterName} ${(entry.combined * 100).toFixed(0)}% affinity (block structure ${(entry.blockStructure * 100).toFixed(0)}%, global ${(entry.structure * 100).toFixed(0)}%, palette ${(entry.palette * 100).toFixed(0)}%)`;
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
    const aff = robustAffinityBetween(panelEmbed, sheetEmbed);
    entries.push({
      characterName: member.name,
      palette: aff.palette,
      structure: aff.structure,
      blockStructure: aff.blockStructure,
      blockPalette: aff.blockPalette,
      combined: aff.combined,
      note: aff.combined < AFFINITY_WATCH_THRESHOLD
        ? `far from the sheet on the robust axes (block structure ${(aff.blockStructure * 100).toFixed(0)}%) while global structure reads ${(aff.structure * 100).toFixed(0)}% - a reframe moves the global hash, a real drift moves the blocks too`
        : "block-robust tripwire only: the vision identity score stays the authority",
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
      meta: JSON.stringify({ blockHexes: panelEmbed.blockHexes }),
      computedAt,
    },
    update: {
      hashHex: panelEmbed.hashHex,
      rows: JSON.stringify(entries),
      worst,
      meta: JSON.stringify({ blockHexes: panelEmbed.blockHexes }),
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

// ─────────────────────────────────────────────────────────────
// THE CAST ANSWERS THE BAR (iteration 79)
//
// measure_identity_bar answers the PRODUCTION question ("how do the
// shipping pixels measure against the 70% bar?"); the casting
// director's question is per NAME: how does LIN YUE measure against
// HER sheet? Every IdentityScore row already carries per-character
// entries (each scored member's own similarity on that shot), so the
// cast standing is a rollup over the same real vision readings: one
// standing per member - CLEARING (every reading at/above the bar),
// BELOW (any reading under it - named with its worst shot ref, the
// re-render queue by name), UNTESTED (anchored, never measured), and
// UNANCHORED (no model sheet - nothing to answer to yet). Pure
// standing law + a loader, both exported for the E2E.
// ─────────────────────────────────────────────────────────────

export type CastStanding = "CLEARING" | "BELOW" | "UNTESTED" | "UNANCHORED";

/** One member's measured reading on one shot: their own entry
 * similarity plus the shot ref (the re-render target when low). */
export interface CastReading {
  worst: number; // the member's similarity on that shot
  ref: string; // e.g. "E7 Sc12 S002"
}

export interface CastMemberStanding {
  characterId: string;
  name: string;
  role: string | null;
  anchored: boolean; // has a model sheet to answer to
  readings: number;
  average: number | null;
  worst: number | null;
  best: number | null;
  clearing: number; // readings at/above the bar
  below: number; // readings under the bar
  worstRef: string | null; // the weakest reading's shot ref
  standing: CastStanding;
}

export interface CastIdentityMeasurement {
  source: IdentitySource;
  bar: number;
  members: CastMemberStanding[]; // work-ordered: BELOW first, then UNTESTED, UNANCHORED, CLEARING
  cast: number;
  anchored: number;
  measured: number; // anchored members with >= 1 reading
  clearing: number;
  below: number;
  untested: number;
  unanchored: number;
}

/**
 * The per-member standing law, pure: unanchored members cannot
 * answer; anchored members with no readings are untested; any
 * reading under the bar puts the member BELOW (the worst drives the
 * standing - one drifted shipping frame is a work order); otherwise
 * the member CLEARING. Pure - the E2E asserts it.
 */
export function castMemberStanding(input: {
  characterId: string;
  name: string;
  role: string | null;
  anchored: boolean;
  readings: CastReading[];
  bar: number;
}): CastMemberStanding {
  const { characterId, name, role, anchored, readings, bar } = input;
  const values = readings.map((r) => r.worst);
  const clearing = values.filter((v) => v >= bar).length;
  const below = values.length - clearing;
  let weakest: { worst: number; ref: string } | null = null;
  for (const r of readings) {
    if (!weakest || r.worst < weakest.worst) weakest = r;
  }
  const standing: CastStanding = !anchored
    ? "UNANCHORED"
    : readings.length === 0
      ? "UNTESTED"
      : below > 0
        ? "BELOW"
        : "CLEARING";
  return {
    characterId,
    name,
    role,
    anchored,
    readings: readings.length,
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    worst: values.length ? Math.min(...values) : null,
    best: values.length ? Math.max(...values) : null,
    clearing,
    below,
    worstRef: standing === "BELOW" && weakest ? weakest.ref : null,
    standing,
  };
}

function castStandingOrder(s: CastMemberStanding): number {
  return s.standing === "BELOW" ? 0 : s.standing === "UNTESTED" ? 1 : s.standing === "UNANCHORED" ? 2 : 3;
}

/**
 * Roll the production's REAL identity scores into per-member
 * standings against the source's bar (RENDER 0.7 by default - the
 * shipping bar the cast's renders answer to). The readings come from
 * the persisted per-character entries, so the cast standing measures
 * exactly what the vision model judged - no new calls here; run
 * scoreProjectIdentity / measure_identity_bar / cast_identity_pass
 * to earn readings first.
 */
export async function castIdentityMeasurement(projectId: string, source: IdentitySource = "RENDER"): Promise<CastIdentityMeasurement> {
  const [project, scoreRows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { characters: { select: { id: true, name: true, role: true, modelSheetUrl: true } } } }),
    db.identityScore.findMany({
      where: { projectId, source },
      include: { shot: { include: { scene: { include: { episode: { include: { season: { select: { number: true } } } } } } } } },
    }),
  ]);
  const bar = identityThresholdFor(source);
  const members = (project?.characters ?? []).map((c) => {
    const readings: CastReading[] = [];
    for (const row of scoreRows) {
      let entries: IdentityScoreEntry[] = [];
      try {
        const parsed = JSON.parse(row.scores);
        if (Array.isArray(parsed)) entries = parsed as IdentityScoreEntry[];
      } catch {
        entries = [];
      }
      const mine = entries.find((e) => e.characterName === c.name);
      if (mine) {
        readings.push({
          worst: mine.similarity,
          ref: `E${row.shot.scene.episode.number} Sc${row.shot.scene.number} S${String(row.shot.number).padStart(3, "0")}`,
        });
      }
    }
    return castMemberStanding({ characterId: c.id, name: c.name, role: c.role, anchored: Boolean(c.modelSheetUrl), readings, bar });
  }).sort((a, b) => castStandingOrder(a) - castStandingOrder(b) || (a.standing === "BELOW" ? (a.worst ?? 1) - (b.worst ?? 1) : a.name.localeCompare(b.name)));
  const anchored = members.filter((m) => m.anchored).length;
  const measured = members.filter((m) => m.readings > 0).length;
  return {
    source,
    bar,
    members,
    cast: members.length,
    anchored,
    measured,
    clearing: members.filter((m) => m.standing === "CLEARING").length,
    below: members.filter((m) => m.standing === "BELOW").length,
    untested: members.filter((m) => m.standing === "UNTESTED").length,
    unanchored: members.filter((m) => m.standing === "UNANCHORED").length,
  };
}

/** The cast standing as one honest line (the DSH/pulse read). */
export function castIdentityLine(m: CastIdentityMeasurement): string {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  if (m.cast === 0) return `cast identity (${m.source.toLowerCase()} source, bar ${pct(m.bar)}): no cast to answer - create the characters first`;
  const parts = m.members.map((mem) => {
    if (mem.standing === "UNANCHORED") return `${mem.name} - unanchored (no sheet to answer to - paint one with generate_model_sheet)`;
    if (mem.standing === "UNTESTED") return `${mem.name} - anchored, untested (score their renders first)`;
    const head = `${mem.name} - ${mem.readings} reading(s), avg ${pct(mem.average!)}, worst ${pct(mem.worst!)}`;
    if (mem.standing === "BELOW") return `${head} at ${mem.worstRef} - BELOW the bar, the re-render loop owns it`;
    return `${head} - CLEARS the ${pct(m.bar)} bar`;
  });
  const standing = `standing: ${m.anchored} anchored of ${m.cast}, ${m.measured} measured, ${m.clearing} clearing, ${m.below} below, ${m.untested} untested, ${m.unanchored} unanchored`;
  return `cast identity (${m.source.toLowerCase()} source, bar ${pct(m.bar)}): ${parts.join(" | ")}. ${standing}`;
}
