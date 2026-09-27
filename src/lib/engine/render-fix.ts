import { db } from "@/lib/db";
import { SCENE_PARAM_BOUNDS } from "@/lib/types";
import { createRenderJob } from "@/lib/engine/render";
import { ensureRenderReview } from "@/lib/engine/render-review";

// ─────────────────────────────────────────────────────────────
// THE FIX RETURNS TO THE PIXELS (iteration 60 - the render-fix
// loop)
//
// A pixel review that names issues and changes nothing is
// decoration. This pass reads a finished render's OPEN review
// issues and applies the REAL parameter fix each kind calls for
// (the same law design_fix obeys on the asset side: each issue
// kind maps to a real operation, and the re-judgement is the
// judge):
//   EXPOSURE (dark)    -> lift the energy and rim lights
//   EXPOSURE (blown)   -> pull the energy down
//   CONTRAST           -> cut the fog that flattens the spread,
//                         lift the rim for separation
//   STAGE (near-black) -> raise the rim, lift the energy
//   READABILITY        -> clear the air, move the camera in
//   COMPOSITION        -> reframe (the note decides which way)
//   PALETTE            -> nudge the energy mix (palette itself is
//                         graded in the materials - said honestly)
//   INTENT             -> REFUSES parameters: intent lives in the
//                         direction; adjust the beats and re-render
// Deltas are merged per parameter, clamped to the scene bounds,
// and a no-op (already at the bound) is dropped - never reported
// as if it moved.
// The fix queues a NEW attempt (fixOfJobId names the lineage) and
// marks the targeted issues FIXING. When the fresh attempt's
// pixel review lands (render-review.reconcileRenderFixes), it is
// THE JUDGE: an issue is FIXED only when the new pixels stop
// raising its kind; a kind still raised goes back to OPEN with
// the honest note. The loop closes through new attempts and
// fresh reviews - never through intention.
// ─────────────────────────────────────────────────────────────

export interface RenderFixOp {
  param: string;
  from: number;
  to: number;
  reason: string;
}

export interface RenderFixWontfix {
  kind: string;
  note: string;
}

export interface RenderFixResult {
  ok: boolean;
  error?: string;
  jobId: string;
  targetRef: string;
  attempted: number;
  applied: RenderFixOp[];
  wontfix: RenderFixWontfix[];
  opsChain: string;
  newJobId: string | null;
  newAttempt: number | null;
}

interface SceneParams {
  fogDensity: number;
  lightningIntensity: number;
  energyIntensity: number;
  cameraDistance: number;
  rimLightIntensity: number;
}

/** The number the local judge cited, when the note carries one
 * ("mean luminance 0.07", "luminance spread 0.021") - the fix
 * cites it back. */
function citedNumber(note: string, marker: string): string {
  const idx = note.indexOf(marker);
  if (idx === -1) return "";
  const tail = note.slice(idx + marker.length).match(/[0-9.]+/);
  return tail ? ` ${tail[0]}` : "";
}

/**
 * The pure kind-to-op planner (deterministic, unit-testable):
 * merge every open issue's deltas per parameter, clamp once to
 * the scene bounds, drop no-ops. INTENT never maps to a
 * parameter - it comes back as an honest refusal.
 */
export function planRenderFixes(
  issues: Array<{ severity: string; kind: string; note: string }>,
  scene: SceneParams,
): { applied: RenderFixOp[]; wontfix: RenderFixWontfix[] } {
  const deltas = new Map<string, { delta: number; reasons: string[] }>();
  const wontfix: RenderFixWontfix[] = [];
  const add = (param: string, delta: number, reason: string) => {
    const cur = deltas.get(param) ?? { delta: 0, reasons: [] };
    cur.delta += delta;
    cur.reasons.push(reason);
    deltas.set(param, cur);
  };

  for (const issue of issues) {
    const note = issue.note ?? "";
    const cited = (marker: string) => citedNumber(note, marker);
    switch (issue.kind) {
      case "EXPOSURE": {
        if (note.includes("blown") || note.includes("clips to white")) {
          add("energyIntensity", -0.15, `blown exposure${cited("mean luminance")} - pulling the energy down`);
        } else {
          add("energyIntensity", 0.18, `dark exposure${cited("mean luminance")} - lifting the energy`);
          add("rimLightIntensity", 0.12, `dark exposure${cited("mean luminance")} - lifting the rim`);
        }
        break;
      }
      case "CONTRAST": {
        add("fogDensity", -0.10, `flat contrast${cited("luminance spread")} - cutting the fog that washes the spread`);
        add("rimLightIntensity", 0.08, `flat contrast${cited("luminance spread")} - rim separation`);
        break;
      }
      case "STAGE": {
        add("rimLightIntensity", 0.20, `near-black stage${cited("near-black") ? ` (${cited("near-black").trim()} of frame)` : ""} - raising the rim so the figure reads`);
        add("energyIntensity", 0.10, `near-black stage - lifting the energy`);
        break;
      }
      case "READABILITY": {
        add("fogDensity", -0.12, `readability - clearing the air between lens and subject`);
        add("cameraDistance", -0.15, `readability - moving the camera in`);
        break;
      }
      case "COMPOSITION": {
        const lower = note.toLowerCase();
        if (lower.includes("tight") || lower.includes("close") || lower.includes("crowded")) {
          add("cameraDistance", 0.20, `composition: ${note.slice(0, 80)} - letting the frame breathe`);
        } else if (lower.includes("wide") || lower.includes("loose") || lower.includes("distant") || lower.includes("far")) {
          add("cameraDistance", -0.20, `composition: ${note.slice(0, 80)} - tightening the frame`);
        } else {
          add("cameraDistance", -0.15, `composition: ${note.slice(0, 80)} - tightening toward the subject`);
        }
        break;
      }
      case "PALETTE": {
        add("energyIntensity", 0.08, `palette: ${note.slice(0, 80)} - nudging the energy mix (the palette itself is graded in the materials)`);
        break;
      }
      case "INTENT": {
        wontfix.push({
          kind: "INTENT",
          note: "intent lives in the direction - adjust the beats (set_shot_grammar) and re-render; parameters cannot act it in",
        });
        break;
      }
      default: {
        wontfix.push({ kind: issue.kind, note: "no parameter fix exists for this issue kind" });
      }
    }
  }

  const applied: RenderFixOp[] = [];
  for (const [param, { delta, reasons }] of deltas) {
    if (!(param in SCENE_PARAM_BOUNDS)) continue;
    const bounds = SCENE_PARAM_BOUNDS[param as keyof typeof SCENE_PARAM_BOUNDS];
    const from = scene[param as keyof SceneParams];
    const to = Math.min(bounds.max, Math.max(bounds.min, from + delta));
    if (Math.abs(to - from) < 1e-9) continue; // already at the bound - a no-op is never reported as moved
    applied.push({ param, from, to, reason: reasons.join("; ") });
  }
  return { applied, wontfix };
}

const FINISHED = ["REVIEW", "APPROVED", "NEEDS_REVISION"];

/**
 * THE RENDER-FIX LOOP: read a finished render's open review
 * issues, apply the parameter fix each kind calls for, queue the
 * new attempt, and leave the judging to the fresh review that
 * lands when it finishes.
 */
export async function fixRenderIssues(renderJobId: string, issueIds?: string[]): Promise<RenderFixResult> {
  const base: RenderFixResult = {
    ok: false, jobId: renderJobId, targetRef: "", attempted: 0,
    applied: [], wontfix: [], opsChain: "", newJobId: null, newAttempt: null,
  };
  const job = await db.renderJob.findUnique({
    where: { id: renderJobId },
    include: { shot: { include: { scene: true } } },
  });
  if (!job) return { ...base, error: `render job ${renderJobId} not found` };
  if (!job.outputUrl || !FINISHED.includes(job.status)) {
    return { ...base, error: `the render is not finished (status ${job.status}) - fix what exists, not what is promised` };
  }
  const scene = job.shot?.scene ?? null;
  if (!scene || !job.shot) {
    return { ...base, error: "the render has no scene to adjust - parameters need a live scene row" };
  }
  const targetRef = `Sc${scene.number} Sh${String(job.shot.number).padStart(3, "0")}`;

  // The review (reused when it exists - one per job, the pixels did not change).
  const reviewRes = await ensureRenderReview(job.id);
  if (!reviewRes.ok) return { ...base, targetRef, error: `the pixel review could not run: ${reviewRes.error}` };

  const open = await db.renderIssue.findMany({
    where: { renderJobId: job.id, status: "OPEN" },
    orderBy: [{ severity: "asc" as const }, { createdAt: "asc" as const }],
  });
  const targets = issueIds && issueIds.length > 0 ? open.filter((i) => issueIds.includes(i.id)) : open;
  if (issueIds && issueIds.length > 0 && targets.length === 0) {
    return { ...base, targetRef, error: "none of the given issue ids are open on this render's review" };
  }

  const plan = planRenderFixes(targets, scene);

  if (plan.applied.length === 0) {
    // Nothing a parameter can act on (e.g. only INTENT): honest no-op,
    // the direction has to move instead.
    for (const t of targets) {
      const w = plan.wontfix.find((x) => x.kind === t.kind);
      await db.renderIssue.update({
        where: { id: t.id },
        data: { status: "WONTFIX", fixNote: w?.note ?? "no parameter fix exists for this issue kind" },
      });
    }
    return {
      ...base, ok: true, jobId: job.id, targetRef, attempted: targets.length,
      applied: [], wontfix: plan.wontfix, opsChain: "no parameter fix exists for these issue kinds - adjust the direction and re-render",
      newJobId: null, newAttempt: null,
    };
  }

  // Write the real parameters (the same live scene rows the next
  // render's payload builder reads), citing from -> to.
  const opsChain = plan.applied.map((op) => `${op.param} ${op.from} -> ${op.to}`).join(", ");
  for (const op of plan.applied) {
    await db.scene.update({ where: { id: scene.id }, data: { [op.param]: op.to } });
  }

  // Mark the judged targets FIXING (the fresh review will judge them);
  // refusals go WONTFIX with their honest note.
  const wontfixKinds = new Set(plan.wontfix.map((w) => w.kind));
  for (const t of targets) {
    if (wontfixKinds.has(t.kind)) {
      const w = plan.wontfix.find((x) => x.kind === t.kind);
      await db.renderIssue.update({ where: { id: t.id }, data: { status: "WONTFIX", fixNote: w?.note ?? null } });
    } else {
      await db.renderIssue.update({
        where: { id: t.id },
        data: { status: "FIXING", fixNote: `fix queued: ${opsChain} (attempt ${(job.attempt ?? 1) + 1} renders the verdict)` },
      });
    }
  }

  // THE NEW ATTEMPT: a fresh RenderJob row, attempt+1, lineage named.
  const newJob = await createRenderJob(job.projectId, job.shotId, job.mode as "PREVIEW" | "FINAL");
  if (newJob) {
    await db.renderJob.update({ where: { id: newJob.id }, data: { fixOfJobId: job.id } });
  }

  await db.productionEvent.create({
    data: {
      projectId: job.projectId,
      actor: "DSH",
      type: "STATE_CHANGE",
      summary: `Render fix queued - ${targetRef} attempt ${newJob?.attempt ?? "?"} fixes attempt ${job.attempt}'s issues (${targets.map((t) => t.kind).join(", ")}): ${opsChain}`,
      payload: JSON.stringify({ renderJobId: job.id, newJobId: newJob?.id ?? null, applied: plan.applied, wontfix: plan.wontfix, issueIds: targets.map((t) => t.id) }).slice(0, 4000),
    },
  });

  return {
    ok: true,
    jobId: job.id,
    targetRef,
    attempted: targets.length,
    applied: plan.applied,
    wontfix: plan.wontfix,
    opsChain,
    newJobId: newJob?.id ?? null,
    newAttempt: newJob?.attempt ?? null,
  };
}
