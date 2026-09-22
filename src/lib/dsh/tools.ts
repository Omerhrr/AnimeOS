import { db } from "@/lib/db";
import { checkSceneContinuity, checkSceneCapabilities } from "@/lib/continuity";
import { createRenderJob } from "@/lib/engine/render";
import { serializeDialogue, type DialogueLine } from "@/lib/comic/dialogue";
import { generateShotPanelArt, generateCharacterModelSheet } from "@/lib/ai/art";
import { isDeliveryId } from "@/lib/comic/delivery";
import { isVoiceId, defaultVoiceFor } from "@/lib/comic/voice-catalog";
import { resolveAutoDelivery } from "@/lib/ai/voice-casting";
import {
  diffEpisodeById, diffProjectEpisodes, reRenderStaleTakes, reRenderStaleAcrossProject,
} from "@/lib/ai/voice-diff";

// ─────────────────────────────────────────────────────────────
// DSH PRODUCTION TOOL API (§6/§7)
//
// DSH never writes raw engine scripts. It decides WHAT needs to
// happen and calls domain tools; this executor translates those
// decisions into production state changes. The engine bridge
// (Blender driver) sits below this layer.
// ─────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  args: Record<string, string>; // arg name → type/description
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_production_context",
    description: "Retrieve the full production state: project config, episodes, scenes, shots, characters (with development states), environments, assets, continuity events, terminology.",
    args: {},
  },
  {
    name: "create_project",
    description: "Create a new production. Visual styles: DONGHUA | ANIME | KOREAN | WESTERN | CUSTOM. Formats: FEATURE | SERIES | SHORT. Animation: 3D | 2D | HYBRID.",
    args: {
      title: "string, production title",
      logline: "string, one-sentence premise (optional)",
      format: "FEATURE | SERIES | SHORT",
      animationType: "3D | 2D | HYBRID",
      visualStyle: "DONGHUA | ANIME | KOREAN | WESTERN | CUSTOM",
      originalLanguage: "BCP-47 code, e.g. zh-CN, ja-JP, en-US (optional, defaults by style)",
      subtitleLanguages: "comma-separated language codes (optional)",
    },
  },
  {
    name: "create_character",
    description: "Create a persistent character entity with identity, appearance and animation library.",
    args: {
      name: "string",
      role: "PROTAGONIST | RIVAL | MENTOR | ANTAGONIST | SUPPORTING (optional)",
      age: "string (optional)",
      personality: "string (optional)",
      backstory: "string (optional)",
      appearance: "string, free-text description (optional)",
      abilities: "comma-separated ability names (optional)",
      derivativeType: "CLONE | AVATAR | REINCARNATION | POSSESSION | DISGUISE | TRANSFORMATION (optional - set when this character derives from another)",
      parentName: "string, source character name when derivativeType is set (optional)",
    },
  },
  {
    name: "create_character_state",
    description: "Record a character development state at a point in the story (PERMANENT development, TEMPORARY scene state, or VARIANT appearance).",
    args: {
      characterName: "string",
      label: "string, e.g. 'S02 - Foundation Established'",
      episodeNumber: "number (optional)",
      stateType: "PERMANENT | TEMPORARY | VARIANT",
      cultivation: "string (optional)",
      weapon: "string (optional)",
      clothing: "string (optional)",
      abilities: "comma-separated (optional)",
    },
  },
  {
    name: "create_relationship",
    description: "Link two characters with a relationship type (MASTER, RIVAL, ENEMY, ALLY, BROTHER, CLONE, ...).",
    args: { fromName: "string", toName: "string", type: "string" },
  },
  {
    name: "create_environment",
    description: "Create a persistent environment asset.",
    args: { name: "string", description: "string (optional)", timeOfDay: "string (optional)", weather: "string (optional)", lighting: "string (optional)" },
  },
  {
    name: "create_asset",
    description: "Register an asset: PROP | ENVIRONMENT | CHARACTER | CREATURE | VEHICLE | EFFECT.",
    args: { category: "string", name: "string", description: "string (optional)" },
  },
  {
    name: "create_episode",
    description: "Create a season (if needed) and an episode in the current project.",
    args: { seasonNumber: "number (default 1)", number: "number, episode number", title: "string", synopsis: "string (optional)" },
  },
  {
    name: "create_scene",
    description: "Create a scene within an episode, optionally linked to an environment by name.",
    args: {
      episodeNumber: "number (defaults to latest episode)",
      number: "number, scene number",
      title: "string",
      description: "string, narrative description - be cinematic and specific",
      environmentName: "string (optional, links existing environment)",
      timeOfDay: "string (optional)",
      weather: "string (optional)",
    },
  },
  {
    name: "create_shot",
    description: "Add a shot to a scene. Shot types: ESTABLISHING | WIDE | MEDIUM | CLOSEUP | EXTREME_CLOSEUP | LOW_ANGLE. Movements: ORBIT | DOLLY_IN | STATIC | PAN | TRACKING | CRANE.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      number: "number, shot number (omit to auto-increment)",
      description: "string, what the camera sees",
      shotType: "string",
      lens: "e.g. 24mm, 50mm, 85mm (optional)",
      movement: "string (optional)",
      duration: "seconds (optional, default 4)",
      lighting: "string (optional)",
    },
  },
  {
    name: "create_terminology",
    description: "Add a canonical term to the translation memory to keep localization consistent.",
    args: { term: "string", category: "string (optional)", translations: "JSON object {lang: translation}, e.g. {\"zh-CN\":\"青焰\",\"en-US\":\"Azure Flame\"}" },
  },
  {
    name: "add_continuity_event",
    description: "Register a canonical story fact for continuity tracking (DESTROYED | INJURED | GAINED | LOST | TRANSFORMED | CUSTOM).",
    args: {
      entityType: "PROP | CHARACTER | ENVIRONMENT | ABILITY",
      entityName: "string",
      kind: "string",
      episodeNumber: "number (optional)",
      description: "string",
      severity: "INFO | WARNING | CRITICAL (optional)",
    },
  },
  {
    name: "check_continuity",
    description: "Scan a piece of story text (scene description, script line) against canonical continuity events. Returns conflicts with suggested resolutions.",
    args: { text: "string, the story text to verify" },
  },
  {
    name: "check_capabilities",
    description: "Missing-capability detection for a scene: what the scene requires vs. what the production actually has (characters, environments, VFX, props).",
    args: { sceneNumber: "number (defaults to latest scene)" },
  },
  {
    name: "render_shot",
    description: "Queue a render job for a shot. mode PREVIEW for inspection loop, FINAL once approved. DSH will inspect the preview when it completes.",
    args: { sceneNumber: "number", shotNumber: "number", mode: "PREVIEW | FINAL (default PREVIEW)" },
  },
  {
    name: "set_shot_dialogue",
    description: "Author speech-bubble dialogue for a shot (replaces existing lines). Kinds: SPEECH (tailed bubble), THOUGHT (cloudy), SFX (stylized sound text). Speaker names should match cast characters. Max 8 lines, each ≤300 chars.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      lines: "JSON array string, e.g. [{\"speaker\":\"Lin Yue\",\"text\":\"The sword chose me.\",\"kind\":\"SPEECH\"}] - empty array clears dialogue",
    },
  },
  {
    name: "generate_panel_art",
    description: "Generate AI panel art for a shot in a comic format (MANHUA | MANHWA | MANGA). Uses the production's visual style, scene environment and each detected character's model-sheet anchor, so faces stay consistent. Slower (~15-40s) - use for hero shots.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      format: "MANHUA | MANHWA | MANGA (default MANHUA)",
    },
  },
  {
    name: "generate_model_sheet",
    description: "Generate a character model sheet (turnaround reference image) and store the canonical visual anchor used to keep that character's face/wardrobe consistent across all future panel art. Call this for important characters before generating their panel art.",
    args: { characterName: "string" },
  },
  {
    name: "set_art_style",
    description: "Tune this production's art style direction - a custom style directive (overrides the visualStyle preset tokens), palette tokens and extra negative tokens that are injected into every future panel-art and model-sheet prompt. Pass empty strings to reset a field back to the preset. Use this when the creator asks for a specific look (e.g. 'ink-wash with gold accents', 'pastel webtoon palette').",
    args: {
      styleDirective: "string (optional) - full art style directive, e.g. 'wuxia ink-wash style, gold rim lighting, misty mountain palette'",
      paletteTokens: "string (optional) - colour/mood tokens, e.g. 'jade green, ink black, warm gold highlights'",
      negativePrompt: "string (optional) - extra things to avoid, e.g. 'no modern clothing, no western architecture'",
    },
  },
  {
    name: "set_shot_lora",
    description: "Fine-tune the style of ONE shot with a style LoRA adapter from the production's registry. The adapter's trigger tokens flow into that shot's panel-art prompt at the given strength (0.1-1.2; >=0.75 dominates the production style). Use for style-critical shots: flashbacks, VFX-heavy beats, dream sequences. Pass loraName as empty string to detach.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      loraName: "string - LoRA name from the production's loras list (empty string clears the assignment)",
      strength: "number 0.1-1.2 (optional, defaults to the LoRA's default weight)",
    },
  },
  {
    name: "set_shot_artist",
    description: "Assign a shot to an artist on the production roster (multi-artist workflow). Use to balance workload and route specialisms (backgrounds, characters, effects). Pass artistName as empty string to unassign.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      artistName: "string - artist name from the production's artists list (empty string unassigns)",
    },
  },
  {
    name: "auto_assign_scene_team",
    description: "Autonomously staff an ENTIRE scene in one call: distribute every shot across the artist roster (routing by specialism - backgrounds, characters, effects - while balancing per-artist load) and attach matching style LoRAs by content keywords (flashback → ink-wash, flame/VFX → energy adapters, etc.). Use this when a scene is broken down and needs a full crew before art generation; use set_shot_artist/set_shot_lora afterwards only for surgical overrides.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      scope: "artists | lora | both (default both) - which assignments to make",
      overwrite: "boolean (default false) - true replaces existing artist/LoRA assignments on the scene's shots",
    },
  },
  {
    name: "add_audio_cue",
    description: "Add a timed sound-design cue to a shot's motion panel: SFX accent, VOICE line, BGM beat or AMBIENCE bed, timed in milliseconds against the shot's duration. Score dynamic shots (camera movement) with an ambience bed + 1-3 SFX accents; keep VOICE cues inside the shot duration.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      kind: "SFX | VOICE | BGM | AMBIENCE",
      label: "string, e.g. 'Blade shing - unsheathe' or the spoken line for VOICE",
      startMs: "number, cue start on the shot timeline",
      durationMs: "number, how long the sound lasts (default 600)",
      volume: "number 0.05-1 (default 0.8)",
    },
  },
  {
    name: "direct_voice_takes",
    description: "State-aware voice direction: set the standing delivery for every VOICE cue in a scene (or on one shot) so future voice takes are PERFORMED, not just spoken. delivery AUTO resolves each speaker's episode-effective character state (battle-damaged -> injured, triumphant/furious -> excited, else neutral); an explicit profile pins that register on every directed cue. Optionally attach a directorial note (e.g. 'clenched teeth, pained breaths').",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (optional - direct one shot; omit to direct the whole scene)",
      delivery: "AUTO | NEUTRAL | EXCITED | INJURED (default AUTO - resolve from each speaker's character state)",
      note: "string, directorial note stored on each directed cue (optional)",
    },
  },
  {
    name: "cast_voice_actor",
    description: "Per-artist voice casting: make a roster artist the speaking voice of a character, so every VOICE cue for that character renders with the artist's TTS voice (and that artist's name rides the take, stems and manifest). Optionally (re)assign which TTS voice the artist performs with. Pass artistName as empty string to clear a casting.",
    args: {
      characterName: "string - the character to cast",
      artistName: "string - artist on the production roster (empty string clears the casting)",
      voice: "string, optional TTS voice id for the artist: tongtong | chuichui | xiaochen | jam | kazi | douji | luodo",
    },
  },
  {
    name: "diff_episode_direction",
    description: "Direction diff for ONE episode: re-resolves what every VOICE cue would render as today (delivery chain, cast, line text, speed) and diffs it against the snapshot stamped on each take at render time. Classifies takes fresh / stale / unrendered and reports exactly which inputs moved. With reRender:true it re-renders ONLY the stale takes, so one state beat or line-level delivery edit never re-renders the whole episode. Run after any dialogue, casting, standing-direction or character-state change.",
    args: {
      episodeNumber: "number (defaults to latest episode)",
      reRender: "boolean (default false) - after reporting the diff, re-render only the stale takes",
    },
  },
  {
    name: "diff_all_episodes",
    description: "Batch direction diff across ALL episodes of the production: per-episode fresh/stale/unrendered tallies for every voice take plus the overall counts. With reRender:true it batch re-renders stale takes across the whole season, capped per call (limit, default 16, max 32) so TTS is not hammered; the result reports how many stale takes remain for a follow-up call.",
    args: {
      reRender: "boolean (default false) - batch re-render stale takes across all episodes (capped)",
      limit: "number, max takes to re-render in one batch call (default 16, max 32)",
    },
  },
  {
    name: "set_state_voice_variant",
    description: "State voice variants: bind a DIFFERENT TTS voice to one of a character's development states, so lines spoken while that state is episode-effective are performed with the variant voice instead of the cast artist's normal voice (possession, transformation, clone, corrupted, child form...). Casting beyond delivery registers: the state changes WHO the character sounds like, the delivery register changes HOW the line is played. Takes rendered before the change are flagged stale by the direction diff; pass voice as empty string to clear the variant.",
    args: {
      characterName: "string",
      stateLabel: "string - matches a state by name (contains, case-insensitive); defaults to the character's latest episode-resolved state",
      voice: "string - TTS voice id: tongtong | chuichui | xiaochen | jam | kazi | douji | luodo (empty string clears the variant)",
    },
  },
];

type ActionResult = { status: "OK" | "ERROR"; result: string };

async function findProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId } });
  if (!p) throw new Error("Project not found");
  return p;
}

async function characterByName(projectId: string, name: string) {
  const ch = await db.character.findFirst({
    where: { projectId, name: { contains: name } },
  });
  return ch;
}

async function latestEpisode(projectId: string) {
  return db.episode.findFirst({
    where: { season: { projectId } },
    orderBy: [{ season: { number: "asc" } }, { number: "desc" }],
    include: { season: true },
  });
}

async function latestScene(projectId: string) {
  const eps = await db.episode.findMany({
    where: { season: { projectId } },
    include: { scenes: { orderBy: { number: "desc" }, take: 1 } },
    orderBy: [{ season: { number: "asc" } }, { number: "desc" }],
  });
  for (const ep of eps) if (ep.scenes.length) return ep.scenes[0];
  return null;
}

async function resolveScene(projectId: string, sceneNumberArg: unknown) {
  if (sceneNumberArg) {
    const scenes = await db.scene.findMany({
      where: { episode: { season: { projectId } }, number: Number(sceneNumberArg) },
      include: { episode: true },
      orderBy: { createdAt: "desc" },
    });
    if (scenes[0]) return scenes[0];
  }
  return latestScene(projectId);
}

export async function executeTool(projectId: string, name: string, args: Record<string, unknown>): Promise<ActionResult> {
  try {
    switch (name) {
      case "get_production_context": {
        const ctx = await buildCompactContext(projectId);
        return { status: "OK", result: JSON.stringify(ctx) };
      }

      case "create_project": {
        const title = String(args.title ?? "Untitled Production");
        const style = String(args.visualStyle ?? "DONGHUA");
        const presets: Record<string, string> = { DONGHUA: "zh-CN", ANIME: "ja-JP", KOREAN: "ko-KR", WESTERN: "en-US", CUSTOM: "en-US" };
        const subs = String(args.subtitleLanguages ?? "en-US").split(",").map((s) => s.trim()).filter(Boolean);
        const project = await db.project.create({
          data: {
            title,
            logline: args.logline ? String(args.logline) : null,
            format: String(args.format ?? "SERIES"),
            animationType: String(args.animationType ?? "3D"),
            visualStyle: style,
            originalLanguage: String(args.originalLanguage ?? presets[style] ?? "en-US"),
            subtitleLanguages: JSON.stringify(subs),
          },
        });
        await db.season.create({ data: { projectId: project.id, number: 1, title: "Season 1" } });
        return { status: "OK", result: `Production '${project.title}' created (${project.visualStyle}/${project.animationType}/${project.originalLanguage}). Season 1 initialized. New active project id: ${project.id}` };
      }

      case "create_character": {
        await findProject(projectId);
        const cname = String(args.name ?? "Unnamed");
        let parentId: string | null = null;
        const derivType = args.derivativeType ? String(args.derivativeType) : null;
        if (derivType && args.parentName) {
          const parent = await characterByName(projectId, String(args.parentName));
          if (parent) parentId = parent.id;
        }
        const ch = await db.character.create({
          data: {
            projectId,
            name: cname,
            role: args.role ? String(args.role) : null,
            age: args.age ? String(args.age) : null,
            personality: args.personality ? String(args.personality) : null,
            backstory: args.backstory ? String(args.backstory) : null,
            appearance: args.appearance ? JSON.stringify({ notes: String(args.appearance) }) : null,
            abilities: args.abilities ? JSON.stringify(String(args.abilities).split(",").map((s) => s.trim()).filter(Boolean)) : null,
            animationLib: JSON.stringify(["idle", "walk", "run"]),
            derivativeType: derivType,
            parentId,
          },
        });
        return { status: "OK", result: `Character '${ch.name}' created${derivType ? ` as ${derivType} of ${String(args.parentName)}` : ""}.` };
      }

      case "create_character_state": {
        const ch = await characterByName(projectId, String(args.characterName ?? ""));
        if (!ch) return { status: "ERROR", result: `Character '${String(args.characterName)}' not found.` };
        await db.characterState.create({
          data: {
            characterId: ch.id,
            label: String(args.label ?? "New state"),
            episodeNumber: args.episodeNumber ? Number(args.episodeNumber) : null,
            stateType: String(args.stateType ?? "PERMANENT"),
            cultivation: args.cultivation ? String(args.cultivation) : null,
            weapon: args.weapon ? String(args.weapon) : null,
            clothing: args.clothing ? String(args.clothing) : null,
            abilities: args.abilities ? JSON.stringify(String(args.abilities).split(",").map((s) => s.trim()).filter(Boolean)) : null,
          },
        });
        return { status: "OK", result: `State '${String(args.label)}' recorded for ${ch.name}.` };
      }

      case "create_relationship": {
        const from = await characterByName(projectId, String(args.fromName ?? ""));
        const to = await characterByName(projectId, String(args.toName ?? ""));
        if (!from || !to) return { status: "ERROR", result: `Could not resolve both characters: ${String(args.fromName)} → ${String(args.toName)}.` };
        await db.relationship.create({ data: { fromId: from.id, toId: to.id, type: String(args.type ?? "ALLY") } });
        return { status: "OK", result: `Relationship: ${from.name} -${String(args.type)}→ ${to.name}.` };
      }

      case "create_environment": {
        await findProject(projectId);
        const envName = String(args.name ?? "Unnamed Environment");
        const exists = await db.environment.findFirst({ where: { projectId, name: envName } });
        if (exists) return { status: "OK", result: `Environment '${envName}' already exists - reusing it.` };
        const env = await db.environment.create({
          data: {
            projectId,
            name: envName,
            description: args.description ? String(args.description) : null,
            timeOfDay: args.timeOfDay ? String(args.timeOfDay) : null,
            weather: args.weather ? String(args.weather) : null,
            lighting: args.lighting ? String(args.lighting) : null,
          },
        });
        return { status: "OK", result: `Environment '${env.name}' created.` };
      }

      case "create_asset": {
        await findProject(projectId);
        const asset = await db.asset.create({
          data: {
            projectId,
            category: String(args.category ?? "PROP"),
            name: String(args.name ?? "Unnamed Asset"),
            description: args.description ? String(args.description) : null,
          },
        });
        await db.assetVersion.create({ data: { assetId: asset.id, version: 1, note: "Initial version" } });
        return { status: "OK", result: `Asset '${asset.name}' (${asset.category}) registered at v1.` };
      }

      case "create_episode": {
        const seasonNumber = args.seasonNumber ? Number(args.seasonNumber) : 1;
        let season = await db.season.findFirst({ where: { projectId, number: seasonNumber } });
        if (!season) season = await db.season.create({ data: { projectId, number: seasonNumber, title: `Season ${seasonNumber}` } });
        const ep = await db.episode.create({
          data: {
            seasonId: season.id,
            number: Number(args.number ?? 1),
            title: String(args.title ?? `Episode ${args.number ?? 1}`),
            synopsis: args.synopsis ? String(args.synopsis) : null,
          },
        });
        return { status: "OK", result: `Episode S${seasonNumber}E${ep.number} '${ep.title}' created.` };
      }

      case "create_scene": {
        let episode: Awaited<ReturnType<typeof latestEpisode>> = null;
        if (args.episodeNumber) {
          episode = await db.episode.findFirst({
            where: { season: { projectId }, number: Number(args.episodeNumber) },
            include: { season: true },
          });
        }
        if (!episode) episode = await latestEpisode(projectId);
        if (!episode) return { status: "ERROR", result: "No episode exists yet - create an episode first." };

        let environmentId: string | null = null;
        if (args.environmentName) {
          const env = await db.environment.findFirst({ where: { projectId, name: { contains: String(args.environmentName) } } });
          if (env) environmentId = env.id;
        }
        const maxNum = await db.scene.aggregate({ where: { episodeId: episode.id }, _max: { number: true } });
        const scene = await db.scene.create({
          data: {
            episodeId: episode.id,
            number: args.number ? Number(args.number) : (maxNum._max.number ?? 0) + 1,
            title: String(args.title ?? `Scene ${(maxNum._max.number ?? 0) + 1}`),
            description: args.description ? String(args.description) : null,
            environmentId,
            timeOfDay: args.timeOfDay ? String(args.timeOfDay) : null,
            weather: args.weather ? String(args.weather) : null,
          },
        });
        return { status: "OK", result: `Scene ${scene.number} '${scene.title}' created in ${episode.season.title} E${episode.number}${environmentId ? " (environment linked)" : ""}.` };
      }

      case "create_shot": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            include: { episode: true },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };

        const maxNum = await db.shot.aggregate({ where: { sceneId: scene.id }, _max: { number: true } });
        const shot = await db.shot.create({
          data: {
            sceneId: scene.id,
            number: args.number ? Number(args.number) : (maxNum._max.number ?? 0) + 1,
            description: String(args.description ?? "Untitled shot"),
            shotType: String(args.shotType ?? "MEDIUM"),
            lens: args.lens ? String(args.lens) : null,
            movement: args.movement ? String(args.movement) : null,
            duration: args.duration ? Number(args.duration) : 4,
            lighting: args.lighting ? String(args.lighting) : null,
          },
        });
        return { status: "OK", result: `Shot ${String(shot.number).padStart(3, "0")} (${shot.shotType}, ${shot.lens ?? "default lens"}, ${shot.movement ?? "static"}, ${shot.duration}s) added to Scene ${scene.number}.` };
      }

      case "create_terminology": {
        let translations: Record<string, string> = {};
        if (typeof args.translations === "string") {
          try { translations = JSON.parse(args.translations); } catch { translations = {}; }
        } else if (args.translations && typeof args.translations === "object") {
          translations = args.translations as Record<string, string>;
        }
        const term = String(args.term ?? "");
        if (!term) return { status: "ERROR", result: "Term is required." };
        await db.terminology.upsert({
          where: { projectId_term: { projectId, term } },
          create: { projectId, term, category: args.category ? String(args.category) : null, translations: JSON.stringify(translations) },
          update: { translations: JSON.stringify(translations), category: args.category ? String(args.category) : null },
        });
        return { status: "OK", result: `Term '${term}' stored in translation memory.` };
      }

      case "add_continuity_event": {
        await findProject(projectId);
        const ev = await db.continuityEvent.create({
          data: {
            projectId,
            entityType: String(args.entityType ?? "PROP"),
            entityName: String(args.entityName ?? "Unknown"),
            kind: String(args.kind ?? "CUSTOM"),
            episodeNumber: args.episodeNumber ? Number(args.episodeNumber) : null,
            description: String(args.description ?? ""),
            severity: String(args.severity ?? "INFO"),
          },
        });
        return { status: "OK", result: `Continuity event registered: ${ev.entityName} ${ev.kind}${ev.episodeNumber ? ` (Ep ${ev.episodeNumber})` : ""}.` };
      }

      case "check_continuity": {
        const text = String(args.text ?? "").toLowerCase();
        const events = await db.continuityEvent.findMany({
          where: { projectId, kind: { in: ["DESTROYED", "LOST", "INJURED", "TRANSFORMED"] } },
        });
        const hits = events.filter((e) => text.includes(e.entityName.toLowerCase()));
        if (!hits.length) return { status: "OK", result: "No continuity conflicts detected for this text." };
        const lines = hits.map((h) => `CONFLICT: '${h.entityName}' - ${h.kind}${h.episodeNumber ? ` in Episode ${h.episodeNumber}` : ""}: ${h.description}`);
        return { status: "OK", result: lines.join("\n") };
      }

      case "check_capabilities": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene to check." };
        const caps = await checkSceneCapabilities(projectId, scene.id);
        const missing = caps.filter((c) => !c.present);
        const lines = caps.map((c) => `${c.present ? "✓" : "✗"} ${c.requirement} (${c.category}) - ${c.detail}`);
        return { status: "OK", result: `Capability check for Scene ${scene.number} '${scene.title}':\n${lines.join("\n")}${missing.length ? `\n→ ${missing.length} missing capability(ies): ${missing.map((m) => m.requirement).join(", ")}` : "\n→ All requirements satisfied."}` };
      }

      case "render_shot": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const mode = String(args.mode ?? "PREVIEW") === "FINAL" ? "FINAL" : "PREVIEW";
        const job = await createRenderJob(projectId, shot.id, mode);
        return { status: "OK", result: `${mode} render job queued for Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}). Job ${job.id.slice(-6)} - DSH will inspect the preview when it completes.` };
      }

      case "set_shot_dialogue": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };

        let rawLines: unknown = args.lines;
        if (typeof rawLines === "string") {
          try { rawLines = JSON.parse(rawLines); } catch { rawLines = null; }
        }
        if (!Array.isArray(rawLines)) {
          return { status: "ERROR", result: "lines must be a JSON array like [{\"speaker\":\"...\",\"text\":\"...\",\"kind\":\"SPEECH\"}]" };
        }
        const lines = (rawLines as Array<Record<string, unknown>>).map((l): DialogueLine => ({
          speaker: typeof l.speaker === "string" ? l.speaker : "",
          text: typeof l.text === "string" ? l.text : "",
          kind: (l.kind === "THOUGHT" || l.kind === "SFX") ? l.kind : "SPEECH",
        }));
        const counts = lines.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.kind]: (acc[l.kind] ?? 0) + 1 }), {});
        await db.shot.update({
          where: { id: shot.id },
          data: { dialogue: lines.length ? serializeDialogue(lines) : null },
        });
        const summary = Object.entries(counts).map(([k, n]) => `${k}×${n}`).join(", ") || "0 lines";
        return {
          status: "OK",
          result: lines.length
            ? `Dialogue set for Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}): ${summary}. Bubbles render in Comic Mode.`
            : `Dialogue cleared for Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}).`,
        };
      }

      case "generate_panel_art": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const format = String(args.format ?? "MANHUA").toUpperCase();
        try {
          const art = await generateShotPanelArt(shot.id, format);
          return {
            status: "OK",
            result: `Panel art generated for Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}, ${format} style) → ${art.artworkUrl}. Characters used their model-sheet anchors where available.`,
          };
        } catch (err) {
          return { status: "ERROR", result: `Panel art generation failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      case "generate_model_sheet": {
        const ch = await characterByName(projectId, String(args.characterName ?? ""));
        if (!ch) return { status: "ERROR", result: `Character '${String(args.characterName)}' not found.` };
        try {
          const sheet = await generateCharacterModelSheet(ch.id);
          return {
            status: "OK",
            result: `Model sheet generated for ${ch.name} → ${sheet.modelSheetUrl}. Canonical visual anchor stored: "${sheet.anchor.slice(0, 160)}" - future panel art of ${ch.name} will match it.`,
          };
        } catch (err) {
          return { status: "ERROR", result: `Model sheet generation failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      case "set_art_style": {
        const project = await findProject(projectId);
        const data: Record<string, string | null> = {};
        for (const [key, arg] of [["artStylePrompt", "styleDirective"], ["artPalettePrompt", "paletteTokens"], ["artNegativePrompt", "negativePrompt"]] as const) {
          if (args[arg] !== undefined) {
            const v = String(args[arg] ?? "").trim();
            data[key] = v.length > 0 ? v.slice(0, 600) : null;
          }
        }
        if (Object.keys(data).length === 0) {
          return { status: "ERROR", result: "Nothing to change - pass styleDirective, paletteTokens and/or negativePrompt." };
        }
        const updated = await db.project.update({ where: { id: project.id }, data });
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "STATE_CHANGE",
            summary: `DSH tuned the art style direction of '${project.title}'`,
            payload: JSON.stringify(data),
          },
        });
        const parts = [
          updated.artStylePrompt ? `style: "${updated.artStylePrompt}"` : null,
          updated.artPalettePrompt ? `palette: "${updated.artPalettePrompt}"` : null,
          updated.artNegativePrompt ? `negatives: "${updated.artNegativePrompt}"` : null,
        ].filter(Boolean).join(" · ");
        return { status: "OK", result: `Art style direction updated - ${parts}. Every future panel-art and model-sheet prompt in this production now carries it.` };
      }

      case "set_shot_lora": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };

        const loraName = String(args.loraName ?? "").trim();
        if (!loraName) {
          await db.shot.update({ where: { id: shot.id }, data: { loraId: null, loraStrength: null } });
          return { status: "OK", result: `Style LoRA detached from Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}) - back to the production style.` };
        }
        const lora = await db.styleLora.findFirst({ where: { projectId, name: { contains: loraName } } });
        if (!lora) {
          const known = await db.styleLora.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `No LoRA named '${loraName}' in this production. Registered: ${known.map((l) => l.name).join(", ") || "none - register one with the creator"}.` };
        }
        const strength = args.strength !== undefined ? Math.min(1.2, Math.max(0.1, Number(args.strength))) : lora.weight;
        if (args.strength !== undefined && !Number.isFinite(strength)) {
          return { status: "ERROR", result: "strength must be a number between 0.1 and 1.2." };
        }
        await db.shot.update({ where: { id: shot.id }, data: { loraId: lora.id, loraStrength: strength } });
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "STATE_CHANGE",
            summary: `DSH attached style LoRA '${lora.name}' @${strength.toFixed(2)} to Scene ${scene.number} / Shot ${String(shot.number).padStart(3, "0")}`,
          },
        });
        return {
          status: "OK",
          result: `Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}) now renders with style LoRA '${lora.name}' (trigger: ${lora.triggerPhrase}) at strength ${strength.toFixed(2)}. Future panel art for this shot picks it up automatically.`,
        };
      }

      case "set_shot_artist": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };

        const artistName = String(args.artistName ?? "").trim();
        if (!artistName) {
          await db.shot.update({ where: { id: shot.id }, data: { artistId: null } });
          return { status: "OK", result: `Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}) unassigned - back in the pool.` };
        }
        const artist = await db.artist.findFirst({ where: { projectId, name: { contains: artistName } } });
        if (!artist) {
          const roster = await db.artist.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `No artist named '${artistName}' on this production's roster. Roster: ${roster.map((a) => a.name).join(", ") || "empty"}.` };
        }
        await db.shot.update({ where: { id: shot.id }, data: { artistId: artist.id } });
        return { status: "OK", result: `Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}) assigned to ${artist.name}${artist.role ? ` (${artist.role})` : ""}.` };
      }

      case "auto_assign_scene_team": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const sceneShots = await db.shot.findMany({
          where: { sceneId: scene.id },
          orderBy: { number: "asc" },
          include: { scene: { include: { environment: true } } },
        });
        if (sceneShots.length === 0) return { status: "ERROR", result: `Scene ${scene.number} has no shots to staff.` };

        const scopeRaw = String(args.scope ?? "both").toLowerCase();
        const scope = ["artists", "lora", "both"].includes(scopeRaw) ? scopeRaw : "both";
        const overwrite = Boolean(args.overwrite);

        const roster = await db.artist.findMany({
          where: { projectId },
          orderBy: { createdAt: "asc" },
          include: { _count: { select: { shots: true } } },
        });
        const loras = await db.styleLora.findMany({ where: { projectId } });
        if (scope !== "lora" && roster.length === 0) {
          return { status: "ERROR", result: "The artist roster is empty - ask the creator to add artists (or add them via create tooling) before auto-staffing." };
        }
        if (scope !== "artists" && loras.length === 0 && scope === "lora") {
          return { status: "ERROR", result: "No style LoRAs are registered for this production - register adapters before auto-attaching them." };
        }

        const updates: Array<{ shotId: string; data: Record<string, unknown> }> = [];
        const notes: string[] = [];

        // ── artist routing: specialism score − load imbalance ──
        if (scope === "artists" || scope === "both") {
          const load = new Map<string, number>(roster.map((a) => [a.id, a._count.shots]));
          const roleOf = (a: (typeof roster)[number]) => `${a.name} ${a.role ?? ""}`.toLowerCase();
          const isBg = (a: (typeof roster)[number]) => /background|environment|layout|scenery/.test(roleOf(a));
          const isChar = (a: (typeof roster)[number]) => /character|key anim|cleanup|portrait|cast/.test(roleOf(a));
          const isFx = (a: (typeof roster)[number]) => /effect|fx|action|vfx|energy/.test(roleOf(a));
          const fxWords = /energy|qi|blast|flame|fire|lightning|explosion|sword|storm|thunder|aura|spirit|flash/i;

          for (const shot of sceneShots) {
            if (shot.artistId && !overwrite) continue;
            const wide = shot.shotType === "ESTABLISHING" || shot.shotType === "WIDE";
            const tight = shot.shotType === "CLOSEUP" || shot.shotType === "EXTREME_CLOSEUP";
            const moving = Boolean(shot.movement && shot.movement !== "STATIC");
            const fxShot = fxWords.test(shot.description) || (moving && Boolean(shot.movement && ["ORBIT", "CRANE", "TRACKING"].includes(shot.movement)));

            let best: { id: string; name: string; score: number } | null = null;
            for (const a of roster) {
              let score = 0;
              if (wide && isBg(a)) score += 3;
              if (tight && isChar(a)) score += 3;
              if (fxShot && isFx(a)) score += 3;
              if (!wide && !tight && !fxShot && isChar(a)) score += 1;
              score -= (load.get(a.id) ?? 0) * 0.5; // balance: load halves the pull of specialism
              if (!best || score > best.score) best = { id: a.id, name: a.name, score };
            }
            if (best) {
              updates.push({ shotId: shot.id, data: { artistId: best.id } });
              load.set(best.id, (load.get(best.id) ?? 0) + 1);
            }
          }
          const assigned = updates.length;
          if (assigned > 0) {
            const tally = roster.map((a) => `${a.name} ${load.get(a.id) ?? 0}`).join(", ");
            notes.push(`${assigned} shot${assigned === 1 ? "" : "s"} routed across the roster (load now: ${tally})`);
          } else {
            notes.push("every shot already had an artist (pass overwrite: true to re-route)");
          }
        }

        // ── LoRA routing: keyword overlap between shot content and adapter tokens ──
        if (scope === "lora" || scope === "both") {
          if (loras.length > 0) {
            const env = sceneShots[0]?.scene?.environment;
            const envWords = `${env?.name ?? ""} ${env?.weather ?? ""} ${env?.lighting ?? ""}`.toLowerCase();
            let loraHits = 0;
            for (const shot of sceneShots) {
              if (shot.loraId && !overwrite) continue;
              const hay = `${shot.description} ${shot.movement ?? ""} ${shot.lighting ?? ""} ${envWords}`.toLowerCase();
              let best: { id: string; name: string; hits: number } | null = null;
              for (const lora of loras) {
                const tokens = `${lora.name} ${lora.triggerPhrase} ${lora.notes ?? ""}`
                  .toLowerCase()
                  .split(/[^a-z]+/)
                  .filter((t) => t.length >= 4);
                let hits = 0;
                for (const t of new Set(tokens)) if (hay.includes(t)) hits += 1;
                if (hits > 0 && (!best || hits > best.hits)) best = { id: lora.id, name: lora.name, hits };
              }
              if (best) {
                updates.push({ shotId: shot.id, data: { loraId: best.id, loraStrength: loras.find((l) => l.id === best!.id)?.weight ?? 0.8 } });
                loraHits += 1;
              }
            }
            notes.push(loraHits > 0 ? `${loraHits} shot${loraHits === 1 ? "" : "s"} LoRA-tuned by content match` : "no LoRA matched any shot content (left on production style)");
          }
        }

        for (const u of updates) await db.shot.update({ where: { id: u.shotId }, data: u.data });
        if (updates.length > 0) {
          await db.productionEvent.create({
            data: {
              projectId,
              actor: "DSH",
              type: "STATE_CHANGE",
              summary: `DSH auto-staffed Scene ${scene.number} - ${updates.length} shot update(s): ${notes.join(" · ")}`,
            },
          });
        }
        return {
          status: "OK",
          result: updates.length === 0
            ? `Scene ${scene.number} needed no changes - ${notes.join(" · ")}.`
            : `Scene ${scene.number} staffed autonomously - ${notes.join(" · ")}. The board and workload view reflect it immediately; panel-art prompts pick up the LoRA triggers on the next generation.`,
        };
      }

      case "add_audio_cue": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };

        const kindRaw = String(args.kind ?? "SFX").toUpperCase();
        const kind = ["SFX", "VOICE", "BGM", "AMBIENCE"].includes(kindRaw) ? kindRaw : "SFX";
        const label = String(args.label ?? "").trim();
        if (!label) return { status: "ERROR", result: "label is required - describe the sound or give the spoken line." };
        const timelineMs = Math.max(1, Math.round((shot.duration ?? 4) * 1000));
        const startMs = Math.min(timelineMs - 50, Math.max(0, Math.round(Number(args.startMs ?? 0)) || 0));
        const durationMs = Math.min(Math.max(timelineMs, 50), Math.max(50, Math.round(Number(args.durationMs ?? 600)) || 600));
        const volume = Number.isFinite(Number(args.volume)) ? Math.min(1, Math.max(0.05, Number(args.volume))) : 0.8;
        const cue = await db.audioCue.create({ data: { shotId: shot.id, kind, label: label.slice(0, 120), startMs, durationMs, volume } });
        const total = await db.audioCue.count({ where: { shotId: shot.id } });
        return {
          status: "OK",
          result: `${kind} cue "${cue.label}" @${cue.startMs}ms (+${cue.durationMs}ms) added to Shot ${String(shot.number).padStart(3, "0")} - shot now carries ${total} cue(s) on its ${timelineMs}ms motion timeline.`,
        };
      }

      case "direct_voice_takes": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const shots = await db.shot.findMany({
          where: { sceneId: scene.id, ...(args.shotNumber ? { number: Number(args.shotNumber) } : {}) },
          orderBy: { number: "asc" },
          include: { scene: true },
        });
        if (shots.length === 0) {
          return { status: "ERROR", result: `Scene ${scene.number} has no shots${args.shotNumber ? ` matching number ${String(args.shotNumber)}` : ""}.` };
        }

        const cues = await db.audioCue.findMany({
          where: { shotId: { in: shots.map((s) => s.id) }, kind: "VOICE" },
          orderBy: { startMs: "asc" },
        });
        if (cues.length === 0) {
          return { status: "ERROR", result: `No VOICE cues to direct - score the scene's dialogue with add_audio_cue (kind VOICE) first.` };
        }

        const deliveryArg = String(args.delivery ?? "AUTO").toUpperCase();
        const pinned = isDeliveryId(deliveryArg) ? deliveryArg : null; // AUTO (or invalid) keeps state-aware resolution
        const note = args.note !== undefined ? String(args.note).trim().slice(0, 200) || null : undefined;

        // episode context for state-aware resolution
        const episodeRow = await db.episode.findUnique({
          where: { id: shots[0].scene.episodeId },
          include: { season: true },
        });
        const episodeNumber = episodeRow?.number ?? null;
        const epProjectId = episodeRow?.season.projectId ?? projectId;

        const lines: string[] = [];
        let pinnedCount = 0;
        const stateTally: Record<string, number> = {};
        for (const cue of cues) {
          const speaker = cue.label.includes(": ") ? cue.label.split(":")[0].trim() : "";
          let resolvedId: string;
          let fromLabel: string | null = null;
          if (pinned) {
            resolvedId = pinned;
            pinnedCount += 1;
          } else {
            const resolved = await resolveAutoDelivery(speaker, episodeNumber, epProjectId);
            resolvedId = resolved.id;
            fromLabel = resolved.stateLabel;
          }
          stateTally[resolvedId] = (stateTally[resolvedId] ?? 0) + 1;
          const shot = shots.find((s) => s.id === cue.shotId);
          await db.audioCue.update({
            where: { id: cue.id },
            data: {
              voiceDelivery: pinned, // null keeps every future render state-aware
              ...(note !== undefined ? { voiceNote: note } : {}),
            },
          });
          lines.push(
            `shot ${String(shot?.number ?? 0).padStart(3, "0")} "${speaker || cue.label.slice(0, 24)}" -> ${resolvedId.toLowerCase()}${fromLabel ? ` (from "${fromLabel}")` : ""}`,
          );
        }

        const tallyText = Object.entries(stateTally).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ");
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "STATE_CHANGE",
            summary: `DSH directed ${cues.length} voice take(s) in Scene ${scene.number} - ${tallyText}${note ? `, note: "${note}"` : ""}`,
          },
        });
        return {
          status: "OK",
          result: `Voice direction set on ${cues.length} VOICE cue(s) in Scene ${scene.number}: ${tallyText}${pinned ? ` (${pinnedCount} pinned to ${pinned.toLowerCase()})` : " (state-aware: each re-render re-reads the speaker's character state)"}${note ? `. Directorial note: "${note}"` : ""}. Direction: ${lines.join("; ")}. Re-render the takes (sound timeline or batch) to hear it.`,
        };
      }

      case "cast_voice_actor": {
        const ch = await characterByName(projectId, String(args.characterName ?? ""));
        if (!ch) {
          const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `Character '${String(args.characterName)}' not found. Cast: ${known.map((c) => c.name).join(", ") || "none"}.` };
        }
        const artistName = String(args.artistName ?? "").trim();
        if (!artistName) {
          if (!ch.voiceArtistId) {
            return { status: "OK", result: `${ch.name} has no voice casting - lines fall back to the default voice assignment.` };
          }
          await db.character.update({ where: { id: ch.id }, data: { voiceArtistId: null } });
          await db.productionEvent.create({
            data: { projectId, actor: "DSH", type: "STATE_CHANGE", summary: `DSH cleared voice casting for ${ch.name}` },
          });
          return { status: "OK", result: `Voice casting cleared: ${ch.name} returns to the default voice assignment.` };
        }
        const artist = await db.artist.findFirst({ where: { projectId, name: { contains: artistName } } });
        if (!artist) {
          const roster = await db.artist.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `No artist named '${artistName}' on the roster. Roster: ${roster.map((a) => a.name).join(", ") || "empty"}.` };
        }
        let voiceLine = "";
        if (args.voice !== undefined) {
          const v = String(args.voice);
          if (!isVoiceId(v)) {
            return { status: "ERROR", result: `Unknown voice '${v}'. Available: tongtong, chuichui, xiaochen, jam, kazi, douji, luodo.` };
          }
          await db.artist.update({ where: { id: artist.id }, data: { voiceId: v } });
          voiceLine = ` with voice '${v}'`;
        } else if (!artist.voiceId) {
          const v = defaultVoiceFor(artist.name);
          await db.artist.update({ where: { id: artist.id }, data: { voiceId: v } });
          voiceLine = ` with voice '${v}' (auto-assigned)`;
        }
        await db.character.update({ where: { id: ch.id }, data: { voiceArtistId: artist.id } });
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "STATE_CHANGE",
            summary: `DSH cast ${artist.name} as the voice of ${ch.name}${voiceLine}`,
          },
        });
        return {
          status: "OK",
          result: `${ch.name} is now voiced by ${artist.name}${voiceLine}. Every VOICE cue for ${ch.name} renders with this artist's voice${artist.voiceId ? ` (${artist.voiceId})` : ""}; re-render the takes to hear the new performance.`,
        };
      }

      case "diff_episode_direction": {
        const ep = args.episodeNumber
          ? await db.episode.findFirst({
              where: { season: { projectId }, number: Number(args.episodeNumber) },
              orderBy: { season: { number: "asc" } },
            })
          : await latestEpisode(projectId);
        if (!ep) {
          const known = await db.episode.findMany({ where: { season: { projectId } }, select: { number: true }, orderBy: { number: "asc" } });
          return { status: "ERROR", result: known.length === 0
            ? "No episode exists yet - create one with create_episode first."
            : `No episode ${String(args.episodeNumber)} in this production. Episodes: ${known.map((e) => e.number).join(", ")}.` };
        }
        const diff = await diffEpisodeById(ep.id);
        if (!diff) return { status: "ERROR", result: `Episode ${ep.number} could not be loaded.` };

        const staleRows = diff.cues.filter((c) => c.status === "stale");
        const blockedRows = diff.cues.filter((c) => c.status === "blocked");
        const staleLines = staleRows.map((c) => {
          const was = c.taken ? `was ${c.taken.deliveryId.toLowerCase()} x${c.taken.baseSpeed.toFixed(2)} / ${c.taken.voiceId}` : "was unversioned";
          const now = c.current
            ? `now ${c.current.deliveryLabel.toLowerCase()} / ${c.current.voiceId}${c.current.variant ? ` (variant from "${c.current.variant.stateLabel}")` : ""}`
            : "now unresolved";
          return `shot ${String(c.shotNumber).padStart(3, "0")} "${c.speaker || "narration"}": moved ${c.changed.join(" + ")} (${was}; ${now})`;
        });

        let result = `Episode ${diff.number} "${diff.title}" direction diff: ${diff.total} VOICE cue(s), ${diff.fresh} fresh, ${diff.stale} stale, ${diff.unrendered} unrendered.`;
        result += staleLines.length ? ` Stale takes: ${staleLines.join("; ")}.` : " Every rendered take matches the current direction.";
        if (diff.unrendered > 0) result += ` ${diff.unrendered} cue(s) have no take yet (score them on the sound timeline or render takes first).`;
        if (blockedRows.length > 0) result += ` ${blockedRows.length} cue(s) blocked (no speakable text).`;

        if (args.reRender) {
          const outcome = await reRenderStaleTakes(ep.id, { actor: "DSH" });
          if (!outcome) return { status: "ERROR", result: `Episode ${ep.number} could not be loaded for re-render.` };
          result += ` Re-render: ${outcome.summary}.`;
          if (outcome.failed.length > 0) {
            result += ` Failed: ${outcome.failed.map((f) => `${f.cueId.slice(-6)} (${f.error})`).join("; ")}.`;
          }
        } else if (diff.stale > 0) {
          result += " Pass reRender:true to re-render just these stale takes.";
        }
        return { status: "OK", result };
      }

      case "diff_all_episodes": {
        const diffs = await diffProjectEpisodes(projectId);
        if (diffs.length === 0) {
          return { status: "ERROR", result: "No episodes exist yet - create one with create_episode first." };
        }
        const totals = diffs.reduce(
          (acc, d) => ({ total: acc.total + d.total, fresh: acc.fresh + d.fresh, stale: acc.stale + d.stale, unrendered: acc.unrendered + d.unrendered }),
          { total: 0, fresh: 0, stale: 0, unrendered: 0 },
        );
        const perEp = diffs
          .map((d) => `Ep${String(d.number).padStart(2, "0")} "${d.title}": ${d.total} cue(s), ${d.fresh} fresh, ${d.stale} stale, ${d.unrendered} unrendered`)
          .join(" | ");

        let result = `Direction diff across ${diffs.length} episode(s): ${totals.total} VOICE cue(s) total, ${totals.fresh} fresh, ${totals.stale} stale, ${totals.unrendered} unrendered. ${perEp}.`;

        if (args.reRender) {
          const limitArg = args.limit === undefined ? undefined : Number(args.limit);
          if (limitArg !== undefined && !Number.isFinite(limitArg)) {
            return { status: "ERROR", result: "limit must be a number (default 16, max 32)." };
          }
          const outcome = await reRenderStaleAcrossProject(projectId, { actor: "DSH", limit: limitArg });
          result += ` Batch re-render: ${outcome.summary}.`;
          const touched = outcome.episodes.filter((e) => e.failed > 0);
          if (touched.length > 0) {
            result += ` Failures: ${touched.map((e) => `Ep${String(e.number).padStart(2, "0")} x${e.failed}`).join(", ")}.`;
          }
        } else if (totals.stale > 0) {
          result += ` ${totals.stale} stale take(s) across the season; pass reRender:true (limit caps each batch, default 16) to re-render the affected takes only.`;
        }
        return { status: "OK", result };
      }

      case "set_state_voice_variant": {
        const ch = await characterByName(projectId, String(args.characterName ?? ""));
        if (!ch) {
          const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `Character '${String(args.characterName)}' not found. Cast: ${known.map((c) => c.name).join(", ") || "none"}.` };
        }
        const states = await db.characterState.findMany({
          where: { characterId: ch.id },
          orderBy: [{ episodeNumber: "desc" }, { createdAt: "desc" }],
        });
        if (states.length === 0) {
          return { status: "ERROR", result: `${ch.name} has no development states - record one with create_character_state first.` };
        }
        const labelArg = String(args.stateLabel ?? "").trim();
        const state = labelArg
          ? states.find((s) => s.label.toLowerCase().includes(labelArg.toLowerCase())) ?? null
          : states[0];
        if (!state) {
          return { status: "ERROR", result: `No state of ${ch.name} matches '${labelArg}'. States: ${states.map((s) => `"${s.label}"${s.episodeNumber ? ` @Ep${s.episodeNumber}` : ""}`).join(", ")}.` };
        }
        const voiceArg = String(args.voice ?? "").trim();
        if (voiceArg && !isVoiceId(voiceArg)) {
          return { status: "ERROR", result: `Unknown voice '${voiceArg}'. Available: tongtong, chuichui, xiaochen, jam, kazi, douji, luodo.` };
        }
        await db.characterState.update({ where: { id: state.id }, data: { voiceVariant: voiceArg || null } });
        const castLine = ch.voiceArtistId ? "the cast artist's voice" : "the default voice assignment";
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "STATE_CHANGE",
            summary: voiceArg
              ? `DSH bound state voice variant '${voiceArg}' to ${ch.name} "${state.label}"`
              : `DSH cleared the state voice variant on ${ch.name} "${state.label}"`,
          },
        });
        return {
          status: "OK",
          result: voiceArg
            ? `State voice variant set: while "${state.label}"${state.episodeNumber ? ` (Ep${state.episodeNumber})` : ""} is episode-effective, ${ch.name}'s lines perform with '${voiceArg}' instead of ${castLine}. Existing takes for those episodes are now stale: run diff_episode_direction (or diff_all_episodes) with reRender:true to re-render them with the variant voice.`
            : `State voice variant cleared on ${ch.name} "${state.label}": lines in that state return to ${castLine}. Existing variant-voice takes are now stale; re-render them via the direction diff.`,
        };
      }

      default:
        return { status: "ERROR", result: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { status: "ERROR", result: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function buildCompactContext(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      seasons: {
        include: {
          episodes: {
            include: {
              scenes: {
                include: {
                  environment: true,
                  shots: {
                    include: {
                      artist: { select: { name: true } },
                      lora: { select: { name: true, weight: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      characters: { include: { states: true, voiceArtist: true } },
      environments: true,
      assets: true,
      terminology: true,
      continuityEvents: true,
      loras: { include: { _count: { select: { shots: true } } } },
      artists: { include: { _count: { select: { shots: true } } } },
    },
  });
  if (!project) return null;

  return {
    project: {
      title: project.title,
      format: project.format,
      animation: project.animationType,
      style: project.visualStyle,
      artStyleTuning: {
        styleDirective: project.artStylePrompt,
        paletteTokens: project.artPalettePrompt,
        negativePrompt: project.artNegativePrompt,
      },
      language: project.originalLanguage,
      subtitles: JSON.parse(project.subtitleLanguages || "[]"),
    },
    loras: project.loras.map((l) => ({ name: l.name, trigger: l.triggerPhrase, defaultWeight: l.weight, assignedShots: l._count.shots })),
    artists: project.artists.map((a) => ({ name: a.name, role: a.role, voice: a.voiceId, assignedShots: a._count.shots })),
    structure: project.seasons.map((s) => ({
      season: s.number,
      episodes: s.episodes.map((e) => ({
        episode: e.number,
        title: e.title,
        status: e.status,
        scenes: e.scenes.map((sc) => ({
          scene: sc.number,
          title: sc.title,
          environment: sc.environment?.name,
          status: sc.status,
          params: {
            fogDensity: sc.fogDensity, lightningIntensity: sc.lightningIntensity,
            energyIntensity: sc.energyIntensity, cameraDistance: sc.cameraDistance,
            rimLightIntensity: sc.rimLightIntensity,
          },
          shots: sc.shots.map((sh) => ({
            shot: sh.number, type: sh.shotType, movement: sh.movement, lens: sh.lens,
            duration: sh.duration, status: sh.status, description: sh.description,
            dialogueLines: sh.dialogue ? JSON.parse(sh.dialogue).length : 0,
            art: Boolean(sh.artworkUrl),
            artist: sh.artist?.name ?? null,
            lora: sh.lora ? `${sh.lora.name}@${(sh.loraStrength ?? sh.lora.weight).toFixed(2)}` : null,
          })),
        })),
      })),
    })),
    characters: project.characters.map((c) => ({
      name: c.name, role: c.role, derivative: c.derivativeType,
      modelSheet: Boolean(c.modelSheetUrl),
      voiceActor: c.voiceArtist ? `${c.voiceArtist.name} (${c.voiceArtist.voiceId ?? "no voice set"})` : null,
      abilities: JSON.parse(c.abilities || "[]"),
      states: c.states.map((s) => ({ label: s.label, ep: s.episodeNumber, type: s.stateType, cultivation: s.cultivation, weapon: s.weapon, voiceVariant: s.voiceVariant ?? null })),
    })),
    environments: project.environments.map((e) => e.name),
    assets: project.assets.map((a) => `${a.category}:${a.name}(${a.status})`),
    continuity: project.continuityEvents.map((c) => `${c.entityName} ${c.kind}${c.episodeNumber ? ` @Ep${c.episodeNumber}` : ""}`),
    terminology: project.terminology.map((t) => t.term),
  };
}
