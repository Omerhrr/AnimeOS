// ─────────────────────────────────────────────────────────────
// THE AI-KEYFRAME RENDER SOURCE CLASS (iteration 216).
//
// Thirty Blender nights plateaued at 35-65 against the 70 floor and
// the director named the ceiling aloud ("poor sketch" - the same
// truth the 211 finding measured). The 213 probe validated the
// AI-art lever at the plateau cells (S002 90 / S005 85 where the
// Blender medians sat 55); the 214 arms (the dye law + the style
// pin) lifted the lost cell 30 -> 85; the 215 probes completed the
// board (85/90/75/85/85/85 - every cell above the floor) and named
// the strongest tool: THE SHEET-ANCHOR (the committed sheet PNGs as
// the edit channel's base images - words lose what the image
// carries; the judge flipped from "more angular than the canonical
// model" to "highly accurate to the model sheet").
//
// This module compiles those receipts into the production render
// source class:
//   • THE PROMPT LAW - the production's own anchors (style tokens,
//     cast looks, fact canon, the shot's own scene language) plus
//     the ARMS as binding clauses: the DYE clause (each member's
//     committed sheetDna hexes), the CONTRAST clause (two-plus
//     members: dyes must not mix), the WEAPON clause (the sheet is
//     the weapon's law; the shot's beat decides drawn or sheathed),
//     the STYLE PIN (one cel-donghua grammar per episode).
//   • THE ANCHOR - the featured members' committed sheet PNGs ride
//     the edit channel as base images (one member = one image, two
//     = the images array); no sheet, no anchor - the text law alone
//     (the probes' unanchored arm, kept honestly).
//   • THE INSTRUMENT - the SAME identity instrument (prepareIdentity-
//     Context's imageData override -> rawIdentityCall -> parse),
//     the SAME committed sheets, the SAME floor (0.7 - a keyframe is
//     candidate shipping pixels, not a plan). The render source may
//     change; the QC does not.
//   • THE NIGHT - runAiKeyframeNight generates, scores (the judge-
//     variance damped median, the 167 pacing), appends the arc rows
//     WITH THE SOURCE NAMED ("AI_KEYFRAME"), and reads the SAME
//     release gate (episodeReleaseVerdict) at the source's own bar.
//     The clone ghost rides out in-class: anchors come only from
//     sheeted, non-clone members, and the judge is asked only about
//     the sheeted cast (the production scorer's own filter).
// ─────────────────────────────────────────────────────────────

import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import {
  loadIdentityShot,
  prepareIdentityContext,
  rawIdentityCall,
  parseIdentityVerdict,
  IDENTITY_ASPECTS,
  framingViewFor,
  framingViewUrl,
  type IdentityAspect,
  type IdentityScoreEntry,
  type IdentityVerdict,
} from "@/lib/identity";
import {
  detectCast,
  castLook,
  productionStyleTokens,
  productionNegativeTokens,
  factCanonSection,
} from "@/lib/ai/art";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import {
  appendIdentityArcReading,
  bridgeLawCohort,
  defaultNightTag,
} from "@/lib/identity-arc";
import { episodeReleaseVerdict, type EpisodeReleaseRead } from "@/lib/identity-matrix";

/** The source name the arc rows ride (the ledger answers "what pixels?"). */
export const AI_KEYFRAME_SOURCE = "AI_KEYFRAME" as const;

/** The style pin: ONE grammar for the whole episode (the 214 arm, byte-exact). */
export const AI_KEYFRAME_STYLE_PIN =
  "Anime cel-shading style with clean lineart, exactly matching a donghua character model sheet's art style; flat color fields with soft gradient shading, sharp facial features, NO photorealism, NO 3d render look, NO western comic style";

const FRAMING_WORDS: Record<string, string> = {
  ESTABLISHING: "extreme long establishing shot, epic sense of scale",
  WIDE: "wide shot",
  MEDIUM: "medium shot, waist-up",
  CLOSEUP: "close-up on the face",
  LOW_ANGLE: "low angle hero shot",
};

function sizeFor(shotType: string | null): string {
  return shotType === "CLOSEUP" ? "1152x864" : "1344x768";
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The committed sheet DNA shape the dye clause reads (the measured hexes). */
export interface KeyframeSheetDna {
  hairStyle?: string;
  hairColor?: string;
  robeColor?: string;
  robeAccent?: string;
  bootsColor?: string;
  skinTone?: string;
  weaponType?: string;
}

/** THE DYE CLAUSE (the 129 law's keyframe edition, the 214 arm): the
 * sheet's own measured hexes ride as BINDING color law, stated after
 * the look tokens so the measured dyes override every style default. */
export function keyframeDyeClause(name: string, dna: KeyframeSheetDna | null): string | null {
  if (!dna?.robeColor) return null;
  const bits = [
    `${name}'s COLOR LAW (binding, overrides every default palette):`,
    `robe exactly ${dna.robeColor}`,
    dna.robeAccent ? `with ${dna.robeAccent} trim/accents` : null,
    dna.hairColor ? `hair exactly ${dna.hairColor}` : null,
    dna.hairStyle ? `in a ${dna.hairStyle}` : null,
    dna.bootsColor ? `boots ${dna.bootsColor}` : null,
    dna.skinTone ? `skin ${dna.skinTone}` : null,
    `do NOT change this character's garment color or silhouette`,
  ];
  return bits.filter(Boolean).join(" ");
}

/** THE CONTRAST CLAUSE (the 215 arm): in a multi-figure frame the
 * generator averages or swaps garment dyes; the clause names the split. */
export function keyframeContrastClause(clauses: string[]): string | null {
  if (clauses.length < 2) return null;
  return (
    "TWO SEPARATE CHARACTERS with DIFFERENT wardrobes in this frame - their garment colors MUST NOT mix, average, or swap: " +
    "one figure wears the deep teal-green robe, the OTHER figure wears the dark purple robe; " +
    "keep each character's dye exactly on their own body."
  );
}

const DRAW_BEAT_WORDS = /draw|glow|energy|coiling|sings|ignite|blaze|emission|blade lights/i;

/** THE WEAPON CLAUSE (the 215 arm): the sheet is the weapon's law; the
 * shot's own beat decides drawn or sheathed. A draw beat owns its
 * emission (S005's language carries it); any other shot binds the
 * steel DOWN (S001's receipt: the unprompted glow cost weapon 40). */
export function keyframeWeaponClause(name: string, dna: KeyframeSheetDna | null, shotDescription: string): string | null {
  if (!dna?.weaponType || dna.weaponType === "none") return null;
  if (DRAW_BEAT_WORDS.test(shotDescription)) return null; // the beat owns it
  return `${name}'s WEAPON LAW: the ${dna.weaponType} is SHEATHED at the hip in this shot, hilt visible, NO glow, NO energy emission - the blade only sings out in a shot whose own language draws it.`;
}

/** THE FRAMING CLAUSE (the 217 arm): the anchor's presentation pull is
 * REAL (the 216 receipts: S002 rendered a three-view TURNAROUND with
 * identity superb and the shot grammar lost; S003 delivered full-body
 * where a closeup was demanded). The clause names the film frame in
 * words. THE 217 RIDES: S002's turnaround BROKE (90, one figure, one
 * viewpoint, the temple scene restored). */
export const AI_KEYFRAME_FRAMING_CLAUSE =
  "FRAMING LAW (binding): this is ONE film frame from the animated episode - a SINGLE composition, ONE viewpoint, the shot's own framing, ONE moment of the scene. " +
  "NOT a character model sheet, NOT a turnaround, NO multi-view grid, NO duplicated copies of the same character, NO side-by-side pose studies, NO neutral studio backdrop, no text labels. " +
  "The figure stands IN the scene's own environment, under the scene's own light, caught mid-moment.";

/** The CLOSE rung (the 121 law's own view letter - the framings whose
 * sheet reference is the close view). */
const CLOSE_RUNG_TYPES = new Set(["EXTREME_CLOSEUP", "CLOSEUP", "MCU"]);

export function isCloseRung(shotType: string | null | undefined): boolean {
  return CLOSE_RUNG_TYPES.has(String(shotType ?? "").toUpperCase());
}

/** THE CLOSE-FACE CLAUSE (the 217 arm): at close granularity the face
 * drifts photoreal and invents accessories (the 217 receipts: face
 * 0.2-0.5, a headband and facial paint invented, hair let down; the
 * clause rode the face to 0.85 / hair 0.95). Member-generic - the
 * reference view's own grammar, no per-character words. */
export function keyframeCloseFaceClause(shotType: string | null | undefined): string | null {
  if (!isCloseRung(shotType)) return null;
  return (
    "CLOSE-FACE LAW (binding): the face is PAINTED CEL-ANIMATION ART - flat color fields, clean ink lineart, sharp stylized 2D facial features on the close-view reference's own proportions. " +
    "NOT a realistic human face, NOT a 3D render, NO photoreal skin texture, no invented accessories (no headband, no facial markings or paint), and the hairstyle is EXACTLY the close-view reference's own."
  );
}

/** What the prompt builder needs from one cast member (sheeted, non-clone). */
interface AnchorMember {
  name: string;
  look: string | null;
  dna: KeyframeSheetDna | null;
  sheetUrl: string | null;
  designSheetUrl: string | null; // the designed turnaround (the 122 law) - the anchor-view's own source
}

export interface KeyframePromptBuild {
  prompt: string;
  members: AnchorMember[]; // the sheeted, non-clone cast (the anchors)
  featured: string[]; // the judge's names (the sheeted cast)
}

/**
 * THE KEYFRAME PROMPT LAW - one function, every clause the receipts
 * earned, composed from the production's own anchors (the same
 * exported helpers the panel channel rides). Pure - the e2e asserts
 * the clauses on the real production shot without a model call.
 */
export async function buildKeyframePrompt(shotId: string): Promise<
  | { ok: true; build: KeyframePromptBuild; shot: NonNullable<Awaited<ReturnType<typeof loadIdentityShot>>> }
  | { ok: false; error: string }
> {
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };
  const scene = shot.scene;
  const episode = scene.episode;
  const project = episode.season.project;

  const universeFacts = await db.universeFact.findMany({
    where: { projectId: project.id, active: true },
  });

  // THE SHEETED, NON-CLONE CAST: the anchors (the 140 law honored
  // in-class - a clone carries no sheet, and the anchor rides sheets).
  const cast = detectCast(project.characters, shot.description).filter((c) => c.modelSheetUrl);
  if (cast.length === 0) {
    return { ok: false, error: "No featured character with a model sheet - the anchor is what identity is scored against" };
  }
  const members: AnchorMember[] = cast.map((c) => ({
    name: c.name,
    look: castLook(c, episode.number),
    dna: c.sheetDna ? (JSON.parse(c.sheetDna) as KeyframeSheetDna) : null,
    sheetUrl: c.modelSheetUrl ?? null,
    designSheetUrl: c.designSheetUrl ?? null,
  }));

  const styleTokens = productionStyleTokens(project);
  const negativeTail = productionNegativeTokens(project);
  const factCanon = factCanonSection(universeFacts, null);

  const castLooks = members
    .map((m) => (m.look ? `${m.name} (match established character design exactly): ${m.look}` : null))
    .filter(Boolean)
    .join("\n");
  const dyeList = members
    .map((m) => keyframeDyeClause(m.name, m.dna))
    .filter(Boolean) as string[];

  const armParts = [
    `Cinematic keyframe still from a high-budget Chinese donghua (xianxia) animated series, film-grade lighting, rich detail. ${AI_KEYFRAME_STYLE_PIN}`,
    styleTokens,
    FRAMING_WORDS[String(shot.shotType ?? "MEDIUM").toUpperCase()] ?? "medium shot",
    shot.description,
    scene.environment ? `Setting: ${scene.environment.name}${scene.environment.description ? ` - ${scene.environment.description}` : ""}` : null,
    scene.timeOfDay ? `${scene.timeOfDay.toLowerCase()} lighting` : null,
    scene.weather ? `${scene.weather.toLowerCase()} weather` : null,
    shot.lighting ? `Lighting: ${shot.lighting}` : null,
    castLooks ? `Characters:\n${castLooks}` : null,
    dyeList.length ? `GARMENT DYES:\n${dyeList.join("\n")}` : null,
    keyframeContrastClause(dyeList),
    members.map((m) => keyframeWeaponClause(m.name, m.dna, shot.description ?? "")).filter(Boolean).join(" "),
    AI_KEYFRAME_FRAMING_CLAUSE, // the 217 arm: the film-frame law in words (the presentation pull named with receipts)
    keyframeCloseFaceClause(shot.shotType), // the 217 arm: the CLOSE rung's own face law (null off the rung)
    factCanon,
    "dramatic composition, atmospheric depth, high quality, detailed",
    negativeTail,
    members.length > 0
      ? `Render the character(s) from the attached model sheet(s) EXACTLY as designed - same face, same facial proportions, same hairstyle, same outfit, same colors - placed into this keyframe scene.`
      : null,
  ];
  return {
    ok: true,
    build: { prompt: armParts.filter(Boolean).join(". "), members, featured: members.map((m) => m.name) },
    shot,
  };
}

/** One generated keyframe: the pixels plus the recipe that made them. */
export interface KeyframeRecipe {
  ref: string;
  mode: "anchored" | "unanchored";
  anchoredSheets: string[]; // the member names whose sheets rode the edit channel
  anchorViews?: string[]; // the 217 anchor-view law: the CLOSE rung's framing views that rode ("Name:close")
  prompt: string;
  generatedAt: string;
  pngPath?: string; // where the SCORED pixels landed (the eye's receipt, the night's own artifact)
}

export type GeneratedKeyframe =
  | { ok: true; dataUrl: string; recipe: KeyframeRecipe }
  | { ok: false; error: string };

/**
 * THE ANCHORED GENERATION: the featured members' committed sheet PNGs
 * ride the edit channel as base images (the 215 anchor arm - the face
 * proportions and grammar ride the IMAGE); at the CLOSE rung the 217
 * ANCHOR-VIEW LAW adds the member's framing-matched close view as a
 * SECOND anchor image (the stitched sheet stays the wardrobe/dye
 * carrier, the view is the face carrier - the images array's own
 * proven shape); a shot whose cast has no readable sheet file falls
 * back to the text law alone (the honest unanchored mode). Read-only
 * on production.
 */
export async function generateKeyframeForShot(shotId: string): Promise<GeneratedKeyframe> {
  const built = await buildKeyframePrompt(shotId);
  if (!built.ok) return { ok: false, error: built.error };
  const { build, shot } = built;
  const ref = `E${shot.scene.episode.number} Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;

  // THE ANCHOR IMAGES: one sheet file per member, read-only, from the
  // sheeted cast (the clone ghost rides out - no sheet, no anchor).
  // THE ANCHOR-VIEW LAW (the 217 arm): at the CLOSE rung the member's
  // framing view (the 121 convention, design turnaround first) rides
  // as an ADDITIONAL image; no view file on disk, no view - the sheet
  // alone stands (the honest fallback).
  const closeRung = isCloseRung(shot.shotType);
  const viewName = framingViewFor(shot.shotType); // "close" on the rung
  const images: Array<{ url: string }> = [];
  const anchoredSheets: string[] = [];
  const anchorViews: string[] = [];
  for (const m of build.members) {
    if (!m.sheetUrl) continue;
    const dataUrl = publicImageAsDataUrl(m.sheetUrl);
    if (!dataUrl) continue; // a missing file never breaks the shot - the text law stands
    images.push({ url: dataUrl });
    anchoredSheets.push(m.name);
    if (closeRung) {
      const viewUrl = framingViewUrl({ designSheetUrl: m.designSheetUrl, modelSheetUrl: m.sheetUrl }, viewName);
      const viewData = viewUrl ? publicImageAsDataUrl(viewUrl) : null;
      if (viewData) {
        images.push({ url: viewData });
        anchorViews.push(`${m.name}:${viewName}`);
      }
    }
  }

  const zai = await ZAI.create();
  const size = sizeFor(shot.shotType) as never;
  let base64: string | null = null;
  if (images.length > 0) {
    // THE ANCHOR CHANNEL: the runtime accepts the images ARRAY (the 215
    // anchor pass rode it - S006's two-sheet anchor read both members);
    // the published dts narrows the body to one image. The array is the
    // receipt's own shape - the call keeps it, the cast is documented.
    const res = (await zai.images.generations.edit({
      prompt: build.prompt,
      images,
      size,
    } as never)) as { data?: Array<{ base64?: string }> };
    base64 = res.data?.[0]?.base64 ?? null;
  } else {
    const res = (await zai.images.generations.create({
      prompt: build.prompt,
      size,
    })) as { data?: Array<{ base64?: string }> };
    base64 = res.data?.[0]?.base64 ?? null;
  }
  if (!base64) return { ok: false, error: `${ref}: the image channel returned no pixels` };
  return {
    ok: true,
    dataUrl: `data:image/png;base64,${base64}`,
    recipe: {
      ref,
      mode: images.length > 0 ? "anchored" : "unanchored",
      anchoredSheets,
      ...(anchorViews.length > 0 ? { anchorViews } : {}),
      prompt: build.prompt,
      generatedAt: new Date().toISOString(),
    },
  };
}

export type AiKeyframeScore =
  | {
      ok: true;
      ref: string;
      shotId: string;
      verdict: IdentityVerdict; // the damped median verdict
      sampleCount: number;
      recipe: KeyframeRecipe;
    }
  | { ok: false; error: string };

/**
 * THE KEYFRAME SCORING PASS - generate ONE keyframe, read it N times
 * through the SAME identity instrument (the judge-variance damping,
 * the 141 band's answer), the median per entry per aspect, the note
 * riding the median-closest sample (the same merge law the render
 * instrument obeys, scoreShotIdentityMedian). Read-only on production
 * - the arc append is the night's own write, never this pass's.
 */
export async function scoreAiKeyframeForShot(
  shotId: string,
  samples = 3,
  opts?: { outDir?: string },
): Promise<AiKeyframeScore> {
  const gen = await generateKeyframeForShot(shotId);
  if (!gen.ok) return gen;
  // THE PIXELS LAND: a render source's receipts are pixels, not just
  // numbers - when the caller names a directory the SCORED keyframe
  // writes there (the eye reads what the judge read, byte-exact).
  if (opts?.outDir) {
    try {
      fs.mkdirSync(opts.outDir, { recursive: true });
      const pngPath = path.join(opts.outDir, `${gen.recipe.ref.replace(/\s+/g, "")}-keyframe.png`);
      fs.writeFileSync(pngPath, Buffer.from(gen.dataUrl.split(",")[1] ?? "", "base64"));
      gen.recipe.pngPath = pngPath;
    } catch {
      // a failed write never breaks the scoring - the pixels stay in the verdict
    }
  }
  const shot = await loadIdentityShot(shotId);
  if (!shot) return { ok: false, error: "Shot not found" };

  const ctx = await prepareIdentityContext(shot, { imageData: gen.dataUrl, error: "" });
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const names = ctx.sheets.map((s) => s.name); // the sheeted cast - the clone ghost rides out

  const n = Math.max(1, Math.min(7, Math.round(samples)));
  const verdicts: IdentityVerdict[] = [];
  let lastError = "";
  // THE 167 PACING: the reads spaced so the provider's window breathes.
  for (let i = 0; i < n; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 5_000));
    const call = await rawIdentityCall(ctx, undefined);
    if (!call.ok) { lastError = call.error; continue; }
    const v = parseIdentityVerdict(call.raw, names);
    if (v) verdicts.push(v);
    else lastError = "unparsable verdict";
  }
  if (verdicts.length === 0) return { ok: false, error: lastError || "no sample returned a verdict" };

  // The median per entry, per aspect; the note rides the
  // median-closest sample (the entry's own words, not an average).
  const entries: IdentityScoreEntry[] = names.map((name) => {
    const rows = verdicts
      .map((v) => v.entries.find((e) => e.characterName === name))
      .filter((e): e is IdentityScoreEntry => !!e);
    if (rows.length === 0) {
      return { characterName: name, similarity: 0, aspects: {}, note: "not detected in the keyframe by the vision model" };
    }
    const sim = medianOf(rows.map((r) => r.similarity));
    const aspects: Partial<Record<IdentityAspect, number>> = {};
    for (const aspect of IDENTITY_ASPECTS) {
      const vals = rows.map((r) => r.aspects[aspect]).filter((v): v is number => v !== undefined);
      if (vals.length > 0) aspects[aspect] = medianOf(vals);
    }
    const noteRow = [...rows].sort((a, b) => Math.abs(a.similarity - sim) - Math.abs(b.similarity - sim))[0];
    return { characterName: name, similarity: sim, aspects, note: noteRow.note };
  });
  const worst = Math.min(...entries.map((e) => e.similarity));
  const ref = gen.recipe.ref;
  return {
    ok: true,
    ref,
    shotId,
    sampleCount: verdicts.length,
    recipe: gen.recipe,
    verdict: { entries, worst, note: verdicts[verdicts.length - 1].note },
  };
}

export interface AiKeyframeNightShotResult {
  ref: string;
  shotId: string;
  ok: boolean;
  error?: string;
  worst?: number; // 0..1, the damped median worst
  entries?: IdentityScoreEntry[];
  mode?: KeyframeRecipe["mode"];
  anchoredSheets?: string[];
  anchorViews?: string[]; // the 217 anchor-view law's own receipt
  sampleCount?: number;
  pngPath?: string; // the scored pixels' receipt (the eye's read rides these)
}

export interface AiKeyframeNightReport {
  night: string;
  cohort: string;
  source: typeof AI_KEYFRAME_SOURCE;
  results: AiKeyframeNightShotResult[];
  appended: number;
  gate: EpisodeReleaseRead | null;
  gateError?: string;
}

/**
 * THE AI-KEYFRAME NIGHT - the render source class's own night pass.
 * One keyframe per shot, the damped instrument reads it, the arc row
 * APPENDS WITH THE SOURCE NAMED ("AI_KEYFRAME"), and the SAME release
 * gate reads the source's own board at the source's own bar. The
 * receipt path rides the options (the production default is the
 * committed durable ledger; the e2e's lab scopes redirect).
 */
export async function runAiKeyframeNight(
  projectId: string,
  episodeId: string,
  opts?: { night?: string; samples?: number; receiptPath?: string | null; outDir?: string },
): Promise<AiKeyframeNightReport> {
  const night = opts?.night ?? defaultNightTag();
  const cohort = bridgeLawCohort();
  const shots = await db.shot.findMany({
    where: { scene: { episodeId } },
    orderBy: { number: "asc" },
    include: { scene: { select: { number: true } } }, // the honest ref on a failed shot
  });

  const results: AiKeyframeNightShotResult[] = [];
  let appended = 0;
  const outDir = opts?.outDir;
  for (const shot of shots) {
    const ref = `E? Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;
    const scored = await scoreAiKeyframeForShot(shot.id, opts?.samples ?? 3, outDir ? { outDir } : undefined);
    if (!scored.ok) {
      results.push({ ref, shotId: shot.id, ok: false, error: scored.error });
      continue;
    }
    await appendIdentityArcReading(
      {
        projectId,
        shotId: shot.id,
        source: AI_KEYFRAME_SOURCE,
        night,
        cohort,
        worst: scored.verdict.worst,
        scores: scored.verdict.entries,
      },
      opts?.receiptPath !== undefined ? { receiptPath: opts.receiptPath } : undefined,
    );
    appended += 1;
    results.push({
      ref: scored.ref,
      shotId: shot.id,
      ok: true,
      worst: scored.verdict.worst,
      entries: scored.verdict.entries,
      mode: scored.recipe.mode,
      anchoredSheets: scored.recipe.anchoredSheets,
      anchorViews: scored.recipe.anchorViews,
      sampleCount: scored.sampleCount,
      pngPath: scored.recipe.pngPath,
    });
    // THE NIGHT PACING: one breath between shots (the 429 receipt).
    await new Promise((r) => setTimeout(r, 10_000));
  }

  let gate: EpisodeReleaseRead | null = null;
  let gateError: string | undefined;
  try {
    gate = await episodeReleaseVerdict(projectId, episodeId, AI_KEYFRAME_SOURCE, {
      receiptPath: opts?.receiptPath,
    });
  } catch (e) {
    gateError = e instanceof Error ? e.message : String(e);
  }
  return { night, cohort, source: AI_KEYFRAME_SOURCE, results, appended, gate, gateError };
}
