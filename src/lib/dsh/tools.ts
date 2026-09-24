import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { checkSceneContinuity, checkSceneCapabilities } from "@/lib/continuity";
import { scanArtContinuity, checkShotArtContinuity } from "@/lib/continuity-art";
import { checkShotUniverseFacts } from "@/lib/universe-facts";
import { startRepaintRun } from "@/lib/universe-repaint";
import { isSpeakingCloseup } from "@/lib/animation/lipsync";
import { createPlan, runPlanSteps, latestPlan, getPlan, setPlanStatus, parsePlanSteps } from "@/lib/dsh/plans";
import { EPISODE_TEMPLATE_IDS, instantiateEpisodePlan, listPlanTemplates } from "@/lib/dsh/plan-templates";
import { IDENTITY_REPAINT_THRESHOLD, scoreProjectIdentity, scoreShotIdentity, scoreShotEmbedding, describeAffinity, AFFINITY_WATCH_THRESHOLD, identityDriftData } from "@/lib/identity";
import {
  createSchedule, fireScheduleNow, listSchedules, describeCadence,
} from "@/lib/scheduler";
import { studioPulse } from "@/lib/studio-pulse";
import { canonHealthData } from "@/lib/canon-health";
import { scheduleHealthData } from "@/lib/schedule-health";
import { postDailyDigest } from "@/lib/digest";
import { stagePublishPackage, platformPreset, PLATFORM_PRESETS } from "@/lib/comic/publish";
import { uploadStagedPackage, findStagedPackage } from "@/lib/comic/upload";
import { trainCharacterVoice } from "@/lib/ai/voice-clone";
import { createRenderJob } from "@/lib/engine/render";
import { normalizePose, poseChip, describePosePair } from "@/lib/animation/poses";
import { presetPosesForStateLabel } from "@/lib/animation/state-poses";
import { parseDialogue, serializeDialogue, stampStateArc, type DialogueLine } from "@/lib/comic/dialogue";
import {
  applyArcTemplate, arcTemplateByName, ARC_TEMPLATES, formatTemplateReport,
  formatTemplateShape, matchArcTemplates, parseArcTemplateSegments,
  type ArcTemplate, type TemplateSegmentReport,
} from "@/lib/comic/arc-templates";
import { generateShotPanelArt, generateCharacterModelSheet } from "@/lib/ai/art";
import { classifyStateDelivery, isDeliveryId } from "@/lib/comic/delivery";
import { isVoiceId, defaultVoiceFor } from "@/lib/comic/voice-catalog";
import { resolveAutoDelivery, resolveVoiceCast } from "@/lib/ai/voice-casting";
import { renderVariantAudition } from "@/lib/ai/audition";
import {
  diffEpisodeById, diffProjectEpisodes, reRenderStaleTakes, reRenderStaleAcrossProject,
} from "@/lib/ai/voice-diff";
import type { ArcPlaybackChip, AuditionPreview, EnsembleAuditionPreview } from "@/lib/types";

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
    description: "Record a character development state at a point in the story (PERMANENT development, TEMPORARY scene state, or VARIANT appearance). The state can carry a POSE PRESET: the start/end pair the character performs while this state is episode-effective. Without explicit poses the library preset matching the label is applied automatically (e.g. a furious state lands STANCE -> LUNGE).",
    args: {
      characterName: "string",
      label: "string, e.g. 'S02 - Foundation Established'",
      episodeNumber: "number (optional)",
      stateType: "PERMANENT | TEMPORARY | VARIANT",
      cultivation: "string (optional)",
      weapon: "string (optional)",
      clothing: "string (optional)",
      abilities: "comma-separated (optional)",
      poseStart: "string pose id (optional, e.g. STANCE - omit to let the library preset from the label apply)",
      poseEnd: "string pose id (optional, e.g. LUNGE)",
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
    description: "Add a shot to a scene. Shot types: ESTABLISHING | WIDE | MEDIUM | CLOSEUP | EXTREME_CLOSEUP | LOW_ANGLE. Movements: ORBIT | DOLLY_IN | STATIC | PAN | TRACKING | CRANE. Poses (character motion inside the frame): STANCE | WALK | LUNGE | SLASH | CAST | DRAW | BLOCK | LEAP | CROUCH | FALL | RISE | BOW | POINT - give poseStart and poseEnd and the engines interpolate the character between them across the clip.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      number: "number, shot number (omit to auto-increment)",
      description: "string, what the camera sees",
      shotType: "string",
      lens: "e.g. 24mm, 50mm, 85mm (optional)",
      movement: "string (optional)",
      poseStart: "string pose id (optional, e.g. STANCE)",
      poseEnd: "string pose id (optional, e.g. LUNGE)",
      duration: "seconds (optional, default 4)",
      lighting: "string (optional)",
    },
  },
  {
    name: "set_shot_poses",
    description: "Set or clear a shot's character motion program: a start pose and an end pose the engines interpolate across the clip (a blocking pass on the Blender stand-in, a blocking approximation with an impact beat on the MOTION engine, and when the opt-in img2vid previz slot is enabled it previews the beat as an animatic - finals stay on the designed engines). Poses: STANCE | WALK | LUNGE | SLASH | CAST | DRAW | BLOCK | LEAP | CROUCH | FALL | RISE | BOW | POINT. Pass empty strings to clear.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      poseStart: "string pose id (empty string clears)",
      poseEnd: "string pose id (empty string clears)",
    },
  },
  {
    name: "set_state_poses",
    description: "Set or clear a development state's POSE PRESET (the pair the character performs while this state is episode-effective). Shots featuring the character then inherit the pair via applyStatePoses (shots API / panel inspector) - the development state changes HOW a pose is performed. Empty strings clear the pair; the vocabulary is STANCE | WALK | LUNGE | SLASH | CAST | DRAW | BLOCK | LEAP | CROUCH | FALL | RISE | BOW | POINT.",
    args: {
      characterName: "string",
      stateLabel: "string - the state to steer (latest matching state of the character; omit for the character's newest state)",
      poseStart: "string pose id (e.g. STANCE, empty string clears)",
      poseEnd: "string pose id (e.g. LUNGE, empty string clears)",
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
    name: "check_art_continuity",
    description: "Art-aware continuity: check the ART layer against the production's canonical history. Without deep, scans the project (or one scene) for stale art (panel predates the episode-active state or the current model-sheet anchor) and featured characters without a model sheet. With deep:true and a targeted shot, a VISION model compares the shot's panel art against the character's canonical model sheet and lands an ART_DRIFT or ART_VERIFIED continuity event.",
    args: {
      sceneNumber: "number (optional, narrows the scan to one scene)",
      shotNumber: "number (optional, with sceneNumber targets one shot)",
      deep: "boolean (optional, vision art-vs-anchor check on the targeted shot - needs panel art and a model sheet)",
    },
  },
  {
    name: "add_universe_fact",
    description: "Register a canonical UNIVERSE FACT for this production: a rule of the world the art must obey (the blade glows cyan when spirit energy channels, two moons hang over the arena, the antagonist never removes his mask). Vision checks judge panel art against the active facts and confident violations feed the re-render queue.",
    args: {
      text: "string - the fact, stated visually enough to be checkable on a panel",
      category: "WORLD | CHARACTER | PROP | LOCATION | RULE (default WORLD)",
    },
  },
  {
    name: "check_universe_facts",
    description: "Universe-facts vision check: a vision model judges a shot's panel art against the production's active universe facts and returns a holds/confidence verdict per fact. Verdicts persist as FACT_HELD / FACT_BROKEN continuity events; confident violations enter the re-render queue (Continuity view) for a one-click panel re-render and re-check.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
    },
  },
  {
    name: "run_repaint_queue",
    description: "SUPERVISED AUTO RE-PAINT: start a runner over the universe-facts re-render queue (worst confidence first). Each step re-paints a flagged panel with a FACT-AWARE prompt (the flagged facts ride in as corrections), re-runs the vision check and records FIXED / STILL_BROKEN / ERROR; steps that come back still broken stop being retried automatically and wait for the director. You can pause/resume/abort between steps (repeated calls with the same action).",
    args: {
      maxItems: "number 1-8 (default 3) - how many queued panels the run visits",
    },
  },
  {
    name: "create_plan",
    description: "Land a CROSS-TURN PLAN for work that will not fit this turn (multi-episode breakdowns, long production pushes, later-day continuations): an ordered list of tool calls with a why per step. The plan starts PROPOSED and shows up in the creator's plan review panel on the DSH view - NOTHING runs until the creator approves it there (or steers it). Once approved, run_plan executes its next steps a few per call, in this turn or any later conversation.",
    args: {
      title: "string - short plan name (e.g. 'Break Episode 2 into shots')",
      goal: "string - what this plan accomplishes, in the creator's language",
      steps: "JSON array of {tool, args, why} - the ordered production tool calls (max 12); args is the tool's args object",
    },
  },
  {
    name: "run_plan",
    description: "Run the next steps of an APPROVED plan (the same execution path as a live turn; results are recorded on the plan and land as production events). A failed step parks the plan AT that step and stops the run - fix the cause and run again to retry. Call it again any time (this turn or a later conversation) to continue from where it stopped.",
    args: {
      planId: "string (optional - defaults to the most recent ACTIVE plan)",
      maxSteps: "number 1-3 (default 1) - how many steps to run this call",
    },
  },
  {
    name: "steer_plan",
    description: "Steer a cross-turn plan: approve (opens the runner after the creator's proposal review), pause (holds between steps), resume, or abort. Use approve only when the creator has clearly asked for the work to proceed.",
    args: {
      planId: "string (optional - defaults to the most recent PROPOSED/ACTIVE/PAUSED plan)",
      action: "approve | pause | resume | abort",
    },
  },
  {
    name: "create_schedule",
    description: "Register a CADENCE SCHEDULE so the studio keeps working between conversations: PLAN_RUN runs an approved plan on a cadence (the nightly-breakdown pattern: land the plan, the creator approves it once, this walks maxSteps per night until DONE - a finished plan hands the slot to the next ACTIVE one), REPAINT_QUEUE is render-queue supervision (ticks active render jobs, starts a supervised re-paint pass when the universe-facts queue is dirty and no run is live) and DAILY_DIGEST posts a digest of the last 24 hours to the creator (renders, plan steps, schedule fires, canon/identity health) as a production event the digest panel shows. Every fire lands as a production event with its outcome; the creator steers (enable/disable/run-now/delete) from the scheduler panel on the DSH view.",
    args: {
      name: "string - short schedule name (e.g. 'Nightly Episode 2 breakdown')",
      kind: "PLAN_RUN | REPAINT_QUEUE | DAILY_DIGEST",
      planTitle: "string (PLAN_RUN optional - pins a plan by title; omit to always run the latest ACTIVE plan)",
      cadence: "HOURLY | DAILY | WEEKLY (default DAILY)",
      intervalHours: "number 1-24 (HOURLY: every N hours, default 1)",
      hourUtc: "number 0-23 (DAILY/WEEKLY hour of day, default 2 = the studio night)",
      weekday: "number 0-6 (WEEKLY: 0=Sunday .. 6=Saturday, default 1=Monday)",
      maxSteps: "number 1-3 (PLAN_RUN: steps per fire, default 3)",
      webhookUrl: "string http(s) URL (DAILY_DIGEST optional - POSTs the digest JSON there when one lands)",
      digestEmail: "string email (DAILY_DIGEST optional - mails the digest via SMTP when ANIMEOS_SMTP_URL is configured)",
    },
  },
  {
    name: "steer_schedule",
    description: "Steer a cadence schedule: run (fire it right now regardless of the clock and report the outcome), enable, disable (holds fires without deleting), or delete. Defaults to the latest registered schedule by the given name fragment.",
    args: {
      name: "string (optional - name fragment; defaults to the most recent schedule)",
      action: "run | enable | disable | delete",
    },
  },
  {
    name: "land_episode_plan",
    description: "Land a PER-EPISODE PLAN TEMPLATE as a PROPOSED cross-turn plan: the built-ins beat-breakdown (opens a new story beat with a three-shot cinematography breakdown), panel-pass (fact-aware panel art for a scene's first three shots plus the art-continuity scan), render-pass (PREVIEW renders plus a voice-direction diff) and canon-audit (universe-facts vision verdict + art scan), PLUS any creator-authored variation saved in the plans panel (pass its id or exact name). The plan waits in the creator's review panel (approve once, then run_plan or a nightly schedule walks it).",
    args: {
      episodeNumber: "number - which episode the plan targets (defaults to the latest episode)",
      template: "beat-breakdown | panel-pass | render-pass | canon-audit, or a saved variation's id / exact name",
    },
  },
  {
    name: "score_panel_identity",
    description: "Identity-similarity scoring for a panel: a vision model scores how closely the panel art matches EACH featured character's canonical model sheet (0..1 per character, plus face/hair/wardrobe/weapon/palette/style aspects). Persists on the shot, lands an IDENTITY_VERIFIED or IDENTITY_DRIFT continuity event, and a worst score below the drift threshold earns a re-paint offer. Without args, scores the WORST already-scored panel (or the newest art-bearing panel when nothing is scored yet); pass limit to batch a few.",
    args: {
      sceneNumber: "number (optional, defaults to latest scene)",
      shotNumber: "number (optional, defaults to shot 1)",
      limit: "number 1-8 (optional - batch-score that many panels worst-first instead of one)",
    },
  },
  {
    name: "studio_pulse",
    description: "One honest health readout of the whole studio, instant and provider-free: the canon score (universe-fact verdict history: coverage and hold rate, plus facts suggested for rewording/retirement), identity health (vision-scored panels, drift queue, provider-free affinity tripwire, per-character drift curves over episode order), schedule health (14-day fire outcomes, overdue and erroring cadences) and queue pressure (active renders, re-render queue). Call it when the creator asks how the production is doing, before promising deadlines, or after a night of scheduled fires.",
    args: {},
  },
  {
    name: "post_digest",
    description: "Post a production DIGEST to the creator right now: the last N hours of studio activity (renders, plan steps, schedule fires, canon and identity-drift headlines, queue pressure) aggregated into one readable message and landed as a DIGEST production event the digest panel shows. The DAILY_DIGEST schedule posts one automatically on its cadence; use this when the creator asks for a catch-up or an end-of-session summary.",
    args: {
      hours: "number 1-168 (optional - the window the digest covers, default 24)",
    },
  },
  {
    name: "publish_cut",
    description: "Stage a PLATFORM PUBLISH PACKAGE for an episode on the delivery spine: the episode's latest exported cut is probed and conformance-checked against the platform preset (duration cap, canvas/aspect - a 16:9 cut honestly FAILS on a 9:16 platform, file size, frame rate, bitrate), and the package carries the metadata (title/description/tags clamped to the platform's limits), a provenance credits line, and an SRT subtitle sidecar built from the episode's dialogue timed through the cut manifest. Platforms: YOUTUBE, BILIBILI, DOUYIN, TIKTOK, STUDIO_INGEST (distributor mezzanine). Staging is local and honest: no network upload happens - the package lands as a PUBLISH event the render view's publishing panel shows, with an upload checklist and the integration status (credentials present or manual hand-off).",
    args: {
      episodeNumber: "number (optional - defaults to the latest episode)",
      platform: "YOUTUBE | BILIBILI | DOUYIN | TIKTOK | STUDIO_INGEST",
    },
  },
  {
    name: "upload_package",
    description: "Run the platform's REAL upload adapter on an episode's latest STAGED publish package (stage it with publish_cut first). Credential-gated and honest: YOUTUBE performs the resumable flow (metadata init + byte PUT), TIKTOK/DOUYIN the init-then-put flow, BILIBILI the multipart submit - each requires its env credential (ANIMEOS_YT_ACCESS_TOKEN, ANIMEOS_TIKTOK_TOKEN, ANIMEOS_DOUYIN_TOKEN, ANIMEOS_BILI_ACCESS_KEY) and reports FAILED with the missing key's name when absent; STUDIO_INGEST is an honest skip (the local package drop IS the deliverable). Every outcome - OK or FAILED - is appended to the package's PUBLISH event, so the delivery history stays auditable. Nothing uploads silently.",
    args: {
      episodeNumber: "number (optional - defaults to the latest episode)",
      platform: "YOUTUBE | BILIBILI | DOUYIN | TIKTOK | STUDIO_INGEST",
    },
  },
  {
    name: "train_voice_clone",
    description: "Train a character's VOICE CLONE through the configured cloning provider (ANIMEOS_VOICE_CLONE_URL): the character's rendered VOICE takes (up to 6, their real performed audio) are sent as reference material and the provider's trained voice id is persisted on the character - from then on their lines perform with THEIR voice wherever the provider can render it (state voice variants still deliberately override; the catalog voice stays the honest fallback when a clone render fails). Refuses honestly with no provider configured or no takes rendered yet.",
    args: {
      characterName: "string - a cast character with rendered voice takes",
    },
  },
  {
    name: "render_shot",
    description: "Queue a render job for a shot. mode PREVIEW for inspection loop, FINAL once approved. DSH will inspect the preview when it completes.",
    args: { sceneNumber: "number", shotNumber: "number", mode: "PREVIEW | FINAL (default PREVIEW)" },
  },
  {
    name: "set_shot_dialogue",
    description: "Author speech-bubble dialogue for a shot (replaces existing lines). Kinds: SPEECH (tailed bubble), THOUGHT (cloudy), SFX (stylized sound text). Speaker names should match cast characters. Max 8 lines, each ≤300 chars. Per-line direction: a line may carry delivery (NEUTRAL | EXCITED | INJURED) to pin its register and/or state (a state-label fragment of the speaker's, e.g. \"Possessed\") to force one of their development states to perform that line - its variant voice, speed/pitch hints and state-classified delivery apply to that line only.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      lines: "JSON array string, e.g. [{\"speaker\":\"Lin Yue\",\"text\":\"The sword chose me.\",\"kind\":\"SPEECH\",\"delivery\":\"EXCITED\"}] - optional per-line delivery and state; empty array clears dialogue",
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
    description: "State voice performance: bind a DIFFERENT TTS voice to one of a character's development states and/or set its speed/pitch hints, so lines spoken while that state is episode-effective perform with the variant voice and bent pace/pitch instead of the cast artist's flat read (possession, transformation, clone, corrupted, child form, exhausted...). Casting beyond delivery registers: the state changes WHO the character sounds like and HOW the variant performs; the delivery register only changes the read's punctuation shape. The result carries an AUDITION of the new performance rendered on the character's own first line, paired with the character's current stored take of that line when one exists (an A/B pair playable from the trace), so point the creator to it in your reply the same turn. Takes rendered before the change are flagged stale by the direction diff; pass voice as empty string to clear the variant, speedHint/pitchHint as null to clear a hint.",
    args: {
      characterName: "string",
      stateLabel: "string - matches a state by name (contains, case-insensitive); defaults to the character's latest episode-resolved state",
      voice: "string - TTS voice id: tongtong | chuichui | xiaochen | jam | kazi | douji | luodo (empty string clears the variant; omit to leave unchanged)",
      speedHint: "number 0.5-2.0 - multiplier on the base speed while this state is effective (e.g. 0.85 = slower, drained; null clears; omit to leave unchanged)",
      pitchHint: "number 0.5-2.0 - playback pitch factor while this state is effective (0.8 = deeper/possessed, 1.2 = higher; null clears; omit to leave unchanged)",
    },
  },
  {
    name: "set_state_arc",
    description: "State arc: force one of a character's development states across a RANGE of shots (a fight beat, a possession sequence, a corruption spread) instead of line by line. scope:'scene' (default) stamps the character's lines from shot shotFrom through shotTo (inclusive) within one scene; scope:'episode' stamps across whole scenes of one episode (sceneNumber/shotFrom start the arc, toSceneNumber/shotTo end it), so a beat that crosses scene boundaries stays one arc. Each stamped line then performs with that state's variant voice, speed/pitch hints and state-classified delivery, exactly like a per-line override but for the whole beat. Deliberately ignores episode timing: a forced beat is a directorial decision. Empty stateLabel clears the arc on the range. The result reports the episode's direction impact (the takes the arc made stale) so you can offer the re-render to the creator in the same turn.",
    args: {
      characterName: "string",
      stateLabel: "string - matches a state by name (contains, case-insensitive); empty string clears the arc on the range",
      scope: "\"scene\" (default) or \"episode\" - episode scope stamps across scene boundaries through the episode's scenes",
      episodeNumber: "number, episode scope only (defaults to the latest episode with shots)",
      sceneNumber: "number - scene scope: the scene to stamp in (defaults to the latest scene with shots); episode scope: the scene the arc STARTS in (defaults to the episode's first scene with shots)",
      shotFrom: "number - first shot number of the arc (defaults to the start scene's first shot)",
      toSceneNumber: "number, episode scope only - the scene the arc ENDS in (defaults to the episode's last scene with shots)",
      shotTo: "number - last shot number of the arc, inclusive (defaults to the end scene's last shot)",
    },
  },
  {
    name: "suggest_arc_template",
    description: "Match a beat the creator described in PROSE to the arc template registry (the built-in shapes PLUS this production's saved templates PLUS the studio library shared across productions). Call it BEFORE reaching for set_state_arc when the creator describes a SHAPE in words ('she starts normal, the possession takes hold mid-scene, then it releases') instead of naming a template: the result ranks the registry against their words and names the best match with its segment layout and why it fits. ONE-BATCH CHAIN: when the character and state are already known, pass characterName + stateLabel (plus the range args) and a strong match is APPLIED in the very same call - the result carries the match explanation AND the stamped outcome with the direction impact, so the beat lands in one batch with no second round trip. ENSEMBLE CHAIN: when the beat hits SEVERAL characters, pass characters (a JSON array of names or {name, stateLabel} objects) instead of characterName and the same one-batch chain applies the matched template to EVERY named speaker over the same range - per-speaker stateLabel overrides the shared state, unresolvable speakers are skipped and reported, and ONE Direction impact covers the whole batch. Hold the apply (omit stateLabel / characters) when the state is ambiguous: the result then hands you the apply_arc_template framing to propose instead (and names the ensemble when the prose mentions several cast members); when nothing fits it says so and points at set_state_arc or saving a custom shape from the Arc templates dialog.",
    args: {
      description: "string - the creator's own words describing the beat shape",
      characterName: "string (optional) - names the character: the result lists their states as stateLabel candidates, and with stateLabel the matched template is applied in this same call",
      characters: "string or array (optional) - JSON array of speakers ({name, stateLabel?} or plain name strings) for an ENSEMBLE chained apply: the matched template lands on every named speaker in this same call; replaces characterName",
      stateLabel: "string (optional) - with characterName (or characters) and a strong match, chain the apply into this call: the template's state segments force this state on every speaker without their own stateLabel",
      scope: "string (optional, chained apply only) - \"scene\" (default) or \"episode\", same semantics as apply_arc_template",
      episodeNumber: "number (optional, chained apply only), episode scope only (defaults to the latest episode with shots)",
      sceneNumber: "number (optional, chained apply only) - the scene to stamp in, or the start scene for episode scope",
      shotFrom: "number (optional, chained apply only) - first shot number of the arc",
      toSceneNumber: "number (optional, chained apply only), episode scope only - the scene the arc ENDS in",
      shotTo: "number (optional, chained apply only) - last shot number of the arc, inclusive",
    },
  },
  {
    name: "apply_arc_template",
    description: "Reusable arc template: paint a NAMED beat SHAPE onto a character's lines across a range in one call, instead of one uniform span. Templates (possession spread: auto 25% -> state 50% -> auto 25%; full takeover: auto 15% -> state 70% -> auto 15%; recovery arc: state 60% -> auto 40%, plus the production's own saved templates AND the studio library shared across productions) are fractions of the speaker's own lines in the range, so the same shape stretches over any beat length - the early lines stay auto, the middle performs with the chosen state (variant voice + hints), the tail releases back. The template carries the shape, you choose the state (stateLabel, matched like set_state_arc). ENSEMBLE: pass characters (a JSON array of names or {name, stateLabel} objects) instead of characterName to paint the SAME shape on SEVERAL speakers over the SAME range in one call (possessor and possessed in parallel): one combined result with a per-speaker breakdown, ONE Direction impact and a single re-render offer covering every affected take; per-speaker stateLabel overrides the shared state, and an unresolvable speaker is skipped and reported without killing the batch. Same range args and scopes as set_state_arc. The result reports the per-segment shape actually stamped plus the episode's direction impact, so offer the re-render in the same turn.",
    args: {
      characterName: "string - the single speaker (omit when passing characters)",
      characters: "string or array (optional) - JSON array of speakers ({name, stateLabel?} or plain name strings) for an ENSEMBLE apply: the same template lands on every named speaker over the same range in this one call; replaces characterName",
      template: "string - template name or id: possession spread | full takeover | recovery arc | a template saved in this production | a studio-library template shared across productions",
      stateLabel: "string - matches a state by name (contains, case-insensitive); drives the template's state segments (shared state for ensembles unless a speaker carries their own)",
      scope: "\"scene\" (default) or \"episode\" - same semantics as set_state_arc",
      episodeNumber: "number, episode scope only (defaults to the latest episode with shots)",
      sceneNumber: "number - the scene to stamp in (scene scope; defaults to the latest scene with shots) or the start scene (episode scope)",
      shotFrom: "number - first shot number of the arc (defaults to the start scene's first shot)",
      toSceneNumber: "number, episode scope only - the scene the arc ENDS in",
      shotTo: "number - last shot number of the arc, inclusive",
    },
  },
];

type ActionResult = { status: "OK" | "ERROR"; result: string; audition?: AuditionPreview; ensembleAudition?: EnsembleAuditionPreview; arcPlayback?: ArcPlaybackChip };

/** The playable-arc chip for one landed arc span (speaker + state + stamped shots). */
function arcChip(
  episode: { id: string; number: number } | null,
  speakerKey: string,
  state: string,
  shotIds: string[],
): ArcPlaybackChip | null {
  if (!episode || shotIds.length === 0) return null;
  return {
    episodeId: episode.id,
    episodeNumber: episode.number,
    label: `${speakerKey} - ${state}`,
    ensemble: false,
    spans: [{ speakerKey: speakerKey.trim().toLowerCase(), state, shotIds }],
  };
}

/** The playable-arc chip for an ENSEMBLE beat: every engaged speaker's span, merged on play. */
function ensembleArcChip(
  episode: { id: string; number: number } | null,
  spans: Array<{ name: string; stateLabel: string; shotIds: string[] }>,
): ArcPlaybackChip | null {
  if (!episode || spans.length === 0) return null;
  return {
    episodeId: episode.id,
    episodeNumber: episode.number,
    label: `ensemble beat: ${spans.map((s) => s.name).join(", ")}`,
    ensemble: true,
    spans: spans.map((s) => ({ speakerKey: s.name.trim().toLowerCase(), state: s.stateLabel, shotIds: s.shotIds })),
  };
}

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

interface ArcRangeShot { id: string; dialogue: string | null; label: string }
type ArcRangeResolution =
  | { ok: false; error: string }
  | { ok: true; rangeShots: ArcRangeShot[]; rangeDesc: string; episode: { id: string; number: number } | null };

/**
 * Shared range resolver for the arc tools (set_state_arc,
 * apply_arc_template): collects the shots a range covers under both
 * scopes and reports the owning episode (for the direction diff).
 * Every error string is tool-facing and asserted by the E2E suite -
 * do not reword.
 */
async function resolveArcRange(projectId: string, args: Record<string, unknown>): Promise<ArcRangeResolution> {
  const scope = String(args.scope ?? "scene").trim().toLowerCase() === "episode" ? "episode" : "scene";

  if (scope === "episode") {
    const eps = await db.episode.findMany({
      where: { season: { projectId } },
      orderBy: [{ season: { number: "asc" } }, { number: "desc" }],
      include: {
        scenes: {
          where: { shots: { some: {} } },
          orderBy: { number: "asc" },
          include: { shots: { orderBy: { number: "asc" } } },
        },
      },
    });
    let ep: (typeof eps)[number] | null = null;
    if (args.episodeNumber !== undefined && args.episodeNumber !== null) {
      const want = Number(args.episodeNumber);
      ep = eps.find((e) => e.number === want && e.scenes.length > 0) ?? null;
      if (!ep) {
        const withShots = eps.filter((e) => e.scenes.length > 0).map((e) => `Ep${e.number}`);
        return { ok: false, error: withShots.length
          ? `No episode ${want} with shots. Episodes with shots: ${withShots.join(", ")}.`
          : "No episode with shots exists yet - break down a scene first." };
      }
    } else {
      ep = eps.find((e) => e.scenes.length > 0) ?? null;
      if (!ep) return { ok: false, error: "No episode with shots exists yet - break down a scene first." };
    }
    const scenes = ep.scenes;
    const sceneSummary = scenes.map((s) => `Sc${s.number} (shots ${s.shots.map((x) => x.number).join(", ")})`).join(", ");
    const startScene = args.sceneNumber !== undefined && args.sceneNumber !== null
      ? scenes.find((s) => s.number === Number(args.sceneNumber)) ?? null
      : scenes[0];
    if (!startScene) {
      return { ok: false, error: `Episode ${ep.number} has no scene ${String(args.sceneNumber)} with shots. Scenes: ${sceneSummary}.` };
    }
    const endScene = args.toSceneNumber !== undefined && args.toSceneNumber !== null
      ? scenes.find((s) => s.number === Number(args.toSceneNumber)) ?? null
      : scenes[scenes.length - 1];
    if (!endScene) {
      return { ok: false, error: `Episode ${ep.number} has no scene ${String(args.toSceneNumber)} with shots. Scenes: ${sceneSummary}.` };
    }
    const from = args.shotFrom !== undefined && args.shotFrom !== null ? Number(args.shotFrom) : startScene.shots[0].number;
    const to = args.shotTo !== undefined && args.shotTo !== null ? Number(args.shotTo) : endScene.shots[endScene.shots.length - 1].number;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return { ok: false, error: `Invalid shot bounds ${String(args.shotFrom)}-${String(args.shotTo)} (must be numbers).` };
    }
    if (!startScene.shots.some((s) => s.number === from)) {
      return { ok: false, error: `Scene ${startScene.number} has no shot ${from}. Shots: ${startScene.shots.map((s) => s.number).join(", ")}.` };
    }
    if (!endScene.shots.some((s) => s.number === to)) {
      return { ok: false, error: `Scene ${endScene.number} has no shot ${to}. Shots: ${endScene.shots.map((s) => s.number).join(", ")}.` };
    }
    if (startScene.number > endScene.number || (startScene.number === endScene.number && from > to)) {
      return { ok: false, error: `Invalid range Sc${startScene.number} S${from} → Sc${endScene.number} S${to} (the arc must run forward). Scenes: ${sceneSummary}.` };
    }
    const rangeShots: ArcRangeShot[] = [];
    for (const s of scenes) {
      if (s.number < startScene.number || s.number > endScene.number) continue;
      let inScene = s.shots;
      if (s.number === startScene.number) inScene = inScene.filter((sh) => sh.number >= from);
      if (s.number === endScene.number) inScene = inScene.filter((sh) => sh.number <= to);
      for (const sh of inScene) rangeShots.push({ id: sh.id, dialogue: sh.dialogue, label: `Sc${s.number} S${sh.number}` });
    }
    return {
      ok: true,
      rangeShots,
      rangeDesc: `episode ${ep.number} (Sc${startScene.number} S${from} → Sc${endScene.number} S${to})`,
      episode: { id: ep.id, number: ep.number },
    };
  }

  const scene = await resolveScene(projectId, args.sceneNumber);
  if (!scene) {
    return { ok: false, error: "No scene with shots exists yet - break down a scene first." };
  }
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" }, select: { id: true, number: true, dialogue: true } });
  if (shots.length === 0) {
    return { ok: false, error: `Scene ${scene.number} has no shots.` };
  }
  const nums = shots.map((s) => s.number);
  const from = args.shotFrom !== undefined && args.shotFrom !== null ? Number(args.shotFrom) : nums[0];
  const to = args.shotTo !== undefined && args.shotTo !== null ? Number(args.shotTo) : nums[nums.length - 1];
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    return { ok: false, error: `Invalid shot range ${String(args.shotFrom)}-${String(args.shotTo)} (shotFrom must be <= shotTo). Scene ${scene.number} shots: ${nums.join(", ")}.` };
  }
  const range = shots.filter((s) => s.number >= from && s.number <= to);
  if (range.length === 0) {
    return { ok: false, error: `No shots ${from}-${to} in scene ${scene.number}. Shots: ${nums.join(", ")}.` };
  }
  const rangeShots: ArcRangeShot[] = range.map((sh) => ({ id: sh.id, dialogue: sh.dialogue, label: String(sh.number) }));
  const episode = await db.episode.findUnique({ where: { id: scene.episodeId }, select: { id: true, number: true } });
  return {
    ok: true,
    rangeShots,
    rangeDesc: `scene ${scene.number} shots ${from}-${to}`,
    episode: episode ? { id: episode.id, number: episode.number } : null,
  };
}

/**
 * Same-turn re-render offer for the arc tools: right after an arc
 * move, diff the owning episode and hand DSH the staleness counts
 * plus the offer framing, so the creator hears "these stems are out
 * of date, want the re-render?" in the SAME turn - not two turns later.
 */
async function directionImpactFor(episode: { id: string; number: number } | null): Promise<string> {
  if (!episode) return "";
  const diff = await diffEpisodeById(episode.id);
  if (!diff) return "";
  if (diff.stale === 0) {
    return ` Direction impact: episode ${diff.number} is clean (${diff.fresh} fresh, ${diff.unrendered} unrendered) - no rendered take moved.`;
  }
  return ` Direction impact: episode ${diff.number} now has ${diff.stale} stale take(s) (${diff.fresh} fresh, ${diff.unrendered} unrendered). Offer the re-render in the same turn: tell the creator those stems still carry the old direction and that diff_episode_direction with reRender:true re-renders exactly these ${diff.stale} stale take(s); run it yourself in this same turn when they already asked for the arc to land on the audio.`;
}

/**
 * The full template registry for a production: the built-in shapes
 * plus every saved template visible from it - the production's own
 * rows AND the studio library shared across productions (scope
 * STUDIO, projectId null). Malformed stored shapes are skipped
 * (not fatal) - they simply drop out.
 */
type TemplateSource = "built-in" | "production" | "studio";

async function arcTemplateRegistry(
  projectId: string,
): Promise<Array<{ template: ArcTemplate; source: TemplateSource; usage: number }>> {
  const registry: Array<{ template: ArcTemplate; source: TemplateSource; usage: number }> = ARC_TEMPLATES.map((t) => ({ template: t, source: "built-in" as const, usage: 0 }));
  const rows = await db.arcTemplate.findMany({
    where: { OR: [{ projectId }, { scope: "STUDIO" }] },
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    let segs: ArcTemplate["segments"] | null = null;
    try {
      segs = parseArcTemplateSegments(JSON.parse(row.segments));
    } catch {
      segs = null;
    }
    if (segs) {
      registry.push({
        template: { id: row.id, name: row.name, description: row.description ?? "", segments: segs, version: row.version },
        source: row.scope === "STUDIO" ? "studio" : "production",
        usage: row.usageCount,
      });
    }
  }
  return registry;
}

/** "(production template)" / "(studio template)" marker for tool-facing strings; saved shapes at v2+ carry their version (" (production template v2)"). */
function templateSourceTag(source: TemplateSource, version?: number): string {
  const base = source === "production" ? "production template" : source === "studio" ? "studio template" : "";
  if (!base) return "";
  return version != null && version >= 2 ? ` (${base} v${version})` : ` (${base})`;
}

/**
 * Per-scope usage counts: record ONE line-stamping application of a
 * SAVED template (production or studio row). Built-ins live in code,
 * not the DB, and are never counted. One batch = one use, so an
 * ensemble apply that lands the shape on three speakers still counts
 * once - the number answers "which shapes does this scope actually
 * apply". Returns the fresh count when it moved, null otherwise.
 */
async function recordTemplateUse(
  template: ArcTemplate,
  templateSource: TemplateSource,
): Promise<{ name: string; usageCount: number } | null> {
  if (templateSource === "built-in") return null;
  const row = await db.arcTemplate
    .update({ where: { id: template.id }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } })
    .catch(() => null);
  return row ? { name: row.name, usageCount: row.usageCount } : null;
}

/**
 * Resolve the `template` arg of apply_arc_template: built-ins first
 * (name or id, exact then partial), then this production's saved
 * templates, then the studio library shared across productions (a
 * same-named production template wins over the studio one). Every
 * error string is tool-facing and asserted by the E2E suite - do
 * not reword the "No arc template named" prefix.
 */
async function resolveTemplateForApply(
  projectId: string,
  templateArg: string,
): Promise<{ template: ArcTemplate; source: TemplateSource } | { error: string }> {
  const builtin = arcTemplateByName(templateArg);
  if (builtin) return { template: builtin, source: "built-in" };
  const rows = await db.arcTemplate.findMany({
    where: { OR: [{ projectId }, { scope: "STUDIO" }] },
    orderBy: { createdAt: "asc" },
  });
  const want = templateArg.trim().toLowerCase();
  if (want) {
    const row =
      rows.find((r) => r.scope === "PROJECT" && r.name.toLowerCase() === want) ??
      rows.find((r) => r.scope === "PROJECT" && (r.name.toLowerCase().includes(want) || want.includes(r.name.toLowerCase()))) ??
      rows.find((r) => r.scope === "STUDIO" && r.name.toLowerCase() === want) ??
      rows.find((r) => r.scope === "STUDIO" && (r.name.toLowerCase().includes(want) || want.includes(r.name.toLowerCase())));
    if (row) {
      let segs: ArcTemplate["segments"] | null = null;
      try {
        segs = parseArcTemplateSegments(JSON.parse(row.segments));
      } catch {
        segs = null;
      }
      if (!segs) {
        return { error: `Saved template '${row.name}' has a malformed shape in the database - re-save it from the Arc templates dialog.` };
      }
      return { template: { id: row.id, name: row.name, description: row.description ?? "", segments: segs, version: row.version }, source: row.scope === "STUDIO" ? "studio" : "production" };
    }
  }
  const registry = [
    ...ARC_TEMPLATES.map((t) => `"${t.name}" (${t.segments.map((s) => s.kind).join(" -> ")})`),
    ...rows.filter((r) => r.scope === "PROJECT").map((r) => `"${r.name}" (production template)`),
    ...rows.filter((r) => r.scope === "STUDIO").map((r) => `"${r.name}" (studio template)`),
  ];
  return { error: `No arc template named '${templateArg}'. Registry: ${registry.join(", ")}.` };
}

/**
 * Match a stateLabel arg against a character's development states
 * (contains, case-insensitive). Shared by apply_arc_template and
 * the one-batch chain inside suggest_arc_template. Error strings
 * are tool-facing and asserted by the E2E suite - do not reword.
 * The success carry also exposes the state's voice performance
 * (variant + hints) so the same-turn ensemble audition can render
 * the EXACT performance the stamped lines will re-render with.
 */
async function resolveCharacterState(
  ch: { id: string; name: string },
  labelArg: string,
): Promise<{
  label: string;
  stateId: string;
  voiceVariant: string | null;
  speedHint: number | null;
  pitchHint: number | null;
} | { error: string }> {
  const states = await db.characterState.findMany({
    where: { characterId: ch.id },
    orderBy: [{ episodeNumber: "desc" }, { createdAt: "desc" }],
  });
  if (states.length === 0) {
    return { error: `${ch.name} has no development states - record one with create_character_state first.` };
  }
  const state = states.find((s) => s.label.toLowerCase().includes(labelArg.toLowerCase())) ?? null;
  if (!state) {
    return { error: `No state of ${ch.name} matches '${labelArg}'. States: ${states.map((s) => `"${s.label}"${s.episodeNumber ? ` @Ep${s.episodeNumber}` : ""}`).join(", ")}.` };
  }
  return {
    label: state.label, // stamp the FULL label so the override stays exact
    stateId: state.id,
    voiceVariant: state.voiceVariant,
    speedHint: state.speedHint,
    pitchHint: state.pitchHint,
  };
}

/**
 * The apply core shared by apply_arc_template and the one-batch
 * chain inside suggest_arc_template: resolve the range, paint the
 * template shape onto the speaker's lines, persist, log the event
 * and report the per-segment outcome plus the direction impact.
 * The character, template and state are already resolved by the
 * caller; every error/fallback string is tool-facing and asserted
 * by the E2E suite - do not reword.
 */
async function applyResolvedTemplate(
  projectId: string,
  ch: { id: string; name: string },
  template: ArcTemplate,
  templateSource: TemplateSource,
  stateLabel: string,
  rangeArgs: Record<string, unknown>,
): Promise<ActionResult> {
  const range = await resolveArcRange(projectId, rangeArgs);
  if (!range.ok) return { status: "ERROR", result: range.error };
  const { rangeShots, rangeDesc } = range;

  const speakersSeen = new Set<string>();
  const parsed = rangeShots.map((shot) => {
    const lines = parseDialogue(shot.dialogue);
    for (const l of lines) if (l.speaker.trim()) speakersSeen.add(l.speaker.trim());
    return { shotId: shot.id, lines };
  });
  const touched: string[] = [];
  const stateShotIds = new Set<string>();
  const beforeStates = parsed.map((p) => p.lines.map((l) => l.state ?? null));
  const [nextShots, stamped, report] = applyArcTemplate(parsed, ch.name, template, stateLabel);
  for (let i = 0; i < rangeShots.length; i += 1) {
    if (!nextShots[i].changed) continue;
    await db.shot.update({ where: { id: rangeShots[i].id }, data: { dialogue: serializeDialogue(nextShots[i].lines) } });
    if (nextShots[i].lines.some((l, li) => (l.state ?? null) !== beforeStates[i][li])) stateShotIds.add(rangeShots[i].id);
  }
  for (let i = 0; i < rangeShots.length; i += 1) {
    if (stateShotIds.has(rangeShots[i].id)) touched.push(rangeShots[i].label);
  }
  const sourceTag = templateSourceTag(templateSource, template.version);
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "DSH",
      type: "STATE_CHANGE",
      summary: `DSH applied arc template "${template.name}"${sourceTag} (${stateLabel}) on ${ch.name} across ${rangeDesc}: ${stamped} line(s) stamped${touched.length ? ` in shot(s) ${touched.join(", ")}` : ""}`,
    },
  });
  let result = `Arc template "${template.name}"${sourceTag} on ${ch.name} with "${stateLabel}" across ${rangeDesc}: ${stamped} line(s) stamped${touched.length ? ` in shot(s) ${touched.join(", ")}` : ""}. Shape: ${formatTemplateReport(report, stateLabel)}. `;
  // per-scope usage: only an apply that stamped lines counts
  if (stamped > 0) {
    const use = await recordTemplateUse(template, templateSource);
    if (use) result += `Use recorded: "${use.name}" is now at ${use.usageCount} appl${use.usageCount === 1 ? "y" : "ies"} on its scope. `;
  }
  if (stamped === 0) {
    const speakerLines = rangeShots.reduce(
      (acc, s) => acc + parseDialogue(s.dialogue).filter((l) => l.speaker.trim().toLowerCase() === ch.name.trim().toLowerCase()).length, 0,
    );
    if (speakerLines === 0) {
      const seen = [...speakersSeen];
      result += seen.length
        ? `No ${ch.name} lines in that range (speakers present: ${seen.join(", ")}) - nothing was written; check the character name or widen the range. No take moved, so no re-render is needed.`
        : `That range has no dialogue at all - nothing was written. No take moved, so no re-render is needed.`;
      return { status: "OK", result };
    }
    result += `All ${speakerLines} ${ch.name} line(s) in the range already carry the template's shape - nothing to change. No take moved, so no re-render is needed.`;
    return { status: "OK", result };
  }
  result += "The template carries the shape; the state carries the voice: every stamped line now performs with its variant voice, hints and register.";
  // playable arc chip: the stamped span rides the trace, so the reply
  // itself can play the arc's STORED takes in story order before the
  // re-render decision
  const chip = arcChip(
    range.episode,
    ch.name,
    stateLabel,
    rangeShots.filter((s) => stateShotIds.has(s.id)).map((s) => s.id),
  );
  if (chip) result += `Arc playback attached: the trace carries a play chip for this arc (${ch.name} - "${stateLabel}") - point the creator at it to hear the STORED takes in story order before re-rendering. `;
  result += await directionImpactFor(range.episode);
  return { status: "OK", result, ...(chip ? { arcPlayback: chip } : {}) };
}

const ENSEMBLE_MAX_SPEAKERS = 6;
const ENSEMBLE_USAGE =
  'characters must be a JSON array of speaker names or {name, stateLabel} objects, e.g. [{"name":"Lin Yue"},{"name":"Ren Wu","stateLabel":"Possessor"}].';

/**
 * Parse the `characters` arg of the ensemble arc tools: a JSON array
 * (already parsed by the orchestrator, or passed as a JSON string)
 * of plain speaker names or {name, stateLabel} objects. Returns null
 * when the arg is absent and {error} when present but unusable, so a
 * malformed list never silently degrades into a single-speaker apply.
 * Error strings are tool-facing and asserted by the E2E suite - do
 * not reword.
 */
function parseEnsembleCharacters(
  raw: unknown,
): { entries: Array<{ name: string; stateLabel?: string }> } | { error: string } | null {
  if (raw === undefined || raw === null || raw === "") return null;
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return { error: ENSEMBLE_USAGE };
    }
  }
  if (!Array.isArray(list) || list.length === 0) return { error: ENSEMBLE_USAGE };
  if (list.length > ENSEMBLE_MAX_SPEAKERS) {
    return { error: `characters supports at most ${ENSEMBLE_MAX_SPEAKERS} speakers per ensemble batch (got ${list.length}).` };
  }
  const entries: Array<{ name: string; stateLabel?: string }> = [];
  for (const item of list) {
    if (typeof item === "string") {
      if (!item.trim()) return { error: "characters entries must carry a speaker name." };
      entries.push({ name: item.trim() });
      continue;
    }
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const name = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!name) return { error: "characters entries must carry a speaker name." };
      const stateLabel = typeof rec.stateLabel === "string" ? rec.stateLabel.trim() : "";
      entries.push(stateLabel ? { name, stateLabel } : { name });
      continue;
    }
    return { error: "characters entries must be speaker name strings or {name, stateLabel} objects." };
  }
  return { entries };
}

/** Per-speaker outcome of an ensemble apply, rendered as result lines. */
type EnsembleOutcome =
  | {
      kind: "applied";
      name: string;
      stateLabel: string;
      stamped: number;
      lines: number;
      report: TemplateSegmentReport[];
      /** the shots THIS speaker's state actually moved in (range order): the playback span */
      shotIds: string[];
      /** the first line THIS apply stamped into the state: the same-turn audition reads it */
      audition?: { stateId: string; voiceVariant: string | null; speedHint: number | null; pitchHint: number | null; text: string };
    }
  | { kind: "noop-lines"; name: string }
  | { kind: "noop-shape"; name: string; lines: number }
  | { kind: "skipped"; name: string; reason: string };

/**
 * The same-turn ENSEMBLE audition core: render ONE read per engaged
 * speaker of the exact line the apply stamped into the state, with
 * that state's own voice performance (variant or cast voice, register
 * and speed/pitch hints). A render failure skips that speaker's row
 * and is reported - it never sinks the apply or the other rows.
 */
async function renderEnsembleAudition(
  projectId: string,
  rows: Array<{ name: string; stateLabel: string; stateId: string; voiceVariant: string | null; speedHint: number | null; pitchHint: number | null; text: string }>,
): Promise<EnsembleAuditionPreview> {
  const speakers: AuditionPreview[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    try {
      const voiceId = row.voiceVariant && isVoiceId(row.voiceVariant)
        ? row.voiceVariant
        : (await resolveVoiceCast(row.name, projectId)).voiceId;
      const preview = await renderVariantAudition({
        projectId,
        characterName: row.name,
        stateId: row.stateId,
        stateLabel: row.stateLabel,
        voiceId,
        deliveryId: classifyStateDelivery(row.stateLabel) ?? "NEUTRAL",
        speedHint: row.speedHint,
        pitchHint: row.pitchHint,
        text: row.text,
        filePrefix: "arc",
      });
      if (preview) speakers.push(preview);
      else skipped.push(`- ${row.name}: audition render failed (the arc is saved)`);
    } catch {
      skipped.push(`- ${row.name}: audition render failed (the arc is saved)`);
    }
  }
  return { speakers, skipped };
}

/**
 * The ENSEMBLE apply core: paint ONE template shape onto SEVERAL
 * speakers over the SAME range in a single call. Speakers resolve
 * and validate one by one (an unknown name or unmatched state skips
 * that speaker instead of killing the batch), the shape is painted
 * sequentially onto the shared range buffer, shots persist once,
 * ONE event logs the batch, and the direction impact (with its
 * single re-render offer) covers every speaker together. Every
 * error/fallback string is tool-facing and asserted by the E2E
 * suite - do not reword.
 */
async function applyEnsembleTemplate(
  projectId: string,
  entries: Array<{ name: string; stateLabel?: string }>,
  template: ArcTemplate,
  templateSource: TemplateSource,
  topStateLabel: string,
  rangeArgs: Record<string, unknown>,
): Promise<ActionResult> {
  const range = await resolveArcRange(projectId, rangeArgs);
  if (!range.ok) return { status: "ERROR", result: range.error };
  const { rangeShots, rangeDesc } = range;
  // ONE batch id for the whole call: every speaker's stamped lines
  // carry it, so the derived spans read as ONE parallel beat across
  // the ruler lanes and the panel inspector
  const batchId = `ens-${randomUUID()}`;

  // dedupe speakers case-insensitively, first occurrence wins
  const seen = new Set<string>();
  const speakers = entries.filter((e) => {
    const key = e.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const parsed = rangeShots.map((shot) => ({ shotId: shot.id, lines: parseDialogue(shot.dialogue) }));
  const changedShotIds = new Set<string>(); // any rewrite (state or batch refresh)
  const stateShotIds = new Set<string>(); // state actually moved here
  const outcomes: EnsembleOutcome[] = [];
  let totalStamped = 0;

  for (const speaker of speakers) {
    const ch = await characterByName(projectId, speaker.name);
    if (!ch) {
      outcomes.push({ kind: "skipped", name: speaker.name, reason: `Character '${speaker.name}' not found.` });
      continue;
    }
    const labelArg = (speaker.stateLabel ?? topStateLabel).trim();
    if (!labelArg) {
      outcomes.push({ kind: "skipped", name: ch.name, reason: "no stateLabel - pass a shared stateLabel or a per-speaker stateLabel entry." });
      continue;
    }
    const stateRes = await resolveCharacterState(ch, labelArg);
    if ("error" in stateRes) {
      outcomes.push({ kind: "skipped", name: ch.name, reason: stateRes.error });
      continue;
    }
    const beforeStates = parsed.map((p) => p.lines.map((l) => l.state ?? null));
    const [next, stamped, report] = applyArcTemplate(parsed, ch.name, template, stateRes.label, { batchId });
    const speakerLines = report.reduce((acc, r) => acc + r.lines, 0);
    // the shots THIS speaker's state actually moved in (range order):
    // the playable arc chip's span for this speaker
    const speakerStateShotIds: string[] = [];
    for (let i = 0; i < next.length; i += 1) {
      if (!next[i].changed) continue;
      changedShotIds.add(next[i].shotId);
      parsed[i] = { shotId: next[i].shotId, lines: next[i].lines };
      if (next[i].lines.some((l, li) => (l.state ?? null) !== beforeStates[i][li])) {
        stateShotIds.add(next[i].shotId);
        speakerStateShotIds.push(next[i].shotId);
      }
    }
    totalStamped += stamped;
    if (speakerLines === 0) outcomes.push({ kind: "noop-lines", name: ch.name });
    else if (stamped === 0) outcomes.push({ kind: "noop-shape", name: ch.name, lines: speakerLines });
    else {
      // the first line THIS apply stamped into the state (range order):
      // the same-turn audition reads exactly the line the new
      // direction will re-render, so its stored take (if any) is the
      // honest A side
      let auditionText: string | null = null;
      outer: for (let i = 0; i < next.length; i += 1) {
        for (let li = 0; li < next[i].lines.length; li += 1) {
          const l = next[i].lines[li];
          if ((l.state ?? null) !== stateRes.label) continue;
          if (beforeStates[i][li] === stateRes.label) continue;
          if (l.speaker.trim().toLowerCase() !== ch.name.trim().toLowerCase()) continue;
          if (!l.text.trim()) continue;
          auditionText = l.text.trim();
          break outer;
        }
      }
      outcomes.push({
        kind: "applied",
        name: ch.name,
        stateLabel: stateRes.label,
        stamped,
        lines: speakerLines,
        report,
        shotIds: speakerStateShotIds,
        ...(auditionText
          ? { audition: { stateId: stateRes.stateId, voiceVariant: stateRes.voiceVariant, speedHint: stateRes.speedHint, pitchHint: stateRes.pitchHint, text: auditionText } }
          : {}),
      });
    }
  }

  if (outcomes.length > 0 && outcomes.every((o) => o.kind === "skipped")) {
    const reasons = outcomes.map((o) => (o.kind === "skipped" ? `- ${o.name}: ${o.reason}` : "")).filter(Boolean).join(" ");
    return { status: "ERROR", result: `Ensemble apply resolved no speaker. ${reasons}` };
  }

  const touched: string[] = [];
  for (let i = 0; i < rangeShots.length; i += 1) {
    if (stateShotIds.has(rangeShots[i].id)) touched.push(rangeShots[i].label);
  }
  for (let i = 0; i < rangeShots.length; i += 1) {
    if (!changedShotIds.has(rangeShots[i].id)) continue;
    await db.shot.update({ where: { id: rangeShots[i].id }, data: { dialogue: serializeDialogue(parsed[i].lines) } });
  }

  const sourceTag = templateSourceTag(templateSource, template.version);
  const engaged = outcomes.filter((o) => o.kind !== "skipped").map((o) => o.name);
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "DSH",
      type: "STATE_CHANGE",
      summary: `DSH applied arc template "${template.name}"${sourceTag} (ensemble: ${engaged.join(", ") || "no lines moved"}) across ${rangeDesc}: ${totalStamped} line(s) stamped${touched.length ? ` in shot(s) ${touched.join(", ")}` : ""}`,
    },
  });

  let result = `Ensemble arc template "${template.name}"${sourceTag} with ${engaged.length} speaker${engaged.length === 1 ? "" : "s"} across ${rangeDesc}: ${totalStamped} line(s) stamped${touched.length ? ` in shot(s) ${touched.join(", ")}` : ""}. `;
  for (const o of outcomes) {
    if (o.kind === "applied") result += `- ${o.name} with "${o.stateLabel}": ${o.stamped} line(s) stamped of ${o.lines}. Shape: ${formatTemplateReport(o.report, o.stateLabel)}. `;
    else if (o.kind === "noop-lines") result += `- ${o.name}: no lines in that range - nothing written. `;
    else if (o.kind === "noop-shape") result += `- ${o.name}: all ${o.lines} line(s) already carry the template's shape - nothing to change. `;
    else result += `- ${o.name}: SKIPPED (${o.reason}) `;
  }
  if (totalStamped === 0) {
    result += "No take moved, so no re-render is needed.";
    return { status: "OK", result };
  }
  // per-scope usage: ONE batch = ONE use, and only because lines moved
  const use = await recordTemplateUse(template, templateSource);
  if (use) result += `Use recorded: "${use.name}" is now at ${use.usageCount} appl${use.usageCount === 1 ? "y" : "ies"} on its scope. `;
  // same-turn ENSEMBLE audition: one rendered read per engaged speaker
  // of the exact line the apply stamped into the state (A/B against
  // the stored take when one exists), attached to THIS call's result
  const auditionRows = outcomes.flatMap((o) =>
    o.kind === "applied" && o.audition
      ? [{ name: o.name, stateLabel: o.stateLabel, stateId: o.audition.stateId, voiceVariant: o.audition.voiceVariant, speedHint: o.audition.speedHint, pitchHint: o.audition.pitchHint, text: o.audition.text }]
      : [],
  );
  const ensembleAudition = auditionRows.length > 0 ? await renderEnsembleAudition(projectId, auditionRows) : null;
  if (ensembleAudition) {
    if (ensembleAudition.speakers.length > 0) {
      const names = ensembleAudition.speakers.map((s) => `${s.characterName} "${s.stateLabel}"`).join(", ");
      result += `Ensemble audition attached to this call: ${ensembleAudition.speakers.length} proposed read${ensembleAudition.speakers.length === 1 ? "" : "s"} (${names}) - tell the creator to play the rows (or the sequence) in this trace to hear the new beat before re-rendering. `;
      if (ensembleAudition.skipped.length > 0) result += `Audition rows skipped: ${ensembleAudition.skipped.join(" ")}. `;
    } else {
      result += `Ensemble audition failed to render (the arc is saved) - audition the states from the casting board instead. ${ensembleAudition.skipped.join(" ")}`;
    }
  }
  result += "The template carries the shape; the state carries the voice: every stamped line now performs with its variant voice, hints and register.";
  // playable arc chip: the ENSEMBLE beat rides the trace as one chip;
  // playing it merges every engaged speaker's span into one story-order queue
  const chip = ensembleArcChip(
    range.episode,
    outcomes.flatMap((o) => (o.kind === "applied" && o.shotIds.length > 0 ? [{ name: o.name, stateLabel: o.stateLabel, shotIds: o.shotIds }] : [])),
  );
  if (chip) result += `Arc playback attached: the trace carries a play chip for the whole beat (${chip.label}) - point the creator at it to hear the STORED takes of every speaker in story order before re-rendering. `;
  result += await directionImpactFor(range.episode);
  return {
    status: "OK",
    result,
    ...(ensembleAudition && ensembleAudition.speakers.length > 0 ? { ensembleAudition } : {}),
    ...(chip ? { arcPlayback: chip } : {}),
  };
}

export async function executeTool(projectId: string, name: string, args: Record<string, unknown>): Promise<ActionResult> {
  try {
    switch (name) {
      case "get_production_context": {
        const ctx = await buildCompactContext(projectId);
        return { status: "OK", result: JSON.stringify(ctx) };
      }

      case "create_plan": {
        const result = await createPlan(projectId, {
          title: String(args.title ?? ""),
          goal: String(args.goal ?? ""),
          steps: args.steps,
          source: "DSH",
        });
        if (!result.ok) return { status: "ERROR", result: result.error };
        const p = result.plan;
        return { status: "OK", result: `Plan '${p.title}' landed (id ${p.id.slice(-6)}, ${p.total} step(s)): ${p.steps.map((s, i) => `${i + 1}. ${s.tool}${s.why ? ` - ${s.why}` : ""}`).join(" | ")}. It is PROPOSED and waits in the creator's plan review panel (DSH view) - nothing runs until it is approved there. When it is ACTIVE, run_plan executes its next steps (1-3 per call) and reports each result.` };
      }

      case "run_plan": {
        let planId = String(args.planId ?? "");
        if (!planId) {
          const active = await latestPlan(projectId, ["ACTIVE"]);
          if (!active) return { status: "ERROR", result: "No ACTIVE plan to run - land one with create_plan and get it approved first." };
          planId = active.id;
        }
        const maxSteps = Number(args.maxSteps ?? 1);
        const result = await runPlanSteps(planId, Number.isFinite(maxSteps) ? maxSteps : 1);
        if (!result.ok || !result.report) return { status: "ERROR", result: result.error ?? "run failed" };
        const p = result.plan;
        return { status: "OK", result: `Plan run (${p ? `${p.done}/${p.total} steps done${p.failed ? `, ${p.failed} failed` : ""}, status ${p.status}` : "progress above"}):\n${result.report}` };
      }

      case "steer_plan": {
        const action = String(args.action ?? "").toLowerCase();
        if (!["approve", "pause", "resume", "abort"].includes(action)) {
          return { status: "ERROR", result: "action must be approve | pause | resume | abort" };
        }
        let planId = String(args.planId ?? "");
        if (!planId) {
          const pick = await latestPlan(projectId, action === "approve" ? ["PROPOSED"] : ["ACTIVE", "PAUSED"]);
          if (!pick) return { status: "ERROR", result: action === "approve" ? "No PROPOSED plan to approve." : "No ACTIVE or PAUSED plan to steer." };
          planId = pick.id;
        }
        const status = action === "approve" ? "ACTIVE" : action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "ABORTED";
        const result = await setPlanStatus(planId, status as "ACTIVE" | "PAUSED" | "ABORTED");
        if (!result.ok) return { status: "ERROR", result: result.error ?? "steer failed" };
        const p = await getPlan(planId);
        return { status: "OK", result: `Plan '${p?.title ?? planId.slice(-6)}' is now ${p?.status ?? status} (${p ? `${p.done}/${p.total} steps done` : ""}).${action === "approve" ? " run_plan executes its next steps when you (or the creator) call for it." : ""}` };
      }

      case "create_schedule": {
        const kind = String(args.kind ?? "PLAN_RUN").toUpperCase();
        let planId: string | null = null;
        if (kind === "PLAN_RUN" && args.planTitle) {
          const title = String(args.planTitle).trim();
          const plan = await db.dshPlan.findFirst({
            where: { projectId, title: { contains: title } },
            orderBy: { createdAt: "desc" as const },
          });
          if (!plan) return { status: "ERROR", result: `No plan titled like '${title}' exists - land one with create_plan first, or omit planTitle to always run the latest ACTIVE plan.` };
          planId = plan.id;
        }
        const result = await createSchedule(projectId, {
          name: String(args.name ?? ""),
          kind,
          planId,
          cadence: String(args.cadence ?? "DAILY"),
          intervalHours: Number(args.intervalHours ?? 1),
          hourUtc: Number(args.hourUtc ?? 2),
          weekday: Number(args.weekday ?? 1),
          maxSteps: Number(args.maxSteps ?? 3),
          webhookUrl: args.webhookUrl === undefined ? undefined : String(args.webhookUrl ?? ""),
          digestEmail: args.digestEmail === undefined ? undefined : String(args.digestEmail ?? ""),
        });
        if (!result.ok) return { status: "ERROR", result: result.error };
        const s = result.schedule;
        const kindNote = s.kind === "PLAN_RUN" ? "runs an approved plan" : s.kind === "DAILY_DIGEST" ? "posts the daily digest to the creator" : "render-queue supervision";
        const deliveryNote = s.kind === "DAILY_DIGEST" && (s.webhookUrl || s.digestEmail)
          ? ` Delivery: ${s.webhookUrl ? "webhook" : ""}${s.webhookUrl && s.digestEmail ? " + " : ""}${s.digestEmail ? "email" : ""}.`
          : "";
        return { status: "OK", result: `Schedule '${s.name}' registered (${kindNote}, ${s.cadenceLabel}${s.kind === "PLAN_RUN" ? `, maxSteps ${s.maxSteps}` : ""}).${deliveryNote} First fire: ${s.nextRunAt ?? "on the next tick"}. Every fire lands as a production event; the creator steers it from the scheduler panel (enable/disable/run now/delete).` };
      }

      case "steer_schedule": {
        const action = String(args.action ?? "").toLowerCase();
        if (!["run", "enable", "disable", "delete"].includes(action)) {
          return { status: "ERROR", result: "action must be run | enable | disable | delete" };
        }
        const name = String(args.name ?? "").trim();
        const schedules = await listSchedules(projectId);
        if (schedules.length === 0) return { status: "ERROR", result: "This production has no schedules - register one with create_schedule." };
        const pick = name
          ? [...schedules].reverse().find((s) => s.name.toLowerCase().includes(name.toLowerCase()))
          : schedules[schedules.length - 1];
        if (!pick) return { status: "ERROR", result: `No schedule named like '${name}'. Registered: ${schedules.map((s) => s.name).join(", ")}.` };
        if (action === "delete") {
          await db.studioSchedule.delete({ where: { id: pick.id } });
          return { status: "OK", result: `Schedule '${pick.name}' deleted.` };
        }
        if (action === "enable" || action === "disable") {
          await db.studioSchedule.update({ where: { id: pick.id }, data: { enabled: action === "enable" } });
          return { status: "OK", result: `Schedule '${pick.name}' ${action === "enable" ? "enabled - fires resume on its cadence" : "disabled - holds until enabled again"}.` };
        }
        const fired = await fireScheduleNow(pick.id);
        if (!fired.ok) return { status: "ERROR", result: fired.error ?? "the fire failed" };
        return { status: "OK", result: `Schedule '${pick.name}' fired now: ${fired.status} - ${fired.report}` };
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
        const label = String(args.label ?? "New state");
        let poseStart = args.poseStart ? normalizePose(args.poseStart) : null;
        let poseEnd = args.poseEnd ? normalizePose(args.poseEnd) : null;
        if (args.poseStart && !poseStart) {
          return { status: "ERROR", result: `Unknown pose '${args.poseStart}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        if (args.poseEnd && !poseEnd) {
          return { status: "ERROR", result: `Unknown pose '${args.poseEnd}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        let presetNote: string | null = null;
        if (!poseStart && !poseEnd) {
          // no explicit pair: the state's body language resolves from the
          // label library (a furious state lands STANCE -> LUNGE, ...)
          const preset = presetPosesForStateLabel(label);
          if (preset) {
            poseStart = preset.poseStart;
            poseEnd = preset.poseEnd;
            presetNote = preset.note;
          }
        }
        await db.characterState.create({
          data: {
            characterId: ch.id,
            label,
            episodeNumber: args.episodeNumber ? Number(args.episodeNumber) : null,
            stateType: String(args.stateType ?? "PERMANENT"),
            cultivation: args.cultivation ? String(args.cultivation) : null,
            weapon: args.weapon ? String(args.weapon) : null,
            clothing: args.clothing ? String(args.clothing) : null,
            abilities: args.abilities ? JSON.stringify(String(args.abilities).split(",").map((s) => s.trim()).filter(Boolean)) : null,
            poseStart,
            poseEnd,
          },
        });
        const chip = poseChip(poseStart, poseEnd);
        const poseTxt = chip
          ? ` Body language preset: ${chip}${presetNote ? ` (${presetNote})` : ""} - shots featuring ${ch.name} inherit it via applyStatePoses.`
          : "";
        return { status: "OK", result: `State '${label}' recorded for ${ch.name}.${poseTxt}` };
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

        const poseStart = args.poseStart ? normalizePose(args.poseStart) : null;
        const poseEnd = args.poseEnd ? normalizePose(args.poseEnd) : null;
        if (args.poseStart && !poseStart) {
          return { status: "ERROR", result: `Unknown pose '${args.poseStart}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        if (args.poseEnd && !poseEnd) {
          return { status: "ERROR", result: `Unknown pose '${args.poseEnd}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        const maxNum = await db.shot.aggregate({ where: { sceneId: scene.id }, _max: { number: true } });
        const shot = await db.shot.create({
          data: {
            sceneId: scene.id,
            number: args.number ? Number(args.number) : (maxNum._max.number ?? 0) + 1,
            description: String(args.description ?? "Untitled shot"),
            shotType: String(args.shotType ?? "MEDIUM"),
            lens: args.lens ? String(args.lens) : null,
            movement: args.movement ? String(args.movement) : null,
            poseStart,
            poseEnd,
            duration: args.duration ? Number(args.duration) : 4,
            lighting: args.lighting ? String(args.lighting) : null,
          },
        });
        const poseTxt = poseChip(shot.poseStart, shot.poseEnd);
        return { status: "OK", result: `Shot ${String(shot.number).padStart(3, "0")} (${shot.shotType}, ${shot.lens ?? "default lens"}, ${shot.movement ?? "static"}${poseTxt ? `, poses ${poseTxt}` : ""}, ${shot.duration}s) added to Scene ${scene.number}.` };
      }

      case "set_shot_poses": {
        const scene = await resolveScene(projectId, args.sceneNumber);
        if (!scene) return { status: "ERROR", result: "No scene exists yet - create a scene first." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const rawStart = String(args.poseStart ?? "").trim();
        const rawEnd = String(args.poseEnd ?? "").trim();
        const poseStart = rawStart ? normalizePose(rawStart) : null;
        const poseEnd = rawEnd ? normalizePose(rawEnd) : null;
        if (rawStart && !poseStart) {
          return { status: "ERROR", result: `Unknown pose '${rawStart}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        if (rawEnd && !poseEnd) {
          return { status: "ERROR", result: `Unknown pose '${rawEnd}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        const updated = await db.shot.update({
          where: { id: shot.id },
          data: { poseStart, poseEnd },
        });
        const chip = poseChip(updated.poseStart, updated.poseEnd);
        if (!chip) {
          return { status: "OK", result: `Shot ${String(updated.number).padStart(3, "0")} pose program cleared - the shot renders with camera grammar only.` };
        }
        return { status: "OK", result: `Shot ${String(updated.number).padStart(3, "0")} will perform ${describePosePair(updated.poseStart, updated.poseEnd)}. Every render engine now interpolates these poses across the clip.` };
      }

      case "set_state_poses": {
        const ch = await characterByName(projectId, String(args.characterName ?? ""));
        if (!ch) return { status: "ERROR", result: `Character '${String(args.characterName)}' not found.` };
        const states = await db.characterState.findMany({ where: { characterId: ch.id }, orderBy: [{ episodeNumber: "desc" }, { createdAt: "desc" }] });
        if (states.length === 0) {
          return { status: "ERROR", result: `${ch.name} has no development states yet - create one first.` };
        }
        const labelArg = String(args.stateLabel ?? "").trim().toLowerCase();
        const state = labelArg
          ? states.find((s) => s.label.toLowerCase().includes(labelArg)) ?? null
          : states[0];
        if (!state) {
          return { status: "ERROR", result: `No state of ${ch.name} matches '${String(args.stateLabel)}'. Known states: ${states.map((s) => s.label).join("; ")}.` };
        }
        const rawStart = String(args.poseStart ?? "").trim();
        const rawEnd = String(args.poseEnd ?? "").trim();
        const poseStart = rawStart ? normalizePose(rawStart) : null;
        const poseEnd = rawEnd ? normalizePose(rawEnd) : null;
        if (rawStart && !poseStart) {
          return { status: "ERROR", result: `Unknown pose '${rawStart}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        if (rawEnd && !poseEnd) {
          return { status: "ERROR", result: `Unknown pose '${rawEnd}'. Valid poses: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT.` };
        }
        await db.characterState.update({ where: { id: state.id }, data: { poseStart, poseEnd } });
        const chip = poseChip(poseStart, poseEnd);
        if (!chip) {
          return { status: "OK", result: `Pose preset cleared on ${ch.name} "${state.label}" - the state no longer steers shot body language.` };
        }
        return { status: "OK", result: `Pose preset set on ${ch.name} "${state.label}": the character now performs ${describePosePair(poseStart, poseEnd)} while this state is episode-effective. Land it on shots via applyStatePoses (shots API) or the panel inspector's Use-state-poses button.` };
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

      case "check_art_continuity": {
        const deep = args.deep === true;
        let sceneNumber: number | null = args.sceneNumber ? Number(args.sceneNumber) : null;
        if (deep && !sceneNumber && args.shotNumber) {
          // target the latest scene when only a shot number is given
          const latest = await latestScene(projectId);
          sceneNumber = latest?.number ?? null;
        }
        if (deep) {
          const scene = await resolveScene(projectId, sceneNumber);
          if (!scene) return { status: "ERROR", result: "No scene exists - nothing to check." };
          const shot = await db.shot.findFirst({
            where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
          });
          if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
          const result = await checkShotArtContinuity(shot.id);
          if (!result.ok) return { status: "ERROR", result: `Art check failed for Shot ${String(shot.number).padStart(3, "0")}: ${result.error}` };
          const v = result.verdict;
          const driftTxt = v.drift.length > 0
            ? ` Drift: ${v.drift.map((d) => `${d.aspect} (${d.note})`).join("; ")}.`
            : "";
          return {
            status: "OK",
            result: `Art continuity ${result.eventKind} on Shot ${String(shot.number).padStart(3, "0")} (vs ${v.characterName}'s model sheet): ${v.summary}.${driftTxt} The verdict is persisted as a continuity event and visible in the Continuity view.`,
          };
        }
        const scan = await scanArtContinuity(projectId);
        const scoped = sceneNumber
          ? scan.shots.filter((s) => s.sceneNumber === sceneNumber)
          : scan.shots;
        const stale = scoped.filter((s) => s.items.some((i) => i.kind === "stale-state" || i.kind === "stale-anchor"));
        const missing = scoped.filter((s) => s.items.some((i) => i.kind === "anchor-missing"));
        if (stale.length === 0 && missing.length === 0) {
          return { status: "OK", result: `Art continuity clean across ${scoped.length} shot(s): no art predates its state or anchor, and every featured character has a model sheet. Run deep:true on a hero shot for a vision-level art-vs-anchor comparison.` };
        }
        const lines = [
          ...stale.slice(0, 8).map((s) => {
            const items = s.items.filter((i) => i.kind !== "anchor-missing").map((i) => i.note).join("; ");
            return `STALE ART ${s.ref}: ${items}`;
          }),
          ...missing.slice(0, 6).map((s) => {
            const who = [...new Set(s.items.filter((i) => i.kind === "anchor-missing").map((i) => i.characterName))].join(", ");
            return `ANCHOR MISSING ${s.ref}: ${who} - generate_model_sheet before more art features them`;
          }),
        ];
        return {
          status: "OK",
          result: `Art continuity scan (${sceneNumber ? `Scene ${sceneNumber}` : "whole project"}): ${stale.length} stale-art shot(s), ${missing.length} shot(s) with missing anchors.\n${lines.join("\n")}${lines.length < stale.length + missing.length ? "\n... and more - regenerate panel art or model sheets to clear these." : ""}`,
        };
      }

      case "add_universe_fact": {
        const text = String(args.text ?? "").trim();
        if (!text) return { status: "ERROR", result: "text required - state the fact so a panel can be checked against it (e.g. 'her blade glows cyan when spirit energy channels')." };
        const cats = ["WORLD", "CHARACTER", "PROP", "LOCATION", "RULE"];
        const category = cats.includes(String(args.category ?? "")) ? String(args.category) : "WORLD";
        const fact = await db.universeFact.create({ data: { projectId, text: text.slice(0, 400), category, source: "DSH" } });
        const activeCount = await db.universeFact.count({ where: { projectId, active: true } });
        return { status: "OK", result: `Universe fact registered (${category}, ${activeCount} active): "${fact.text}" Vision checks now judge every panel against it - run check_universe_facts on a hero shot to audit the art, and confident violations feed the re-render queue in the Continuity view.` };
      }

      case "check_universe_facts": {
        const scene = await resolveScene(projectId, args.sceneNumber ? Number(args.sceneNumber) : null);
        if (!scene) return { status: "ERROR", result: "No scene exists - nothing to check." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const result = await checkShotUniverseFacts(shot.id);
        if (!result.ok) return { status: "ERROR", result: `Universe check failed for Shot ${String(shot.number).padStart(3, "0")}: ${result.error}` };
        const r = result.result;
        const lines = r.verdicts.map((v) => `${v.holds ? "HELD" : "BROKEN"} (conf ${v.confidence.toFixed(2)}) ${v.text}${v.note ? ` - ${v.note}` : ""}`);
        const queueNote = r.broken > 0
          ? ` ${r.broken} confident violation(s) entered the re-render queue - offer a panel re-render (generate_panel_art) or run the supervised runner (run_repaint_queue) and re-check the art after.`
          : "";
        return { status: "OK", result: `Universe-facts check on Shot ${String(shot.number).padStart(3, "0")} (${r.shotRef}): ${r.summary}\n${lines.join("\n")}${queueNote}` };
      }

      case "run_repaint_queue": {
        const maxItems = Number(args.maxItems ?? 3);
        const result = await startRepaintRun(projectId, Number.isFinite(maxItems) ? maxItems : 3);
        if (!result.ok) return { status: "ERROR", result: result.error };
        const run = result.run;
        return { status: "OK", result: `Supervised re-paint run ${run.id.slice(-6)} started: ${run.total} queued panel(s) worst-first. Each step re-paints with the flagged facts as prompt corrections, re-runs the vision check, and records FIXED / STILL_BROKEN / ERROR - still-broken panels stop being retried and wait for the director. Progress lands as REPAINT steps in this run's trace and the Continuity view shows the live log; call run_repaint_queue again only to start ANOTHER pass after this one finishes.` };
      }

      case "land_episode_plan": {
        const templateId = String(args.template ?? "").trim();
        if (!templateId) {
          const saved = await listPlanTemplates(projectId);
          return { status: "ERROR", result: `template is required - built-ins: ${EPISODE_TEMPLATE_IDS.join(", ")}${saved.length ? `, saved variations: ${saved.map((t) => `'${t.name}'`).join(", ")}` : " (none authored yet)"}` };
        }
        let episodeId: string | null = null;
        if (args.episodeNumber) {
          const ep = await db.episode.findFirst({
            where: { season: { projectId }, number: Number(args.episodeNumber) },
            orderBy: { season: { number: "asc" } },
          });
          if (!ep) return { status: "ERROR", result: `No episode ${String(args.episodeNumber)} in this production - create it first.` };
          episodeId = ep.id;
        } else {
          const ep = await db.episode.findFirst({
            where: { season: { projectId } },
            orderBy: [{ season: { number: "asc" } }, { number: "desc" }],
          });
          if (!ep) return { status: "ERROR", result: "No episode exists yet - create one with create_episode first." };
          episodeId = ep.id;
        }
        const result = await instantiateEpisodePlan(projectId, episodeId, templateId);
        if (!result.ok) return { status: "ERROR", result: result.error ?? "template landing failed" };
        return { status: "OK", result: `Per-episode plan '${result.planTitle}' landed from the '${templateId}' template (id ${result.planId?.slice(-6)}). It is PROPOSED in the creator's plan review panel - approve it once, then run_plan walks it a few steps per call, or a nightly PLAN_RUN schedule (create_schedule) walks it while the studio sleeps.` };
      }

      case "score_panel_identity": {
        // batch mode: worst existing scores first, then never-scored panels
        if (args.limit !== undefined && args.limit !== null && String(args.limit) !== "") {
          const limit = Number(args.limit);
          const result = await scoreProjectIdentity(projectId, Number.isFinite(limit) ? limit : 4);
          if (result.scored.length === 0 && result.errors.length === 0) {
            return { status: "ERROR", result: "No art-bearing panel with an anchored (sheeted) cast to score - generate panel art and model sheets first." };
          }
          const lines = result.scored.map((s) => `${s.ref}: ${s.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(s.verdict.worst * 100).toFixed(0)}%`);
          const errLines = result.errors.map((e) => `${e.ref}: ${e.error}`);
          return { status: "OK", result: `Identity pass scored ${result.scored.length} panel(s), worst-first:\n${lines.join("\n")}${errLines.length ? `\nSkipped:\n${errLines.join("\n")}` : ""}\nA worst below ${(IDENTITY_REPAINT_THRESHOLD * 100).toFixed(0)}% lands an IDENTITY_DRIFT event and earns a re-paint offer (generate_panel_art), then score again to confirm the fix.` };
        }
        let shotId: string | null = null;
        if (args.sceneNumber || args.shotNumber) {
          const scene = await resolveScene(projectId, args.sceneNumber ? Number(args.sceneNumber) : null);
          if (!scene) return { status: "ERROR", result: "No scene exists - nothing to score." };
          const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 } });
          if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
          shotId = shot.id;
        } else {
          // no target given: the worst already-scored panel, else the newest art-bearing panel
          const worst = await db.identityScore.findFirst({
            where: { projectId },
            orderBy: { worst: "asc" as const },
          });
          if (worst) {
            shotId = worst.shotId;
          } else {
            const newest = await db.shot.findFirst({
              where: { scene: { episode: { season: { projectId } } }, artworkUrl: { not: null } },
              orderBy: { artGeneratedAt: "desc" as const },
            });
            if (!newest) return { status: "ERROR", result: "No art-bearing panel exists - generate panel art first (generate_panel_art)." };
            shotId = newest.id;
          }
        }
        const result = await scoreShotIdentity(shotId);
        if (!result.ok) return { status: "ERROR", result: `Identity scoring failed: ${result.error}` };
        const s = result.scored;
        const aspect = s.verdict.entries[0];
        const aspectLine = aspect && Object.keys(aspect.aspects).length > 0
          ? ` Top entry's aspects: ${Object.entries(aspect.aspects).map(([k, v]) => `${k} ${(Number(v) * 100).toFixed(0)}%`).join(", ")}.`
          : "";
        // the provider-free affinity tripwire rides the vision score (instant, local math)
        const aff = await scoreShotEmbedding(shotId).catch(() => null);
        const affLine = aff?.ok
          ? ` Provider-free affinity: ${aff.scored.verdict.entries.map(describeAffinity).join("; ")}${aff.scored.verdict.worst < AFFINITY_WATCH_THRESHOLD ? " - WATCH: far from the sheet, check this panel" : ""} (tripwire only: the vision score stays the authority).`
          : "";
        const drifted = s.verdict.worst < IDENTITY_REPAINT_THRESHOLD;
        return { status: "OK", result: `Identity score for ${s.ref}: ${s.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(s.verdict.worst * 100).toFixed(0)}%${s.verdict.note ? ` (${s.verdict.note})` : ""}.${aspectLine}${affLine} ${drifted ? `That is below the ${(IDENTITY_REPAINT_THRESHOLD * 100).toFixed(0)}% identity bar - the panel earned an IDENTITY_DRIFT event and a re-paint offer: regenerate the panel (generate_panel_art) and score again to confirm.` : "An IDENTITY_VERIFIED event recorded the panel."}` };
      }

      case "studio_pulse": {
        const pulse = await studioPulse(projectId);
        return { status: "OK", result: pulse.lines.join("\n") };
      }

      case "post_digest": {
        const hours = Number(args.hours ?? 24);
        const result = await postDailyDigest(projectId, Number.isFinite(hours) ? hours : 24);
        if (!result.ok) return { status: "ERROR", result: result.error ?? "the digest failed to build" };
        return { status: "OK", result: `Digest posted to the creator (last ${result.digest.windowHours}h, ${result.digest.events} production event(s)):\n${result.digest.lines.join("\n")}\nThe digest panel on this view keeps the history; a DAILY_DIGEST schedule (create_schedule) posts one automatically on its cadence.` };
      }

      case "publish_cut": {
        const platformId = String(args.platform ?? "").trim();
        if (!platformPreset(platformId)) {
          return { status: "ERROR", result: `Unknown platform "${platformId || "(none)"}" - available: ${PLATFORM_PRESETS.map((p) => p.id).join(", ")}.` };
        }
        const ep = args.episodeNumber
          ? await db.episode.findFirst({
              where: { season: { projectId }, number: Number(args.episodeNumber) },
              orderBy: { season: { number: "asc" } },
            })
          : await latestEpisode(projectId);
        if (!ep) return { status: "ERROR", result: "No episode exists yet - create one with create_episode first." };
        const staged = await stagePublishPackage(ep.id, platformId);
        if (!staged.ok) return { status: "ERROR", result: `Publish staging failed for EP${String(ep.number).padStart(2, "0")}: ${staged.error}` };
        const pkg = staged.pkg;
        const checks = pkg.conformance.map((c) => `${c.ok ? "OK" : "FAIL"} ${c.label} (${c.detail})`).join(", ");
        const subtitle = pkg.subtitle.format === "none"
          ? pkg.subtitle.note
          : `${pkg.subtitle.format.toUpperCase()} with ${pkg.subtitle.cues} cue(s) (${pkg.subtitle.filename ?? "no file"})`;
        return { status: "OK", result: `Publish package staged for EP${String(ep.number).padStart(2, "0")} -> ${pkg.platformLabel}: ${pkg.ready ? "READY" : "NOT READY"} (${pkg.conformance.filter((c) => c.ok).length}/${pkg.conformance.length} conformance checks: ${checks}). Package: title "${pkg.title}", ${subtitle}. ${pkg.integration.detail} Staging is local and honest - no network upload happened; the package landed as a PUBLISH event the render view's publishing panel shows, with the full checklist and metadata. Upload it with upload_package when the credentials are set.` };
      }

      case "upload_package": {
        const platformId = String(args.platform ?? "").trim();
        if (!platformPreset(platformId)) {
          return { status: "ERROR", result: `Unknown platform "${platformId || "(none)"}" - available: ${PLATFORM_PRESETS.map((p) => p.id).join(", ")}.` };
        }
        const ep = args.episodeNumber
          ? await db.episode.findFirst({
              where: { season: { projectId }, number: Number(args.episodeNumber) },
              orderBy: { season: { number: "asc" } },
            })
          : await latestEpisode(projectId);
        if (!ep) return { status: "ERROR", result: "No episode exists yet - create one with create_episode first." };
        const eventId = await findStagedPackage(projectId, ep.number, platformId);
        if (!eventId) {
          return { status: "ERROR", result: `No staged publish package found for EP${String(ep.number).padStart(2, "0")} on ${platformId} - stage one with publish_cut first.` };
        }
        const result = await uploadStagedPackage(eventId);
        if (!result.ok) return { status: "ERROR", result: result.error ?? "the upload could not run" };
        const o = result.outcome;
        return { status: o.ok ? "OK" : "ERROR", result: o.kind === "skip"
          ? `${o.detail} The package's PUBLISH event recorded the skip.`
          : `${o.ok ? "Upload OK" : "Upload FAILED"} for EP${String(ep.number).padStart(2, "0")} -> ${platformId}: ${o.detail} The outcome is appended to the package's PUBLISH event (the delivery history stays auditable), and the render view's publishing panel shows it.` };
      }

      case "train_voice_clone": {
        const name = String(args.characterName ?? "").trim();
        if (!name) return { status: "ERROR", result: "characterName is required." };
        const character = await db.character.findFirst({ where: { projectId, name } });
        if (!character) {
          const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `No character named "${name}" in this production. Cast: ${known.map((c) => c.name).join(", ") || "none"}.` };
        }
        const result = await trainCharacterVoice(character.id);
        if (!result.ok) return { status: "ERROR", result: `Voice clone training failed for ${name}: ${result.error}` };
        const r = result.result;
        return { status: "OK", result: `Voice clone trained for ${r.characterName}: voice ${r.voiceId} from ${r.takes} reference take(s) (${(r.totalMs / 1000).toFixed(1)}s of performed audio). Their lines now perform with their own voice wherever the clone provider can render it - a state voice variant still deliberately overrides, and the catalog voice stays the honest fallback when a clone render fails. Their existing takes are NOT re-rendered automatically: run diff_episode_direction or diff_all_episodes and pass reRender:true to move takes onto the new voice.` };
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
        const poseTxt = poseChip(shot.poseStart, shot.poseEnd);
        const engineNote = job.driver === "BLENDER" || job.driver === "BLENDER_LOCAL"
          ? poseTxt
            ? `headless Blender sequence worker (Cycles) with the articulated stand-in (face + hands) performing ${poseTxt}`
            : "headless Blender sequence worker (Cycles)"
          : job.driver === "IMG2VID"
            ? job.providerTaskId
              ? "the opt-in img2vid previz slot (a motion animatic, not a final render)"
              : "the previz interpolation provider (a motion animatic, not a final render)"
            : job.driver === "MOTION"
              ? poseTxt
                ? "built-in MOTION engine (poses play as a blocking approximation)"
                : "built-in MOTION engine (camera grammar over key art)"
              : "simulator";
        const lip = isSpeakingCloseup(shot.shotType, shot.dialogue)
          ? job.driver === "BLENDER" || job.driver === "BLENDER_LOCAL"
            ? " The mouth lip-syncs the SPEECH lines (viseme program on the stand-in)."
            : job.driver === "IMG2VID"
              ? " The previz provider received the SPEECH lines as lip-sync direction (previz pass only)."
              : " The MOTION engine lands a blocking speech beat per line."
          : "";
        return { status: "OK", result: `${mode} render job queued for Shot ${String(shot.number).padStart(3, "0")} (Scene ${scene.number}). Job ${job.id.slice(-6)} on the ${engineNote} - it will finish as a playable animated clip following the shot's camera grammar (${shot.movement ?? "STATIC"}, ${shot.shotType}${poseTxt ? `, character ${poseTxt}` : ""}); DSH will inspect the preview when it completes.${lip}` };
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
          // per-line direction: delivery register and/or a forced state
          ...(isDeliveryId(l.delivery) ? { delivery: l.delivery } : {}),
          ...(typeof l.state === "string" && l.state.trim() ? { state: l.state.trim().slice(0, 80) } : {}),
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
          result += ` Export pre-flight: with ${diff.stale} stale take(s) the webtoon slice export will stop at its gate and name each one before downloading - propose this re-render to the creator in the same turn so they export fresh stems.`;
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
          result += " Export pre-flight: episodes with stale takes will stop the webtoon slice export at its gate until they are re-rendered - propose the batch re-render to the creator in the same turn.";
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
        const clampHint = (v: number) => Math.round(Math.min(2, Math.max(0.5, v)) * 100) / 100;
        const data: Record<string, unknown> = {};
        const changes: string[] = [];
        const voiceArg = String(args.voice ?? "").trim();
        if (args.voice !== undefined) {
          if (voiceArg && !isVoiceId(voiceArg)) {
            return { status: "ERROR", result: `Unknown voice '${voiceArg}'. Available: tongtong, chuichui, xiaochen, jam, kazi, douji, luodo.` };
          }
          data.voiceVariant = voiceArg || null;
          changes.push(voiceArg ? `variant voice '${voiceArg}'` : "variant voice cleared");
        }
        if (args.speedHint !== undefined) {
          if (args.speedHint === null) {
            data.speedHint = null;
            changes.push("speed hint cleared");
          } else {
            const n = Number(args.speedHint);
            if (!Number.isFinite(n)) return { status: "ERROR", result: `speedHint must be a number 0.5-2.0 or null (got '${String(args.speedHint)}')` };
            data.speedHint = clampHint(n);
            changes.push(`speed hint x${data.speedHint}`);
          }
        }
        if (args.pitchHint !== undefined) {
          if (args.pitchHint === null) {
            data.pitchHint = null;
            changes.push("pitch hint cleared");
          } else {
            const n = Number(args.pitchHint);
            if (!Number.isFinite(n)) return { status: "ERROR", result: `pitchHint must be a number 0.5-2.0 or null (got '${String(args.pitchHint)}')` };
            data.pitchHint = clampHint(n);
            changes.push(`pitch hint x${data.pitchHint}`);
          }
        }
        if (changes.length === 0) {
          return { status: "ERROR", result: "Nothing to change: pass voice, speedHint and/or pitchHint (null clears a value)." };
        }
        await db.characterState.update({ where: { id: state.id }, data });
        const castLine = ch.voiceArtistId ? "the cast artist's voice" : "the default voice assignment";
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "STATE_CHANGE",
            summary: `DSH set state voice performance on ${ch.name} "${state.label}": ${changes.join(", ")}`,
          },
        });
        // same-turn audition proposal: hear the NEW performance before
        // committing to a re-render (bind stays successful on failure)
        const effVoice = data.voiceVariant !== undefined ? (data.voiceVariant as string | null) : state.voiceVariant;
        const effSpeed = data.speedHint !== undefined ? (data.speedHint as number | null) : state.speedHint;
        const effPitch = data.pitchHint !== undefined ? (data.pitchHint as number | null) : state.pitchHint;
        const auditionVoiceId = effVoice && isVoiceId(effVoice) ? effVoice : (await resolveVoiceCast(ch.name, projectId)).voiceId;
        const audition = await renderVariantAudition({
          projectId,
          characterName: ch.name,
          stateId: state.id,
          stateLabel: state.label,
          voiceId: auditionVoiceId,
          deliveryId: classifyStateDelivery(state.label) ?? "NEUTRAL",
          speedHint: effSpeed,
          pitchHint: effPitch,
        });
        let result = `State voice performance set on ${ch.name} "${state.label}"${state.episodeNumber ? ` (Ep${state.episodeNumber})` : ""}: ${changes.join(", ")}. While that state is episode-effective, lines perform with ${data.voiceVariant ? `'${String(data.voiceVariant)}' instead of ${castLine}` : castLine}${data.speedHint != null ? ` at x${String(data.speedHint)} pace` : ""}${data.pitchHint != null ? ` and pitch x${String(data.pitchHint)}` : ""}. `;
        if (audition) {
          if (audition.current) {
            result += `Audition attached to this call as an A/B pair: the current stored take (${audition.current.voiceId ?? "unknown voice"}) and the NEW performance (${audition.voiceId}${audition.speed !== 1 ? ` at x${audition.speed} pace` : ""}${audition.pitch !== 1 ? ` with pitch x${audition.pitch}` : ""}) of the same line - tell the creator to play both in this trace and compare before re-rendering. `;
          } else {
            result += `Audition attached to this call: "${audition.text}" performed by ${audition.voiceId}${audition.speed !== 1 ? ` at x${audition.speed} pace` : ""}${audition.pitch !== 1 ? ` with pitch x${audition.pitch}` : ""} - tell the creator to play the preview in this trace to hear the new performance before re-rendering. `;
          }
        } else {
          result += "Audition preview failed to render (the binding is saved) - audition the state from the casting board instead. ";
        }
        result += "Existing takes for those episodes are now stale: run diff_episode_direction (or diff_all_episodes) with reRender:true to re-render them with the new performance.";
        return {
          status: "OK",
          result,
          ...(audition ? { audition } : {}),
        };
      }

      case "set_state_arc": {
        const ch = await characterByName(projectId, String(args.characterName ?? ""));
        if (!ch) {
          const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `Character '${String(args.characterName)}' not found. Cast: ${known.map((c) => c.name).join(", ") || "none"}.` };
        }
        const labelArg = String(args.stateLabel ?? "").trim();
        let stateLabel: string | null = null;
        if (labelArg) {
          const states = await db.characterState.findMany({
            where: { characterId: ch.id },
            orderBy: [{ episodeNumber: "desc" }, { createdAt: "desc" }],
          });
          if (states.length === 0) {
            return { status: "ERROR", result: `${ch.name} has no development states - record one with create_character_state first.` };
          }
          const state = states.find((s) => s.label.toLowerCase().includes(labelArg.toLowerCase())) ?? null;
          if (!state) {
            return { status: "ERROR", result: `No state of ${ch.name} matches '${labelArg}'. States: ${states.map((s) => `"${s.label}"${s.episodeNumber ? ` @Ep${s.episodeNumber}` : ""}`).join(", ")}. Pass an empty stateLabel to clear an arc.` };
          }
          stateLabel = state.label; // stamp the FULL label so the override stays exact
        }

        const range = await resolveArcRange(projectId, args);
        if (!range.ok) return { status: "ERROR", result: range.error };
        const { rangeShots, rangeDesc } = range;

        let stamped = 0;
        const touched: string[] = [];
        const stampedShotIds: string[] = [];
        const speakersSeen = new Set<string>();
        for (const shot of rangeShots) {
          const lines = parseDialogue(shot.dialogue);
          for (const l of lines) if (l.speaker.trim()) speakersSeen.add(l.speaker.trim());
          const [next, n] = stampStateArc(lines, ch.name, 0, stateLabel);
          if (n > 0) {
            await db.shot.update({ where: { id: shot.id }, data: { dialogue: serializeDialogue(next) } });
            stamped += n;
            touched.push(shot.label);
            stampedShotIds.push(shot.id);
          }
        }
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "STATE_CHANGE",
            summary: `DSH ${stateLabel ? `set state arc "${stateLabel}"` : "cleared state arc"} on ${ch.name} across ${rangeDesc}: ${stamped} line(s) stamped${touched.length ? ` in shot(s) ${touched.join(", ")}` : ""}`,
          },
        });
        let result = `State arc ${stateLabel ? `"${stateLabel}"` : "cleared"} on ${ch.name} across ${rangeDesc}: ${stamped} line(s) stamped${touched.length ? ` in shot(s) ${touched.join(", ")}` : ""}. `;
        if (stamped === 0) {
          const speakerLines = rangeShots.reduce(
            (acc, s) => acc + parseDialogue(s.dialogue).filter((l) => l.speaker.trim().toLowerCase() === ch.name.trim().toLowerCase()).length, 0,
          );
          if (speakerLines === 0) {
            const seen = [...speakersSeen];
            result += seen.length
              ? `No ${ch.name} lines in that range (speakers present: ${seen.join(", ")}) - nothing was written; check the character name or widen the range. No take moved, so no re-render is needed.`
              : `That range has no dialogue at all - nothing was written. No take moved, so no re-render is needed.`;
            return { status: "OK", result };
          }
          result += `All ${speakerLines} ${ch.name} line(s) in the range already carry ${stateLabel ? `"${stateLabel}"` : "no override"} - nothing to change. No take moved, so no re-render is needed.`;
          return { status: "OK", result };
        }
        result += "Each stamped line now performs with the state's variant voice, hints and register.";
        // playable arc chip: the stamped span rides the trace
        const chip = stateLabel ? arcChip(range.episode, ch.name, stateLabel, stampedShotIds) : null;
        if (chip) result += `Arc playback attached: the trace carries a play chip for this arc (${ch.name} - "${stateLabel}") - point the creator at it to hear the STORED takes in story order before re-rendering. `;
        result += await directionImpactFor(range.episode);
        return { status: "OK", result, ...(chip ? { arcPlayback: chip } : {}) };
      }

      case "suggest_arc_template": {
        const prose = String(args.description ?? "").trim();
        if (!prose) {
          return { status: "ERROR", result: "Pass description: the creator's own words describing the beat shape (e.g. 'she starts normal, the possession takes hold mid-scene, then it releases')." };
        }
        const registry = await arcTemplateRegistry(projectId);
        const matches = matchArcTemplates(prose, registry.map((r) => r.template));
        const sourceOf = new Map(registry.map((r) => [r.template.id, r.source]));
        const tag = (t: ArcTemplate) => `"${t.name}"${templateSourceTag(sourceOf.get(t.id) ?? "built-in", t.version)}`;
        const best = matches[0];
        const strongMatch = Boolean(best && best.score >= 3);
        const chName = String(args.characterName ?? "").trim();
        const labelArg = String(args.stateLabel ?? "").trim();
        const ensemble = parseEnsembleCharacters(args.characters);
        if (ensemble && "error" in ensemble) return { status: "ERROR", result: ensemble.error };
        const ensembleChain = strongMatch && ensemble !== null;
        const singleChain = strongMatch && Boolean(chName) && Boolean(labelArg);
        const wantChain = ensembleChain || singleChain;
        let result = "";
        let chained = false;
        // the chained apply's same-turn ensemble audition rides the suggest
        // result too, so the creator hears the beat in the same trace
        let chainedEnsembleAudition: EnsembleAuditionPreview | undefined;
        // ...and so does the chained apply's playable arc chip
        let chainedArcPlayback: ArcPlaybackChip | undefined;
        if (best && strongMatch) {
          result += `Template match: ${tag(best.template)} scores ${best.score} on the creator's description. Shape: ${formatTemplateShape(best.template.segments)}. `;
          if (best.template.description) result += `${best.template.description} `;
          result += `Why: ${best.reasons.join("; ") || "closest name"}. `;
          if (ensembleChain) {
            // ONE-BATCH ENSEMBLE CHAIN: the matched template lands on
            // every named speaker in this very call
            const applyRes = await applyEnsembleTemplate(projectId, ensemble.entries, best.template, sourceOf.get(best.template.id) ?? "built-in", labelArg, args);
            if (applyRes.status === "ERROR") {
              return { status: "ERROR", result: `Template match: ${tag(best.template)} (shape: ${formatTemplateShape(best.template.segments)}), but the chained apply failed: ${applyRes.result}` };
            }
            chained = true;
            chainedEnsembleAudition = applyRes.ensembleAudition;
            chainedArcPlayback = applyRes.arcPlayback;
            result += `Applied in this batch: ${applyRes.result} `;
          } else if (singleChain) {
            // ONE-BATCH CHAIN: the matched template is applied in this very call
            const ch = await characterByName(projectId, chName);
            if (!ch) {
              const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
              return { status: "ERROR", result: `Template match: ${tag(best.template)} (shape: ${formatTemplateShape(best.template.segments)}), but the chained apply failed: Character '${chName}' not found. Cast: ${known.map((c) => c.name).join(", ") || "none"}.` };
            }
            const stateRes = await resolveCharacterState(ch, labelArg);
            if ("error" in stateRes) {
              return { status: "ERROR", result: `Template match: ${tag(best.template)} (shape: ${formatTemplateShape(best.template.segments)}), but the chained apply failed: ${stateRes.error}` };
            }
            const applyRes = await applyResolvedTemplate(projectId, ch, best.template, sourceOf.get(best.template.id) ?? "built-in", stateRes.label, args);
            if (applyRes.status === "ERROR") {
              return { status: "ERROR", result: `Template match: ${tag(best.template)} (shape: ${formatTemplateShape(best.template.segments)}), but the chained apply failed: ${applyRes.result}` };
            }
            chained = true;
            chainedArcPlayback = applyRes.arcPlayback;
            result += `Applied in this batch: ${applyRes.result} `;
          } else {
            result += `Propose it in this turn: apply_arc_template with template:'${best.template.name}' plus characterName, stateLabel and the range - or pass stateLabel here to apply it in this same batch. `;
            // ensemble reading: the prose names several cast members, so
            // point DSH at the one-batch characters arg before proposing
            const cast = await db.character.findMany({ where: { projectId }, select: { name: true } });
            const proseLC = prose.toLowerCase();
            const mentioned = cast
              .map((c) => c.name)
              .filter((n) => n.toLowerCase() !== chName.toLowerCase() && proseLC.includes(n.toLowerCase()));
            const names = chName ? [chName, ...mentioned] : mentioned;
            if (names.length >= 2) {
              const example = names
                .slice(0, 2)
                .map((n, i) => `{name:"${n}"${i === 1 ? ',stateLabel:"..."' : ""}}`)
                .join(",");
              result += `Ensemble beat: the description names ${names.join(" and ")}. Pass characters:[${example}] (+ the range args) to apply the shape to every named speaker in ONE batch - per-speaker stateLabel overrides the shared state. `;
            }
          }
          const runnerUp = matches[1];
          if (runnerUp && runnerUp.score > 0) result += `Runner-up: ${tag(runnerUp.template)} (score ${runnerUp.score}). `;
        } else {
          result += "No arc template strongly matches that description. ";
          if (best && best.score > 0) {
            result += `Closest: ${tag(best.template)} (score ${best.score}): ${formatTemplateShape(best.template.segments)}. `;
          }
        }
        result += `Registry: ${registry.map((r) => `${tag(r.template)} (${formatTemplateShape(r.template.segments)}${r.source !== "built-in" ? `, ${r.usage === 1 ? "used once" : `used ${r.usage}×`}` : ""})`).join(", ")}. `;
        if (chName && !chained) {
          const ch = await characterByName(projectId, chName);
          if (ch) {
            const states = await db.characterState.findMany({
              where: { characterId: ch.id },
              orderBy: [{ episodeNumber: "desc" }, { createdAt: "desc" }],
            });
            result += states.length
              ? `State candidates for ${ch.name}: ${states.map((s) => `"${s.label}"${s.episodeNumber ? ` @Ep${s.episodeNumber}` : ""}`).join(", ")}. `
              : `${ch.name} has no development states yet - record one with create_character_state before applying any arc. `;
          } else {
            const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
            result += `Character '${chName}' not found - cast: ${known.map((c) => c.name).join(", ") || "none"}. `;
          }
        }
        if (chained) {
          result += "The beat landed in one batch: put the re-render offer from the Direction impact above in your reply so the stale stems are handled in this same turn.";
        } else {
          result += best && best.score >= 3
            ? "No template truly fits? set_state_arc stamps a uniform span, and the creator can save a custom shape from the Arc templates dialog - saved templates join this registry for every future beat."
            : "For a beat this specific: stamp a uniform span with set_state_arc, or save a custom shape from the Arc templates dialog - saved templates join this registry for every future beat and apply in one call by name.";
        }
        return {
          status: "OK",
          result,
          ...(chainedEnsembleAudition ? { ensembleAudition: chainedEnsembleAudition } : {}),
          ...(chainedArcPlayback ? { arcPlayback: chainedArcPlayback } : {}),
        };
      }

      case "apply_arc_template": {
        const ensemble = parseEnsembleCharacters(args.characters);
        if (ensemble && "error" in ensemble) return { status: "ERROR", result: ensemble.error };
        const resolved = await resolveTemplateForApply(projectId, String(args.template ?? ""));
        if ("error" in resolved) return { status: "ERROR", result: resolved.error };
        const labelArg = String(args.stateLabel ?? "").trim();
        if (ensemble) {
          if (!labelArg && ensemble.entries.every((e) => !e.stateLabel)) {
            return { status: "ERROR", result: `Ensemble applies need a state: pass a shared stateLabel or per-speaker stateLabel entries ({name, stateLabel}) - the template's state segments (${resolved.template.segments.filter((s) => s.kind === "state").length} of ${resolved.template.segments.length} in "${resolved.template.name}") force the matched state's variant voice, hints and register.` };
          }
          return applyEnsembleTemplate(projectId, ensemble.entries, resolved.template, resolved.source, labelArg, args);
        }
        const ch = await characterByName(projectId, String(args.characterName ?? ""));
        if (!ch) {
          const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
          return { status: "ERROR", result: `Character '${String(args.characterName)}' not found. Cast: ${known.map((c) => c.name).join(", ") || "none"}.` };
        }
        if (!labelArg) {
          return { status: "ERROR", result: `Arc templates need a stateLabel: the template's state segments (${resolved.template.segments.filter((s) => s.kind === "state").length} of ${resolved.template.segments.length} in "${resolved.template.name}") force the matched state's variant voice, hints and register.` };
        }
        const stateRes = await resolveCharacterState(ch, labelArg);
        if ("error" in stateRes) return { status: "ERROR", result: stateRes.error };
        return applyResolvedTemplate(projectId, ch, resolved.template, resolved.source, stateRes.label, args);
      }

      default:
        return { status: "ERROR", result: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { status: "ERROR", result: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function buildCompactContext(projectId: string) {
  const [project, canon, scheduleHealth, drift, savedTemplates, latestDigestEvent, latestPublishEvent] = await Promise.all([
    db.project.findUnique({
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
      universeFacts: true,
      dshPlans: { orderBy: { createdAt: "desc" as const }, take: 8 },
      studioSchedules: { orderBy: { createdAt: "asc" as const }, take: 30 },
      identityScores: {
        orderBy: { worst: "asc" as const },
        take: 8,
        include: { shot: { include: { scene: { include: { episode: { include: { season: true } } } } } } },
      },
      panelEmbeddings: { orderBy: { worst: "asc" as const }, take: 5, include: { shot: { include: { scene: { include: { episode: { include: { season: true } } } } } } } },
      loras: { include: { _count: { select: { shots: true } } } },
      artists: { include: { _count: { select: { shots: true } } } },
    },
  }),
    canonHealthData(projectId).catch(() => null),
    scheduleHealthData(projectId).catch(() => null),
    identityDriftData(projectId).catch(() => null),
    listPlanTemplates(projectId).catch(() => [] as Awaited<ReturnType<typeof listPlanTemplates>>),
    db.productionEvent.findFirst({ where: { projectId, type: "DIGEST" }, orderBy: { createdAt: "desc" as const } }).catch(() => null),
    db.productionEvent.findFirst({ where: { projectId, type: "PUBLISH" }, orderBy: { createdAt: "desc" as const } }).catch(() => null),
  ]);
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
      cloneVoice: c.cloneVoiceId ?? null,
      abilities: JSON.parse(c.abilities || "[]"),
      states: c.states.map((s) => ({ label: s.label, ep: s.episodeNumber, type: s.stateType, cultivation: s.cultivation, weapon: s.weapon, voiceVariant: s.voiceVariant ?? null, speedHint: s.speedHint ?? null, pitchHint: s.pitchHint ?? null, poses: poseChip(s.poseStart, s.poseEnd) ?? null })),
    })),
    environments: project.environments.map((e) => e.name),
    assets: project.assets.map((a) => `${a.category}:${a.name}(${a.status})`),
    continuity: project.continuityEvents.map((c) => `${c.entityName} ${c.kind}${c.episodeNumber ? ` @Ep${c.episodeNumber}` : ""}`),
    universeFacts: project.universeFacts.map((f) => `${f.category}: ${f.text}${f.active ? "" : " (inactive)"}`),
    terminology: project.terminology.map((t) => t.term),
    plans: project.dshPlans.map((p) => {
      const steps = parsePlanSteps(p.steps);
      return `${p.status} '${p.title}' (${steps.filter((s) => s.status === "DONE").length}/${steps.length} done) - ${p.goal}`;
    }),
    schedules: project.studioSchedules.map((s) => {
      const when = s.nextRunAt ? `next fire ${s.nextRunAt.toISOString().slice(0, 16)}Z` : "unscheduled";
      const last = s.lastStatus ? `, last ${s.lastStatus}: ${String(s.lastReport ?? "").slice(0, 90)}` : ", never fired";
      return `${s.enabled ? "ON" : "OFF"} '${s.name}' (${s.kind}, ${describeCadence(s.cadence, s.intervalHours, s.hourUtc, s.weekday)}, ${when}${last})`;
    }),
    identity: project.identityScores.map((row) => {
      const sh = row.shot;
      const ref = `E${sh.scene.episode.number} Sc${sh.scene.number} S${String(sh.number).padStart(3, "0")}`;
      return `${ref} worst ${(row.worst * 100).toFixed(0)}% (${row.castSize} cast, ${row.scoredAt.toISOString().slice(0, 10)})${row.worst < IDENTITY_REPAINT_THRESHOLD ? " DRIFT" : ""}`;
    }),
    affinity: project.panelEmbeddings.map((row) => {
      const sh = row.shot;
      const ref = `E${sh.scene.episode.number} Sc${sh.scene.number} S${String(sh.number).padStart(3, "0")}`;
      return `${ref} ${(row.worst * 100).toFixed(0)}% provider-free affinity${row.worst < 0.5 ? " WATCH" : ""} (tripwire only, vision score is the authority)`;
    }),
    planTemplates: `per-episode templates ready to land with land_episode_plan: built-ins ${EPISODE_TEMPLATE_IDS.join(", ")}${savedTemplates.length ? ` + ${savedTemplates.length} creator-authored variation(s): ${savedTemplates.map((t) => `'${t.name}' (${t.scope.toLowerCase()}, ${t.stepCount} steps)`).join(", ")}` : ""}`,
    canonRetire: canon && canon.suggestions.length > 0
      ? canon.suggestions.map((s) => `'${s.text.slice(0, 60)}' - ${s.reason}`)
      : null,
    factDrift: canon ? canon.drift.headline : null,
    identityDrift: drift ? drift.headline : null,
    latestDigest: latestDigestEvent
      ? `${latestDigestEvent.summary} (${latestDigestEvent.createdAt.toISOString().slice(0, 16)}Z)`
      : null,
    latestPublish: latestPublishEvent
      ? `${latestPublishEvent.summary} (${latestPublishEvent.createdAt.toISOString().slice(0, 16)}Z)`
      : null,
    canonHealth: canon ? canon.digest.headline : null,
    scheduleHealth: scheduleHealth ? scheduleHealth.headline : null,
  };
}
