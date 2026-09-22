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
  status: string;
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
  duration: number;
  lighting: string | null;
  status: string;
  artworkUrl?: string | null;
  dialogue?: string | null;
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
  parentId: string | null;
  derivativeType: string | null;
  states: Array<{
    id: string;
    label: string;
    episodeNumber: number | null;
    stateType: string;
    cultivation: string | null;
    weapon: string | null;
    clothing: string | null;
    abilities: string | null;
  }>;
  relationsFrom: Array<{ id: string; type: string; to: { id: string; name: string } }>;
  relationsTo: Array<{ id: string; type: string; from: { id: string; name: string } }>;
  derivatives: Array<{ id: string; name: string; derivativeType: string | null }>;
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

export interface RenderJobRow {
  id: string;
  shotId: string | null;
  mode: string;
  status: string;
  progress: number;
  stage: string;
  attempt: number;
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

export interface SceneAnalysis {
  scene: SceneWithShots;
  continuity: Array<{ entityName: string; kind: string; eventEpisode: number | null; description: string; severity: string; resolutions: string[] }>;
  capabilities: Array<{ requirement: string; category: string; present: boolean; detail: string }>;
}

export const api = {
  // queries
  projects: () => j<ProjectSummary[]>("/api/projects"),
  project: (id: string) => j<StudioProject>(`/api/projects/${id}`),
  sceneAnalysis: (id: string) => j<SceneAnalysis>(`/api/scenes?id=${id}`),
  renderJobs: (projectId: string) => j<RenderJobRow[]>(`/api/render-jobs?projectId=${projectId}`),
  dshMessages: (projectId: string) => j<DshMessageRow[]>(`/api/dsh?projectId=${projectId}`),

  // commands
  createProject: (body: Record<string, unknown>) => j<{ id: string }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  createEpisode: (body: Record<string, unknown>) => j<{ id: string }>("/api/episodes", { method: "POST", body: JSON.stringify(body) }),
  createScene: (body: Record<string, unknown>) => j<{ id: string }>("/api/scenes", { method: "POST", body: JSON.stringify(body) }),
  createShot: (body: Record<string, unknown>) => j<{ id: string }>("/api/shots", { method: "POST", body: JSON.stringify(body) }),
  patchShot: (body: Record<string, unknown>) => j<{ id: string }>("/api/shots", { method: "PATCH", body: JSON.stringify(body) }),
  generatePanelArt: (shotId: string, format: string) =>
    j<{ artworkUrl: string; prompt: string }>("/api/panel-art", { method: "POST", body: JSON.stringify({ shotId, format }) }),
  createCharacter: (body: Record<string, unknown>) => j<{ id: string }>("/api/characters", { method: "POST", body: JSON.stringify(body) }),
  createEnvironment: (body: Record<string, unknown>) => j<{ id: string }>("/api/environments", { method: "POST", body: JSON.stringify(body) }),
  createAsset: (body: Record<string, unknown>) => j<{ id: string }>("/api/assets", { method: "POST", body: JSON.stringify(body) }),
  addContinuityEvent: (body: Record<string, unknown>) => j<{ id: string }>("/api/continuity", { method: "POST", body: JSON.stringify(body) }),
  addTerminology: (body: Record<string, unknown>) => j<{ id: string }>("/api/terminology", { method: "POST", body: JSON.stringify(body) }),
  patchScene: (body: Record<string, unknown>) => j<{ id: string }>("/api/scenes", { method: "PATCH", body: JSON.stringify(body) }),

  renderCreate: (shotId: string, mode: "PREVIEW" | "FINAL") =>
    j<{ id: string }>("/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "create", shotId, mode }) }),
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
