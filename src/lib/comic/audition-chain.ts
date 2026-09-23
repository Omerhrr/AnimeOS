// ─────────────────────────────────────────────────────────────
// A/B chaining over a state's audition history: the casting board
// lets the director pick ANY two recorded reads as sides A and B
// and hear them back to back. Pure layer: the pick / swap / clear
// semantics live here so the component stays thin and the rules
// stay testable.
// ─────────────────────────────────────────────────────────────

export interface ChainPair {
  aId: string | null;
  bId: string | null;
}

/**
 * Pick one history row as a chain side. Re-picking the row that
 * already holds a side unpicks it; picking a row that holds the
 * OTHER side swaps the slots, so A and B always stay two different
 * reads and a pick never silently drops the other side.
 */
export function pickChainSide(pair: ChainPair, rowId: string, side: "A" | "B"): ChainPair {
  const { aId, bId } = pair;
  if (side === "A") {
    if (aId === rowId) return { aId: null, bId };
    if (bId === rowId) return { aId: rowId, bId: aId };
    return { aId: rowId, bId };
  }
  if (bId === rowId) return { aId, bId: null };
  if (aId === rowId) return { aId: bId, bId: rowId };
  return { aId, bId: rowId };
}

/** Swap the two picked sides: the same pair, played in the other order. */
export function swapChainSides(pair: ChainPair): ChainPair {
  return { aId: pair.bId, bId: pair.aId };
}

/** Clear one side, or the whole pair when no side is given. */
export function clearChainSides(pair: ChainPair, side?: "A" | "B"): ChainPair {
  if (side === "A") return { aId: null, bId: pair.bId };
  if (side === "B") return { aId: pair.aId, bId: null };
  return { aId: null, bId: null };
}
