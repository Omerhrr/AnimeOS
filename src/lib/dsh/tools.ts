import { db } from "@/lib/db";
import { checkSceneContinuity, checkSceneCapabilities } from "@/lib/continuity";
import { createRenderJob } from "@/lib/engine/render";
import { serializeDialogue, type DialogueLine } from "@/lib/comic/dialogue";
import { generateShotPanelArt, generateCharacterModelSheet } from "@/lib/ai/art";

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
      derivativeType: "CLONE | AVATAR | REINCARNATION | POSSESSION | DISGUISE | TRANSFORMATION (optional — set when this character derives from another)",
      parentName: "string, source character name when derivativeType is set (optional)",
    },
  },
  {
    name: "create_character_state",
    description: "Record a character development state at a point in the story (PERMANENT development, TEMPORARY scene state, or VARIANT appearance).",
    args: {
      characterName: "string",
      label: "string, e.g. 'S02 — Foundation Established'",
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
      description: "string, narrative description — be cinematic and specific",
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
      lines: "JSON array string, e.g. [{\"speaker\":\"Lin Yue\",\"text\":\"The sword chose me.\",\"kind\":\"SPEECH\"}] — empty array clears dialogue",
    },
  },
  {
    name: "generate_panel_art",
    description: "Generate AI panel art for a shot in a comic format (MANHUA | MANHWA | MANGA). Uses the production's visual style, scene environment and each detected character's model-sheet anchor, so faces stay consistent. Slower (~15-40s) — use for hero shots.",
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
        return { status: "OK", result: `Relationship: ${from.name} —${String(args.type)}→ ${to.name}.` };
      }

      case "create_environment": {
        await findProject(projectId);
        const envName = String(args.name ?? "Unnamed Environment");
        const exists = await db.environment.findFirst({ where: { projectId, name: envName } });
        if (exists) return { status: "OK", result: `Environment '${envName}' already exists — reusing it.` };
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
        let episode = null;
        if (args.episodeNumber) {
          episode = await db.episode.findFirst({
            where: { season: { projectId }, number: Number(args.episodeNumber) },
            include: { season: true },
          });
        }
        if (!episode) episode = await latestEpisode(projectId);
        if (!episode) return { status: "ERROR", result: "No episode exists yet — create an episode first." };

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
        let scene = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            include: { episode: true },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists yet — create a scene first." };

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
        const lines = hits.map((h) => `CONFLICT: '${h.entityName}' — ${h.kind}${h.episodeNumber ? ` in Episode ${h.episodeNumber}` : ""}: ${h.description}`);
        return { status: "OK", result: lines.join("\n") };
      }

      case "check_capabilities": {
        let scene = null;
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
        const lines = caps.map((c) => `${c.present ? "✓" : "✗"} ${c.requirement} (${c.category}) — ${c.detail}`);
        return { status: "OK", result: `Capability check for Scene ${scene.number} '${scene.title}':\n${lines.join("\n")}${missing.length ? `\n→ ${missing.length} missing capability(ies): ${missing.map((m) => m.requirement).join(", ")}` : "\n→ All requirements satisfied."}` };
      }

      case "render_shot": {
        let scene = null;
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
        return { status: "OK", result: `${mode} render job queued for Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}). Job ${job.id.slice(-6)} — DSH will inspect the preview when it completes.` };
      }

      case "set_shot_dialogue": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet — create a scene first." };
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
        if (!scene) return { status: "ERROR", result: "No scene exists yet — create a scene first." };
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
            result: `Model sheet generated for ${ch.name} → ${sheet.modelSheetUrl}. Canonical visual anchor stored: "${sheet.anchor.slice(0, 160)}" — future panel art of ${ch.name} will match it.`,
          };
        } catch (err) {
          return { status: "ERROR", result: `Model sheet generation failed: ${err instanceof Error ? err.message : String(err)}` };
        }
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
      seasons: { include: { episodes: { include: { scenes: { include: { shots: true, environment: true } } } } } },
      characters: { include: { states: true } },
      environments: true,
      assets: true,
      terminology: true,
      continuityEvents: true,
    },
  });
  if (!project) return null;

  return {
    project: {
      title: project.title,
      format: project.format,
      animation: project.animationType,
      style: project.visualStyle,
      language: project.originalLanguage,
      subtitles: JSON.parse(project.subtitleLanguages || "[]"),
    },
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
          })),
        })),
      })),
    })),
    characters: project.characters.map((c) => ({
      name: c.name, role: c.role, derivative: c.derivativeType,
      modelSheet: Boolean(c.modelSheetUrl),
      abilities: JSON.parse(c.abilities || "[]"),
      states: c.states.map((s) => ({ label: s.label, ep: s.episodeNumber, type: s.stateType, cultivation: s.cultivation, weapon: s.weapon })),
    })),
    environments: project.environments.map((e) => e.name),
    assets: project.assets.map((a) => `${a.category}:${a.name}(${a.status})`),
    continuity: project.continuityEvents.map((c) => `${c.entityName} ${c.kind}${c.episodeNumber ? ` @Ep${c.episodeNumber}` : ""}`),
    terminology: project.terminology.map((t) => t.term),
  };
}
