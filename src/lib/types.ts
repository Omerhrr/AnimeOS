// Shared types for the AI-Native Animation Production Platform

/** One side of an A/B audition pair: the CURRENT stored take of the line. */
export interface AuditionSide {
  cueId: string;
  url: string; // stored take under /voices/, cache-busted at render time
  mimeType: string;
  durationMs: number | null;
  voiceId: string | null; // TTS voice that performed the stored take
  deliveryId: string | null; // delivery register stamped on the take
  stateLabel: string | null; // state the take performed under (null = plain read)
  origin: "stored take";
}

/** An audition preview attached to a DSH tool result (rendered, playable). */
export interface AuditionPreview {
  url: string; // static WAV under /auditions/, cache-busted
  mimeType: string;
  durationMs: number | null;
  text: string; // the line that was read
  source: "custom" | "character line" | "sample";
  voiceId: string; // the voice that performed (variant or cast)
  deliveryId: string;
  speed: number; // effective pace incl. state hint
  pitch: number; // effective pitch factor (1 = natural)
  stateLabel: string; // the state whose performance was auditioned
  characterName: string;
  current?: AuditionSide | null; // the current stored take of the same line, for A/B (null = nothing to compare)
}

/**
 * An ENSEMBLE audition attached to a DSH tool result: one rendered
 * read per engaged speaker (their first line stamped into the state),
 * so the creator hears the whole beat in one trace. Each row keeps
 * the full single-audition shape, including its A/B current side.
 */
export interface EnsembleAuditionPreview {
  speakers: AuditionPreview[];
  skipped: string[]; // per-speaker render failures ("- Name: reason"), never sinks the apply
}

/**
 * A PLAYABLE ARC attached to a DSH tool result: the arc span(s) the
 * call landed, so the reply itself carries a play chip. The console
 * fetches the span's shots + VOICE cues, collects the STORED takes in
 * story order (buildArcTakes / mergeArcTakes) and plays them - the
 * same playback chain the ruler bars use, now reachable from the
 * DSH reply.
 */
export interface ArcPlaybackChip {
  episodeId: string; // the episode whose shots back the spans
  episodeNumber: number;
  label: string; // "Lin Yue - Battle-damaged" or "ensemble beat: Lin Yue, Ren Wu"
  ensemble: boolean; // true = merge every span into ONE parallel-beat queue
  spans: Array<{ speakerKey: string; state: string; shotIds: string[] }>;
}

export interface TraceAction {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  status: "OK" | "ERROR";
  audition?: AuditionPreview | null; // attached when the call renders an audition preview
  ensembleAudition?: EnsembleAuditionPreview | null; // attached when an ensemble apply renders one read per speaker
  arcPlayback?: ArcPlaybackChip | null; // attached when an arc tool lands a playable span
}

export interface TraceStep {
  step: number;
  thought: string;
  plan: string[];
  actions: TraceAction[];
}

export interface DshTurnResult {
  reply: string;
  trace: TraceStep[];
  /** Set when the turn created/switched to a different production. */
  activeProjectId?: string;
}

export interface EvaluationFinding {
  aspect: string;
  status: "GOOD" | "ISSUE";
  note: string;
}

export interface EvaluationAction {
  type: "ADJUST_SCENE" | "ADJUST_SHOT";
  target: string; // param name
  param: string;
  from: number | string;
  to: number | string;
  reason: string;
}

export interface SceneRenderParams {
  fogDensity: number;
  lightningIntensity: number;
  energyIntensity: number;
  cameraDistance: number;
  rimLightIntensity: number;
}

export interface CapabilityCheck {
  requirement: string;
  category: string;
  present: boolean;
  detail: string;
}

// Scene render param bounds (the evaluation loop tunes within these)
export const SCENE_PARAM_BOUNDS: Record<keyof SceneRenderParams, { min: number; max: number }> = {
  fogDensity: { min: 0, max: 1 },
  lightningIntensity: { min: 0, max: 1 },
  energyIntensity: { min: 0, max: 1 },
  cameraDistance: { min: 0.5, max: 2.5 },
  rimLightIntensity: { min: 0, max: 1 },
};

export const STAGE_LADDER = [
  { at: 0, label: "Validating scene graph" },
  { at: 8, label: "Building geometry" },
  { at: 20, label: "Placing characters & props" },
  { at: 34, label: "Lighting & atmosphere" },
  { at: 48, label: "Simulating cloth & hair" },
  { at: 60, label: "Rendering frames" },
  { at: 86, label: "Compositing passes" },
  { at: 95, label: "Encoding preview" },
] as const;

export function stageFor(progress: number): string {
  let label: string = STAGE_LADDER[0].label;
  for (const s of STAGE_LADDER) if (progress >= s.at) label = s.label;
  return label;
}

export const SHOT_TYPES = [
  "ESTABLISHING", "WIDE", "MEDIUM", "CLOSEUP", "EXTREME_CLOSEUP", "LOW_ANGLE",
] as const;

export const CAMERA_MOVEMENTS = [
  "ORBIT", "DOLLY_IN", "STATIC", "PAN", "TRACKING", "CRANE",
] as const;

export const VISUAL_STYLES = ["DONGHUA", "ANIME", "KOREAN", "WESTERN", "CUSTOM"] as const;
export const FORMATS = ["FEATURE", "SERIES", "SHORT"] as const;
export const ANIMATION_TYPES = ["3D", "2D", "HYBRID"] as const;

export const STYLE_PRESETS: Record<string, { language: string; label: string; vibe: string }> = {
  DONGHUA: { language: "zh-CN", label: "Donghua", vibe: "Cinematic 3D xianxia, cultivation effects, martial-arts choreography" },
  ANIME: { language: "ja-JP", label: "Anime", vibe: "Cel shading, anime timing, stylized effects, 2D/3D hybrid" },
  KOREAN: { language: "ko-KR", label: "Korean / Manhwa-inspired", vibe: "Manhwa framing, sleek line work, dramatic lighting" },
  WESTERN: { language: "en-US", label: "Western Animation", vibe: "Stylized shapes, expressive motion" },
  CUSTOM: { language: "en-US", label: "Custom", vibe: "Creator-defined visual language" },
};

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
