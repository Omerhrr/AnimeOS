// ─────────────────────────────────────────────────────────────
// THE IDENTITY ARC (iteration 142) - the release gate's number is
// the multi-night median, not a single night's sweep.
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

export const IDENTITY_ARC_LAW_VERSION = 142;

/** The nights an arc needs before its read is not provisional. */
export const IDENTITY_ARC_MIN_NIGHTS = 2;

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

/** Append (or idempotently replace) one night's reading for a shot. */
export async function appendIdentityArcReading(a: IdentityArcAppend): Promise<void> {
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
 * Read ONE episode's arc rows (a source), newest first. The gate's
 * feed: whatever the cohort filter does not do here, the caller
 * decides - the release read takes the latest cohort the rows carry.
 */
export async function readIdentityArcEpisode(
  projectId: string,
  episodeId: string,
  source: IdentitySource = "RENDER",
): Promise<IdentityArcRow[]> {
  const rows = await db.identityArcReading.findMany({
    where: { projectId, source, shot: { scene: { episodeId } } },
    orderBy: { scoredAt: "desc" },
    include: {
      shot: {
        include: { scene: { include: { episode: { select: { number: true } } } } },
      },
    },
  });
  // shape to the narrow chain the buckets need (episode number only)
  return rows as unknown as IdentityArcRow[];
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
