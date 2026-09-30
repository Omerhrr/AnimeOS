/**
 * performance - THE COST IS NAMED (iteration 100, rule 75, the
 * forty-fourth law) and THE LEDGERS RIDE THE SPINE (iteration 101):
 * the nightly render read and the release spine now consume these
 * verdicts - a render night reads its cost line back with the OVER
 * regressions NAMING WHAT RODE THE RENDER (the shot's directed
 * cargo + the top telemetry spans + the fix lineage), and the
 * release spine gates a publish on the identity matrix's verdict.
 *
 * The pipeline spent ninety-nine iterations proving the FRAMES are
 * right (the laws that shape them, the hashes that pin them, the
 * readings that judge them) and never once named what the frames
 * COST: every finished render job carries its measured wall clock
 * (startedAt -> finishedAt) and its per-provider telemetry spans,
 * and nothing reads them back - a shot that renders three times its
 * siblings' cost slides through as just another finished row, and
 * the pipeline cannot tell a healthy night from a degrading one.
 *
 * The law: every finished job earns a READING - the measured wall,
 * the frames it owed (the worker's own clamped frame law mirrored
 * bit-exactly: duration clamped 0.8..30s, fps clamped 1..60 at the
 * default 24, frames = max(2, round(duration * fps))), and the
 * SECONDS PER FRAME the job actually spent. The budget is not
 * invented - it is what the pipeline has PROVEN: each job is judged
 * against its own cohort (the finished jobs of the same driver and
 * mode, whose costs are comparable by construction):
 *
 *   HOLDS    - spf <= 2x the cohort's median: the pipeline's
 *              ordinary cost (a job alone holds its own budget -
 *              a regression needs a cohort to be a regression).
 *   SLOW     - <= 3x the median: the tail, named and watched.
 *   OVER     - > 3x the median: the regression names itself.
 *   UNSCORED - nothing to read (the job never finished, or owed
 *              no frames): named, never guessed.
 *
 * The reading carries the WHOLE spend honestly: the wall (queue,
 * orchestration and render together - what the production actually
 * waited), the telemetry's own totalMs (what the providers
 * accounted), and the difference named as the wait. Per cohort the
 * engine rolls median/p10 (nearest-rank, the matrix's own percentile
 * law)/worst/best spf, the total frames and the total wall minutes.
 * Pure laws + loader, all exported for the E2E.
 */

import { db } from "@/lib/db";

// ── the frames law (mirrored bit-exactly from the worker) ──

export const PERF_DURATION_MIN = 0.8;
export const PERF_DURATION_MAX = 30.0;
export const PERF_FPS_MIN = 1;
export const PERF_FPS_MAX = 60;
export const PERF_FPS_DEFAULT = 24;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Python's round() - half to even (the worker's own rounding: a
 *  .5 boundary lands on the even neighbor, never up by habit). */
function pyRound(v: number): number {
  const floor = Math.floor(v);
  const diff = v - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * The frames a shot owes, by the worker's own law (animeos_bridge.py:
 * duration_sec = clamp(float(duration), 0.8, 30.0) at the default 3.0,
 * fps = clamp(int(project.fps), 1, 60) at the default 24 - int()
 * truncates, and Python's round() rounds half to EVEN (pyRound),
 * both mirrored here),
 * frames_total = max(2, round(duration_sec * fps)). The cost
 * question is about the frames the worker ACTUALLY renders, so the
 * clamped law is the one this engine mirrors. Pure - the E2E
 * asserts exact values including the clamps and the even boundary.
 */
export function performanceFrames(durationSec: number | null | undefined, fps: number | null | undefined): number {
  // the worker's `or`-fallbacks: duration 0 falls back to 3.0, an
  // fps whose int() truncates to 0 falls back to 24 (0 is falsy)
  const dRaw = typeof durationSec === "number" && Number.isFinite(durationSec) ? (durationSec || 3.0) : 3.0;
  const fRaw = typeof fps === "number" && Number.isFinite(fps) ? fps : PERF_FPS_DEFAULT;
  const d = clamp(dRaw, PERF_DURATION_MIN, PERF_DURATION_MAX);
  const t = Math.trunc(fRaw);
  const f = clamp(t === 0 ? PERF_FPS_DEFAULT : t, PERF_FPS_MIN, PERF_FPS_MAX);
  return Math.max(2, pyRound(d * f));
}

// ── the reading + the cohort-relative verdict law ──

export type PerformanceVerdict = "HOLDS" | "SLOW" | "OVER" | "UNSCORED";

/** What one provider (or the orchestrator) accounted, from the job's
 *  telemetry JSON: {spans: [{provider, ms, note?}], totalMs, ...}. */
export interface PerfTelemetry {
  spans: Array<{ provider: string; ms: number; note?: string }>;
  totalMs: number | null;
}

export interface PerformanceReading {
  jobId: string;
  shotId: string | null;
  ref: string | null; // E<ep> Sc<scene> S<shot> when the shot chain exists
  mode: string; // PREVIEW | FINAL
  driver: string; // BLENDER_LOCAL | MOTION | SIMULATOR | ...
  status: string; // REVIEW | APPROVED | NEEDS_REVISION | FAILED | ...
  attempt: number;
  fixOfJobId: string | null;
  measuredMs: number; // finishedAt - startedAt (the whole spend)
  telemetryMs: number | null; // the providers' own accounting
  waitMs: number | null; // measured - telemetry (queue + orchestration)
  frames: number; // the frames the job owed (the worker's law)
  spf: number; // seconds per frame: measuredMs / 1000 / frames
  verdict: PerformanceVerdict; // filled by the cohort law
  cargo: string | null; // what rode the render (the shot's directed cargo, iteration 101)
  topSpans: Array<{ provider: string; ms: number }>; // the top telemetry spans, worst-first
  finishedAt: string; // ISO - the night window reads it
}

export interface PerformanceCohort {
  driver: string;
  mode: string;
  n: number;
  medianSpf: number;
  p10Spf: number; // nearest-rank (the matrix's own percentile law)
  worstSpf: number;
  bestSpf: number;
  totalFrames: number;
  totalWallMs: number;
  readings: PerformanceReading[]; // worst spf first
}

export interface PerformanceReport {
  finished: number; // finished jobs read
  measured: number; // readings with a positive wall + frames
  cohorts: PerformanceCohort[]; // worst median first
  overall: { medianSpf: number | null; p10Spf: number | null; worstSpf: number | null; bestSpf: number | null; totalFrames: number; totalWallMs: number };
  over: PerformanceReading[]; // the regressions, worst first
  slow: PerformanceReading[]; // the watched tail, worst first
}

/** The cohort key: the driver and mode own the cost curve. */
export function performanceCohortKey(r: Pick<PerformanceReading, "driver" | "mode">): string {
  return `${r.driver}|${r.mode}`;
}

function parseTelemetry(raw: string | null | undefined): PerfTelemetry {
  if (!raw) return { spans: [], totalMs: null };
  try {
    const parsed = JSON.parse(raw) as { spans?: unknown; totalMs?: unknown };
    const spans = Array.isArray(parsed.spans)
      ? parsed.spans
          .map((s) => s as { provider?: unknown; ms?: unknown; note?: unknown })
          .filter((s) => typeof s.ms === "number" && Number.isFinite(s.ms))
          .map((s) => ({ provider: String(s.provider ?? "unknown"), ms: s.ms as number, note: s.note === undefined ? undefined : String(s.note) }))
      : [];
    const totalMs = typeof parsed.totalMs === "number" && Number.isFinite(parsed.totalMs) ? parsed.totalMs : null;
    return { spans, totalMs };
  } catch {
    return { spans: [], totalMs: null };
  }
}

/**
 * The readings (pure): one per finished job with a positive wall.
 * The wall is finishedAt - startedAt (the production's whole wait);
 * the wait is the wall minus the providers' own totalMs, named raw
 * (a negative wait means the span accounting overlaps the wall -
 * named, not clamped). Unfinished jobs and zero-walls read
 * UNSCORED-thin: they never became a reading (nothing was spent to
 * read), but the finished count names them.
 */
export function performanceReadings(jobs: Array<{
  id: string; shotId: string | null; ref: string | null; mode: string; driver: string;
  status: string; attempt: number; fixOfJobId: string | null;
  startedAt: Date | string | null; finishedAt: Date | string | null;
  telemetry: string | null; durationSec: number | null; fps: number | null;
  grammar?: string | null; fx?: string | null; physics?: string | null;
  dialogue?: string | null; lipNote?: string | null;
}>): PerformanceReading[] {
  const readings: PerformanceReading[] = [];
  for (const j of jobs) {
    if (!j.startedAt || !j.finishedAt) continue;
    const start = new Date(j.startedAt).getTime();
    const end = new Date(j.finishedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= 0) continue;
    const measuredMs = end - start;
    const tel = parseTelemetry(j.telemetry);
    const frames = performanceFrames(j.durationSec, j.fps);
    readings.push({
      jobId: j.id,
      shotId: j.shotId,
      ref: j.ref,
      mode: j.mode,
      driver: j.driver,
      status: j.status,
      attempt: j.attempt,
      fixOfJobId: j.fixOfJobId,
      measuredMs,
      telemetryMs: tel.totalMs,
      waitMs: tel.totalMs === null ? null : measuredMs - tel.totalMs,
      frames,
      spf: measuredMs / 1000 / frames,
      verdict: "UNSCORED",
      cargo: performanceCargo({
        grammar: j.grammar ?? null,
        fx: j.fx ?? null,
        physics: j.physics ?? null,
        dialogue: j.dialogue ?? null,
        lipNote: j.lipNote ?? null,
      }),
      topSpans: topSpans(tel.spans),
      finishedAt: new Date(end).toISOString(),
    });
  }
  return readings;
}

/** The median, the classic one (odd: the middle; even: the two
 *  middles averaged). Sorted input expected. */
function medianOf(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** The nearest-rank p10 on sorted-ascending input (the matrix's own
 *  percentile law - one percentile across both ledgers). */
function p10Of(sorted: number[]): number {
  return sorted[Math.min(sorted.length, Math.ceil(0.1 * sorted.length)) - 1];
}

/**
 * The verdict law (pure): the budget is the cohort's own median -
 * what the pipeline has proven for this driver and mode, never an
 * invented constant. HOLDS at 2x, SLOW at 3x, OVER beyond; a cohort
 * of one holds its own budget (a regression needs a cohort to be a
 * regression). Boundary law: exactly 2x HOLDS, exactly 3x SLOW.
 */
export function performanceVerdict(spf: number, cohortMedianSpf: number | null): PerformanceVerdict {
  if (cohortMedianSpf === null || !Number.isFinite(cohortMedianSpf) || cohortMedianSpf <= 0) return "UNSCORED";
  if (spf <= 2 * cohortMedianSpf) return "HOLDS";
  if (spf <= 3 * cohortMedianSpf) return "SLOW";
  return "OVER";
}

/**
 * The cohorts (pure): group the readings by driver+mode, roll each
 * cohort's shape (median/p10/worst/best spf, total frames, total
 * wall), judge every reading against its own cohort's median, order
 * the readings worst-spf first, the cohorts worst-median first.
 */
export function performanceCohorts(readings: PerformanceReading[]): PerformanceCohort[] {
  const byKey = new Map<string, PerformanceReading[]>();
  for (const r of readings) {
    const key = performanceCohortKey(r);
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  const cohorts: PerformanceCohort[] = [];
  for (const [key, list] of byKey) {
    const spfs = list.map((r) => r.spf).sort((a, b) => a - b);
    const median = medianOf(spfs);
    const [driver, mode] = key.split("|");
    const ordered = [...list].sort((a, b) => b.spf - a.spf);
    for (const r of ordered) r.verdict = performanceVerdict(r.spf, median);
    cohorts.push({
      driver,
      mode,
      n: list.length,
      medianSpf: median,
      p10Spf: p10Of(spfs),
      worstSpf: spfs[spfs.length - 1],
      bestSpf: spfs[0],
      totalFrames: list.reduce((a, r) => a + r.frames, 0),
      totalWallMs: list.reduce((a, r) => a + r.measuredMs, 0),
      readings: ordered,
    });
  }
  cohorts.sort((a, b) => b.medianSpf - a.medianSpf);
  return cohorts;
}

// ── what rode the render (the cargo law, iteration 101) ──

export interface PerfCargoInput {
  grammar: string | null; // shot.grammar - JSON beats [{move, from, to, ...}]
  fx: string | null; // shot.fx - JSON [{kind, ...}]
  physics: string | null; // shot.physics - JSON [{kind, ...}]
  dialogue: string | null; // shot.dialogue - JSON [{kind, text, ...}]
  lipNote: string | null; // job.lipNote - the lip-sync note stamped at submit
}

function jsonCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0; // a corrupt column reads as nothing named - never guessed
  }
}

/**
 * WHAT RODE THE RENDER (pure): the directed cargo the job carried,
 * read from the shot's own persisted columns - the grammar beats the
 * camera and body obey, the fx passes, the solver calls, the speech
 * lines and the lip-sync note the submit stamped. A job with nothing
 * directed reads null ("the stock pass") - the cargo is never
 * invented. The OVER regression names this: a shot does not cost
 * three times its cohort for nothing, and the ledger says what the
 * extra seconds were SPENT ON.
 */
export function performanceCargo(input: PerfCargoInput): string | null {
  const beats = jsonCount(input.grammar);
  const fx = jsonCount(input.fx);
  const physics = jsonCount(input.physics);
  let speech = 0;
  if (input.dialogue) {
    try {
      const parsed = JSON.parse(input.dialogue) as Array<{ kind?: unknown }>;
      if (Array.isArray(parsed)) speech = parsed.filter((l) => l.kind === "SPEECH").length;
    } catch {
      speech = 0;
    }
  }
  const lip = Boolean(String(input.lipNote ?? "").trim());
  const parts: string[] = [];
  if (beats > 0) parts.push(`${beats} grammar beat(s)`);
  if (fx > 0) parts.push(`${fx} fx`);
  if (physics > 0) parts.push(`${physics} solver call(s)`);
  if (speech > 0) parts.push(`speech ${speech} line(s)`);
  if (lip) parts.push("lip-sync");
  return parts.length > 0 ? parts.join(", ") : null;
}

/** The job's top telemetry spans (the providers that actually worked
 *  it), worst-first, capped at 3 - the cost's own anatomy. */
function topSpans(spans: PerfTelemetry["spans"]): Array<{ provider: string; ms: number }> {
  return [...spans].sort((a, b) => b.ms - a.ms).slice(0, 3).map((s) => ({ provider: s.provider, ms: s.ms }));
}

/**
 * THE REPORT (pure): the production's cost ledger - the cohorts,
 * the overall shape, the OVER regressions and the SLOW tail named
 * worst-first. Pure - the E2E asserts it over crafted readings.
 */
export function performanceReport(readings: PerformanceReading[]): PerformanceReport {
  const cohorts = performanceCohorts(readings);
  const spfs = readings.map((r) => r.spf).sort((a, b) => a - b);
  return {
    finished: readings.length,
    measured: readings.length,
    cohorts,
    overall: {
      medianSpf: spfs.length ? medianOf(spfs) : null,
      p10Spf: spfs.length ? p10Of(spfs) : null,
      worstSpf: spfs.length ? spfs[spfs.length - 1] : null,
      bestSpf: spfs.length ? spfs[0] : null,
      totalFrames: readings.reduce((a, r) => a + r.frames, 0),
      totalWallMs: readings.reduce((a, r) => a + r.measuredMs, 0),
    },
    over: readings.filter((r) => r.verdict === "OVER").sort((a, b) => b.spf - a.spf),
    slow: readings.filter((r) => r.verdict === "SLOW").sort((a, b) => b.spf - a.spf),
  };
}

// ── the honest line ──

function spf(v: number | null): string {
  return v === null ? "-" : `${v.toFixed(2)}s/f`;
}

function ms(v: number): string {
  return v >= 60000 ? `${(v / 60000).toFixed(1)}min` : `${(v / 1000).toFixed(0)}s`;
}

/**
 * The report as one honest ledger line (the DSH read): the overall
 * shape, each cohort's median/p10/worst with its totals, and the
 * named regressions.
 */
export function performanceLine(r: PerformanceReport): string {
  if (r.measured === 0) {
    return "performance: nothing measured yet - no finished job carries a positive wall clock (render a shot, then the engine reads the cost)";
  }
  const cohortLines = r.cohorts.map((c) => {
    const over = c.readings.filter((x) => x.verdict === "OVER").length;
    const slow = c.readings.filter((x) => x.verdict === "SLOW").length;
    const tail = over > 0 ? `, ${over} OVER` : slow > 0 ? `, ${slow} SLOW` : "";
    return `${c.driver}/${c.mode}: ${c.n} job(s), median ${spf(c.medianSpf)}, p10 ${spf(c.p10Spf)}, worst ${spf(c.worstSpf)}, ${c.totalFrames} frame(s), ${ms(c.totalWallMs)}${tail}`;
  });
  const regressions = r.over.length > 0
    ? `over: ${r.over.map((x) => performanceCargoLine(x)).join("; ")}`
    : "no regressions - every job holds its cohort's proven cost";
  return `performance over ${r.measured} finished job(s): median ${spf(r.overall.medianSpf)}, p10 ${spf(r.overall.p10Spf)}, worst ${spf(r.overall.worstSpf)}, ${r.overall.totalFrames} frame(s), ${ms(r.overall.totalWallMs)} wall | ${cohortLines.join(" | ")} | ${regressions}`;
}

/**
 * What ONE regression rode to its cost (pure): the ref, the verdict
 * numbers, the fix lineage, the directed cargo and the top spans -
 * the OVER line's full anatomy. The regression names WHAT the extra
 * seconds were spent on, not just that they were spent.
 */
export function performanceCargoLine(r: PerformanceReading): string {
  const wall = ms(r.measuredMs);
  const fix = r.fixOfJobId ? `, fix of attempt ${r.attempt - 1 < 1 ? 1 : r.attempt - 1}` : "";
  const spans = (r.topSpans ?? []).length > 0
    ? `; spans: ${(r.topSpans ?? []).map((s) => `${s.provider} ${ms(s.ms)}`).join(" > ")}`
    : "";
  const cargo = r.cargo ? `; rode: ${r.cargo}` : "; rode: the stock pass (no directed cargo)";
  const wait = r.waitMs === null || r.waitMs === undefined ? "" : `, wait ${ms(Math.max(0, r.waitMs))}`;
  return `${r.ref ?? r.jobId.slice(-6)} at ${spf(r.spf)} (${r.mode.toLowerCase()} ${r.driver.toLowerCase()}, ${wall} wall, ${r.frames} frame(s)${wait}${fix})${cargo}${spans}`;
}

/**
 * THE RENDER NIGHT LINE (pure): what the nightly supervision fire
 * reads back - the night's own window (jobs finished inside it) over
 * the whole proven ledger, the OVER regressions NAMING WHAT RODE THE
 * RENDER, the SLOW tail counted. Empty string when nothing was ever
 * measured (the honest absence - the fire report simply skips it).
 */
export function performanceNightLine(r: PerformanceReport, windowHours = 24, now: Date = new Date()): string {
  if (r.measured === 0) return "";
  const since = now.getTime() - windowHours * 3600 * 1000;
  const nightJobs = r.cohorts.flatMap((c) => c.readings).filter((x) => new Date(x.finishedAt).getTime() >= since);
  const nightMs = nightJobs.reduce((a, x) => a + x.measuredMs, 0);
  const nightFrames = nightJobs.reduce((a, x) => a + x.frames, 0);
  const night = nightJobs.length > 0
    ? `${nightJobs.length} finished in the last ${windowHours}h (${ms(nightMs)} wall, ${nightFrames} frame(s))`
    : `nothing finished in the last ${windowHours}h`;
  const over = r.over.length > 0
    ? `over: ${r.over.map((x) => performanceCargoLine(x)).join("; ")}`
    : "no regressions - every job holds its cohort's proven cost";
  const slow = r.slow.length > 0 ? `; slow tail: ${r.slow.length} job(s) watched` : "";
  return `night cost read: ${night}; ledger median ${spf(r.overall.medianSpf)}, worst ${spf(r.overall.worstSpf)} - ${over}${slow}`;
}

// ── the loader (the production's REAL finished jobs, read) ──

/**
 * Read the production's finished render jobs into the cost ledger.
 * A job is finished when finishedAt stands (REVIEW, APPROVED,
 * NEEDS_REVISION, FAILED - a failed attempt's wall was still spent,
 * the status rides the reading honestly). The frames come from the
 * worker's own clamped law over the shot's duration and the
 * project's fps; the telemetry's spans ride as evidence. No new
 * renders here - the cost was already paid; this names it.
 */
export async function performanceData(projectId: string): Promise<PerformanceReport> {
  const rows = await db.renderJob.findMany({
    where: { projectId, finishedAt: { not: null } },
    include: {
      shot: {
        include: {
          scene: { include: { episode: { include: { season: { select: { number: true } } } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const fpsRow = await db.project.findUnique({ where: { id: projectId }, select: { fps: true } });
  const fps = fpsRow?.fps ?? PERF_FPS_DEFAULT;
  const readings = performanceReadings(rows.map((j) => ({
    id: j.id,
    shotId: j.shotId,
    ref: j.shot
      ? `E${j.shot.scene.episode.number} Sc${j.shot.scene.number} S${String(j.shot.number).padStart(3, "0")}`
      : null,
    mode: j.mode,
    driver: j.driver,
    status: j.status,
    attempt: j.attempt,
    fixOfJobId: j.fixOfJobId,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    telemetry: j.telemetry,
    durationSec: j.shot?.duration ?? null,
    fps,
    grammar: j.shot?.grammar ?? null,
    fx: j.shot?.fx ?? null,
    physics: j.shot?.physics ?? null,
    dialogue: j.shot?.dialogue ?? null,
    lipNote: j.lipNote ?? null,
  })));
  return performanceReport(readings);
}
