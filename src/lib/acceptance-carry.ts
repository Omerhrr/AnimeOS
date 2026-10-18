// ─────────────────────────────────────────────────────────────
// THE ACCEPTANCE'S VERDICT, CARRIED (iteration 235) - the answer
// rides with the next night.
//
// The 234 acceptance night answered the night130 gate for Lin Yue:
// the honest receipt stands (the build wears the design's dye class),
// the reference does not move, and the 149 law named the only lever
// left - "the craft lever for a score is the craft, never a moved
// goalpost". The 235 frontier's own sentence: the repair pass's next
// nights ride the named cells WITH THE ACCEPTANCE'S VERDICT IN HAND.
// What stood between that sentence and the machinery: the next night
// never NAMED what the last acceptance answered - the pass would
// re-run the beat silently, the ledger would carry two answers and
// name neither's continuity, and "in hand" stayed prose.
//
// THE LAW, in three moves:
//
//   (a) THE CARRY IS THE NEWEST ANSWER, NAMED. Per member, the
//       newest acceptance night's own verdict rides forward - the
//       line speaks the continuity (what the arc already answered)
//       and the lever sentence verbatim. Nights carry ISO day tags,
//       so the newest day wins; a tie keeps the later entry (the
//       ledger's own append order).
//
//   (b) THE CARRY NEVER SKIPS THE GATE. Naming what the acceptance
//       answered is continuity, not a verdict cache: the build may
//       have moved since the night answered (a re-craft, a re-dye),
//       and the 149 law's beat answers when it runs. The carry makes
//       the ledger honest at the seam between nights; it does not
//       stand between the beat and its own gate.
//
//   (c) THE CLASSIFICATION IS THE BEAT'S OWN VOCABULARY. A ride
//       receipt's acceptance row carries the beat's fields; the
//       classifier reads them honestly - an accepted sheet moved the
//       reference (the owed regeneration landed), the honest receipt
//       stands named in the beat's own words, and a row that names
//       neither carries NONE (named, never guessed).
//
// PURE: no db, no fs - the entries arrive as the argument (the
// caller gathered them from the receipts and the arc), the words are
// the law's own. The smoke pins the exact words; the rides carry
// them into the receipts.
// ─────────────────────────────────────────────────────────────

export const ACCEPTANCE_CARRY_LAW_VERSION = 235;

/** The beat's own verdict vocabulary (reanchor.ts's gate answers). */
export type CarriedVerdict = "STAND_DOWN_HONEST" | "REGEN_OWED" | "NONE";

/** One acceptance answer the caller carries in (from a ride receipt's
 *  acceptance row, or any prior night's beat answer). */
export interface CarryEntry {
  /** The night the answer rode (ISO day tag inside - acceptance-YYYY-MM-DD). */
  night: string;
  characterName: string;
  verdict: CarriedVerdict;
  /** The beat's own note (the dyes, the debt) - carried verbatim when set. */
  note?: string;
  /** The night's reading for the member, when the caller carries it. */
  similarity?: number | null;
}

/** The carried answer one member's next night rides with. */
export interface CarriedAcceptance {
  characterName: string;
  /** The night the answer rode; null when no answer exists. */
  night: string | null;
  verdict: CarriedVerdict;
  /** The carried line (exact words - the smoke pins them). */
  line: string;
}

const STAND_DOWN_WORDS =
  "the honest receipt stands - the reference does not move, and the craft lever for a score is the craft, never a moved goalpost";
const REGEN_WORDS = "the build owed its candidates and the sheet's answer landed - the reference moved as the acceptance accepted it";
const NONE_WORDS = "carries no acceptance answer yet - the acceptance waits for its own night, and the beat answers when it runs.";

/**
 * THE CARRY LAW (pure): per member, the newest acceptance night's
 * verdict rides forward named. A member with no entry carries NONE -
 * honestly named, never implied.
 */
export function carriedAcceptanceVerdicts(entries: CarryEntry[], memberNames: string[]): CarriedAcceptance[] {
  const newest = new Map<string, CarryEntry>();
  for (const e of entries) {
    const name = e.characterName.trim();
    if (!name) continue;
    const prev = newest.get(name);
    // the newest day wins (ISO day tags sort); a tie keeps the later entry
    if (!prev || e.night >= prev.night) newest.set(name, e);
  }
  return memberNames.map((name) => {
    const e = newest.get(name);
    if (!e) {
      return { characterName: name, night: null, verdict: "NONE" as const, line: `${name} ${NONE_WORDS}` };
    }
    const note = e.note ? ` (${e.note})` : "";
    if (e.verdict === "STAND_DOWN_HONEST") {
      return {
        characterName: name,
        night: e.night,
        verdict: e.verdict,
        line: `${name} rides the acceptance's own answer (${e.night}): ${STAND_DOWN_WORDS}${note}`,
      };
    }
    if (e.verdict === "REGEN_OWED") {
      return {
        characterName: name,
        night: e.night,
        verdict: e.verdict,
        line: `${name} rides the acceptance's own answer (${e.night}): ${REGEN_WORDS}${note}`,
      };
    }
    return { characterName: name, night: e.night, verdict: "NONE" as const, line: `${name} ${NONE_WORDS}` };
  });
}

/**
 * THE CLASSIFIER (pure): a ride receipt's acceptance row, read into
 * carry entries in the beat's own vocabulary. An accepted sheet means
 * the owed regeneration landed (REGEN_OWED); the honest receipt
 * stands named in the beat's own words (STAND_DOWN_HONEST); anything
 * else is honestly NONE.
 */
export function carryEntriesFromRideReceipts(
  rows: Array<{
    kind?: string;
    night?: string;
    members?: Array<{
      name?: string;
      reanchored?: boolean;
      reanchorNote?: string | null;
      shots?: Array<{ after?: number | null }>;
    }>;
  }>,
): CarryEntry[] {
  const out: CarryEntry[] = [];
  for (const row of rows) {
    if (row.kind !== "acceptance" || !row.night) continue;
    for (const m of row.members ?? []) {
      const name = (m.name ?? "").trim();
      if (!name) continue;
      const note = (m.reanchorNote ?? "").trim();
      let verdict: CarriedVerdict = "NONE";
      if (m.reanchored) verdict = "REGEN_OWED";
      else if (note.includes("honest receipt stands")) verdict = "STAND_DOWN_HONEST";
      // the night's own reading rides when the row carries one (the
      // member's freshest after reading on the acceptance night)
      const afters = (m.shots ?? []).map((s) => s.after).filter((a): a is number => typeof a === "number" && Number.isFinite(a));
      out.push({
        night: row.night,
        characterName: name,
        verdict,
        ...(note ? { note } : {}),
        ...(afters.length > 0 ? { similarity: Math.min(...afters) } : {}),
      });
    }
  }
  return out;
}
