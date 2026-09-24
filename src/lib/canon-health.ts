import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// CANON HEALTH - the universe's rules get a report card
//
// Every universe-facts vision check lands FACT_HELD / FACT_BROKEN
// continuity events (one per fact per checked panel; prior verdicts
// for the same panel are replaced). This module reads that verdict
// history back as a HEALTH READOUT:
//
//   per fact    - how many audited panels the fact appears in, how
//                 often it held, whether it is currently violated
//                 (a confident BROKEN verdict), or never checked.
//   production  - a 0..1 canon score mixing COVERAGE (share of
//                 active facts the audits actually reached) and
//                 HOLD RATE (how often checked facts held), with
//                 14-day trend counts on top.
//
// The score is deliberately honest: an unchecked canon is not a
// healthy canon, so unverified facts pull coverage down and the
// digest names them. Pure helpers are exported for the E2E.
// ─────────────────────────────────────────────────────────────

export type FactHealthStatus = "HELD" | "VIOLATED" | "UNVERIFIED";
export type CanonBand = "HEALTHY" | "WATCH" | "DRIFTING";

export interface FactHealthRow {
  factId: string;
  text: string;
  category: string;
  active: boolean;
  status: FactHealthStatus;
  checkedPanels: number; // audited panels where this fact was judged
  held: number;
  broken: number;
  worstBrokenConfidence: number | null; // worst confident violation (0..1)
  lastCheckedAt: string | null;
  lastConfidence: number | null;
  lastNote: string;
}

export interface CanonHealthDigest {
  score: number | null; // 0..1, null when the production has no active facts
  band: CanonBand | null;
  activeFacts: number;
  verifiedFacts: number; // active facts with at least one verdict
  violatedFacts: number; // active facts currently broken on some panel
  coverage: number | null; // verified / active
  holdRate: number | null; // held / (held + broken) across all verdict events
  recent: { held: number; broken: number; days: number }; // last N days of verdict events
  worstFacts: FactHealthRow[]; // violated first, then unverified, by confidence
  headline: string;
}

const CONFIDENCE_RE = /confidence (0\.\d+)/;
const NOTE_RE = /confidence [\d.]+\s*-\s*([^\n]*)$/;

/** Band for a canon score. */
export function canonBand(score: number): CanonBand {
  if (score >= 0.85) return "HEALTHY";
  if (score >= 0.55) return "WATCH";
  return "DRIFTING";
}

/**
 * Roll raw verdict events (FACT_HELD / FACT_BROKEN) into per-fact
 * health. Matching is by the event's entityName, which stores the
 * fact text sliced to 90 chars. Pure - the E2E drives it directly.
 */
export function factHealthFromEvents(
  facts: Array<{ id: string; text: string; category: string; active: boolean }>,
  events: Array<{ entityName: string; kind: string; description: string; createdAt: Date }>,
): FactHealthRow[] {
  const byFact = new Map<string, Array<{ kind: string; description: string; createdAt: Date }>>();
  for (const ev of events) {
    if (ev.kind !== "FACT_HELD" && ev.kind !== "FACT_BROKEN") continue;
    const list = byFact.get(ev.entityName);
    if (list) list.push(ev);
    else byFact.set(ev.entityName, [ev]);
  }
  return facts.map((f) => {
    const key = f.text.slice(0, 90);
    const rows = byFact.get(key) ?? [];
    const held = rows.filter((r) => r.kind === "FACT_HELD").length;
    const broken = rows.filter((r) => r.kind === "FACT_BROKEN").length;
    const checkedPanels = rows.length;
    const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const last = sorted[0] ?? null;
    const confidences = rows
      .map((r) => r.description.match(CONFIDENCE_RE)?.[1])
      .filter((v): v is string => Boolean(v))
      .map(Number);
    const brokenConfs = rows
      .filter((r) => r.kind === "FACT_BROKEN")
      .map((r) => Number(r.description.match(CONFIDENCE_RE)?.[1] ?? 0));
    const status: FactHealthStatus = broken > 0 ? "VIOLATED" : checkedPanels > 0 ? "HELD" : "UNVERIFIED";
    const lastNote = last ? (last.description.match(NOTE_RE)?.[1] ?? "").trim() : "";
    return {
      factId: f.id,
      text: f.text,
      category: f.category,
      active: f.active,
      status,
      checkedPanels,
      held,
      broken,
      worstBrokenConfidence: brokenConfs.length > 0 ? Math.max(...brokenConfs) : null,
      lastCheckedAt: last ? last.createdAt.toISOString() : null,
      lastConfidence: confidences.length > 0 ? confidences[0] : null,
      lastNote,
    };
  });
}

/** Production canon score: 0.4 coverage + 0.6 hold rate over ACTIVE facts. Pure. */
export function canonScoreFromRows(rows: FactHealthRow[]): { score: number | null; coverage: number | null; holdRate: number | null } {
  const active = rows.filter((r) => r.active);
  if (active.length === 0) return { score: null, coverage: null, holdRate: null };
  const verified = active.filter((r) => r.checkedPanels > 0).length;
  const coverage = verified / active.length;
  const held = active.reduce((a, r) => a + r.held, 0);
  const broken = active.reduce((a, r) => a + r.broken, 0);
  const holdRate = held + broken > 0 ? held / (held + broken) : null;
  // an unchecked canon is not a healthy canon: missing hold rate reads as 0.5
  const score = 0.4 * coverage + 0.6 * (holdRate ?? 0.5);
  return { score, coverage, holdRate };
}

/** Everything the Continuity view's canon-health panel needs in one GET. */
export async function canonHealthData(projectId: string): Promise<{ digest: CanonHealthDigest; rows: FactHealthRow[] }> {
  const [facts, events] = await Promise.all([
    db.universeFact.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.continuityEvent.findMany({
      where: { projectId, kind: { in: ["FACT_HELD", "FACT_BROKEN"] } },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
  ]);
  const rows = factHealthFromEvents(facts, events);
  const { score, coverage, holdRate } = canonScoreFromRows(rows);

  const since = Date.now() - 14 * 24 * 3600 * 1000;
  const recentHeld = events.filter((e) => e.kind === "FACT_HELD" && e.createdAt.getTime() >= since).length;
  const recentBroken = events.filter((e) => e.kind === "FACT_BROKEN" && e.createdAt.getTime() >= since).length;

  const activeRows = rows.filter((r) => r.active);
  const verified = activeRows.filter((r) => r.checkedPanels > 0).length;
  const violated = activeRows.filter((r) => r.status === "VIOLATED").length;
  const band = score == null ? null : canonBand(score);

  const rank = (r: FactHealthRow) => (r.status === "VIOLATED" ? 0 : r.status === "UNVERIFIED" ? 1 : 2);
  const worstFacts = [...activeRows]
    .sort((a, b) => rank(a) - rank(b) || (b.worstBrokenConfidence ?? 0) - (a.worstBrokenConfidence ?? 0))
    .slice(0, 5);

  let headline: string;
  if (activeRows.length === 0) {
    headline = "no active facts registered - the canon is empty (add_universe_fact)";
  } else if (verified === 0) {
    headline = `${activeRows.length} active fact(s), none audited yet - run check_universe_facts on a hero panel`;
  } else {
    headline = `score ${(score! * 100).toFixed(0)}% ${band} - ${verified}/${activeRows.length} active fact(s) audited, ${violated} violated, hold rate ${holdRate == null ? "n/a" : `${(holdRate * 100).toFixed(0)}%`}`;
  }

  return {
    digest: {
      score,
      band,
      activeFacts: activeRows.length,
      verifiedFacts: verified,
      violatedFacts: violated,
      coverage,
      holdRate,
      recent: { held: recentHeld, broken: recentBroken, days: 14 },
      worstFacts,
      headline,
    },
    rows,
  };
}
