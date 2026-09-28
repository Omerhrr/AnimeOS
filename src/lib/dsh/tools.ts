import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkSceneContinuity, checkSceneCapabilities } from "@/lib/continuity";
import { scanArtContinuity, checkShotArtContinuity } from "@/lib/continuity-art";
import { checkShotUniverseFacts } from "@/lib/universe-facts";
import { startRepaintRun } from "@/lib/universe-repaint";
import { isSpeakingCloseup } from "@/lib/animation/lipsync";
import { createPlan, runPlanSteps, latestPlan, getPlan, setPlanStatus, parsePlanSteps } from "@/lib/dsh/plans";
import { EPISODE_TEMPLATE_IDS, instantiateEpisodePlan, listPlanTemplates } from "@/lib/dsh/plan-templates";
import { IDENTITY_REPAINT_THRESHOLD, IDENTITY_RENDER_THRESHOLD, identityThresholdFor, scoreProjectIdentity, scoreShotIdentity, scoreRenderIdentity, scoreShotEmbedding, describeAffinity, AFFINITY_WATCH_THRESHOLD, identityDriftData, identityBarMeasurement, identityBarMeasurementLine, castIdentityMeasurement, castIdentityLine } from "@/lib/identity";
import { parseBattleArc, allocateBattleShots, battleLegLabel } from "@/lib/dsh/battles";
import { reanchorByName, REANCHOR_DEFAULT_RESCORE, REANCHOR_MAX_RESCORE } from "@/lib/reanchor";
import { runIdentityRepairPass, repairVerdictLine } from "@/lib/identity-repair";
import {
  createSchedule, fireScheduleNow, listSchedules, describeCadence,
} from "@/lib/scheduler";
import { studioPulse } from "@/lib/studio-pulse";
import { canonHealthData } from "@/lib/canon-health";
import { scheduleHealthData } from "@/lib/schedule-health";
import { postDailyDigest, postMemberDigest } from "@/lib/digest";
import { notifyMembers, deliverToMember, describeFanout } from "@/lib/studio/notify";
import { stagePublishPackage, platformPreset, PLATFORM_PRESETS } from "@/lib/comic/publish";
import { uploadStagedPackage, findStagedPackage } from "@/lib/comic/upload";
import { parseSrt, serializeSrt } from "@/lib/subtitles/srt";
import { buildEpisodeDialogueCues, normalizeLangTag, translateSubtitleCues } from "@/lib/subtitles/translate";
import { trainCharacterVoice } from "@/lib/ai/voice-clone";
import { createRenderJob } from "@/lib/engine/render";
import {
  blenderAssetLibrary, buildBlenderAsset, inspectBlenderAsset, refreshAssetPreview, landDesignEvent,
  isBlenderAssetKind,
  type BlenderAssetKind,
} from "@/lib/blender/assets";
import { runBlenderScript, runAssetBuilder } from "@/lib/blender/runtime";
import { compileSculptSpec, compileRetopoSpec, DEFAULT_RETOPO_BUDGET, writeRetopoSpec } from "@/lib/blender/sculpt";
import { auditAsset, auditLibrary, fixIssues, designStatus } from "@/lib/blender/design-review";
import { compileMotionSpec } from "@/lib/blender/motion";
import { compileVariationSpec } from "@/lib/blender/variation";
import { runRoundtrip, isExportFormat } from "@/lib/blender/roundtrip";
import { compileGrammarSpec, serializeGrammar, BUILT_IN_GRAMMARS, GRAMMAR_MOVES, findBuiltInGrammar } from "@/lib/animation/grammar";
import { compileFxSpec, serializeFx, BUILT_IN_FX, FX_KINDS, findBuiltInFx } from "@/lib/animation/fx";
import { compilePhysicsSpec, serializePhysics, BUILT_IN_PHYSICS, PHYSICS_KINDS, findBuiltInPhysics } from "@/lib/animation/physics";
import { compileChoreo, BUILT_IN_CHOREO } from "@/lib/animation/choreography";
import { motionFlowAdoptionGate, flowNameFromChoreo, isMotionRegister, rankMotionFlows, motionFlowsContextLine, MOTION_REGISTERS } from "@/lib/animation/motionflows";
import { reviewRenderJob, renderPixelContextLine, RENDER_ISSUE_KINDS } from "@/lib/engine/render-review";
import { fixRenderIssues } from "@/lib/engine/render-fix";
import { proposeRedirection } from "@/lib/engine/render-redirection";
import {
  findRetopoFlow, learnRetopoFlow, recordRetopoOutcome, listRetopoFlows, retopoFlowsContextLine,
  type RetopoOutcome,
} from "@/lib/blender/retopo-flows";
import { planSculpt, listSculptPlans, sculptPlansContextLine, surfaceReadLine } from "@/lib/blender/sculpt-plans";
import {
  SEQUENCE_REGISTERS, isSequenceRegister, learnSequenceFlow, bestSequenceFlow, recordSequenceOutcome,
  flowsLearnedFromProgram, listSequenceFlows, sequenceFlowsContextLine,
  recordProgramOutcome, unadoptedVerifiedPrograms, sequenceAdoptionSuggestionsLine,
  compileSlotWind, windFitsGrammar, applySlotWind, formatSlotWind,
  compileSlotCloth, formatSlotCloth, compileSlotFlesh, formatSlotFlesh,
  type SequenceFlowSlot,
} from "@/lib/dsh/sequence-flows";
import { runWithActor } from "@/lib/dsh/actor-context";
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
// DSH decides WHAT needs to happen and calls domain tools; this
// executor translates those decisions into production state
// changes. The engine bridge (Blender driver) sits below this
// layer - and since the Blender native-runtime iteration the
// designer tools (blender_exec, blender_asset_build) also reach
// INTO Blender directly: the studio's own runtime runs real bpy
// design passes at design time, so assets are DESIGNED once and
// every render consumes the library instead of rebuilding
// procedural stand-ins.
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
    name: "schedule_release",
    description: "SLATE AN EPISODE'S RELEASE - the release calendar's pen: put an episode on the calendar at a date (and optionally a platform) so the whole crew reads when it meets its audience. Pass releaseAt as an ISO date (e.g. '2026-03-14' or a full timestamp; the calendar shows the date), platform as a free label (e.g. 'Bilibili', 'Crunchyroll', 'YouTube'); pass releaseAt as empty string to unschedule. The calendar computes DUE/RELEASED at read time - nothing to drift; the episode's production status stays the render pipeline's truth, the release date is the audience's clock.",
    args: {
      episodeNumber: "number (defaults to latest episode)",
      seasonNumber: "number (optional - disambiguates when several seasons share an episode number)",
      releaseAt: "string - ISO date to slate (e.g. '2026-03-14'), or empty string to unschedule",
      platform: "string (optional) - the release platform label (e.g. 'Bilibili', 'Crunchyroll', 'YouTube'); empty string clears it",
    },
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
    description: "Register a CADENCE SCHEDULE so the studio keeps working between conversations: PLAN_RUN runs an approved plan on a cadence (the nightly-breakdown pattern: land the plan, the creator approves it once, this walks maxSteps per night until DONE - a finished plan hands the slot to the next ACTIVE one), REPAINT_QUEUE is render-queue supervision (ticks active render jobs, starts a supervised re-paint pass when the universe-facts queue is dirty and no run is live), DAILY_DIGEST posts a digest of the last 24 hours to the creator (renders, plan steps, schedule fires, canon/identity health) as a production event the digest panel shows, and PUBLISH_RUN stages the delivery-spine publish package (episode + platform preset) on a cadence, conformance checks and hand-off folder included. Every fire lands as a production event with its outcome; the creator steers (enable/disable/run-now/delete) from the scheduler panel on the DSH view.",
    args: {
      name: "string - short schedule name (e.g. 'Nightly Episode 2 breakdown')",
      kind: "PLAN_RUN | REPAINT_QUEUE | DAILY_DIGEST | PUBLISH_RUN",
      planTitle: "string (PLAN_RUN optional - pins a plan by title; omit to always run the latest ACTIVE plan)",
      publishEpisode: "number (PUBLISH_RUN: which episode gets staged, default 1)",
      publishPlatform: "string (PUBLISH_RUN: YOUTUBE | BILIBILI | DOUYIN | TIKTOK | STUDIO_INGEST)",
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
    description: "Identity-similarity scoring for a panel OR a shipping render: a vision model scores how closely the judged pixels match EACH featured character's canonical model sheet (0..1 per character, plus face/hair/wardrobe/weapon/palette/style aspects). source 'panel' (default) judges the storyboard art against the 60% panel bar; source 'render' judges a frame of the shot's FINISHED CLIP against the 70% shipping-pixel bar - the bar the cut actually answers to (THE BAR IS MEASURED). Persists on the shot under its source, lands an IDENTITY_VERIFIED or IDENTITY_DRIFT continuity event, and a worst score below the source's bar earns a re-paint (panel) or re-render (shipping pixels) offer. Without args, scores the WORST already-scored panel (or the newest art-bearing panel when nothing is scored yet); pass limit to batch a few.",
    args: {
      sceneNumber: "number (optional, defaults to latest scene)",
      shotNumber: "number (optional, defaults to shot 1)",
      source: "string (optional - 'panel' default | 'render': judge a frame of the finished clip at the 70% shipping bar)",
      limit: "number 1-8 (optional - batch-score that many worst-first instead of one)",
    },
  },
  {
    name: "reanchor_character",
    description: "RE-ANCHOR a character's identity: regenerate their canonical model sheet from their CURRENT design text (appearance, the episode-resolved state's wardrobe/weapon, the production's art style) when their identity drift curve is DECLINING and the old sheet no longer matches the intended look. The new anchor replaces the canonical one (every future panel prompt carries it), an IDENTITY_REANCHOR event marks the moment, the drift-curve trend baseline RESTARTS there (old points stay as history), and up to 6 of their most recent scored panels are re-scored against the NEW sheet so the restarted curve has fresh points. This is a canonical decision: use it when the DESIGN moved (a wardrobe/weapon state changed the look) or the old anchor was wrong - never to chase one bad painter around a good anchor (re-paints fix panels; re-anchor fixes the reference).",
    args: {
      characterName: "string - the cast character to re-anchor",
      rescore: `number 0-${REANCHOR_MAX_RESCORE} (optional - how many of their recent scored panels to re-score against the new sheet, default ${REANCHOR_DEFAULT_RESCORE})`,
    },
  },
  {
    name: "studio_pulse",
    description: "One honest health readout of the whole studio, instant and provider-free: the canon score (universe-fact verdict history: coverage and hold rate, plus facts suggested for rewording/retirement), identity health (vision-scored panels, drift queue, provider-free affinity tripwire, per-character drift curves over episode order), schedule health (14-day fire outcomes, overdue and erroring cadences) and queue pressure (active renders, re-render queue). Call it when the creator asks how the production is doing, before promising deadlines, or after a night of scheduled fires.",
    args: {},
  },
  {
    name: "post_digest",
    description: "Post a production DIGEST to the creator right now: the last N hours of studio activity (renders, plan steps, schedule fires, canon and identity-drift headlines, queue pressure) aggregated into one readable message and landed as a DIGEST production event the digest panel shows. Pass member (name or email) to post ONE MEMBER's digest instead - what that person actually caused in the window (their attributed tool calls and crew-thread comments); a quiet member is reported honestly. The DAILY_DIGEST schedule posts the studio-wide one automatically on its cadence; use the member form when the creator asks who did what.",
    args: {
      hours: "number 1-168 (optional - the window the digest covers, default 24)",
      member: "string (optional) - a member's name or email: post THEIR digest instead of the studio's",
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
    name: "blender_exec",
    description: "THE DESIGNER SEAM: run ONE bpy python script inside the studio's own headless Blender runtime (a short-lived sandboxed worker with a timeout and captured output). This is raw Blender capability, not an integration - the script can build, modify, measure or render anything in the scene graph. Use it for asset refinements the deterministic builder cannot express: a more articulated sleeve, an extra banner row, a measured silhouette tweak. The script receives --out <dir> after -- (sys.argv) for any files it writes; print progress and a final one-line result. Scripts are capped in size and time; a missing runtime refuses honestly until the runtime is provisioned.",
    args: {
      script: "string - a complete python script using bpy (64KB cap)",
      purpose: "string - what this pass designs or refines (lands in the event log)",
    },
  },
  {
    name: "blender_viewport_shot",
    description: "Re-render an asset's PREVIEW (a lit 512px Cycles turntable frame) from its accepted .blend in the library - no rebuild. Use after a blender_exec refinement pass touched the asset file in place, or when the library preview is stale.",
    args: {
      refName: "string - the asset's character/environment name",
      kind: "CHARACTER | ENVIRONMENT (default CHARACTER)",
    },
  },
  {
    name: "blender_asset_build",
    description: "DESIGN a library asset for a character, environment, PROP or CREATURE: compiles the production's design text (model-sheet anchor, appearance, active wardrobe/weapon, environment brief, the registered asset's description) into DNA and runs the deterministic v6 builder in the studio's Blender runtime - one versioned .blend + a lit preview PNG lands in the library (design once, render many). PROPS and CREATURES resolve from the production's registered assets (create_asset rows), so a registered spirit sword or beast becomes a real, named .blend hierarchy; READY props and creatures also ride every render whose shot text names them. Pass material/lighting recipe NAMES (design_material / design_lighting) to build under the production's designed recipes, and a motion preset NAME (design_motion) to bake a REAL armature performance into the file plus the animated preview loop that proves it. Rebuild freely to iterate: each build bumps the version. An optional guidance line is stored with the asset's audit.",
    args: {
      kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE",
      refName: "string - the exact name (characters/environments from their tables, props/creatures from the registered assets)",
      guidance: "string (optional - a design note stored on the asset's audit)",
      material: "string (optional - a design_material recipe name; the recipe is law over DNA defaults)",
      lighting: "string (optional - a design_lighting rig name; drives the preview render)",
      motion: "string (optional - a design_motion preset name; bakes a REAL armature performance into the .blend and renders the animated preview loop)",
      variation: "string (optional - a design_variation preset name; attaches a REAL Geometry Nodes scatter/array layout to the asset)",
      sculpt: "string (optional - a design_sculpt preset name; carves layered seeded surface detail into the asset before the save)",
      plan: "string (optional - a plan_sculpt LEARNED PLAN name; the planned surface law is carved into the asset and the pass's measured evidence grows the plan's record - the learned layer reading the surface before the carve)",
    },
  },
  {
    name: "blender_asset_inspect",
    description: "Vision-inspect a CHARACTER asset's library preview against its canonical model sheet (the same referee the panels and renders answer to): a 0..1 similarity plus a note lands on the asset. Environment assets honestly skip (no canonical sheet exists - their identity is judged on the render pass). Use in the design loop: build, inspect, refine, inspect - until the score clears the bar.",
    args: {
      refName: "string - the character asset's name",
    },
  },
  {
    name: "blender_asset_library",
    description: "Read the whole Blender ASSET LIBRARY: every asset with kind (character, environment, prop, creature), status, version, quality score, identity score and preview path, plus library stats. Call it before designing (what already exists?) and after (what cleared the bar?).",
    args: {},
  },
  {
    name: "design_material",
    description: "Design a NAMED MATERIAL RECIPE (a Principled BSDF parameter set) and register it as the production's material law: base color, roughness, metallic, IOR, emission color + strength. Rebuilds that pass --material to the builder, which applies the recipe OVER the DNA defaults (a recipe is law), and every build that names it records the pairing on the asset's audit. Design recipes for recurring surfaces (spirit-forged steel, weathered jade, celestial silk) instead of restating hex codes per build; the registry line in your context shows usage counts.",
    args: {
      name: "string - the recipe name (e.g. 'Spirit-Forged Steel')",
      baseColor: "string hex (optional) - primary base color",
      roughness: "number 0..1 (optional)",
      metallic: "number 0..1 (optional)",
      ior: "number 0..2 (optional)",
      emissionColor: "string hex (optional) - recolors the asset's emissive parts",
      emissionStrength: "number (optional)",
    },
  },
  {
    name: "design_lighting",
    description: "Design a NAMED LIGHTING RIG (the studio's preview 3-point setup: key/fill/rim energy + colors, background strength, camera lens) and register it. Rebuilds that pass --rig render the asset preview under YOUR rig instead of the neutral default - the professional way to judge a design is under the light it will ship in. The saved asset still carries no lights: the render worker owns shot lighting.",
    args: {
      name: "string - the rig name (e.g. 'Moonlit Abyss')",
      keyEnergy: "number (optional, watts)",
      keyColor: "string hex (optional)",
      fillEnergy: "number (optional)",
      fillColor: "string hex (optional)",
      rimEnergy: "number (optional)",
      rimColor: "string hex (optional)",
      bgStrength: "number (optional, world background strength)",
      camLens: "number (optional, mm - 55 default, 85 creatures, 32 sets)",
    },
  },
  {
    name: "design_audit",
    description: "THE SELF-REVIEW: audit one library asset (or library:true for a sweep of every READY asset) against the quality bar. A deterministic local audit ALWAYS runs (hierarchy floors, preview content, designed material/rig presence, identity recency, version churn); a VISION critique of the preview joins it when the provider answers (silhouette, material, palette, lighting, detail, proportion). Lands a persisted DesignReview with per-criterion scores and one DesignIssue row per concrete finding (severity CRITICAL | MAJOR | MINOR). This is how you check back on your own designs - never call a design done without one.",
    args: {
      refName: "string - the asset's name (omit when library:true)",
      kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE (default PROP for registered assets)",
      library: "boolean (optional) - sweep every READY asset and land a LIBRARY rollup",
    },
  },
  {
    name: "design_fix",
    description: "THE FIX PASS: run a REAL bpy refinement against an asset's accepted .blend, driven by its OPEN design issues. The pass applies the professional operation each issue kind calls for (bevel+subsurf finishing, normal + origin hygiene, roughness/metallic normalization, palette pull toward the accent), saves a NEW VERSION, re-renders the preview under the designed rig, RE-AUDITS, and marks an issue FIXED only when the re-audit stops raising it - a fix that did not survive the re-audit stays OPEN with the fix note. Report version bump, what cleared and what did not, and the new score.",
    args: {
      refName: "string - the asset's name",
      kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE (default PROP for registered assets)",
      issueIds: "JSON array of issue ids (optional - defaults to ALL open issues of the asset)",
    },
  },
  {
    name: "design_status",
    description: "Check back on the studio's designs: open design issues by severity, the latest reviews with their scores, and every asset's quality grade. Call it when the creator asks how the designs are doing, before promising a quality bar, and after a fix pass to see what still stands.",
    args: {},
  },
  {
    name: "design_motion",
    description: "Design a NAMED MOTION PRESET (the third design law, beside materials and lighting) and register it as the production's performance law: hover/spin/pulse for PROPS (a sword floats, turns, its runes breathe), slither/flap/walk/prowl/breathe for CREATURES, with speed (whole wave cycles per loop, 0.2..3), amplitude (0.2..3) and cycleFrames (16..48). Rebuilds that pass motion:'<name>' give the asset a REAL Blender armature, rigid-bind its named parts to the bones, bake the performance as a seamless looping Action INSIDE the .blend, and render the animated preview loop that proves it - and riding renders show the asset performing live. A motionless prop or creature is an unfinished design.",
    args: {
      name: "string - the motion name (e.g. 'Serpent River Dance')",
      kind: "PROP | CREATURE",
      motion: "string - PROP: hover | spin | pulse | hover-spin; CREATURE: slither | flap | walk | prowl | breathe | idle",
      speed: "number 0.2..3 (optional, 1 = one wave cycle per loop)",
      amplitude: "number 0.2..3 (optional, 1 = designed default reach)",
      cycleFrames: "number 16..48 (optional, 24 = one second at 24fps)",
    },
  },
  {
    name: "design_variation",
    description: "Design a NAMED VARIATION PRESET (the fourth design law, beside materials, lighting and motion) and register it as the production's layout law: a REAL Blender GEOMETRY NODES tree - SCATTER (seeded instances spread across a carrier surface: rocks over a terrain, reeds in a marsh, debris around an artifact) or ARRAY (instances marching a deterministic spine: sword racks, colonnades, banners). Rebuilds that pass variation:'<name>' attach the tree INSIDE the .blend (the modifier travels to every render), deterministic because the seed is law - the same spec always lands the same variation. An environment without variation is a wallpaper; sixty copies of one rock is not a set.",
    args: {
      name: "string - the variation name (e.g. 'Valley Floor Debris')",
      variation: "string - SCATTER (instances across a carrier surface) | ARRAY (instances along a spine/grid)",
      count: "number (optional - scatter: instances across the carrier 1..400, default 40; array: steps on the spine 2..64, default 8)",
      seed: "number (optional 0..65535, default 7 - the same seed always lands the same layout)",
      scaleJitter: "number 0..1 (optional, default 0.35 - per-instance size spread)",
      rotJitter: "number 0..1 (optional, default 0.8 - per-instance pose spread; 1 = full circle)",
      spread: "number 0..1 (optional, default 0.25 - ARRAY positional jitter)",
      layout: "string (optional - ARRAY: line | grid, default line)",
      carrier: "string (optional - the object name that receives instances; default auto-detects the floor)",
      source: "string (optional - the object name to instance; default auto-detects the smallest piece)",
    },
  },
  {
    name: "design_sculpt",
    description: "Design a NAMED SCULPT RECIPE (the sixth design law, beside materials, lighting, motion and variation) and register it as the production's surface law: layered, seeded VALUE-NOISE DISPLACEMENT carved along the surface normals - swell (broad organic mass: terrain, muscle, drapery billows), fold (ridged creases: cloth folds, hide striations, panel lines) and grain (fine tooth: weathering, skin) over an applied subdivision. Rebuilds that pass sculpt:'<name>' carve the recipe INTO the .blend, deterministic because the seed is law - and the pass MEASURES its own evidence (surface variance before/after). An environment or creature with a clean builder slab is an unfinished design.",
    args: {
      name: "string - the sculpt recipe name (e.g. 'Weathered Valley Terrain')",
      layers: "JSON array string - [{\"kind\":\"swell\",\"intensity\":1,\"scale\":1.2},{\"kind\":\"fold\"},{\"kind\":\"grain\"}] (intensity 0..2, scale = noise frequency; defaults per kind)",
      subdivision: "number 0..3 (optional, default 1 - the subsurf level applied before carving)",
      seed: "number 0..65535 (optional, default 7 - the same seed always carves the same surface)",
      parts: "string (optional - comma-separated object-name filters like 'Robe,Skirt'; default every mesh)",
    },
  },
  {
    name: "blender_export",
    description: "EXPORT a library asset to GLB or FBX and VERIFY the round trip per-check: the studio's Blender exports the accepted .blend, wipes the scene, PURGES the orphaned source datablocks, re-imports the exported file and runs a verdict per check - MESH_NAMES (which named meshes are missing), MESH_COUNT, MATERIAL_NAMES (by name, not just count), ARMATURE_BONES (by name), ACTION (the baked animation's frame range survives; FBX may rename the take), UV_SETS, DIMS (bbox drift, 8% budget) and TRIS (tri delta, 8% budget). verified means EVERY check green - a check that cannot pass honestly fails the export, and an unverified export is a hope, not a deliverable. GLB drops lights/cameras by design (judged on meshes); FBX re-triangulates ngons and exports the clean base meshes (add_leaf_bones=False keeps bone names exact). Use it when a deliverable leaves the studio for a game engine, a contractor DCC or a distributor QC lane.",
    args: {
      refName: "string - the asset's name",
      kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE (default PROP for registered assets)",
      format: "GLB | FBX (default GLB)",
      verify: "boolean (optional, default true - false skips the re-import comparison)",
    },
  },
  {
    name: "blender_retopo",
    description: "Run the RETOPOLOGY BUDGET pass on a library asset: collapse-decimate its meshes toward the kind's triangle budget (CHARACTER 80k, ENVIRONMENT 120k, PROP 20k, CREATURE 60k) or toward a LEARNED FLOW's budget, and VERIFY the shape survived - bounding-box drift is measured and a verified verdict lands with the tris before/after. A sculpted asset that grew past its budget comes back to law here; an unverified retopo is a hope, not a deliverable. Passing flow:'<name>' drives the pass with the production's LEARNED RETOPO FLOW (the memory of a verified run): the outcome is appended to the flow's record and the re-audit's verdict reinforces it. Saves a NEW versioned .blend and re-renders the preview.",
    args: {
      refName: "string - the asset's name",
      kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE (default PROP for registered assets)",
      budget: "number (optional - override the kind's triangle budget; clamped 200..2,000,000)",
      parts: "string (optional - comma-separated object-name filters; default every mesh)",
      flow: "string (optional - a learned retopo flow's name: its budget/parts drive the pass and the measured outcome grows the flow's record)",
    },
  },
  {
    name: "design_grammar",
    description: "Design a NAMED MOTION GRAMMAR and register it as the production's blocking law: 2..6 DIRECTED camera beats over one shot (CRANE down to find the hero, then DOLLY_IN as the sword clears the sheath), each beat one move (ORBIT | PAN | TRACKING | CRANE | DOLLY_IN | DOLLY_OUT | TILT_UP | TILT_DOWN | STATIC) over a 0..1 fraction of the clip, optionally carrying its own pose pair so the SUBJECT moves with the lens and its own WIND call (0..1 - the gust the cloth and hair ride on that beat). Reusable named grammars are how a show keeps its blocking language consistent; apply one with set_shot_grammar.",
    args: {
      name: "string - the grammar name (e.g. 'Cultivation Reveal')",
      beats: "JSON array string - [{\"move\":\"CRANE\",\"from\":0,\"to\":0.5},{\"move\":\"DOLLY_IN\",\"from\":0.5,\"to\":1,\"wind\":0.8}], optional per-beat poseStart/poseEnd, wind (0..1) and note",
    },
  },
  {
    name: "set_shot_grammar",
    description: "DIRECT a shot with a motion grammar: apply a NAMED grammar (a design_grammar preset or a built-in - The Reveal, The Standoff, The Assault, The Ascent, The Withdrawal) or an inline beat array to one shot. The render worker then plays the camera BEAT BY BEAT with eased crossfades between beats, and a beat's own pose pair moves the subject with the lens - a directed sequence, not one move held for the whole clip. Optionally direct the SOLVERS too: cloth is the shot's CLOTH call, one number 0..1 that scales the cloth solver's ANSWER for the whole clip (0 stills the solver, 1 the full probed storm; pass an empty string to clear back to the full response), and flesh is the shot's FLESH call, one number 0..1 that scales the soft-body solver's lag the same way (the trunk and face volumes answer the beats with real inertia). Pass grammar as empty string to clear it back to the shot's single movement.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      grammar: "string - a grammar preset name, a built-in name, an inline beats JSON array, or empty string to clear",
      cloth: "number 0..1 (optional) - the CLOTH call: the solver intensity this shot's cloth answers at (empty string clears back to the full response)",
      flesh: "number 0..1 (optional) - the FLESH call: the soft-body solver intensity the shot's trunk and face volumes lag at (empty string clears back to the full response)",
    },
  },
  {
    name: "design_sequence",
    description: "Design a NAMED SEQUENCE PROGRAM - the show's cutting language at sequence scale: an ordered chain of 2..12 shot slots, each slot a NAMED GRAMMAR (a design_grammar preset or a built-in like The Reveal / The Standoff / The Assault) plus optional poseStart/poseEnd for the shot's global pair, optional fx / physics program names (a design_fx / design_physics preset, a built-in like The Slash / The Clash, or an inline programs array - the world answers on the right shots), an optional WIND call (a number 0..1 drives the slot's grammar's every beat, or an array keyed per beat with null keeping the grammar's own gust and 0 a stillness call - the robes and hair ride what the sentence calls), an optional CLOTH call (one number 0..1 for the whole shot - scales the cloth solver's ANSWER, the per-shot intensity the fabric answers at, 0 stills the solver), an optional FLESH call (one number 0..1 - scales the soft-body solver's lag the same way), an optional MOTION call (a choreography preset, a built-in like The Combo, or a LEARNED MOTION FLOW - the stamped shot PERFORMS it; a learned flow chains its verified timing into the sentence, so the whole sequence re-performs end to end) and a note. A program is the director's sentence over many shots: open on a reveal, hold the standoff, break into the assault, withdraw. Every slot's grammar, air call, solver calls, world programs AND chained performances are validated at design time - a typo never reaches a shoot. Apply one across a scene (or the whole episode) with direct_sequence.",
    args: {
      name: "string - the sequence program name (e.g. 'Raid on the Fortress')",
      description: "string (optional) - what this program is for",
      slots: "JSON array string - [{\"grammar\":\"The Reveal\",\"note\":\"find the temple\"},{\"grammar\":\"The Standoff\",\"wind\":[null,0.8]},{\"grammar\":\"The Assault\",\"poseStart\":\"DRAW\",\"poseEnd\":\"SLASH\",\"wind\":0.6,\"cloth\":0.7,\"flesh\":0.8,\"fx\":\"The Slash\",\"physics\":\"The Clash\"}]",
    },
  },
  {
    name: "direct_sequence",
    description: "DIRECT A FULL SEQUENCE with named grammars: apply a NAMED SEQUENCE PROGRAM (a design_sequence preset) or an inline slot array across a scene's shots IN ORDER - shot i receives slot i's grammar (compiled onto the shot exactly like set_shot_grammar), optional per-slot poses set the shot's global pair, a slot naming fx / physics programs stamps them the same way set_shot_fx / set_shot_physics do, a slot's WIND call rides its grammar's beats (the robes and hair answer the air the sentence calls), a slot's CLOTH and FLESH calls (one number 0..1 each) set the shot's solver intensities, and a slot's MOTION call CHAINS A PERFORMANCE onto the stamped shot (a choreography preset, a built-in, or a LEARNED MOTION FLOW - the shot performs the verified keys instead of sliding; the whole verified sentence re-performs end to end, camera, world AND body). scope:'scene' (the default) directs one scene; scope:'episode' cuts the WHOLE EPISODE in story order - the slots allocate across every scene's shots, scene by scene, and the flow read names the scene of every cut. THE STUDIO REMEMBERS ITS SENTENCES: with no program and no slots, pass register:'<register>' (BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE) to direct from the register's best-proven LEARNED SEQUENCE FLOW (adopted with learn_sequence_flow) - every application grows the flow's measured record, and the consult itself names the verified programs no flow carries yet (a proven sentence should not wait to be remembered). The flow reads back whole: the beat chain per shot, cuts that land on the same move both sides, pose changes across cuts (the cloth whips on each), wind beats the robes ride, solver calls the fabric and the flesh answer, the fx/physics bindings, the chained performances. Shots beyond the plan stay untouched and are reported; with render:true every directed shot queues a render job so the whole sequence plays.",
    args: {
      sceneNumber: "number (scene scope, defaults to latest scene)",
      scope: "scene | episode (default scene - episode allocates the slots across every scene of the episode in story order)",
      episodeNumber: "number (episode scope, defaults to the latest episode with shots)",
      program: "string - a design_sequence preset name (or omit and pass slots inline, or pass register to consult a learned flow)",
      slots: "JSON array string (optional) - inline slots when no program is named: {grammar, poseStart?, poseEnd?, fx?, physics?, wind?, cloth?, flesh?, motion?}",
      register: "string (optional) - with no program and no slots: consult the register's best-proven learned sequence flow (BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE)",
      render: "boolean (optional, default false) - queue a render job for every directed shot",
      mode: "PREVIEW | FINAL (default PREVIEW, only with render)",
    },
  },
  {
    name: "learn_sequence_flow",
    description: "ADOPT A VERIFIED SEQUENCE as the production's named flow for a dramatic REGISTER (BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE) - the studio remembers its sentences the way it remembers verified retopo budgets: the program's design-time-validated slots become the flow's sentence (each slot's air call, solver call AND chained performance included), and every direct_sequence that drives the program (or the flow itself, via register:'<register>') grows the flow's MEASURED record - shots stamped, wind beats, solver calls, pose cuts, move clashes, world bindings, chained performances, renders queued. A direction that lands whole (every slot stamped a real shot) verifies; one whose flow read raises no blocking note (zero move clashes) on top of that earns the flow a clear and rises in the consult ranking. A flow that never landed whole is never consulted. The record is honest: an outcome is appended whatever it measured, and the consult names the programs that verified but were never adopted.",
    args: {
      name: "string - the flow's name (e.g. 'Raid grammar')",
      register: "string - BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE",
      program: "string - a design_sequence preset name whose slots become the flow's sentence",
      description: "string (optional) - overrides the program's description in the flow's spec",
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
  {
    name: "translate_subtitles",
    description: "Translate an episode's subtitles into a target language with the production's TERMINOLOGY MEMORY enforced as the glossary: every canonical term's fixed rendering is injected into the translation and a deterministic post-pass re-writes any cue the model drifted from (the memory proposes through the prompt, and disposes in the post-pass - 青焰 stays Azure Flame across every cue and every language). Source is either the episode's dialogue (timed by cumulative shot durations) or a raw SRT document passed directly. Terms the model rendered consistently that memory does not know yet come back as SUGGESTIONS worth adopting (adopt them with create_terminology so the next translation is even more consistent). The translated SRT is written to public/subtitles/ and lands as a TRANSLATION event the history feed shows.",
    args: {
      targetLang: "string - BCP-47 language tag like en-US, ja-JP, ko-KR, zh-TW",
      episodeNumber: "number (optional - translate this episode's dialogue; defaults to the latest episode)",
      srt: "string (optional - a raw SRT document to translate instead of the episode's dialogue)",
    },
  },
  {
    name: "design_fx",
    description: "Design a NAMED FX PROGRAM and register it as the production's spectacle law: 1..6 directed effects the world performs ON the grammar beats - TRAIL (the blade's energy ribbon, flaring with the pose velocity), BURST (a shockwave ring + shards igniting when the playhead enters a bound beat, the spectacle landing where the cut lands), AURA (a qi shell at the figure's waist breathing with the beat's wind call, the same driver the cloth hangs from) and MOTES (a seeded drift of spirit dust through the volume). Each program carries an optional hex color (default: the hero's energy color), an intensity 0..1 and a beat binding (ALL or 0-based grammar beat indices). Named fx programs are how a show keeps its spectacle consistent; apply one with set_shot_fx.",
    args: {
      name: "string - the fx program name (e.g. 'Crimson Slash')",
      programs: "JSON array string, e.g. [{\"kind\":\"TRAIL\",\"intensity\":0.9},{\"kind\":\"BURST\",\"color\":\"#f97316\",\"beats\":[1]}] - kinds: TRAIL | BURST | AURA | MOTES",
    },
  },
  {
    name: "set_shot_fx",
    description: "CALL THE WORLD ONTO A SHOT'S BEATS: apply a NAMED FX program (a design_fx preset or a built-in - The Slash, Cultivator's Aura, The Aftermath, Storm Break) or an inline program array to one shot. The render worker compiles them into real emissive geometry driven by the same beat clock as the camera and the cloth: the trail rides the blade, the burst lands at the cut, the aura breathes with the wind, the motes drift through the holds. Pass fx as empty string to clear the shot back to a clean stage.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      fx: "string - a design_fx preset name, a built-in name (The Slash | Cultivator's Aura | The Aftermath | Storm Break), or an inline JSON array of programs; empty string clears",
    },
  },
  {
    name: "design_physics",
    description: "Design a NAMED PHYSICS PROGRAM and register it as the production's body law: 1..6 directed laws the world performs ON the grammar beats - KNOCK (a prop takes the hit when the playhead enters a bound beat: impulse velocity away from the figure, a seeded tumble, real gravity, bounce with restitution, friction, settle to REST; a target names a riding designed prop - omit it to knock the first riding prop, or a stone vessel stands in when none rides), DEBRIS (ten seeded rubble chunks resting in a ring that get kicked radially and LIE where they settle - debris never fades), SWAY (a hanging lantern: a damped pendulum riding the beat's WIND call, the same driver the cloth hangs from, kicked at every beat boundary) and REACTION (THE BODY ANSWERS THE WORLD: the FIGURE itself staggers when a bound beat is entered - an impulse drives a damped spring on the hero's root, the body lurches AWAY from the beat's violence (Newton's third law when a strike lands on the same beat), dips, buckles (spine folds, head lags) and the spring returns it to its mark, settling to REST; the stagger publishes its velocity so the cloth whips with the body the same frame; multiple REACTION programs merge into one body law - the figure has one body). Each program carries an intensity 0..1 and a beat binding (ALL or 0-based grammar beat indices); only KNOCK takes a target. The integration laws are probed bit-exact determinism. Named physics programs are how a show keeps its wreckage consistent; apply one with set_shot_physics physics:'<name>'.",
    args: {
      name: "string - the program's name (unique per production among PHYSICS presets)",
      programs: "JSON array - 1..6 of {kind: KNOCK|DEBRIS|SWAY|REACTION, intensity?, beats?, target? (KNOCK only), note?}",
    },
  },
  {
    name: "set_shot_physics",
    description: "LET THE WORLD OBEY A SHOT'S BEATS: apply a NAMED physics program (a design_physics preset or a built-in - The Clash, The Ruin, The Windchime, The Shove, The Recoil) or an inline program array to one shot. The render worker compiles them into real bodies integrated per frame under the probed laws by the same beat clock as the camera, the cloth and the fx: the knock strikes where the cut lands, the debris lies where it settles, the lantern swings with the wind, and a REACTION staggers the FIGURE itself - the body answers the beat's violence and the cloth whips with it. Direct the lens first (set_shot_grammar) so the beats have something to answer, and name the designed prop in the shot text when a KNOCK should strike it. Pass physics as empty string to clear the shot back to a clean stage.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      physics: "string - a design_physics preset name, a built-in name (The Clash | The Ruin | The Windchime | The Shove | The Recoil), or an inline JSON array of programs; empty string clears",
    },
  },
  {
    name: "design_choreography",
    description: "Design a NAMED CHOREOGRAPHY PROGRAM and register it as the production's performance language: a KEYED performance the body performs instead of sliding between two poses. keys is an ordered array of 2..8 {at, pose, kind} rows - at is the normalized clip moment 0..1 (first key at 0, last at 1, time runs forward), pose is the body vocabulary (STANCE/WALK/LUNGE/SLASH/CAST/DRAW/BLOCK/LEAP/CROUCH/FALL/RISE/BOW/POINT) and kind names the SEGMENT INTO that key: 'anticipation' (the wind-up that earns the strike), 'strike' (the explosive segment - most of the distance in the first frames), 'hold' (the read), 'follow' (the settle back), 'move' (the standard eased travel). Two accents come with it: impact {at, frames 1..6, punch 0..8, flash 0..1} flares a REAL light at the strike and punches the camera with a decaying kick, and smear {at, frames 1..4, amount 0..1} stretches the striking limb up to 1.35x on the fastest frames - the stylized speed line no single frame can fake. THE KEYS OWN THE BODY: the camera grammar still owns the lens, and the cloth, flesh and physics still answer the performing body's velocity. Built-ins exist by name (The Combo, The Draw Storm, The Rising Fang); apply with set_shot_choreography.",
    args: {
      name: "string - the performance's name (e.g. 'Sky Cleaver')",
      keys: "string (JSON array) - 2..8 {at, pose, kind} rows; first at 0, last at 1, time runs forward",
      impact: "string (optional JSON {at, frames, punch, flash}) - the strike's real light flare + decaying camera kick",
      smear: "string (optional JSON {at, frames, amount}) - the striking limb's stylized stretch",
      note: "string (optional)",
    },
  },
  {
    name: "set_shot_choreography",
    description: "MAKE THE BODY PERFORM: apply a NAMED choreography program (a design_choreography preset, a built-in - The Combo / The Draw Storm / The Rising Fang - or an inline JSON program) to one shot. The next render of the shot performs the KEYS instead of the two-pose slide: the anticipation winds up, the strike explodes, the hold sells the read, the follow-through settles - the impact frame flares a real light and punches the camera, the striking limb smears on the fastest frames. The keys own the body; the camera grammar still owns the lens and the cloth, flesh and physics still answer the performing body. Direct the lens first (set_shot_grammar) so the performance has a frame worth cutting to. Pass choreo as empty string to clear back to the plain slide.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      choreo: "string - a design_choreography preset name, a built-in name (The Combo | The Draw Storm | The Rising Fang), or an inline JSON program; empty string clears",
    },
  },
  {
    name: "learn_motion_flow",
    description: "THE MOTION IS LEARNED: adopt a shot's VERIFIED keyed performance as a NAMED MOTION FLOW - the production's memory of how a pose transition is performed for a dramatic register. The shot must carry a choreography program (design_choreography + set_shot_choreography) and its render must have VERIFIED: a pixel review that PASSED its bar (review_render), or a human's APPROVED/FINAL on the shot. The flow keeps the exact keys, impact and smear that verified, its poseFrom -> poseTo transition and its adopted-from evidence. From then on set_shot_choreography choreo:'<flow name>' re-performs the verified timing on any shot, every application grows the flow's applied record, and every passing review of a flow-carrying shot grows its verified record. A verified performance that nobody names is a lesson the studio re-pays for every fight.",
    args: {
      name: "string - the flow's name (how it is applied later, e.g. 'Temple Gate Combo')",
      register: "string - the dramatic register the flow serves: BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE",
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
    },
  },
  {
    name: "measure_identity_bar",
    description: "THE BAR IS MEASURED: score the production's SHIPPING PIXELS against the 70% identity bar and read the measurement honestly. Renders - the frames the cut actually plays - answer to a HIGHER bar (70%) than the storyboard panels they came from (60%), and the bar is not a guess: this tool walks the production's finished renders, runs the REAL vision identity score on each (a frame from the clip judged against the featured cast's model sheets, source RENDER), then aggregates the measured readings against the bar - how many renders cleared 70%, where the average and the worst sit, which shots earned a repaint slot. Without limit it only reads back the existing measurement; pass limit N to first score up to N unmeasured/known-bad renders (each a real vision call). A reading below the bar lands an IDENTITY_DRIFT event on the shipping pixels - the re-render loop (render_fix or a re-render) clears it, then measure again to confirm.",
    args: {
      limit: "number (optional - first score up to N finished renders with real vision calls; default 0 = read the existing measurement only)",
    },
  },
  {
    name: "cast_identity_pass",
    description: "THE CAST ANSWERS THE BAR: read every cast member's REAL identity standing against the shipping bar, BY NAME. measure_identity_bar answers the production question; the casting director's question is per member - how does Lin Yue measure against HER sheet? This pass rolls the production's real per-character vision readings (each IdentityScore row carries every scored member's own similarity) into one standing per member: CLEARING (every reading at/above the bar), BELOW (any reading under it, named with its worst shot ref - the re-render queue by name), UNTESTED (anchored but never measured), UNANCHORED (no model sheet - nothing to answer to yet). Pass scoreFirst N to first score up to N unmeasured/known-bad renders with real vision calls (same law as measure_identity_bar). The below members are a work order: re-render (render_fix / render_shot) or re-anchor their drifting sheets, then pass again; the unanchored members cannot answer at all until generate_model_sheet paints their sheet.",
    args: {
      scoreFirst: "number (optional - first score up to N finished renders with real vision calls; default 0 = read the standing only)",
      source: "render | panel (optional - default render: the shipping pixels answer the 70% bar; panel reads the 60% storyboard line)",
    },
  },
  {
    name: "identity_repair_pass",
    description: "THE GAP IS REPAIRED: execute the standing's work order - the re-render + re-anchor loop over the cast's BELOW members, then re-measure. The cast pass names the below members with their worst shot refs; this loop works them: (a) each below member's canonical sheet is READ into build DNA by the vision model (hair style, exact hexes per material role, weapon, build, faceShape - THE DNA ADHERES TO THE SHEET), and the read's silhouette sentence SHAPES THE MESH the re-render builds (shoulders, torso, sleeves, skirt, hair, crown - bounded factors, the rig anchors stay) while the read's faceShape family SCULPTS THE HEAD (jaw taper, chin, brow, cheekbones, nose wedge - THE FACE IS SCULPTED, NOT ASSEMBLED, the eye size riding it); then their worst named shots are RE-RENDERED over the real engine with the adherent DNA riding (the sheet's own truth builds the proxy; the palette pulls 0.75) and every re-render is RE-SCORED by the real vision channel with POSE-MATCHED scoring (a filmstrip of the clip goes to the model - the frame whose pose matches the sheet's turnaround is judged, not an arbitrary one) against the same sheet; (b) a member the re-render could not lift has their canonical sheet RE-ANCHORED (regenerated from the current design text) and the shots re-scored against the NEW sheet. The ledger is honest per shot: before -> after with the verdict the pair earns (REPAIRED / IMPROVED / UNCHANGED / WORSE / UNSCORED), per member (REPAIRED / IMPROVED / STILL BELOW / UNSCORED), and the standing is read again when the loop ends - the gap that remains is named, never averaged away. This pass WAITS on its re-renders (bounded); run it when the studio can spend the minutes.",
    args: {
      members: "number (optional - how many below members to work, worst first; default 2, max 4)",
      shotsPerMember: "number (optional - how many of each member's worst shots to re-render; default 1, max 3)",
      reanchor: "boolean (optional - regenerate the sheet of a member the re-render could not lift; default true)",
    },
  },
  {
    name: "stage_battle",
    description: "THE BATTLE IS STAGED: point the learned chain at an EPISODE-SCALE battle. One sentence (direct_sequence) directs a scene; a battle spans the episode - clash, pursuit, aftermath. Pass an arc of registers (arc:'BATTLE > PURSUIT > RESOLVE', 2-5 legs, no consecutive repeats); every leg consults the register's best-proven learned SEQUENCE flow (the consult law - a battle staged from guesses is not the chain), the episode's shots are allocated across the legs by each sentence's own weight (a leg with more slots carries more of the fight), and EVERY leg pre-flights before a single shot is stamped (a battle that fails at leg 3 must not leave legs 1-2 half-staged). Each stamped shot receives its slot's grammar, air, solver calls, fx, physics and CHAINED PERFORMANCE exactly as direct_sequence obeys - a slot's motion call still re-performs a learned motion flow's verified timing, and the whole battle reads back leg by leg. The legs land their measured outcomes on the flows' ledgers (a leg that could not perform its whole sentence does not verify). render:true queues a render per directed shot.",
    args: {
      arc: "string - the battle arc, e.g. 'BATTLE > PURSUIT > RESOLVE' (2-5 register legs)",
      episodeNumber: "number (optional - defaults to the latest episode with shots)",
      render: "boolean (optional - queue a render per directed shot)",
      mode: "PREVIEW | FINAL (optional - default PREVIEW)",
    },
  },
  {
    name: "review_render",
    description: "JUDGE THE PIXELS: run (or read back) the VISION-GUIDED RENDER REVIEW on a finished render - the learned assist layer on the deterministic passes. The review pulls a representative frame from the finished clip, MEASURES it locally (luminance mean and spread, saturation, near-black and clipped-white fractions, a 16-bin histogram: deterministic, the same bytes always land the same numbers), then shows the frame to the vision model TOGETHER WITH the shot's DIRECTED INTENT (the grammar beats, the fx and physics the production put on the shot) and lands a persisted RenderReview: per-criterion scores (exposure and contrast measured locally; readability, palette, intent and composition scored against the direction), an overall %, concrete issues (EXPOSURE | CONTRAST | READABILITY | PALETTE | INTENT | COMPOSITION | STAGE, with severities) and the provider named honestly (vision+local | vision | local). One review per render job: the pixels do not change until a new attempt renders new ones. Read the review back before promising the shot serves its intent, and pair it with the DSH inspection - the review is evidence, the inspection is the verdict.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      jobId: "string - optional explicit render job id (defaults to the shot's latest finished render)",
    },
  },
  {
    name: "render_fix",
    description: "THE FIX RETURNS TO THE PIXELS: run the RENDER-FIX LOOP on a reviewed render - the way design_fix re-audits assets, but on the shot. Read the pixel review's OPEN issues, apply the REAL parameter fix each kind calls for (EXPOSURE lifts the energy and rim lights or pulls them down when blown; CONTRAST cuts the fog that flattens the spread; STAGE raises the rim so the figure reads; READABILITY clears the air and moves the camera in; COMPOSITION reframes the way the note decides; PALETTE nudges the energy mix), queue a NEW attempt with those parameters (fixOf lineage names the reviewed attempt), and let the FRESH attempt's pixel review be the judge - an issue is FIXED only when the new pixels stop raising it. INTENT issues refuse parameters honestly: intent lives in the direction, adjust the beats and re-render. Read what cleared and what did not from the issue fix notes afterwards.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      jobId: "string - optional explicit render job id (defaults to the shot's latest finished render)",
      issueIds: "JSON array of issue ids (optional - defaults to ALL open issues of the render's review)",
    },
  },
  {
    name: "learn_retopo_flow",
    description: "THE STUDIO REMEMBERS ITS CRAFT: save a LEARNED RETOPO FLOW - the production's named memory of a retopo recipe that verified, per asset kind (budget, optional part filters, and the measured record of every outcome it produces). A flow is learned from a measured run (pass refName of the asset blender_retopo measured; the verified numbers seed the record) or registered from the kind's budget law. From then on blender_retopo flow:'<name>' drives passes with it and grows the record, and design_fix consults the best-verified flow for the kind before it decimates - every re-audit that stops raising TOPOLOGY earns the flow a clear. This is how the memory grows: a verified run that nobody names is a lesson the studio re-pays for every build.",
    args: {
      name: "string - the flow's name (e.g. 'relic-hero-20k')",
      kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE (default PROP)",
      refName: "string (optional - the asset whose measured blender_retopo run seeds the record)",
      budget: "number (optional - default the kind's triangle budget law; clamped 200..2,000,000)",
      parts: "string (optional - comma-separated object-name filters; default every mesh)",
    },
  },
  {
    name: "plan_sculpt",
    description: "THE SURFACE IS READ BEFORE IT IS CARVED: run VISION-GUIDED SCULPT PLANNING on a library asset - the learned layer's read of the surface before any carve touches it. The asset's actual .blend is opened READ-ONLY and MEASURED by a deterministic probe (tris, verts, bbox, Laplacian roughness - the same detail metric the sculpt pass reports - its spread, tri density, and a flatness number where 1.0 is the clean builder slab the audit calls unfinished), then the asset's own preview PNG is shown TOGETHER WITH those numbers to the vision model, which plans the treatment in the studio's three-layer vocabulary (swell / fold / grain with intensities and scales). The planned layers compile through the SAME law design_sculpt obeys (unknown kinds and wild numbers refused at the boundary) and land as a NAMED SCULPT PLAN - the production's memory of how this kind of surface is finished. From then on blender_asset_build plan:'<name>' carves it (the pass's measured evidence grows the plan's record), and design_fix consults the kind's best-proven plan before any default recipe - every re-audit that stops raising SCULPT earns the plan a clear. The provider is named honestly (vision+local | local): when the vision pass cannot run, the plan degrades to the probe numbers alone and says so.",
    args: {
      refName: "string - the library asset whose surface is read",
      name: "string - the plan's name (e.g. 'cloudsea-terrain-v1')",
      kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE (default: the asset's own kind)",
      vision: "boolean (optional - default true; false plans from the probe numbers alone)",
    },
  },
  {
    name: "render_redirection",
    description: "THE FIX GRADUATES TO THE DIRECTION: when a reviewed render's issues are not the light's fault, stop re-lighting and RE-DIRECT. Run this on a finished render's pixel review after the parameter level has had its chance: INTENT issues are always direction-level (iteration 60's honest refusal), and any other kind escalates once its parameter fix already ran in this render's fixOf lineage and the pixels still raise it. The planner proposes CONCRETE re-directions in the compiled vocabulary - a directed WIND call on the widest beat, a re-shaped beat (hold + push-in), an AURA presence, MOTES for a stage that reads empty, the quietest fx program raised - every op CITES the issue that called for it (kind, severity, the review's own numbers). The proposal applies through the SAME compilers set_shot_grammar/set_shot_fx obey (a typo never reaches a shoot), queues a NEW attempt with the same fixOf lineage, and the fresh pixel review is THE JUDGE - by kind, the same law that judges a parameter fix. CONTRAST and PALETTE refuse even when escalated: contrast lives in the light law, palette in the materials - honesty outranks coverage. A one-move shot cannot be re-framed: direct a grammar first.",
    args: {
      sceneNumber: "number (defaults to latest scene)",
      shotNumber: "number (defaults to shot 1)",
      jobId: "string - optional explicit render job id (defaults to the shot's latest finished render)",
      issueIds: "JSON array of issue ids (optional - defaults to ALL open issues of the render's review)",
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

export async function executeTool(
  projectId: string,
  name: string,
  args: Record<string, unknown>,
  // The human whose turn this is (when the call comes from a DSH
  // turn or a plan run driven by a session). DSH-created rows that
  // carry membership (create_project) need the identity; system
  // callers (the scheduler) pass nothing and skip the seat.
  user?: { id: string; name: string; role: string } | null
): Promise<ActionResult> {
  // MEMBER ATTRIBUTION (iteration 68): every event the tool body
  // lands names the member driving it - the actor context rides the
  // whole async chain, so helper-ledger events inherit it too.
  return runWithActor(user?.id ?? null, () => executeToolInner(projectId, name, args, user));
}

async function executeToolInner(
  projectId: string,
  name: string,
  args: Record<string, unknown>,
  user?: { id: string; name: string; role: string } | null
): Promise<ActionResult> {
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
          publishEpisode: args.publishEpisode === undefined ? null : Number(args.publishEpisode),
          publishPlatform: args.publishPlatform === undefined ? null : String(args.publishPlatform ?? ""),
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
        const kindNote = s.kind === "PLAN_RUN" ? "runs an approved plan" : s.kind === "DAILY_DIGEST" ? "posts the daily digest to the creator" : s.kind === "PUBLISH_RUN" ? `stages EP${s.publishEpisode} for ${s.publishPlatform} on the delivery spine` : "render-queue supervision";
        const deliveryNote = s.kind === "DAILY_DIGEST" && (s.webhookUrl || s.digestEmail)
          ? ` Delivery: ${s.webhookUrl ? "webhook" : ""}${s.webhookUrl && s.digestEmail ? " + " : ""}${s.digestEmail ? "email" : ""}.`
          : "";
        return { status: "OK", result: `Schedule '${s.name}' registered (${kindNote}, ${s.cadenceLabel}${s.kind === "PLAN_RUN" ? `, maxSteps ${s.maxSteps}` : ""}).${deliveryNote} First fire: ${s.nextRunAt ?? "on the next tick"}. Every fire lands as a production event; the creator steers it from the scheduler panel (enable/disable/run now/delete).` };
      }

      case "schedule_release": {
        // THE RELEASE CALENDAR'S PEN (iteration 68): slate an episode
        // for its audience - a date and optionally a platform. The
        // calendar computes DUE/RELEASED at read time; the episode's
        // production status stays the render pipeline's truth.
        const seasonNumber = args.seasonNumber === undefined ? null : Number(args.seasonNumber);
        const epNumber = args.episodeNumber === undefined ? null : Number(args.episodeNumber);
        let episode = null as Awaited<ReturnType<typeof latestEpisode>> | null;
        if (epNumber !== null && Number.isFinite(epNumber)) {
          const where = {
            season: { projectId, ...(seasonNumber !== null && Number.isFinite(seasonNumber) ? { number: seasonNumber } : {}) },
            number: epNumber,
          };
          episode = await db.episode.findFirst({ where, orderBy: [{ season: { number: "asc" } }, { number: "asc" }], include: { season: true } });
        } else {
          episode = await latestEpisode(projectId);
        }
        if (!episode) return { status: "ERROR", result: "No episode matched - create one first (create_episode)." };
        const releaseArg = String(args.releaseAt ?? "").trim();
        const platformArg = String(args.platform ?? "").trim();
        if (releaseArg === "" && args.platform === undefined) {
          // unschedule: clear the date (and the platform with it)
          await db.episode.update({ where: { id: episode.id }, data: { releaseAt: null, releasePlatform: null } });
          await landDesignEvent(projectId, `EP${episode.number} unscheduled - off the release calendar`, { episodeId: episode.id });
          // v71: a date coming OFF the calendar is news the subscribed crew asked for
          const fanout = await notifyMembers(projectId, "RELEASE", `EP${episode.number} '${episode.title}' unscheduled`, [`EP${episode.number} '${episode.title}' is off the release calendar (still ${episode.status.toLowerCase()} in production).`]).catch(() => ({ reached: 0, refused: 0, failed: 0, skipped: 0 }));
          return { status: "OK", result: `EP${episode.number} '${episode.title}' unscheduled - it is off the release calendar (still ${episode.status.toLowerCase()} in production). ${describeFanout(fanout)}` };
        }
        const data: { releaseAt?: Date | null; releasePlatform?: string | null } = {};
        if (args.platform !== undefined) data.releasePlatform = platformArg ? platformArg.slice(0, 40) : null;
        if (releaseArg !== "") {
          const parsed = new Date(releaseArg);
          if (Number.isNaN(parsed.getTime())) {
            return { status: "ERROR", result: `releaseAt '${releaseArg}' is not a date ISO understands (e.g. '2026-03-14' or '2026-03-14T18:00:00Z').` };
          }
          data.releaseAt = parsed;
        }
        await db.episode.update({ where: { id: episode.id }, data });
        const slated = data.releaseAt !== undefined ? data.releaseAt : episode.releaseAt;
        const platform = data.releasePlatform !== undefined ? data.releasePlatform : episode.releasePlatform;
        const due = slated ? slated.getTime() < Date.now() : false;
        await landDesignEvent(projectId, `EP${episode.number} slated for ${slated ? slated.toISOString().slice(0, 10) : "no date"}${platform ? ` on ${platform}` : ""} - the release calendar holds it`, { episodeId: episode.id, releaseAt: slated ? slated.toISOString() : null, platform: platform ?? null });
        // v71: PER-MEMBER OUTBOUND - the subscribed crew hears the slate
        const fanout = await notifyMembers(projectId, "RELEASE", `EP${episode.number} slated for ${slated ? slated.toISOString().slice(0, 10) : "no date"}${platform ? ` on ${platform}` : ""}`, [`EP${episode.number} '${episode.title}' is slated for ${slated ? slated.toISOString().slice(0, 10) : "no date"}${platform ? ` on ${platform}` : ""} - the release calendar holds it${due ? " (that date is already PAST - the calendar reads it RELEASED)" : ""}.`]).catch(() => ({ reached: 0, refused: 0, failed: 0, skipped: 0 }));
        const nextUp = await db.episode.findMany({
          where: { season: { projectId }, releaseAt: { gt: new Date() } },
          orderBy: { releaseAt: "asc" },
          take: 2,
          select: { number: true, releaseAt: true, releasePlatform: true },
        });
        const nextLine = nextUp.length > 0 ? ` Next up: ${nextUp.map((e) => `EP${e.number} ${e.releaseAt ? e.releaseAt.toISOString().slice(0, 10) : "?"}${e.releasePlatform ? ` (${e.releasePlatform})` : ""}`).join(", ")}.` : "";
        return { status: "OK", result: `EP${episode.number} '${episode.title}' slated for ${slated ? slated.toISOString().slice(0, 10) : "(no date - unscheduled)"}${platform ? ` on ${platform}` : ""}${due ? " - that date is already PAST, the calendar reads it RELEASED" : ""}.${nextLine} ${describeFanout(fanout)} The Releases view holds the calendar; the episode's production status (${episode.status}) stays the render pipeline's truth.` };
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
        // The silo rule applies to DSH-made productions too: the
        // creator lands a DIRECTING seat on what they made (the same
        // parity POST /api/projects grants), so the new production is
        // on THEIR slate - not lost in a silo only the OWNER can see.
        if (user) {
          await db.projectMembership
            .upsert({
              where: { projectId_userId: { projectId: project.id, userId: user.id } },
              create: { projectId: project.id, userId: user.id, craft: "DIRECTING" },
              update: {},
            })
            .catch(() => null);
        }
        return { status: "OK", result: `Production '${project.title}' created (${project.visualStyle}/${project.animationType}/${project.originalLanguage}). Season 1 initialized.${user ? ` You lead its crew (DIRECTING).` : ""} New active project id: ${project.id}` };
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
        // THE BAR IS MEASURED: the source picks what is judged and which
        // bar answers - panels at the 60% repaint line, shipping render
        // frames at the 70% bar the cut answers to.
        const sourceArg = String(args.source ?? "panel").trim().toLowerCase() === "render" ? "RENDER" : "PANEL";
        const barFor = identityThresholdFor(sourceArg);
        const barName = sourceArg === "RENDER" ? `${Math.round(IDENTITY_RENDER_THRESHOLD * 100)}% shipping-pixel` : `${Math.round(IDENTITY_REPAINT_THRESHOLD * 100)}% panel`;
        // batch mode: worst existing scores first, then never-scored panels
        if (args.limit !== undefined && args.limit !== null && String(args.limit) !== "") {
          const limit = Number(args.limit);
          const result = await scoreProjectIdentity(projectId, Number.isFinite(limit) ? limit : 4, sourceArg);
          if (result.scored.length === 0 && result.errors.length === 0) {
            return { status: "ERROR", result: sourceArg === "RENDER"
              ? "No finished render with an anchored (sheeted) cast to score - render the shots first (render_shot), then measure again."
              : "No art-bearing panel with an anchored (sheeted) cast to score - generate panel art and model sheets first." };
          }
          const lines = result.scored.map((s) => `${s.ref}: ${s.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(s.verdict.worst * 100).toFixed(0)}%`);
          const errLines = result.errors.map((e) => `${e.ref}: ${e.error}`);
          const offer = sourceArg === "RENDER" ? "re-render offer (render_shot / render_fix)" : "re-paint offer (generate_panel_art)";
          return { status: "OK", result: `Identity pass scored ${result.scored.length} ${sourceArg === "RENDER" ? "render(s)" : "panel(s)"}, worst-first:\n${lines.join("\n")}${errLines.length ? `\nSkipped:\n${errLines.join("\n")}` : ""}\nA worst below the ${barName} bar lands an IDENTITY_DRIFT event and earns a ${offer}, then score again to confirm the fix.` };
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
        const result = sourceArg === "RENDER" ? await scoreRenderIdentity(shotId) : await scoreShotIdentity(shotId);
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
        const drifted = s.verdict.worst < barFor;
        const offer = sourceArg === "RENDER"
          ? `the shipping pixels earned an IDENTITY_DRIFT event and a re-render offer: fix the pixels (render_fix or re-render) and score again to confirm`
          : `the panel earned an IDENTITY_DRIFT event and a re-paint offer: regenerate the panel (generate_panel_art) and score again to confirm`;
        return { status: "OK", result: `Identity score for ${s.ref} (${sourceArg.toLowerCase()} source): ${s.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(s.verdict.worst * 100).toFixed(0)}%${s.verdict.note ? ` (${s.verdict.note})` : ""}.${aspectLine}${affLine} ${drifted ? `That is below the ${barName} identity bar - ${offer}.` : "An IDENTITY_VERIFIED event recorded the panel."}` };
      }

      case "reanchor_character": {
        const name = String(args.characterName ?? "").trim();
        if (!name) return { status: "ERROR", result: "characterName is required." };
        const rawRescore = Number(args.rescore ?? REANCHOR_DEFAULT_RESCORE);
        const result = await reanchorByName(projectId, name, {
          rescore: Number.isFinite(rawRescore) ? rawRescore : REANCHOR_DEFAULT_RESCORE,
          actor: "DSH",
        });
        if (!result.ok) return { status: "ERROR", result: `Re-anchor failed: ${result.error}` };
        const r = result.result;
        const rescoreLine = r.rescored.length > 0
          ? ` Re-scored ${r.rescored.length} recent panel(s) against the NEW sheet: ${r.rescored.map((s) => `${s.ref} ${s.entryForCharacter != null ? `${r.characterName} ${(s.entryForCharacter * 100).toFixed(0)}%` : `worst ${(s.worst * 100).toFixed(0)}%`}`).join(", ")}.`
          : "";
        const errLine = r.rescoreErrors.length > 0 ? ` Re-score skips: ${r.rescoreErrors.map((e) => `${e.ref} (${e.error})`).join("; ")}.` : "";
        return { status: "OK", result: `Re-anchored ${r.characterName}: the canonical model sheet was regenerated from the current design text and the IDENTITY_REANCHOR event marks the baseline restart (the drift curve keeps the old points as history but the trend now measures the NEW sheet). New anchor: ${r.newAnchor.slice(0, 220)}${r.newAnchor.length > 220 ? "..." : ""}.${rescoreLine}${errLine} Future panel art carries the new anchor automatically; score more panels with score_panel_identity to confirm the curve is climbing.` };
      }

      case "studio_pulse": {
        const pulse = await studioPulse(projectId);
        return { status: "OK", result: pulse.lines.join("\n") };
      }

      case "post_digest": {
        const hours = Number(args.hours ?? 24);
        const window = Number.isFinite(hours) ? hours : 24;
        const memberRef = String(args.member ?? "").trim();
        if (memberRef) {
          // ONE MEMBER's digest (iteration 68): what that person
          // actually caused in the window - attributed events + comments
          const result = await postMemberDigest(projectId, memberRef, window);
          if (!result.ok) return { status: "ERROR", result: result.error ?? "the member digest failed to build" };
          // v71: the member's own channels get their digest too (if they
          // subscribed) - every attempt lands on the delivery ledger
          const memberRow = await db.user.findFirst({
            where: { OR: [{ email: { equals: memberRef.trim() } }, { name: { equals: memberRef.trim() } }] },
            select: { id: true, email: true, notifyWebhook: true, notifyEmail: true },
          });
          const fan = memberRow ? await deliverToMember(memberRow, "DIGEST", result.digest.headline, result.digest.lines, projectId) : [];
          const fanLine = memberRow && fan.length > 0 ? ` Outbound: ${fan.filter((f) => f.ok).length}/${fan.length} channel(s) reached${fan.some((f) => !f.ok) ? " (the delivery ledger names the rest)" : ""}.` : "";
          return { status: "OK", result: `Member digest posted for ${result.digest.name} (last ${window}h):\n${result.digest.headline}\n${result.digest.lines.join("\n")}\nThe digest panel keeps the history; the dashboard's studio floor shows every member's digest live.${fanLine}` };
        }
        const result = await postDailyDigest(projectId, window);
        if (!result.ok) return { status: "ERROR", result: result.error ?? "the digest failed to build" };
        // v71: PER-MEMBER OUTBOUND - subscribed members (crew + OWNERs)
        // get the digest pushed to their own channels, honestly ledgered
        const fanout = await notifyMembers(projectId, "DIGEST", result.digest.headline, result.digest.lines).catch(() => ({ reached: 0, refused: 0, failed: 0, skipped: 0 }));
        return { status: "OK", result: `Digest posted to the creator (last ${result.digest.windowHours}h, ${result.digest.events} production event(s)):\n${result.digest.lines.join("\n")}\n${describeFanout(fanout)}\nThe digest panel on this view keeps the history; a DAILY_DIGEST schedule (create_schedule) posts one automatically on its cadence.` };
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

      case "blender_exec": {
        const script = String(args.script ?? "").trim();
        const purpose = String(args.purpose ?? "blender designer pass").trim();
        if (!script) return { status: "ERROR", result: "script is required - a complete python script using bpy." };
        if (!/\bbpy\b/.test(script)) {
          return { status: "ERROR", result: "this seam runs Blender python: the script must import or use bpy." };
        }
        const res = await runBlenderScript(script, purpose.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "designer");
        const note = res.ok
          ? `bpy pass done (${purpose}): artifacts ${res.artifacts.length ? res.artifacts.map((a) => a.split("/").pop()).join(", ") : "none on disk"}`
          : `bpy pass failed: ${res.log.slice(-400)}`;
        return { status: res.ok ? "OK" : "ERROR", result: `${note}\n\nOutput tail:\n${res.log.slice(-1200)}` };
      }

      case "blender_viewport_shot": {
        const refName = String(args.refName ?? "").trim();
        const kindRaw = String(args.kind ?? "CHARACTER").toUpperCase();
        if (!isBlenderAssetKind(kindRaw)) {
          return { status: "ERROR", result: "kind must be CHARACTER, ENVIRONMENT, PROP or CREATURE." };
        }
        if (!refName) return { status: "ERROR", result: "refName is required." };
        const asset = await db.blenderAsset.findUnique({
          where: { projectId_kind_refName: { projectId, kind: kindRaw, refName } },
        });
        if (!asset) return { status: "ERROR", result: `No ${kindRaw.toLowerCase()} asset for "${refName}" - design one first with blender_asset_build.` };
        const res = await refreshAssetPreview(asset.id);
        if (!res.ok) return { status: "ERROR", result: `Preview refresh failed: ${res.log.slice(-300)}` };
        return { status: "OK", result: `Preview re-rendered for ${kindRaw.toLowerCase()} ${refName} (v${asset.version}) from its accepted .blend - ${res.previewPath ?? "no preview path"}. The preview is a lit 512px Cycles frame of the asset alone under its designed rig; the render worker still owns shot lighting.` };
      }

      case "blender_asset_build": {
        const kindRaw = String(args.kind ?? "").toUpperCase();
        if (!isBlenderAssetKind(kindRaw)) {
          return { status: "ERROR", result: "kind must be CHARACTER, ENVIRONMENT, PROP or CREATURE." };
        }
        const refName = String(args.refName ?? "").trim();
        if (!refName) return { status: "ERROR", result: "refName is required - the exact name of the thing being designed." };
        const guidance = String(args.guidance ?? "").trim() || null;
        const res = await buildBlenderAsset(projectId, kindRaw, refName, guidance, {
          materialName: String(args.material ?? "").trim() || null,
          lightingName: String(args.lighting ?? "").trim() || null,
          motionName: String(args.motion ?? "").trim() || null,
          variationName: String(args.variation ?? "").trim() || null,
          sculptName: String(args.sculpt ?? "").trim() || null,
          planName: String(args.plan ?? "").trim() || null,
        });
        if (!res.ok) return { status: "ERROR", result: `Asset build failed for ${refName}: ${res.log.slice(-400)}` };
        const inspectHint = kindRaw === "CHARACTER"
          ? " Run blender_asset_inspect on it to see where identity stands against the sheet."
          : "";
        const rideHint = kindRaw === "PROP" || kindRaw === "CREATURE"
          ? " Every render whose shot text names it now loads this asset."
          : kindRaw === "CHARACTER"
            ? " Every render job of this exact cast now loads this asset instead of rebuilding procedural stand-ins."
            : " Every render job of this exact environment now loads this asset.";
        const paintClause = typeof res.paintMaps === "number" && res.paintMaps > 0
          ? `, painted (${res.paintMaps} surface maps)`
          : "";
        return { status: "OK", result: `DESIGNED ${kindRaw.toLowerCase()} asset built and accepted into the library: ${refName} v${res.version} - ${res.objects} objects, ${res.tris.toLocaleString()} tris${paintClause}, ${(res.buildMs / 1000).toFixed(1)}s in the Blender runtime${guidance ? ` (guidance recorded: "${guidance}")` : ""}.${rideHint} Next professional step: design_audit on it, then design_fix for whatever it finds.${inspectHint}` };
      }

      case "blender_asset_inspect": {
        const refName = String(args.refName ?? "").trim();
        if (!refName) return { status: "ERROR", result: "refName is required." };
        const asset = await db.blenderAsset.findFirst({
          where: { projectId, refName, kind: { in: ["CHARACTER", "ENVIRONMENT", "PROP", "CREATURE"] } },
        });
        if (!asset) return { status: "ERROR", result: `No library asset named "${refName}" - design one first with blender_asset_build.` };
        const res = await inspectBlenderAsset(asset.id);
        if (!res.ok) return { status: "ERROR", result: `Asset inspection failed: ${res.error}` };
        if (res.skipped) return { status: "OK", result: `${res.note} (environment assets are judged on the render pass, not the preview).` };
        const pct = res.score !== null ? `${Math.round(res.score * 100)}%` : "n/a";
        return { status: "OK", result: `Asset identity for ${refName}: ${pct} vs the canonical sheet${res.note ? ` - ${res.note}` : ""}. The stylized-procedural gap is expected to keep this honest and low; iterate with blender_asset_build + blender_exec and re-inspect.` };
      }

      case "blender_asset_library": {
        const lib = await blenderAssetLibrary(projectId);
        if (lib.total === 0) {
          return { status: "OK", result: "The Blender asset library is empty - no DESIGNED .blend assets yet. Design the cast, environments, props and creatures with blender_asset_build (design once, render many: ready assets are loaded by every render job of that cast/environment, and props/creatures ride renders whose shot text names them)." };
        }
        const avg = lib.avgIdentity !== null ? `${Math.round(lib.avgIdentity * 100)}%` : "not yet scored";
        const rows = lib.assets.map((a) => {
          const score = a.identityScore !== null ? `${Math.round(a.identityScore * 100)}%` : "-";
          const motion = a.motionPreset ? `, performing '${a.motionPreset}'${a.loopPath ? " (loop on file)" : ""}` : ", motionless";
          const variation = a.variationPreset ? ", varied" : a.kind === "ENVIRONMENT" ? ", WALLPAPER (no variation)" : "";
          const sculpt = a.sculptPreset ? ", sculpted" : a.kind === "ENVIRONMENT" || a.kind === "CREATURE" ? ", UNFINISHED SURFACE (no sculpt)" : "";
          return `${a.kind.toLowerCase().padEnd(6)} ${a.refName}: ${a.status} v${a.version}, identity ${score}${motion}${variation}${sculpt}, ${a.previewPath ?? "no preview"}`;
        });
        return { status: "OK", result: `Blender asset library: ${lib.total} assets (${lib.ready} ready, ${lib.failed} failed, ${lib.building} building), average accepted identity ${avg}.\n${rows.join("\n")}\nReady assets ride every matching render payload. The professional loop runs on top: design_audit to check back, design_fix to correct, design_status for the standing.` };
      }

      case "design_material": {
        const name = String(args.name ?? "").trim();
        if (!name) return { status: "ERROR", result: "name is required - the recipe's name." };
        const spec: Record<string, unknown> = {};
        if (args.baseColor) spec.baseColor = String(args.baseColor);
        if (args.roughness !== undefined) spec.roughness = Math.max(0, Math.min(1, Number(args.roughness)));
        if (args.metallic !== undefined) spec.metallic = Math.max(0, Math.min(1, Number(args.metallic)));
        if (args.ior !== undefined) spec.ior = Math.max(0, Math.min(2, Number(args.ior)));
        if (args.emissionColor) spec.emissionColor = String(args.emissionColor);
        if (args.emissionStrength !== undefined) spec.emissionStrength = Math.max(0, Number(args.emissionStrength));
        if (Object.keys(spec).length === 0) {
          return { status: "ERROR", result: "give the recipe at least one parameter (baseColor, roughness, metallic, ior, emissionColor, emissionStrength)." };
        }
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "MATERIAL", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "MATERIAL", name } },
          create: { projectId, kind: "MATERIAL", name, spec: JSON.stringify(spec) },
          update: { spec: JSON.stringify(spec) },
        });
        await landDesignEvent(projectId, `Material recipe '${name}' ${existed ? "updated" : "designed"} (${Object.keys(spec).join(", ")})`, { presetId: preset.id });
        return { status: "OK", result: `MATERIAL recipe '${name}' ${existed ? "updated" : "registered"}: ${JSON.stringify(spec)}. Builds that pass material:'${name}' get this recipe as LAW over the DNA defaults - e.g. blender_asset_build with kind, refName and material:'${name}'. The design_material registry grows once per recurring surface; prefer it over restating hex codes.` };
      }

      case "design_lighting": {
        const name = String(args.name ?? "").trim();
        if (!name) return { status: "ERROR", result: "name is required - the rig's name." };
        const spec: Record<string, unknown> = {};
        for (const key of ["keyEnergy", "fillEnergy", "rimEnergy", "bgStrength", "camLens"] as const) {
          if (args[key] !== undefined) spec[key] = Number(args[key]);
        }
        for (const key of ["keyColor", "fillColor", "rimColor"] as const) {
          if (args[key]) spec[key] = String(args[key]);
        }
        if (Object.keys(spec).length === 0) {
          return { status: "ERROR", result: "give the rig at least one parameter (keyEnergy, keyColor, fillEnergy, fillColor, rimEnergy, rimColor, bgStrength, camLens)." };
        }
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "LIGHTING", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "LIGHTING", name } },
          create: { projectId, kind: "LIGHTING", name, spec: JSON.stringify(spec) },
          update: { spec: JSON.stringify(spec) },
        });
        await landDesignEvent(projectId, `Lighting rig '${name}' ${existed ? "updated" : "designed"} (${Object.keys(spec).join(", ")})`, { presetId: preset.id });
        return { status: "OK", result: `LIGHTING rig '${name}' ${existed ? "updated" : "registered"}: ${JSON.stringify(spec)}. Asset previews built with lighting:'${name}' are judged under YOUR rig instead of the neutral default; the render worker still owns shot lighting.` };
      }

      case "design_motion": {
        const compiled = compileMotionSpec({
          name: String(args.name ?? ""),
          kind: String(args.kind ?? ""),
          motion: String(args.motion ?? ""),
          speed: args.speed !== undefined ? Number(args.speed) : null,
          amplitude: args.amplitude !== undefined ? Number(args.amplitude) : null,
          cycleFrames: args.cycleFrames !== undefined ? Number(args.cycleFrames) : null,
        });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const { name } = compiled.spec;
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "MOTION", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "MOTION", name } },
          create: { projectId, kind: "MOTION", name, spec: JSON.stringify(compiled.spec) },
          update: { spec: JSON.stringify(compiled.spec) },
        });
        await landDesignEvent(projectId, `Motion preset '${name}' ${existed ? "updated" : "designed"} (${compiled.spec.motion}, x${compiled.spec.speed} speed, x${compiled.spec.amplitude} reach)`, { presetId: preset.id });
        return { status: "OK", result: `MOTION preset '${name}' ${existed ? "updated" : "registered"}: ${compiled.spec.motion} at speed ${compiled.spec.speed}, amplitude ${compiled.spec.amplitude}, ${compiled.spec.cycleFrames} frame loop. Rebuild the asset with motion:'${name}' (blender_asset_build) and the rig bakes it as a real armature performance inside the .blend, with the animated preview loop as proof - riding renders then show it performing live.` };
      }

      case "design_variation": {
        const compiled = compileVariationSpec({
          name: String(args.name ?? ""),
          variation: String(args.variation ?? ""),
          count: args.count !== undefined ? Number(args.count) : null,
          seed: args.seed !== undefined ? Number(args.seed) : null,
          scaleJitter: args.scaleJitter !== undefined ? Number(args.scaleJitter) : null,
          rotJitter: args.rotJitter !== undefined ? Number(args.rotJitter) : null,
          spread: args.spread !== undefined ? Number(args.spread) : null,
          layout: args.layout !== undefined ? String(args.layout) : null,
          carrier: args.carrier !== undefined ? String(args.carrier) : null,
          source: args.source !== undefined ? String(args.source) : null,
        });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const { name } = compiled.spec;
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "VARIATION", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "VARIATION", name } },
          create: { projectId, kind: "VARIATION", name, spec: JSON.stringify(compiled.spec) },
          update: { spec: JSON.stringify(compiled.spec) },
        });
        await landDesignEvent(projectId, `Variation preset '${name}' ${existed ? "updated" : "designed"} (${compiled.spec.variation} x${compiled.spec.count}, seed ${compiled.spec.seed})`, { presetId: preset.id });
        return { status: "OK", result: `VARIATION preset '${name}' ${existed ? "updated" : "registered"}: ${compiled.spec.variation} x${compiled.spec.count} at seed ${compiled.spec.seed} (scale jitter ${compiled.spec.scaleJitter}, rot jitter ${compiled.spec.rotJitter}). Rebuild the asset with variation:'${name}' (blender_asset_build) and a REAL Geometry Nodes tree lands inside the .blend - seeded, deterministic, traveling to every render. An environment built without one is a wallpaper.` };
      }

      case "blender_export": {
        const refName = String(args.refName ?? "").trim();
        if (!refName) return { status: "ERROR", result: "refName is required." };
        const kindRaw = String(args.kind ?? "PROP").toUpperCase();
        const asset = await db.blenderAsset.findFirst({
          where: { projectId, refName, ...(isBlenderAssetKind(kindRaw) ? { kind: kindRaw } : {}) },
          orderBy: { updatedAt: "desc" },
        }) ?? await db.blenderAsset.findFirst({ where: { projectId, refName }, orderBy: { updatedAt: "desc" } });
        if (!asset) return { status: "ERROR", result: `No library asset named "${refName}" - design one first with blender_asset_build.` };
        const format = String(args.format ?? "GLB").toUpperCase();
        if (!isExportFormat(format)) return { status: "ERROR", result: `format must be GLB or FBX (got "${format}").` };
        const verify = args.verify === undefined ? true : Boolean(args.verify);
        const res = await runRoundtrip(asset.id, format, verify);
        if (!res.ok) return { status: "ERROR", result: `EXPORT FAILED for ${refName}: ${res.error}` };
        const rep = res.report;
        if (!rep) return { status: "ERROR", result: "the round-trip report went missing - check the runtime log" };
        const failedChecks = (rep.checks ?? []).filter((c) => !c.ok);
        const checksLine = (rep.checks ?? []).length
          ? `Checks: ${(rep.checks as Array<{ name: string; ok: boolean; detail: string }>).map((c) => `${c.ok ? "+" : "x"} ${c.name} (${c.detail})`).join(", ")}`
          : "";
        const verdict = res.verified
          ? `VERIFIED - every check green (${(rep.checks ?? []).length} checks: ${(rep.checks as Array<{ name: string; ok: boolean }>).map((c) => c.name).join(", ")}); ${rep.meshesRe}/${rep.meshesSrc} meshes, tri delta ${rep.triDeltaPct}%, bbox delta ${rep.bboxDeltaPct}%`
          : `NOT VERIFIED - ${failedChecks.length || 1} check(s) failed: ${failedChecks.map((c) => `${c.name}: ${c.detail}`).join("; ") || `${rep.meshesRe}/${rep.meshesSrc} meshes, tri delta ${rep.triDeltaPct}%, bbox delta ${rep.bboxDeltaPct}%${rep.missing.length ? `, missing: ${rep.missing.join(", ")}` : ""}`}`;
        return { status: "OK", result: `EXPORT ${format}: ${refName} -> ${res.publicPath ?? rep.path} (${(rep.bytes / 1024).toFixed(0)}KB)\n${verdict}\n${checksLine ? `${checksLine}\n` : ""}Format notes: ${rep.notes.join(" ")}\n${res.verified ? "The file is deliverable - a game engine, a contractor DCC or a QC lane can eat it." : "Do NOT ship an unverified export - rebuild or refine, then export again."}` };
      }

      case "design_sculpt": {
        let layersRaw: unknown = null;
        try {
          layersRaw = args.layers !== undefined ? JSON.parse(String(args.layers)) : null;
        } catch {
          return { status: "ERROR", result: "layers must be a JSON array string, e.g. [{\"kind\":\"swell\"},{\"kind\":\"fold\",\"intensity\":0.8}]" };
        }
        const compiled = compileSculptSpec({
          name: String(args.name ?? ""),
          layers: layersRaw,
          subdivision: args.subdivision !== undefined ? Number(args.subdivision) : null,
          seed: args.seed !== undefined ? Number(args.seed) : null,
          parts: args.parts !== undefined ? String(args.parts) : null,
        });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const { name } = compiled.spec;
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "SCULPT", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "SCULPT", name } },
          create: { projectId, kind: "SCULPT", name, spec: JSON.stringify(compiled.spec) },
          update: { spec: JSON.stringify(compiled.spec) },
        });
        const shape = compiled.spec.layers.map((l) => l.kind).join(" + ");
        await landDesignEvent(projectId, `Sculpt recipe '${name}' ${existed ? "updated" : "designed"} (${shape}, subdivision ${compiled.spec.subdivision}, seed ${compiled.spec.seed})`, { presetId: preset.id });
        return { status: "OK", result: `SCULPT preset '${name}' ${existed ? "updated" : "registered"}: ${shape} carved at subdivision ${compiled.spec.subdivision}, seed ${compiled.spec.seed}${compiled.spec.parts.length ? `, parts: ${compiled.spec.parts.join(", ")}` : ", every mesh"}. Rebuild the asset with sculpt:'${name}' (blender_asset_build) and the layered detail is carved INTO the .blend - deterministic, with the variance before/after as the evidence. An environment or creature left on the clean builder slab is an unfinished design.` };
      }

      case "blender_retopo": {
        const refName = String(args.refName ?? "").trim();
        if (!refName) return { status: "ERROR", result: "refName is required." };
        const kindRaw = String(args.kind ?? "PROP").toUpperCase();
        const asset = await db.blenderAsset.findFirst({
          where: { projectId, refName, ...(isBlenderAssetKind(kindRaw) ? { kind: kindRaw } : {}) },
          orderBy: { updatedAt: "desc" },
        }) ?? await db.blenderAsset.findFirst({ where: { projectId, refName }, orderBy: { updatedAt: "desc" } });
        if (!asset) return { status: "ERROR", result: `No library asset named "${refName}" - design one first with blender_asset_build.` };
        if (!asset.blendPath || asset.status !== "READY") {
          return { status: "ERROR", result: `${refName} has no accepted .blend on disk - rebuild it first (blender_asset_build).` };
        }
        // THE STUDIO REMEMBERS ITS CRAFT (iteration 60): a learned flow
        // drives the pass with the budget/parts that verified before,
        // and the measured outcome grows the flow's record.
        const flowName = String(args.flow ?? "").trim();
        const flow = flowName ? await findRetopoFlow(projectId, asset.kind, flowName) : null;
        if (flowName && !flow) {
          return { status: "ERROR", result: `No learned retopo flow named "${flowName}" in this production - learn one from a verified run (learn_retopo_flow with refName) or run the pass on the kind's budget law.` };
        }
        const flowSpec = flow?.spec ?? null;
        const compiled = compileRetopoSpec({
          budget: args.budget !== undefined ? Number(args.budget) : flowSpec ? flowSpec.budget : (DEFAULT_RETOPO_BUDGET[asset.kind] ?? 20_000),
          parts: args.parts !== undefined ? String(args.parts) : flowSpec ? flowSpec.parts.join(",") : null,
        });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const project = await db.project.findUnique({ where: { id: asset.projectId }, select: { title: true } });
        const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "asset";
        const workDir = path.join(process.cwd(), "assets", "blender", slugOf(project?.title ?? "project"), asset.kind.toLowerCase(), `${slugOf(asset.refName)}-retopo-v${asset.version + 1}`);
        fs.mkdirSync(workDir, { recursive: true });
        const retopoFile = writeRetopoSpec(compiled.spec, workDir);
        const dnaFile = path.join(workDir, "retopo-dna.json");
        fs.writeFileSync(dnaFile, JSON.stringify({ name: asset.refName }));
        const run = await runAssetBuilder({
          kind: asset.kind as BlenderAssetKind,
          dnaPath: dnaFile,
          outDir: workDir,
          name: asset.refName,
          fromBlend: asset.blendPath,
          retopoPath: retopoFile,
          timeoutMs: 6 * 60_000,
        });
        if (!run.ok || !run.blendPath || !fs.existsSync(run.blendPath)) {
          await db.blenderAsset.update({ where: { id: asset.id }, data: { buildLog: run.log.slice(-4000) } });
          return { status: "ERROR", result: `RETOPO FAILED for ${refName}: ${run.log.slice(-300)}` };
        }
        const summary = run.retopoSummary ?? {};
        const newMeta = (() => { try { return JSON.parse(asset.meta || "{}") as Record<string, unknown>; } catch { return {}; } })();
        await db.blenderAsset.update({
          where: { id: asset.id },
          data: {
            version: asset.version + 1,
            blendPath: run.blendPath,
            previewPath: run.previewPath ? `/assets-blender/${asset.id}.png` : asset.previewPath,
            buildLog: run.log.slice(-4000),
            meta: JSON.stringify({
              ...newMeta,
              tris: run.tris,
              objects: run.objects,
              retopo: { ...summary, bakedBy: "blender_retopo", budget: compiled.spec.budget, ...(flow ? { flow: flow.name } : {}) },
            }).slice(0, 4000),
          },
        });
        // The flow's record grows with whatever the pass measured -
        // a flow's failures are part of its lesson.
        if (flow) {
          await recordRetopoOutcome(projectId, flow.kind, flow.name, {
            assetRef: `${asset.kind}:${asset.refName} v${asset.version + 1}`,
            trisBefore: typeof summary.trisBefore === "number" ? summary.trisBefore : null,
            trisAfter: typeof summary.trisAfter === "number" ? summary.trisAfter : null,
            driftPct: typeof summary.driftPct === "number" ? summary.driftPct : null,
            verified: Boolean(summary.verified),
          });
        }
        await landDesignEvent(
          asset.projectId,
          `Retopo pass: ${asset.kind.toLowerCase()} ${asset.refName} v${asset.version} -> v${asset.version + 1} (${summary.trisBefore ?? "?"} -> ${summary.trisAfter ?? "?"} tris toward a ${compiled.spec.budget.toLocaleString()} budget${flow ? `, flow '${flow.name}'` : ""}, drift ${summary.driftPct ?? "?"}%, ${summary.verified ? "VERIFIED" : "NOT VERIFIED"})`,
          { assetId: asset.id, summary },
        );
        const flowNote = flow ? ` Flow '${flow.name}' drove the pass (now ${flow.runs + 1} run(s) on record, ${flow.clears} clear(s)).` : "";
        const learnHint = summary.verified && !flow ? ` Verified with no named flow behind it - worth remembering: learn_retopo_flow (name it, kind ${asset.kind}, budget ${compiled.spec.budget}) so the next ${asset.kind.toLowerCase()} retopo starts here and design_fix prefers it.` : "";
        return { status: "OK", result: `RETOPO ${summary.verified ? "VERIFIED" : "NOT VERIFIED"}: ${refName} v${asset.version} -> v${asset.version + 1} - ${summary.trisBefore ?? "?"} -> ${summary.trisAfter ?? "?"} tris toward the ${compiled.spec.budget.toLocaleString()} budget${flow ? ` (flow '${flow.name}')` : ""}, bbox drift ${summary.driftPct ?? "?"}%${summary.ratioFloorHit ? " (the ratio floor bit: the budget cannot be honored without butchering the shape - report it honestly)" : ""}.${flowNote}${learnHint} ${summary.verified ? "The shape survived - the asset ships at its budget." : "The drift or the budget failed the verdict - do not ship it; refine and re-run."}` };
      }

      case "design_grammar": {
        const compiled = compileGrammarSpec({ name: String(args.name ?? ""), beats: args.beats });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const { name } = compiled.spec;
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "GRAMMAR", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "GRAMMAR", name } },
          create: { projectId, kind: "GRAMMAR", name, spec: JSON.stringify(compiled.spec) },
          update: { spec: JSON.stringify(compiled.spec) },
        });
        const shape = compiled.spec.beats.map((b) => `${b.move} ${Math.round(b.from * 100)}-${Math.round(b.to * 100)}%`).join(" -> ");
        await landDesignEvent(projectId, `Grammar preset '${name}' ${existed ? "updated" : "designed"} (${shape})`, { presetId: preset.id });
        return { status: "OK", result: `GRAMMAR preset '${name}' ${existed ? "updated" : "registered"}: ${shape}. Apply it to any shot with set_shot_grammar grammar:'${name}' - the worker plays the camera beat by beat, crossfading between beats, and a beat's own pose pair moves the subject with the lens.` };
      }

      case "set_shot_grammar": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const grammarArg = String(args.grammar ?? "").trim();
        if (!grammarArg) {
          await db.shot.update({ where: { id: shot.id }, data: { grammar: null } });
          await landDesignEvent(projectId, `Grammar cleared on Shot ${String(shot.number).padStart(3, "0")} (back to its single movement)`, { shotId: shot.id });
          return { status: "OK", result: `GRAMMAR cleared on Shot ${String(shot.number).padStart(3, "0")} - it renders on its single movement (${shot.movement ?? "STATIC"}) again.` };
        }
        // the shot's SOLVER calls (iterations 68-69): a CLOTH or FLESH
        // call is one number 0..1 for the whole shot - pass it with the
        // grammar or alone on a later call; an explicit "" clears back
        // to the full probed response. Absent leaves the standing call.
        let clothPatch: number | null | undefined;
        if ("cloth" in args) {
          const clothParsed = compileSlotCloth(args.cloth, "cloth");
          if (!clothParsed.ok) return { status: "ERROR", result: clothParsed.error };
          clothPatch = clothParsed.cloth;
        }
        let fleshPatch: number | null | undefined;
        if ("flesh" in args) {
          const fleshParsed = compileSlotFlesh(args.flesh, "flesh");
          if (!fleshParsed.ok) return { status: "ERROR", result: fleshParsed.error };
          fleshPatch = fleshParsed.flesh;
        }
        // resolve: saved GRAMMAR preset -> built-in -> inline beats
        const resolved = await resolveGrammarSource(projectId, grammarArg);
        if (!resolved) {
          const registry = [
            ...BUILT_IN_GRAMMARS.map((g) => `'${g.name}' (built-in)`),
            ...((await db.designPreset.findMany({ where: { projectId, kind: "GRAMMAR" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
          ];
          return { status: "ERROR", result: `No grammar named '${grammarArg}'. Registry: ${registry.join(", ")} - or pass an inline beats JSON array like [{\"move\":\"CRANE\",\"from\":0,\"to\":0.5},{\"move\":\"DOLLY_IN\",\"from\":0.5,\"to\":1}].` };
        }
        const { beatsRaw, sourceName } = resolved;
        const compiled = compileGrammarSpec({ name: `${shot.id.slice(-6)}-shot-grammar`, beats: beatsRaw });
        if (!compiled.ok) return { status: "ERROR", result: `the ${sourceName} beats do not compile: ${compiled.error}` };
        await db.shot.update({ where: { id: shot.id }, data: { grammar: serializeGrammar(compiled.spec), ...(clothPatch !== undefined ? { cloth: clothPatch } : {}), ...(fleshPatch !== undefined ? { flesh: fleshPatch } : {}) } });
        const shape = compiled.spec.beats.map((b) => `${b.move} ${Math.round(b.from * 100)}-${Math.round(b.to * 100)}%`).join(" -> ");
        const poseBeats = compiled.spec.beats.filter((b) => b.poseStart || b.poseEnd).length;
        const clothLine = clothPatch !== null && clothPatch !== undefined ? ` The cloth answers at cloth ${clothPatch} for this shot.` : clothPatch === null ? " The cloth call cleared - the cloth answers at its full probed response." : "";
        const fleshLine = fleshPatch !== null && fleshPatch !== undefined ? ` The flesh lags at flesh ${fleshPatch} for this shot.` : fleshPatch === null ? " The flesh call cleared - the soft bodies answer at their full probed response." : "";
        await landDesignEvent(projectId, `Shot ${String(shot.number).padStart(3, "0")} directed with ${sourceName}: ${shape}`, { shotId: shot.id, grammar: sourceName, cloth: clothPatch ?? undefined, flesh: fleshPatch ?? undefined });
        return { status: "OK", result: `DIRECTED Shot ${String(shot.number).padStart(3, "0")} with ${sourceName}: ${shape}${poseBeats ? ` (${poseBeats} beat(s) carry their own pose pair - the subject moves with the lens)` : ""}.${clothLine}${fleshLine} The next render_shot of this shot plays the grammar beat by beat with eased crossfades; the vocabulary the worker performs: ${GRAMMAR_MOVES.join(", ")}.` };
      }

      case "design_sequence": {
        const name = String(args.name ?? "").trim();
        if (!name) return { status: "ERROR", result: "name is required" };
        let rawSlots: unknown[] = [];
        try {
          const parsed = typeof args.slots === "string" ? (JSON.parse(args.slots) as unknown) : args.slots;
          if (!Array.isArray(parsed)) throw new Error("not an array");
          rawSlots = parsed;
        } catch {
          return { status: "ERROR", result: "slots must be a JSON array of {grammar, poseStart?, poseEnd?, fx?, physics?, note?}" };
        }
        if (rawSlots.length < 2) return { status: "ERROR", result: "a sequence program needs at least 2 slots - a single directed shot belongs in set_shot_grammar" };
        if (rawSlots.length > 12) return { status: "ERROR", result: "a sequence program carries at most 12 slots - longer than that is an episode, not a program" };
        const slots: Array<{ grammar: string; poseStart: string | null; poseEnd: string | null; fx: string | null; physics: string | null; note: string | null; wind?: Array<number | null> | number | null; cloth?: number | null; flesh?: number | null; motion?: string | null }> = [];
        for (let i = 0; i < rawSlots.length; i++) {
          const s = rawSlots[i] as Record<string, unknown>;
          const grammar = String(s?.grammar ?? "").trim();
          if (!grammar) return { status: "ERROR", result: `slot ${i + 1}: grammar is required - every slot directs with a named grammar` };
          // design-time validation: a typo never reaches a shoot
          const resolved = await resolveGrammarSource(projectId, grammar);
          if (!resolved) {
            const registry = [
              ...BUILT_IN_GRAMMARS.map((g) => `'${g.name}' (built-in)`),
              ...((await db.designPreset.findMany({ where: { projectId, kind: "GRAMMAR" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
            ];
            return { status: "ERROR", result: `slot ${i + 1}: no grammar named '${grammar}'. Registry: ${registry.join(", ")} - or an inline beats JSON array.` };
          }
          const compiled = compileGrammarSpec({ name: `${name}-slot${i + 1}`, beats: resolved.beatsRaw });
          if (!compiled.ok) return { status: "ERROR", result: `slot ${i + 1} (${grammar}): ${compiled.error}` };
          // the slot's AIR call (iteration 64): per-beat secondary motion
          // at sequence scale - a number drives the grammar's every
          // beat, an array is keyed per beat, and it must FIT the
          // grammar it rides
          const windParsed = compileSlotWind(s?.wind, `slot ${i + 1} (${grammar})`);
          if (!windParsed.ok) return { status: "ERROR", result: windParsed.error };
          const windFit = windFitsGrammar(windParsed.wind, compiled.spec.beats.length, `slot ${i + 1} (${grammar})`);
          if (windFit) return { status: "ERROR", result: windFit };
          // the slot's SOLVER call (iteration 68): a CLOTH call is one
          // number 0..1 for the whole shot - the solver's intensity is
          // a per-shot answer, not a per-beat gust
          const clothParsed = compileSlotCloth(s?.cloth, `slot ${i + 1} (${grammar})`);
          if (!clothParsed.ok) return { status: "ERROR", result: clothParsed.error };
          // the slot's FLESH call (iteration 69): the soft-body solver's
          // per-shot answer, one solver up from the cloth
          const fleshParsed = compileSlotFlesh(s?.flesh, `slot ${i + 1} (${grammar})`);
          if (!fleshParsed.ok) return { status: "ERROR", result: fleshParsed.error };
          // the slot's CHAINED PERFORMANCE (iteration 78 - the sentence
          // calls the motion): the slot may name a choreography source
          // (saved preset, built-in, or a LEARNED MOTION FLOW) the
          // stamped shot performs - design-time validated like every
          // other call, so a typo never reaches a shoot
          const motionName = s?.motion ? String(s.motion).trim() : "";
          if (motionName) {
            const motionResolved = await resolveChoreoSource(projectId, motionName);
            if (!motionResolved) {
              const flows = rankMotionFlows(await db.motionFlow.findMany({ where: { projectId } }));
              const registry = [
                ...BUILT_IN_CHOREO.map((b) => `'${b.name}' (built-in)`),
                ...((await db.designPreset.findMany({ where: { projectId, kind: "CHOREOGRAPHY" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
                ...flows.map((f) => `'${f.name}' (learned flow, ${f.register.toLowerCase()}, x${f.applied}/${f.verified}v)`),
              ];
              return { status: "ERROR", result: `slot ${i + 1}: no choreography named '${motionName}' to chain. Registry: ${registry.join(", ")} - design one (design_choreography), learn one from a verified render (learn_motion_flow), or drop the motion call.` };
            }
            const motionCompiled = compileChoreo(motionResolved.specRaw, `slot ${i + 1} motion (${motionResolved.sourceName})`);
            if (!motionCompiled.ok) return { status: "ERROR", result: `slot ${i + 1} motion (${motionName}): ${motionCompiled.error}` };
          }
          // design-time validation for the world programs too: a slot may
          // bind FX and PHYSICS by name (saved preset, built-in or inline)
          // so the sequence sentence directs the WORLD, not just the lens
          const fxName = s?.fx ? String(s.fx).trim() : "";
          if (fxName) {
            const fxResolved = await resolveFxSource(projectId, fxName);
            if (!fxResolved) {
              const registry = [
                ...BUILT_IN_FX.map((f) => `'${f.name}' (built-in)`),
                ...((await db.designPreset.findMany({ where: { projectId, kind: "FX" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
              ];
              return { status: "ERROR", result: `slot ${i + 1}: no fx program named '${fxName}'. Registry: ${registry.join(", ")} - or an inline programs JSON array.` };
            }
            const fxCompiled = compileFxSpec({ name: `${name}-slot${i + 1}-fx`, programs: fxResolved.programsRaw });
            if (!fxCompiled.ok) return { status: "ERROR", result: `slot ${i + 1} fx (${fxName}): ${fxCompiled.error}` };
          }
          const physName = s?.physics ? String(s.physics).trim() : "";
          if (physName) {
            const physResolved = await resolvePhysicsSource(projectId, physName);
            if (!physResolved) {
              const registry = [
                ...BUILT_IN_PHYSICS.map((f) => `'${f.name}' (built-in)`),
                ...((await db.designPreset.findMany({ where: { projectId, kind: "PHYSICS" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
              ];
              return { status: "ERROR", result: `slot ${i + 1}: no physics program named '${physName}'. Registry: ${registry.join(", ")} - or an inline programs JSON array.` };
            }
            const physCompiled = compilePhysicsSpec({ name: `${name}-slot${i + 1}-physics`, programs: physResolved.programsRaw });
            if (!physCompiled.ok) return { status: "ERROR", result: `slot ${i + 1} physics (${physName}): ${physCompiled.error}` };
          }
          slots.push({
            grammar,
            poseStart: s?.poseStart ? String(s.poseStart) : null,
            poseEnd: s?.poseEnd ? String(s.poseEnd) : null,
            fx: fxName || null,
            physics: physName || null,
            note: s?.note ? String(s.note).slice(0, 140) : null,
            ...(windParsed.wind !== null ? { wind: windParsed.wind } : {}),
            ...(clothParsed.cloth !== null ? { cloth: clothParsed.cloth } : {}),
            ...(fleshParsed.flesh !== null ? { flesh: fleshParsed.flesh } : {}),
            ...(motionName ? { motion: motionName } : {}),
          });
        }
        const description = String(args.description ?? "").trim() || null;
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "SEQUENCE", name } } });
        const hadRecord = Boolean(existed && existed.outcomes && existed.outcomes !== "[]");
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "SEQUENCE", name } },
          create: { projectId, kind: "SEQUENCE", name, spec: JSON.stringify({ description, slots }) },
          update: { spec: JSON.stringify({ description, slots }), ...(existed ? { outcomes: "[]" } : {}) },
        });
        await landDesignEvent(projectId, `Sequence program '${name}' ${existed ? "updated" : "designed"} (${slots.length} slots: ${slots.map((s) => s.grammar).join(" -> ")})`, { presetId: preset.id });
        const slotShape = slots.map((s, i) => `${i + 1}. ${s.grammar}${s.wind !== undefined && s.wind !== null ? ` +${formatSlotWind(s.wind)}` : ""}${s.cloth !== undefined && s.cloth !== null ? ` +${formatSlotCloth(s.cloth)}` : ""}${s.flesh !== undefined && s.flesh !== null ? ` +${formatSlotFlesh(s.flesh)}` : ""}${s.fx ? ` +fx ${s.fx}` : ""}${s.physics ? ` +physics ${s.physics}` : ""}${s.motion ? ` +motion '${s.motion}'` : ""}`).join(", ");
        return { status: "OK", result: `SEQUENCE program '${name}' ${existed ? "updated" : "registered"}: ${slots.length} slots - ${slotShape}.${hadRecord ? " (the measured record resets - a redesigned sentence is a new sentence)" : ""} Apply it across a scene (or scope:'episode' across the whole episode in story order) with direct_sequence program:'${name}' - shot i receives slot i's grammar, slot-named fx and physics ride the same shots, a slot's wind call rides its grammar's beats, a slot's cloth and flesh calls set the shot's solver intensities, and a slot's motion call CHAINS a performance onto the shot (a learned flow re-performs its verified timing). The whole flow reads back cut by cut.` };
      }

      case "direct_sequence": {
        // THE SEQUENCE GRADUATES TO THE EPISODE (iteration 62): the
        // director's sentence is no longer one scene long - scope:'episode'
        // allocates the slots across EVERY scene of the episode in story
        // order, and a slot may bind fx / physics programs so the world
        // answers on the same sentence, exactly like set_shot_fx/physics.
        const scope = String(args.scope ?? "scene").trim().toLowerCase() === "episode" ? "episode" : "scene";
        type FlatShot = { id: string; number: number; sceneNumber: number; label: string };
        let flat: FlatShot[] = [];
        let scopeDesc = "";
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
              return { status: "ERROR", result: withShots.length
                ? `No episode ${want} with shots. Episodes with shots: ${withShots.join(", ")}.`
                : "No episode with shots exists yet - break down a scene first (create_episode / create_scene / create_shot)." };
            }
          } else {
            ep = eps.find((e) => e.scenes.length > 0) ?? null;
            if (!ep) return { status: "ERROR", result: "No episode with shots exists yet - break down a scene first (create_episode / create_scene / create_shot)." };
          }
          for (const s of ep.scenes) {
            for (const sh of s.shots) {
              flat.push({ id: sh.id, number: sh.number, sceneNumber: s.number, label: `Sc${s.number} S${String(sh.number).padStart(3, "0")}` });
            }
          }
          scopeDesc = `episode ${ep.number} (${ep.scenes.length} scene(s) in story order)`;
        } else {
          let scene: Awaited<ReturnType<typeof latestScene>> = null;
          if (args.sceneNumber) {
            const scenes = await db.scene.findMany({
              where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
              orderBy: { createdAt: "desc" },
            });
            scene = scenes[0] ?? null;
          }
          if (!scene) scene = await latestScene(projectId);
          if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
          const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
          if (shots.length === 0) return { status: "ERROR", result: `Scene ${scene.number} has no shots to direct - break the scene down first (create_shot).` };
          flat = shots.map((sh) => ({ id: sh.id, number: sh.number, sceneNumber: scene!.number, label: `Shot ${String(sh.number).padStart(3, "0")}` }));
          scopeDesc = `Scene ${scene.number}`;
        }
        if (flat.length === 0) return { status: "ERROR", result: `${scopeDesc} has no shots to direct - break the scene down first (create_shot).` };
        // the slot list: a named SEQUENCE program first, an inline slot
        // array next, and with NEITHER the register consult (iteration
        // 63): the studio starts from the sentence that verified, not
        // from a fresh guess
        let slotList: Array<{ grammar?: unknown; poseStart?: unknown; poseEnd?: unknown; fx?: unknown; physics?: unknown; note?: unknown; wind?: unknown; cloth?: unknown; flesh?: unknown; motion?: unknown }> = [];
        let sourceName = "";
        let consultFlow: { register: string; name: string } | null = null;
        const programName = String(args.program ?? "").trim();
        if (programName) {
          const preset = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "SEQUENCE", name: programName } } });
          if (!preset) {
            const registry = (await db.designPreset.findMany({ where: { projectId, kind: "SEQUENCE" }, select: { name: true } })).map((r) => `'${r.name}'`);
            return { status: "ERROR", result: `No sequence program named '${programName}'. Registry: ${registry.join(", ") || "(empty)"} - design one with design_sequence, or pass slots inline.` };
          }
          try {
            const parsedSpec = JSON.parse(preset.spec || "null") as { slots?: unknown } | null;
            slotList = Array.isArray(parsedSpec?.slots) ? (parsedSpec.slots as typeof slotList) : [];
          } catch {
            slotList = [];
          }
          if (slotList.length < 2) return { status: "ERROR", result: `Sequence program '${programName}' is corrupt (needs 2+ valid slots) - redesign it with design_sequence.` };
          sourceName = `program '${programName}'`;
          await db.designPreset.update({ where: { id: preset.id }, data: { usageCount: { increment: 1 } } });
        } else if (args.slots === undefined || String(args.slots ?? "").trim() === "") {
          // THE STUDIO REMEMBERS ITS SENTENCES (iteration 63): consult
          // the register's best-proven learned flow
          const register = String(args.register ?? "").trim().toUpperCase();
          if (!register) {
            return { status: "ERROR", result: "pass program:'<name>', a slots JSON array, or register:'<register>' to direct from a learned sequence flow (registers: BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE)." };
          }
          if (!isSequenceRegister(register)) {
            return { status: "ERROR", result: `register must be one of BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE (got "${register}").` };
          }
          const flow = await bestSequenceFlow(projectId, register);
          if (!flow) {
            const registry = (await db.sequenceFlow.findMany({ where: { projectId }, select: { register: true, name: true } }))
              .map((r) => `${r.register}:'${r.name}'`);
            // the consult names its teachers (iteration 64): a program
            // that verified without a flow is the adoption the memory
            // is missing - propose it by name, not a bare refusal
            const unadopted = await unadoptedVerifiedPrograms(projectId);
            const suggestion = unadopted.length > 0
              ? ` These programs verified but were never adopted: ${unadopted.slice(0, 2).map((p) => `'${p.name}' (${p.verifiedRuns} landed-whole run${p.verifiedRuns === 1 ? "" : "(s)"} of ${p.runs})`).join(", ")} - adopt one with learn_sequence_flow register:'${register}' program:'<name>' name:'<your name>'.`
              : "";
            return { status: "ERROR", result: `No learned flow for register ${register} that ever landed whole. Learned flows: ${registry.join(", ") || "(none)"}.${suggestion} Adopt one with learn_sequence_flow, or pass program:'<name>' or slots inline - the memory consults only what verified.` };
          }
          slotList = flow.spec.slots as typeof slotList;
          consultFlow = { register: flow.register, name: flow.name };
          sourceName = `learned flow '${flow.name}' (register ${flow.register}, ${flow.runs} run(s), ${flow.clears} clear(s))`;
        } else {
          try {
            const parsed = typeof args.slots === "string" ? (JSON.parse(args.slots) as unknown) : args.slots;
            if (!Array.isArray(parsed)) throw new Error("not an array");
            slotList = parsed as typeof slotList;
          } catch {
            return { status: "ERROR", result: "pass program:'<name>' or a slots JSON array of {grammar, poseStart?, poseEnd?, fx?, physics?}" };
          }
          if (slotList.length < 2) return { status: "ERROR", result: "a sequence carries at least 2 slots - a single directed shot belongs in set_shot_grammar" };
          sourceName = "inline slots";
        }
        // apply slot i -> shot i, compiling every grammar exactly like
        // set_shot_grammar and the world programs exactly like
        // set_shot_fx / set_shot_physics
        const directed = Math.min(slotList.length, flat.length);
        const flow: string[] = [];
        let windBeats = 0;
        let clothCalls = 0;
        let fleshCalls = 0;
        let poseCuts = 0;
        let moveClashes = 0;
        let fxBound = 0;
        let physBound = 0;
        let motionChained = 0;
        const chainedFlows = new Set<string>();
        let lastEndPose: string | null = null;
        let lastLastMove: string | null = null;
        for (let i = 0; i < directed; i++) {
          const slot = slotList[i];
          const grammarName = String(slot?.grammar ?? "").trim();
          if (!grammarName) return { status: "ERROR", result: `slot ${i + 1}: grammar is required - every slot directs with a named grammar` };
          const resolved = await resolveGrammarSource(projectId, grammarName);
          if (!resolved) return { status: "ERROR", result: `slot ${i + 1}: no grammar named '${grammarName}' - register it with design_grammar first.` };
          const compiled = compileGrammarSpec({ name: `${flat[i].id.slice(-6)}-shot-grammar`, beats: resolved.beatsRaw });
          if (!compiled.ok) return { status: "ERROR", result: `slot ${i + 1} (${grammarName}): ${compiled.error}` };
          // the slot's air call (iteration 64): patch the compiled
          // beats' wind BEFORE serializing - the shot's grammar carries
          // the sentence's air, the worker's secondary rig rides it,
          // and the windBeats count measures the patched air honestly
          const windParsed = compileSlotWind(slot?.wind, `slot ${i + 1} (${grammarName})`);
          if (!windParsed.ok) return { status: "ERROR", result: windParsed.error };
          const windFit = windFitsGrammar(windParsed.wind, compiled.spec.beats.length, `slot ${i + 1} (${grammarName})`);
          if (windFit) return { status: "ERROR", result: windFit };
          const windTouched = applySlotWind(compiled.spec.beats, windParsed.wind);
          const airShape = windTouched > 0 && windParsed.wind !== null ? formatSlotWind(windParsed.wind) : "";
          // the slot's SOLVER calls (iterations 68-69): the shot's cloth
          // answers at the called cloth intensity, the soft bodies at the
          // called flesh intensity; a slot without a call clears a stale
          // one - the sentence re-stages the shot
          const clothParsed = compileSlotCloth(slot?.cloth, `slot ${i + 1} (${grammarName})`);
          if (!clothParsed.ok) return { status: "ERROR", result: clothParsed.error };
          const clothShape = formatSlotCloth(clothParsed.cloth);
          const fleshParsed = compileSlotFlesh(slot?.flesh, `slot ${i + 1} (${grammarName})`);
          if (!fleshParsed.ok) return { status: "ERROR", result: fleshParsed.error };
          const fleshShape = formatSlotFlesh(fleshParsed.flesh);
          const poseStart = slot?.poseStart ? String(slot.poseStart) : null;
          const poseEnd = slot?.poseEnd ? String(slot.poseEnd) : null;
          const data: { grammar: string; poseStart?: string; poseEnd?: string; fx?: string; physics?: string; cloth?: number | null; flesh?: number | null; choreo?: string } = { grammar: serializeGrammar(compiled.spec) };
          if (poseStart) data.poseStart = poseStart;
          if (poseEnd) data.poseEnd = poseEnd;
          data.cloth = clothParsed.cloth;   // null clears - the sentence owns the staging
          data.flesh = fleshParsed.flesh;   // null clears - the sentence owns the staging
          const fxName = slot?.fx ? String(slot.fx).trim() : "";
          let fxShape = "";
          if (fxName) {
            const fxResolved = await resolveFxSource(projectId, fxName);
            if (!fxResolved) return { status: "ERROR", result: `slot ${i + 1}: no fx program named '${fxName}' - register it with design_fx first.` };
            const fxCompiled = compileFxSpec({ name: `${flat[i].id.slice(-6)}-shot-fx`, programs: fxResolved.programsRaw });
            if (!fxCompiled.ok) return { status: "ERROR", result: `slot ${i + 1} fx (${fxName}): ${fxCompiled.error}` };
            data.fx = serializeFx(fxCompiled.spec);
            fxShape = fxCompiled.spec.programs.map((p) => p.kind).join("+");
            fxBound += 1;
          }
          const physName = slot?.physics ? String(slot.physics).trim() : "";
          let physShape = "";
          if (physName) {
            const physResolved = await resolvePhysicsSource(projectId, physName);
            if (!physResolved) return { status: "ERROR", result: `slot ${i + 1}: no physics program named '${physName}' - register it with design_physics first.` };
            const physCompiled = compilePhysicsSpec({ name: `${flat[i].id.slice(-6)}-shot-physics`, programs: physResolved.programsRaw });
            if (!physCompiled.ok) return { status: "ERROR", result: `slot ${i + 1} physics (${physName}): ${physCompiled.error}` };
            data.physics = serializePhysics(physCompiled.spec);
            physShape = physCompiled.spec.programs.map((p) => p.kind).join("+");
            physBound += 1;
          }
          // THE SENTENCE CALLS THE PERFORMANCE (iteration 78): a slot's
          // motion call chains a CHOREOGRAPHY onto the stamped shot -
          // resolved through the same registry set_shot_choreography
          // consults (saved preset -> built-in -> LEARNED MOTION FLOW),
          // compiled exactly like it, and stored with the same flow
          // marker, so a chained learned flow's applied record grows and
          // every later passing review still verifies its timing
          const motionName = slot?.motion ? String(slot.motion).trim() : "";
          let motionShape = "";
          if (motionName) {
            const motionResolved = await resolveChoreoSource(projectId, motionName);
            if (!motionResolved) return { status: "ERROR", result: `slot ${i + 1}: no choreography named '${motionName}' to chain - it validated at design time and is gone now; redesign the sentence (design_sequence).` };
            const motionCompiled = compileChoreo(motionResolved.specRaw, `slot ${i + 1} motion (${motionResolved.sourceName})`);
            if (!motionCompiled.ok) return { status: "ERROR", result: `slot ${i + 1} motion (${motionName}): ${motionCompiled.error}` };
            const chainedPerf = { ...motionCompiled.spec, name: motionResolved.perfName, ...(motionResolved.flowName ? { flow: motionResolved.flowName } : {}) };
            data.choreo = JSON.stringify(chainedPerf);
            motionShape = motionCompiled.spec.keys.map((k) => `${k.pose.toLowerCase()}@${k.at}:${k.kind}`).join(">");
            motionChained += 1;
            if (motionResolved.flowName) {
              chainedFlows.add(motionResolved.flowName);
              await db.motionFlow.update({ where: { projectId_name: { projectId, name: motionResolved.flowName } }, data: { applied: { increment: 1 } } });
            }
          }
          await db.shot.update({ where: { id: flat[i].id }, data });
          windBeats += compiled.spec.beats.filter((b) => (b.wind ?? 0) > 0).length;
          if (clothParsed.cloth !== null) clothCalls += 1;
          if (fleshParsed.flesh !== null) fleshCalls += 1;
          const firstMove = compiled.spec.beats[0].move;
          const lastMove = compiled.spec.beats[compiled.spec.beats.length - 1].move;
          if (lastLastMove && lastLastMove === firstMove) moveClashes += 1;
          const startPose = normalizePose(poseStart ?? compiled.spec.beats[0].poseStart ?? "");
          if (lastEndPose && startPose && startPose !== lastEndPose) poseCuts += 1;
          lastEndPose = normalizePose(poseEnd ?? compiled.spec.beats[compiled.spec.beats.length - 1].poseEnd ?? "") || lastEndPose;
          lastLastMove = lastMove;
          const world = fxName || physName || airShape || clothShape || fleshShape || motionShape ? ` [${[airShape, clothShape, fleshShape, motionShape ? `performing ${motionShape}` : "", fxName ? `fx: ${fxShape}` : "", physName ? `physics: ${physShape}` : ""].filter(Boolean).join(" | ")}]` : "";
          flow.push(`${flat[i].label} <- ${grammarName} (${compiled.spec.beats.map((b) => b.move).join(">")})${world}`);
        }
        const jobIds: string[] = [];
        let mode: "PREVIEW" | "FINAL" = "PREVIEW";
        if (args.render) {
          mode = String(args.mode ?? "PREVIEW") === "FINAL" ? "FINAL" : "PREVIEW";
          for (let i = 0; i < directed; i++) {
            const job = await createRenderJob(projectId, flat[i].id, mode);
            jobIds.push(job.id.slice(-6));
          }
        }
        await landDesignEvent(projectId, `${scope === "episode" ? `Episode sequence` : `Scene ${flat[0].sceneNumber}`} directed with ${sourceName}: ${directed} shot(s)${fxBound || physBound ? `, ${fxBound} fx + ${physBound} physics binding(s)` : ""}${jobIds.length ? `, ${jobIds.length} ${mode} render(s) queued` : ""}`, { directed, renders: jobIds.length });
        const untouched = flat.length - directed;
        const unused = slotList.length - directed;
        const reads: string[] = [];
        if (moveClashes > 0) reads.push(`${moveClashes} cut(s) land on the same move both sides - consider alternating the blocking`);
        if (poseCuts > 0) reads.push(`${poseCuts} pose change(s) across cuts (the cloth whips on each one)`);
        if (windBeats > 0) reads.push(`${windBeats} wind beat(s) - the robes and hair ride those beats`);
        if (clothCalls > 0) reads.push(`${clothCalls} cloth call(s) - the cloth answers at the directed intensity on those shots`);
        if (fleshCalls > 0) reads.push(`${fleshCalls} flesh call(s) - the soft bodies lag at the directed intensity on those shots`);
        if (fxBound > 0 || physBound > 0) reads.push(`${fxBound} fx + ${physBound} physics binding(s) - the world answers on those shots`);
        if (motionChained > 0) reads.push(`${motionChained} chained performance(s)${chainedFlows.size ? ` (${Array.from(chainedFlows).map((n) => `'${n}'`).join(", ")})` : ""} - those shots PERFORM their keys, and a chained learned flow's timing is the timing that verified`);
        if (untouched > 0) reads.push(`${untouched} shot(s) beyond the plan left untouched`);
        if (unused > 0) reads.push(`${unused} slot(s) had no shot to direct`);
        // THE MEMORY GROWS FROM WHAT THE RUN MEASURED (iteration 63):
        // the direction's read lands on the learned flows it drove -
        // the consulted flow itself, or every flow the named program
        // taught. A direction that landed whole (every slot stamped a
        // real shot) verifies; a clean read on top of that earns the
        // clear (recorded on the same write).
        const outcome = {
          scope: scopeDesc,
          program: programName || null,
          slots: slotList.length,
          directed,
          untouched,
          unused,
          windBeats,
          clothCalls,
          fleshCalls,
          poseCuts,
          moveClashes,
          fxBound,
          physBound,
          motionChained,
          rendersQueued: jobIds.length,
          verified: unused === 0 && directed > 0,
        };
        const memoryLines: string[] = [];
        const memoryLine = (row: { name: string; register: string; runs: number; clears: number }) =>
          `learned flow '${row.name}' (${row.register}) recorded the run: ${row.runs} run(s), ${row.clears} clear(s) - ${outcome.verified ? "the sentence landed whole" : "the sentence did NOT land whole (see the flow read)"}${outcome.verified && moveClashes === 0 ? ", the clean read earns the clear" : ""}${motionChained > 0 ? `, ${motionChained} shot(s) chained their performances through it` : ""}`;
        if (consultFlow) {
          const row = await recordSequenceOutcome(projectId, consultFlow.register, consultFlow.name, outcome);
          if (row) memoryLines.push(memoryLine(row));
          // the consult names its teachers (iteration 64): a proven
          // sentence no flow carries yet is proposed on the same read
          const adoption = sequenceAdoptionSuggestionsLine(await unadoptedVerifiedPrograms(projectId));
          if (adoption) memoryLines.push(adoption);
        } else if (programName) {
          const taught = await flowsLearnedFromProgram(projectId, programName);
          for (const f of taught) {
            const row = await recordSequenceOutcome(projectId, f.register, f.name, outcome);
            if (row) memoryLines.push(memoryLine(row));
          }
          // the program keeps its own measured record too (iteration
          // 64) - it is what lets the consult name it when no flow
          // ever adopted it
          const programRow = await recordProgramOutcome(projectId, programName, outcome);
          if (programRow && outcome.verified && taught.length === 0) {
            memoryLines.push(`program '${programName}' landed whole (${programRow.verifiedRuns} landed-whole run${programRow.verifiedRuns === 1 ? "" : "(s)"} of ${programRow.runs}) and no flow carries it yet - learn_sequence_flow register:'<register>' program:'${programName}' name:'<name>' teaches the memory`);
          }
        }
        return { status: "OK", result: `SEQUENCE DIRECTED (${sourceName}) across ${directed} shot(s) of ${scopeDesc}:\n${flow.join("\n")}${reads.length ? `\nFlow read: ${reads.join("; ")}.` : ""}${memoryLines.length ? `\nMemory: ${memoryLines.join("; ")}.` : ""}${jobIds.length ? `\n${jobIds.length} ${mode} render job(s) queued (${jobIds.join(", ")}) - the previews play each shot's beats with the cloth riding them.` : ` Queue renders with render_shot per shot, or re-run with render:true.`}` };
      }

      case "learn_sequence_flow": {
        // THE STUDIO REMEMBERS ITS SENTENCES (iteration 63): a verified
        // direction is a lesson - the same adoption law the retopo
        // flows and the sculpt plans obey.
        const name = String(args.name ?? "").trim();
        if (!name) return { status: "ERROR", result: "name is required - a flow the studio consults by name (direct_sequence register:'<register>' ranks them)." };
        const register = String(args.register ?? "").trim().toUpperCase();
        if (!isSequenceRegister(register)) return { status: "ERROR", result: `register must be one of BATTLE | PURSUIT | REVEAL | STANDOFF | RITUAL | INTRIGUE | RESOLVE (got "${register}").` };
        const programName = String(args.program ?? "").trim();
        if (!programName) return { status: "ERROR", result: "program is required - a flow is learned from a design_sequence program whose slots validated at design time, not from a guess." };
        const preset = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "SEQUENCE", name: programName } } });
        if (!preset) {
          const registry = (await db.designPreset.findMany({ where: { projectId, kind: "SEQUENCE" }, select: { name: true } })).map((r) => `'${r.name}'`);
          return { status: "ERROR", result: `No sequence program named '${programName}'. Registry: ${registry.join(", ") || "(empty)"} - design one with design_sequence first; a flow is learned from a program that exists.` };
        }
        let slots: SequenceFlowSlot[] = [];
        let description: string | null = null;
        try {
          const parsed = JSON.parse(preset.spec || "null") as { description?: unknown; slots?: unknown } | null;
          if (Array.isArray(parsed?.slots) && parsed.slots.length >= 2) {
            slots = parsed.slots as SequenceFlowSlot[];
            description = typeof parsed?.description === "string" ? parsed.description : null;
          }
        } catch {
          slots = [];
        }
        if (slots.length < 2) return { status: "ERROR", result: `Sequence program '${programName}' is corrupt (needs 2+ valid slots) - redesign it with design_sequence; the flow learns a sentence that compiles.` };
        const flow = await learnSequenceFlow({
          projectId,
          register,
          name,
          spec: { description: description ?? (String(args.description ?? "").trim() || null), slots },
          learnedFrom: programName,
        });
        await landDesignEvent(projectId, `Sequence flow '${name}' adopted for ${register.toLowerCase()} direction (learned from program '${programName}', ${slots.length} slot(s): ${slots.map((s) => s.grammar).join(" -> ")})`, { flowId: flow.id });
        return { status: "OK", result: `SEQUENCE FLOW '${flow.name}' remembered for ${register.toLowerCase()} direction: ${slots.length} slot(s) - ${slots.map((s) => s.grammar).join(" -> ")} (learned from program '${programName}'). Consult it with direct_sequence register:'${register}' (no program, no slots - the register's best-proven flow starts the sentence); every direction the flow drives grows its measured record, a run that lands whole with a clean read earns the clear, and the context's learned sequence flows line carries the standing.` };
      }

      case "stage_battle": {
        // THE BATTLE IS STAGED (iteration 79): the chain at episode
        // scale. An arc of registers; every leg consults the
        // register's best-proven learned flow; the episode's shots
        // allocated by sentence weight; EVERY leg pre-flights before
        // a single shot is stamped.
        const arcParsed = parseBattleArc(args.arc);
        if (!arcParsed.ok) return { status: "ERROR", result: arcParsed.error };
        const arc = arcParsed.registers;
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
            return { status: "ERROR", result: withShots.length
              ? `No episode ${want} with shots. Episodes with shots: ${withShots.join(", ")}.`
              : "No episode with shots exists yet - break down a scene first (create_episode / create_scene / create_shot)." };
          }
        } else {
          ep = eps.find((e) => e.scenes.length > 0) ?? null;
          if (!ep) return { status: "ERROR", result: "No episode with shots exists yet - break down a scene first (create_episode / create_scene / create_shot)." };
        }
        const flat: Array<{ id: string; number: number; sceneNumber: number; label: string }> = [];
        for (const s of ep.scenes) {
          for (const sh of s.shots) {
            flat.push({ id: sh.id, number: sh.number, sceneNumber: s.number, label: `Sc${s.number} S${String(sh.number).padStart(3, "0")}` });
          }
        }
        if (flat.length < arc.length) {
          return { status: "ERROR", result: `Episode ${ep.number} stages ${flat.length} shot(s) but the arc has ${arc.length} legs - every leg needs at least one shot; break the scenes down further (create_shot) or shorten the arc.` };
        }
        // THE CONSULT LAW: every leg starts from the register's
        // best-proven learned flow - the battle stages only what
        // verified
        interface BattleLeg { register: string; flow: NonNullable<Awaited<ReturnType<typeof bestSequenceFlow>>>; }
        const legs: BattleLeg[] = [];
        const legReads: string[] = [];
        let missingLeg: { index: number; register: string } | null = null;
        for (let i = 0; i < arc.length; i++) {
          const flow = await bestSequenceFlow(projectId, arc[i]);
          if (!flow) {
            if (!missingLeg) missingLeg = { index: i + 1, register: arc[i] };
            legReads.push(`${i + 1}. ${arc[i]} - no proven flow`);
          } else {
            legs.push({ register: arc[i], flow });
            legReads.push(`${i + 1}. ${battleLegLabel(arc[i], flow.name, 0, flow.runs, flow.clears)}`);
          }
        }
        if (missingLeg) {
          const known = (await db.sequenceFlow.findMany({ where: { projectId }, select: { register: true, name: true } }))
            .map((r) => `${r.register}:'${r.name}'`);
          return { status: "ERROR", result: `THE CHAIN STAGES ONLY WHAT VERIFIED - no proven learned sequence flow for leg ${missingLeg.index} (${missingLeg.register}). The arc: ${legReads.join(" | ")}. Learned flows: ${known.join(", ") || "(none)"}. learn_sequence_flow register:'${missingLeg.register}' program:'<a verified SEQUENCE program>' name:'<name>' grows the memory, then stage the battle again.` };
        }
        // THE ALLOCATION: the legs' sentence weights split the
        // episode's shots (a leg with more slots carries more of the
        // fight); leg L stamps flat[offset..offset+alloc)
        const alloc = allocateBattleShots(flat.length, legs.map((l) => Math.max(1, l.flow.spec.slots.length)));
        // THE PRE-FLIGHT: compile EVERY leg's slots (cycling across
        // its allocated shots) before a single shot is stamped - a
        // battle that fails at leg 3 must not leave legs 1-2
        // half-staged
        type StampedData = { grammar: string; poseStart?: string; poseEnd?: string; fx?: string; physics?: string; cloth?: number | null; flesh?: number | null; choreo?: string };
        interface CompiledSlot { data: StampedData; airShape: string; clothShape: string; fleshShape: string; motionShape: string; beatMoves: string[]; poseStart: string | null; poseEnd: string | null; firstMove: string; lastMove: string; windTouched: number; clothCalled: boolean; fleshCalled: boolean; fxBound: boolean; physBound: boolean; motionChained: boolean; motionFlowName: string | null; }
        const compiled: Array<Array<CompiledSlot>> = [];
        for (let leg = 0; leg < legs.length; leg++) {
          const legSlots = legs[leg].flow.spec.slots;
          const need = Math.min(alloc[leg], legSlots.length); // a cycled stamp reuses its slot's compile
          const legCompiled: Array<CompiledSlot> = [];
          for (let j = 0; j < need; j++) {
            const slot = legSlots[j];
            const label = `leg ${leg + 1} (${legs[leg].register}) slot ${j + 1}`;
            const grammarName = String(slot?.grammar ?? "").trim();
            if (!grammarName) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: grammar is required - every slot directs with a named grammar. Fix the sentence (design_sequence) and stage again.` };
            const resolved = await resolveGrammarSource(projectId, grammarName);
            if (!resolved) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: no grammar named '${grammarName}'. Fix the sentence (design_sequence) and stage again.` };
            const compiledGrammar = compileGrammarSpec({ name: `battle-${ep.number}-leg${leg + 1}-slot${j + 1}`, beats: resolved.beatsRaw });
            if (!compiledGrammar.ok) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label} (${grammarName}): ${compiledGrammar.error}. Fix the sentence (design_sequence) and stage again.` };
            const windParsed = compileSlotWind(slot?.wind, label);
            if (!windParsed.ok) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: ${windParsed.error}. Fix the sentence (design_sequence) and stage again.` };
            const windFit = windFitsGrammar(windParsed.wind, compiledGrammar.spec.beats.length, label);
            if (windFit) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: ${windFit}. Fix the sentence (design_sequence) and stage again.` };
            const windTouched = applySlotWind(compiledGrammar.spec.beats, windParsed.wind);
            const clothParsed = compileSlotCloth(slot?.cloth, label);
            if (!clothParsed.ok) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: ${clothParsed.error}. Fix the sentence (design_sequence) and stage again.` };
            const fleshParsed = compileSlotFlesh(slot?.flesh, label);
            if (!fleshParsed.ok) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: ${fleshParsed.error}. Fix the sentence (design_sequence) and stage again.` };
            const data: StampedData = { grammar: serializeGrammar(compiledGrammar.spec) };
            if (slot?.poseStart) data.poseStart = String(slot.poseStart);
            if (slot?.poseEnd) data.poseEnd = String(slot.poseEnd);
            data.cloth = clothParsed.cloth;
            data.flesh = fleshParsed.flesh;
            const fxName = slot?.fx ? String(slot.fx).trim() : "";
            if (fxName) {
              const fxResolved = await resolveFxSource(projectId, fxName);
              if (!fxResolved) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: no fx program named '${fxName}'. Fix the sentence (design_sequence) and stage again.` };
              const fxCompiled = compileFxSpec({ name: `battle-${ep.number}-leg${leg + 1}-slot${j + 1}-fx`, programs: fxResolved.programsRaw });
              if (!fxCompiled.ok) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label} fx (${fxName}): ${fxCompiled.error}. Fix the sentence (design_sequence) and stage again.` };
              data.fx = serializeFx(fxCompiled.spec);
            }
            const physName = slot?.physics ? String(slot.physics).trim() : "";
            if (physName) {
              const physResolved = await resolvePhysicsSource(projectId, physName);
              if (!physResolved) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: no physics program named '${physName}'. Fix the sentence (design_sequence) and stage again.` };
              const physCompiled = compilePhysicsSpec({ name: `battle-${ep.number}-leg${leg + 1}-slot${j + 1}-physics`, programs: physResolved.programsRaw });
              if (!physCompiled.ok) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label} physics (${physName}): ${physCompiled.error}. Fix the sentence (design_sequence) and stage again.` };
              data.physics = serializePhysics(physCompiled.spec);
            }
            const motionName = slot?.motion ? String(slot.motion).trim() : "";
            let motionShape = "";
            let motionFlowName: string | null = null;
            if (motionName) {
              const motionResolved = await resolveChoreoSource(projectId, motionName);
              if (!motionResolved) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label}: no choreography named '${motionName}' to chain - it validated when the flow was learned and is gone now; re-learn or redesign the sentence (design_sequence).` };
              const motionCompiled = compileChoreo(motionResolved.specRaw, `${label} motion (${motionResolved.sourceName})`);
              if (!motionCompiled.ok) return { status: "ERROR", result: `THE BATTLE PRE-FLIGHT FAILED - nothing was staged: ${label} motion (${motionName}): ${motionCompiled.error}. Fix the sentence (design_sequence) and stage again.` };
              const chainedPerf = { ...motionCompiled.spec, name: motionResolved.perfName, ...(motionResolved.flowName ? { flow: motionResolved.flowName } : {}) };
              data.choreo = JSON.stringify(chainedPerf);
              motionShape = motionCompiled.spec.keys.map((k) => `${k.pose.toLowerCase()}@${k.at}:${k.kind}`).join(">");
              motionFlowName = motionResolved.flowName ?? null;
            }
            legCompiled.push({
              data,
              airShape: windTouched > 0 && windParsed.wind !== null ? formatSlotWind(windParsed.wind) : "",
              clothShape: formatSlotCloth(clothParsed.cloth),
              fleshShape: formatSlotFlesh(fleshParsed.flesh),
              motionShape,
              beatMoves: compiledGrammar.spec.beats.map((b) => b.move),
              poseStart: slot?.poseStart ? String(slot.poseStart) : null,
              poseEnd: slot?.poseEnd ? String(slot.poseEnd) : null,
              firstMove: compiledGrammar.spec.beats[0].move,
              lastMove: compiledGrammar.spec.beats[compiledGrammar.spec.beats.length - 1].move,
              windTouched,
              clothCalled: clothParsed.cloth !== null,
              fleshCalled: fleshParsed.flesh !== null,
              fxBound: Boolean(fxName),
              physBound: Boolean(physName),
              motionChained: Boolean(motionName),
              motionFlowName,
            });
          }
          compiled.push(legCompiled);
        }
        // THE STAMP: walk the arc, each leg stamps its allocated shots
        // in story order, slots cycling when the leg is longer than its
        // sentence - one continuous performance, the chain state
        // carried across the legs
        let windBeats = 0;
        let clothCalls = 0;
        let fleshCalls = 0;
        let poseCuts = 0;
        let moveClashes = 0;
        let fxBound = 0;
        let physBound = 0;
        let motionChained = 0;
        const chainedFlows = new Set<string>();
        let lastEndPose: string | null = null;
        let lastLastMove: string | null = null;
        let cursor = 0;
        const legLines: string[] = [];
        const legOutcomes: Array<{ leg: BattleLeg; directed: number; unused: number; windBeats: number; clothCalls: number; fleshCalls: number; poseCuts: number; moveClashes: number; fxBound: number; physBound: number; motionChained: number }> = [];
        for (let leg = 0; leg < legs.length; leg++) {
          const legSlots = legs[leg].flow.spec.slots.length;
          const take = alloc[leg];
          const legFlow: string[] = [];
          const per = { windBeats: 0, clothCalls: 0, fleshCalls: 0, poseCuts: 0, moveClashes: 0, fxBound: 0, physBound: 0, motionChained: 0 };
          const poseCutsBefore = poseCuts;
          const moveClashesBefore = moveClashes;
          for (let j = 0; j < take; j++) {
            const shot = flat[cursor + j];
            const c = compiled[leg][j % compiled[leg].length];
            await db.shot.update({ where: { id: shot.id }, data: c.data });
            windBeats += c.windTouched > 0 ? 1 : 0;
            clothCalls += c.clothCalled ? 1 : 0;
            fleshCalls += c.fleshCalled ? 1 : 0;
            fxBound += c.fxBound ? 1 : 0;
            physBound += c.physBound ? 1 : 0;
            motionChained += c.motionChained ? 1 : 0;
            if (c.motionChained && c.motionFlowName) {
              chainedFlows.add(c.motionFlowName);
              await db.motionFlow.update({ where: { projectId_name: { projectId, name: c.motionFlowName } }, data: { applied: { increment: 1 } } });
            }
            const startPose = normalizePose(c.poseStart ?? "");
            if (lastEndPose && startPose && startPose !== lastEndPose) poseCuts += 1;
            if (lastLastMove && lastLastMove === c.firstMove) moveClashes += 1;
            lastEndPose = normalizePose(c.poseEnd ?? "") || lastEndPose;
            lastLastMove = c.lastMove;
            const world = c.airShape || c.clothShape || c.fleshShape || c.motionShape || c.fxBound || c.physBound ? ` [${[c.airShape, c.clothShape, c.fleshShape, c.motionShape ? `performing ${c.motionShape}` : "", c.data.fx ? "fx bound" : "", c.data.physics ? "physics bound" : ""].filter(Boolean).join(" | ")}]` : "";
            legFlow.push(`${shot.label} <- ${String(legs[leg].flow.spec.slots[j % legSlots]?.grammar ?? "")} (${c.beatMoves.join(">")})${world}`);
            per.windBeats += c.windTouched > 0 ? 1 : 0;
            per.clothCalls += c.clothCalled ? 1 : 0;
            per.fleshCalls += c.fleshCalled ? 1 : 0;
            per.fxBound += c.fxBound ? 1 : 0;
            per.physBound += c.physBound ? 1 : 0;
            per.motionChained += c.motionChained ? 1 : 0;
          }
          cursor += take;
          const unused = Math.max(0, legSlots - take);
          legOutcomes.push({ leg: legs[leg], directed: take, unused, windBeats: per.windBeats, clothCalls: per.clothCalls, fleshCalls: per.fleshCalls, poseCuts: poseCuts - poseCutsBefore, moveClashes: moveClashes - moveClashesBefore, fxBound: per.fxBound, physBound: per.physBound, motionChained: per.motionChained });
          legLines.push(`leg ${leg + 1} ${battleLegLabel(legs[leg].register, legs[leg].flow.name, take, legs[leg].flow.runs, legs[leg].flow.clears)}:\n${legFlow.map((l) => `  ${l}`).join("\n")}${unused > 0 ? `\n  (${unused} slot(s) of the sentence had no shot to perform - the leg did not land whole)` : ""}`);
        }
        // renders (optional): one per directed shot, same path render_shot queues
        const jobIds: string[] = [];
        let mode: "PREVIEW" | "FINAL" = "PREVIEW";
        if (args.render) {
          mode = String(args.mode ?? "PREVIEW") === "FINAL" ? "FINAL" : "PREVIEW";
          for (const sh of flat.slice(0, cursor)) {
            const job = await createRenderJob(projectId, sh.id, mode);
            jobIds.push(job.id.slice(-6));
          }
        }
        // THE MEMORY: every leg's measured outcome lands on the flow
        // that drove it - a leg that could not perform its whole
        // sentence (shots < slots) does not verify
        const memoryLines: string[] = [];
        for (const lo of legOutcomes) {
          const legOutcome = {
            scope: `battle episode ${ep.number} (leg ${lo.leg.register})`,
            program: null,
            slots: lo.leg.flow.spec.slots.length,
            directed: lo.directed,
            untouched: 0,
            unused: lo.unused,
            windBeats: lo.windBeats,
            clothCalls: lo.clothCalls,
            fleshCalls: lo.fleshCalls,
            poseCuts: lo.poseCuts,
            moveClashes: lo.moveClashes,
            fxBound: lo.fxBound,
            physBound: lo.physBound,
            motionChained: lo.motionChained,
            rendersQueued: 0,
            verified: lo.unused === 0 && lo.directed > 0,
          };
          const row = await recordSequenceOutcome(projectId, lo.leg.register, lo.leg.flow.name, legOutcome);
          if (row) memoryLines.push(`learned flow '${row.name}' (${row.register}) recorded its battle leg: ${row.runs} run(s), ${row.clears} clear(s) - ${lo.unused === 0 ? "the leg landed whole" : "the leg did NOT land whole (see the leg read)"}`);
        }
        await landDesignEvent(projectId, `Battle staged across episode ${ep.number} (${flat.length} shots): ${legs.map((l, i) => `${l.register} '${l.flow.name}' (${alloc[i]})`).join(" -> ")} - ${motionChained} chained performance(s)${chainedFlows.size ? ` (${Array.from(chainedFlows).map((n) => `'${n}'`).join(", ")})` : ""}`, { directed: cursor, renders: jobIds.length });
        const reads: string[] = [];
        if (moveClashes > 0) reads.push(`${moveClashes} cut(s) land on the same move both sides - consider alternating the blocking`);
        if (poseCuts > 0) reads.push(`${poseCuts} pose change(s) across the battle's cuts (the cloth whips on each one)`);
        if (windBeats > 0) reads.push(`${windBeats} wind beat(s) - the robes and hair ride those beats`);
        if (clothCalls > 0) reads.push(`${clothCalls} cloth call(s) - the cloth answers at the directed intensity on those shots`);
        if (fleshCalls > 0) reads.push(`${fleshCalls} flesh call(s) - the soft bodies lag at the directed intensity on those shots`);
        if (fxBound > 0 || physBound > 0) reads.push(`${fxBound} fx + ${physBound} physics binding(s) - the world answers on those shots`);
        if (motionChained > 0) reads.push(`${motionChained} chained performance(s)${chainedFlows.size ? ` (${Array.from(chainedFlows).map((n) => `'${n}'`).join(", ")})` : ""} - those shots PERFORM their keys, and a chained learned flow's timing is the timing that verified`);
        const untouched = flat.length - cursor;
        if (untouched > 0) reads.push(`${untouched} shot(s) beyond the arc left untouched`);
        return { status: "OK", result: `BATTLE STAGED across episode ${ep.number} (${flat.length} shot(s), arc ${arc.join(" > ")}, coverage ${cursor}/${flat.length}):\n${legLines.join("\n")}${reads.length ? `\nFlow read: ${reads.join("; ")}.` : ""}${memoryLines.length ? `\nMemory: ${memoryLines.join("; ")}.` : ""}${jobIds.length ? `\n${jobIds.length} ${mode} render job(s) queued (${jobIds.join(", ")}) - the previews play each leg's beats with the chain riding them.` : ` Queue renders with render:true (or render_shot per shot) - previz first, FINAL for the shipping pass.`}` };
      }

      case "design_fx": {
        const compiled = compileFxSpec({ name: String(args.name ?? ""), programs: args.programs });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const { name } = compiled.spec;
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "FX", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "FX", name } },
          create: { projectId, kind: "FX", name, spec: JSON.stringify(compiled.spec) },
          update: { spec: JSON.stringify(compiled.spec) },
        });
        const shape = compiled.spec.programs.map((p) => `${p.kind}${p.beats !== "ALL" && Array.isArray(p.beats) ? `@${p.beats.join(".")}` : ""}${p.color ? ` ${p.color}` : ""}`).join(" + ");
        await landDesignEvent(projectId, `FX program '${name}' ${existed ? "updated" : "designed"} (${shape})`, { presetId: preset.id });
        return { status: "OK", result: `FX preset '${name}' ${existed ? "updated" : "registered"}: ${shape}. Apply it to any shot with set_shot_fx fx:'${name}' - the worker compiles it into real emissive geometry that answers the grammar beats (the trail rides the blade, the burst lands at the cut, the aura breathes with the wind).` };
      }

      case "set_shot_fx": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const fxArg = String(args.fx ?? "").trim();
        if (!fxArg) {
          await db.shot.update({ where: { id: shot.id }, data: { fx: null } });
          await landDesignEvent(projectId, `FX cleared on Shot ${String(shot.number).padStart(3, "0")} (back to a clean stage)`, { shotId: shot.id });
          return { status: "OK", result: `FX cleared on Shot ${String(shot.number).padStart(3, "0")} - the stage renders clean again.` };
        }
        // resolve: saved FX preset -> built-in -> inline programs
        const saved = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "FX", name: fxArg } } });
        let programsRaw: string;
        let sourceName: string;
        if (saved) {
          try {
            const parsedSpec = JSON.parse(saved.spec || "null") as { programs?: unknown } | null;
            if (!parsedSpec?.programs) throw new Error("corrupt");
            programsRaw = JSON.stringify(parsedSpec.programs);
            sourceName = `preset '${fxArg}'`;
          } catch {
            return { status: "ERROR", result: `FX preset '${fxArg}' is corrupt - redesign it with design_fx.` };
          }
        } else {
          const builtin = findBuiltInFx(fxArg);
          if (builtin) {
            programsRaw = JSON.stringify(builtin.programs);
            sourceName = `built-in '${builtin.name}'`;
          } else if (fxArg.startsWith("[")) {
            programsRaw = fxArg;
            sourceName = "inline programs";
          } else {
            const registry = [
              ...BUILT_IN_FX.map((f) => `'${f.name}' (built-in)`),
              ...((await db.designPreset.findMany({ where: { projectId, kind: "FX" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
            ];
            return { status: "ERROR", result: `No fx program named '${fxArg}'. Registry: ${registry.join(", ")} - or pass an inline programs JSON array like [{"kind":"TRAIL","intensity":0.9}]. The worker performs: ${FX_KINDS.join(", ")}.` };
          }
        }
        const compiled = compileFxSpec({ name: `${shot.id.slice(-6)}-shot-fx`, programs: programsRaw });
        if (!compiled.ok) return { status: "ERROR", result: `the ${sourceName} programs do not compile: ${compiled.error}` };
        await db.shot.update({ where: { id: shot.id }, data: { fx: serializeFx(compiled.spec) } });
        const shape = compiled.spec.programs.map((p) => `${p.kind}${p.beats !== "ALL" && Array.isArray(p.beats) ? `@beat ${p.beats.join(",")}` : ""}${p.color ? ` in ${p.color}` : ""}`).join(" + ");
        await landDesignEvent(projectId, `Shot ${String(shot.number).padStart(3, "0")} ignites with ${sourceName}: ${shape}`, { shotId: shot.id, fx: sourceName });
        return { status: "OK", result: `THE BEATS IGNITE on Shot ${String(shot.number).padStart(3, "0")} with ${sourceName}: ${shape}. The next render_shot of this shot compiles the programs into real emissive geometry riding the same beat clock as the camera and the cloth - direct the lens first (set_shot_grammar) so the beats have something to answer.` };
      }

      case "design_physics": {
        const compiled = compilePhysicsSpec({ name: String(args.name ?? ""), programs: args.programs });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const { name } = compiled.spec;
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "PHYSICS", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "PHYSICS", name } },
          create: { projectId, kind: "PHYSICS", name, spec: JSON.stringify(compiled.spec) },
          update: { spec: JSON.stringify(compiled.spec) },
        });
        const shape = compiled.spec.programs.map((p) => `${p.kind}${p.target ? `>${p.target}` : ""}${p.beats !== "ALL" && Array.isArray(p.beats) ? `@${p.beats.join(".")}` : ""}`).join(" + ");
        await landDesignEvent(projectId, `Physics program '${name}' ${existed ? "updated" : "designed"} (${shape})`, { presetId: preset.id });
        return { status: "OK", result: `Physics preset '${name}' ${existed ? "updated" : "registered"}: ${shape}. Apply it to any shot with set_shot_physics physics:'${name}' - the worker compiles it into real rigid bodies integrated under the probed law (gravity, bounce, friction, settle) answering the grammar beats. Name the designed prop in the shot text when a KNOCK should strike it.` };
      }

      case "set_shot_physics": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const physArg = String(args.physics ?? "").trim();
        if (!physArg) {
          await db.shot.update({ where: { id: shot.id }, data: { physics: null } });
          await landDesignEvent(projectId, `Physics cleared on Shot ${String(shot.number).padStart(3, "0")} (back to a clean stage)`, { shotId: shot.id });
          return { status: "OK", result: `Physics cleared on Shot ${String(shot.number).padStart(3, "0")} - the stage renders clean again.` };
        }
        // resolve: saved physics preset -> built-in -> inline programs
        const savedPhys = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "PHYSICS", name: physArg } } });
        let physRaw: string;
        let physSource: string;
        if (savedPhys) {
          try {
            const parsedSpec = JSON.parse(savedPhys.spec || "null") as { programs?: unknown } | null;
            if (!parsedSpec?.programs) throw new Error("corrupt");
            physRaw = JSON.stringify(parsedSpec.programs);
            physSource = `preset '${physArg}'`;
          } catch {
            return { status: "ERROR", result: `Physics preset '${physArg}' is corrupt - redesign it with design_physics.` };
          }
        } else {
          const builtin = findBuiltInPhysics(physArg);
          if (builtin) {
            physRaw = JSON.stringify(builtin.programs);
            physSource = `built-in '${builtin.name}'`;
          } else if (physArg.startsWith("[")) {
            physRaw = physArg;
            physSource = "inline programs";
          } else {
            const registry = [
              ...BUILT_IN_PHYSICS.map((f) => `'${f.name}' (built-in)`),
              ...((await db.designPreset.findMany({ where: { projectId, kind: "PHYSICS" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
            ];
            return { status: "ERROR", result: `No physics program named '${physArg}'. Registry: ${registry.join(", ")} - or pass an inline programs JSON array like [{"kind":"KNOCK","intensity":0.8}]. The worker performs: ${PHYSICS_KINDS.join(", ")}.` };
          }
        }
        const compiledPhys = compilePhysicsSpec({ name: `${shot.id.slice(-6)}-shot-physics`, programs: physRaw });
        if (!compiledPhys.ok) return { status: "ERROR", result: `the ${physSource} programs do not compile: ${compiledPhys.error}` };
        await db.shot.update({ where: { id: shot.id }, data: { physics: serializePhysics(compiledPhys.spec) } });
        const physShape = compiledPhys.spec.programs.map((p) => `${p.kind}${p.target ? `>${p.target}` : ""}${p.beats !== "ALL" && Array.isArray(p.beats) ? `@beat ${p.beats.join(",")}` : ""}`).join(" + ");
        await landDesignEvent(projectId, `Shot ${String(shot.number).padStart(3, "0")} obeys its body law from ${physSource}: ${physShape}`, { shotId: shot.id, physics: physSource });
        return { status: "OK", result: `THE WORLD OBEYS on Shot ${String(shot.number).padStart(3, "0")} with ${physSource}: ${physShape}. The next render_shot of this shot compiles the programs into real rigid bodies (gravity, bounce, friction, settle) riding the same beat clock as the camera, the cloth and the fx - direct the lens first (set_shot_grammar) so the beats have something to answer${physShape.includes("KNOCK") ? ", and name the designed prop in the shot text when a KNOCK should strike it" : ""}.` };
      }

      case "design_choreography": {
        const name = String(args.name ?? "").trim();
        if (!name) return { status: "ERROR", result: "name is required - the performance's name in the show's language." };
        let keysRaw: unknown = args.keys;
        if (typeof keysRaw === "string") {
          try {
            keysRaw = JSON.parse(keysRaw);
          } catch {
            return { status: "ERROR", result: "keys is not valid JSON - pass an array like [{\"at\":0,\"pose\":\"STANCE\",\"kind\":\"hold\"},{\"at\":0.42,\"pose\":\"SLASH\",\"kind\":\"strike\"},{\"at\":1,\"pose\":\"STANCE\",\"kind\":\"follow\"}]." };
          }
        }
        const parseOpt = (v: unknown, what: string): { ok: true; value: unknown } | { ok: false; error: string } => {
          if (v === undefined || v === null || String(v).trim() === "") return { ok: true, value: null };
          if (typeof v === "string") {
            try {
              return { ok: true, value: JSON.parse(v) };
            } catch {
              return { ok: false, error: `${what} is not valid JSON` };
            }
          }
          return { ok: true, value: v };
        };
        const impactParsed = parseOpt(args.impact, "impact");
        if (!impactParsed.ok) return { status: "ERROR", result: `${impactParsed.error} - pass an object {at, frames, punch, flash}.` };
        const smearParsed = parseOpt(args.smear, "smear");
        if (!smearParsed.ok) return { status: "ERROR", result: `${smearParsed.error} - pass an object {at, frames, amount}.` };
        const compiled = compileChoreo({ keys: keysRaw, impact: impactParsed.value, smear: smearParsed.value, note: args.note ? String(args.note) : null }, name);
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const existed = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "CHOREOGRAPHY", name } } });
        const preset = await db.designPreset.upsert({
          where: { projectId_kind_name: { projectId, kind: "CHOREOGRAPHY", name } },
          create: { projectId, kind: "CHOREOGRAPHY", name, spec: JSON.stringify(compiled.spec) },
          update: { spec: JSON.stringify(compiled.spec) },
        });
        const shape = compiled.spec.keys.map((k) => `${k.pose.toLowerCase()}@${k.at}:${k.kind}`).join(" -> ");
        const accents = [compiled.spec.impact ? "impact flare + camera punch" : null, compiled.spec.smear ? "limb smear" : null].filter(Boolean).join(" + ");
        await landDesignEvent(projectId, `Choreography '${name}' ${existed ? "updated" : "designed"} (${compiled.spec.keys.length} keys${accents ? `, ${accents}` : ""})`, { presetId: preset.id });
        return { status: "OK", result: `Choreography preset '${name}' ${existed ? "updated" : "registered"}: ${shape}${accents ? ` - with ${accents}` : ""}. Apply it to any shot with set_shot_choreography choreo:'${name}' - the body performs the keys instead of sliding between two poses: anticipation earns the strike, the hold sells the read, the follow-through settles it. The keys own the body; the camera grammar still owns the lens, and the cloth, flesh and physics still answer the performing body.` };
      }

      case "set_shot_choreography": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        const chArg = String(args.choreo ?? "").trim();
        if (!chArg) {
          await db.shot.update({ where: { id: shot.id }, data: { choreo: null } });
          await landDesignEvent(projectId, `Choreography cleared on Shot ${String(shot.number).padStart(3, "0")} (back to the two-pose slide)`, { shotId: shot.id });
          return { status: "OK", result: `Choreography cleared on Shot ${String(shot.number).padStart(3, "0")} - the body slides between its start/end poses again.` };
        }
        // resolve: saved choreography preset -> built-in -> learned motion flow -> inline program
        const savedCh = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "CHOREOGRAPHY", name: chArg } } });
        let specRaw: unknown;
        let chSource: string;
        let builtinName: string | undefined;
        let flowName: string | undefined;
        if (savedCh) {
          try {
            specRaw = JSON.parse(savedCh.spec || "null");
            chSource = `preset '${chArg}'`;
          } catch {
            return { status: "ERROR", result: `Choreography preset '${chArg}' is corrupt - redesign it with design_choreography.` };
          }
        } else {
          const builtin = BUILT_IN_CHOREO.find((b) => b.name?.toLowerCase() === chArg.toLowerCase());
          if (builtin) {
            specRaw = builtin;
            chSource = `built-in '${builtin.name}'`;
            builtinName = builtin.name;
          } else {
            const learnedFlow = await db.motionFlow.findUnique({ where: { projectId_name: { projectId, name: chArg } } });
            if (learnedFlow) {
              try {
                specRaw = JSON.parse(learnedFlow.spec || "null");
                chSource = `learned flow '${learnedFlow.name}' (${learnedFlow.register.toLowerCase()}, ${learnedFlow.applied} applied / ${learnedFlow.verified} verified, from ${learnedFlow.sourceRef})`;
                flowName = learnedFlow.name;
              } catch {
                return { status: "ERROR", result: `Learned motion flow '${chArg}' is corrupt - re-learn it from its verified shot with learn_motion_flow.` };
              }
            } else if (chArg.startsWith("{")) {
              try {
                specRaw = JSON.parse(chArg);
              } catch {
                return { status: "ERROR", result: "The inline choreography program is not valid JSON - pass {\"keys\":[{\"at\":0,\"pose\":\"STANCE\",\"kind\":\"hold\"},{\"at\":1,\"pose\":\"SLASH\",\"kind\":\"strike\"}],\"impact\":{...},\"smear\":{...}}." };
              }
              chSource = "inline program";
            } else {
              const flows = rankMotionFlows(await db.motionFlow.findMany({ where: { projectId } }));
              const registry = [
                ...BUILT_IN_CHOREO.map((b) => `'${b.name}' (built-in)`),
                ...((await db.designPreset.findMany({ where: { projectId, kind: "CHOREOGRAPHY" }, select: { name: true } })).map((r) => `'${r.name}' (saved)`)),
                ...flows.map((f) => `'${f.name}' (learned flow, ${f.register.toLowerCase()}, x${f.applied}/${f.verified}v)`),
              ];
              return { status: "ERROR", result: `No choreography named '${chArg}'. Registry: ${registry.join(", ")} - or pass an inline JSON program like {"keys":[{"at":0,"pose":"STANCE","kind":"hold"},{"at":0.42,"pose":"SLASH","kind":"strike"},{"at":1,"pose":"STANCE","kind":"follow"}],"impact":{"at":0.42,"frames":3,"punch":2.5,"flash":0.8}}.` };
            }
          }
        }
        const compiledCh = compileChoreo(specRaw, chSource);
        if (!compiledCh.ok) return { status: "ERROR", result: `${chSource} does not compile: ${compiledCh.error}` };
        const perfName = (specRaw !== null && typeof specRaw === "object" && !Array.isArray(specRaw) && typeof (specRaw as { name?: unknown }).name === "string" && (specRaw as { name: string }).name.trim())
          ? (specRaw as { name: string }).name.trim()
          : (savedCh ? chArg : builtinName || flowName);
        const perf = { ...compiledCh.spec, name: perfName, ...(flowName ? { flow: flowName } : {}) };
        await db.shot.update({ where: { id: shot.id }, data: { choreo: JSON.stringify(perf) } });
        if (flowName) {
          await db.motionFlow.update({
            where: { projectId_name: { projectId, name: flowName } },
            data: { applied: { increment: 1 } },
          });
        }
        const chShape = compiledCh.spec.keys.map((k) => `${k.pose.toLowerCase()}@${k.at}:${k.kind}`).join(" -> ");
        await landDesignEvent(projectId, `Shot ${String(shot.number).padStart(3, "0")} performs from ${chSource}: ${chShape}`, { shotId: shot.id, choreo: chSource });
        return { status: "OK", result: `THE BODY PERFORMS on Shot ${String(shot.number).padStart(3, "0")} with ${chSource}: ${chShape}${compiledCh.spec.impact ? ", the impact frame flares a real light and punches the camera" : ""}${compiledCh.spec.smear ? ", the striking limb smears on the fastest frames" : ""}. The next render_shot of this shot performs the keys instead of the two-pose slide - the keys own the body, the camera grammar still owns the lens, and the cloth, flesh and physics still answer the performing body. Direct the lens first (set_shot_grammar) so the performance has a frame worth cutting to.` };
      }

      case "learn_motion_flow": {
        // THE MOTION IS LEARNED: adopt the shot's verified keyed
        // performance as a named flow the whole production consults.
        const flowNameArg = String(args.name ?? "").trim();
        if (!flowNameArg) return { status: "ERROR", result: "Name the flow - learn_motion_flow name:'<name>' register:'<register>'." };
        const registerArg = String(args.register ?? "").trim().toUpperCase();
        if (!isMotionRegister(registerArg)) {
          return { status: "ERROR", result: `register must be one of ${MOTION_REGISTERS.join(" | ")} - the dramatic register the flow serves.` };
        }
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
        const shot = await db.shot.findFirst({
          where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
        });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        if (!shot.choreo) {
          return { status: "ERROR", result: `Shot ${String(shot.number).padStart(3, "0")} carries no choreography program - a flow is a KEYED performance. Key it first (design_choreography + set_shot_choreography), render it, verify it, then learn from it.` };
        }
        let storedProgram: unknown;
        try {
          storedProgram = JSON.parse(shot.choreo);
        } catch {
          return { status: "ERROR", result: `Shot ${String(shot.number).padStart(3, "0")}'s choreography is corrupt - re-apply it (set_shot_choreography) before learning from it.` };
        }
        const compiledFlow = compileChoreo(storedProgram, `shot ${scene.number}/${shot.number}`);
        if (!compiledFlow.ok) {
          return { status: "ERROR", result: `The shot's choreography does not compile (${compiledFlow.error}) - fix the program before learning from it.` };
        }
        const keys = compiledFlow.spec.keys;
        const poseFrom = keys[0].pose;
        const poseTo = keys[keys.length - 1].pose;
        // THE ADOPTION LAW: the render must have VERIFIED - a passing
        // pixel review or a human's APPROVED/FINAL.
        const latestFinished = await db.renderJob.findFirst({
          where: { projectId, shotId: shot.id, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
          orderBy: { createdAt: "desc" },
        });
        const review = latestFinished
          ? await db.renderReview.findFirst({ where: { renderJobId: latestFinished.id }, orderBy: { createdAt: "desc" } })
          : null;
        const gate = motionFlowAdoptionGate(
          { status: shot.status, choreo: shot.choreo },
          review ? { state: review.state, overall: review.overall, bar: review.bar } : null,
        );
        if (!gate.ok) {
          return { status: "ERROR", result: `The motion did not verify, so it cannot be learned: ${gate.reason}. A flow remembers only what the pixels proved.` };
        }
        const sourceRef = `Sc${scene.number} Sh${String(shot.number).padStart(3, "0")}`;
        const specJson = JSON.stringify({ keys: compiledFlow.spec.keys, impact: compiledFlow.spec.impact, smear: compiledFlow.spec.smear });
        const existing = await db.motionFlow.findUnique({ where: { projectId_name: { projectId, name: flowNameArg } } });
        if (existing) {
          await db.motionFlow.update({
            where: { projectId_name: { projectId, name: flowNameArg } },
            data: { register: registerArg, spec: specJson, poseFrom, poseTo, sourceShotId: shot.id, sourceRef, adoptedFrom: gate.reason },
          });
        } else {
          await db.motionFlow.create({
            data: {
              projectId, register: registerArg, name: flowNameArg, spec: specJson,
              poseFrom, poseTo, sourceShotId: shot.id, sourceRef, adoptedFrom: gate.reason,
            },
          });
        }
        await landDesignEvent(projectId, `Learned motion flow '${flowNameArg}' (${registerArg.toLowerCase()}) from ${sourceRef}: ${poseFrom.toLowerCase()} -> ${poseTo.toLowerCase()} - ${gate.reason}`, { shotId: shot.id });
        return { status: "OK", result: `THE MOTION IS LEARNED: '${flowNameArg}' (${registerArg.toLowerCase()}) now remembers the verified performance from ${sourceRef} - ${poseFrom.toLowerCase()} -> ${poseTo.toLowerCase()}, ${keys.length} key(s), adopted because ${gate.reason}. Apply it to any shot with set_shot_choreography choreo:'${flowNameArg}' - every application grows its record, and every passing review of a flow-carrying shot verifies it again. ${existing ? `The flow existed and was re-learned from fresher evidence (${existing.applied} applications kept).` : "A verified performance nobody names is a lesson the studio re-pays for every fight."}` };
      }

      case "measure_identity_bar": {
        // THE BAR IS MEASURED: optionally earn fresh render-source
        // readings (real vision calls over finished clips), then read
        // the aggregation against the 70% shipping bar honestly.
        const m = await identityBarMeasurement(projectId);
        const fresh: string[] = [];
        const failed: string[] = [];
        const limitArg = Number(args.limit ?? 0);
        if (Number.isFinite(limitArg) && limitArg > 0) {
          const scored = await scoreProjectIdentity(projectId, Math.min(8, Math.round(limitArg)), "RENDER");
          for (const s of scored.scored) {
            fresh.push(`${s.ref}: ${s.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(s.verdict.worst * 100).toFixed(0)}%`);
          }
          for (const e of scored.errors) failed.push(`${e.ref}: ${e.error}`);
        }
        const after = fresh.length > 0 ? await identityBarMeasurement(projectId) : m;
        const lines = [
          identityBarMeasurementLine(after),
          ...(fresh.length ? [`Freshly measured (${fresh.length}):\n${fresh.join("\n")}`] : []),
          ...(failed.length ? [`Skipped (honest misses):\n${failed.join("\n")}`] : []),
        ];
        const verdictTail = after.scored === 0
          ? ` Score finished renders first: queue renders (render_shot), then measure_identity_bar limit:'<N>' - each reading is a real vision call over the shipping pixels.`
          : after.share !== null && after.share >= 0.5
            ? ` The painted pipeline holds the bar more often than not - the ${after.below} below-bar render(s) earn the re-render loop (render_fix or re-render), then measure again.`
            : ` Most shipping frames sit under the bar - the re-render loop and the identity re-anchor (regenerate the drifting sheets) are the honest next moves, then measure again.`;
        return { status: "OK", result: `IDENTITY BAR MEASURED (shipping pixels, bar ${Math.round(after.bar * 100)}%):\n${lines.join("\n")}.${verdictTail}` };
      }

      case "cast_identity_pass": {
        // THE CAST ANSWERS THE BAR: optionally earn fresh readings
        // (same law as measure_identity_bar's limit), then read the
        // per-member standing against the source's bar.
        const source = String(args.source ?? "render").trim().toLowerCase() === "panel" ? "PANEL" : "RENDER";
        const scoreFirst = Number(args.scoreFirst ?? 0);
        const fresh: string[] = [];
        const failed: string[] = [];
        if (Number.isFinite(scoreFirst) && scoreFirst > 0) {
          const scored = await scoreProjectIdentity(projectId, Math.min(8, Math.round(scoreFirst)), source);
          for (const s of scored.scored) {
            fresh.push(`${s.ref}: ${s.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(s.verdict.worst * 100).toFixed(0)}%`);
          }
          for (const e of scored.errors) failed.push(`${e.ref}: ${e.error}`);
        }
        const m = await castIdentityMeasurement(projectId, source);
        const tail =
          m.cast === 0
            ? " Create the cast first (create_character), paint their sheets, render their shots, then pass again."
            : m.unanchored > 0 && m.below === 0 && m.untested === 0
              ? ` The unanchored member(s) cannot answer the bar yet - generate_model_sheet paints their sheet, then pass again.`
              : m.below > 0
                ? ` The below members are the re-render queue by name: re-render their worst shots (render_fix / render_shot) or re-anchor their drifting sheets, then pass again - the standing is the work order.`
                : m.untested > 0
                  ? ` No member sits below the bar - score the untested members' renders (cast_identity_pass scoreFirst:'<N>') before calling the cast sheet-conformant.`
                  : ` Every anchored member measured and cleared the bar - the cast is sheet-conformant at the ${Math.round(m.bar * 100)}% line.`;
        return {
          status: "OK",
          result: `CAST IDENTITY PASS (${source.toLowerCase()} source, bar ${Math.round(m.bar * 100)}%):\n${castIdentityLine(m)}.${fresh.length ? `\nFreshly measured (${fresh.length}):\n${fresh.join("\n")}` : ""}${failed.length ? `\nSkipped (honest misses):\n${failed.join("\n")}` : ""}${tail}`,
        };
      }

      case "identity_repair_pass": {
        // THE GAP IS REPAIRED: the standing's work order executes here -
        // sheet DNA read (vision), re-render over the real engine,
        // re-score (real vision), re-anchor the members the re-render
        // could not lift, then the standing again. Honest ledger.
        const res = await runIdentityRepairPass(projectId, {
          members: Number(args.members ?? 2),
          shotsPerMember: Number(args.shotsPerMember ?? 1),
          reanchor: args.reanchor !== false,
        });
        if (res.members.length === 0) {
          const m = await castIdentityMeasurement(projectId, "RENDER");
          return { status: "OK", result: `IDENTITY REPAIR PASS: nothing to repair - no member sits BELOW the ${Math.round(res.bar * 100)}% bar. ${castIdentityLine(m)}` };
        }
        const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
        const lines = res.members.map((mem) => {
          const shotLines = mem.shots.length
            ? mem.shots.map((s) => `    ${s.ref}: ${pct(s.before)} -> ${s.after === null ? "unscored" : pct(s.after)} - ${s.verdict}${s.error ? ` (${s.error})` : ""}`).join("\n")
            : "    (no named below shot found - the readings moved before the loop reached them)";
          return `  ${mem.name}: ${repairVerdictLine(mem.verdict)}\n${shotLines}\n    dna: ${mem.dna.line}${mem.reanchored ? "\n    re-anchored: the canonical sheet was regenerated mid-loop, the shots re-scored against the new sheet" : ""}${mem.reanchorError ? `\n    re-anchor FAILED: ${mem.reanchorError}` : ""}\n    standing after: ${mem.after.standing}${mem.after.worst !== null ? ` (worst ${pct(mem.after.worst)})` : ""}`;
        });
        return {
          status: "OK",
          result: [
            `IDENTITY REPAIR PASS (shipping bar ${Math.round(res.bar * 100)}%):`,
            ...lines,
            `standing: ${res.before.below} below -> ${res.after.below} below, ${res.before.clearing} -> ${res.after.clearing} clearing (${res.after.measured} measured).`,
            res.after.below === 0
              ? " The named gap is closed - pass the cast again to confirm the standing."
              : ` ${res.after.below} member(s) still below - the loop can run again (the standing is the work order), or widen shotsPerMember.`,
          ].join("\n"),
        };
      }

      case "review_render": {
        // JUDGE THE PIXELS: resolve the shot (or the explicit job), review
        // its finished clip, read the verdict back like any other evidence.
        let job = null as Awaited<ReturnType<typeof db.renderJob.findFirst>>;
        if (args.jobId) {
          job = await db.renderJob.findFirst({ where: { id: String(args.jobId), projectId } });
          if (!job) return { status: "ERROR", result: `No render job "${String(args.jobId)}" in this production.` };
        } else {
          let scene: Awaited<ReturnType<typeof latestScene>> = null;
          if (args.sceneNumber) {
            const scenes = await db.scene.findMany({
              where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
              orderBy: { createdAt: "desc" },
            });
            scene = scenes[0] ?? null;
          }
          if (!scene) scene = await latestScene(projectId);
          if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
          const shot = await db.shot.findFirst({
            where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
          });
          if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
          job = await db.renderJob.findFirst({
            where: { projectId, shotId: shot.id, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
            orderBy: { createdAt: "desc" },
          });
          if (!job) return { status: "ERROR", result: `Shot ${String(shot.number).padStart(3, "0")} of Scene ${scene.number} has no finished render yet - queue one (render_shot) and review what exists, not what is promised.` };
        }
        const res = await reviewRenderJob(job.id);
        if (!res.ok) return { status: "ERROR", result: `The pixel review could not run: ${res.error}` };
        const v = res.review.verdict;
        // THE MOTION IS LEARNED (the verification half): a PASSED review
        // of a flow-carrying shot verifies the flow's timing again.
        if (res.review.state === "PASSED" && job.shotId) {
          const reviewedShot = await db.shot.findUnique({ where: { id: job.shotId }, select: { choreo: true, number: true } });
          const carriedFlow = flowNameFromChoreo(reviewedShot?.choreo ?? null);
          if (carriedFlow) {
            const flowRow = await db.motionFlow.findUnique({ where: { projectId_name: { projectId, name: carriedFlow } } });
            if (flowRow) {
              await db.motionFlow.update({ where: { projectId_name: { projectId, name: carriedFlow } }, data: { verified: { increment: 1 } } });
              await landDesignEvent(projectId, `Motion flow '${carriedFlow}' verified again - ${res.review.targetRef} PASSED at ${res.review.overall !== null ? `${Math.round(res.review.overall * 100)}%` : "bar"} (x${flowRow.verified + 1}v/${flowRow.applied}a)`, { renderJobId: job.id });
            }
          }
        }
        const crit = v ? Object.entries(v.criteria).filter(([, x]) => typeof x === "number").map(([k, x]) => `${k} ${(x as number).toFixed(2)}`).join(", ") : "";
        const m = v?.metrics;
        const measured = m ? `measured: lumaMean ${m.lumaMean}, lumaStd ${m.lumaStd}, satMean ${m.satMean}, near-black ${(m.darkFrac * 100).toFixed(1)}%, clipped-white ${(m.brightFrac * 100).toFixed(1)}%` : "";
        const issueLines = (v?.issues ?? []).slice(0, 6).map((i) => `${i.severity} ${i.kind}: ${i.note}`).join("; ") || "none";
        await landDesignEvent(projectId, `Pixel review on ${res.review.targetRef}: ${res.review.overall !== null ? `${Math.round(res.review.overall * 100)}%` : "unmeasured"} (${res.review.provider}) - ${res.review.state}, ${res.review.issuesFound} issue(s)`, { renderJobId: job.id });
        return { status: "OK", result: `THE RENDER IS JUDGED: ${res.review.targetRef} (attempt ${job.attempt}) scores ${res.review.overall !== null ? `${Math.round(res.review.overall * 100)}%` : "unmeasured"} - ${res.review.state}, provider ${res.review.provider}, frame ${res.review.framePath ?? "none"}.\n${crit ? `criteria: ${crit}\n` : ""}${measured ? `${measured}\n` : ""}issues: ${issueLines}${v?.note ? `\nnote: ${v.note}` : ""}\nThe review is EVIDENCE, not a verdict: pair it with the DSH inspection on this render, and fix what it names before promising the shot serves its intent (the issue kinds I act on: ${RENDER_ISSUE_KINDS.join(", ")}).` };
      }

      case "render_fix": {
        // THE FIX RETURNS TO THE PIXELS: resolve the reviewed render,
        // apply the parameter fix each open issue kind calls for, queue
        // the new attempt - the fresh attempt's pixel review is the judge.
        let job = null as Awaited<ReturnType<typeof db.renderJob.findFirst>>;
        if (args.jobId) {
          job = await db.renderJob.findFirst({ where: { id: String(args.jobId), projectId } });
          if (!job) return { status: "ERROR", result: `No render job "${String(args.jobId)}" in this production.` };
        } else {
          let scene: Awaited<ReturnType<typeof latestScene>> = null;
          if (args.sceneNumber) {
            const scenes = await db.scene.findMany({
              where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
              orderBy: { createdAt: "desc" },
            });
            scene = scenes[0] ?? null;
          }
          if (!scene) scene = await latestScene(projectId);
          if (!scene) return { status: "ERROR", result: "No scene exists - break down an episode first (create_episode / the breakdown tools)." };
          const shot = await db.shot.findFirst({
            where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 },
          });
          if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
          job = await db.renderJob.findFirst({
            where: { projectId, shotId: shot.id, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
            orderBy: { createdAt: "desc" },
          });
          if (!job) return { status: "ERROR", result: `Shot ${String(shot.number).padStart(3, "0")} of Scene ${scene.number} has no finished render to fix - queue one (render_shot), let the review judge it, then fix what it names.` };
        }
        let issueIds: string[] | undefined;
        if (args.issueIds !== undefined) {
          try {
            const parsed = JSON.parse(String(args.issueIds));
            if (Array.isArray(parsed)) issueIds = parsed.map(String);
          } catch {
            return { status: "ERROR", result: "issueIds must be a JSON array of issue ids." };
          }
        }
        const res = await fixRenderIssues(job.id, issueIds);
        if (!res.ok) return { status: "ERROR", result: res.error ?? "the render fix failed" };
        if (res.attempted === 0) return { status: "OK", result: `${res.targetRef} has no open review issues to fix - run review_render for the current standing.` };
        const appliedText = res.applied.map((op) => `${op.param} ${op.from} -> ${op.to}`).join(", ");
        const refused = res.wontfix.length > 0 ? ` Refused honestly: ${res.wontfix.map((w) => w.kind).join(", ")} - ${res.wontfix[0]?.note ?? "no parameter fix"}.` : "";
        if (res.applied.length === 0) {
          return { status: "OK", result: `THE FIX REFUSED: ${res.targetRef} - no parameter can act on these issue kinds.${refused} Adjust the direction (set_shot_grammar / set_shot_fx) and re-render.` };
        }
        return { status: "OK", result: `THE FIX RETURNS TO THE PIXELS: ${res.targetRef} - ${res.applied.length} parameter fix(es) applied (${appliedText}); attempt ${res.newAttempt} queued with the adjusted scene.${refused}\nThe fresh attempt's pixel review is THE JUDGE: review_render it when it lands - an issue is fixed only when the new pixels stop raising it (the way design_fix's re-audit judges its fixes). The issue fix notes carry what cleared and what did not; loop while the review names majors the pixels can answer.` };
      }

      case "learn_retopo_flow": {
        const name = String(args.name ?? "").trim();
        if (!name) return { status: "ERROR", result: "name is required - a flow the studio applies by name (blender_retopo flow:'<name>')." };
        const kindRaw = String(args.kind ?? "PROP").toUpperCase();
        if (!isBlenderAssetKind(kindRaw)) return { status: "ERROR", result: `kind must be one of CHARACTER | ENVIRONMENT | PROP | CREATURE (got "${kindRaw}").` };
        let seedOutcome: RetopoOutcome | null = null;
        let learnedFrom: string | null = null;
        if (args.refName !== undefined && String(args.refName).trim()) {
          const refName = String(args.refName).trim();
          const asset = await db.blenderAsset.findFirst({ where: { projectId, refName }, orderBy: { updatedAt: "desc" } });
          if (!asset) return { status: "ERROR", result: `No library asset named "${refName}" - a flow is learned from a run that exists, not from a guess.` };
          const meta = (() => { try { return JSON.parse(asset.meta || "{}") as Record<string, unknown>; } catch { return {}; } })();
          const retopoMeta = meta.retopo as Record<string, unknown> | undefined;
          if (!retopoMeta || typeof retopoMeta !== "object") {
            return { status: "ERROR", result: `${refName} carries no measured retopo run - run blender_retopo on it first; the flow's record is seeded from measured numbers.` };
          }
          learnedFrom = `${asset.kind}:${asset.refName} v${asset.version}`;
          seedOutcome = {
            assetRef: learnedFrom,
            trisBefore: typeof retopoMeta.trisBefore === "number" ? retopoMeta.trisBefore : null,
            trisAfter: typeof retopoMeta.trisAfter === "number" ? retopoMeta.trisAfter : null,
            driftPct: typeof retopoMeta.driftPct === "number" ? retopoMeta.driftPct : null,
            verified: Boolean(retopoMeta.verified),
            at: new Date().toISOString(),
          };
        }
        const compiled = compileRetopoSpec({
          budget: args.budget !== undefined ? Number(args.budget) : (DEFAULT_RETOPO_BUDGET[kindRaw] ?? 20_000),
          parts: args.parts !== undefined ? String(args.parts) : null,
        });
        if (!compiled.ok) return { status: "ERROR", result: compiled.error };
        const flow = await learnRetopoFlow({ projectId, kind: kindRaw, name, spec: compiled.spec, seedOutcome, learnedFrom });
        await landDesignEvent(projectId, `Retopo flow '${name}' ${seedOutcome ? "learned from a measured run" : "registered"} for ${kindRaw.toLowerCase()} (budget ${compiled.spec.budget.toLocaleString()})`, { flowId: flow.id, kind: kindRaw });
        return { status: "OK", result: `RETOPO FLOW '${name}' remembered for ${kindRaw.toLowerCase()}: budget ${compiled.spec.budget.toLocaleString()}, parts ${flow.spec.parts.length ? flow.spec.parts.join(", ") : "every mesh"}${seedOutcome ? `, seeded with the measured run (${seedOutcome.trisBefore ?? "?"} -> ${seedOutcome.trisAfter ?? "?"} tris, drift ${seedOutcome.driftPct ?? "?"}%, ${seedOutcome.verified ? "verified" : "NOT verified"})` : ", no measured outcome yet"}. Apply it with blender_retopo flow:'${name}' - every outcome grows the record - and design_fix consults the best-verified flow for the kind before it decimates; each re-audit that stops raising TOPOLOGY earns the flow a clear.` };
      }

      case "plan_sculpt": {
        const refName = String(args.refName ?? "").trim();
        if (!refName) return { status: "ERROR", result: "refName is required - the surface is read from a real asset, not a vibe." };
        const asset = await db.blenderAsset.findFirst({ where: { projectId, refName }, orderBy: { updatedAt: "desc" } });
        if (!asset) return { status: "ERROR", result: `No library asset named "${refName}" - design one first (blender_asset_build); the probe reads the actual .blend.` };
        const kindRaw = args.kind !== undefined ? String(args.kind).toUpperCase() : asset.kind;
        if (!isBlenderAssetKind(kindRaw)) return { status: "ERROR", result: `kind must be one of CHARACTER | ENVIRONMENT | PROP | CREATURE (got "${kindRaw}").` };
        const name = String(args.name ?? "").trim() || `${asset.refName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-plan`;
        const useVision = args.vision === undefined ? true : Boolean(args.vision);
        const res = await planSculpt({ projectId, assetId: asset.id, name, useVision });
        if (!res.ok) return { status: "ERROR", result: `the surface read failed: ${res.error}` };
        const readLine = surfaceReadLine(res.read);
        const layers = res.plan.spec.layers.map((l) => `${l.kind} i${l.intensity} s${l.scale}`).join(" + ");
        const visionLine = res.note ? ` ${res.note}` : "";
        return { status: "OK", result: `THE SURFACE WAS READ (provider ${res.provider}): ${readLine}${visionLine}\nSCULPT PLAN '${res.plan.name}' ${res.created ? "saved" : "updated"} for ${res.plan.kind.toLowerCase()}: ${layers} over subdivision ${res.plan.spec.subdivision}, seed ${res.plan.spec.seed}. Carve it with blender_asset_build plan:'${res.plan.name}' - the pass's measured evidence grows the plan's record - and design_fix now consults the kind's best-proven plan before any default recipe; every re-audit that stops raising SCULPT earns the plan a clear. The carve you can cite beats the slab you hoped for.` };
      }

      case "render_redirection": {
        let scene: Awaited<ReturnType<typeof latestScene>> = null;
        if (args.sceneNumber) {
          const scenes = await db.scene.findMany({
            where: { episode: { season: { projectId } }, number: Number(args.sceneNumber) },
            orderBy: { createdAt: "desc" },
          });
          scene = scenes[0] ?? null;
        }
        if (!scene) scene = await latestScene(projectId);
        if (!scene) return { status: "ERROR", result: "No scene exists - direct a shot first (create_episode / the breakdown tools)." };
        const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: args.shotNumber ? Number(args.shotNumber) : 1 } });
        if (!shot) return { status: "ERROR", result: `Shot ${String(args.shotNumber ?? 1)} not found in Scene ${scene.number}.` };
        let jobId = args.jobId ? String(args.jobId).trim() : "";
        if (!jobId) {
          const latest = await db.renderJob.findFirst({
            where: { shotId: shot.id, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
            orderBy: { createdAt: "desc" },
          });
          if (!latest) return { status: "ERROR", result: "no finished render for this shot yet - review what exists, not what is promised (render_shot, then review_render)." };
          jobId = latest.id;
        }
        let issueIds: string[] | undefined;
        if (args.issueIds !== undefined && String(args.issueIds).trim()) {
          try {
            const parsed = JSON.parse(String(args.issueIds)) as unknown;
            if (!Array.isArray(parsed)) return { status: "ERROR", result: "issueIds must be a JSON array of issue ids." };
            issueIds = parsed.map(String);
          } catch {
            return { status: "ERROR", result: "issueIds must be a JSON array of issue ids." };
          }
        }
        const res = await proposeRedirection(jobId, issueIds);
        if (!res.ok) return { status: "ERROR", result: res.error ?? "the re-direction could not run" };
        if (res.proposed === 0) {
          return { status: "OK", result: `NO RE-DIRECTION PROPOSED for ${res.targetRef} - ${res.opsChain}. The graduated law is honest: it proposes only what the direction can actually act, and it refuses what it cannot (contrast lives in the light law, palette in the materials).` };
        }
        const ops = [
          ...res.grammarOps.map((o) => `GRAMMAR ${o.op} (cited ${o.citedKind} ${o.citedSeverity}${o.citedNumber ? ` ${o.citedNumber}` : ""}): ${o.detail}`),
          ...res.fxOps.map((o) => `FX ${o.kind} @${o.intensity}${o.beats === "ALL" ? " ALL" : ` beats ${(o.beats as number[]).join(".")}`} (cited ${o.citedKind} ${o.citedSeverity}${o.citedNumber ? ` ${o.citedNumber}` : ""}): ${o.detail}`),
        ].join("; ");
        const refusals = res.refusals.length > 0 ? ` Refusals: ${res.refusals.map((r) => `${r.kind} - ${r.note}`).join("; ")}.` : "";
        return { status: "OK", result: `THE FIX GRADUATED TO THE DIRECTION on ${res.targetRef}: ${res.proposed} re-direction op(s) proposed and applied through the compilers - ${ops}.${refusals} Attempt ${res.newAttempt ?? "?"} is queued (fixOf lineage names the reviewed attempt) and its fresh pixel review is THE JUDGE - by kind, the same law that judges a parameter fix. Escalated kinds this run: ${res.exhaustedKinds.length ? res.exhaustedKinds.join(", ") : "INTENT (always direction-level)"}. Read the verdict from the new review's issues, never from intention.` };
      }

      case "design_audit": {
        if (args.library) {
          const res = await auditLibrary(projectId, true);
          if (!res.ok) return { status: "ERROR", result: "library audit failed" };
          return { status: "OK", result: `LIBRARY audit: ${res.audited} asset(s) audited - ${res.passed} cleared the bar, ${res.needsWork} need work, ${res.skipped} skipped (not READY). ${res.rollup.note}\nRun design_status for the full standing, design_fix on the assets that need work.` };
        }
        const refName = String(args.refName ?? "").trim();
        if (!refName) return { status: "ERROR", result: "refName is required (or pass library:true to sweep the whole library)." };
        const kindRaw = String(args.kind ?? "PROP").toUpperCase();
        const asset = await db.blenderAsset.findFirst({
          where: { projectId, refName, ...(isBlenderAssetKind(kindRaw) ? { kind: kindRaw } : {}) },
          orderBy: { updatedAt: "desc" },
        }) ?? await db.blenderAsset.findFirst({ where: { projectId, refName }, orderBy: { updatedAt: "desc" } });
        if (!asset) return { status: "ERROR", result: `No library asset named "${refName}" - design one first with blender_asset_build.` };
        const res = await auditAsset(asset.id, true);
        if (!res.ok) return { status: "ERROR", result: res.error ?? "audit failed" };
        const pct = `${Math.round(res.overall * 100)}%`;
        const issueLines = res.issues.map((i) => `  ${i.severity} ${i.kind}: ${i.note}`).join("\n");
        return { status: "OK", result: `DESIGN AUDIT ${res.state}: ${asset.kind.toLowerCase()} ${asset.refName} scored ${pct} against the ${(res.bar * 100).toFixed(0)}% bar (${res.provider} verdict).\n${res.issues.length ? `Issues (${res.issues.length}):\n${issueLines}` : "No issues found - the design cleared the bar."}\n${res.issues.length ? "Next: design_fix on this asset works through the open issues with a real bpy pass and re-audits." : ""}\n${res.note}` };
      }

      case "design_fix": {
        const refName = String(args.refName ?? "").trim();
        if (!refName) return { status: "ERROR", result: "refName is required." };
        const kindRaw = String(args.kind ?? "PROP").toUpperCase();
        const asset = await db.blenderAsset.findFirst({
          where: { projectId, refName, ...(isBlenderAssetKind(kindRaw) ? { kind: kindRaw } : {}) },
          orderBy: { updatedAt: "desc" },
        }) ?? await db.blenderAsset.findFirst({ where: { projectId, refName }, orderBy: { updatedAt: "desc" } });
        if (!asset) return { status: "ERROR", result: `No library asset named "${refName}" - design one first with blender_asset_build.` };
        let issueIds: string[] | undefined;
        if (args.issueIds !== undefined) {
          try {
            const parsed = JSON.parse(String(args.issueIds));
            if (Array.isArray(parsed)) issueIds = parsed.map(String);
          } catch {
            return { status: "ERROR", result: "issueIds must be a JSON array of issue ids." };
          }
        }
        const res = await fixIssues(asset.id, issueIds);
        if (!res.ok) return { status: "ERROR", result: res.error ?? "the fix pass failed" };
        if (res.attempted === 0) return { status: "OK", result: `${res.refName} has no open issues to fix - run design_audit for the current standing.` };
        const re = res.reAudit ? `Re-audit: ${res.reAudit.state} at ${Math.round(res.reAudit.overall * 100)}%.` : "";
        return { status: "OK", result: `DESIGN FIX landed: ${res.refName} v${res.versionBefore} -> v${res.versionAfter}. ${res.fixed}/${res.attempted} issue(s) cleared by the re-audit${res.stillOpen ? `, ${res.stillOpen} still flagged (the re-audit is the judge - see design_status)` : ""}. ${re}\n${res.fixLog.slice(-600)}` };
      }

      case "design_status": {
        const status = await designStatus(projectId);
        const sev = status.bySeverity;
        if (status.assets.length === 0) {
          return { status: "OK", result: "No designs on file yet - the design loop starts with blender_asset_build." };
        }
        const assetLines = status.assets.map((a) => `  ${a.kind.toLowerCase()} ${a.refName}: ${a.status} v${a.version}${a.qualityScore !== null ? `, quality ${Math.round(a.qualityScore * 100)}%` : ", never audited (design_audit)"}${a.motionPreset ? `, performing '${a.motionPreset}'` : (a.kind === "PROP" || a.kind === "CREATURE") ? ", MOTIONLESS (design_motion + rebuild)" : ""}${a.variationPreset ? ", varied (GN)" : a.kind === "ENVIRONMENT" ? ", WALLPAPER (design_variation + rebuild)" : ""}`);
        const issueLines = status.openIssues.map((i) => `  ${i.severity} ${i.kind} on ${i.refName}: ${i.note}${i.fixNote ? ` (fix note: ${i.fixNote.slice(0, 90)})` : ""}`);
        const reviewLines = status.reviews.slice(0, 5).map((r) => `  ${r.createdAt.slice(0, 16)}Z ${r.targetRef} ${r.state}${r.overall !== null ? ` ${Math.round(r.overall * 100)}%` : ""}`);
        return { status: "OK", result: `DESIGN STATUS: ${Object.entries(sev).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ") || "no"} open issue(s) across ${status.assets.length} asset(s).\nAssets:\n${assetLines.join("\n")}\n${issueLines.length ? `Open issues:\n${issueLines.join("\n")}\n` : "No open issues.\n"}Recent audits:\n${reviewLines.join("\n")}` };
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

      case "translate_subtitles": {
        const targetLang = normalizeLangTag(String(args.targetLang ?? "").trim());
        if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(targetLang)) {
          return { status: "ERROR", result: `targetLang must be a language tag like en-US or ja-JP (got "${targetLang || "none"}").` };
        }
        const rawSrt = typeof args.srt === "string" ? args.srt.trim() : "";
        let cues;
        let sourceNote: string;
        let epNumber: number | null = null;
        if (rawSrt) {
          const parsed = parseSrt(rawSrt);
          if (parsed.cues.length === 0) {
            return { status: "ERROR", result: "The passed SRT has no parseable cues - check the timecodes." };
          }
          cues = parsed.cues;
          sourceNote = `pasted SRT (${parsed.cues.length} cues${parsed.skipped > 0 ? `, ${parsed.skipped} skipped` : ""})`;
        } else {
          const ep = args.episodeNumber
            ? await db.episode.findFirst({
                where: { season: { projectId }, number: Number(args.episodeNumber) },
                orderBy: { season: { number: "asc" } },
              })
            : await latestEpisode(projectId);
          if (!ep) return { status: "ERROR", result: "No episode exists yet - create one with create_episode first, or pass an srt document directly." };
          const built = await buildEpisodeDialogueCues(ep.id);
          if (built.cues.length === 0) {
            return { status: "ERROR", result: `EP${String(ep.number).padStart(2, "0")}: ${built.note}.` };
          }
          cues = built.cues;
          sourceNote = built.note;
          epNumber = ep.number;
        }

        let outcome;
        try {
          outcome = await translateSubtitleCues(projectId, cues, targetLang);
        } catch (err) {
          return { status: "ERROR", result: `Translation failed: ${err instanceof Error ? err.message : String(err)}` };
        }

        // Persist the translated SRT under public/subtitles/.
        const proj = await db.project.findUnique({ where: { id: projectId }, select: { title: true } });
        const slug = String(proj?.title ?? "episode").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "episode";
        const epTag = epNumber !== null ? `-ep${String(epNumber).padStart(2, "0")}` : "";
        const filename = `${slug}${epTag}-${targetLang}.srt`;
        try {
          const dir = path.join(process.cwd(), "public", "subtitles");
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, filename), serializeSrt(outcome.cues), "utf8");
        } catch {
          return { status: "OK", result: `Translation finished (${outcome.stats.cues} cues, glossary ${outcome.stats.glossarySize}, ${outcome.stats.termHits} enforcement pass(es)) but the SRT file could not be written - the full document is in this result:\n\n${serializeSrt(outcome.cues)}` };
        }

        const suggestionsNote = outcome.suggestions.length > 0
          ? ` New-term suggestions worth adopting into memory: ${outcome.suggestions.map((s) => `"${s.term}" -> "${s.translation}"`).join("; ")}. Adopt them with create_terminology.`
          : "";
        await db.productionEvent.create({
          data: {
            projectId,
            actor: "DSH",
            type: "TRANSLATION",
            summary: `Subtitles translated to ${targetLang}: ${outcome.stats.cues} cues, glossary ${outcome.stats.glossarySize}, ${outcome.stats.termHits} enforcement pass(es) -> /subtitles/${filename}`,
            payload: JSON.stringify({ targetLang, source: sourceNote, stats: outcome.stats, suggestions: outcome.suggestions, file: `/subtitles/${filename}` }),
          },
        });
        return { status: "OK", result: `Subtitles translated to ${targetLang} (${sourceNote}; ${outcome.stats.cues} cues in ${outcome.stats.batches} batches, glossary ${outcome.stats.glossarySize} entr${outcome.stats.glossarySize === 1 ? "y" : "ies"}, ${outcome.stats.termHits} cue(s) needed the enforcement pass, ${outcome.stats.suggestions} suggestion(s), ${outcome.stats.providerNote}). Translated SRT: /subtitles/${filename}.${suggestionsNote}` };
      }

      default:
        return { status: "ERROR", result: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { status: "ERROR", result: `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Resolve an FX argument to raw programs: saved FX preset ->
 * built-in -> inline programs JSON. Null when nothing carries the
 * name (the caller lists the registry in its refusal). Shared by
 * set_shot_fx and the sequence program slots (design_sequence /
 * direct_sequence). */
async function resolveFxSource(projectId: string, fxArg: string): Promise<{ programsRaw: string; sourceName: string } | null> {
  const saved = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "FX", name: fxArg } } });
  if (saved) {
    try {
      const parsedSpec = JSON.parse(saved.spec || "null") as { programs?: unknown } | null;
      if (parsedSpec?.programs) return { programsRaw: JSON.stringify(parsedSpec.programs), sourceName: `preset '${fxArg}'` };
    } catch {
      /* a corrupt preset resolves to nothing - the registry refusal tells the director */
    }
    return null;
  }
  const builtin = findBuiltInFx(fxArg);
  if (builtin) return { programsRaw: JSON.stringify(builtin.programs), sourceName: `built-in '${builtin.name}'` };
  if (fxArg.startsWith("[")) return { programsRaw: fxArg, sourceName: "inline programs" };
  return null;
}

/** Resolve a PHYSICS argument the same way (saved preset -> built-in ->
 * inline). Shared by set_shot_physics and the sequence program slots. */
async function resolvePhysicsSource(projectId: string, physArg: string): Promise<{ programsRaw: string; sourceName: string } | null> {
  const saved = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "PHYSICS", name: physArg } } });
  if (saved) {
    try {
      const parsedSpec = JSON.parse(saved.spec || "null") as { programs?: unknown } | null;
      if (parsedSpec?.programs) return { programsRaw: JSON.stringify(parsedSpec.programs), sourceName: `preset '${physArg}'` };
    } catch {
      /* a corrupt preset resolves to nothing - the registry refusal tells the director */
    }
    return null;
  }
  const builtin = findBuiltInPhysics(physArg);
  if (builtin) return { programsRaw: JSON.stringify(builtin.programs), sourceName: `built-in '${builtin.name}'` };
  if (physArg.startsWith("[")) return { programsRaw: physArg, sourceName: "inline programs" };
  return null;
}

/** Resolve a grammar argument to raw beats: saved GRAMMAR preset ->
 * built-in -> inline beats JSON. Null when nothing carries the name
 * (the caller lists the registry in its refusal). Shared by
 * set_shot_grammar, design_sequence and direct_sequence. */
async function resolveGrammarSource(projectId: string, grammarArg: string): Promise<{ beatsRaw: string; sourceName: string } | null> {
  const saved = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "GRAMMAR", name: grammarArg } } });
  if (saved) {
    try {
      const parsedSpec = JSON.parse(saved.spec || "null") as { beats?: unknown } | null;
      if (parsedSpec?.beats) return { beatsRaw: JSON.stringify(parsedSpec.beats), sourceName: `preset '${grammarArg}'` };
    } catch {
      /* a corrupt preset resolves to nothing - the registry refusal tells the director */
    }
    return null;
  }
  const builtin = findBuiltInGrammar(grammarArg);
  if (builtin) return { beatsRaw: JSON.stringify(builtin.beats), sourceName: `built-in '${builtin.name}'` };
  if (grammarArg.startsWith("[")) return { beatsRaw: grammarArg, sourceName: "inline beats" };
  return null;
}

/** Resolve a NAMED CHOREOGRAPHY source for the sequence slots'
 * chained performances (iteration 78 - the sentence calls the
 * motion): saved CHOREOGRAPHY preset -> built-in -> learned motion
 * flow. Null when nothing carries the name. The flow-aware half
 * mirrors set_shot_choreography's own resolution so a chained LEARNED
 * FLOW stores the same `flow` marker on the shot's choreo column -
 * the applied record grows and the verified evidence rides along.
 * (No inline branch here: a sequence slot carries a NAME, validated
 * at design time - an inline program belongs in
 * set_shot_choreography.) */
async function resolveChoreoSource(projectId: string, choreoArg: string): Promise<{ specRaw: unknown; sourceName: string; flowName?: string; perfName: string } | null> {
  const savedCh = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId, kind: "CHOREOGRAPHY", name: choreoArg } } });
  if (savedCh) {
    try {
      const parsed = JSON.parse(savedCh.spec || "null") as unknown;
      const perfName = (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && typeof (parsed as { name?: unknown }).name === "string" && (parsed as { name: string }).name.trim())
        ? (parsed as { name: string }).name.trim()
        : choreoArg;
      return { specRaw: parsed, sourceName: `preset '${choreoArg}'`, perfName };
    } catch {
      return null; // a corrupt preset resolves to nothing - the refusal names it
    }
  }
  const builtin = BUILT_IN_CHOREO.find((b) => b.name?.toLowerCase() === choreoArg.toLowerCase());
  if (builtin) {
    return { specRaw: builtin, sourceName: `built-in '${builtin.name}'`, perfName: builtin.name! };
  }
  const learnedFlow = await db.motionFlow.findUnique({ where: { projectId_name: { projectId, name: choreoArg } } });
  if (learnedFlow) {
    try {
      const parsed = JSON.parse(learnedFlow.spec || "null") as unknown;
      return { specRaw: parsed, sourceName: `learned flow '${learnedFlow.name}' (${learnedFlow.register.toLowerCase()}, ${learnedFlow.applied} applied / ${learnedFlow.verified} verified, from ${learnedFlow.sourceRef})`, flowName: learnedFlow.name, perfName: learnedFlow.name };
    } catch {
      return null; // a corrupt flow resolves to nothing - the refusal names it
    }
  }
  return null;
}

/** The DESIGN context line (Iteration 51): the self-review standing
 * the director reads before promising any design work. */
function designContextLine(
  project: {
    blenderAssets: Array<{ kind: string; refName: string; status: string; version: number; qualityScore: number | null; motionPreset: string | null; variationPreset: string | null; sculptPreset: string | null }>;
    designPresets: Array<{ kind: string; name: string; usageCount: number }>;
  },
  openIssues: Array<{ refName: string; severity: string; kind: string; note: string }>,
  latestReview: { state: string; overall: number | null; targetRef: string } | null,
): string | null {
  const lib = project.blenderAssets;
  const ready = lib.filter((a) => a.status === "READY");
  const presets = project.designPresets;
  const performing = ready.filter((a) => a.motionPreset).length;
  const motionlessPerf = ready.filter((a) => (a.kind === "PROP" || a.kind === "CREATURE") && !a.motionPreset).length;
  const varied = ready.filter((a) => a.variationPreset).length;
  const sculpted = ready.filter((a) => a.sculptPreset).length;
  const unfinishedSurf = ready.filter((a) => (a.kind === "ENVIRONMENT" || a.kind === "CREATURE") && !a.sculptPreset).length;
  const parts: string[] = [];
  const libLine = lib.length === 0
    ? "library empty (design the cast, sets, props and creatures with blender_asset_build)"
    : `library ${lib.length} assets, ${ready.length} ready, ${performing} performing${motionlessPerf ? `, ${motionlessPerf} MOTIONLESS (props/creatures need design_motion + a rebuild)` : ""}, ${varied} varied${ready.some((a) => a.kind === "ENVIRONMENT" && !a.variationPreset) ? " (environments without design_variation are wallpapers)" : ""}, ${sculpted} sculpted${unfinishedSurf ? `, ${unfinishedSurf} UNFINISHED SURFACE (environments/creatures need design_sculpt + a rebuild)` : ""} (${ready.map((a) => `${a.kind.toLowerCase()} ${a.refName} v${a.version}${a.qualityScore !== null ? ` @${Math.round(a.qualityScore * 100)}%` : ""}${a.motionPreset ? " +loop" : ""}${a.variationPreset ? " +gn" : ""}${a.sculptPreset ? " +sculpt" : ""}`).join(", ")})`;
  parts.push(libLine);
  if (presets.length > 0) {
    parts.push(`presets: ${presets.map((p) => `${p.kind.toLowerCase()} '${p.name}'x${p.usageCount}`).join(", ")}`);
  }
  if (latestReview) {
    parts.push(`latest audit: ${latestReview.targetRef} ${latestReview.state}${latestReview.overall !== null ? ` ${(latestReview.overall * 100).toFixed(0)}%` : ""}`);
  }
  if (openIssues.length > 0) {
    parts.push(`${openIssues.length} OPEN issue(s): ${openIssues.map((i) => `${i.severity} ${i.kind} on ${i.refName} (${i.note.slice(0, 60)})`).join("; ")}`);
  }
  return parts.join(" - ");
}

export async function buildCompactContext(projectId: string) {
  const [project, canon, scheduleHealth, drift, savedTemplates, latestDigestEvent, latestPublishEvent, gateHeldCount, openCommentCount, openComments, openDesignIssues, latestDesignReview, latestRenderReview, learnedRetopoFlows, learnedSculptPlans, learnedSequenceFlows, learnedMotionFlows, unadoptedSequencePrograms] = await Promise.all([
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
      blenderAssets: { orderBy: [{ kind: "asc" as const }, { refName: "asc" as const }] },
      designPresets: { orderBy: { updatedAt: "desc" as const }, take: 12 },
    },
  }),
    canonHealthData(projectId).catch(() => null),
    scheduleHealthData(projectId).catch(() => null),
    identityDriftData(projectId).catch(() => null),
    listPlanTemplates(projectId).catch(() => [] as Awaited<ReturnType<typeof listPlanTemplates>>),
    db.productionEvent.findFirst({ where: { projectId, type: "DIGEST" }, orderBy: { createdAt: "desc" as const } }).catch(() => null),
    db.productionEvent.findFirst({ where: { projectId, type: "PUBLISH" }, orderBy: { createdAt: "desc" as const } }).catch(() => null),
    // The workplace (Iteration 48): renders parked at the human gate +
    // the threads the crew is having about the work.
    db.renderJob.count({ where: { projectId, status: "REVIEW", evaluation: { isNot: null } } }).catch(() => 0),
    db.comment.count({ where: { projectId, resolved: false } }).catch(() => 0),
    db.comment.findMany({ where: { projectId, resolved: false }, orderBy: { createdAt: "desc" as const }, take: 3 }).catch(() => []),
    // The design loop (Iteration 51): the self-review standing.
    db.designIssue.findMany({ where: { projectId, status: { in: ["OPEN", "FIXING"] } }, orderBy: { severity: "asc" as const }, take: 8 }).catch(() => []),
    db.designReview.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" as const } }).catch(() => null),
    // The pixel-review standing (Iteration 59): what the learned layer last judged.
    db.renderReview.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" as const } }).catch(() => null),
    // The learned retopo flows (Iteration 60): the studio's remembered craft.
    listRetopoFlows(projectId).catch(() => []),
    // The learned sculpt plans (Iteration 61): the surface the studio has READ.
    listSculptPlans(projectId).catch(() => []),
    // The learned sequence flows (Iteration 63): the sentences the studio remembers.
    listSequenceFlows(projectId).catch(() => []),
    // The learned motion flows (Iteration 77): the performances the studio remembers.
    db.motionFlow.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" as const } }).catch(() => []),
    // The verified-but-unadopted programs (Iteration 64): the sentences the consult proposes.
    unadoptedVerifiedPrograms(projectId).catch(() => []),
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
    terminology: project.terminology.map((t) => {
      let fixed: string[] = [];
      try {
        const parsed = JSON.parse(t.translations);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          fixed = Object.entries(parsed as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string" && (v as string).trim())
            .slice(0, 4)
            .map(([lang, v]) => `${lang}=${String(v).slice(0, 24)}`);
        }
      } catch {
        fixed = [];
      }
      return `${t.term}${t.category ? ` [${t.category}]` : ""}${fixed.length > 0 ? ` (${fixed.join(", ")})` : ""}`;
    }),
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
    workplace:
      project.approvalGate || openCommentCount > 0
        ? `human gate ${project.approvalGate ? "ARMED (an APPROVED inspection parks the render; only a creator's approve releases it)" : "off"} - ${gateHeldCount} render(s) awaiting creator approval - ${openCommentCount} unresolved thread(s) the crew is having${openComments.length ? `: ${openComments.map((c) => `${c.authorName} on ${c.anchorType} "${c.body.slice(0, 70)}"`).join(" | ")}` : ""}`
        : null,
    design: designContextLine(project, openDesignIssues, latestDesignReview),
    pixel: renderPixelContextLine(latestRenderReview),
    retopoFlows: retopoFlowsContextLine(learnedRetopoFlows),
    sculptPlans: sculptPlansContextLine(learnedSculptPlans),
    sequenceFlows: sequenceFlowsContextLine(learnedSequenceFlows),
    motionFlows: motionFlowsContextLine(learnedMotionFlows.map((f) => ({ name: f.name, register: f.register, poseFrom: f.poseFrom, poseTo: f.poseTo, verified: f.verified, applied: f.applied }))),
    sequenceAdoptions: sequenceAdoptionSuggestionsLine(unadoptedSequencePrograms),
  };
}
