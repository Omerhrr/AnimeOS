// ─────────────────────────────────────────────────────────────
// THE RELEASE REVIEW (iteration 232) - the answer's first fruit.
//
// The 230 ride left the box with its answer on the receipts and
// the arc carrying two nights of v4 evidence: PROVISIONAL exited,
// the gate's own word read HOLD. The gate itself was never the
// gap - episodeReleaseVerdict reads the distribution and REFUSES
// with the dipping cells named; the refusal is honest but it is
// a DOOR SLAM, not a map: it says what blocks, never what stands
// between the episode and its first RELEASE verdict. The review
// is the map.
//
// The law rides the gate's OWN reads (EpisodeReleaseRead - the
// same loader the spine obeys) and turns them into a durable
// review: per source, the verdict, the distribution's shape, the
// blocking cells worst-p10-first, and - the part the refusal
// never carried - the PATH: the named steps between this episode
// and its first RELEASE verdict, each step answered by machinery
// that already exists (the repair pass's own budget, the arc's
// night law, the publish staging's own rule).
//
// PURE: no db import, no fs - the reads come in as arguments,
// the repair budget comes in as an argument (the script passes
// identity-repair's own constants; the review's numbers are the
// repair's numbers because the CALLER says so, not because this
// file duplicates them). The smoke asserts exact words; the e2e
// asserts the real episode's review against the real gate.
// ─────────────────────────────────────────────────────────────

import type { DistributionVerdict, EpisodeReleaseRead, MatrixCell } from "./identity-matrix";

export const RELEASE_REVIEW_LAW_VERSION = 232;

/** The repair budget the review's path names (injected - the caller
 *  passes identity-repair's own REPAIR_MAX_MEMBERS x
 *  REPAIR_MAX_SHOTS_PER_MEMBER; the review never re-derives it). */
export interface RepairBudget {
  members: number;
  shotsPerMember: number;
}

/** One source's review: the gate's read, shaped for the map. */
export interface ReleaseReviewSourceRead {
  source: string;
  verdict: DistributionVerdict;
  floor: number;
  readings: number;
  arc: boolean;
  nights: number;
  provisional: boolean;
  overall: {
    n: number;
    mean: number | null;
    median: number | null;
    p10: number | null;
    worst: number | null;
    best: number | null;
    belowFloor: number;
  };
  /** The HOLD/BELOW cells, worst p10 first (the gate's own order). */
  blocking: Array<{
    key: string;
    verdict: "HOLD" | "BELOW";
    p10: number | null;
    n: number;
    belowFloor: number;
    worstRef: string | null;
  }>;
  repairBudget: RepairBudget & { shotsPerPass: number };
  /** The arc span in the gate's own words. */
  spanLine: string;
  /** What stands between this source and publish, one sentence. */
  gapLine: string;
}

/** The review itself: the map between the episode and its RELEASE. */
export interface ReleaseReview {
  projectId: string;
  episodeId: string;
  episodeTag: string;
  episodeTitle: string;
  reviewedAt: string; // ISO - the read's own instant
  law: { name: "release-review"; version: number };
  sources: ReleaseReviewSourceRead[];
  /** The worst verdict across the sources (RELEASE only when EVERY
   *  scored source releases - one refused source refuses the episode). */
  standing: {
    verdict: DistributionVerdict;
    arcNights: number | null;
    provisionalExited: boolean;
  };
  /** The named steps between this episode and its first RELEASE verdict. */
  path: string[];
  /** One line: the standing and the work, the review's own headline. */
  headline: string;
}

const STANDING_SEVERITY: Record<DistributionVerdict, number> = {
  BELOW: 3,
  HOLD: 2,
  UNSCORED: 1,
  RELEASE: 0,
};

const STANDING_WORD: Record<DistributionVerdict, string> = {
  RELEASE: "RELEASES",
  HOLD: "HOLDS",
  BELOW: "SITS BELOW",
  UNSCORED: "IS UNSCORED",
};

const pct = (v: number | null): string => (v === null ? "-" : `${Math.round(v * 100)}%`);

/** The arc span in the gate's own words (the loader's arcSpan, kept
 *  byte-honest here so the review speaks the gate's dialect). */
function spanLineOf(read: EpisodeReleaseRead): string {
  if (!read.arc) return `${read.readings} reading(s)`;
  const span = `${read.readings} arc reading(s) across ${read.nights} night(s)`;
  return read.provisional ? `${span} (PROVISIONAL - single-night read)` : span;
}

function cellToBlocking(c: MatrixCell): ReleaseReviewSourceRead["blocking"][number] {
  return {
    key: c.key,
    verdict: c.verdict === "BELOW" ? "BELOW" : "HOLD",
    p10: c.p10,
    n: c.n,
    belowFloor: c.belowFloor,
    worstRef: c.worstRef,
  };
}

/** One source's gap sentence (pure, exact words - the smoke pins them). */
function gapLineOf(read: EpisodeReleaseRead, budget: RepairBudget): string {
  const src = read.source;
  if (read.verdict === "UNSCORED") {
    return `${src} is UNSCORED - nothing measured; the spine does not guess a release: measure first.`;
  }
  if (read.verdict === "BELOW") {
    return `${src} sits BELOW - the body itself is under the floor (mean ${pct(read.overall.mean)}, median ${pct(read.overall.median)} vs floor ${pct(read.floor)}): lift the body before the tail matters.`;
  }
  if (read.verdict === "HOLD") {
    const worst = read.blocking[0];
    const worstWords = worst ? `worst ${pct(worst.p10)} at ${worst.worstRef ?? "-"}` : "the tail dips";
    return `${src} HOLDS - the body clears, the tail dips (${read.overall.belowFloor} reading(s) under the floor; ${worstWords}): the tail is the work.`;
  }
  return `${src} RELEASES - p10 ${pct(read.overall.p10)} over ${spanLineOf(read)}, floor ${pct(read.floor)}: nothing stands between this source and publish.`;
}

/** The per-source review slice (pure). */
export function reviewSourceRead(read: EpisodeReleaseRead, budget: RepairBudget): ReleaseReviewSourceRead {
  return {
    source: read.source,
    verdict: read.verdict,
    floor: read.floor,
    readings: read.readings,
    arc: read.arc,
    nights: read.nights,
    provisional: read.provisional,
    overall: {
      n: read.overall.n,
      mean: read.overall.mean,
      median: read.overall.median,
      p10: read.overall.p10,
      worst: read.overall.worst,
      best: read.overall.best,
      belowFloor: read.overall.belowFloor,
    },
    blocking: read.blocking.map(cellToBlocking),
    repairBudget: {
      members: budget.members,
      shotsPerMember: budget.shotsPerMember,
      shotsPerPass: budget.members * budget.shotsPerMember,
    },
    spanLine: spanLineOf(read),
    gapLine: gapLineOf(read, budget),
  };
}

/** The named steps between the episode and its first RELEASE verdict
 *  (pure, exact words - each step answered by machinery that exists). */
export function releaseReviewPath(reads: EpisodeReleaseRead[], budget: RepairBudget): string[] {
  const steps: string[] = [];
  const shotsPerPass = budget.members * budget.shotsPerMember;
  for (const read of reads) {
    const src = read.source;
    if (read.verdict === "BELOW") {
      steps.push(
        `${src}: lift the body - the repair pass answers (up to ${budget.members} members x ${budget.shotsPerMember} shots = ${shotsPerPass} shots per pass, the worst refs first), its re-scores append to the arc night-tagged, and the gate re-reads the medians.`,
      );
    } else if (read.verdict === "HOLD") {
      const refs = read.blocking
        .flatMap((c) => (c.worstRef ? [c.worstRef] : []))
        .slice(0, 3);
      steps.push(
        `${src}: lift the tail - repair the named cells' worst shots${refs.length ? ` (${refs.join(", ")})` : ""}: up to ${budget.members} members x ${budget.shotsPerMember} shots per pass, re-scores append to the arc, and the medians move only as the nights do.`,
      );
    } else if (read.verdict === "UNSCORED") {
      steps.push(`${src}: measure first - run the identity sweep for this source; the gate refuses UNSCORED honestly and the spine does not guess a release.`);
    }
  }
  if (reads.some((r) => r.arc && r.provisional)) {
    steps.push(
      "the arc is young - one night cannot carry a build decision (the 141 band measured identical craft swinging mean 38..60 between drains): give the re-scores their second night and PROVISIONAL exits.",
    );
  }
  steps.push(
    "when every scored source reads p10 >= floor AND mean >= floor, the verdict turns RELEASE and the episode stages for publish - the gate keeps its teeth.",
  );
  return steps;
}

/**
 * THE RELEASE REVIEW (pure): the gate's own reads, turned into the
 * map. Standing = the worst verdict across the sources (RELEASE only
 * when every scored source releases); the path names the work; the
 * headline says both in one line.
 */
export function buildReleaseReview(args: {
  projectId: string;
  episodeId: string;
  episodeTag: string;
  episodeTitle: string;
  reads: EpisodeReleaseRead[];
  repairBudget: RepairBudget;
  now?: Date;
}): ReleaseReview {
  const { projectId, episodeId, episodeTag, episodeTitle, reads, repairBudget } = args;
  const sources = reads.map((r) => reviewSourceRead(r, repairBudget));
  const standingVerdict: DistributionVerdict =
    reads.length === 0
      ? "UNSCORED"
      : reads.reduce<DistributionVerdict>(
          (worst, r) => (STANDING_SEVERITY[r.verdict] > STANDING_SEVERITY[worst] ? r.verdict : worst),
          "RELEASE",
        );
  const arcReads = reads.filter((r) => r.arc);
  const arcNights = arcReads.length ? Math.max(...arcReads.map((r) => r.nights)) : null;
  const provisionalExited = arcReads.length > 0 && arcReads.every((r) => !r.provisional);
  const sourceWords = reads
    .map((r) => `${r.source} ${STANDING_WORD[r.verdict]}${r.arc ? ` (arc, ${r.nights} night(s))` : " (sweep)"}`)
    .join("; ");
  const headline = `${episodeTag} ${STANDING_WORD[standingVerdict]} - ${sourceWords || "no source carries a reading"}; the path names ${reads.length === 0 ? 1 : reads.filter((r) => r.verdict !== "RELEASE").length + 1} step(s)`;
  return {
    projectId,
    episodeId,
    episodeTag,
    episodeTitle,
    reviewedAt: (args.now ?? new Date()).toISOString(),
    law: { name: "release-review", version: RELEASE_REVIEW_LAW_VERSION },
    sources,
    standing: { verdict: standingVerdict, arcNights, provisionalExited },
    path: releaseReviewPath(reads, repairBudget),
    headline,
  };
}
