// ─────────────────────────────────────────────────────────────
// THE RELEASE PATH'S OWN ARITHMETIC (iteration 240) - the map becomes countable.
//
// The 232 review drew the map ("the path names 3 step(s)"); the
// 233/234/236/237 laws made its steps executable; the 239 closing
// instant answered it in prose ("publish waits on the review's own
// path"). What NO law yet answers is the question the frontier
// keeps asking one lawful night at a time: HOW MUCH stands between
// the episode and its first RELEASE verdict, counted - the exact
// deltas to the floor, the readings under it, the nights the arc
// still owes before PROVISIONAL exits, the blocking cells with
// their worst refs, and the lever the judge's own words name. The
// remainder is the denominator: without it, "the medians move only
// as the nights do" has no number; with it, every night knows what
// fraction of the path it just walked.
//
// The law reads the REVIEW (the 232 map, the gate's own reads
// already shaped) and answers the remainder:
//   • per source - the gaps (p10, mean, worst -> the floor, in
//     points), the readings under the floor, the blocking cells,
//     the nights the arc owes (the arc's OWN law, injected - see
//     below), and whether the source releases NOW,
//   • the conditions - the counted list, one line each, exact
//     words (the smoke pins them): the body's cross, the cells'
//     clear, the night the cohort owes, the tail's lift, the
//     measure-first for the UNSCORED, the lever's own words, and
//     the closing rule verbatim.
//
// PURE: no db, no fs - the review arrives as the argument (the 232
// purity law kept). THE INJECTION LAW: the arc's own night law
// arrives as an argument (the caller passes identity-arc's
// IDENTITY_ARC_MIN_NIGHTS; the remainder's numbers are the CALLER's
// numbers because the caller says so, never because this file
// re-derives them - the same shape the repair budget rides). THE
// LEVER'S WORDS: they arrive as an argument too - the judge's own
// words ride as data (the pure law never paraphrases the judge).
// ─────────────────────────────────────────────────────────────

import type { DistributionVerdict } from "./identity-matrix";
import type { ReleaseReview } from "./release-review";

export const RELEASE_PATH_LAW_VERSION = 240;

/** One source's counted remainder: the map, made arithmetic. */
export interface ReleasePathSource {
  source: string;
  verdict: DistributionVerdict;
  floor: number;
  readings: number;
  arc: boolean;
  nights: number;
  provisional: boolean;
  /** true only when the verdict is RELEASE - no condition rides. */
  releasesNow: boolean;
  counts: {
    readingsBelowFloor: number;
    readingsAtOrAboveFloor: number;
    blockingCells: number;
  };
  /** The deltas to the floor, in percentage points (0 when the
   *  statistic clears or the source carries no reading). */
  gaps: {
    p10ToFloor: number | null;
    meanToFloor: number | null;
    worstToFloor: number | null;
    /** How far the BEST read sits under the floor - the cheapest
     *  cross the body already owns (null when cleared). */
    bestShortfall: number | null;
  };
  /** The nights the arc still owes before PROVISIONAL exits (the
   *  caller's own MIN_NIGHTS arithmetic; null for a sweep source). */
  nightsOwed: number | null;
  blocking: Array<{
    key: string;
    verdict: "HOLD" | "BELOW";
    p10: number | null;
    n: number;
    belowFloor: number;
    worstRef: string | null;
  }>;
  /** The lever's own line (the judge's own words, verbatim) - the
   *  caller names it; absent when the frontier has not named one. */
  leverLine: string | null;
  /** The source's own conditions, exact words (the smoke pins
   *  them) - empty when the source releases now. */
  conditions: string[];
}

/** The counted remainder: what stands between the episode and its
 *  first RELEASE verdict, one line per condition. */
export interface ReleasePathRemainder {
  episodeTag: string;
  law: { name: "release-path"; version: number };
  /** The arc's own night law, as the caller passed it. */
  arcMinNights: number;
  sources: ReleasePathSource[];
  /** The counted conditions, in the path's own order: per source
   *  (the refused sources first, the releasing sources named), the
   *  levers' own words, and the closing rule verbatim. */
  conditions: string[];
  /** The nights the path still owes before every provisional
   *  source exits PROVISIONAL (the max across the sources). */
  nightsOwed: number;
  headline: string;
}

const pct = (v: number | null): string => (v === null ? "-" : `${Math.round(v * 100)}%`);

/** The gap arithmetic, in points (null rides through; cleared reads 0). */
function gapOf(v: number | null, floor: number): number | null {
  if (v === null) return null;
  return Math.max(0, Math.round((floor - v) * 100));
}

/** One source's counted remainder (pure). */
export function releasePathSource(
  s: ReleaseReview["sources"][number],
  arcMinNights: number,
  leverLine: string | null,
): ReleasePathSource {
  const releasing = s.verdict === "RELEASE";
  const below = s.overall.belowFloor;
  const conditions: string[] = [];
  const src = s.source;

  if (s.verdict === "UNSCORED") {
    conditions.push(
      `${src}: measure first - run the identity sweep for this source; the gate refuses UNSCORED honestly and the spine does not guess a release.`,
    );
  } else if (s.verdict === "BELOW") {
    const meanShort = gapOf(s.overall.mean, s.floor) ?? 0;
    const p10Short = gapOf(s.overall.p10, s.floor) ?? 0;
    const bestShort = gapOf(s.overall.best, s.floor);
    conditions.push(
      `${src}: the body crosses the floor - mean ${pct(s.overall.mean)} -> ${pct(s.floor)} (${meanShort} point(s) short), p10 ${pct(s.overall.p10)} -> ${pct(s.floor)} (${p10Short} point(s) short); ${below} of ${s.overall.n} reading(s) sit under the floor${bestShort !== null && bestShort > 0 ? ` (the best read ${pct(s.overall.best)} is ${bestShort} point(s) short)` : ""}.`,
    );
  } else if (s.verdict === "HOLD") {
    const worst = s.blocking[0];
    conditions.push(
      `${src}: the tail lifts - ${below} reading(s) under the floor, worst ${pct(worst?.p10 ?? null)} at ${worst?.worstRef ?? "-"}; the body clears (mean ${pct(s.overall.mean)}).`,
    );
  }

  // the cells' clear (BELOW and HOLD both name them - the gate's
  // own order, worst p10 first, verbatim refs)
  if (s.blocking.length > 0 && !releasing) {
    const list = s.blocking
      .map((c) => `${c.key} p10 ${pct(c.p10)} (n ${c.n})`)
      .join(", ");
    const refs = [...new Set(s.blocking.flatMap((c) => (c.worstRef ? [c.worstRef] : [])))];
    conditions.push(
      `${src}: ${s.blocking.length} blocking cell(s) clear - ${list}; the worst ref ${refs.join(", ")}.`,
    );
  }

  // the night the cohort owes (the arc's own law, injected)
  const owed = s.arc ? Math.max(0, arcMinNights - s.nights) : null;
  if (s.arc && s.provisional && owed !== null && owed > 0) {
    conditions.push(
      `${src}: the cohort owes ${owed} more night(s) - the read is PROVISIONAL (${s.nights} of ${arcMinNights} night(s); one night cannot carry a build decision).`,
    );
  }

  if (releasing) {
    conditions.push(`${src} releases now - no condition rides this source (${s.spanLine}).`);
  }

  return {
    source: src,
    verdict: s.verdict,
    floor: s.floor,
    readings: s.readings,
    arc: s.arc,
    nights: s.nights,
    provisional: s.provisional,
    releasesNow: releasing,
    counts: {
      readingsBelowFloor: below,
      readingsAtOrAboveFloor: Math.max(0, s.overall.n - below),
      blockingCells: s.blocking.length,
    },
    gaps: {
      p10ToFloor: gapOf(s.overall.p10, s.floor),
      meanToFloor: gapOf(s.overall.mean, s.floor),
      worstToFloor: gapOf(s.overall.worst, s.floor),
      bestShortfall: gapOf(s.overall.best, s.floor),
    },
    nightsOwed: owed,
    blocking: s.blocking.map((c) => ({ ...c })),
    leverLine,
    conditions,
  };
}

/**
 * THE REMAINDER (pure): the review's map, counted. The refused
 * sources' conditions ride first (the gate's own severity order is
 * the review's own), the releasing sources name their zero, the
 * levers' own words ride as their own conditions (the judge is
 * never paraphrased), and the closing rule rides last verbatim -
 * the same words the 232 map closed with and the 234 law executes.
 */
export function releasePathRemainder(args: {
  review: ReleaseReview;
  arcMinNights: number;
  leverLines?: Record<string, string>;
}): ReleasePathRemainder {
  const { review, arcMinNights, leverLines } = args;
  const lines = leverLines ?? {};
  const sources = review.sources.map((s) => releasePathSource(s, arcMinNights, lines[s.source] ?? null));

  const conditions: string[] = [];
  for (const s of sources) {
    if (!s.releasesNow) conditions.push(...s.conditions);
  }
  for (const s of sources) {
    if (s.releasesNow) conditions.push(...s.conditions);
  }
  for (const s of sources) {
    if (s.leverLine && !s.releasesNow) {
      conditions.push(`the lever names itself from the judge's own words (${s.source}): ${s.leverLine}`);
    }
  }
  conditions.push(
    "when every scored source reads p10 >= floor AND mean >= floor, the verdict turns RELEASE and the episode stages for publish - the gate keeps its teeth.",
  );

  const owed = sources.reduce((m, s) => Math.max(m, s.nightsOwed ?? 0), 0);
  const refused = sources.filter((s) => !s.releasesNow).length;
  const headline = `${review.episodeTag}'s remainder: ${conditions.length} condition(s) across ${sources.length} source(s) (${refused} refused, ${sources.length - refused} releasing)${owed > 0 ? ` - the arc owes ${owed} more night(s) before PROVISIONAL exits` : ""}; the closing law keeps its teeth.`;

  return {
    episodeTag: review.episodeTag,
    law: { name: "release-path", version: RELEASE_PATH_LAW_VERSION },
    arcMinNights,
    sources,
    conditions,
    nightsOwed: owed,
    headline,
  };
}
