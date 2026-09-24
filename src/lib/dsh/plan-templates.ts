import { db } from "@/lib/db";
import { createPlan, type PlanStep } from "@/lib/dsh/plans";
import { TOOL_DEFS } from "@/lib/dsh/tools";

// ─────────────────────────────────────────────────────────────
// PER-EPISODE PLAN TEMPLATES
//
// The nightly-breakdown pattern made concrete: a library of ordered
// tool-call plans shaped around ONE episode, instantiated from the
// plans panel (or by DSH) as a PROPOSED DshPlan. The creator keeps
// the review gate - approve, then run by hand or arm a cadence
// schedule (PLAN_RUN) to walk a few steps per night.
//
// Every template resolves its args against the REAL episode row at
// instantiation time (episode/scene/shot numbers), so each step
// executes through the same tool path a live turn uses. Steps that
// follow a create_scene deliberately OMIT the sceneNumber: the tools
// default to the latest scene, which at run time is the one the plan
// just created - no guesswork about auto-incremented numbers.
// ─────────────────────────────────────────────────────────────

export interface EpisodeTemplate {
  id: string;
  name: string;
  summary: string;
  cadenceHint: string; // how this template wants to be scheduled
  steps: PlanStep[]; // PENDING steps with per-step why
}

export interface EpisodeTemplateEpisode {
  episodeId: string;
  seasonNumber: number;
  number: number;
  title: string;
  sceneCount: number;
  shotCount: number;
}

const step = (tool: string, args: Record<string, unknown>, why: string): PlanStep => ({
  tool,
  args,
  why,
  status: "PENDING",
});

/**
 * Build the template library for ONE episode. Numbers are resolved
 * from the DB here (instantiation time), so the landed plan's steps
 * are concrete and reviewable before anything runs.
 */
export function buildEpisodeTemplates(ep: EpisodeTemplateEpisode): EpisodeTemplate[] {
  const n = ep.number;
  const latestScene = Math.max(1, ep.sceneCount);
  return [
    {
      id: "beat-breakdown",
      name: "Episode beat breakdown",
      summary: `Open a new story beat in E${String(n).padStart(2, "0")}: one fresh scene plus a three-shot breakdown (establishing, medium, closeup) with pose programs, then a capability check on what the beat needs.`,
      cadenceHint: "nightly - a few steps per fire until the beat is broken down",
      steps: [
        step("get_production_context", {}, "load the production state so later steps land on real context"),
        step("create_scene", {
          episodeNumber: n,
          title: `${ep.title} - beat: the turn`,
          description: `A new story beat for episode ${n}: the situation shifts and the featured cast must react. Break this scene into shots covering the geography, the confrontation and the reaction.`,
        }, "open the beat's scene in the episode"),
        step("create_shot", {
          description: "Establishing frame: the beat's location, weather and the cast's positions before anything moves. Wide and slow so the geography reads.",
          shotType: "ESTABLISHING",
          movement: "CRANE",
          poseStart: "STANCE",
          poseEnd: "STANCE",
          duration: 5,
        }, "geography shot so the audience knows where the beat happens"),
        step("create_shot", {
          description: "The confrontation: the featured character advances on the beat's opposition, closing distance across the frame.",
          shotType: "MEDIUM",
          movement: "DOLLY_IN",
          poseStart: "WALK",
          poseEnd: "BLOCK",
          duration: 4,
        }, "medium push-in carries the beat's tension"),
        step("create_shot", {
          description: "The reaction: a tight frame on the responder's face and hands as the beat lands - room for dialogue or a held look.",
          shotType: "CLOSEUP",
          movement: "STATIC",
          poseStart: "CAST",
          poseEnd: "POINT",
          duration: 3.5,
        }, "closeup sells the emotional turn"),
        step("check_capabilities", {}, "report what this beat still lacks (environments, props, cast) before art starts"),
      ],
    },
    {
      id: "panel-pass",
      name: "Panel art pass",
      summary: `Generate fact-aware panel art for the first three shots of scene ${latestScene} in E${String(n).padStart(2, "0")}, then run the deterministic art-continuity scan over the result.`,
      cadenceHint: "nightly - a few panels per fire, DSH inspects each",
      steps: [
        step("generate_panel_art", { sceneNumber: latestScene, shotNumber: 1 }, "panel for the scene's opening shot"),
        step("generate_panel_art", { sceneNumber: latestScene, shotNumber: 2 }, "panel for the scene's second shot"),
        step("generate_panel_art", { sceneNumber: latestScene, shotNumber: 3 }, "panel for the scene's third shot"),
        step("check_art_continuity", { sceneNumber: latestScene }, "scan the fresh panels for stale art and missing anchors"),
      ],
    },
    {
      id: "render-pass",
      name: "Preview render pass",
      summary: `Queue PREVIEW renders for the first three shots of scene ${latestScene} in E${String(n).padStart(2, "0")}, then diff the episode's voice direction so stale takes surface before the review pass.`,
      cadenceHint: "nightly - renders queue while the studio sleeps",
      steps: [
        step("render_shot", { sceneNumber: latestScene, shotNumber: 1, mode: "PREVIEW" }, "preview clip for shot 1 - DSH inspects on completion"),
        step("render_shot", { sceneNumber: latestScene, shotNumber: 2, mode: "PREVIEW" }, "preview clip for shot 2"),
        step("render_shot", { sceneNumber: latestScene, shotNumber: 3, mode: "PREVIEW" }, "preview clip for shot 3"),
        step("diff_episode_direction", { episodeNumber: n }, "flag takes whose delivery inputs moved since their last render"),
      ],
    },
    {
      id: "canon-audit",
      name: "Canon + continuity audit",
      summary: `Audit E${String(n).padStart(2, "0")}'s latest panel against the production's active universe facts with a real vision verdict, then run the art-continuity scan and the episode's capability check.`,
      cadenceHint: "nightly watch - keeps the canon honest while panels accumulate",
      steps: [
        step("check_universe_facts", { sceneNumber: latestScene, shotNumber: 1 }, "vision-verdict the scene's hero panel against the active canon"),
        step("check_art_continuity", { sceneNumber: latestScene }, "deterministic scan: stale state/anchor art and missing sheets"),
        step("check_capabilities", { sceneNumber: latestScene }, "what the scene still needs before it can render clean"),
      ],
    },
  ];
}

export const EPISODE_TEMPLATE_IDS = ["beat-breakdown", "panel-pass", "render-pass", "canon-audit"] as const;
export type EpisodeTemplateId = (typeof EPISODE_TEMPLATE_IDS)[number];

/** All episodes of a project with the counts the templates need. */
export async function listTemplateEpisodes(projectId: string): Promise<EpisodeTemplateEpisode[]> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      seasons: {
        orderBy: { number: "asc" },
        include: {
          episodes: {
            orderBy: { number: "asc" },
            include: { scenes: { include: { shots: { select: { id: true } } } } },
          },
        },
      },
    },
  });
  if (!project) return [];
  return project.seasons.flatMap((season) =>
    season.episodes.map((ep) => ({
      episodeId: ep.id,
      seasonNumber: season.number,
      number: ep.number,
      title: ep.title,
      sceneCount: ep.scenes.length,
      shotCount: ep.scenes.reduce((n, sc) => n + sc.shots.length, 0),
    })),
  );
}

export interface EpisodeTemplateCatalog {
  episodes: Array<EpisodeTemplateEpisode & { templates: Array<{ id: string; name: string; summary: string; cadenceHint: string; stepCount: number }> }>;
}

/** Catalog for the plans panel: every episode with its template cards. */
export async function episodeTemplateCatalog(projectId: string): Promise<EpisodeTemplateCatalog> {
  const episodes = await listTemplateEpisodes(projectId);
  return {
    episodes: episodes.map((ep) => ({
      ...ep,
      templates: buildEpisodeTemplates(ep).map((t) => ({
        id: t.id,
        name: t.name,
        summary: t.summary,
        cadenceHint: t.cadenceHint,
        stepCount: t.steps.length,
      })),
    })),
  };
}

export interface InstantiateResult {
  ok: boolean;
  error?: string;
  planTitle?: string;
  planId?: string;
}

// ─────────────────────────────────────────────────────────────
// CREATOR-AUTHORED TEMPLATE VARIATIONS
//
// The four built-ins are code; a variation is a SAVED row the
// creator authors in the plans panel (usually cloned from a
// built-in and reshaped). Steps carry the same shape the built-ins
// land ({tool, args, why}) plus three tokens the creator writes
// into arg values so one variation serves every episode:
//
//   {episode}      -> the episode's real number at landing time
//   {latestScene}  -> the episode's scene count (latest scene)
//   {title}        -> the episode title
//
// Every tool is validated against the live DSH registry at SAVE
// time and again at LANDING time, so a saved template can never
// land a step the studio cannot execute.
// ─────────────────────────────────────────────────────────────

export interface SavedPlanTemplate {
  id: string;
  projectId: string | null; // null = studio-library variation
  scope: "PROJECT" | "STUDIO";
  baseId: string; // built-in it was cloned from, or "custom"
  name: string;
  summary: string;
  cadenceHint: string;
  stepCount: number;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface TemplateStepInput {
  tool: string;
  args: Record<string, unknown>;
  why: string;
}

/** Deep-resolve the {episode}/{latestScene}/{title} tokens in arg values. */
export function resolveTemplateValue(
  value: unknown,
  ctx: { episode: number; latestScene: number; title: string },
): unknown {
  if (typeof value === "string") {
    return value
      .split("{episode}").join(String(ctx.episode))
      .split("{latestScene}").join(String(ctx.latestScene))
      .split("{title}").join(ctx.title);
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplateValue(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTemplateValue(v, ctx);
    return out;
  }
  return value;
}

/** Validate a steps payload against the LIVE DSH tool registry. */
export function validateTemplateSteps(raw: unknown): { ok: true; steps: TemplateStepInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "steps must be a JSON array of {tool, args, why}" };
  if (raw.length === 0) return { ok: false, error: "a template needs at least one step" };
  if (raw.length > 12) return { ok: false, error: "a template is capped at 12 steps (the same cap a plan has)" };
  const known = new Set(TOOL_DEFS.map((t) => t.name));
  const steps: TemplateStepInput[] = [];
  for (const [i, s] of raw.entries()) {
    const step = (s ?? {}) as Record<string, unknown>;
    const tool = String(step.tool ?? "").trim();
    if (!tool) return { ok: false, error: `step ${i + 1}: tool is required` };
    if (!known.has(tool)) return { ok: false, error: `step ${i + 1}: '${tool}' is not a DSH tool - pick from the registry` };
    const args = step.args && typeof step.args === "object" && !Array.isArray(step.args)
      ? (step.args as Record<string, unknown>)
      : {};
    steps.push({ tool, args, why: String(step.why ?? "").trim() });
  }
  return { ok: true, steps };
}

function parseSavedSteps(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function viewSaved(row: {
  id: string; projectId: string | null; baseId: string; name: string; summary: string;
  cadenceHint: string; steps: string; usageCount: number; lastUsedAt: Date | null; createdAt: Date;
}, stepCount: number): SavedPlanTemplate {
  return {
    id: row.id,
    projectId: row.projectId,
    scope: row.projectId == null ? "STUDIO" : "PROJECT",
    baseId: row.baseId,
    name: row.name,
    summary: row.summary,
    cadenceHint: row.cadenceHint,
    stepCount,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Save a creator-authored variation (PROJECT scope by default, STUDIO library on request). */
export async function savePlanTemplate(
  projectId: string | null,
  input: { baseId?: string; name: string; summary: string; cadenceHint?: string; steps: unknown; scope?: string },
): Promise<{ ok: true; template: SavedPlanTemplate } | { ok: false; error: string }> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  const summary = String(input.summary ?? "").trim();
  if (!summary) return { ok: false, error: "summary is required - what does this variation do?" };
  const cadenceHint = String(input.cadenceHint ?? "").trim() || "nightly - a few steps per fire";
  const check = validateTemplateSteps(input.steps);
  if (!check.ok) return { ok: false, error: check.error };
  const scope = String(input.scope ?? "PROJECT").toUpperCase();
  const pid = scope === "STUDIO" ? null : projectId;
  const clash = await db.planTemplate.findFirst({ where: { projectId: pid, name: { equals: name } } });
  if (clash) {
    return { ok: false, error: `a variation named '${name}' already exists in this scope - pick another name` };
  }
  try {
    const row = await db.planTemplate.create({
      data: {
        projectId: pid,
        baseId: String(input.baseId ?? "custom").trim() || "custom",
        name: name.slice(0, 120),
        summary: summary.slice(0, 400),
        cadenceHint: cadenceHint.slice(0, 160),
        steps: JSON.stringify(check.steps),
      },
    });
    return { ok: true, template: viewSaved(row, check.steps.length) };
  } catch {
    return { ok: false, error: "saving the variation failed (name clash?)" };
  }
}

/** Saved variations visible to a production: its own + the studio library. */
export async function listPlanTemplates(projectId: string): Promise<SavedPlanTemplate[]> {
  const rows = await db.planTemplate.findMany({
    where: { OR: [{ projectId }, { projectId: null }] },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => {
    const parsed = parseSavedSteps(r.steps);
    const count = Array.isArray(parsed) ? parsed.length : 0;
    return viewSaved(r, count);
  });
}

export async function deletePlanTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const row = await db.planTemplate.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "template not found" };
  await db.planTemplate.delete({ where: { id } });
  return { ok: true };
}

/** Resolved steps of a built-in for one episode (the authoring dialog's "load base"). */
export function builtInStepsFor(ep: EpisodeTemplateEpisode, templateId: string): PlanStep[] | null {
  if (!(EPISODE_TEMPLATE_IDS as readonly string[]).includes(templateId)) return null;
  const template = buildEpisodeTemplates(ep).find((t) => t.id === templateId);
  return template ? template.steps : null;
}

/**
 * Land a template as a PROPOSED plan (source CREATOR). templateId is
 * a built-in id, OR a saved variation's id / exact name. Refuses a
 * duplicate: the same title while a plan with it is still waiting in
 * review or in flight.
 */
export async function instantiateEpisodePlan(
  projectId: string,
  episodeId: string,
  templateId: string,
): Promise<InstantiateResult> {
  const episodes = await listTemplateEpisodes(projectId);
  const ep = episodes.find((e) => e.episodeId === episodeId);
  if (!ep) return { ok: false, error: "Episode not found in this production" };

  let title: string;
  let goal: string;
  let steps: PlanStep[];
  let savedRowId: string | null = null;

  if ((EPISODE_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
    const template = buildEpisodeTemplates(ep).find((t) => t.id === templateId);
    if (!template) return { ok: false, error: "Template build failed" };
    title = `E${String(ep.number).padStart(2, "0")} - ${template.name}`;
    goal = template.summary;
    steps = template.steps;
  } else {
    const saved = await db.planTemplate.findFirst({
      where: {
        AND: [
          { OR: [{ id: templateId }, { name: { equals: templateId } }] },
          { OR: [{ projectId }, { projectId: null }] },
        ],
      },
    });
    if (!saved) {
      return { ok: false, error: `Unknown template '${templateId}' - pick a built-in (${EPISODE_TEMPLATE_IDS.join(", ")}) or a saved variation (id or exact name, see the plans panel)` };
    }
    const parsed = validateTemplateSteps(parseSavedSteps(saved.steps));
    if (!parsed.ok) {
      return { ok: false, error: `Saved variation '${saved.name}' no longer validates: ${parsed.error}` };
    }
    const ctx = { episode: ep.number, latestScene: Math.max(1, ep.sceneCount), title: ep.title };
    steps = parsed.steps.map((s) => ({
      tool: s.tool,
      args: (resolveTemplateValue(s.args, ctx) ?? {}) as Record<string, unknown>,
      why: s.why,
      status: "PENDING" as const,
    }));
    title = `E${String(ep.number).padStart(2, "0")} - ${saved.name}`;
    goal = saved.summary;
    savedRowId = saved.id;
  }

  const live = await db.dshPlan.findFirst({
    where: { projectId, title, status: { in: ["PROPOSED", "ACTIVE", "PAUSED"] } },
  });
  if (live) {
    return { ok: false, error: `'${title}' is already ${live.status.toLowerCase()} in the plans panel - approve, run or abort it before landing the template again` };
  }

  const result = await createPlan(projectId, {
    title,
    goal,
    steps,
    source: "CREATOR",
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (savedRowId) {
    await db.planTemplate.update({
      where: { id: savedRowId },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    }).catch(() => {});
  }
  return { ok: true, planId: result.plan.id, planTitle: result.plan.title };
}
