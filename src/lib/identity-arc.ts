// ─────────────────────────────────────────────────────────────
// THE IDENTITY ARC (iteration 142; made durable in 144) - the
// release gate's number is the multi-night median, not a single
// night's sweep.
//
// The 141 night measured the band: identical craft (ANIME 125 /
// TOON 133 / PRESENCE 108, the same r3 designs, the same pipeline)
// scored mean 38 one drain and mean 60 the next - the judge's
// single-night variance, measured, with the eye confirming the
// pixels did not move. And the sweep's own table structurally
// cannot remember: IdentityScore carries ONE row per (shot, source)
// - every night OVERWRITES the last - so the release gate has only
// ever read one night, however many nights the studio burned.
//
// The arc is the ledger that survives:
//   • the night rescore APPENDS each shot's verdict here,
//     night-tagged and cohort-tagged (the bridge law versions the
//     pixels rendered under),
//   • the reset's identityScore wipe never touches these rows,
//   • the release gate rolls the PER-ENTRY MEDIAN across the
//     cohort's nights (per entry = per shot x cast member, the
//     same grain the matrix reads; aspects median alongside),
//   • a law bump opens a new cohort automatically (the gate reads
//     the latest cohort the arc carries) - old readings never
//     pollute new laws,
//   • a one-night arc answers honestly: PROVISIONAL - the 141
//     band means a single-night read cannot carry a build decision.
//
// The arc does NOT lift the board: the same craft below the floor
// stays below the floor (the 142 probe measured the arc at mean 49
// on the 140/141 receipts - inside the 38..60 single-night band,
// reproducible, still BELOW). The instrument fix makes the verdict
// trustworthy; it does not flatter the craft.
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import type { IdentityScoreEntry, IdentitySource } from "@/lib/identity";

export const IDENTITY_ARC_LAW_VERSION = 146;

/** The nights an arc needs before its read is not provisional. */
export const IDENTITY_ARC_MIN_NIGHTS = 2;

// ─────────────────────────────────────────────────────────────
// THE REPAIR JOINS THE ARC (iteration 146). The 145 night's settled
// verdict named its own repair path - and the probe measured the
// gap: the repair pass as built read the SWEEP (its before/after
// standings, its REPAIRED verdicts), re-scored into the sweep, and
// the gate stopped reading the sweep the moment the arc existed -
// a repair that lifted its shots to 0.90 reported into a ledger the
// refusing instrument never reads. From 146 the repair's re-scores
// APPEND to the arc (real production readings of the work:
// ref-chained, cohort-tagged from the bridges' own law versions,
// night-tagged `repair-<date>` - a re-run the same day folds into
// the same night, the same idempotent replace every other writer
// obeys), and the pass reads its after-standing the way the gate
// does - episodeReleaseVerdict off the same receipt path - so the
// repair's ledger and the gate's verdict answer ONE instrument.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// THE DURABLE LEDGER (iteration 144). The arc's rows ride the
// runtime DB, and the runtime DB dies with every sandbox rebuild -
// measured twice back to back: the night-142 rows died in the 143
// rebuild, the night-143 rows died in the 144 rebuild. The arc as
// built could never reach its own purpose (the two-night median)
// in a world with deaths. So the append ALSO writes a receipt line
// into the repo - JSONL, committed - keyed by the WORK's number
// chain (episode/scene/shot), not the DB's surrogate cuids: the
// seed recreates the chain byte-exact every rebuild, the cuids it
// does not. The gate UNIONS the DB rows and the receipt lines
// (dedupe by source+ref+night, the live row wins its key), so a
// night whose DB rows died still reads. The anti-fabrication law
// holds unchanged: receipts START EMPTY - the dead rows stay dead
// (the 142/143 boards live in the records, not backfilled); only
// REAL appends write lines, going forward.
// ─────────────────────────────────────────────────────────────

/** The committed receipt the production appends ride (repo-relative). */
export const ARC_RECEIPT_PATH = "receipts/identity-arc.jsonl";

/** Where in the work a receipt line's reading landed (the durable key). */
export interface ArcReceiptRef {
  episode: number;
  scene: number;
  shot: number;
}

/** One append's durable line: the reading, tagged, addressed by the work. */
export interface ArcReceiptLine {
  projectId: string;
  source: string;
  night: string;
  cohort: string;
  worst: number;
  scores: IdentityScoreEntry[];
  scoredAt: string; // ISO - the reading's own instant, kept across deaths
  ref: ArcReceiptRef;
}

const receiptKeyOf = (source: string, ref: ArcReceiptRef, night: string): string =>
  `${source}|${ref.episode}/${ref.scene}/${ref.shot}|${night}`;

/**
 * Fold raw receipt lines into readings (pure): the last line for a
 * (source, ref, night) wins - the same idempotent replace the DB
 * upsert obeys; a corrupt line is dropped and the fold continues.
 */
export function foldArcReceiptLines(lines: string[]): ArcReceiptLine[] {
  const byKey = new Map<string, ArcReceiptLine>();
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as ArcReceiptLine;
      if (!o || typeof o !== "object") continue;
      if (!o.night || !o.source) continue;
      if (!o.ref || typeof o.ref.episode !== "number" || typeof o.ref.scene !== "number" || typeof o.ref.shot !== "number") continue;
      byKey.set(receiptKeyOf(o.source, o.ref, o.night), o);
    } catch {
      continue; // a corrupt line never poisons the fold
    }
  }
  return [...byKey.values()];
}

/**
 * Read the folded receipt (repo-relative path, default the
 * production ledger). Unreadable or absent: the arc rides the DB
 * alone - the pre-144 behavior, byte-exact.
 */
export function readIdentityArcReceipt(p?: string): ArcReceiptLine[] {
  const file = path.join(process.cwd(), p ?? ARC_RECEIPT_PATH);
  try {
    return foldArcReceiptLines(fs.readFileSync(file, "utf8").split("\n"));
  } catch {
    return [];
  }
}

/**
 * Write one receipt line (fold-replace by the durable key). The
 * e2e's lab scopes ride their own path so the production receipt
 * carries only REAL nights.
 */
export function writeArcReceiptLine(line: ArcReceiptLine, p?: string): void {
  const file = path.join(process.cwd(), p ?? ARC_RECEIPT_PATH);
  const key = receiptKeyOf(line.source, line.ref, line.night);
  const kept = readIdentityArcReceipt(p).filter((l) => receiptKeyOf(l.source, l.ref, l.night) !== key);
  kept.push(line);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, kept.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

/** One appended night's reading: the rescore's verdict, tagged. */
export interface IdentityArcAppend {
  projectId: string;
  shotId: string;
  source: IdentitySource;
  night: string;
  cohort: string;
  worst: number;
  scores: IdentityScoreEntry[];
}

/**
 * The law cohort the current working tree renders under: the three
 * bridge build laws (anime character, toon pass, presence) read from
 * the bridges themselves - the same truth the e2e gates pin. A law
 * bump changes the string, and the arc opens a new cohort around it.
 */
export function bridgeLawCohort(root?: string): string {
  const base = root ?? process.cwd();
  const read = (file: string, pattern: RegExp): string | null => {
    try {
      const src = fs.readFileSync(path.join(base, "bridges", "blender", file), "utf8");
      const m = src.match(pattern);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };
  const anime = read("anime_character.py", /ANIME_LAW_VERSION\s*=\s*(\d+)/);
  const toon = read("toon_pass.py", /TOON_LAW_VERSION\s*=\s*(\d+)/);
  const presence = read("animeos_bridge.py", /PRESENCE_LAW_VERSION\s*=\s*(\d+)/);
  if (!anime || !toon || !presence) return "unknown";
  return `a${anime}/t${toon}/p${presence}`;
}

/** The default night tag a rescore rides when none is given. */
export function defaultNightTag(now?: Date): string {
  const d = now ?? new Date();
  return `night-${d.toISOString().slice(0, 10)}`;
}

/**
 * Append (or idempotently replace) one night's reading for a shot -
 * in the DB AND, since 144, in the committed receipt (the durable
 * ledger). `opts.receiptPath === null` skips the receipt write (the
 * e2e scopes that must not touch the production ledger); a path
 * redirects it (the e2e's own lab receipt). The receipt write never
 * breaks the DB append - it warns and stands down.
 */
export async function appendIdentityArcReading(
  a: IdentityArcAppend,
  opts?: { receiptPath?: string | null },
): Promise<void> {
  const data = {
    projectId: a.projectId,
    shotId: a.shotId,
    source: a.source,
    night: a.night,
    cohort: a.cohort,
    worst: a.worst,
    scores: JSON.stringify(a.scores),
  };
  await db.identityArcReading.upsert({
    where: { shotId_source_night: { shotId: a.shotId, source: a.source, night: a.night } },
    create: data,
    update: data,
  });
  if (opts?.receiptPath === null) return;
  try {
    const shot = await db.shot.findUnique({
      where: { id: a.shotId },
      include: { scene: { include: { episode: { select: { number: true } } } } },
    });
    if (!shot) return; // no ref, no durable line - the DB row stands
    writeArcReceiptLine(
      {
        projectId: a.projectId,
        source: a.source,
        night: a.night,
        cohort: a.cohort,
        worst: a.worst,
        scores: a.scores,
        scoredAt: new Date().toISOString(),
        ref: { episode: shot.scene.episode.number, scene: shot.scene.number, shot: shot.number },
      },
      opts?.receiptPath,
    );
  } catch (e) {
    console.warn(`[arc] receipt write stood down: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** One arc row with the shot chain the matrix buckets need. */
export interface IdentityArcRow {
  shotId: string;
  source: string;
  night: string;
  cohort: string;
  worst: number;
  scores: string;
  scoredAt: Date;
  shot: {
    id: string;
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

/**
 * Read ONE episode's arc rows (a source), newest first - the DB's
 * live rows UNION the committed receipt's lines (the durable
 * ledger, iteration 144). A receipt line joins by the WORK's number
 * chain: the seed recreates episode/scene/shot numbers byte-exact
 * every rebuild, so a night whose DB rows died with a sandbox still
 * reads. The DB row wins its (source, ref, night) key - the live
 * ledger is the truth of record; the receipt carries the nights the
 * DB lost. A line whose ref names no live shot does not join
 * (honest: the work it measured no longer exists). `opts`
 * routes/opts-out the receipt read for the e2e's lab scopes.
 */
export async function readIdentityArcEpisode(
  projectId: string,
  episodeId: string,
  source: IdentitySource = "RENDER",
  opts?: { receiptPath?: string | null },
): Promise<IdentityArcRow[]> {
  const [rows, episode] = await Promise.all([
    db.identityArcReading.findMany({
      where: { projectId, source, shot: { scene: { episodeId } } },
      orderBy: { scoredAt: "desc" },
      include: {
        shot: {
          include: { scene: { include: { episode: { select: { number: true } } } } },
        },
      },
    }),
    db.episode.findUnique({ where: { id: episodeId }, select: { number: true } }),
  ]);
  const out = new Map<string, IdentityArcRow>();
  const keyOf = (r: { source: string; night: string; shot: { number: number; scene: { number: number } } }): string =>
    `${r.source}|${r.shot.scene.number}/${r.shot.number}|${r.night}`;
  for (const r of rows) out.set(keyOf(r), r as unknown as IdentityArcRow);
  if (opts?.receiptPath !== null && episode) {
    const live = await db.shot.findMany({
      where: { scene: { episodeId } },
      include: { scene: { include: { episode: { select: { number: true } } } } },
    });
    const byRef = new Map(live.map((s) => [`${s.scene.number}/${s.number}`, s] as const));
    for (const line of readIdentityArcReceipt(opts?.receiptPath)) {
      if (line.source !== source || line.ref.episode !== episode.number) continue;
      const shot = byRef.get(`${line.ref.scene}/${line.ref.shot}`);
      if (!shot) continue;
      const row = {
        shotId: shot.id,
        source: line.source,
        night: line.night,
        cohort: line.cohort,
        worst: line.worst,
        scores: JSON.stringify(line.scores ?? []),
        scoredAt: new Date(line.scoredAt ?? 0),
        shot,
      } as unknown as IdentityArcRow;
      const k = keyOf(row);
      if (!out.has(k)) out.set(k, row);
    }
  }
  // shape to the narrow chain the buckets need (episode number only)
  return [...out.values()].sort((a, b) => b.scoredAt.getTime() - a.scoredAt.getTime());
}

const medianOf = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** One bucket value a row carries for the matrix axes. */
export interface ArcBucketSource {
  shotType: string | null;
  movement: string | null;
  description: string | null;
  poseStart: string | null;
  poseEnd: string | null;
  lighting: string | null;
}

/**
 * THE ARC MEDIAN (pure): roll arc rows into per-entry medians -
 * group by (shotId, characterName), each entry's similarity is the
 * median across its nights, each aspect the median alongside. The
 * grain the matrix reads (one row per entry) with the drain-to-drain
 * truth in the number. `bucketOf` resolves the shot-side axis values
 * (framing/yaw/expression/lighting/state) - injected so this stays
 * pure and the gate passes its own bucket functions.
 */
export function arcMedianRows<Row extends {
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
}>(args: {
  arcRows: Array<{ shotId: string; night: string; cohort: string; scores: string; shot: ArcBucketSource & { number: number; scene: { number: number; episode: { number: number } } } }>;
  idByName: Map<string, string>;
  bucketOf: (shot: ArcBucketSource & { number: number; scene: { number: number; episode: { number: number } } }) => Pick<Row, "framing" | "yaw" | "expression" | "lighting" | "state">;
}): { rows: Row[]; nights: number; cohort: string | null; entryNights: Map<string, number> } {
  const { arcRows, idByName, bucketOf } = args;
  // the cohort: the first row's cohort - the loader arrives scoredAt-
  // desc, so the newest reading's cohort IS the arc's present tense.
  const cohort: string | null = arcRows[0]?.cohort ?? null;
  const scoped = cohort ? arcRows.filter((r) => r.cohort === cohort) : arcRows;

  // group the per-night entries by (shotId, characterName)
  const byEntry = new Map<string, Array<{ similarity: number; aspects: Partial<Record<string, number>>; night: string }>>();
  const shotOf = new Map<string, (typeof scoped)[number]["shot"]>();
  for (const row of scoped) {
    shotOf.set(row.shotId, row.shot);
    let entries: IdentityScoreEntry[] = [];
    try {
      const parsed = JSON.parse(row.scores);
      if (Array.isArray(parsed)) entries = parsed as IdentityScoreEntry[];
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const name = String(entry.characterName ?? "").trim();
      if (!name || !idByName.has(name)) continue; // the cast owns the matrix
      const key = `${row.shotId}::${name}`;
      const list = byEntry.get(key);
      const aspects: Partial<Record<string, number>> = {};
      for (const [k, v] of Object.entries(entry.aspects ?? {})) {
        if (typeof v === "number" && Number.isFinite(v)) aspects[k] = v;
      }
      const sim = typeof entry.similarity === "number" && Number.isFinite(entry.similarity) ? entry.similarity : 0;
      if (list) list.push({ similarity: sim, aspects, night: row.night });
      else byEntry.set(key, [{ similarity: sim, aspects, night: row.night }]);
    }
  }

  const rows: Row[] = [];
  const entryNights = new Map<string, number>();
  for (const [key, readings] of byEntry) {
    const [shotId, name] = key.split("::");
    const shot = shotOf.get(shotId);
    if (!shot) continue;
    const sim = medianOf(readings.map((r) => r.similarity));
    const ref = `E${shot.scene.episode.number} Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;
    const buckets = bucketOf(shot);
    rows.push({
      characterId: idByName.get(name) ?? null,
      characterName: name,
      similarity: sim,
      shotId,
      ref,
      ...buckets,
    } as Row);
    entryNights.set(key, new Set(readings.map((r) => r.night)).size);
  }
  const nights = new Set(scoped.map((r) => r.night)).size;
  return { rows, nights, cohort, entryNights };
}
