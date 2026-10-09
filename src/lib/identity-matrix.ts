/**
 * identity-matrix - THE DISTRIBUTION IS THE RELEASE (iteration 99,
 * rule 74, the forty-third law).
 *
 * The readings so far answered two questions with point statistics:
 * the bar measurement (average and worst across the production) and
 * the cast standing (per member: any reading under the bar puts the
 * member BELOW - one drifted shipping frame is a work order). Both
 * are honest, and both are BLIND TO SHAPE: forty readings at 85% and
 * one at 5% read as "worst 5%" - the same headline as forty at 85%
 * and one at 84% - though the first is a dip to be repaired and the
 * second is a distribution on the edge. The release question was
 * answered by the harshest judge available because no kinder judge
 * existed.
 *
 * The law: the readings are A DISTRIBUTION, and the matrix slices
 * them along the five axes the lens and the stage actually vary -
 *
 *   framing    x yaw        x expression  x lighting   x state
 *   (close/      (yawing/     (the eight     (the light    (the pose
 *    med/wide)    traveling/   emotions the   families      the body
 *                 locked)      face performs) the words     opens in)
 *                                             name)
 *
 * Every cell of every axis carries its own distribution - n, mean,
 * median, p10 (nearest-rank: the reading the worst tenth of the cell
 * sits at or under), worst, best - and every cell names the shot ref
 * its worst reading came from. The RELEASE FLOOR is judged
 * distributionally:
 *
 *   RELEASE - p10 >= floor AND mean >= floor: the tail and the body
 *             both clear; the distribution holds the floor.
 *   HOLD    - the body clears (mean >= floor AND median >= floor)
 *             but the tail dips (p10 < floor): the release waits,
 *             the dipping cells are named, never averaged away.
 *   BELOW   - the body itself sits under (mean < floor OR median <
 *             floor): the distribution is under the floor.
 *   UNSCORED- nothing measured: named, never guessed.
 *
 * The standing law stands UNTOUCHED beside this (rule 69): any
 * reading under the bar still puts its member BELOW and still names
 * the work order - the matrix does not soften the teeth, it adds the
 * release view: a production can hold members BELOW for one dipped
 * wide shot while its closeup distribution - the frames the audience
 * actually reads the face on - RELEASES. The matrix names both
 * truths at once. Pure law + loader, both exported for the E2E.
 */

import { db } from "@/lib/db";
import { IDENTITY_RENDER_THRESHOLD, IDENTITY_REPAINT_THRESHOLD, type IdentitySource, type IdentityScoreEntry } from "@/lib/identity";
import { parseExpressionClip } from "@/lib/blender/expressions";
import { IDENTITY_ARC_MIN_NIGHTS, arcMedianRows, readIdentityArcEpisode } from "@/lib/identity-arc";

// ── the five axes, each bucketed purely from the shot's own data ──

/** The framing bucket: the lens family the shot names (the close
 *  list mirrors the groom's hero framings - the same shots the
 *  strand LOD grows the hero detail for are the shots the audience
 *  reads the face on). */
export const MATRIX_CLOSE_FRAMINGS: readonly string[] = ["CLOSEUP", "EXTREME_CLOSEUP", "MCU"];
export const MATRIX_WIDE_FRAMINGS: readonly string[] = ["WIDE", "WS", "ESTABLISHING", "OTS"];

export function identityFramingBucket(shotType: string | null | undefined): "close" | "med" | "wide" {
  const st = String(shotType ?? "").trim().toUpperCase();
  if (MATRIX_CLOSE_FRAMINGS.includes(st)) return "close";
  if (MATRIX_WIDE_FRAMINGS.includes(st)) return "wide";
  return "med";
}

/**
 * The yaw bucket: the camera's yaw behavior over the shot, read from
 * the movement grammar. ORBIT and PAN sweep the yaw axis (the face's
 * angle to camera changes under the lens); DOLLY_IN, TRACKING and
 * CRANE travel without yawing; STATIC (and an unnamed movement) holds
 * the lens locked. Deterministic, and honest to what the grammar
 * names - a missing movement reads locked, never guessed.
 */
export function identityYawBucket(movement: string | null | undefined): "yawing" | "traveling" | "locked" {
  const m = String(movement ?? "").trim().toUpperCase();
  if (m === "ORBIT" || m === "PAN") return "yawing";
  if (m === "DOLLY_IN" || m === "TRACKING" || m === "CRANE") return "traveling";
  return "locked";
}

/**
 * The lighting bucket: the light families the words name, scanned in
 * a fixed order (first family whose keyword appears owns the cell -
 * "Moonlight + storm clouds" reads storm, the strike the shot is
 * about; "moonlit night" reads night). An unknown (or absent) call
 * reads "unlit" - a bucket of its own, never folded into another.
 */
export const MATRIX_LIGHT_FAMILIES: ReadonlyArray<{ key: string; words: readonly string[] }> = [
  { key: "storm", words: ["lightning", "storm", "thunder", "rain"] },
  { key: "fire", words: ["fire", "torch", "candle", "ember", "flame"] },
  { key: "dawn", words: ["dawn", "sunrise", "morning"] },
  { key: "dusk", words: ["dusk", "sunset", "twilight", "golden"] },
  { key: "night", words: ["night", "moon", "midnight"] },
  { key: "day", words: ["day", "sun", "noon"] },
  { key: "shadow", words: ["shadow", "dim", "dark"] },
  { key: "emission", words: ["emission", "aura", "glow", "rim", "neon", "energy"] },
];

export function identityLightingBucket(lighting: string | null | undefined): string {
  const s = String(lighting ?? "").trim().toLowerCase();
  if (!s) return "unlit";
  for (const family of MATRIX_LIGHT_FAMILIES) {
    if (family.words.some((w) => s.includes(w))) return family.key;
  }
  return "unlit";
}

/**
 * The state bucket: the pose the body opens in, as the director
 * staged it (the shot's own vocabulary entry, uppercased). An absent
 * pose reads "unset" - the shot never staged a state, and the matrix
 * does not invent one.
 */
export function identityStateBucket(poseStart: string | null | undefined): string {
  const p = String(poseStart ?? "").trim().toUpperCase();
  return p ? p : "unset";
}

/** The expression bucket: the SAME derivation the payload assembly
 *  rides (parseExpressionClip over the shot's own drama) - the
 *  emotion the face actually performs in the shot. */
export function identityExpressionBucket(
  description: string | null | undefined,
  poseStart: string | null | undefined,
  poseEnd: string | null | undefined,
): string {
  return parseExpressionClip(description, poseStart, poseEnd).emotion;
}

/** The five axes in their fixed order (the matrix's shape). */
export const MATRIX_AXES = ["framing", "yaw", "expression", "lighting", "state"] as const;
export type MatrixAxis = (typeof MATRIX_AXES)[number];

// ── the distribution law ──

export type DistributionVerdict = "RELEASE" | "HOLD" | "BELOW" | "UNSCORED";

/** One cell's distribution: the shape of its readings against the
 *  floor. p10 is NEAREST-RANK on the sorted-ascending readings (the
 *  reading at rank ceil(0.10 * n), 1-indexed) - for ten or fewer
 *  readings it IS the worst, and the law degrades to the strict
 *  judge exactly when the sample is too thin to do anything else.
 *  The median is the classic one (odd: the middle; even: the two
 *  middles averaged). Pure - the E2E asserts exact values. */
export interface MatrixDistribution {
  n: number;
  mean: number | null;
  median: number | null;
  p10: number | null;
  worst: number | null;
  best: number | null;
  belowFloor: number;
  belowFraction: number | null; // belowFloor / n, null when unmeasured
  verdict: DistributionVerdict;
}

export function identityDistribution(values: number[], floor: number): MatrixDistribution {
  const vals = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = vals.length;
  if (n === 0) {
    return { n: 0, mean: null, median: null, p10: null, worst: null, best: null, belowFloor: 0, belowFraction: null, verdict: "UNSCORED" };
  }
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 1 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
  const p10 = vals[Math.min(n, Math.ceil(0.1 * n)) - 1];
  const worst = vals[0];
  const best = vals[n - 1];
  const belowFloor = vals.filter((v) => v < floor).length;
  const verdict: DistributionVerdict =
    mean < floor || median < floor
      ? "BELOW"
      : p10 < floor
        ? "HOLD"
        : "RELEASE";
  return { n, mean, median, p10, worst, best, belowFloor, belowFraction: belowFloor / n, verdict };
}

// ── the rollup law (pure: pre-bucketed rows in, the matrix out) ──

/** One reading placed on the matrix: the entry's own similarity, the
 *  member it belongs to, the shot it was read on, and the five axis
 *  buckets that shot derives. The loader derives the buckets; the
 *  pure law only rolls. */
export interface MatrixReadingRow {
  characterId: string | null;
  characterName: string;
  similarity: number;
  shotId: string;
  ref: string;
  framing: string;
  yaw: string;
  expression: string;
  lighting: string;
  state: string;
}

/** One matrix cell: a bucket's distribution, the verdict the release
 *  floor earns it, and the shot ref its worst reading came from. */
export interface MatrixCell extends MatrixDistribution {
  key: string;
  worstRef: string | null;
}

export interface MatrixAxisTable {
  axis: MatrixAxis;
  cells: MatrixCell[]; // worst p10 first (the work order reading), then by key
}

export interface MemberMatrix {
  characterId: string | null;
  name: string;
  overall: MatrixCell;
  axes: MatrixAxisTable[]; // the member's own slice of every axis
}

export interface IdentityMatrixData {
  source: IdentitySource;
  floor: number;
  readings: number;
  cast: number; // members the readings were rolled for
  overall: MatrixCell;
  axes: MatrixAxisTable[]; // the production's slice of every axis
  members: MemberMatrix[]; // worst overall first
}

/** The bucket value a row carries for an axis. */
function axisValue(row: MatrixReadingRow, axis: MatrixAxis): string {
  return row[axis];
}

function makeCell(key: string, values: Array<{ similarity: number; ref: string }>, floor: number): MatrixCell {
  const dist = identityDistribution(values.map((v) => v.similarity), floor);
  let worstRef: string | null = null;
  if (dist.n > 0) {
    let worst = Infinity;
    for (const v of values) {
      if (v.similarity < worst) {
        worst = v.similarity;
        worstRef = v.ref;
      }
    }
  }
  return { key, ...dist, worstRef };
}

function cellOrder(a: MatrixCell, b: MatrixCell): number {
  const pa = a.p10 ?? 1;
  const pb = b.p10 ?? 1;
  return pa - pb || a.key.localeCompare(b.key);
}

function axisTable(rows: MatrixReadingRow[], axis: MatrixAxis, floor: number): MatrixAxisTable {
  const byKey = new Map<string, Array<{ similarity: number; ref: string }>>();
  for (const row of rows) {
    const key = axisValue(row, axis);
    const list = byKey.get(key);
    if (list) list.push({ similarity: row.similarity, ref: row.ref });
    else byKey.set(key, [{ similarity: row.similarity, ref: row.ref }]);
  }
  const cells: MatrixCell[] = [];
  for (const [key, values] of byKey) cells.push(makeCell(key, values, floor));
  cells.sort(cellOrder);
  return { axis, cells };
}

/**
 * THE MATRIX (pure): roll pre-bucketed readings into the overall
 * distribution, the five axis tables, and every member's own slice.
 * The overall cell's verdict is the production's release answer; the
 * members are ordered worst-overall first (the work order reading).
 */
export function identityMatrixFromRows(rows: MatrixReadingRow[], floor: number, source: IdentitySource = "RENDER"): IdentityMatrixData {
  const overall = makeCell("overall", rows.map((r) => ({ similarity: r.similarity, ref: r.ref })), floor);
  const axes = MATRIX_AXES.map((axis) => axisTable(rows, axis, floor));
  const byMember = new Map<string, MatrixReadingRow[]>();
  for (const row of rows) {
    const list = byMember.get(row.characterName);
    if (list) list.push(row);
    else byMember.set(row.characterName, [row]);
  }
  const members: MemberMatrix[] = [];
  for (const [name, memberRows] of byMember) {
    const first = memberRows[0];
    members.push({
      characterId: first.characterId,
      name,
      overall: makeCell(name, memberRows.map((r) => ({ similarity: r.similarity, ref: r.ref })), floor),
      axes: MATRIX_AXES.map((axis) => axisTable(memberRows, axis, floor)),
    });
  }
  members.sort((a, b) => (a.overall.p10 ?? 1) - (b.overall.p10 ?? 1) || a.name.localeCompare(b.name));
  return {
    source,
    floor,
    readings: rows.length,
    cast: members.length,
    overall,
    axes,
    members,
  };
}

// ── the honest line ──

function pct(v: number | null): string {
  return v === null ? "-" : `${(v * 100).toFixed(0)}%`;
}

function cellLine(cell: MatrixCell): string {
  const shape = `${cell.n} reading(s), mean ${pct(cell.mean)}, median ${pct(cell.median)}, p10 ${pct(cell.p10)}, worst ${pct(cell.worst)}${cell.worstRef ? ` at ${cell.worstRef}` : ""}`;
  if (cell.verdict === "UNSCORED") return `${cell.key} - nothing measured`;
  if (cell.verdict === "RELEASE") return `${cell.key} - RELEASES (${shape})`;
  if (cell.verdict === "HOLD") return `${cell.key} - HOLD, the tail dips (${shape}, ${cell.belowFloor} under the floor)`;
  return `${cell.key} - BELOW (${shape})`;
}

/**
 * The matrix as one honest ledger line (the DSH read): the release
 * verdict first, then each axis's worst cells by name, then every
 * member's own release answer.
 */
export function identityMatrixLine(m: IdentityMatrixData): string {
  const pctFloor = pct(m.floor);
  if (m.readings === 0) {
    return `identity matrix (${m.source.toLowerCase()} source, floor ${pctFloor}): nothing measured - score the renders first (measure_identity_bar / scoreProjectIdentity), then the matrix reads the distribution`;
  }
  const axisLines = m.axes.map((t) => {
    const worstCells = t.cells.filter((c) => c.verdict !== "RELEASE").slice(0, 2);
    const named = worstCells.length > 0
      ? worstCells.map((c) => cellLine(c)).join(" | ")
      : `all ${t.cells.length} cell(s) RELEASE`;
    return `${t.axis}: ${named}`;
  });
  const memberLines = m.members.map((mem) => {
    if (mem.overall.verdict === "UNSCORED") return `${mem.name} - unscored`;
    if (mem.overall.verdict === "RELEASE") return `${mem.name} - RELEASES (${mem.overall.n} reading(s), p10 ${pct(mem.overall.p10)}, worst ${pct(mem.overall.worst)})`;
    if (mem.overall.verdict === "HOLD") return `${mem.name} - HOLD (p10 ${pct(mem.overall.p10)} under the floor, mean ${pct(mem.overall.mean)})`;
    return `${mem.name} - BELOW (mean ${pct(mem.overall.mean)}, median ${pct(mem.overall.median)})`;
  });
  const releaseWord = m.overall.verdict === "RELEASE" ? "RELEASES" : m.overall.verdict === "HOLD" ? "HOLDS" : "SITS BELOW";
  return [
    `identity matrix (${m.source.toLowerCase()} source, floor ${pctFloor}, ${m.readings} reading(s) over ${m.cast} member(s)): the production ${releaseWord} - mean ${pct(m.overall.mean)}, median ${pct(m.overall.median)}, p10 ${pct(m.overall.p10)}, worst ${pct(m.overall.worst)}${m.overall.worstRef ? ` at ${m.overall.worstRef}` : ""}`,
    ...axisLines,
    memberLines.length > 0 ? `members: ${memberLines.join(" | ")}` : "members: none scored",
  ].join(" | ");
}

// ── the loaders (the production's REAL readings, rolled) ──

/** The structural shape a loaded IdentityScore row must carry (the
 *  prisma include chain both loaders share). */
interface ScoreRowWithShot {
  shotId: string;
  scores: string;
  shot: {
    number: number;
    shotType: string | null;
    movement: string | null;
    description: string | null;
    poseStart: string | null;
    poseEnd: string | null;
    lighting: string | null;
    scene: { number: number; episode: { number: number } };
  };
}

/** The shared row mapper: persisted IdentityScore rows -> matrix
 *  rows (the five buckets derived per reading from its own shot). */
function scoreRowsToMatrixRows(scoreRows: ScoreRowWithShot[], idByName: Map<string, string>): MatrixReadingRow[] {
  const rows: MatrixReadingRow[] = [];
  for (const row of scoreRows) {
    let entries: IdentityScoreEntry[] = [];
    try {
      const parsed = JSON.parse(row.scores);
      if (Array.isArray(parsed)) entries = parsed as IdentityScoreEntry[];
    } catch {
      entries = [];
    }
    const ref = `E${row.shot.scene.episode.number} Sc${row.shot.scene.number} S${String(row.shot.number).padStart(3, "0")}`;
    for (const entry of entries) {
      const name = String(entry.characterName ?? "").trim();
      if (!name || !idByName.has(name)) continue; // the cast owns the matrix; an unknown name is not a member
      rows.push({
        characterId: idByName.get(name) ?? null,
        characterName: name,
        similarity: typeof entry.similarity === "number" && Number.isFinite(entry.similarity) ? entry.similarity : 0,
        shotId: row.shotId,
        ref,
        framing: identityFramingBucket(row.shot.shotType),
        yaw: identityYawBucket(row.shot.movement),
        expression: identityExpressionBucket(row.shot.description, row.shot.poseStart, row.shot.poseEnd),
        lighting: identityLightingBucket(row.shot.lighting),
        state: identityStateBucket(row.shot.poseStart),
      });
    }
  }
  return rows;
}

/**
 * Roll the production's persisted identity readings into the matrix.
 * The readings are the SAME per-character entries the cast standing
 * reads (each IdentityScore row carries every scored member's own
 * similarity) - no new vision calls here; run measure_identity_bar /
 * scoreProjectIdentity to earn readings first. Each reading's five
 * axis buckets derive purely from its own shot row (the framing from
 * the shot type, the yaw from the movement, the expression from the
 * shot's own drama the same law the payload rides, the lighting from
 * the light words, the state from the staged pose). Cast members
 * with no readings ride along as unscored members - the matrix names
 * them, never drops them.
 */
export async function identityMatrixData(projectId: string, source: IdentitySource = "RENDER"): Promise<IdentityMatrixData> {
  const [project, scoreRows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { characters: { select: { id: true, name: true } } } }),
    db.identityScore.findMany({
      where: { projectId, source },
      include: { shot: { include: { scene: { include: { episode: { include: { season: { select: { number: true } } } } } } } } },
    }),
  ]);
  const floor = source === "RENDER" ? IDENTITY_RENDER_THRESHOLD : IDENTITY_REPAINT_THRESHOLD;
  const cast = project?.characters ?? [];
  const idByName = new Map(cast.map((c) => [c.name, c.id] as const));
  const rows = scoreRowsToMatrixRows(scoreRows, idByName);
  const matrix = identityMatrixFromRows(rows, floor, source);
  // anchored-but-unscored members ride along, named (never dropped)
  const scored = new Set(matrix.members.map((m) => m.name));
  for (const c of cast) {
    if (!scored.has(c.name)) {
      matrix.members.push({
        characterId: c.id,
        name: c.name,
        overall: { key: c.name, n: 0, mean: null, median: null, p10: null, worst: null, best: null, belowFloor: 0, belowFraction: null, verdict: "UNSCORED", worstRef: null },
        axes: [],
      });
    }
  }
  matrix.cast = matrix.members.length;
  return matrix;
}

// ── the release spine's gate (iteration 101: THE VERDICT IS THE LAW) ──

/**
 * One EPISODE's release read: the matrix rolled over ONLY the
 * readings whose shots belong to this episode - the same five-axis
 * law, the same floor, judged at the grain the spine publishes at.
 * The overall cell's verdict is the episode's release answer, and
 * the blocking cells (the HOLD/BELOW slices, worst p10 first) are
 * what the refusal names.
 */
export interface EpisodeReleaseRead {
  episodeId: string;
  source: IdentitySource;
  floor: number;
  readings: number;
  verdict: DistributionVerdict; // the episode's own overall verdict
  overall: MatrixCell;
  blocking: MatrixCell[]; // the HOLD/BELOW cells, worst p10 first
  // THE ARC (iteration 142): when the arc ledger carries readings for
  // this episode, the gate's number is the per-entry median ACROSS
  // the cohort's nights - not one night's sweep. arc=false means the
  // pre-arc fallback (the sweep's own rows) answered.
  arc: boolean;
  nights: number; // distinct nights the read rolled (the sweep: 1)
  provisional: boolean; // an arc younger than IDENTITY_ARC_MIN_NIGHTS
}

/**
 * THE RELEASE GATE (loader): roll ONE episode's identity readings
 * into its release verdict. The gate the spine obeys: an episode
 * stages for publish on a RELEASE verdict ONLY - a HOLD distribution
 * (the body clears, the tail dips) refuses with the dipping cells
 * named, a BELOW distribution refuses with the body named, and
 * UNSCORED refuses honestly (nothing measured - the spine does not
 * guess a release). The standing law keeps its teeth beside this
 * (rule 69 untouched) - this is the release view, at the episode
 * grain, wired into the machinery that ships the pixels.
 *
 * THE ARC (iteration 142): when the arc ledger carries readings for
 * this episode+source, the gate's number is the PER-ENTRY MEDIAN
 * across the latest cohort's nights - the 141 band (identical craft
 * swinging 38..60 of mean between drains) cannot move a medianed
 * verdict the way it moves a single-night sweep. A one-night arc
 * reads PROVISIONAL. No arc rows: the pre-arc fallback - the sweep's
 * own rows, byte-exact as before.
 *
 * THE DURABLE LEDGER (iteration 144): the arc rows the gate reads
 * union the DB's live rows with the committed receipt's lines - a
 * night whose DB rows died with a sandbox still reads, keyed by the
 * work's number chain. `opts` routes the receipt read (the e2e's
 * lab scopes ride their own path; `receiptPath: null` opts out).
 */
export async function episodeReleaseVerdict(
  projectId: string,
  episodeId: string,
  source: IdentitySource = "RENDER",
  opts?: { receiptPath?: string | null },
): Promise<EpisodeReleaseRead> {
  const [project, scoreRows, arcRows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { characters: { select: { id: true, name: true } } } }),
    db.identityScore.findMany({
      where: { projectId, source, shot: { scene: { episodeId } } },
      include: { shot: { include: { scene: { include: { episode: { include: { season: { select: { number: true } } } } } } } } },
    }),
    readIdentityArcEpisode(projectId, episodeId, source, opts),
  ]);
  const floor = source === "RENDER" ? IDENTITY_RENDER_THRESHOLD : IDENTITY_REPAINT_THRESHOLD;
  const cast = project?.characters ?? [];
  const idByName = new Map(cast.map((c) => [c.name, c.id] as const));

  // the arc feed: per-entry medians across the cohort's nights
  if (arcRows.length > 0) {
    const arc = arcMedianRows({
      arcRows,
      idByName,
      bucketOf: (shot) => ({
        framing: identityFramingBucket(shot.shotType),
        yaw: identityYawBucket(shot.movement),
        expression: identityExpressionBucket(shot.description, shot.poseStart, shot.poseEnd),
        lighting: identityLightingBucket(shot.lighting),
        state: identityStateBucket(shot.poseStart),
      }),
    });
    const matrix = identityMatrixFromRows(arc.rows, floor, source);
    const blocking = matrix.axes
      .flatMap((t) => t.cells.filter((c) => c.verdict === "HOLD" || c.verdict === "BELOW"))
      .sort(cellOrder)
      .slice(0, 4);
    return {
      episodeId,
      source,
      floor,
      readings: arc.rows.length,
      verdict: matrix.overall.verdict,
      overall: matrix.overall,
      blocking,
      arc: true,
      nights: arc.nights,
      provisional: arc.nights < IDENTITY_ARC_MIN_NIGHTS,
    };
  }

  // the pre-arc fallback: the sweep's own rows (byte-exact behavior)
  const rows = scoreRowsToMatrixRows(scoreRows, idByName);
  const matrix = identityMatrixFromRows(rows, floor, source);
  const blocking = matrix.axes
    .flatMap((t) => t.cells.filter((c) => c.verdict === "HOLD" || c.verdict === "BELOW"))
    .sort(cellOrder)
    .slice(0, 4);
  return {
    episodeId,
    source,
    floor,
    readings: rows.length,
    verdict: matrix.overall.verdict,
    overall: matrix.overall,
    blocking,
    arc: false,
    nights: 1,
    provisional: false,
  };
}

function pct2(v: number | null): string {
  return v === null ? "-" : `${(v * 100).toFixed(0)}%`;
}

/**
 * The arc span a read names in its own words: the sweep reads
 * byte-exact as before; an arc read names its nights and its youth.
 */
function arcSpan(read: EpisodeReleaseRead): string {
  if (!read.arc) return `${read.readings} reading(s)`;
  const span = `${read.readings} arc reading(s) across ${read.nights} night(s)`;
  return read.provisional ? `${span} (PROVISIONAL - single-night read)` : span;
}

/**
 * The conformance line a RELEASE verdict earns (pure): the check the
 * package carries once the gate opens.
 */
export function episodeReleaseCheckLine(read: EpisodeReleaseRead): string {
  return `identity distribution RELEASES - p10 ${pct2(read.overall.p10)}, mean ${pct2(read.overall.mean)}, median ${pct2(read.overall.median)} over ${arcSpan(read)}, floor ${pct2(read.floor)}`;
}

/**
 * The honest refusal a non-RELEASE verdict earns (pure): the verdict
 * named, the distribution's shape, the blocking cells with their
 * worst shot refs, and the law itself - an episode does not publish
 * on a HOLD distribution.
 */
export function episodeReleaseRefusal(read: EpisodeReleaseRead, epTag: string): string {
  const floorPct = pct2(read.floor);
  if (read.verdict === "UNSCORED") {
    return `${epTag} carries no scored identity readings (${read.source.toLowerCase()} source) - the matrix has nothing to judge and the release spine does not guess a release: score the episode's renders first (measure_identity_bar or identity_matrix scoreFirst), then stage the publish again`;
  }
  const shape = `mean ${pct2(read.overall.mean)}, median ${pct2(read.overall.median)}, p10 ${pct2(read.overall.p10)}, worst ${pct2(read.overall.worst)} over ${arcSpan(read)}, floor ${floorPct}`;
  const cells = read.blocking.length > 0
    ? read.blocking.map((c) => `${c.key} - ${c.verdict}, p10 ${pct2(c.p10)}${c.worstRef ? ` (worst at ${c.worstRef})` : ""}`).join("; ")
    : "the dipping cells sit outside the top of each axis - read identity_matrix for the full shape";
  if (read.verdict === "HOLD") {
    return `${epTag}'s identity distribution HOLDS at the release floor: the body clears but the tail dips under ${floorPct} (${shape}) - the release waits. The dipping cells: ${cells}. Work those shots by name (render_fix / identity_repair_pass), read the matrix again, then stage. An episode does not publish on a HOLD distribution`;
  }
  return `${epTag}'s identity distribution sits BELOW the release floor: the body itself is under (${shape}). The under cells: ${cells}. Repair the distribution (identity_repair_pass), then stage. An episode does not publish BELOW the floor`;
}
