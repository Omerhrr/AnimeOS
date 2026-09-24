import fs from "fs";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { safeJsonParse } from "@/lib/types";
import { POSE_GLOSS } from "@/lib/animation/poses";

// ─────────────────────────────────────────────────────────────
// AI ART SERVICE - panel art + character model sheets
//
// The model sheet is the consistency mechanism: for every cast
// member we generate a reference sheet AND store the canonical
// "visual anchor" prompt that produced it. Every later panel-art
// generation re-injects that exact anchor for characters detected
// in the shot description, so faces/wardrobe stay coherent across
// panels, episodes and formats.
// ─────────────────────────────────────────────────────────────

export type ComicFormatId = "MANHUA" | "MANHWA" | "MANGA";

type ImageSize = "1024x1024" | "768x1344" | "864x1152" | "1344x768" | "1152x864" | "1440x720" | "720x1440";

const SIZE_BY_SHOT_TYPE: Record<string, ImageSize> = {
  ESTABLISHING: "1344x768",
  WIDE: "1152x864",
  LOW_ANGLE: "864x1152",
  MEDIUM: "1152x864",
  CLOSEUP: "1152x864",
  EXTREME_CLOSEUP: "1024x1024",
};

const FORMAT_STYLE: Record<ComicFormatId, string> = {
  MANHUA: "Full-colour Chinese manhua panel illustration, cinematic donghua atmosphere, rich jade-teal and ink palette, dramatic lighting, high quality, detailed",
  MANHWA: "Korean webtoon panel illustration, clean line art, soft modern shading, sleek dramatic mood, high quality, detailed",
  MANGA: "Black-and-white Japanese manga panel, expressive ink linework, screentone shading, high contrast monochrome, high quality, detailed",
};

const FRAMING: Record<string, string> = {
  ESTABLISHING: "wide establishing shot, epic vista",
  WIDE: "wide shot, characters small in a large environment",
  LOW_ANGLE: "dramatic low-angle shot looking up at the subject",
  MEDIUM: "medium shot, waist-up framing",
  CLOSEUP: "close-up on the face, emotional focus",
  EXTREME_CLOSEUP: "extreme close-up, one striking detail fills the frame",
};

/** Per-production-style tokens - shared by panels AND model sheets so the whole cast lives in one visual language. */
const STYLE_TOKENS: Record<string, string> = {
  DONGHUA: "cinematic Chinese donghua art style, xianxia aesthetic, flowing robes, ink-wash influenced atmosphere, jade-teal and gold palette",
  ANIME: "Japanese anime art style, cel shading, crisp linework, expressive eyes, vibrant but controlled palette",
  KOREAN: "Korean manhwa art style, sleek line art, soft dramatic shading, modern fantasy mood",
  WESTERN: "stylized western animation art style, bold graphic shapes, expressive character design",
  CUSTOM: "consistent custom production art style, coherent character design language",
};

const NEGATIVE_TAIL = "no text, no speech bubbles, no captions, no watermark, no border, no panel frame";

// ─── Per-production style tuning ────────────────────────────
// A production can override/augment its visualStyle preset with
// free-text directives. These helpers compile the DB fields into
// the exact token strings injected into every art prompt.

interface StyleTunableProject {
  visualStyle: string;
  artStylePrompt?: string | null;
  artPalettePrompt?: string | null;
  artNegativePrompt?: string | null;
}

/** Style tokens for a production: custom directive wins over the preset, palette is appended. */
export function productionStyleTokens(project: StyleTunableProject): string {
  const custom = project.artStylePrompt?.trim();
  const palette = project.artPalettePrompt?.trim();
  return [
    custom || STYLE_TOKENS[project.visualStyle] || STYLE_TOKENS.CUSTOM,
    palette,
  ].filter(Boolean).join(", ");
}

/** Negative tokens for a production: base tail + any custom negatives. */
export function productionNegativeTokens(project: StyleTunableProject): string {
  const custom = project.artNegativePrompt?.trim();
  return custom ? `${NEGATIVE_TAIL}, ${custom}` : NEGATIVE_TAIL;
}

// ─── Per-shot style LoRA fine-tuning ────────────────────────
// A shot can carry a style adapter from the production's LoRA
// registry: its trigger tokens are injected verbatim and the
// strength steers how hard the adapter bends the look. High
// strengths explicitly override the production style directive.

interface LoraAdapter {
  name: string;
  triggerPhrase: string;
  weight: number;
  baseModel?: string | null;
}

export function shotLoraDirective(
  lora: LoraAdapter | null | undefined,
  strength: number | null | undefined
): string | null {
  if (!lora?.triggerPhrase?.trim()) return null;
  const s = Math.min(1.2, Math.max(0.1, strength ?? lora.weight));
  const dominance = s >= 0.75
    ? "this adapter dominates the visual style"
    : "blend this adapter with the base production style";
  return `style LoRA "${lora.name}" active (trigger tokens: ${lora.triggerPhrase.trim()}) at strength ${s.toFixed(2)} - ${dominance}`;
}

interface CastMember {
  id: string;
  name: string;
  appearance: string | null;
  modelSheetPrompt: string | null;
  modelSheetUrl?: string | null;
  modelSheetAt?: Date | null;
  states: Array<{
    episodeNumber: number | null;
    clothing: string | null;
    weapon: string | null;
    cultivation: string | null;
    label: string;
    createdAt: Date;
    poseStart?: string | null;
    poseEnd?: string | null;
  }>;
}

/** Resolve the character's development state active at a given episode. */
function activeState(member: CastMember, episodeNumber: number) {
  return [...member.states]
    .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
    .sort((a, b) =>
      (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1)
      || b.createdAt.getTime() - a.createdAt.getTime()
    )[0];
}

/**
 * The description tokens used for a character in a generation prompt.
 * Canonical anchor (model sheet) wins over the ad-hoc look so panel art
 * reproduces the exact same character the sheet locked in.
 */
export function castLook(member: CastMember, episodeNumber: number): string | null {
  const anchor = member.modelSheetPrompt?.trim();
  if (anchor) return anchor;
  const active = activeState(member, episodeNumber);
  return [member.appearance, active?.clothing, active?.weapon, active?.cultivation ? `at ${active.cultivation} cultivation stage` : null]
    .filter(Boolean)
    .join("; ") || null;
}

/** Detect cast members referenced by a shot description (first-name match, max 3). */
export function detectCast(projectCharacters: CastMember[], description: string): CastMember[] {
  const desc = description.toLowerCase();
  return projectCharacters
    .filter((c) => desc.includes(c.name.toLowerCase().split(" ")[0]))
    .slice(0, 3);
}

// ─── Fact-aware prompts (the world's canon rides into generation) ───

interface CanonFact {
  text: string;
  category: string;
}

export const MAX_CANON_FACTS = 6;

/**
 * Compile active universe facts into prompt directives: each fact is
 * restated as something the panel MUST show. Pure - E2E asserts on
 * the wording, and every panel-art generation injects the result so
 * the art is fact-aware BEFORE the vision check judges it.
 */
export function factCanonLines(facts: CanonFact[], max = MAX_CANON_FACTS): string[] {
  return facts
    .filter((f) => f.text?.trim())
    .slice(0, max)
    .map((f) => `${f.text.trim().slice(0, 150)} (${f.category.toLowerCase()})`);
}

/**
 * The canon section injected into a panel prompt: the production's
 * active universe facts, plus (for re-paints) the exact facts a
 * previous vision check flagged, restated as hard corrections.
 */
export function factCanonSection(activeFacts: CanonFact[], emphasisFacts: string[] | null | undefined): string | null {
  const canon = factCanonLines(activeFacts);
  const emphasis = (emphasisFacts ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 4)
    .map((t) => `the previous check flagged this panel for: ${t.slice(0, 150)}`);
  const lines: string[] = [];
  if (canon.length > 0) lines.push(`Universe canon that MUST hold in this panel: ${canon.join("; ")}`);
  if (emphasis.length > 0) lines.push(...emphasis);
  return lines.length > 0 ? lines.join(". ") : null;
}

// ─── Panel art ──────────────────────────────────────────────

export async function generateShotPanelArt(shotId: string, formatInput: unknown, options?: { emphasisFacts?: string[] }) {
  const comicFormat: ComicFormatId = FORMAT_STYLE[String(formatInput) as ComicFormatId] ? (String(formatInput) as ComicFormatId) : "MANHUA";

  const shot = await db.shot.findUnique({
    where: { id: shotId },
    include: {
      lora: true,
      scene: {
        include: {
          environment: true,
          episode: { include: { season: { include: { project: { include: { characters: { include: { states: true } }, universeFacts: { where: { active: true } } } } } } } },
        },
      },
    },
  });
  if (!shot) throw new Error("Shot not found");

  const project = shot.scene.episode.season.project;
  const factCanon = factCanonSection(project.universeFacts, options?.emphasisFacts);
  const scene = shot.scene;
  const styleTokens = productionStyleTokens(project);
  const negativeTail = productionNegativeTokens(project);
  const loraDirective = shotLoraDirective(shot.lora, shot.loraStrength);

  const cast = detectCast(project.characters, shot.description)
    .map((c) => {
      const look = castLook(c, shot.scene.episode.number);
      return look ? `${c.name} (match established character design): ${look}` : null;
    })
    .filter(Boolean)
    .join("\n");

  // art-aware continuity: the previous shot of the episode is the
  // visual this panel must sit next to - carry its beat over so
  // consecutive panels read as one continuous scene
  let prevContinuity: string | null = null;
  const prevShot =
    (await db.shot.findFirst({
      where: { sceneId: scene.id, number: { lt: shot.number } },
      orderBy: { number: "desc" },
    })) ??
    (scene.number > 1
      ? await db.shot.findFirst({
          where: {
            scene: { episodeId: scene.episodeId, number: scene.number - 1 },
          },
          orderBy: { number: "desc" },
        })
      : null);
  if (prevShot) {
    const prevBits = [
      prevShot.description ? `previous shot: ${prevShot.description}` : null,
      prevShot.lighting ? `its lighting: ${prevShot.lighting}` : null,
      prevShot.artworkUrl ? "a panel for it already exists - match its palette, environment and character wardrobe exactly" : null,
    ].filter(Boolean);
    if (prevBits.length > 0) {
      prevContinuity = `Continuity with the previous panel (keep the same location, time of day, palette, wardrobe and character appearance; only the framing/action moves forward): ${prevBits.join("; ")}`;
    }
  }

  const promptParts = [
    FORMAT_STYLE[comicFormat],
    styleTokens,
    loraDirective,
    FRAMING[shot.shotType] ?? FRAMING.MEDIUM,
    shot.description,
    scene.environment ? `Setting: ${scene.environment.name}${scene.environment.description ? ` - ${scene.environment.description}` : ""}` : null,
    scene.timeOfDay ? `${scene.timeOfDay.toLowerCase()} lighting` : null,
    scene.weather ? `${scene.weather.toLowerCase()} weather` : null,
    shot.lighting ? `Lighting: ${shot.lighting}` : null,
    cast ? `Characters:\n${cast}` : null,
    factCanon,
    shot.poseStart ? `The featured character is captured mid-action at the start of the move: ${POSE_GLOSS[shot.poseStart] ?? "in motion"}` : null,
    prevContinuity,
    "single comic panel",
    negativeTail,
  ];

  const prompt = promptParts.filter(Boolean).join(". ");

  const base64 = await renderImage(prompt, SIZE_BY_SHOT_TYPE[shot.shotType] ?? "1152x864");

  const dir = path.join(process.cwd(), "public", "panels");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, `${shot.id}.png`), Buffer.from(base64, "base64"));

  // cache-busting version so <img> refreshes on regeneration;
  // artGeneratedAt feeds the art-aware continuity staleness scan
  const now = new Date();
  const artworkUrl = `/panels/${shot.id}.png?v=${now.getTime()}`;
  await db.shot.update({ where: { id: shot.id }, data: { artworkUrl, artGeneratedAt: now } });

  return {
    artworkUrl,
    prompt: prompt.slice(0, 1200),
    lora: shot.lora ? { name: shot.lora.name, strength: shot.loraStrength ?? shot.lora.weight } : null,
  };
}

// ─── Character model sheets ─────────────────────────────────

function parseAppearance(raw: string | null): Record<string, string> {
  if (!raw) return {};
  const v = safeJsonParse<Record<string, unknown>>(raw, {});
  if (typeof v.notes === "string") return { notes: v.notes };
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
}

/**
 * Build the canonical visual anchor for a character - the exact token
 * string stored as modelSheetPrompt and reused in every panel featuring them.
 */
export function buildVisualAnchor(
  character: { name: string; age: string | null; role: string | null; appearance: string | null; wardrobe: string | null },
  activeClothing: string | null,
  activeWeapon: string | null,
  activeCultivation: string | null
): string {
  const looks = parseAppearance(character.appearance);
  const wardrobe = safeJsonParse<Array<{ name?: string; slot?: string }>>(character.wardrobe, []);
  const parts = [
    character.age ? `${character.age}-year-old` : null,
    character.role ? character.role.toLowerCase() : null,
    looks.notes ?? ([looks.face && `face: ${looks.face}`, looks.hair && `hair: ${looks.hair}`, looks.features && `distinguishing features: ${looks.features}`, looks.body && `build: ${looks.body}`].filter(Boolean).join(", ") || null),
    activeClothing ?? wardrobe[0]?.name ?? null,
    activeWeapon ? `wields ${activeWeapon}` : null,
    activeCultivation ? `${activeCultivation} cultivation stage` : null,
  ];
  return parts.filter(Boolean).join("; ");
}

export async function generateCharacterModelSheet(characterId: string) {
  const character = await db.character.findUnique({
    where: { id: characterId },
    include: { project: true, states: { orderBy: { episodeNumber: "asc" } } },
  });
  if (!character) throw new Error("Character not found");

  const latestState = [...character.states]
    .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0] ?? null;

  const anchor = buildVisualAnchor(
    character,
    latestState?.clothing ?? null,
    latestState?.weapon ?? null,
    latestState?.cultivation ?? null
  );
  const styleTokens = productionStyleTokens(character.project);

  const sheetPrompt = [
    styleTokens,
    `character reference model sheet of ${character.name}`,
    "turnaround sheet with full-body front view, three-quarter view and side profile of the SAME character",
    "identical face, hairstyle and outfit in every view, neutral A-pose",
    anchor,
    "plain light neutral studio background, flat even lighting, full body visible head to toe",
    "professional character design sheet, high quality, detailed",
    "no text, no labels, no watermark, single sheet",
  ].filter(Boolean).join(", ");

  const base64 = await renderImage(sheetPrompt, "1024x1024");

  const dir = path.join(process.cwd(), "public", "sheets");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, `${character.id}.png`), Buffer.from(base64, "base64"));

  const modelSheetUrl = `/sheets/${character.id}.png?v=${Date.now()}`;
  const now = new Date();
  await db.character.update({
    where: { id: character.id },
    data: { modelSheetUrl, modelSheetPrompt: anchor, modelSheetAt: now },
  });

  return { modelSheetUrl, prompt: sheetPrompt.slice(0, 1200), anchor };
}

// ─── SDK call with retry ────────────────────────────────────

async function renderImage(prompt: string, size: ImageSize, retries = 2): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const zai = await ZAI.create();
      const response = await zai.images.generations.create({ prompt, size });
      const base64 = response.data?.[0]?.base64;
      if (!base64) throw new Error("Empty image response");
      return base64;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Image generation failed");
}
