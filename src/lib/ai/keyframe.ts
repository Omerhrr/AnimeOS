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
  defaultNightTag,
} from "@/lib/identity-arc";
import { episodeReleaseVerdict, identityLightingBucket, type EpisodeReleaseRead } from "@/lib/identity-matrix";

/** The source name the arc rows ride (the ledger answers "what pixels?"). */
export const AI_KEYFRAME_SOURCE = "AI_KEYFRAME" as const;

/**
 * THE KEYFRAME LAW'S OWN VERSION (iteration 218). v1 = the 216/217 law
 * (five arms, sheets + views, single-take nights) - its rows rode the
 * bridge cohort because the class had no version of its own (the seam
 * 218 fixes). v2 = the 218 law: the shadow-dye clause, the artifact
 * clause, the close-face clause's ONE-medium rewrite (the sheet's own
 * simple stylized toon - the M2 evidence: style 10 -> 90), and the
 * TAKE LAW (best-of-N shipped pixels). v3 = the 219 law: the TAKE
 * LAW's selection carries the FIGURE-COUNT GUARD (the probe219-
 * countpass instrument - 6/6 agreement with the eye's labeled
 * receipts - riding the shipment: a take whose counted figures miss
 * the cast's expected count is an echo draw, demoted whatever its
 * identity score; the 219A gallery receipt scored 92 carrying three
 * figures where two are staged). The cohort law applied to the
 * source's own truth: the pixels' law is THIS module's law, so the
 * AI_KEYFRAME arc rows ride THIS version - a law bump opens a new
 * cohort and the old law's readings never pollute the new law's
 * verdict (the 142 law's own letter, now carried by the source).
 * The v1 nights stay on the committed receipt under their bridge
 * cohort - the ledger answers for every law.
 */
export const AI_KEYFRAME_LAW_VERSION = 3;

/** The cohort tag the AI_KEYFRAME arc rows ride (the gate scopes the
 *  newest cohort - the 141 band cannot cross a law boundary). */
export function aiKeyframeCohort(): string {
  return `kf-v${AI_KEYFRAME_LAW_VERSION}`;
}

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

/**
 * THE ARTIFACT CLAUSE (the 218 arm): the eye's named artifacts across
 * the nights - twin moons (S001 + S003), the sparkle vortex (S003),
 * the sheathed blade's glow (S001 + S003 + S002's 92 ride). The
 * scene-prop law in words. Its single probe ride was confounded (the
 * draw missed the subject entirely - the subject-miss mode named in
 * the receipts); the clause rides EVERY cell and the nights measure it.
 */
export const AI_KEYFRAME_ARTIFACT_CLAUSE =
  "SCENE ARTIFACT LAW (binding): render ONLY the scene's own props and named light sources - NO second moon or duplicated celestial body, NO floating sparkle particles or swirling light-particle vortex, NO lens-flare clusters, NO invented glowing runes or energy effects the scene does not name. " +
  "A blade the shot's own language does not draw stays dark steel.";

/** The CLOSE rung (the 121 law's own view letter - the framings whose
 * sheet reference is the close view). */
const CLOSE_RUNG_TYPES = new Set(["EXTREME_CLOSEUP", "CLOSEUP", "MCU"]);

export function isCloseRung(shotType: string | null | undefined): boolean {
  return CLOSE_RUNG_TYPES.has(String(shotType ?? "").toUpperCase());
}

/**
 * THE CLOSE-FACE CLAUSE (v2, the 218 rewrite - ONE medium target).
 * v1's words aimed at 2D cel art while identity's target is the
 * SHEET - and the sheet IS a simple 3D toon (the 211 finding's own
 * words). Two fighting mediums pulled the draws apart (the M1 ride:
 * chibi drift, 50); ONE target - the sheet's own simple stylized
 * toon - lifted the style aspect 10 -> 90 (the M2 evidence, the
 * close campaign's biggest single-aspect lift). The anti-invention
 * words keep their earned place (the 217 receipts: a headband and
 * facial paint invented, hair let down). Member-generic.
 */
export function keyframeCloseFaceClause(shotType: string | null | undefined): string | null {
  if (!isCloseRung(shotType)) return null;
  return (
    "CLOSE-FACE LAW (binding): the face is rendered in the model sheet's OWN simple stylized toon style - the same simple flat-shaded, clean-lined rendering as the sheet reference, at the sheet's own level of detail. " +
    "NOT a cinematic realistic face, NOT a photoreal human, NO high-detail game-cinematic 3D render, no invented accessories (no headband, no facial markings or paint), and the hairstyle is EXACTLY the close-view reference's own."
  );
}

/** The DIM families the shadow-dye law rides (the lighting bucket's
 *  own words: the families whose light dims the scene - the failure
 *  mode was SEEN in the shadow bucket, and night/dusk dim by the
 *  same words' mechanism). */
const DIM_LIGHT_FAMILIES = new Set(["shadow", "night", "dusk"]);

/**
 * THE SHADOW-DYE CLAUSE (the 218 arm): under the dim-light words the
 * generator RE-HUES what the dye law bound (S002's receipt: the
 * night-lighting words pulled Lin's deep teal-green to indigo -
 * palette 20 honest). The clause restates the committed hexes UNDER
 * the lighting's failure mode: dim light SHADES the garments, it
 * never recolors them. The 218 evidence: S002 92 with palette 95
 * (the swap draw's palette 20) - the named fix owned its seam.
 * Rides the dim families through the gate's OWN bucket function
 * (identityLightingBucket - ONE convention both sides ride, the
 * framingViewUrl lesson).
 */
export function keyframeShadowDyeClause(
  members: Array<{ name: string; dna: KeyframeSheetDna | null }>,
  lighting: string | null | undefined,
): string | null {
  if (!DIM_LIGHT_FAMILIES.has(identityLightingBucket(lighting))) return null;
  const named = members
    .map((m) => (m.dna?.robeColor ? `${m.name}'s robe stays exactly ${m.dna.robeColor}` : null))
    .filter(Boolean) as string[];
  if (named.length === 0) return null;
  return (
    "SHADOW-DYE LAW (binding): this scene's light is dim - dim light SHADES the garments, it never RECOLORS them. " +
    named.join(", ") +
    " under this lighting, the shadows and backlight falling OVER the fabric. " +
    "NOT an indigo, blue, or violet-shifted 'moonlit' variant; no hue swap, no color grade that replaces the committed dye."
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
    AI_KEYFRAME_ARTIFACT_CLAUSE, // the 218 arm: the scene-prop law (the eye's named artifacts)
    keyframeShadowDyeClause(members, shot.lighting), // the 218 arm: the dim families' dye law (null off the bucket)
    keyframeCloseFaceClause(shot.shotType), // the 217 arm, v2 (218): ONE medium target - the sheet's own toon
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
  // THE 164 LADDER ON THE PIXELS CALL (the 219 receipt's own seam):
  // the identity calls carry the bounded 429 backoff and the pixels
  // call never did - the 216 night's "pixels-transient seam" was
  // healed by whole-chunk re-rides, and the 219 night paid three
  // 429s in a row on THIS call. Same discipline, same ladder: two
  // bounded retries (20s, then 45s) on the rate limit, the same
  // call each time, no other change; the final failure returns
  // honestly (the re-ride discipline stays the deep window's answer).
  let base64: string | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 3 && base64 === null; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, attempt === 1 ? 20_000 : 45_000));
    }
    try {
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
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      const transient = lastErr.includes("429") || lastErr.toLowerCase().includes("too many requests") || lastErr.includes("502") || lastErr.includes("503");
      if (!transient || attempt === 2) {
        return { ok: false, error: `${ref}: the image channel failed - ${lastErr}` };
      }
    }
  }
  if (!base64) {
    if (lastErr) return { ok: false, error: `${ref}: the image channel failed - ${lastErr}` };
    return { ok: false, error: `${ref}: the image channel returned no pixels` };
  }
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
 * ONE TAKE, SCORED - the take law's own atom (the 218 law): generate
 * one keyframe, read it N times through the SAME identity instrument
 * (the judge-variance damping, the 141 band's answer), the median per
 * entry per aspect, the note riding the median-closest sample (the
 * same merge law the render instrument obeys, scoreShotIdentityMedian).
 * Read-only on production - the arc append is the night's own write,
 * never this pass's. `takeIndex` names the take in the png receipt
 * (the take law's ledger keeps EVERY take's pixels).
 */
async function scoreOneKeyframeTake(
  shotId: string,
  samples: number,
  opts?: { outDir?: string; takeIndex?: number },
): Promise<AiKeyframeScore> {
  const gen = await generateKeyframeForShot(shotId);
  if (!gen.ok) return gen;
  // THE PIXELS LAND: a render source's receipts are pixels, not just
  // numbers - when the caller names a directory the SCORED keyframe
  // writes there (the eye reads what the judge read, byte-exact).
  if (opts?.outDir) {
    try {
      fs.mkdirSync(opts.outDir, { recursive: true });
      const take = opts.takeIndex && opts.takeIndex > 1 ? `-take${opts.takeIndex}` : "";
      const pngPath = path.join(opts.outDir, `${gen.recipe.ref.replace(/\s+/g, "")}${take}-keyframe.png`);
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

/**
 * THE KEYFRAME SCORING PASS (single-take, the v1 shape preserved
 * byte-exact): one generation, the damped instrument, the honest
 * number whatever the draw carried.
 */
export async function scoreAiKeyframeForShot(
  shotId: string,
  samples = 3,
  opts?: { outDir?: string },
): Promise<AiKeyframeScore> {
  return scoreOneKeyframeTake(shotId, samples, opts);
}

/** One take's receipt line - the take law's own ledger entry: EVERY
 *  take named, the shipped one flagged. Nothing hidden: the receipt
 *  answers "what did the other takes score?" The 219 law adds the
 *  guard's own reading: the take's counted figures (null = the
 *  guard abstained - no png receipt, or the count call missed). */
export interface KeyframeTakeReceipt {
  take: number;
  ok: boolean;
  error?: string;
  worst?: number; // the take's own damped median worst
  pngPath?: string;
  countedFigures?: number | null; // the 219 figure-count guard's reading
  shipped: boolean;
}

// ── THE FIGURE-COUNT GUARD (the 219 law) ──

/**
 * THE COUNT PROMPT (the probe219-countpass byte-carrier): one cheap
 * vision call - the drawn frame ALONE, no sheets - answering one
 * integer. The 219 evidence: 6/6 agreement with the eye's own
 * labeled receipts (both echo draws caught at 3, three two-figure
 * draws read 2, the solo read 1), zero call variance across the
 * pairs. The seam it owns: the take law's selection was
 * GRAMMAR-BLIND - the 219A gallery draw scored 92 (identity superb)
 * carrying THREE figures where the shot stages TWO, and the
 * best-of-worst selection would have SHIPPED it over the 85 true
 * frame. The count is the grammar signal the identity number
 * cannot see.
 */
const KEYFRAME_COUNT_PROMPT =
  "You are a composition checker for an animation production. Count the DISTINCT human figures (people - whole body, partial body, reflection, or silhouette) that appear IN THIS FRAME. " +
  "Do not count statues, paintings, clothing, or weapons on the ground. " +
  "If the same character appears more than once, EACH copy counts as a separate figure. " +
  "Answer with ONLY a single integer digit and nothing else.";

export function parseFigureCount(raw: string): number | null {
  const m = raw.match(/\d/);
  return m ? parseInt(m[0], 10) : null;
}

/** The count call (the 164 backoff's own discipline: two bounded
 *  retries on the rate limit, the same call each time). */
export async function countFiguresInFrame(
  dataUrl: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const zai = await ZAI.create();
      const res = (await zai.chat.completions.createVision({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: KEYFRAME_COUNT_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      } as never)) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = res.choices?.[0]?.message?.content ?? "";
      const count = parseFigureCount(raw);
      if (count === null) return { ok: false, error: `unparsable count: ${raw.slice(0, 60)}` };
      return { ok: true, count };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < 2 && (msg.includes("429") || msg.toLowerCase().includes("too many requests"))) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 20_000 : 45_000));
        continue;
      }
      return { ok: false, error: msg };
    }
  }
  return { ok: false, error: "unreachable" };
}

/**
 * THE SHIPMENT LAW (pure - the e2e's teeth): among the ok takes, a
 * take whose counted figures MATCH the cast's expected count
 * outranks a mismatched draw WHATEVER its identity score (the echo
 * is a composition failure the identity number cannot see); the
 * damped worst breaks the tie among honest takes. A null count (the
 * guard abstained) matches nothing - the 218 behavior stands when
 * the guard cannot read. Returns the best take's index in the
 * passed array (-1 only when every take failed).
 */
export function selectShippedTake(
  takes: Array<{ ok: boolean; worst?: number; countedFigures?: number | null }>,
  expectedFigures: number | null,
): number {
  let bestIdx = -1;
  for (let i = 0; i < takes.length; i++) {
    const t = takes[i];
    if (!t.ok) continue;
    if (bestIdx === -1) {
      bestIdx = i;
      continue;
    }
    const b = takes[bestIdx];
    const tMatch = expectedFigures !== null && t.countedFigures != null && t.countedFigures === expectedFigures;
    const bMatch = expectedFigures !== null && b.countedFigures != null && b.countedFigures === expectedFigures;
    if (tMatch !== bMatch) {
      if (tMatch) bestIdx = i;
      continue;
    }
    if ((t.worst ?? 0) > (b.worst ?? 0)) bestIdx = i;
  }
  return bestIdx;
}

export type AiKeyframeTakesScore =
  | {
      ok: true;
      ref: string;
      shotId: string;
      verdict: IdentityVerdict; // the SHIPPED take's damped median verdict
      sampleCount: number; // the shipped take's read count
      recipe: KeyframeRecipe; // the shipped take's recipe
      takes: KeyframeTakeReceipt[]; // EVERY take, named
    }
  | { ok: false; error: string };

/**
 * THE TAKE LAW (the 218 arm - the draw variance's own answer). The
 * 141 damping answers the judge's variance on ONE image; the DRAW
 * variance (different pixels, same law - the measured band: S003
 * 35..90, S002 60..92) had no answer. The law: the night renders K
 * takes per shot, the FULL damped instrument scores each, and the
 * SHIPPED pixels are the best take - the production's own dailies
 * selection made law. Honest by receipt: every take's score rides
 * the result (nothing hidden), the arc row records the SHIPPED
 * take's reading (the gate judges the pixels that ship), and the
 * named caveat holds - the take law lifts the shipped tail on cells
 * whose mode clears the floor; it cannot buy what no draw contains
 * (the 218 evidence: S003's take pair scored 40/40). takes=1 is the
 * single-take pass, byte-exact.
 */
export async function scoreAiKeyframeWithTakes(
  shotId: string,
  opts?: { takes?: number; samples?: number; outDir?: string },
): Promise<AiKeyframeTakesScore> {
  const k = Math.max(1, Math.min(4, Math.round(opts?.takes ?? 1)));
  const samples = opts?.samples ?? 3;
  // THE GUARD'S OWN ANSWER: the expected figure count is the sheeted
  // cast's count (the anchors' own number - the same list the prompt
  // law rides). The build is cheap (reads, no model); when it fails
  // the guard abstains (expected null - the worst decides).
  const built = await buildKeyframePrompt(shotId);
  const expectedFigures: number | null = built.ok ? built.build.members.length : null;
  const takes: KeyframeTakeReceipt[] = [];
  const okByTake = new Map<number, Extract<AiKeyframeScore, { ok: true }>>();
  for (let t = 1; t <= k; t++) {
    if (t > 1) await new Promise((r) => setTimeout(r, 10_000)); // the draw pacing (the night's own breath)
    const scored = await scoreOneKeyframeTake(shotId, samples, opts?.outDir ? { outDir: opts.outDir, takeIndex: t } : undefined);
    if (!scored.ok) {
      takes.push({ take: t, ok: false, error: scored.error, shipped: false });
      continue;
    }
    const okScored = scored as Extract<AiKeyframeScore, { ok: true }>;
    // THE FIGURE-COUNT GUARD (the 219 law, k>1 - the single-take
    // pass stays byte-exact): one cheap vision call reads the take's
    // shipped pixels; a take whose counted figures miss the cast's
    // expected count is an ECHO DRAW (the gallery receipt: a 92
    // reading three figures where two are staged). No png receipt or
    // a missed call: the guard abstains honestly (null).
    let countedFigures: number | null = null;
    if (k > 1 && okScored.recipe.pngPath) {
      try {
        const b64 = fs.readFileSync(okScored.recipe.pngPath).toString("base64");
        const counted = await countFiguresInFrame(`data:image/png;base64,${b64}`);
        if (counted.ok) countedFigures = counted.count;
      } catch {
        countedFigures = null;
      }
    }
    takes.push({ take: t, ok: true, worst: okScored.verdict.worst, pngPath: okScored.recipe.pngPath, countedFigures, shipped: false });
    okByTake.set(t - 1, okScored);
  }
  if (okByTake.size === 0) {
    const err = takes.find((t) => t.error)?.error ?? "no take returned a verdict";
    return { ok: false, error: err };
  }
  // THE SHIPMENT: the selection law (pure, the e2e's teeth) - the
  // count guard first, the damped worst breaking the tie.
  const bestIdx = selectShippedTake(takes, expectedFigures);
  const best = okByTake.get(bestIdx);
  if (!best) return { ok: false, error: "the selection could not resolve an ok take" };
  for (let i = 0; i < takes.length; i++) takes[i].shipped = i === bestIdx;
  return {
    ok: true,
    ref: best.ref,
    shotId: best.shotId,
    verdict: best.verdict,
    sampleCount: best.sampleCount,
    recipe: best.recipe,
    takes,
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
  takes?: KeyframeTakeReceipt[]; // the 218 take law's receipt (every take named, the shipped one flagged)
}

export interface AiKeyframeNightReport {
  night: string;
  cohort: string;
  lawVersion: number; // the keyframe law the pixels rendered under
  source: typeof AI_KEYFRAME_SOURCE;
  results: AiKeyframeNightShotResult[];
  appended: number;
  gate: EpisodeReleaseRead | null;
  gateError?: string;
  writtenAt: string; // the 220 report law: the write's own receipt
  reportPath: string; // where the durable copy landed
  reportError?: string; // a failed write names itself (nothing hidden)
}

/**
 * THE AI-KEYFRAME NIGHT - the render source class's own night pass.
 * K takes per shot (opts.takes, the 218 take law - default 1, the v1
 * shape), the damped instrument reads each, the SHIPPED take's arc
 * row APPENDS WITH THE SOURCE NAMED ("AI_KEYFRAME") AND THE COHORT
 * NAMED (the keyframe law's own cohort tag - the 218 law: a law bump
 * opens a new cohort, the old law's readings never pollute the new
 * law's verdict), and the SAME release gate reads the source's own
 * board at the source's own bar. The receipt path rides the options
 * (the production default is the committed durable ledger; the e2e's
 * lab scopes redirect).
 */
export async function runAiKeyframeNight(
  projectId: string,
  episodeId: string,
  opts?: { night?: string; samples?: number; takes?: number; receiptPath?: string | null; outDir?: string; onlyShotIds?: string[] },
): Promise<AiKeyframeNightReport> {
  const night = opts?.night ?? defaultNightTag();
  const cohort = aiKeyframeCohort(); // the source's own law cohort (the 218 law)
  const takes = Math.max(1, Math.min(4, Math.round(opts?.takes ?? 1)));
  const shots = await db.shot.findMany({
    where: { scene: { episodeId }, ...(opts?.onlyShotIds?.length ? { id: { in: opts.onlyShotIds } } : {}) },
    orderBy: { number: "asc" },
    include: { scene: { select: { number: true } } }, // the honest ref on a failed shot
  });

  const results: AiKeyframeNightShotResult[] = [];
  let appended = 0;
  const outDir = opts?.outDir;
  for (const shot of shots) {
    const ref = `E? Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;
    const scored =
      takes > 1
        ? await scoreAiKeyframeWithTakes(shot.id, { takes, samples: opts?.samples ?? 3, outDir })
        : await scoreAiKeyframeForShot(shot.id, opts?.samples ?? 3, outDir ? { outDir } : undefined);
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
    const takeReceipts: KeyframeTakeReceipt[] | undefined =
      takes > 1 && scored.ok && "takes" in scored
        ? (scored as Extract<AiKeyframeTakesScore, { ok: true }>).takes
        : undefined;
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
      ...(takeReceipts ? { takes: takeReceipts } : {}),
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

  // THE NIGHT REPORT MADE DURABLE (the 220 law - the wall's own
  // evidence): the take-level receipts (every take's error verbatim,
  // every figure count, the gate read) have been dying with the
  // terminal - the 219 night's S003 count abstention's own cause is
  // unrecoverable from durable state (the stdout said "one count
  // abstained" and said nothing else; the report that would have
  // carried the raw error was never written). The law: the report
  // writes where the pixels land (the out dir; the receipts dir when
  // no out dir rides), the SAME data the caller receives, plus the
  // write's own receipts (writtenAt / reportPath). The write is
  // NON-FATAL: the ledger and the return value are the primary
  // truth; a failed write names itself in reportError (nothing
  // hidden). A lab scope redirects nothing here - the lab's own
  // outDir/receiptPath options already carry it.
  const body = { night, cohort, lawVersion: AI_KEYFRAME_LAW_VERSION, source: AI_KEYFRAME_SOURCE, results, appended, gate, ...(gateError ? { gateError } : {}) };
  const reportPath = path.join(
    outDir ?? path.join(process.cwd(), "receipts"),
    `night-report-${night}.json`,
  );
  let reportError: string | undefined;
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ ...body, writtenAt: new Date().toISOString(), reportPath }, null, 2));
  } catch (e) {
    reportError = e instanceof Error ? e.message : String(e);
  }
  return { ...body, writtenAt: new Date().toISOString(), reportPath, ...(reportError ? { reportError } : {}) };
}
