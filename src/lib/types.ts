// Shared types for the AI-Native Animation Production Platform

export interface TraceAction {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  status: "OK" | "ERROR";
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
