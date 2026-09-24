import { db } from "@/lib/db";
import { createPlan, type PlanStep } from "@/lib/dsh/plans";

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

/**
 * Land a template as a PROPOSED plan (source CREATOR). Refuses a
 * duplicate: the same template on the same episode while a plan with
 * the identical title is still waiting in review or in flight.
 */
export async function instantiateEpisodePlan(
  projectId: string,
  episodeId: string,
  templateId: string,
): Promise<InstantiateResult> {
  if (!(EPISODE_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
    return { ok: false, error: `Unknown template '${templateId}' - pick one of: ${EPISODE_TEMPLATE_IDS.join(", ")}` };
  }
  const episodes = await listTemplateEpisodes(projectId);
  const ep = episodes.find((e) => e.episodeId === episodeId);
  if (!ep) return { ok: false, error: "Episode not found in this production" };

  const template = buildEpisodeTemplates(ep).find((t) => t.id === templateId);
  if (!template) return { ok: false, error: "Template build failed" };

  const title = `E${String(ep.number).padStart(2, "0")} - ${template.name}`;
  const live = await db.dshPlan.findFirst({
    where: { projectId, title, status: { in: ["PROPOSED", "ACTIVE", "PAUSED"] } },
  });
  if (live) {
    return { ok: false, error: `'${title}' is already ${live.status.toLowerCase()} in the plans panel - approve, run or abort it before landing the template again` };
  }

  const result = await createPlan(projectId, {
    title,
    goal: template.summary,
    steps: template.steps,
    source: "CREATOR",
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, planId: result.plan.id, planTitle: result.plan.title };
}
