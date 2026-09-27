import { db } from "@/lib/db";
import { compileGrammarSpec, GRAMMAR_MOVES, parseStoredGrammar, serializeGrammar, type GrammarBeat } from "@/lib/animation/grammar";
import { compileFxSpec, FX_KINDS, serializeFx } from "@/lib/animation/fx";
import { createRenderJob } from "@/lib/engine/render";

// ─────────────────────────────────────────────────────────────
// THE FIX GRADUATES TO THE DIRECTION (iteration 61)
//
// Iteration 60's fix loop fixed WHAT THE LIGHT DID. But some
// issues are not the light's fault: an INTENT issue means the
// direction itself does not read in the pixels, and a kind the
// parameters have ALREADY failed (lifted to the bound, re-rendered,
// still flagged) is evidence the parameter level cannot act it.
// The loop graduates: from parameter fixes to RE-DIRECTION
// PROPOSALS - concrete, compiled changes to the shot's motion
// grammar (the beats) and fx programs - applied through the same
// compilers DSH directs with, queued as a new attempt with the same
// fixOf lineage, and JUDGED BY THE SAME LAW: the fresh attempt's
// pixel review decides, by kind, exactly the way it judges a
// parameter fix (render-review.reconcileRenderFixes).
//
// THE GRADUATION LAW (deterministic, unit-testable):
//   INTENT               - always direction-level (it never had a
//                          parameter law; iteration 60 said so and
//                          WONTFIX'd it honestly)
//   any other kind       - escalates only when the parameter level
//                          already had its chance: the kind appears
//                          with a "fix queued" parameter fix note
//                          somewhere in the render's fixOf lineage
//                          (walked up to 4 attempts)
//   CONTRAST / PALETTE   - refuse even when escalated: contrast
//                          lives in the light law, palette in the
//                          materials law - a re-direction cannot act
//                          them honestly, and honesty outranks
//                          coverage
//
// The proposal vocabulary (everything the compilers can carry, so
// nothing here can promise what the worker cannot perform):
//   GRAMMAR: add a directed WIND call to the widest beat (the air
//   moves, the frame reads alive); re-shape the longest beat into a
//   hold + push-in (a directed re-frame).
//   FX: add an AURA presence (emissive qi shell - real emissive
//   geometry, so it also genuinely lifts a dark frame); add MOTES
//   (spirit dust the light catches - a near-empty stage stops
//   reading empty); raise the quietest existing program.
//
// Every op CITES its issue (kind + severity + the number the
// review cited). A proposal never deletes directed content, never
// touches poses, and never fires without a review to cite.
// ─────────────────────────────────────────────────────────────

export interface RedirectionGrammarOp {
  op: "wind" | "reshape";
  detail: string;
  citedKind: string;
  citedSeverity: string;
  citedNumber: string;
}

export interface RedirectionFxOp {
  op: "add" | "raise";
  kind: string;
  intensity: number;
  beats: number[] | "ALL";
  detail: string;
  citedKind: string;
  citedSeverity: string;
  citedNumber: string;
}

export interface RedirectionRefusal {
  kind: string;
  note: string;
}

export interface RedirectionPlan {
  grammarOps: RedirectionGrammarOp[];
  fxOps: RedirectionFxOp[];
  refusals: RedirectionRefusal[];
}

export interface DirectedBeats {
  move: string;
  from: number;
  to: number;
  wind?: number | null;
}

export interface DirectedFx {
  kind: string;
  intensity?: number;
  beats?: number[] | "ALL";
}

/** The cited number from a review note ("mean luminance 0.07") -
 * the proposal cites the review's own evidence back. */
function citedNumber(note: string, marker: string): string {
  const idx = note.indexOf(marker);
  if (idx === -1) return "";
  const tail = note.slice(idx + marker.length).match(/[0-9.]+/);
  return tail ? ` (${tail[0]})` : "";
}

function widestBeat(beats: DirectedBeats[]): DirectedBeats | null {
  if (beats.length === 0) return null;
  return beats.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
}

function longestBeatIndex(beats: DirectedBeats[]): number {
  let idx = 0;
  for (let i = 1; i < beats.length; i++) {
    if (beats[i].to - beats[i].from > beats[idx].to - beats[idx].from) idx = i;
  }
  return idx;
}

/**
 * THE PURE PLANNER (deterministic): open issues + the shot's
 * directed beats/fx + the set of kinds the parameter level already
 * failed -> the re-direction proposal. INTENT always maps; other
 * kinds only when escalated; CONTRAST/PALETTE refuse even then.
 */
export function planRedirection(
  issues: Array<{ severity: string; kind: string; note: string }>,
  beats: DirectedBeats[],
  fx: DirectedFx[],
  exhaustedKinds: Set<string>,
): RedirectionPlan {
  const plan: RedirectionPlan = { grammarOps: [], fxOps: [], refusals: [] };
  const hasWind = beats.some((b) => typeof b.wind === "number" && b.wind > 0);
  const widest = widestBeat(beats);
  const hasPresenceFx = fx.some((p) => p.kind === "AURA");
  const hasMotes = fx.some((p) => p.kind === "MOTES");
  // in-call idempotency: two issues of the same shape in one review
  // must not double the same op (two AURAs is not a plan, it is a echo)
  const planned = { presence: false, motes: false, wind: false, reshape: false, raised: new Set<string>() };
  const PARAM_OWNED = new Set(["EXPOSURE", "CONTRAST", "STAGE", "READABILITY", "COMPOSITION", "PALETTE"]);

  for (const issue of issues) {
    const note = issue.note ?? "";
    const cited = (marker: string) => citedNumber(note, marker);
    // THE GRADUATION LAW: INTENT is always direction-level; every
    // other kind escalates only after the parameter level failed it
    if (issue.kind !== "INTENT" && !exhaustedKinds.has(issue.kind)) {
      plan.refusals.push({
        kind: issue.kind,
        note: PARAM_OWNED.has(issue.kind)
          ? "the parameter level still owns this kind - run render_fix first; the fix escalates to the direction only after the parameters fail"
          : "no re-direction exists for this issue kind",
      });
      continue;
    }
    switch (issue.kind) {
      case "INTENT": {
        // THE GRADUATION, ALWAYS: intent lives in the direction.
        // Order of the vocabulary: presence first (an aura the
        // frame can read), then the quietest program raised, then
        // the air itself.
        if (!hasPresenceFx && !planned.presence) {
          planned.presence = true;
          plan.fxOps.push({
            op: "add", kind: "AURA", intensity: 0.55, beats: "ALL",
            detail: "the directed presence the frame can read - an emissive qi shell on the figure",
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: cited("mean luminance"),
          });
        } else if (!planned.raised.has("__any__")) {
          const quietest = fx
            .map((p) => ({ p, intensity: typeof p.intensity === "number" ? p.intensity : 0.7 }))
            .filter((x) => x.intensity < 1.0 && !planned.raised.has(x.p.kind))
            .sort((a, b) => a.intensity - b.intensity)[0];
          if (quietest) {
            planned.raised.add(quietest.p.kind);
            planned.raised.add("__any__");
            plan.fxOps.push({
              op: "raise", kind: quietest.p.kind, intensity: +Math.min(1, quietest.intensity + 0.2).toFixed(2),
              beats: "ALL",
              detail: `raising the quietest directed program (${quietest.p.kind} at ${quietest.intensity}) so the intent lands`,
              citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: cited("mean luminance"),
            });
          }
        }
        if (!hasWind && widest && !planned.wind) {
          planned.wind = true;
          plan.grammarOps.push({
            op: "wind", detail: `a directed WIND ${0.6} call on the widest beat (${widest.move} ${Math.round(widest.from * 100)}-${Math.round(widest.to * 100)}%) - the cloth and hair answer the beat and the frame stops reading frozen`,
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: "",
          });
        }
        break;
      }
      case "STAGE": {
        if (!hasMotes && !planned.motes) {
          planned.motes = true;
          plan.fxOps.push({
            op: "add", kind: "MOTES", intensity: 0.45, beats: "ALL",
            detail: "spirit dust through the volume - the air catches the rim light and the stage stops reading empty",
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: cited("near-black"),
          });
        } else if (!hasWind && widest && !planned.wind) {
          planned.wind = true;
          plan.grammarOps.push({
            op: "wind", detail: "a directed WIND 0.5 call - the motes already in the air drift and the stage reads inhabited",
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: "",
          });
        }
        break;
      }
      case "EXPOSURE": {
        const blown = note.includes("blown") || note.includes("clips to white");
        if (blown) {
          plan.refusals.push({
            kind: "EXPOSURE",
            note: "the parameter level already ran and the frame still clips - a re-direction cannot darken emissive geometry honestly; pull the emission in the materials law and re-render",
          });
        } else if (!hasPresenceFx && !planned.presence) {
          planned.presence = true;
          plan.fxOps.push({
            op: "add", kind: "AURA", intensity: 0.4, beats: "ALL",
            detail: "emissive presence in the volume - the aura is real light, it lifts the mean luminance the honest way",
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: cited("mean luminance"),
          });
        } else if (!hasWind && widest && !planned.wind) {
          planned.wind = true;
          plan.grammarOps.push({
            op: "wind", detail: "a directed WIND 0.4 call - motion in the cloth catches the rim and lifts the read",
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: "",
          });
        }
        break;
      }
      case "COMPOSITION": {
        if (beats.length >= 2 && !planned.reshape) {
          planned.reshape = true;
          plan.grammarOps.push({
            op: "reshape", detail: `the longest beat (${beats[longestBeatIndex(beats)].move}) re-shaped into a hold + DOLLY_IN push - a directed re-frame the lens performs, not a parameter nudge`,
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: "",
          });
        } else if (beats.length < 2) {
          plan.refusals.push({ kind: "COMPOSITION", note: "a one-move shot has no beats to re-shape - direct a grammar first (set_shot_grammar), then re-render" });
        }
        break;
      }
      case "READABILITY": {
        if (!hasWind && widest && !planned.wind) {
          planned.wind = true;
          plan.grammarOps.push({
            op: "wind", detail: "a directed WIND 0.5 call on the widest beat - cloth in motion separates the figure from the stage",
            citedKind: issue.kind, citedSeverity: issue.severity, citedNumber: "",
          });
        } else {
          plan.refusals.push({ kind: "READABILITY", note: "the air already moves - what remains is the light law's work, not the direction's" });
        }
        break;
      }
      case "CONTRAST": {
        plan.refusals.push({ kind: "CONTRAST", note: "contrast lives in the light law (the rig and the fog) - a re-direction cannot act it honestly" });
        break;
      }
      case "PALETTE": {
        plan.refusals.push({ kind: "PALETTE", note: "the palette is graded in the materials law - a re-direction cannot act it honestly" });
        break;
      }
      default: {
        plan.refusals.push({ kind: issue.kind, note: "no re-direction exists for this issue kind" });
      }
    }
  }
  return plan;
}

const FINISHED = ["REVIEW", "APPROVED", "NEEDS_REVISION"];
const MAX_LINEAGE = 4;

/** The graduation law, resolved against the real lineage: which of
 * these kinds has the parameter level already failed? A kind counts
 * when some ancestor attempt's issue of the same kind carries a
 * "fix queued" parameter note (or was reconciled back to OPEN after
 * one - the note names the attempt that still flagged it). */
export async function resolveExhaustedKinds(renderJobId: string): Promise<Set<string>> {
  const exhausted = new Set<string>();
  let cursor = renderJobId;
  for (let depth = 0; depth < MAX_LINEAGE; depth++) {
    const job = await db.renderJob.findUnique({ where: { id: cursor }, select: { fixOfJobId: true } });
    const parentId = job?.fixOfJobId;
    if (!parentId) break;
    const parentIssues = await db.renderIssue.findMany({
      where: { renderJobId: parentId },
      select: { kind: true, fixNote: true },
    });
    for (const issue of parentIssues) {
      const note = issue.fixNote ?? "";
      if (note.includes("fix queued") || note.includes("still flags")) exhausted.add(issue.kind);
    }
    cursor = parentId;
  }
  return exhausted;
}

export interface RedirectionResult {
  ok: boolean;
  error?: string;
  jobId: string;
  targetRef: string;
  proposed: number;
  grammarOps: RedirectionGrammarOp[];
  fxOps: RedirectionFxOp[];
  refusals: RedirectionRefusal[];
  opsChain: string;
  newJobId: string | null;
  newAttempt: number | null;
  exhaustedKinds: string[];
}

/**
 * THE GRADUATED FIX: read the finished render's open review issues,
 * resolve which kinds have graduated (INTENT always; the rest only
 * when the parameter level already failed them in this render's
 * lineage), plan the re-direction, apply it through the SAME
 * compilers DSH directs with (a typo never reaches a shoot), queue
 * the new attempt with the same fixOf lineage - and leave the
 * judging to the fresh review, the same law that judges a
 * parameter fix.
 */
export async function proposeRedirection(renderJobId: string, issueIds?: string[]): Promise<RedirectionResult> {
  const base: RedirectionResult = {
    ok: false, jobId: renderJobId, targetRef: "", proposed: 0,
    grammarOps: [], fxOps: [], refusals: [], opsChain: "", newJobId: null, newAttempt: null, exhaustedKinds: [],
  };
  const job = await db.renderJob.findUnique({
    where: { id: renderJobId },
    include: { shot: { include: { scene: true } } },
  });
  if (!job) return { ...base, error: `render job ${renderJobId} not found` };
  if (!job.outputUrl || !FINISHED.includes(job.status)) {
    return { ...base, error: `the render is not finished (status ${job.status}) - re-direct what exists, not what is promised` };
  }
  if (!job.shot) return { ...base, error: "the render has no shot to re-direct" };
  const scene = job.shot.scene;
  const targetRef = scene ? `Sc${scene.number} Sh${String(job.shot.number).padStart(3, "0")}` : `shot ${job.shot.id.slice(-6)}`;

  // the review is cited, not invented: no review, no proposal
  const review = await db.renderReview.findUnique({
    where: { renderJobId: job.id },
    include: { issues: { where: { status: "OPEN" }, orderBy: [{ severity: "asc" as const }, { createdAt: "asc" as const }] } },
  });
  if (!review) {
    return { ...base, targetRef, error: "no pixel review on this render - run review_render first; a proposal without evidence is a vibe" };
  }
  const targets = issueIds && issueIds.length > 0 ? review.issues.filter((i) => issueIds.includes(i.id)) : review.issues;
  if (issueIds && issueIds.length > 0 && targets.length === 0) {
    return { ...base, targetRef, error: "none of the given issue ids are open on this render's review" };
  }

  const exhausted = await resolveExhaustedKinds(job.id);
  const beats = (parseStoredGrammar(job.shot.grammar) ?? []).map((b: GrammarBeat) => ({ move: b.move, from: b.from, to: b.to, wind: b.wind }));
  let fx: DirectedFx[] = [];
  try {
    const parsed = JSON.parse(job.shot.fx || "null") as DirectedFx[] | null;
    if (Array.isArray(parsed)) fx = parsed.filter((p) => p && p.kind);
  } catch { /* corrupt column = clean stage, the payload law */ }

  const plan = planRedirection(
    targets.map((t) => ({ severity: t.severity, kind: t.kind, note: t.note })),
    beats,
    fx,
    exhausted,
  );
  const proposed = plan.grammarOps.length + plan.fxOps.length;
  if (proposed === 0) {
    const notes = plan.refusals.map((r) => `${r.kind}: ${r.note}`).join("; ");
    return {
      ...base, ok: true, targetRef, proposed: 0, grammarOps: [], fxOps: [], refusals: plan.refusals,
      opsChain: proposed === 0 && plan.refusals.length > 0 ? `no re-direction proposed - ${notes}` : "no re-direction proposed",
      newJobId: null, newAttempt: null, exhaustedKinds: [...exhausted],
    };
  }

  // ── APPLY through the same compilers DSH directs with ────────
  // GRAMMAR: parse the stored beats, apply the ops, recompile - a
  // re-directed grammar obeys the exact law set_shot_grammar obeys.
  let grammarChanged = false;
  if (plan.grammarOps.length > 0) {
    const stored = parseStoredGrammar(job.shot.grammar);
    let working: Array<Partial<GrammarBeat> & { move: string; from: number; to: number }> =
      stored ? stored.map((b) => ({ move: b.move, from: b.from, to: b.to, poseStart: b.poseStart, poseEnd: b.poseEnd, wind: b.wind, note: b.note })) : [];
    for (const op of plan.grammarOps) {
      if (op.op === "wind" && working.length > 0) {
        const widestIdx = working.reduce((acc, b, i) => (b.to - b.from > working[acc].to - working[acc].from ? i : acc), 0);
        if (working[widestIdx]) working[widestIdx] = { ...working[widestIdx], wind: 0.6 };
        grammarChanged = true;
      } else if (op.op === "reshape" && working.length >= 2) {
        const li = working.reduce((acc, b, i) => (b.to - b.from > working[acc].to - working[acc].from ? i : acc), 0);
        const long = working[li];
        const mid = +((long.from + long.to) / 2).toFixed(4);
        const hold: Partial<GrammarBeat> & { move: string; from: number; to: number } = { ...long, to: mid };
        const pushIn: Partial<GrammarBeat> & { move: string; from: number; to: number } = {
          move: GRAMMAR_MOVES.includes("DOLLY_IN") ? "DOLLY_IN" : long.move,
          from: mid,
          to: long.to,
          ...(typeof long.wind === "number" ? { wind: long.wind } : {}),
        };
        working = [...working.slice(0, li), hold, pushIn, ...working.slice(li + 1)];
        grammarChanged = true;
      }
    }
    if (grammarChanged) {
      const compiled = compileGrammarSpec({ name: `${job.shot.id.slice(-6)}-redirection`, beats: working });
      if (!compiled.ok) {
        return { ...base, targetRef, proposed, grammarOps: plan.grammarOps, fxOps: plan.fxOps, refusals: plan.refusals, exhaustedKinds: [...exhausted], error: `the re-directed grammar does not compile - nothing was changed: ${compiled.error}` };
      }
      await db.shot.update({ where: { id: job.shot.id }, data: { grammar: serializeGrammar(compiled.spec) } });
    }
  }

  // FX: merge the ops into the shot's existing programs, recompile -
  // a re-directed stage obeys the exact law set_shot_fx obeys.
  let fxChanged = false;
  if (plan.fxOps.length > 0) {
    let programs: Array<{ kind: string; color?: string; intensity?: number; beats?: number[] | "ALL" }> = fx.map((p) => ({ ...p }));
    for (const op of plan.fxOps) {
      if (op.op === "add") {
        programs.push({ kind: op.kind, intensity: op.intensity, beats: op.beats });
        fxChanged = true;
      } else if (op.op === "raise") {
        const target = programs
          .map((p, i) => ({ p, i, intensity: typeof p.intensity === "number" ? p.intensity : 0.7 }))
          .filter((x) => x.p.kind === op.kind)
          .sort((a, b) => a.intensity - b.intensity)[0];
        if (target) {
          programs[target.i] = { ...target.p, intensity: op.intensity };
          fxChanged = true;
        }
      }
    }
    if (fxChanged) {
      const compiled = compileFxSpec({ name: `${job.shot.id.slice(-6)}-redirection`, programs });
      if (!compiled.ok) {
        return { ...base, targetRef, proposed, grammarOps: plan.grammarOps, fxOps: plan.fxOps, refusals: plan.refusals, exhaustedKinds: [...exhausted], error: `the re-directed fx do not compile - nothing was changed: ${compiled.error}` };
      }
      await db.shot.update({ where: { id: job.shot.id }, data: { fx: serializeFx(compiled.spec) } });
    }
  }

  const opsChain = [
    ...plan.grammarOps.map((o) => `${o.op}: ${o.detail}`),
    ...plan.fxOps.map((o) => `${o.kind} @${typeof o.intensity === "number" ? o.intensity : "?"}${o.beats === "ALL" ? " ALL" : ` beats ${o.beats.join(".")}`}`),
  ].join("; ");

  // Mark the proposed targets: FIXING with a note that names it a
  // RE-DIRECTION (the fresh review judges by kind either way);
  // refusals stay OPEN with their honest note.
  const refusalKinds = new Set(plan.refusals.map((r) => r.kind));
  for (const t of targets) {
    if (refusalKinds.has(t.kind)) continue;
    await db.renderIssue.update({
      where: { id: t.id },
      data: { status: "FIXING", fixNote: `re-direction queued: ${opsChain} (attempt ${(job.attempt ?? 1) + 1} renders the verdict)` },
    });
  }

  // THE NEW ATTEMPT: same lineage law as the parameter fix.
  const newJob = await createRenderJob(job.projectId, job.shotId, job.mode as "PREVIEW" | "FINAL");
  if (newJob) {
    await db.renderJob.update({ where: { id: newJob.id }, data: { fixOfJobId: job.id } });
  }

  await db.productionEvent.create({
    data: {
      projectId: job.projectId,
      actor: "DSH",
      type: "STATE_CHANGE",
      summary: `Re-direction proposed and applied - ${targetRef} attempt ${newJob?.attempt ?? "?"} (${targets.map((t) => t.kind).join(", ")}): ${opsChain}`,
      payload: JSON.stringify({ renderJobId: job.id, newJobId: newJob?.id ?? null, grammarOps: plan.grammarOps, fxOps: plan.fxOps, refusals: plan.refusals, exhaustedKinds: [...exhausted] }).slice(0, 4000),
    },
  });

  return {
    ok: true,
    jobId: job.id,
    targetRef,
    proposed,
    grammarOps: plan.grammarOps,
    fxOps: plan.fxOps,
    refusals: plan.refusals,
    opsChain,
    newJobId: newJob?.id ?? null,
    newAttempt: newJob?.attempt ?? null,
    exhaustedKinds: [...exhausted],
  };
}
