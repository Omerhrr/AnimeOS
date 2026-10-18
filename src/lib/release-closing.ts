// ─────────────────────────────────────────────────────────────
// THE CLOSING LAW (iteration 234) - the path's last step, executed.
//
// The 232 review drew the map and its final step spoke the rule:
// "when every scored source reads p10 >= floor AND mean >= floor,
// the verdict turns RELEASE and the episode stages for publish".
// The 233 ride made the repair step executable; the tail's own
// answerer (234) makes the night-law step executable - and the
// closing step still stood as prose: the publish staging machinery
// existed (stagePublishPackage, the 101 spine's own gate) but
// nothing read the REVIEW's standing before knocking on it.
//
// The gap was a real law seam: the spine's publish gate reads ONE
// source (the loader's RENDER default), while the review's standing
// reads EVERY scored source - one refused source refuses the
// episode. The stricter gate must answer FIRST: the closing law
// reads the review's own standing and refuses the staging while any
// scored source sits outside the floor; only an all-RELEASE review
// sends the staging through - and the spine's own gate still
// answers again at the staging (two gates in sequence, the
// stricter first, the teeth stay in the door).
//
// PURE: no db, no fs - the review arrives as the argument (the
// caller built it from the gate's own reads, the 232 purity law
// kept). The refusal is the work order: the per-source refusals
// ride out verbatim (the review's own gapLines - the same words
// the Releases panel renders), so the staging's refusal IS the map.
// ─────────────────────────────────────────────────────────────

import type { DistributionVerdict } from "./identity-matrix";
import type { ReleaseReview } from "./release-review";

export const CLOSING_LAW_VERSION = 234;

/** The closing decision: the review's standing, made executable. */
export interface ClosingStagingDecision {
  /** true only when EVERY scored source reads RELEASE - the review's
   *  own standing law, byte-honest. */
  stage: boolean;
  /** The decision in one line (exact words - the smoke pins them). */
  line: string;
  /** The per-source refusals, verbatim (the review's own gapLines) -
   *  empty when nothing refuses. */
  refusals: string[];
}

/** The compact per-source words the closing line speaks. */
const SOURCE_WORD: Record<DistributionVerdict, string> = {
  RELEASE: "RELEASES",
  HOLD: "HOLDS",
  BELOW: "sits BELOW",
  UNSCORED: "is UNSCORED",
};

/**
 * THE CLOSING DECISION (pure): the review's own standing, turned
 * into the staging order. A non-RELEASE standing refuses with the
 * refusing sources named (their gapLines ride out verbatim - the
 * refusal is the map); a RELEASE standing stages, and the line
 * names the second gate honestly (the spine answers again at the
 * staging - the teeth stay in the door).
 */
export function closingStagingDecision(review: ReleaseReview): ClosingStagingDecision {
  const refusing = review.sources.filter((s) => s.verdict !== "RELEASE");
  const refusals = refusing.map((s) => s.gapLine);
  const compact = review.sources.map((s) => `${s.source} ${SOURCE_WORD[s.verdict]}`).join("; ");
  if (review.standing.verdict !== "RELEASE") {
    return {
      stage: false,
      line: `${review.episodeTag} does not stage - the closing law reads the standing ${review.standing.verdict} and ${refusing.length} scored source(s) sit outside the floor (${compact}) - publish waits on the review's own path: every scored source reading p10 >= floor AND mean >= floor.`,
      refusals,
    };
  }
  return {
    stage: true,
    line: `${review.episodeTag} RELEASES - the closing law stages the publish: every scored source reads p10 >= floor AND mean >= floor (${compact}). The spine's own gate answers again at the staging - the teeth stay in the door.`,
    refusals,
  };
}
