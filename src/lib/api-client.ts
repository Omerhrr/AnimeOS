"use client";

import type { DshTurnResult, EvaluationAction, EvaluationFinding, TraceStep } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Typed fetch layer for the studio frontend
// ─────────────────────────────────────────────────────────────

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// Project universe (mirrors /api/projects/[id] include shape)
export interface StudioProject {
  id: string;
  title: string;
  logline: string | null;
  format: string;
  animationType: string;
  visualStyle: string;
  originalLanguage: string;
  subtitleLanguages: string[];
  fps: number;
  resolution: string;
  artStylePrompt: string | null;
  artPalettePrompt: string | null;
  artNegativePrompt: string | null;
  status: string;
  loras: StyleLoraRow[];
  artists: ArtistRow[];
  seasons: Array<{
    id: string;
    number: number;
    title: string;
    episodes: Array<{
      id: string;
      number: number;
      title: string;
      synopsis: string | null;
      status: string;
      scenes: SceneWithShots[];
    }>;
  }>;
  characters: CharacterFull[];
  environments: EnvironmentRow[];
  assets: AssetRow[];
  terminology: TerminologyRow[];
  continuityEvents: ContinuityRow[];
  productionEvents: EventRow[];
  dshMessages: DshMessageRow[];
  renderJobs: RenderJobRow[];
}

export interface SceneWithShots {
  id: string;
  episodeId: string;
  number: number;
  title: string;
  description: string | null;
  environmentId: string | null;
  environment?: { id: string; name: string; weather: string | null; lighting: string | null } | null;
  timeOfDay: string | null;
  weather: string | null;
  status: string;
  fogDensity: number;
  lightningIntensity: number;
  energyIntensity: number;
  cameraDistance: number;
  rimLightIntensity: number;
  shots: ShotRow[];
}

export interface ShotRow {
  id: string;
  sceneId: string;
  number: number;
  description: string;
  shotType: string;
  lens: string | null;
  movement: string | null;
  poseStart?: string | null;
  poseEnd?: string | null;
  duration: number;
  lighting: string | null;
  status: string;
  artworkUrl?: string | null;
  dialogue?: string | null;
  loraId?: string | null;
  loraStrength?: number | null;
  artistId?: string | null;
  lora?: { id: string; name: string; triggerPhrase: string; weight: number } | null;
  artist?: { id: string; name: string; role: string | null; color: string } | null;
  audioCues?: AudioCueRow[];
}

export interface StyleLoraRow {
  id: string;
  projectId: string;
  name: string;
  triggerPhrase: string;
  weight: number;
  baseModel: string | null;
  notes: string | null;
  // simulated fine-tune runs from approved panels
  status: string; // READY | TRAINING | FAILED
  trainProgress: number;
  trainedPanels: number | null;
  trainedAt: string | null;
  _count?: { shots: number };
}

export interface LoraTrainRunRow {
  id: string;
  loraId: string;
  status: string; // RUNNING | COMPLETED | FAILED
  progress: number;
  step: number;
  totalSteps: number;
  panelCount: number;
  lossCurve: string | null; // JSON number[]
  runLog: string | null; // JSON string[]
  startedAt: string;
  finishedAt: string | null;
}

export interface ArtistRow {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  color: string;
  voiceId: string | null; // TTS voice the artist performs with (per-artist voice casting)
  _count?: { shots: number };
}

export type AudioCueKind = "SFX" | "VOICE" | "BGM" | "AMBIENCE";

export interface AudioCueRow {
  id: string;
  shotId: string;
  kind: AudioCueKind;
  label: string;
  startMs: number;
  durationMs: number;
  volume: number;
  // real TTS voice render (VOICE cues)
  voiceUrl: string | null;
  voiceActor: string | null;
  voiceSpeed: number | null;
  voiceDurationMs: number | null;
  voiceState: string | null;      // delivery profile: NEUTRAL | EXCITED | INJURED
  voiceStateLabel: string | null; // character state the delivery resolved from
  voiceDelivery: string | null;   // standing direction: null = auto per render, else a pinned profile
  voiceNote: string | null;       // directorial note on the delivery
  voiceCast: string | null;       // cast artist name that performed the last take
  voiceSig?: string | null;       // take-input snapshot (JSON) stamped at render time for direction diffs
  acousticReport?: AcousticReport | null; // the acoustic slot's persisted alignment audit (VOICE cues)
  cast?: { artistName: string; voiceId: string | null } | null; // resolved standing cast (VOICE cues)
}

export interface AcousticReport {
  provider: "builtin-dsp" | "neural" | "off";
  retimed: boolean;
  speechRuns: number;
  nuclei: number;
  speechMs: number;
  gapMs: number;
  spanMs: number;
  tokens: number;
  confirmed: number | null;
  missing: number | null;
  matchRatio: number | null;
  transcript: string | null;
  note: string;
  auditedAt: string;
}

export interface VoiceDiffRow {
  cueId: string;
  shotId: string;
  sceneNumber: number;
  shotNumber: number;
  speaker: string;
  text: string;
  status: "fresh" | "stale" | "unrendered" | "blocked";
  changed: string[];
  current: {
    deliveryId: string;
    deliveryLabel: string;
    source: string;
    stateLabel: string | null;
    stateOverride: string | null; // per-line state override the dialogue line forces (null = auto)
    voiceId: string;
    castArtistName: string | null;
    variant: { voiceId: string; stateLabel: string } | null;
    hints: { stateLabel: string; speed: number | null; pitch: number | null } | null;
    baseSpeed: number;
    effectiveSpeed: number;
    pitch: number;
  } | null;
  taken: { voiceId: string; deliveryId: string; baseSpeed: number } | null;
  takeInfo: {
    rendered: boolean;
    voiceActor: string | null;
    voiceState: string | null;
    voiceCast: string | null;
  };
}

export interface VoiceDiffEpisode {
  episodeId: string;
  number: number;
  title: string;
  total: number;
  fresh: number;
  stale: number;
  unrendered: number;
  cues: VoiceDiffRow[];
}

export interface AuditionCurrentSide {
  cueId: string;
  url: string; // stored take under /voices/
  mimeType: string;
  durationMs: number | null;
  voiceId: string | null;
  deliveryId: string | null;
  stateLabel: string | null;
  origin: "stored take";
}

export interface AuditionResult {
  audio: string; // base64 WAV
  mimeType: string;
  durationMs: number | null;
  text: string;
  spoken: string;
  source: "custom" | "character line" | "sample";
  delivery: { id: string; label: string; speed: number };
  pitch: number; // effective pitch factor the audition was bent by (1 = natural)
  voiceId: string;
  speaker: string | null;
  variant: {
    stateId: string;
    stateLabel: string;
    episodeNumber: number | null;
    variantVoiceId: string | null;
    speedHint: number | null;
    pitchHint: number | null;
  } | null;
  current: AuditionCurrentSide | null; // the current stored take of the same line, for A/B (null = nothing to compare)
  historyUrl?: string; // set when the audition was a STATE audition: the wav landed in the state's history
}

/** One recorded read of a development state (audition history). */
export interface StateAuditionRow {
  id: string;
  stateId: string;
  characterId: string;
  projectId: string;
  url: string; // wav under /auditions/, unique per render
  text: string;
  source: "custom" | "character line" | "sample" | string;
  voiceId: string;
  deliveryId: string;
  speed: number;
  pitch: number;
  durationMs: number | null;
  createdAt: string;
}

export interface StateAuditionsResponse {
  state: {
    id: string;
    label: string;
    episodeNumber: number | null;
    voiceVariant: string | null;
    speedHint: number | null;
    pitchHint: number | null;
  };
  auditions: StateAuditionRow[];
}

/** The arc playback feed one episode serves (shots + VOICE cues in story order). */
export interface ArcPlaybackFeed {
  episode: { id: string; number: number; title: string };
  shots: Array<{
    id: string;
    sceneNumber: number;
    number: number;
    dialogue: string | null;
    audioCues: Array<{
      kind: string;
      label: string;
      voiceUrl: string | null;
      voiceDurationMs: number | null;
      voiceActor: string | null;
      voiceStateLabel: string | null;
    }>;
  }>;
}

export interface BridgeStatusInfo {
  mode: "LIVE_BLENDER" | "MOTION" | "SIMULATOR";
  source: "env" | "resident" | "local" | null;
  host: string | null;
  reachable: boolean;
  blenderVersion: string | null;
  scene: string | null;
  busy: boolean;
  detail: string;
  envHint: string | null;
  img2vid?: { available: boolean; host: string | null; provider?: "host" | "zai" | null };
}

export interface BlenderRuntimeStatus {
  binary: string | null;
  version: string | null;
  versionTag: string;
  provisioning: boolean;
  provisionLog: string | null;
  resident: {
    running: boolean;
    healthy: boolean;
    port: number;
    pid: number | null;
    startedAt: string | null;
    uptimeMs: number;
    restarts: number;
    lastError: string | null;
  };
}

export interface BlenderAssetRow {
  id: string;
  kind: "CHARACTER" | "ENVIRONMENT";
  refName: string;
  status: string;
  version: number;
  previewPath: string | null;
  blendPath: string | null;
  identityScore: number | null;
  inspectNote: string | null;
  inspectedAt: string | null;
  updatedAt: string;
}

export interface BlenderAssetLibraryInfo {
  total: number;
  ready: number;
  building: number;
  failed: number;
  avgIdentity: number | null;
  assets: BlenderAssetRow[];
}

export interface CharacterFull {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  age: string | null;
  personality: string | null;
  backstory: string | null;
  appearance: string | null;
  wardrobe: string | null;
  abilities: string | null;
  animationLib: string | null;
  canonicalState: string | null;
  modelSheetUrl: string | null;
  modelSheetPrompt: string | null;
  parentId: string | null;
  derivativeType: string | null;
  cloneVoiceId: string | null;
  cloneTrainedAt: string | null;
  states: Array<{
    id: string;
    label: string;
    episodeNumber: number | null;
    stateType: string;
    cultivation: string | null;
    weapon: string | null;
    clothing: string | null;
    abilities: string | null;
    voiceVariant?: string | null; // state voice variant: TTS voice while this state is episode-effective
    speedHint?: number | null; // state speed hint: multiplier on the take's base speed while effective
    pitchHint?: number | null; // state pitch hint: playback pitch factor while effective (1 = natural)
    poseStart?: string | null; // state pose preset: the pose the character starts from while this state performs
    poseEnd?: string | null; // state pose preset: the pose the performance moves into
  }>;
  relationsFrom: Array<{ id: string; type: string; to: { id: string; name: string } }>;
  relationsTo: Array<{ id: string; type: string; from: { id: string; name: string } }>;
  derivatives: Array<{ id: string; name: string; derivativeType: string | null }>;
  voiceArtist?: { id: string; name: string; voiceId: string | null } | null;
}

export interface EnvironmentRow {
  id: string;
  name: string;
  description: string | null;
  timeOfDay: string | null;
  weather: string | null;
  atmosphere: string | null;
  lighting: string | null;
}

export interface AssetRow {
  id: string;
  category: string;
  name: string;
  description: string | null;
  status: string;
  currentVersion: number;
  versions: Array<{ id: string; version: number; note: string | null }>;
}

export interface TerminologyRow {
  id: string;
  term: string;
  category: string | null;
  translations: string; // JSON
}

export interface ContinuityRow {
  id: string;
  entityType: string;
  entityName: string;
  kind: string;
  episodeNumber: number | null;
  description: string;
  severity: string;
}

export interface EventRow {
  id: string;
  actor: string;
  type: string;
  summary: string;
  createdAt: string;
}

export interface DshMessageRow {
  id: string;
  role: string;
  content: string;
  trace: string | null;
  createdAt: string;
}

// user-defined arc template saved per production (reusable beat shape)
export interface ArcTemplateVersionEntry {
  version: number; // the version this entry REPLACED
  segments: Array<{ frac: number; kind: "auto" | "state" }>;
  note: string; // migration note (auto or creator-written)
  at: string; // ISO timestamp of the update
}

export interface ArcTemplateRow {
  id: string;
  name: string;
  description: string | null;
  segments: Array<{ frac: number; kind: "auto" | "state" }>;
  scope: "PROJECT" | "STUDIO";
  projectId: string | null;
  version: number; // current shape version (1 = as saved)
  versions: ArcTemplateVersionEntry[]; // replaced shapes, newest-first
  // per-scope usage: applies that actually stamped lines (DSH applies
  // + dialog applies), one count per batch for ensembles
  usageCount: number;
  lastUsedAt: string | null;
}

export interface RenderJobRow {
  id: string;
  shotId: string | null;
  mode: string;
  status: string;
  progress: number;
  stage: string;
  attempt: number;
  driver: string;
  // per-provider latency/cost telemetry recorded at completion
  // (JSON {spans, takeovers, totalMs, credits} - parse with parseTelemetry)
  telemetry: string | null;
  // finished animated clip (mp4 under /renders/) for MOTION and
  // Blender drivers; null for still-frame fallbacks
  outputUrl: string | null;
  createdAt: string;
  shot?: (ShotRow & { scene?: { id: string; number: number; title: string } }) | null;
  evaluation: {
    id: string;
    verdict: string;
    summary: string;
    findings: string; // JSON EvaluationFinding[]
    actions: string; // JSON EvaluationAction[]
    applied: boolean;
  } | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  logline: string | null;
  format: string;
  animationType: string;
  visualStyle: string;
  originalLanguage: string;
  subtitleLanguages: string[];
  fps: number;
  resolution: string;
  status: string;
  episodeCount: number;
  characterCount: number;
  renderCount: number;
}

export interface EpisodeCutResult {
  url: string;
  file: string;
  manifestFile: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  shotCount: number;
  cueCount: number;
  renderedNow: number;
  warnings: string[];
  audioKinds: Record<string, number>;
}

export interface CharacterDesignDnaView {
  name: string;
  hairColor: string;
  hairStyle: string;
  robeColor: string;
  robeAccent: string;
  skinTone: string;
  weaponType: string;
  bladeColor: string;
  build: string;
}

export interface EnvironmentDesignDnaView {
  name: string;
  terrain: string;
  timeOfDay: string;
  weather: string;
  skyColor: string;
  fogColor: string;
  groundColor: string;
  keyLight: string;
  features: string[];
}

export interface SceneAnalysis {
  scene: SceneWithShots;
  continuity: Array<{ entityName: string; kind: string; eventEpisode: number | null; description: string; severity: string; resolutions: string[] }>;
  capabilities: Array<{ requirement: string; category: string; present: boolean; detail: string }>;
  design?: { cast: CharacterDesignDnaView[]; environment: EnvironmentDesignDnaView | null };
}

export const api = {
  // queries
  projects: () => j<ProjectSummary[]>("/api/projects"),
  project: (id: string) => j<StudioProject>(`/api/projects/${id}`),
  sceneAnalysis: (id: string) => j<SceneAnalysis>(`/api/scenes?id=${id}`),
  renderJobs: (projectId: string) => j<RenderJobRow[]>(`/api/render-jobs?projectId=${projectId}`),
  dshMessages: (projectId: string) => j<DshMessageRow[]>(`/api/dsh?projectId=${projectId}`),
  bridgeStatus: () => j<BridgeStatusInfo>("/api/bridge"),
  blenderRuntime: () => j<BlenderRuntimeStatus>("/api/blender-runtime"),
  blenderAssets: (projectId: string) => j<BlenderAssetLibraryInfo>(`/api/blender-assets?projectId=${projectId}`),
  blenderAssetAction: (body: { action: "build" | "inspect" | "preview"; projectId: string; kind?: string; refName?: string }) =>
    j<Record<string, unknown>>("/api/blender-assets", { method: "POST", body: JSON.stringify(body) }),

  // commands
  createProject: (body: Record<string, unknown>) => j<{ id: string }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: Record<string, unknown>) => j<{ id: string }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  createEpisode: (body: Record<string, unknown>) => j<{ id: string }>("/api/episodes", { method: "POST", body: JSON.stringify(body) }),
  createScene: (body: Record<string, unknown>) => j<{ id: string }>("/api/scenes", { method: "POST", body: JSON.stringify(body) }),
  createShot: (body: Record<string, unknown>) => j<{ id: string }>("/api/shots", { method: "POST", body: JSON.stringify(body) }),
  patchShot: (body: Record<string, unknown>) => j<{ id: string; updated?: number }>("/api/shots", { method: "PATCH", body: JSON.stringify(body) }),
  generatePanelArt: (shotId: string, format: string) =>
    j<{ artworkUrl: string; prompt: string }>("/api/panel-art", { method: "POST", body: JSON.stringify({ shotId, format }) }),
  generateCharacterSheet: (characterId: string) =>
    j<{ modelSheetUrl: string; prompt: string; anchor: string }>("/api/character-sheet", { method: "POST", body: JSON.stringify({ characterId }) }),
  createCharacter: (body: Record<string, unknown>) => j<{ id: string }>("/api/characters", { method: "POST", body: JSON.stringify(body) }),
  patchCharacter: (id: string, body: Record<string, unknown>) => j<{ id: string }>("/api/characters", { method: "PATCH", body: JSON.stringify({ id, ...body }) }),
  // state voice performance (variant voice + speed/pitch hints) and
  // the state's POSE PRESET (start/end pair; auto applies the library
  // preset resolved from the label; empty strings clear)
  patchCharacterState: (id: string, patch: { voiceVariant?: string; speedHint?: number | null; pitchHint?: number | null; poseStart?: string; poseEnd?: string; auto?: boolean }) =>
    j<{ id: string; voiceVariant: string | null; speedHint: number | null; pitchHint: number | null; poseStart?: string | null; poseEnd?: string | null }>("/api/character-states", { method: "PATCH", body: JSON.stringify({ id, ...patch }) }),
  createEnvironment: (body: Record<string, unknown>) => j<{ id: string }>("/api/environments", { method: "POST", body: JSON.stringify(body) }),

  // style LoRA registry
  loras: (projectId: string) => j<StyleLoraRow[]>(`/api/loras?projectId=${projectId}`),
  createLora: (body: Record<string, unknown>) => j<{ id: string }>("/api/loras", { method: "POST", body: JSON.stringify(body) }),
  patchLora: (id: string, body: Record<string, unknown>) => j<{ id: string }>(`/api/loras/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLora: (id: string) => j<{ ok: boolean }>(`/api/loras/${id}`, { method: "DELETE" }),

  // artist roster
  artists: (projectId: string) => j<ArtistRow[]>(`/api/artists?projectId=${projectId}`),
  createArtist: (body: Record<string, unknown>) => j<{ id: string }>("/api/artists", { method: "POST", body: JSON.stringify(body) }),
  patchArtist: (id: string, body: Record<string, unknown>) => j<{ id: string }>(`/api/artists/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteArtist: (id: string) => j<{ ok: boolean }>(`/api/artists/${id}`, { method: "DELETE" }),

  // user-defined arc templates saved per production (reusable beat shapes
  // next to the built-ins: possession spread, full takeover, recovery arc)
  listArcTemplates: (projectId: string) => j<ArcTemplateRow[]>(`/api/arc-templates?projectId=${projectId}`),
  createArcTemplate: (body: { projectId: string; name: string; description?: string; scope?: "PROJECT" | "STUDIO"; segments: Array<{ frac: number; kind: "auto" | "state" }> }) =>
    j<{ id: string }>("/api/arc-templates", { method: "POST", body: JSON.stringify(body) }),
  patchArcTemplate: (id: string, body: { name?: string; description?: string | null; scope?: "PROJECT" | "STUDIO"; projectId?: string; segments?: Array<{ frac: number; kind: "auto" | "state" }>; note?: string }) =>
    j<{ id: string; version: number; bumped: boolean }>(`/api/arc-templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteArcTemplate: (id: string) => j<{ ok: boolean }>(`/api/arc-templates/${id}`, { method: "DELETE" }),
  // record one line-stamping application of a saved template (dialog apply path)
  useArcTemplate: (id: string) =>
    j<{ id: string; usageCount: number; lastUsedAt: string | null }>(`/api/arc-templates/${id}/use`, { method: "POST" }),

  // episode cut export: animated clips + stems muxed into one mp4
  exportCut: (episodeId: string, mode: "PREVIEW" | "FINAL" = "PREVIEW") =>
    j<EpisodeCutResult>(`/api/episodes/${episodeId}/cut`, { method: "POST", body: JSON.stringify({ mode }) }),

  // platform publishing: per-platform packages staged on the delivery spine
  publishInfo: (projectId: string) =>
    j<{ presets: Array<{ id: string; label: string; blurb: string; orientation: string; width: number; height: number; maxDurationSec: number; titleMaxChars: number; subtitleFormat: string; notes: string[]; envKeys: string[] }>; recent: Array<{ id: string; platform: string; platformLabel: string; ready: boolean; checksPassed: number; checksTotal: number; title: string; url: string; file: string; subtitleCues: number; subtitleFormat: string; packageDir: string | null; createdAt: string }> }>(`/api/publish?projectId=${projectId}`),
  uploadPackage: (eventId: string) =>
    j<{ kind: string; platform: string; ok: boolean; detail: string; at: string }>("/api/publish", {
      method: "POST", body: JSON.stringify({ action: "upload", eventId }),
    }),
  stagePublish: (episodeId: string, platform: string) =>
    j<{ platform: string; platformLabel: string; title: string; description: string; tags: string[]; ready: boolean; subtitle: { format: string; filename: string | null; cues: number; note: string }; conformance: Array<{ label: string; ok: boolean; detail: string }>; checklist: string[]; integration: { configured: boolean; detail: string; envKeys: string[] }; package: { dir: string; files: string[] } | null; cut: { url: string; file: string; durationMs: number; width: number; height: number; fps: number; bytes: number } }>("/api/publish", {
      method: "POST", body: JSON.stringify({ episodeId, platform }),
    }),

  // reworded-fact re-audit helper: re-check the panels that audited the old wording
  reauditFact: (projectId: string, factId: string, oldText: string) =>
    j<{ factId: string; oldText: string; newText: string; targets: number; audited: number; held: number; broken: number; summary: string; results: Array<{ shotId: string; ref: string; ok: boolean; error?: string; holds?: number; broken?: number; note?: string }> }>("/api/canon-health", {
      method: "POST", body: JSON.stringify({ projectId, action: "reaudit", factId, oldText }),
    }),

  // voice-clone slot: train the character's voice from their rendered takes
  trainVoiceClone: (characterId: string) =>
    j<{ characterId: string; characterName: string; voiceId: string; takes: number; totalMs: number; trainedAt: string }>("/api/voice-clone", {
      method: "POST", body: JSON.stringify({ characterId }),
    }),

  // sound-design cues
  audioCues: (shotId: string) => j<AudioCueRow[]>(`/api/audio-cues?shotId=${shotId}`),
  createAudioCue: (body: Record<string, unknown>) => j<AudioCueRow>("/api/audio-cues", { method: "POST", body: JSON.stringify(body) }),
  patchAudioCue: (id: string, body: Record<string, unknown>) => j<AudioCueRow>(`/api/audio-cues/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  auditAcoustics: (id: string) => j<AcousticReport>(`/api/audio-cues/${id}`, { method: "POST" }),
  deleteAudioCue: (id: string) => j<{ ok: boolean }>(`/api/audio-cues/${id}`, { method: "DELETE" }),

  // real TTS voice renders for VOICE cues (per character-state delivery,
  // per-artist voice casting: omit voice to let the server cast from the roster)
  renderVoice: (cueId: string, voice?: string, speed?: number, delivery?: string) =>
    j<{
      cue: AudioCueRow;
      bytes: number;
      text: string;
      delivery: { id: string; label: string; source: "auto" | "manual" | "direction" | "line"; stateLabel: string | null; speed: number };
      cast: { artistName: string | null; voiceId: string; source: "cast" | "auto" | "manual" };
      direction: { note: string | null; standingDelivery: string | null; lineDelivery: string | null };
    }>("/api/voice-renders", {
      method: "POST", body: JSON.stringify({ cueId, voice, speed, delivery }),
    }),

  // per-episode voice direction diff: what a take would render as today
  // vs the snapshot it was made with; POST re-renders only stale takes
  voiceDiff: (episodeId: string) =>
    j<{ episodes: VoiceDiffEpisode[] }>(`/api/voice-diffs?episodeId=${episodeId}`),
  voiceDiffAll: (projectId: string) =>
    j<{ episodes: VoiceDiffEpisode[] }>(`/api/voice-diffs?projectId=${projectId}`),
  reRenderStaleVoices: (episodeId: string) =>
    j<{
      reRendered: Array<{ cueId: string; speaker: string; deliveryId: string; changed: string[] }>;
      failed: Array<{ cueId: string; error: string }>;
      staleCount: number;
      remaining: number;
      summary: string;
    }>("/api/voice-diffs", { method: "POST", body: JSON.stringify({ episodeId }) }),
  reRenderStaleVoicesAll: (projectId: string) =>
    j<{
      episodes: Array<{ episodeId: string; number: number; title: string; staleCount: number; reRendered: number; failed: number }>;
      reRenderedCount: number;
      failedCount: number;
      remaining: number;
      summary: string;
    }>("/api/voice-diffs", { method: "POST", body: JSON.stringify({ projectId }) }),

  // casting-board audition: throwaway TTS render of one line with a voice,
  // optionally the character's own first line, or a state audition
  // (variant voice + speed/pitch hints); a STATE audition is recorded
  // into the state's audition history, plain voice auditions stay
  // throwaway
  auditionVoice: (body: { projectId: string; voiceId?: string; delivery?: string; text?: string; speaker?: string; stateId?: string }) =>
    j<AuditionResult>("/api/voice-auditions", { method: "POST", body: JSON.stringify(body) }),

  // multi-speaker ensemble audition: ONE call renders every speaker
  // (per-speaker state or cast voice, shared board line + register);
  // each row carries the full single-audition shape so the board can
  // lay out A/B rows per speaker and play the ensemble in sequence.
  // Unresolvable entries come back in `skipped` instead of failing.
  auditionEnsemble: (body: { projectId: string; delivery?: string; text?: string; ensemble: Array<{ speaker?: string; stateId?: string }> }) =>
    j<{ ensemble: true; rows: AuditionResult[]; skipped: Array<{ entry: string; reason: string }> }>("/api/voice-auditions", { method: "POST", body: JSON.stringify(body) }),

  // per-state audition history: past auditioned reads of one
  // development state (newest first, capped), for replay + compare
  stateAuditions: (stateId: string) =>
    j<StateAuditionsResponse>(`/api/state-auditions?stateId=${stateId}`),
  deleteStateAudition: (id: string) =>
    j<{ ok: boolean }>(`/api/state-auditions?id=${id}`, { method: "DELETE" }),

  // arc playback feed: one episode's shots + VOICE cues in story
  // order, so a DSH reply's playable arc chip can collect the arc's
  // stored takes with the same chain the ruler bars use
  arcPlayback: (episodeId: string) =>
    j<ArcPlaybackFeed>(`/api/episodes/${episodeId}/arc-playback`),

  // simulated LoRA training runs from approved panels
  trainLora: (loraId: string) =>
    j<{ runId: string; totalSteps: number; panelCount: number }>("/api/lora-train", { method: "POST", body: JSON.stringify({ loraId }) }),
  trainAllLoras: (projectId: string) =>
    j<{
      started: Array<{ loraId: string; name: string; runId: string; totalSteps: number; panelCount: number }>;
      skipped: Array<{ loraId: string; name: string; reason: string }>;
    }>("/api/lora-train", { method: "POST", body: JSON.stringify({ projectId, batch: true }) }),
  loraRuns: (projectId: string) => j<LoraTrainRunRow[]>(`/api/lora-train?projectId=${projectId}`),
  createAsset: (body: Record<string, unknown>) => j<{ id: string }>("/api/assets", { method: "POST", body: JSON.stringify(body) }),
  addContinuityEvent: (body: Record<string, unknown>) => j<{ id: string }>("/api/continuity", { method: "POST", body: JSON.stringify(body) }),
  addTerminology: (body: Record<string, unknown>) => j<{ id: string }>("/api/terminology", { method: "POST", body: JSON.stringify(body) }),
  patchScene: (body: Record<string, unknown>) => j<{ id: string }>("/api/scenes", { method: "PATCH", body: JSON.stringify(body) }),

  renderCreate: (shotId: string, mode: "PREVIEW" | "FINAL") =>
    j<{ id: string }>("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "create", shotId, mode }) }),
  renderBatch: (episodeIds: string[], mode: "PREVIEW" | "FINAL") =>
    j<{ created: number; skipped: number; episodes: number }>("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "batch", episodeIds, mode }) }),
  renderApply: (evaluationId: string) =>
    j<{ ok: boolean }>("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "apply", evaluationId }) }),
  renderRetry: (jobId: string) =>
    j<{ id: string }>("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "retry", jobId }) }),
  renderApprove: (jobId: string) =>
    j<{ ok: boolean }>("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "approve", jobId }) }),
  dshTurn: (projectId: string, message: string) =>
    j<DshTurnResult>("/api/dsh", { method: "POST", body: JSON.stringify({ projectId, message }) }),
  fetchTerminology: (projectId: string) =>
    j<Array<{ id: string; term: string; category: string | null; translations: string }>>(`/api/terminology?projectId=${projectId}`),
};

export function parseFindings(raw: string | null | undefined): EvaluationFinding[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function parseActions(raw: string | null | undefined): EvaluationAction[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function parseTrace(raw: string | null | undefined): TraceStep[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
