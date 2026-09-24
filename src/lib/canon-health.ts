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
  retireSuggestions: number; // facts suggested for rewording or retirement
  headline: string;
}

// ─── Per-fact auto-retire suggestions ────────────────────────
//
// A fact that fails on EVERY audited panel is usually not a broken
// panel - it is a fact written in a way the art keeps failing (too
// absolute, wrong scope, judging composition instead of canon).
// Re-painting around it is waste: the suggestion is to REWORD it or
// RETIRE it. A fact earns the suggestion when it has enough audits
// (>= RETIRE_MIN_PANELS) and its hold rate fell below
// RETIRE_HOLD_RATE. Pure - the E2E drives it directly.

export const RETIRE_MIN_PANELS = 3; // audits before a fact can earn the suggestion
export const RETIRE_HOLD_RATE = 0.34; // held/(held+broken) below this line

export interface RetireSuggestion {
  factId: string;
  text: string;
  category: string;
  checkedPanels: number;
  held: number;
  broken: number;
  holdRate: number; // 0..1
  worstBrokenConfidence: number | null;
  trend: FactDriftTrend | null; // the drift curve's verdict, when one drove or backed the suggestion
  delta: number | null; // curve delta (last - first confidence), when known
  reason: string;
}

// A fact can earn the suggestion two ways: the HOLD RATE rule above,
// or its DRIFT CURVE - confidence sliding steadily down episode over
// episode is the same writing problem seen one episode earlier (the
// violations have not all landed yet). Pure - the E2E drives it.
export const CURVE_SUGGEST_DELTA = 0.12; // |delta| a DECLINING curve must exceed
export const CURVE_SUGGEST_MIN_PANELS = 3; // curve points before the trend counts

/** Facts whose audit history OR drift curve says "the wording keeps failing". Pure. */
export function retireSuggestionsFromRows(rows: FactHealthRow[], curves: FactDrift[] = []): RetireSuggestion[] {
  const holdRatePicks = rows
    .filter((r) => r.active && r.checkedPanels >= RETIRE_MIN_PANELS)
    .map((r) => ({ row: r, holdRate: r.held / r.checkedPanels }))
    .filter(({ holdRate }) => holdRate < RETIRE_HOLD_RATE)
    .map(({ row, holdRate }) => {
      const curve = curves.find((c) => c.factId === row.factId);
      const trendNote = curve?.trend === "DECLINING" && curve.delta != null
        ? `, and the curve is sliding ${(curve.delta * 100).toFixed(0)}%`
        : "";
      return {
        factId: row.factId,
        text: row.text,
        category: row.category,
        checkedPanels: row.checkedPanels,
        held: row.held,
        broken: row.broken,
        holdRate,
        worstBrokenConfidence: row.worstBrokenConfidence,
        trend: (curve?.trend ?? null) as FactDriftTrend | null,
        delta: curve?.delta ?? null,
        reason: `failed on ${row.broken} of ${row.checkedPanels} audited panels (hold rate ${(holdRate * 100).toFixed(0)}%${trendNote}) - the wording keeps failing, reword or retire it instead of re-painting every panel`,
      };
    });

  const picked = new Set(holdRatePicks.map((s) => s.factId));
  const activeById = new Map(rows.map((r) => [r.factId, r]));
  const curvePicks = curves
    .filter((c) =>
      !picked.has(c.factId)
      && c.trend === "DECLINING"
      && c.delta != null
      && c.delta <= -CURVE_SUGGEST_DELTA
      && c.panels >= CURVE_SUGGEST_MIN_PANELS
      && activeById.get(c.factId)?.active === true)
    .map((c) => {
      const held = Math.round(c.holdRate * c.panels);
      return {
        factId: c.factId,
        text: c.text,
        category: c.category,
        checkedPanels: c.panels,
        held,
        broken: c.panels - held,
        holdRate: c.holdRate,
        worstBrokenConfidence: null as number | null,
        trend: "DECLINING" as FactDriftTrend,
        delta: c.delta,
        reason: `confidence sliding ${(c.delta! * 100).toFixed(0)}% across ${c.panels} audited panels over episode order (${(c.holdRate * 100).toFixed(0)}% held so far) - the wording is drifting out of holdable territory, reword or retire it before the re-render queue floods`,
      };
    });

  return [...holdRatePicks, ...curvePicks].sort(
    (a, b) => a.holdRate - b.holdRate || (a.delta ?? 0) - (b.delta ?? 0),
  );
}

// ─── Fact-level drift curves ─────────────────────────────────
//
// The character curves ask "is the ART sliding?"; the fact curves
// ask "is the AUDIT JUDGMENT sliding?" - a fact's per-panel
// confidence laid over episode order. A fact whose verdict
// confidence declines across the show is heading for a violation
// streak (or was written too loosely in the first place); the curve
// makes that visible before the queue floods.

export interface FactDriftPoint {
  episode: number;
  confidence: number; // 0..1 from the verdict
  holds: boolean;
  at: string;
}

export type FactDriftTrend = "IMPROVING" | "DECLINING" | "STABLE" | "FLAT";

export interface FactDrift {
  factId: string;
  text: string;
  category: string;
  points: FactDriftPoint[]; // ordered by episode, then check time
  first: number | null;
  last: number | null;
  delta: number | null; // last confidence - first (null with <2 points)
  trend: FactDriftTrend;
  holdRate: number; // held / checked across the curve
  panels: number;
}

export const FACT_DRIFT_TREND_THRESHOLD = 0.05; // |delta| below this reads as stable

function factDriftTrend(delta: number | null, panels: number): FactDriftTrend {
  if (panels < 2 || delta == null) return "FLAT";
  if (delta <= -FACT_DRIFT_TREND_THRESHOLD) return "DECLINING";
  if (delta >= FACT_DRIFT_TREND_THRESHOLD) return "IMPROVING";
  return "STABLE";
}

/**
 * Roll verdict events into per-fact confidence curves over episode
 * order. Events without a parseable confidence or episode position
 * are skipped (a curve point needs both). Pure - the E2E drives it.
 */
export function factDriftFromEvents(
  facts: Array<{ id: string; text: string; category: string; active: boolean }>,
  events: Array<{ entityName: string; kind: string; description: string; episodeNumber: number | null; createdAt: Date }>,
): FactDrift[] {
  const byFact = new Map<string, Array<{ kind: string; description: string; episodeNumber: number | null; createdAt: Date }>>();
  for (const ev of events) {
    if (ev.kind !== "FACT_HELD" && ev.kind !== "FACT_BROKEN") continue;
    const list = byFact.get(ev.entityName);
    if (list) list.push(ev);
    else byFact.set(ev.entityName, [ev]);
  }
  return facts
    .map((f) => {
      const rows = byFact.get(f.text.slice(0, 90)) ?? [];
      const points: FactDriftPoint[] = rows
        .map((r) => ({
          confidence: Number(r.description.match(CONFIDENCE_RE)?.[1] ?? NaN),
          holds: r.kind === "FACT_HELD",
          episode: r.episodeNumber,
          at: r.createdAt,
        }))
        .filter((p) => Number.isFinite(p.confidence) && p.episode != null)
        .sort((a, b) => a.episode! - b.episode! || a.at.getTime() - b.at.getTime())
        .map((p) => ({ episode: p.episode!, confidence: Math.min(1, Math.max(0, p.confidence)), holds: p.holds, at: p.at.toISOString() }));
      const first = points.length > 0 ? points[0].confidence : null;
      const last = points.length > 0 ? points[points.length - 1].confidence : null;
      const delta = first != null && last != null && points.length >= 2 ? last - first : null;
      const held = points.filter((p) => p.holds).length;
      return {
        factId: f.id,
        text: f.text,
        category: f.category,
        points,
        first,
        last,
        delta,
        trend: factDriftTrend(delta, points.length),
        holdRate: points.length > 0 ? held / points.length : 0,
        panels: points.length,
      };
    })
    .filter((c) => c.panels > 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)); // steepest decline first
}

export interface FactDriftData {
  curves: FactDrift[]; // every curved fact, steepest decline first
  watch: FactDrift[]; // the DECLINING subset
  headline: string;
}

/** Per-fact confidence curves over episode order for one production. */
export async function factDriftData(projectId: string): Promise<FactDriftData> {
  const [facts, events] = await Promise.all([
    db.universeFact.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.continuityEvent.findMany({
      where: { projectId, kind: { in: ["FACT_HELD", "FACT_BROKEN"] } },
      orderBy: { createdAt: "desc" as const },
      take: 400,
    }),
  ]);
  const curves = factDriftFromEvents(facts, events);
  const watch = curves.filter((c) => c.trend === "DECLINING");
  const headline = curves.length === 0
    ? "no fact drift curves yet - audit a few panels"
    : watch.length > 0
      ? `${watch.length} of ${curves.length} curved fact(s) DECLINING over episode order: ${watch.map((c) => `"${c.text.slice(0, 40)}" ${(c.delta! * 100).toFixed(0)}%`).join(", ")}`
      : `${curves.length} fact curve(s), none declining`;
  return { curves, watch, headline };
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
export async function canonHealthData(projectId: string): Promise<{ digest: CanonHealthDigest; rows: FactHealthRow[]; suggestions: RetireSuggestion[]; drift: FactDriftData }> {
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
  const drift = await factDriftData(projectId).catch(() => ({ curves: [], watch: [], headline: "fact drift curves unavailable" } as FactDriftData));
  const suggestions = retireSuggestionsFromRows(rows, drift.curves);

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
    const retireNote = suggestions.length > 0 ? `, ${suggestions.length} suggested for rewording/retirement` : "";
    headline = `score ${(score! * 100).toFixed(0)}% ${band} - ${verified}/${activeRows.length} active fact(s) audited, ${violated} violated${retireNote}, hold rate ${holdRate == null ? "n/a" : `${(holdRate * 100).toFixed(0)}%`}`;
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
      retireSuggestions: suggestions.length,
      headline,
    },
    rows,
    suggestions,
    drift,
  };
}
