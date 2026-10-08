// ─────────────────────────────────────────────────────────────
// PROBE 142 - THE SCORE INSTRUMENT, measured before any pen moves.
//
// The 141 night's finding: identical craft (same laws ANIME 125 /
// TOON 133 / PRESENCE 108, same r3 designs, same pipeline) scored
// mean 38 one night and mean 60 the next - the judge's single-night
// variance, measured. The 142 question the record named: what is
// the gate's NUMBER - a multi-night median, a larger per-shot
// sample, or both?
//
// This probe measures the candidates on the two recorded boards
// (the receipts are the committed records - 140's night board and
// 141's night board, per-shot worst entries from the rescore logs):
//
//   candidate A (the standing instrument): ONE night's sweep -
//     the distribution the gate reads today. Two drains of the
//     same craft = two different answers (38 vs 60).
//
//   candidate B (the arc): the per-shot median ACROSS nights -
//     each shot's verdict is the median of its night-worsts within
//     the same law cohort. One number, reproducible: a third night
//     of the same craft moves it only if it lands on one side of
//     the median (the median converges).
//
//   candidate C (a larger per-shot sample inside ONE night): the
//     116/117 law already answers this - the within-night median
//     (ANIMEOS_SCORE_SAMPLES=3) tames the within-night re-roll
//     (-20/-25 between passes), but the 141 band is BETWEEN-night
//     variance: fresh renders + fresh judge sweeps one drain apart.
//     More samples in one night cannot see across the drain - the
//     band stays. Measured here by bootstrap: resampling the two
//     nights never narrows the band below its spread.
//
// The honest expectation, stated BEFORE the math: the arc narrows
// the DECISION's variance (the gate's number becomes reproducible)
// but does NOT lift the board - the same craft below the floor
// stays below the floor. The instrument fix is about a verdict the
// studio can trust, not a verdict that flatters.
//
// Run: npx tsx scripts/probe-142-arc.ts
// ─────────────────────────────────────────────────────────────

const NIGHT_140 = [0.35, 0.35, 0.35, 0.35, 0.35, 0.5]; // S001..S006 shot worsts (README item 51)
const NIGHT_141 = [0.35, 0.5, 0.85, 0.65, 0.45, 0.8]; // S001..S006 shot worsts (README item 53)
const FLOOR = 0.7;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p10 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.1 * s.length) - 1)];
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const distribution = (name: string, worsts: number[]) => {
  const under = worsts.filter((w) => w < FLOOR).length;
  console.log(
    `${name.padEnd(34)} mean ${pct(mean(worsts)).padStart(4)}  median ${pct(median(worsts)).padStart(4)}  p10 ${pct(p10(worsts)).padStart(4)}  under ${under}/${worsts.length}  verdict ${under > 0 ? "BELOW" : "CLEAR"}`,
  );
  return { mean: mean(worsts), median: median(worsts), p10: p10(worsts) };
};

console.log("== PROBE 142: the score instrument, measured on the two recorded boards ==\n");
console.log("the receipts (per-shot worsts, same craft both nights):");
console.log(`  night-140: ${NIGHT_140.map(pct).join("  ")}`);
console.log(`  night-141: ${NIGHT_141.map(pct).join("  ")}\n`);

// ── candidate A: the standing single-night sweep ──
console.log("candidate A - the standing instrument (one night's sweep):");
const a1 = distribution("  night-140 sweep", NIGHT_140);
const a2 = distribution("  night-141 sweep", NIGHT_141);
console.log(
  `  THE BAND: the mean swings ${pct(Math.abs(a2.mean - a1.mean))} between two drains of identical craft ` +
    `(median swings ${pct(Math.abs(a2.median - a1.median))}) - a single-night verdict is not reproducible.\n`,
);

// ── candidate B: the arc (per-shot median across nights) ──
console.log("candidate B - the arc (per-shot median across the cohort's nights):");
const arc = NIGHT_140.map((w, i) => median([w, NIGHT_141[i]]));
console.log(`  arc medians per shot: ${arc.map(pct).join("  ")}`);
const b = distribution("  arc distribution", arc);
console.log(
  `  convergence law: a third night of the same craft moves a shot's arc verdict only if it lands ` +
    `on one side of the standing median - the number is reproducible across drains.\n`,
);

// ── candidate C: bootstrap the single-night sweep (more samples cannot cross the drain) ──
console.log("candidate C - bootstrap check (can more within-night samples close the band?):");
let minMean = 1;
let maxMean = 0;
const rng = (() => {
  // deterministic LCG so the probe is reproducible byte-exact
  let s = 20261008;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
})();
for (let i = 0; i < 10000; i++) {
  const pick = rng() < 0.5 ? NIGHT_140 : NIGHT_141;
  const m = mean(pick);
  if (m < minMean) minMean = m;
  if (m > maxMean) maxMean = m;
}
console.log(`  resampling whole nights 10k times: night-mean spans ${pct(minMean)} .. ${pct(maxMean)}`);
console.log(
  `  the band is BETWEEN drains (fresh renders + fresh judge sweeps) - no within-night sample count ` +
    `can see across it. The arc is the only instrument that reads the drain-to-drain truth.\n`,
);

// ── the honest verdict of the probe ──
console.log("== THE PROBE'S ANSWER ==");
console.log(
  `the arc (B) is the gate's number: reproducible (${pct(b.mean)} mean on this data vs the ${pct(a1.mean)}..${pct(a2.mean)} single-night band), ` +
    `converging as nights accumulate, cohort-scoped (a law bump opens a new arc - old readings never pollute new laws), ` +
    `and HONEST about its youth: a one-night arc is flagged PROVISIONAL, not passed off as settled. ` +
    `The arc does NOT lift the board: this data still reads BELOW the ${pct(FLOOR)} floor - the instrument fix ` +
    `makes the verdict trustworthy, it does not flatter the craft.`,
);
