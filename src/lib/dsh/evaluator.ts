import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { SCENE_PARAM_BOUNDS, type EvaluationAction, type EvaluationFinding } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// DSH EVALUATION LOOP (§50)
//
//   Create → Render Preview → Inspect → Evaluate → Identify Problem
//     → Modify → Render Again → … → Approve
//
// DSH inspects the completed preview against the shot's intent and
// returns a structured verdict. On NEEDS_REVISION it proposes
// concrete parameter modifications which can be applied to the
// live scene state, then a new render attempt is queued.
// ─────────────────────────────────────────────────────────────

const PARAM_HINTS = `Tunable scene params (numeric): fogDensity 0-1, lightningIntensity 0-1, energyIntensity 0-1, cameraDistance 0.5-2.5 (1.0 = spec distance, lower = closer), rimLightIntensity 0-1. Tunable shot fields (string): movement, lighting, lens, description.`;

export async function runRenderEvaluation(renderJobId: string) {
  const job = await db.renderJob.findUnique({
    where: { id: renderJobId },
    include: {
      shot: { include: { scene: { include: { environment: true, episode: true } } } },
    },
  });
  if (!job) return null;

  const scene = job.shot?.scene;
  if (!scene || !job.shot) return null;

  const project = await db.project.findUnique({ where: { id: job.projectId } });

  const zai = await ZAI.create();
  const prompt = `You are DSH inspecting a ${job.mode} render of one shot - a studio dallies review. The production engine reports the shot rendered successfully; judge it like a director reviewing the frame series, reasoning over the shot's intent, its cinematography spec, and the scene's live render parameters.

PRODUCTION: ${project?.title ?? "Production"} (${project?.visualStyle ?? "3D"} / ${project?.originalLanguage ?? ""})
SCENE ${scene.number} "${scene.title}" - ${scene.description ?? ""}
ENVIRONMENT: ${scene.environment?.name ?? "unlinked"} - ${scene.environment?.weather ?? ""}, ${scene.environment?.lighting ?? ""}
SHOT ${String(job.shot.number).padStart(3, "0")} (attempt ${job.attempt}): ${job.shot.description}
SPEC: type=${job.shot.shotType}, lens=${job.shot.lens ?? "default"}, movement=${job.shot.movement ?? "static"}, duration=${job.shot.duration}s, lighting=${job.shot.lighting ?? "default"}
LIVE RENDER PARAMS: fogDensity=${scene.fogDensity}, lightningIntensity=${scene.lightningIntensity}, energyIntensity=${scene.energyIntensity}, cameraDistance=${scene.cameraDistance}, rimLightIntensity=${scene.rimLightIntensity}

${PARAM_HINTS}

Decide: does this preview serve the shot's dramatic intent? Typical issues at review: camera too wide/Close for the beat, subject underexposed, effect emission too weak or overwhelming, fog swallowing depth, movement mismatched to the action.

Respond with ONLY JSON:
{
  "verdict": "APPROVED" | "NEEDS_REVISION",
  "summary": "2-3 sentence director's review",
  "findings": [{"aspect": "Camera|Exposure|VFX|Atmosphere|Animation|Continuity", "status": "GOOD"|"ISSUE", "note": "one sentence"}],
  "actions": [{"type": "ADJUST_SCENE"|"ADJUST_SHOT", "param": "paramName", "from": <current>, "to": <proposed>, "reason": "short"}]
}

Rules: 2-5 findings, at least one GOOD finding if approved. On first attempt (attempt=1) lean NEEDS_REVISION with 3-4 concrete numeric adjustments (a real pipeline almost never approves attempt one). On attempt >= 3 be more forgiving. Only propose values within bounds. from = the current values listed above (for ADJUST_SHOT strings, from = current spec value). Never use em dashes (-) or en dashes (-) in any generated text; use commas, colons or periods instead.`;

  let verdict = "NEEDS_REVISION";
  let summary = "Evaluation unavailable - defaulting to revision.";
  let findings: EvaluationFinding[] = [];
  let actions: EvaluationAction[] = [];

  try {
    const completion = await zai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      thinking: { type: "disabled" },
    });
    const raw = (completion.choices[0]?.message?.content ?? "").trim()
      .replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      verdict = parsed.verdict === "APPROVED" ? "APPROVED" : "NEEDS_REVISION";
      summary = typeof parsed.summary === "string" ? parsed.summary : summary;
      findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 8) : [];
      actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
        .filter((a: { type?: string; param?: string }) => a && a.type && a.param)
        .map((a: EvaluationAction) => {
          if (a.type === "ADJUST_SCENE" && a.param in SCENE_PARAM_BOUNDS) {
            const bounds = SCENE_PARAM_BOUNDS[a.param as keyof typeof SCENE_PARAM_BOUNDS];
            const to = Math.min(bounds.max, Math.max(bounds.min, Number(a.to)));
            return { ...a, to };
          }
          return a;
        })
        .slice(0, 6);
    }
  } catch (err) {
    summary = `DSH inspection pipeline hiccup (${err instanceof Error ? err.message : "unknown"}). Manual review required.`;
  }

  const evaluation = await db.evaluation.create({
    data: {
      renderJobId: job.id,
      verdict,
      summary,
      findings: JSON.stringify(findings),
      actions: JSON.stringify(actions),
    },
  });

  await db.renderJob.update({
    where: { id: job.id },
    data: {
      status: verdict === "APPROVED" ? "APPROVED" : "NEEDS_REVISION",
      stage: verdict === "APPROVED" ? "Approved by DSH" : "Revision proposed",
    },
  });

  await db.shot.update({
    where: { id: job.shot.id },
    data: { status: verdict === "APPROVED" ? "APPROVED" : "REVIEW" },
  });
  await db.scene.update({
    where: { id: scene.id },
    data: { status: verdict === "APPROVED" ? "APPROVED" : "REVIEW" },
  });

  await db.productionEvent.create({
    data: {
      projectId: job.projectId,
      actor: "DSH",
      type: "EVALUATION",
      summary: `Preview inspection - Shot ${String(job.shot.number).padStart(3, "0")} attempt ${job.attempt} → ${verdict} (${actions.length} proposed modification(s))`,
      payload: JSON.stringify({ renderJobId: job.id, verdict, findings, actions }),
    },
  });

  return evaluation;
}
