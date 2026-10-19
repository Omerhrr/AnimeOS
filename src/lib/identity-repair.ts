/**
 * identity-repair - THE GAP IS REPAIRED (iteration 80).
 *
 * The standing is the work order (THE CAST ANSWERS THE BAR): a BELOW
 * member is NAMED with their worst shot ref - and a work order nobody
 * executes is a shame, not a plan. This module is the loop that
 * executes it, in two halves:
 *
 *   (a) RE-RENDER: the member's sheet is read into build DNA (the
 *       vision read, cached on the character - THE DNA ADHERES TO THE
 *       SHEET), their worst shots re-render over the real engine with
 *       the adherent DNA riding, and every re-render is re-scored by
 *       the REAL vision channel against the same sheet.
 *
 *   (b) RE-ANCHOR: a member still below after the re-renders has their
 *       canonical sheet regenerated from the current design text
 *       (reanchorCharacter - the same canonical decision the drift
 *       loop uses), and the shots are re-scored against the NEW sheet.
 *
 * The ledger is honest by construction: per shot the before reading,
 * the after reading, and the verdict the pair earns - REPAIRED (the
 * bar is cleared), IMPROVED (moved up, bar not cleared), UNCHANGED,
 * WORSE, or UNSCORED (the re-score failed - named, not hidden). The
 * cast standing is read again when the loop ends: the gap that
 * remains is named, never averaged away.
 */

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { recordCharacterAssetReadings } from "@/lib/character-assets";
import {
  castIdentityMeasurement,
  castMemberStanding,
  castStandingOrder,
  identityThresholdFor,
  scoreRenderIdentity,
  type CastIdentityMeasurement,
  type CastReading,
  type IdentitySource,
} from "@/lib/identity";
import { appendIdentityArcReading, arcMedianRows, bridgeLawCohort, readIdentityArcEpisode } from "@/lib/identity-arc";
import {
  episodeReleaseVerdict,
  identityExpressionBucket,
  identityFramingBucket,
  identityLightingBucket,
  identityStateBucket,
  identityYawBucket,
  type EpisodeReleaseRead,
} from "@/lib/identity-matrix";
import { targetsNamedFirst } from "@/lib/repair-work-order";
import { carriedAcceptanceVerdicts, type CarryEntry } from "@/lib/acceptance-carry";
import type { IdentityScoreEntry } from "@/lib/identity";
import { readSheetDna, parseSilhouetteShape, silhouetteShapeLine, parseFaceProfile, faceProfileLine, parseMaterialProfile, materialProfileLine } from "@/lib/blender/adherence";
import { parseGroomProfile, groomProfileLine } from "@/lib/blender/groom";
import { reanchorWithSheetAcceptance } from "@/lib/reanchor";
import { createRenderJob, tickRenderJob } from "@/lib/engine/render";

// ── the loop's knobs (bounded: a repair pass is a pass, not a night) ──
export const REPAIR_MAX_MEMBERS = 4;
export const REPAIR_MAX_SHOTS_PER_MEMBER = 3;

/** THE TICK-BUDGET LAW (iteration 147): the repair's wait scales with
 * the work, never a constant. The 146 night measured the old fixed
 * 330s budget under-covering the wide rung's real renders by 1.87x
 * (S001: 101 frames at ~6.1 s/frame) and 3.56x (Wei S004: 96 frames
 * at ~12.2 s/frame) - two of four re-renders died mid-render and
 * their "repairs" were silently re-judgments (the re-anchor beat
 * supplied the lift). From 147 the wait reads the job's OWN progress
 * (the stage's live "frame N/M", the job's progress): a render that
 * advances is alive and waits as long as it needs. Only two honest
 * budgets can end a wait:
 *
 *   - STALL: no visible advance for REPAIR_STALL_TICKS consecutive
 *     ticks (240 x 500ms = 120s - Blender can spend minutes on one
 *     heavy frame, the window clears that bar), or
 *   - CEILING: REPAIR_MAX_WAIT_TICKS total (2640 x 500ms = 22 min,
 *     sized from the measured worst per-frame cost at the wide rung
 *     - 12.2 s/frame x ~101 frames = ~20.6 min - with margin).
 *
 * Either way the failure status NAMES WHICH budget ended the wait and
 * the frame the work reached - the ledger stays honest at both rungs.
 *
 * THE REFERENCE DOES NOT MOVE UNDER AN HONEST RECEIPT (iteration
 * 149): the 148 night rode the scaled wait to 4/4 completed
 * re-renders and the completed pixels told the truth the re-anchor's
 * sheets did not want to hear - the beat regenerated the canonical
 * sheet for every still-below member with no acceptance and no
 * stability, and the judge's reference moved under the pixels (the
 * 146 night's +25 and the 148 night's -8 rode the SAME beat). From
 * 149 the re-anchor beat carries ITS SHEET ACCEPTANCE (the night130
 * law, completed): the member's build DNA is measured against the
 * committed design dyes, an honest build means the reference STANDS
 * (the still-below is named, never re-judged against a moved
 * goalpost), a drifted build owes a bounded best-of candidates whose
 * pixels must measure IN the design's class BEFORE any installs, and
 * a channel that keeps its drift keeps its standing sheet. */
export const REPAIR_LAW_VERSION = 149;
export const REPAIR_TICK_MS = 500;
export const REPAIR_STALL_TICKS = 240;
export const REPAIR_MAX_WAIT_TICKS = 2640;

export type ShotRepairVerdict = "REPAIRED" | "IMPROVED" | "UNCHANGED" | "WORSE" | "UNSCORED";
export type MemberRepairVerdict = "REPAIRED" | "IMPROVED" | "STILL_BELOW" | "UNSCORED";

export interface RepairShotRow {
  ref: string;
  shotId: string;
  before: number;
  after: number | null;
  verdict: ShotRepairVerdict;
  error?: string;
}

export interface RepairMemberRow {
  characterId: string;
  name: string;
  before: { standing: string; average: number | null; worst: number | null; worstRef: string | null };
  dna: { source: "cached" | "read" | "failed" | "skipped"; line: string };
  shots: RepairShotRow[];
  /** THE ACCEPTANCE'S VERDICT, CARRIED (iteration 235): the newest
   *  acceptance night's own answer for this member, named in the
   *  ledger - the next night rides WITH the verdict in hand (the
   *  carry names continuity, it never skips the beat's own gate). */
  carriedAcceptance?: string;
  reanchored: boolean;
  reanchorError?: string;
  /** THE SHEET ACCEPTANCE (iteration 149): how the beat answered.
   * `reanchored` is true only when an accepted sheet installed; the
   * note names every other answer (the honest stand-down, the
   * channel's kept drift) and the attempts count the candidates. */
  reanchorAttempts?: number;
  reanchorNote?: string;
  after: { standing: string; average: number | null; worst: number | null };
  verdict: MemberRepairVerdict;
}

export interface RepairPassResult {
  projectId: string;
  source: IdentitySource;
  bar: number;
  members: RepairMemberRow[];
  before: { below: number; clearing: number; measured: number };
  after: { below: number; clearing: number; measured: number };
  /** THE REPAIR JOINS THE ARC (iteration 146): the night tag the
   * re-scores appended under, and the gate's own read of every
   * episode the worked shots live in - the after-standing answers
   * the SAME instrument that refused, off the SAME receipt. */
  night: string;
  arcAfter: Array<EpisodeReleaseRead & { episodeNumber: number | null }>;
  /** THE INSTRUMENT DOOR (iteration 233): which board the pass read
   * its standing from - "sweep" (the pre-arc world, byte-exact) or
   * "arc" (the gate's own union: db rows + the committed receipt,
   * per-entry medians across the cohort's nights). The instrument
   * is NAMED in the ledger, never implied. */
  instrument: "sweep" | "arc";
  /** When the pass rode the map: the episode the work order names. */
  episodeId?: string;
  /** THE MAP RODE (iteration 233): the named refs the pass was
   * given, and the named refs no below-bar reading carried - both
   * honest, both in the ledger. */
  workOrder: { namedRefs: string[]; unnamedRefs: string[] };
}

// ── the pure verdict law (the E2E asserts it) ──

/** The verdict one before→after pair earns against the bar. */
export function shotRepairVerdict(before: number, after: number | null, bar: number): ShotRepairVerdict {
  if (after === null || !Number.isFinite(after)) return "UNSCORED";
  if (after >= bar) return "REPAIRED";
  if (after > before) return "IMPROVED";
  if (after === before) return "UNCHANGED";
  return "WORSE";
}

/** The member's verdict: any repaired shot repairs the member; any
 * improved shot improves them; all-scored-but-unmoved is still below;
 * a member with nothing scored is honestly unscored. */
export function memberRepairVerdict(shots: RepairShotRow[]): MemberRepairVerdict {
  if (shots.length === 0) return "UNSCORED";
  if (shots.some((s) => s.verdict === "REPAIRED")) return "REPAIRED";
  if (shots.some((s) => s.verdict === "IMPROVED")) return "IMPROVED";
  if (shots.every((s) => s.verdict === "UNSCORED")) return "UNSCORED";
  return "STILL_BELOW";
}

export function repairVerdictLine(v: MemberRepairVerdict): string {
  switch (v) {
    case "REPAIRED": return "REPAIRED - the bar is cleared";
    case "IMPROVED": return "IMPROVED - moved up, bar not cleared yet";
    case "STILL_BELOW": return "STILL BELOW - the re-render moved nothing";
    case "UNSCORED": return "UNSCORED - the re-score failed, named in the ledger";
  }
}

// ── the loader: a BELOW member's worst shots, by their own readings ──

export interface BelowShot {
  shotId: string;
  ref: string;
  similarity: number;
}

/**
 * The named shots where this character's own vision reading sits
 * under the bar (RENDER source), worst first - exactly the queue the
 * standing names, resolved from the persisted per-character entries.
 */
export async function belowRenderShotsForCharacter(
  projectId: string,
  characterName: string,
  bar: number,
  limit: number,
): Promise<BelowShot[]> {
  const rows = await db.identityScore.findMany({
    where: { projectId, source: "RENDER" },
    include: { shot: { include: { scene: { include: { episode: true } } } } },
    orderBy: { scoredAt: "desc" },
    take: 64,
  });
  const out: BelowShot[] = [];
  for (const row of rows) {
    let entries: Array<{ characterName?: unknown; similarity?: unknown }> = [];
    try {
      const parsed = JSON.parse(row.scores);
      if (Array.isArray(parsed)) entries = parsed;
    } catch {
      continue;
    }
    const mine = entries.find((e) => e?.characterName === characterName);
    if (!mine || typeof mine.similarity !== "number") continue;
    if (mine.similarity >= bar) continue;
    out.push({
      shotId: row.shotId,
      ref: `E${row.shot.scene.episode.number} Sc${row.shot.scene.number} S${String(row.shot.number).padStart(3, "0")}`,
      similarity: mine.similarity,
    });
  }
  return out.sort((a, b) => a.similarity - b.similarity).slice(0, Math.max(1, limit));
}

// ── THE INSTRUMENT DOOR (iteration 233): the pass reads what the
//    gate reads ──

/** The gate's own bucketOf, shared byte-exact with the release read. */
function arcBucketOf(shot: {
  shotType: string | null;
  movement: string | null;
  description: string | null;
  poseStart: string | null;
  poseEnd: string | null;
  lighting: string | null;
}) {
  return {
    framing: identityFramingBucket(shot.shotType),
    yaw: identityYawBucket(shot.movement),
    expression: identityExpressionBucket(shot.description, shot.poseStart, shot.poseEnd),
    lighting: identityLightingBucket(shot.lighting),
    state: identityStateBucket(shot.poseStart),
  };
}

/**
 * THE ARC INSTRUMENT: the cast's standing read the way the release
 * gate reads it - readIdentityArcEpisode's union (the db's live rows
 * + the committed receipt's lines), rolled through arcMedianRows
 * (per-entry medians across the newest cohort's nights), judged by
 * the SAME castMemberStanding law the sweep loader obeys. An episode
 * whose arc carries no rows falls back to the sweep (the pre-arc
 * world, byte-exact) - the pair names which door answered, so the
 * ledger never implies an instrument it did not ride. The sixth
 * death's own seam, healed: a body whose sweep died with a sandbox
 * still carries its readings in the committed half, and the repair
 * pass answers THAT truth instead of riding an empty queue.
 */
export async function castArcMeasurement(
  projectId: string,
  episodeId: string,
  opts?: { receiptPath?: string | null },
): Promise<{ instrument: "arc" | "sweep"; measurement: CastIdentityMeasurement }> {
  const [project, arcRows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { characters: { select: { id: true, name: true, role: true, modelSheetUrl: true } } } }),
    readIdentityArcEpisode(projectId, episodeId, "RENDER", opts),
  ]);
  const cast = project?.characters ?? [];
  if (arcRows.length === 0 || cast.length === 0) {
    return { instrument: "sweep", measurement: await castIdentityMeasurement(projectId, "RENDER") };
  }
  const idByName = new Map(cast.map((c) => [c.name, c.id] as const));
  const rolled = arcMedianRows({ arcRows, idByName, bucketOf: arcBucketOf });
  const bar = identityThresholdFor("RENDER");
  const members = cast
    .map((c) => {
      const readings: CastReading[] = rolled.rows
        .filter((r) => r.characterId === c.id)
        .map((r) => ({ worst: r.similarity, ref: r.ref }));
      return castMemberStanding({ characterId: c.id, name: c.name, role: c.role, anchored: Boolean(c.modelSheetUrl), readings, bar });
    })
    .sort((a, b) => castStandingOrder(a) - castStandingOrder(b) || (a.standing === "BELOW" ? (a.worst ?? 1) - (b.worst ?? 1) : a.name.localeCompare(b.name)));
  return {
    instrument: "arc",
    measurement: {
      source: "RENDER",
      bar,
      members,
      cast: members.length,
      anchored: members.filter((m) => m.anchored).length,
      measured: members.filter((m) => m.readings > 0).length,
      clearing: members.filter((m) => m.standing === "CLEARING").length,
      below: members.filter((m) => m.standing === "BELOW").length,
      untested: members.filter((m) => m.standing === "UNTESTED").length,
      unanchored: members.filter((m) => m.standing === "UNANCHORED").length,
    },
  };
}

/**
 * The member's below-bar shots off the GATE's own number (the arc's
 * per-entry medians, the same rows the release read rolled) - the
 * twin of belowRenderShotsForCharacter, one instrument lower.
 */
export async function belowArcShotsForCharacter(
  projectId: string,
  episodeId: string,
  characterName: string,
  bar: number,
  limit: number,
  opts?: { receiptPath?: string | null },
): Promise<BelowShot[]> {
  const [project, arcRows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { characters: { select: { id: true, name: true } } } }),
    readIdentityArcEpisode(projectId, episodeId, "RENDER", opts),
  ]);
  if (arcRows.length === 0) return [];
  const idByName = new Map((project?.characters ?? []).map((c) => [c.name, c.id] as const));
  const rolled = arcMedianRows({ arcRows, idByName, bucketOf: arcBucketOf });
  const out: BelowShot[] = rolled.rows
    .filter((r) => r.characterName === characterName && r.similarity < bar)
    .map((r) => ({ shotId: r.shotId, ref: r.ref, similarity: r.similarity }));
  return out.sort((a, b) => a.similarity - b.similarity).slice(0, Math.max(1, limit));
}

// ── the render wait (bounded, in-process) ──

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** The wait decision, PURE (the E2E asserts it): keep waiting unless
 * the stall or the ceiling fires - the stall outranks the ceiling. */
export function renderWaitDecision(input: { elapsedTicks: number; stalledTicks: number }): { continue: boolean; reason?: "stall" | "ceiling" } {
  if (input.stalledTicks >= REPAIR_STALL_TICKS) return { continue: false, reason: "stall" };
  if (input.elapsedTicks >= REPAIR_MAX_WAIT_TICKS) return { continue: false, reason: "ceiling" };
  return { continue: true };
}

/** The live frame read off the job's stage ("rendering frame 54/101"). */
function frameOf(stage: string | null | undefined): number | null {
  const m = typeof stage === "string" ? stage.match(/frame (\d+)\/(\d+)/) : null;
  return m ? Number(m[1]) : null;
}

// THE WAIT RESUMES THE WORK (iteration 233): a waiter's death must
// not orphan the render. The bridge keeps rendering after the
// process that queued the job dies (measured live: a repair render
// advanced to 90% while its waiter was reaped), so the wait answers
// the work that already rode instead of queuing a duplicate:
//
//   - the shot's latest PREVIEW job COMPLETED (REVIEW/APPROVED with
//     a clip) within RENDER_RESUME_FRESH_MS -> the wait answers ok
//     (those pixels ARE the repair's own fresh render - the
//     re-score judges them the same), never stale ones;
//   - the latest job is RENDERING and ALIVE (the corpse question
//     reads the stall law - RENDER_RESUME_STALL_MS of no advance,
//     the file's own content answering before the clock, the 236
//     law below) -> the wait RESUMES it (the same tick loop, the
//     same stall/ceiling law);
//   - a corpse (RENDERING, no advance within the stall window) rides
//     the fresh queue - the stale job keeps its own honest failure
//     path.
//
// Resume is bounded to the pass's own render shape (mode PREVIEW,
// this shot) and never resurrects a FAILED row.
export const RENDER_RESUME_FRESH_MS = 30 * 60_000;

// THE CORPSE QUESTION READS THE STALL LAW (iteration 236): the old
// 15s quiet-mtime window false-negatived a LIVE render under memory
// thrash - the 235 ride's own seam, named honestly: the OOM scar
// starved the worker's heartbeat writes while Cycles crunched a
// heavy frame, the door declared a corpse and queued a DUPLICATE,
// and the duplicate's own thrash took the second pool worker. The
// window grows to the stall law's own arithmetic - REPAIR_STALL_TICKS
// x REPAIR_TICK_MS = 120s of NO ADVANCE, the same bar the wait's own
// stall law speaks ("Blender can spend minutes on one heavy frame,
// the window clears that bar") - and the question reads the file's
// own truth before the clock (the 107 precedent: the finalize never
// lies): a job file whose own progress or stage has advanced past
// the caller's last-known row is ALIVE - the writeback may be dead,
// the work is not. A quiet mtime is not death; only the stall
// arithmetic kills. DERIVED, never a second literal: the resume
// window and the stall law cannot drift apart.
export const RENDER_RESUME_STALL_MS = REPAIR_STALL_TICKS * REPAIR_TICK_MS;

/** The caller's last-known row state (the db's own tick - what the
 *  file's content is compared against). */
export interface RenderJobLastKnown {
  progress: number;
  stage: string | null;
}

export function renderJobHeartbeatAlive(jobId: string, lastKnown?: RenderJobLastKnown): boolean {
  try {
    const file = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
    const st = fs.statSync(file);
    if (lastKnown) {
      // (a) the file's own truth first (the 107 precedent): content
      //     advanced past the last-known row -> the worker is alive
      //     and crunching, whatever the writeback did
      const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as { progress?: unknown; stage?: unknown };
      const p = typeof raw.progress === "number" ? raw.progress : null;
      const s = typeof raw.stage === "string" ? raw.stage : null;
      if (p !== null && p > lastKnown.progress) return true;
      if (s !== null && s !== lastKnown.stage) return true;
    }
    // (b) the stall window: the mtime within 120s is life - 120s of
    //     quiet under a heavy frame is a frame being crunched, not a
    //     corpse
    return Date.now() - st.mtimeMs < RENDER_RESUME_STALL_MS;
  } catch {
    return false;
  }
}

export async function renderAndWait(projectId: string, shotId: string): Promise<{ ok: boolean; status: string }> {
  // the resume door (see THE WAIT RESUMES THE WORK above)
  const latest = await db.renderJob.findFirst({
    where: { projectId, shotId, mode: "PREVIEW", status: { in: ["RENDERING", "REVIEW", "APPROVED"] } },
    orderBy: { startedAt: "desc" },
  });
  if (
    latest &&
    (latest.status === "REVIEW" || latest.status === "APPROVED") &&
    latest.outputUrl &&
    latest.finishedAt &&
    Date.now() - latest.finishedAt.getTime() < RENDER_RESUME_FRESH_MS
  ) {
    return { ok: true, status: `resumed ${latest.status} - the work already rode (${latest.stage ?? "clip ready"})` };
  }
  let job: { id: string; status: string; stage: string | null; progress: number } | null = null;
  if (latest && latest.status === "RENDERING") {
    const ticked = await tickRenderJob(latest.id);
    const advanced =
      !!ticked &&
      (ticked.progress > latest.progress || (ticked.stage ?? "") !== (latest.stage ?? "") || renderJobHeartbeatAlive(latest.id, { progress: latest.progress, stage: latest.stage }));
    if (advanced && ticked) {
      job = ticked; // the wait resumes a render that is still alive
      console.log(`[repair] ${shotId}: resuming the live render ${latest.id.slice(-6)} at ${ticked.progress}% (the work survived its waiter)`);
    }
  }
  if (!job) {
    const created = await createRenderJob(projectId, shotId, "PREVIEW");
    if (!created) return { ok: false, status: "no-job" };
    job = created;
  }
  // THE WAIT SCALES WITH THE WORK (iteration 147): progress-aware -
  // an advancing render is alive; only the stall or the ceiling ends
  // the wait, and the failure names which.
  let ticked = await tickRenderJob(job.id);
  let elapsed = 0;
  let stalled = 0;
  let lastFrame = frameOf(ticked?.stage);
  let lastProgress = ticked?.progress ?? 0;
  while (ticked && ticked.status === "RENDERING") {
    const decision = renderWaitDecision({ elapsedTicks: elapsed, stalledTicks: stalled });
    if (!decision.continue) {
      const budget = decision.reason === "stall" ? REPAIR_STALL_TICKS : REPAIR_MAX_WAIT_TICKS;
      return {
        ok: false,
        status: `${decision.reason} at tick ${elapsed}/${budget}, last frame ${lastFrame ?? "?"} - the ${decision.reason} budget ended the wait`,
      };
    }
    await sleep(REPAIR_TICK_MS);
    elapsed += 1;
    ticked = await tickRenderJob(job.id);
    const frame = frameOf(ticked?.stage);
    const advanced = (frame !== null && frame !== lastFrame) || (ticked?.progress ?? 0) > lastProgress;
    if (advanced) {
      stalled = 0;
      if (frame !== null) lastFrame = frame;
      lastProgress = ticked?.progress ?? lastProgress;
    } else {
      stalled += 1;
    }
  }
  return {
    ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl,
    status: `${ticked?.status ?? "lost"} ${ticked?.stage ?? ""}`.trim(),
  };
}

// ── the loop ──

function standingSnapshot(m: CastIdentityMeasurement) {
  return { below: m.below, clearing: m.clearing, measured: m.measured };
}

function memberSnapshot(m: CastIdentityMeasurement, characterId: string) {
  const mem = m.members.find((x) => x.characterId === characterId);
  if (!mem) return { standing: "ABSENT", average: null, worst: null, worstRef: null };
  return { standing: mem.standing, average: mem.average, worst: mem.worst, worstRef: mem.worstRef };
}

/**
 * Run the repair loop over the production's BELOW cast members
 * (RENDER bar): re-read their sheet DNA, re-render their worst named
 * shots, re-score with the real vision channel, re-anchor the members
 * the re-render could not lift (when reanchor is on), and read the
 * standing again. Every miss is named in the ledger.
 *
 * THE REPAIR JOINS THE ARC (iteration 146): every re-scored shot
 * APPENDS to the identity arc under `night` (default
 * `repair-<calendar day>` - a re-run the same day folds into the
 * same night, the idempotent replace), cohort-tagged from the
 * bridges' own law versions, ref-chained to the work - and the
 * result's `arcAfter` reads the gate's own verdict (the multi-night
 * median off the same receipt path) for every episode the worked
 * shots live in, so the repair's ledger and the release gate answer
 * ONE instrument. `receiptPath` routes the receipt (default: the
 * committed production ledger; null: DB rows only - the e2e's lab
 * scopes ride their own path and never touch the production
 * receipt).
 */
export async function runIdentityRepairPass(
  projectId: string,
  opts?: { members?: number; shotsPerMember?: number; reanchor?: boolean; nameFilter?: string; night?: string; receiptPath?: string | null; episodeId?: string; namedRefs?: string[]; carryEntries?: CarryEntry[] },
): Promise<RepairPassResult> {
  const memberLimit = Math.max(1, Math.min(REPAIR_MAX_MEMBERS, Math.round(Number(opts?.members ?? 2) || 2)));
  const shotLimit = Math.max(1, Math.min(REPAIR_MAX_SHOTS_PER_MEMBER, Math.round(Number(opts?.shotsPerMember ?? 1) || 1)));
  const reanchor = opts?.reanchor !== false;
  const nameFilter = (opts?.nameFilter ?? "").trim().toLowerCase();
  const night = (opts?.night ?? "").trim() || `repair-${new Date().toISOString().slice(0, 10)}`;
  const receiptPath = opts?.receiptPath;
  const cohort = bridgeLawCohort();
  // the re-scores' full verdicts, freshest per shot - the arc append
  // carries the SHOT's whole cast read, the same shape the night
  // rescore appends
  const verdicts = new Map<string, { worst: number; entries: IdentityScoreEntry[] }>();

  // THE INSTRUMENT DOOR (iteration 233): ride the map (opts.episodeId)
  // and the pass reads the gate's own board - the arc's union, the
  // per-entry medians across the cohort's nights, the SAME rows the
  // release read rolled. No map and the pre-arc world stands
  // byte-exact (the sweep). The instrument is NAMED, never implied.
  const mapEpisodeId = (opts?.episodeId ?? "").trim();
  const ridingTheMap = mapEpisodeId.length > 0;
  const beforeDoor = ridingTheMap
    ? await castArcMeasurement(projectId, mapEpisodeId, { receiptPath: opts?.receiptPath })
    : { instrument: "sweep" as const, measurement: await castIdentityMeasurement(projectId, "RENDER") };
  const instrument = beforeDoor.instrument;
  const before = beforeDoor.measurement;
  const namedRefs = [...new Set((opts?.namedRefs ?? []).map((r) => r.trim()).filter(Boolean))];
  // the honest aggregate: a named ref rides out "unnamed" only when
  // NO member's own below-bar queue carried it (per-member queues
  // differ - the whole pass is the honesty unit)
  const carriedRefs = new Set<string>();
  const belowMembers = before.members
    .filter((m) => m.standing === "BELOW")
    .filter((m) => !nameFilter || m.name.toLowerCase().includes(nameFilter))
    .slice(0, memberLimit);
  // THE ACCEPTANCE'S VERDICT, CARRIED (iteration 235): the caller's
  // entries (the receipts' acceptance rows) turn into the per-member
  // carried line once, before the work - every row names what the
  // next night knew (or the honest NONE, never an implied answer).
  const carryByName = new Map(
    carriedAcceptanceVerdicts(opts?.carryEntries ?? [], belowMembers.map((m) => m.name)).map((c) => [c.characterName, c.line] as const),
  );

  const rows: RepairMemberRow[] = [];
  for (const member of belowMembers) {
    // (a-1) THE SHEET IS READ INTO BUILD DNA: a fresh vision read (the
    //    cache is deliberately bypassed - a repair re-measures its truth)
    let dna: RepairMemberRow["dna"] = { source: "skipped", line: `${member.name}: no sheet read attempted` };
    let buildRobe: string | null = null;
    if (member.anchored) {
      const read = await readSheetDna(member.characterId, { refresh: true });
      dna = read.ok
        ? { source: read.source, line: adherenceLineFromRead(member.name, read.dna) }
        : { source: "failed", line: `${member.name}: sheet DNA read failed - ${read.error}` };
      buildRobe = read.ok ? read.dna.robeColor ?? null : null;
    } else {
      dna = { source: "skipped", line: `${member.name}: unanchored cannot be repaired against nothing` };
    }

    // (a-2) RE-RENDER the named worst shots with the adherent DNA riding
    // THE MAP RIDES (iteration 233): riding the arc instrument the
    // queue reads the gate's own medians; the named refs (the work
    // order's worst cells) ride FIRST, the member's own queue fills
    // the rest; a named ref no below-bar reading carries is NAMED.
    const belowShots = ridingTheMap
      ? await belowArcShotsForCharacter(projectId, mapEpisodeId, member.name, before.bar, shotLimit, { receiptPath: opts?.receiptPath })
      : await belowRenderShotsForCharacter(projectId, member.name, before.bar, shotLimit);
    for (const b of belowShots) carriedRefs.add(b.ref);
    const order = targetsNamedFirst(belowShots, namedRefs, shotLimit);
    const targets = order.targets;
    const shotRows: RepairShotRow[] = [];
    for (const t of targets) {
      const rendered = await renderAndWait(projectId, t.shotId);
      if (!rendered.ok) {
        shotRows.push({ ref: t.ref, shotId: t.shotId, before: t.similarity, after: null, verdict: "UNSCORED", error: `re-render did not finish (${rendered.status})` });
        continue;
      }
      const rescored = await scoreRenderIdentity(t.shotId);
      const after = rescored.ok ? rescored.scored.verdict.entries.find((e) => e.characterName === member.name)?.similarity ?? null : null;
      // the full cast read rides to the arc append (the freshest wins
      // when several members share the shot - the fold keeps the last)
      if (rescored.ok) {
        verdicts.set(t.shotId, { worst: rescored.scored.verdict.worst, entries: rescored.scored.verdict.entries });
      }
      shotRows.push({
        ref: t.ref,
        shotId: t.shotId,
        before: t.similarity,
        after,
        verdict: shotRepairVerdict(t.similarity, after, before.bar),
        ...(rescored.ok ? {} : { error: rescored.error }),
      });
    }

    let reanchored = false;
    let reanchorError: string | undefined;
    let reanchorAttempts: number | undefined;
    let reanchorNote: string | undefined;

    // (b) STILL BELOW -> THE SHEET ACCEPTANCE ANSWERS FIRST (iteration
    // 149): the night130 gate reads the member's build DNA against the
    // committed design dyes. An HONEST build means the reference does
    // not move - the still-below stands named, never re-judged against
    // a regenerated goalpost (the 148 wound). A DRIFTED build owes a
    // bounded best-of candidates, each measured IN the design's class
    // before it may install; only an ACCEPTED sheet re-scores the
    // shots (the reference actually moved - the re-judgment is fair).
    if (reanchor && memberRepairVerdict(shotRows) !== "REPAIRED" && member.anchored) {
      const ra = await reanchorWithSheetAcceptance(member.characterId, { buildRobe, actor: "DSH" });
      reanchorAttempts = ra.attempts;
      reanchorNote = ra.ok ? ra.note : `the acceptance failed - ${ra.error ?? "unknown"}`;
      if (ra.ok && ra.accepted && ra.result) {
        reanchored = true;
        for (const row of shotRows) {
          if (row.verdict === "REPAIRED") continue;
          const rescored = await scoreRenderIdentity(row.shotId);
          const after = rescored.ok ? rescored.scored.verdict.entries.find((e) => e.characterName === member.name)?.similarity ?? null : null;
          if (rescored.ok) {
            verdicts.set(row.shotId, { worst: rescored.scored.verdict.worst, entries: rescored.scored.verdict.entries });
          }
          row.after = after;
          row.verdict = shotRepairVerdict(row.before, after, before.bar);
          if (!rescored.ok) row.error = rescored.error;
        }
      } else if (!ra.ok) {
        reanchorError = ra.error;
      }
      // a stood-down beat keeps the re-render verdicts: the reference
      // did not move, so re-judging the same pixels against the same
      // sheet would be variance double-dipping, not repair
    }

    // THE REPAIR JOINS THE ARC (iteration 146; the append now rides
    // BEFORE the after-snapshot, 233): this member's worked shots
    // append to the identity arc - real production readings of the
    // work, the same shape the night rescore appends (the shot's
    // whole cast verdict, worst included), ref-chained to the work by
    // the append itself. A shot worked by several members appends
    // once per freshest verdict - the fold keeps the last. Riding
    // the arc instrument the append must land before the after read
    // or the after would answer without the repair night in the roll.
    for (const t of targets) {
      const v = verdicts.get(t.shotId);
      if (!v) continue; // no score, no arc row - the miss is named in the ledger
      await appendIdentityArcReading(
        {
          projectId,
          shotId: t.shotId,
          source: "RENDER",
          night,
          cohort,
          worst: v.worst,
          scores: v.entries,
        },
        { receiptPath },
      );
    }

    // the standing after this member's shots were re-judged - off the
    // SAME instrument the before rode (the door is one door)
    const afterDoor = ridingTheMap
      ? await castArcMeasurement(projectId, mapEpisodeId, { receiptPath: opts?.receiptPath })
      : { instrument: "sweep" as const, measurement: await castIdentityMeasurement(projectId, "RENDER") };
    const afterSnap = memberSnapshot(afterDoor.measurement, member.characterId);
    rows.push({
      characterId: member.characterId,
      name: member.name,
      before: { standing: member.standing, average: member.average, worst: member.worst, worstRef: member.worstRef },
      dna,
      shots: shotRows,
      ...(carryByName.has(member.name) ? { carriedAcceptance: carryByName.get(member.name) } : {}),
      reanchored,
      ...(reanchorError ? { reanchorError } : {}),
      ...(reanchorAttempts !== undefined ? { reanchorAttempts } : {}),
      ...(reanchorNote !== undefined ? { reanchorNote } : {}),
      after: afterSnap,
      verdict: memberRepairVerdict(shotRows),
    });

    // ANIMEOS 5.0 - THE CHARACTER IS ONE ASSET (iteration 95): the
    // validation profile's judge is THE READINGS (rule 69) - the
    // pass writes the member's verdict summary onto their
    // CharacterAsset row; an asset stays COMPILED until the
    // readings clear the bar, VALIDATED when they do. A store miss
    // is named, never hidden.
    try {
      const landed = await recordCharacterAssetReadings(projectId, member.characterId, {
        at: new Date().toISOString(),
        source: "RENDER",
        bar: before.bar,
        before: { average: member.average, worst: member.worst },
        after: { standing: afterSnap.standing, average: afterSnap.average, worst: afterSnap.worst, worstRef: afterSnap.worstRef },
        verdict: memberRepairVerdict(shotRows),
        shots: shotRows.map((s) => ({ ref: s.ref, before: s.before, after: s.after, verdict: s.verdict })),
      });
      console.log(`[character-asset] ${member.name}: ${landed.note}`);
    } catch (err) {
      console.log(`[character-asset] ${member.name}: the validation write failed - ${err instanceof Error ? err.message : "unknown"}`);
    }

  }

  const after = ridingTheMap
    ? (await castArcMeasurement(projectId, mapEpisodeId, { receiptPath: opts?.receiptPath })).measurement
    : await castIdentityMeasurement(projectId, "RENDER");

  // THE AFTER-STANDING ANSWERS THE GATE'S OWN INSTRUMENT: the worked
  // shots' distinct episodes, read through episodeReleaseVerdict off
  // the SAME receipt path the appends rode - the repair's ledger and
  // the release verdict are one instrument from here on.
  const workedShotIds = [...verdicts.keys()];
  const workedShots = await db.shot.findMany({
    where: { id: { in: workedShotIds } },
    select: { id: true, scene: { select: { episodeId: true, episode: { select: { number: true } } } } },
  });
  const episodeIds = [...new Set(workedShots.map((s) => s.scene.episodeId))];
  const arcAfter: Array<EpisodeReleaseRead & { episodeNumber: number | null }> = [];
  for (const epId of episodeIds) {
    const read = await episodeReleaseVerdict(projectId, epId, "RENDER", { receiptPath });
    const epNumber = workedShots.find((s) => s.scene.episodeId === epId)?.scene.episode.number ?? null;
    arcAfter.push({ ...read, episodeNumber: epNumber });
  }

  const result: RepairPassResult = {
    projectId,
    source: "RENDER",
    bar: before.bar,
    members: rows,
    before: standingSnapshot(before),
    after: standingSnapshot(after),
    night,
    arcAfter,
    instrument,
    ...(ridingTheMap ? { episodeId: mapEpisodeId } : {}),
    workOrder: { namedRefs, unnamedRefs: namedRefs.filter((r) => !carriedRefs.has(r)) },
  };

  // the loop's landing: one production event carrying the ledger
  if (rows.length > 0) {
    await db.productionEvent.create({
      data: {
        projectId,
        actor: "DSH",
        type: "IDENTITY_REPAIR",
        summary: `Identity repair pass (${instrument === "arc" ? "the arc's union - the gate's own instrument" : "the sweep"}${ridingTheMap ? ", riding the release review's map" : ""}): ${rows.length} below member(s) worked - ${rows.filter((r) => r.verdict === "REPAIRED").length} repaired, ${rows.filter((r) => r.verdict === "IMPROVED").length} improved, ${rows.filter((r) => r.verdict === "STILL_BELOW").length} still below; standing ${standingSnapshot(before).below} below -> ${standingSnapshot(after).below} below at bar ${Math.round(before.bar * 100)}%`,
        payload: JSON.stringify({
          bar: before.bar,
          instrument,
          ...(ridingTheMap ? { episodeId: mapEpisodeId } : {}),
          workOrder: result.workOrder,
          before: standingSnapshot(before),
          after: standingSnapshot(after),
          members: rows.map((r) => ({
            name: r.name,
            dna: r.dna,
            ...(r.carriedAcceptance ? { carriedAcceptance: r.carriedAcceptance } : {}),
            reanchored: r.reanchored,
            ...(r.reanchorAttempts !== undefined ? { reanchorAttempts: r.reanchorAttempts } : {}),
            ...(r.reanchorNote !== undefined ? { reanchorNote: r.reanchorNote } : {}),
            verdict: r.verdict,
            shots: r.shots.map((s) => ({ ref: s.ref, before: s.before, after: s.after, verdict: s.verdict, error: s.error })),
          })),
        }),
      },
    });
  }

  return result;
}

/** The sheet read as one adherence line (read-shaped, for the ledger) -
 * THE SILHOUETTE SHAPES THE MESH: the shaping the sheet's own
 * silhouette sentence compiles into rides the line when it applies;
 * THE FACE IS SCULPTED, NOT ASSEMBLED: the face family's bounded
 * profile rides it too; THE SURFACE IS GRADED, NOT PAINTED: the
 * material grade compiled from the read's own hexes rides with them. */
function adherenceLineFromRead(name: string, read: { hairStyle: unknown; hairColor: unknown; robeColor: unknown; robeAccent: unknown; skinTone: unknown; weaponType: unknown; build: unknown; beard: unknown; silhouette: unknown; faceShape?: unknown }): string {
  const owned: string[] = [];
  if (read.hairStyle !== null) owned.push("hairStyle");
  if (read.hairColor !== null) owned.push("hairColor");
  if (read.robeColor !== null) owned.push("robeColor");
  if (read.robeAccent !== null) owned.push("robeAccent");
  if (read.skinTone !== null) owned.push("skinTone");
  if (read.weaponType !== null) owned.push("weaponType");
  if (read.build !== null) owned.push("build");
  if (read.beard !== null) owned.push("beard");
  if (read.faceShape !== null && read.faceShape !== undefined) owned.push("faceShape");
  const shape = parseSilhouetteShape(typeof read.silhouette === "string" ? read.silhouette : null, typeof read.build === "string" ? read.build : null);
  const shapeLine = silhouetteShapeLine(shape);
  const face = parseFaceProfile(typeof read.faceShape === "string" ? read.faceShape : null, typeof read.build === "string" ? read.build : null);
  const faceLine = faceProfileLine(face);
  const materials = parseMaterialProfile(typeof read.skinTone === "string" ? read.skinTone : null, typeof read.robeColor === "string" ? read.robeColor : null, typeof read.hairColor === "string" ? read.hairColor : null);
  const materialLine = materialProfileLine(materials);
  // THE HAIR IS GROOMED (iteration 85): the read's own silhouette
  // sentence directs the hair's groom - the line rides the ledger too
  const groom = parseGroomProfile(typeof read.silhouette === "string" ? read.silhouette : null, typeof read.hairStyle === "string" ? read.hairStyle : null);
  const groomLine = groomProfileLine(groom);
  return owned.length > 0
    ? `${name}: sheet-adherent build (${owned.join(", ")} from the sheet read; palette pull 0.75; ${shapeLine}; ${faceLine}; ${materialLine}; ${groomLine})`
    : `${name}: guess build (regex DNA only) - the sheet read landed nothing usable`;
}
