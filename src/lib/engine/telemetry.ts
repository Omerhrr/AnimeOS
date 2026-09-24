// ─────────────────────────────────────────────────────────────
// PER-PROVIDER RENDER TELEMETRY (latency + cost readout)
//
// A render job may be worked on by MORE than one provider: an
// img2vid provider can be lost mid-job and the MOTION engine takes
// over; a Blender bridge can drop to the simulator. Each provider
// that actually worked on the job records a SPAN (its wall-clock
// latency); takeovers are remembered as a trail so the readout can
// show the chain. Cost is a documented per-provider estimate over
// the clip's seconds - local engines bill compute only, the hosted
// interpolation model bills per clip-second.
//
// Everything here is pure so the E2E can exercise the math and the
// parsing without a render.
// ─────────────────────────────────────────────────────────────

export interface TelemetrySpan {
  provider: string; // BLENDER | BLENDER_LOCAL | IMG2VID | MOTION | SIMULATOR
  ms: number; // wall-clock latency of this provider's work
  note?: string; // e.g. "z.ai interpolation model" or the takeover reason
}

export interface JobTelemetry {
  spans: TelemetrySpan[];
  takeovers: string[]; // human-readable trail: "IMG2VID provider lost -> MOTION engine"
  totalMs: number;
  credits: number; // estimated cost for the whole job
}

/**
 * Documented cost rates. creditsPerClipSecond is the estimate billed
 * per second of finished clip; label names the meter on the readout.
 * Local engines (Blender workers, the built-in MOTION engine, the
 * simulator) bill zero credits - their readout is latency only.
 */
export const PROVIDER_RATES: Record<string, { creditsPerClipSecond: number; label: string }> = {
  BLENDER: { creditsPerClipSecond: 0, label: "workstation Cycles" },
  BLENDER_LOCAL: { creditsPerClipSecond: 0, label: "local compute" },
  MOTION: { creditsPerClipSecond: 0, label: "built-in ffmpeg" },
  IMG2VID: { creditsPerClipSecond: 2, label: "hosted interpolation" },
  SIMULATOR: { creditsPerClipSecond: 0, label: "wall-clock" },
};

/** Defensive parse of a stored telemetry JSON string. */
export function parseTelemetry(raw: string | null | undefined): JobTelemetry | null {
  if (!raw) return null;
  try {
    const body = JSON.parse(raw) as Partial<JobTelemetry>;
    if (!body || !Array.isArray(body.spans)) return null;
    const spans = body.spans
      .filter((s) => s && typeof s.provider === "string" && Number.isFinite(s.ms) && (s.ms as number) >= 0)
      .map((s) => ({ provider: String(s.provider), ms: Math.round(s.ms as number), ...(s.note ? { note: String(s.note) } : {}) }));
    const takeovers = Array.isArray(body.takeovers) ? body.takeovers.map(String) : [];
    const totalMs = spans.reduce((n, s) => n + s.ms, 0);
    return {
      spans,
      takeovers,
      totalMs,
      credits: Number.isFinite(body.credits) ? Math.max(0, Math.round(body.credits as number)) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Close a provider span at completion time. Called by every driver
 * completion path with the job's CURRENT startedAt (takeover paths
 * reset it, so each span measures only its own provider's work).
 * If the previous telemetry already ends with the same provider
 * (e.g. a retry inside the same driver), the span extends instead
 * of stacking a duplicate.
 */
export function closeSpan(
  prevRaw: string | null | undefined,
  provider: string,
  startedAt: Date | null | undefined,
  finishedAt: Date,
  note?: string,
): JobTelemetry {
  const prev = parseTelemetry(prevRaw);
  const spans: TelemetrySpan[] = prev ? [...prev.spans] : [];
  const takeovers = prev ? [...prev.takeovers] : [];
  const ms = Math.max(0, startedAt ? finishedAt.getTime() - startedAt.getTime() : 0);
  const last = spans[spans.length - 1];
  if (last && last.provider === provider) {
    spans[spans.length - 1] = { ...last, ms: last.ms + ms };
  } else {
    spans.push({ provider, ms, ...(note ? { note } : {}) });
  }
  const totalMs = spans.reduce((n, s) => n + s.ms, 0);
  return { spans, takeovers, totalMs, credits: 0 };
}

/**
 * Record a takeover trail entry (the chain survives on the readout:
 * "IMG2VID provider lost, MOTION took over"). Returns the updated
 * telemetry JSON string to persist alongside the driver switch.
 */
export function addTakeover(prevRaw: string | null | undefined, trail: string): string {
  const prev = parseTelemetry(prevRaw) ?? { spans: [], takeovers: [], totalMs: 0, credits: 0 };
  return JSON.stringify({ ...prev, takeovers: [...prev.takeovers, trail.slice(0, 160)] });
}

/**
 * One-call takeover record for the driver-switch paths: closes the
 * OLD provider's span (measured from the job's pre-switch startedAt)
 * and appends the takeover trail. Returns the persist-ready JSON
 * string; the caller simultaneously resets startedAt for the new
 * provider so the next span measures only its own work.
 */
export function takeoverSpan(
  prevRaw: string | null | undefined,
  provider: string,
  startedAt: Date | null | undefined,
  trail: string,
): string {
  const closed = closeSpan(prevRaw, provider, startedAt, new Date());
  return JSON.stringify({ ...closed, takeovers: [...closed.takeovers, trail.slice(0, 160)] });
}

/** Estimate the job's cost: every hosted span bills rate x clip seconds. */
export function estimateCredits(telemetry: JobTelemetry, clipSeconds: number): number {
  let credits = 0;
  for (const span of telemetry.spans) {
    const rate = PROVIDER_RATES[span.provider]?.creditsPerClipSecond ?? 0;
    if (rate > 0) credits += rate * Math.max(0, clipSeconds);
  }
  return Math.round(credits);
}

/**
 * One-line readout for a queue card:
 * "IMG2VID 48.2s (z.ai) -> MOTION 12.4s - ~34 credits"
 * Local engines render as plain latency; a takeover chain reads
 * left to right in the order the work happened.
 */
export function describeTelemetry(t: JobTelemetry): string {
  const chain = t.spans
    .map((s) => {
      const label = PROVIDER_RATES[s.provider]?.label;
      const note = s.note ?? label;
      return `${s.provider} ${formatSeconds(s.ms)}${note ? ` (${note})` : ""}`;
    })
    .join(" -> ");
  return t.credits > 0 ? `${chain} - ~${t.credits} credits` : chain;
}

export function formatSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Aggregate view for the provider ledger strip: per provider, how
 * many jobs it finished, its total/average latency and the total
 * estimated credits it billed.
 */
export interface ProviderLedgerEntry {
  provider: string;
  jobs: number;
  totalMs: number;
  avgMs: number;
  credits: number;
}

export function providerLedger(telemetries: Array<JobTelemetry | null>): ProviderLedgerEntry[] {
  const map = new Map<string, ProviderLedgerEntry>();
  for (const t of telemetries) {
    if (!t) continue;
    for (const span of t.spans) {
      const row = map.get(span.provider) ?? { provider: span.provider, jobs: 0, totalMs: 0, avgMs: 0, credits: 0 };
      row.jobs += 1;
      row.totalMs += span.ms;
      row.avgMs = Math.round(row.totalMs / row.jobs);
      map.set(span.provider, row);
    }
  }
  // credits attribute to the job's FINAL provider (the one that
  // actually delivered the clip), not split across the chain
  for (const t of telemetries) {
    if (!t || t.credits <= 0 || t.spans.length === 0) continue;
    const last = t.spans[t.spans.length - 1];
    const row = map.get(last.provider);
    if (row) row.credits += t.credits;
  }
  return [...map.values()].sort((a, b) => b.jobs - a.jobs || b.totalMs - a.totalMs);
}

/** Persist-ready telemetry for a finishing job (credits estimated from the clip length). */
export function finishTelemetry(
  prevRaw: string | null | undefined,
  provider: string,
  startedAt: Date | null | undefined,
  clipSeconds: number,
  note?: string,
): JobTelemetry {
  const t = closeSpan(prevRaw, provider, startedAt, new Date(), note);
  return { ...t, credits: estimateCredits(t, clipSeconds) };
}
