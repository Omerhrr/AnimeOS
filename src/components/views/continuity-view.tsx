"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Loader2, ScanEye, Globe2, RefreshCw, Wand2, Trash2, Power, Play, Pause, Square, PaintRoller, Fingerprint, Activity, HeartPulse, Clapperboard } from "lucide-react";
import { api } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const KIND_COLORS: Record<string, string> = {
  DESTROYED: "border-rose-400/40 text-rose-300 bg-rose-400/10",
  INJURED: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  LOST: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  GAINED: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  TRANSFORMED: "border-violet-400/40 text-violet-300 bg-violet-400/10",
  ART_DRIFT: "border-rose-400/40 text-rose-300 bg-rose-400/10",
  ART_VERIFIED: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  IDENTITY_DRIFT: "border-rose-400/40 text-rose-300 bg-rose-400/10",
  IDENTITY_VERIFIED: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  FACT_BROKEN: "border-rose-400/40 text-rose-300 bg-rose-400/10",
  FACT_HELD: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  CUSTOM: "border-white/20 text-muted-foreground bg-white/5",
};

interface ArtItem {
  kind: "stale-state" | "stale-anchor" | "anchor-missing";
  severity: "INFO" | "WARNING";
  characterName: string;
  note: string;
}

interface ArtShotReport {
  shotId: string;
  ref: string;
  episode: number;
  sceneNumber: number;
  number: number;
  description: string;
  hasArt: boolean;
  items: ArtItem[];
}

interface ArtScan {
  shots: ArtShotReport[];
  counts: { staleState: number; staleAnchor: number; anchorMissing: number; checked: number; flagged: number };
}

/**
 * Art-aware continuity: the art layer joins the continuity engine.
 * The scan compares timestamps (panel art vs the episode-active state
 * and the current model-sheet anchor) and coverage (featured cast
 * without a sheet); the VLM check sends a hero panel against the
 * character's canonical sheet and lands an ART_DRIFT / ART_VERIFIED
 * continuity event.
 */
function ArtContinuityPanel({ projectId }: { projectId: string }) {
  const [scan, setScan] = useState<ArtScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ shotRef: string; text: string; clean: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetch(`/api/continuity-art?projectId=${projectId}`);
      const body = (await res.json()) as ArtScan;
      setScan(body);
    } catch {
      setError("Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function runVlmCheck(shotId: string, ref: string) {
    setChecking(shotId);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/continuity-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId }),
      });
      const body = (await res.json()) as { error?: string; verdict?: { summary: string; drift: Array<{ aspect: string; note: string }>; characterName: string | null }; eventKind?: string };
      if (!res.ok || body.error) {
        setVerdict({ shotRef: ref, text: body.error ?? "VLM check failed", clean: false });
      } else if (body.verdict && body.eventKind) {
        const driftTxt = body.verdict.drift.map((d) => `${d.aspect}: ${d.note}`).join("; ");
        setVerdict({
          shotRef: ref,
          text: `${body.eventKind} vs ${body.verdict.characterName}'s sheet - ${body.verdict.summary}${driftTxt ? ` (${driftTxt})` : ""}`,
          clean: body.eventKind === "ART_VERIFIED",
        });
      }
    } catch {
      setVerdict({ shotRef: ref, text: "VLM check failed", clean: false });
    } finally {
      setChecking(null);
    }
  }

  const flagged = (scan?.shots ?? []).filter((s) => s.items.length > 0).slice(0, 8);
  const ITEM_COLORS: Record<string, string> = {
    "stale-state": "border-amber-400/30 text-amber-200 bg-amber-400/10",
    "stale-anchor": "border-violet-400/30 text-violet-200 bg-violet-400/10",
    "anchor-missing": "border-white/20 text-muted-foreground bg-white/5",
  };

  return (
    <div className="studio-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ScanEye className="h-4 w-4 text-teal-300" /> Art-aware continuity
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 max-w-xl">
            The art layer joins the continuity engine: panel art is checked against the episode-active state and the
            character&apos;s canonical model-sheet anchor, and a vision check compares a hero panel against the sheet itself.
          </p>
        </div>
        <Button size="sm" variant="outline" className="border-teal-400/25 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20" onClick={() => void runScan()} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ScanEye className="h-4 w-4 mr-1.5" />}
          Scan art layer
        </Button>
      </div>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}

      {verdict && (
        <div className={cn(
          "rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
          verdict.clean ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-amber-400/25 bg-amber-400/10 text-amber-200"
        )}>
          <span className="font-semibold">{verdict.shotRef}</span> - {verdict.text}
        </div>
      )}

      {scan && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground">{scan.counts.checked} shots checked</span>
          <span className="px-2 py-1 rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-200">{scan.counts.staleState} stale vs state</span>
          <span className="px-2 py-1 rounded-md border border-violet-400/25 bg-violet-400/10 text-violet-200">{scan.counts.staleAnchor} stale vs anchor</span>
          <span className="px-2 py-1 rounded-md border border-white/15 bg-white/5 text-muted-foreground">{scan.counts.anchorMissing} missing anchors</span>
          {scan.counts.flagged === 0 && (
            <span className="px-2 py-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">art layer clean</span>
          )}
        </div>
      )}

      {flagged.length > 0 && (
        <div className="space-y-1.5">
          {flagged.map((s) => (
            <div key={s.shotId} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{s.ref}</span>
                  <span className="text-[11px] truncate">{s.description}</span>
                </div>
                {s.hasArt && (
                  <button
                    onClick={() => void runVlmCheck(s.shotId, s.ref)}
                    disabled={checking === s.shotId}
                    title="Vision check: compare this panel against the featured character's canonical model sheet"
                    className="h-6 shrink-0 rounded-md border border-teal-400/25 bg-teal-400/10 px-2 text-[9px] font-semibold text-teal-200 hover:bg-teal-400/20 transition-colors disabled:opacity-40"
                  >
                    {checking === s.shotId ? <Loader2 className="h-3 w-3 animate-spin" /> : "VLM check"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {s.items.map((it, i) => (
                  <span key={i} title={it.note} className={cn("px-1.5 py-0.5 rounded border text-[9px]", ITEM_COLORS[it.kind])}>
                    {it.kind} - {it.characterName}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface IdentityEntry {
  characterName: string;
  similarity: number;
  aspects: Partial<Record<string, number>>;
  note: string;
}

interface IdentityRow {
  shotId: string;
  ref: string;
  description: string;
  artUrl: string | null;
  source?: "PANEL" | "RENDER"; // what the vision model judged: the storyboard or a frame from the finished clip
  worst: number | null;
  castSize: number;
  note: string | null;
  scoredAt: string | null;
  entries: IdentityEntry[];
}

interface DriftPointUi {
  episode: number;
  scene: number;
  shot: number;
  score: number;
  scoredAt: string;
}

interface CharacterDriftUi {
  characterName: string;
  points: DriftPointUi[];
  first: number | null;
  last: number | null;
  delta: number | null;
  trend: "IMPROVING" | "DECLINING" | "STABLE" | "FLAT";
  worstAspect: string | null;
  panels: number;
}

interface IdentityData {
  rows: IdentityRow[];
  queue: Array<{ shotId: string; ref: string; description: string; source?: "PANEL" | "RENDER"; worst: number; entries: IdentityEntry[] }>;
  shots: Array<{ shotId: string; ref: string; description: string; hasArt: boolean }>;
  threshold: number;
  average: number | null;
  embeddings: Record<string, { worst: number; hashHex: string; computedAt: string; entries: Array<{ characterName: string; palette: number; structure: number; combined: number; note: string }> }>;
  drift: { characters: CharacterDriftUi[]; watch: CharacterDriftUi[]; headline: string };
}

const DRIFT_TREND_COLORS: Record<string, string> = {
  IMPROVING: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  DECLINING: "border-rose-400/30 text-rose-300 bg-rose-400/10",
  STABLE: "border-white/10 text-muted-foreground bg-white/5",
  FLAT: "border-white/10 text-muted-foreground bg-white/5",
};

/**
 * Tiny inline sparkline for a drift curve: one polyline over the
 * per-panel scores (identity) or confidences (facts) in story order,
 * 0..1 mapped to the 56x20 box. Pure SVG - no chart library.
 */
function DriftSparkline({ points }: { points: Array<{ score: number }> }) {
  if (points.length < 2) {
    return <svg width="56" height="20" className="shrink-0"><line x1="4" y1="10" x2="52" y2="10" stroke="currentColor" strokeWidth="1" className="text-white/15" strokeDasharray="2 3" /></svg>;
  }
  const step = 48 / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(4 + i * step).toFixed(1)},${(18 - p.score * 16).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="56" height="20" viewBox="0 0 56 20" className="shrink-0" aria-hidden>
      <line x1="4" y1="18" x2="52" y2="18" stroke="currentColor" strokeWidth="0.5" className="text-white/10" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Identity-similarity scoring: a vision model scores each panel's art
 * against EVERY featured character's canonical model sheet (0..1 per
 * character plus per-aspect scores). Panels below the identity bar
 * queue worst-first with a re-paint offer; scoring a panel lands an
 * IDENTITY_VERIFIED / IDENTITY_DRIFT continuity event.
 */
function IdentityPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [scoring, setScoring] = useState<string | null>(null);
  const [batching, setBatching] = useState(false);
  const [affinityRunning, setAffinityRunning] = useState(false);
  const [repainting, setRepainting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const dataQ = useQuery({
    queryKey: ["identity", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/identity?projectId=${projectId}`);
      if (!res.ok) return null;
      return (await res.json()) as IdentityData;
    },
    enabled: Boolean(projectId),
  });
  const data = dataQ.data ?? { rows: [], queue: [], shots: [], threshold: 0.6, average: null, embeddings: {}, drift: { characters: [], watch: [], headline: "no identity drift curves yet" } };

  async function affinityPass() {
    setAffinityRunning(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, limit: 8, mode: "affinity" }),
      });
      const body = (await res.json()) as { scored?: Array<{ ref: string; verdict: { worst: number } }>; errors?: Array<{ ref: string; error: string }> };
      setBanner(`Affinity pass (provider-free): ${body.scored?.length ?? 0} panel(s) embedded${body.errors?.length ? `, ${body.errors.length} skipped` : ""} - tripwire only, the vision score stays the authority`);
    } catch {
      setError("Affinity pass failed");
    } finally {
      setAffinityRunning(false);
      await qc.invalidateQueries({ queryKey: ["identity", projectId] });
    }
  }

  async function scoreOne(shotId: string, source: "panel" | "render" = "panel") {
    setScoring(shotId);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId, source }),
      });
      const body = (await res.json()) as { error?: string; scored?: { ref: string; verdict: { entries: IdentityEntry[]; worst: number } } };
      if (!res.ok || body.error) setError(body.error ?? "Identity scoring failed");
      else if (body.scored) {
        const v = body.scored.verdict;
        setBanner(`${body.scored.ref}: ${v.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(v.worst * 100).toFixed(0)}%`);
      }
    } catch {
      setError("Identity scoring failed");
    } finally {
      setScoring(null);
      await qc.invalidateQueries({ queryKey: ["identity", projectId] });
    }
  }

  async function batch(source: "panel" | "render" = "panel") {
    setBatching(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, limit: 3, source }),
      });
      const body = (await res.json()) as { scored?: Array<{ ref: string; verdict: { worst: number } }>; errors?: Array<{ ref: string; error: string }> };
      setBanner(`${source === "render" ? "Render pass" : "Identity pass"}: ${body.scored?.length ?? 0} ${source === "render" ? "render(s)" : "panel(s)"} scored${body.errors?.length ? `, ${body.errors.length} skipped` : ""} - worst-first rows updated below`);
    } catch {
      setError("Identity pass failed");
    } finally {
      setBatching(false);
      await qc.invalidateQueries({ queryKey: ["identity", projectId] });
    }
  }

  async function repaint(shotId: string, ref: string) {
    setRepainting(shotId);
    setError(null);
    try {
      await api.generatePanelArt(shotId, "MANHUA");
      setBanner(`${ref} re-painted with the canon riding the prompt - score again to confirm the identity fix`);
      await scoreOne(shotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-paint failed");
    } finally {
      setRepainting(null);
    }
  }

  const pct = (v: number | null | undefined) => v == null ? "-" : `${(v * 100).toFixed(0)}%`;

  return (
    <div className="studio-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-violet-300" /> Identity similarity
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 max-w-xl">
            Each panel is scored against every featured character&apos;s canonical model sheet: one similarity number per
            character plus per-aspect scores (face, hair, wardrobe, weapon, palette, style). A worst below the identity
            bar queues the panel for a re-paint.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="border-sky-400/25 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20" onClick={() => void affinityPass()} disabled={affinityRunning} title="Embed every panel and sheet locally (dHash + palette histogram) and compare - instant, no provider, a tripwire rather than a verdict">
            {affinityRunning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Activity className="h-4 w-4 mr-1.5" />}
            Affinity pass
          </Button>
          <Button size="sm" variant="outline" className="border-violet-400/25 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20" onClick={() => void batch("panel")} disabled={batching} title="Vision-score the 3 worst storyboard panels against the cast's sheets">
            {batching ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ScanEye className="h-4 w-4 mr-1.5" />}
            Score worst 3 panels
          </Button>
          <Button size="sm" variant="outline" className="border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200 hover:bg-fuchsia-400/20" onClick={() => void batch("render")} disabled={batching} title="Vision-score a frame pulled from each finished render clip against the cast's sheets - the shipping pixels, not the storyboard">
            {batching ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Clapperboard className="h-4 w-4 mr-1.5" />}
            Score 3 renders
          </Button>
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      {banner && (
        <div className="rounded-lg border border-violet-400/25 bg-violet-400/10 px-3 py-2 text-[11px] text-violet-200 leading-relaxed">{banner}</div>
      )}

      {data.average != null && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground tabular-nums">{data.rows.length} panel(s) scored</span>
          <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground tabular-nums">avg worst {(data.average * 100).toFixed(0)}%</span>
          <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground tabular-nums">identity bar {(data.threshold * 100).toFixed(0)}%</span>
          {data.queue.length > 0 ? (
            <span className="px-2 py-1 rounded-md border border-rose-400/25 bg-rose-400/10 text-rose-200 tabular-nums">{data.queue.length} below the bar</span>
          ) : (
            <span className="px-2 py-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">identity clean</span>
          )}
        </div>
      )}

      {data.queue.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-rose-300/90">Re-paint queue (worst identity first)</div>
          {data.queue.map((row) => (
            <div key={row.shotId} className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-3 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{row.ref}</span>
                  <span className="text-[11px] truncate">{row.description}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono text-rose-300 tabular-nums">worst {(row.worst * 100).toFixed(0)}%</span>
                  <button
                    onClick={() => void repaint(row.shotId, row.ref)}
                    disabled={repainting === row.shotId}
                    title="Re-generate this panel with the canon riding the prompt, then re-score it"
                    className="h-6 rounded-md border border-violet-400/25 bg-violet-400/10 px-2 text-[9px] font-semibold text-violet-200 hover:bg-violet-400/20 transition-colors disabled:opacity-40"
                  >
                    {repainting === row.shotId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Re-paint + re-score"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.rows.length > 0 && (
        <div className="space-y-1.5">
          {data.rows.slice(0, 8).map((row) => (
            <div key={`${row.shotId}-${row.source ?? "PANEL"}`} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("px-1 py-0.5 rounded border text-[8px] font-semibold shrink-0", row.source === "RENDER" ? "border-fuchsia-400/30 text-fuchsia-300 bg-fuchsia-400/10" : "border-white/15 text-muted-foreground bg-white/5")}>
                    {row.source === "RENDER" ? "RENDER" : "PANEL"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{row.ref}</span>
                  <span className="text-[11px] truncate">{row.description}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={cn(
                    "text-[10px] font-mono tabular-nums",
                    (row.worst ?? 1) < data.threshold ? "text-rose-300" : "text-emerald-300"
                  )}>worst {pct(row.worst)}</span>
                  <button
                    onClick={() => void scoreOne(row.shotId, row.source === "RENDER" ? "render" : "panel")}
                    disabled={scoring === row.shotId}
                    title={row.source === "RENDER" ? "Vision score a frame from this shot's finished render against every featured character's model sheet" : "Vision score this panel against every featured character's model sheet"}
                    className="h-6 rounded-md border border-violet-400/25 bg-violet-400/10 px-2 text-[9px] font-semibold text-violet-200 hover:bg-violet-400/20 transition-colors disabled:opacity-40"
                  >
                    {scoring === row.shotId ? <Loader2 className="h-3 w-3 animate-spin" /> : row.source === "RENDER" ? "Re-score render" : "Score now"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {row.entries.map((e, i) => (
                  <span
                    key={i}
                    title={Object.entries(e.aspects).map(([k, v]) => `${k} ${((v as number) * 100).toFixed(0)}%`).join(" · ") || e.note}
                    className={cn(
                      "px-1.5 py-0.5 rounded border text-[9px] tabular-nums",
                      e.similarity < data.threshold ? "border-rose-400/30 text-rose-200 bg-rose-400/10" : "border-emerald-400/30 text-emerald-200 bg-emerald-400/10"
                    )}
                  >
                    {e.characterName} {pct(e.similarity)}
                  </span>
                ))}
                {data.embeddings?.[row.shotId]?.entries.map((e, i) => (
                  <span
                    key={`aff-${i}`}
                    title={`Provider-free affinity tripwire (dHash + palette histogram vs the sheet): palette ${(e.palette * 100).toFixed(0)}%, structure ${(e.structure * 100).toFixed(0)}%. A tripwire, not a verdict - the vision score stays the authority.`}
                    className={cn(
                      "px-1.5 py-0.5 rounded border text-[9px] tabular-nums border-sky-400/30 text-sky-200 bg-sky-400/10",
                      e.combined < 0.5 && "border-amber-400/30 text-amber-200 bg-amber-400/10"
                    )}
                  >
                    aff {e.characterName} {pct(e.combined)}
                  </span>
                ))}
              </div>
              {row.note && <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">{row.note}</p>}
            </div>
          ))}
        </div>
      )}

      {data.drift && data.drift.characters.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[10px] uppercase tracking-[0.14em] text-violet-300/90">Identity drift curves (per character over episode order)</div>
            {data.drift.watch.length > 0 && (
              <span className="px-1.5 py-0.5 rounded border border-rose-400/30 text-rose-300 bg-rose-400/10 text-[9px] font-semibold">
                {data.drift.watch.length} declining
              </span>
            )}
          </div>
          {data.drift.characters.slice(0, 8).map((c) => (
            <div key={c.characterName} className="rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 flex items-center gap-2">
              <span className={cn("text-current", c.trend === "DECLINING" ? "text-rose-300" : c.trend === "IMPROVING" ? "text-emerald-300" : "text-muted-foreground")}>
                <DriftSparkline points={c.points} />
              </span>
              <span className="text-[11px] font-medium truncate" title={`${c.panels} scored panel(s), ${c.first == null ? "?" : (c.first * 100).toFixed(0)}% first -> ${c.last == null ? "?" : (c.last * 100).toFixed(0)}% latest`}>{c.characterName}</span>
              <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0", DRIFT_TREND_COLORS[c.trend])}>
                {c.trend}{c.delta != null ? ` ${(c.delta >= 0 ? "+" : "")}${(c.delta * 100).toFixed(0)}%` : ""}
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums shrink-0" title="latest similarity for this character">
                latest {c.last == null ? "-" : `${(c.last * 100).toFixed(0)}%`}
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">{c.panels} panel{c.panels === 1 ? "" : "s"}</span>
              {c.worstAspect && (
                <span className="text-[9px] text-amber-300/90 shrink-0" title="the aspect scoring lowest across this character's curve">weak: {c.worstAspect}</span>
              )}
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Each polyline is one character&apos;s identity scores in story order (left = earliest episode). A DECLINING curve is a
            conversation with the art pipeline, not one bad panel: check the weak aspect and consider a fresh sheet anchor.
          </p>
        </div>
      )}

      {data.rows.length === 0 && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Nothing scored yet. Generate panel art for shots whose cast carries a model sheet, then press Score worst 3 (or
          tell DSH <span className="font-mono">score_panel_identity</span>) to run the first identity pass. The Affinity pass button
          embeds every panel and sheet locally instead - instant and provider-free, a tripwire when the vision provider is down.
        </p>
      )}
    </div>
  );
}

interface FactHealthRowUi {
  factId: string;
  text: string;
  category: string;
  active: boolean;
  status: "HELD" | "VIOLATED" | "UNVERIFIED";
  checkedPanels: number;
  held: number;
  broken: number;
  worstBrokenConfidence: number | null;
  lastCheckedAt: string | null;
  lastConfidence: number | null;
  lastNote: string;
}

interface RetireSuggestionUi {
  factId: string;
  text: string;
  category: string;
  checkedPanels: number;
  held: number;
  broken: number;
  holdRate: number;
  reason: string;
}

interface FactDriftUi {
  factId: string;
  text: string;
  category: string;
  points: Array<{ episode: number; confidence: number; holds: boolean; at: string }>;
  first: number | null;
  last: number | null;
  delta: number | null;
  trend: "IMPROVING" | "DECLINING" | "STABLE" | "FLAT";
  holdRate: number;
  panels: number;
}

interface CanonHealthData {
  digest: {
    score: number | null;
    band: "HEALTHY" | "WATCH" | "DRIFTING" | null;
    activeFacts: number;
    verifiedFacts: number;
    violatedFacts: number;
    coverage: number | null;
    holdRate: number | null;
    recent: { held: number; broken: number; days: number };
    worstFacts: FactHealthRowUi[];
    retireSuggestions: number;
    headline: string;
  };
  rows: FactHealthRowUi[];
  suggestions: RetireSuggestionUi[];
  drift: { curves: FactDriftUi[]; watch: FactDriftUi[]; headline: string };
  rewordDrift?: Array<{ factId: string; text: string; oldText: string; category: string }>; // reworded facts the sweep still owes a re-audit
}

const FACT_STATUS_COLORS: Record<string, string> = {
  HELD: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  VIOLATED: "border-rose-400/30 text-rose-300 bg-rose-400/10",
  UNVERIFIED: "border-amber-400/30 text-amber-300 bg-amber-400/10",
};

const CANON_BAND_COLORS: Record<string, string> = {
  HEALTHY: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  WATCH: "border-amber-400/30 text-amber-300 bg-amber-400/10",
  DRIFTING: "border-rose-400/30 text-rose-300 bg-rose-400/10",
};

/**
 * Canon health: the universe-facts verdict history read back as a
 * report card. A 0..1 score mixes COVERAGE (how much of the active
 * canon the audits actually reached - an unchecked canon is not a
 * healthy canon) with HOLD RATE (how often checked facts held), and
 * each fact gets a status row (held / violated / never verified)
 * with its confidence and last check.
 */
function CanonHealthPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<CanonHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch(`/api/canon-health?projectId=${projectId}`);
      if (res.ok) setData((await res.json()) as CanonHealthData);
    } catch { /* surfaced on the next refresh */ }
    finally { setLoading(false); }
  }

  // The suggestion loop closes here: rewording rewrites the fact in
  // place, then the RE-AUDIT HELPER re-runs the vision check on the
  // panels that judged the old wording, so the same panels answer
  // whether the new wording holds; retiring deactivates it so audits
  // and prompts skip it.
  async function reword(factId: string, current: string) {
    const next = window.prompt("Reword the fact (it keeps failing as written):", current);
    if (next == null || !next.trim() || next.trim() === current) return;
    setActingId(factId);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch(`/api/universe-facts/${factId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Reword failed");
        return;
      }
      setBanner("Fact reworded - re-auditing the panels that judged the old wording…");
      const re = await fetch("/api/canon-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reaudit", factId, oldText: current }),
      });
      const reBody = (await re.json()) as { error?: string; targets?: number; audited?: number; held?: number; broken?: number; summary?: string };
      if (!re.ok) {
        setBanner(`Fact reworded - but the re-audit could not run: ${reBody.error ?? "unknown error"}. Audit a fresh panel instead.`);
      } else if ((reBody.targets ?? 0) === 0) {
        setBanner("Fact reworded - no panels ever audited the old wording, so audit a fresh panel to see whether the new wording holds");
      } else {
        setBanner(`Fact reworded + re-audited - ${reBody.summary ?? `${reBody.audited} panel(s) re-checked`}. The new wording's history starts on those panels.`);
      }
    } catch {
      setError("Reword failed");
    } finally {
      setActingId(null);
      await refresh();
    }
  }

  async function retire(factId: string, text: string) {
    setActingId(factId);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch(`/api/universe-facts/${factId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Retire failed");
      } else {
        setBanner(`Fact retired (deactivated): "${text.slice(0, 60)}" - it no longer rides prompts or audits`);
      }
    } catch {
      setError("Retire failed");
    } finally {
      setActingId(null);
      await refresh();
    }
  }

  // the reword DRIFT SWEEP: every reworded fact (the PATCH that
  // changed the text recorded the old wording) gets its panels
  // re-audited under the new wording in one pass
  const [sweeping, setSweeping] = useState(false);
  async function sweepReworded() {
    setSweeping(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/canon-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "reaudit-drifted" }),
      });
      const body = (await res.json()) as { error?: string; closed?: number; pending?: number; summary?: string };
      if (!res.ok || body.error) setError(body.error ?? "The re-audit sweep failed");
      else setBanner(`Reword sweep - ${body.summary ?? "done"}`);
    } catch {
      setError("The re-audit sweep failed");
    } finally {
      setSweeping(false);
      await refresh();
    }
  }

  const d = data?.digest;
  const bandColor = d?.band ? CANON_BAND_COLORS[d.band] : "";

  return (
    <div className="studio-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-rose-300" /> Canon health
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 max-w-xl">
            The universe-facts verdict history as a report card: the score mixes coverage (an unchecked canon is not a
            healthy canon) with the hold rate of audited panels. Violated and never-verified facts surface first; facts
            that fail on nearly every audit earn a reword-or-retire suggestion instead of more re-paints.
          </p>
        </div>
        <Button size="sm" variant="outline" className="border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Read canon health
        </Button>
      </div>

      {(data?.rewordDrift?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-amber-200">
              <span className="font-semibold">{data!.rewordDrift!.length} reworded fact{data!.rewordDrift!.length === 1 ? "" : "s"}</span> still judging panels by the OLD wording
              <span className="text-muted-foreground"> - the sweep re-audits them under the new wording and closes the loop</span>
            </div>
            <Button size="sm" variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20" onClick={() => void sweepReworded()} disabled={sweeping}>
              {sweeping ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1.5" />}
              Re-audit reworded
            </Button>
          </div>
          {data!.rewordDrift!.slice(0, 3).map((f) => (
            <p key={f.factId} className="text-[10px] text-muted-foreground truncate" title={`was: ${f.oldText}`}>
              <span className="text-amber-200/80">{f.text.slice(0, 70)}</span> (was: {f.oldText.slice(0, 50)})
            </p>
          ))}
        </div>
      )}

      {d && (
        <>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {d.score != null ? (
              <>
                <span className={cn("px-2 py-1 rounded-md border font-semibold tabular-nums", bandColor)}>canon {(d.score * 100).toFixed(0)}% {d.band}</span>
                <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground tabular-nums">{d.verifiedFacts}/{d.activeFacts} facts audited</span>
                {d.holdRate != null && <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground tabular-nums">hold rate {(d.holdRate * 100).toFixed(0)}%</span>}
                <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground tabular-nums">{d.recent.days}d: {d.recent.held} held / {d.recent.broken} broken</span>
              </>
            ) : (
              <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground">{d.headline}</span>
            )}
          </div>

          {d.worstFacts.length > 0 && (
            <div className="space-y-1">
              {d.worstFacts.map((f) => (
                <div key={f.factId} className={cn("rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 flex items-center gap-2", !f.active && "opacity-50")}>
                  <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0", FACT_STATUS_COLORS[f.status])}>{f.status}</span>
                  <span className={cn("text-[11px] flex-1 min-w-0 truncate", !f.active && "line-through")} title={`${f.category}: ${f.text}${f.lastNote ? ` - ${f.lastNote}` : ""}`}>{f.text}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums" title="audited panels: held / broken">
                    {f.checkedPanels > 0 ? `${f.held}/${f.held + f.broken} panels` : "never audited"}
                    {f.worstBrokenConfidence != null ? ` - worst ${(f.worstBrokenConfidence * 100).toFixed(0)}%` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {data && data.suggestions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-amber-300/90">Auto-retire suggestions (reword, do not re-paint)</div>
              {data.suggestions.map((s) => (
                <div key={s.factId} className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded border border-amber-400/30 text-amber-300 bg-amber-400/10 text-[9px] font-semibold shrink-0">{s.holdRate >= 0 ? `hold ${(s.holdRate * 100).toFixed(0)}%` : ""}</span>
                    <span className="text-[11px] truncate flex-1" title={s.text}>{s.text}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => void reword(s.factId, s.text)}
                        disabled={actingId === s.factId}
                        title="Rewrite the fact so the art can actually hold it - history stays, wording changes"
                        className="h-6 rounded-md border border-sky-400/25 bg-sky-400/10 px-2 text-[9px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40"
                      >
                        {actingId === s.factId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reword"}
                      </button>
                      <button
                        onClick={() => void retire(s.factId, s.text)}
                        disabled={actingId === s.factId}
                        title="Deactivate the fact: it stops riding prompts and audits (reversible from the universe-facts panel)"
                        className="h-6 rounded-md border border-rose-400/25 bg-rose-400/10 px-2 text-[9px] font-semibold text-rose-200 hover:bg-rose-400/20 transition-colors disabled:opacity-40"
                      >
                        Retire
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{s.reason}</p>
                </div>
              ))}
            </div>
          )}

          {banner && <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200">{banner}</div>}
          {error && <p className="text-[11px] text-rose-300">{error}</p>}

          {data && data.drift && data.drift.curves.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[10px] uppercase tracking-[0.14em] text-rose-300/90">Fact drift curves (confidence over episode order)</div>
                {data.drift.watch.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded border border-rose-400/30 text-rose-300 bg-rose-400/10 text-[9px] font-semibold">
                    {data.drift.watch.length} declining
                  </span>
                )}
              </div>
              {data.drift.curves.slice(0, 6).map((c) => (
                <div key={c.factId} className="rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 flex items-center gap-2">
                  <span className={cn("text-current", c.trend === "DECLINING" ? "text-rose-300" : c.trend === "IMPROVING" ? "text-emerald-300" : "text-muted-foreground")}>
                    <DriftSparkline points={c.points.map((p) => ({ score: p.confidence }))} />
                  </span>
                  <span className="text-[11px] truncate flex-1" title={`${c.category}: ${c.text} - ${c.panels} audited panel(s), ${(c.holdRate * 100).toFixed(0)}% held`}>{c.text}</span>
                  <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0", DRIFT_TREND_COLORS[c.trend])}>
                    {c.trend}{c.delta != null ? ` ${(c.delta >= 0 ? "+" : "")}${(c.delta * 100).toFixed(0)}%` : ""}
                  </span>
                  <span className="text-[9px] text-muted-foreground tabular-nums shrink-0" title="latest verdict confidence for this fact">
                    latest {c.last == null ? "-" : `${(c.last * 100).toFixed(0)}%`}
                  </span>
                  <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">{c.panels} panel{c.panels === 1 ? "" : "s"}</span>
                  <span className={cn("text-[9px] tabular-nums shrink-0", c.holdRate < 0.5 ? "text-amber-300/90" : "text-muted-foreground")} title="hold rate across the curve">
                    {(c.holdRate * 100).toFixed(0)}% held
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Each polyline is one fact&apos;s audit confidence in episode order (left = earliest). A DECLINING fact curve means
                the verdicts are losing faith across the show: expect a violation streak, and consider rewording the fact before the
                re-render queue floods.
              </p>
            </div>
          )}
        </>
      )}

      {!d && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Press Read canon health to roll the fact verdict history into a score. Facts get audited by
          <span className="font-mono"> check_universe_facts</span> (here or by DSH); every verdict feeds this readout.
        </p>
      )}
    </div>
  );
}

interface UniverseFactRow {
  id: string;
  text: string;
  category: string;
  source: string;
  active: boolean;
}

interface UniverseQueueRow {
  shotId: string;
  ref: string;
  description: string;
  artUrl: string | null;
  worst: number;
  items: Array<{ factText: string; confidence: number; note: string; eventId: string }>;
}

interface UniversePanelData {
  facts: UniverseFactRow[];
  queue: UniverseQueueRow[];
  shots: Array<{ shotId: string; ref: string; description: string; hasArt: boolean }>;
}

interface UniverseCheckResponse {
  error?: string;
  result?: {
    shotId: string;
    shotRef: string;
    verdicts: Array<{ factId: string; text: string; holds: boolean; confidence: number; note: string }>;
    broken: number;
    summary: string;
  };
}

interface RepaintStepRow {
  shotId: string;
  ref: string;
  factTexts: string[];
  beforeWorst: number;
  afterSummary: string;
  afterBroken: number;
  outcome: "FIXED" | "STILL_BROKEN" | "ERROR";
  error?: string;
  at: string;
}

interface RepaintRunRow {
  id: string;
  status: "RUNNING" | "PAUSED" | "DONE" | "ABORTED";
  cap: number;
  index: number;
  total: number;
  steps: RepaintStepRow[];
  error: string | null;
}

const OUTCOME_COLORS: Record<string, string> = {
  FIXED: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  STILL_BROKEN: "border-amber-400/30 text-amber-300 bg-amber-400/10",
  ERROR: "border-rose-400/30 text-rose-300 bg-rose-400/10",
};

const RUN_STATUS_COLORS: Record<string, string> = {
  RUNNING: "border-sky-400/30 text-sky-300 bg-sky-400/10",
  PAUSED: "border-amber-400/30 text-amber-300 bg-amber-400/10",
  DONE: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  ABORTED: "border-white/20 text-muted-foreground bg-white/5",
};

const FACT_CATEGORIES = ["WORLD", "CHARACTER", "PROP", "LOCATION", "RULE"];

const CATEGORY_COLORS: Record<string, string> = {
  WORLD: "border-sky-400/30 text-sky-300 bg-sky-400/10",
  CHARACTER: "border-violet-400/30 text-violet-300 bg-violet-400/10",
  PROP: "border-amber-400/30 text-amber-300 bg-amber-400/10",
  LOCATION: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  RULE: "border-rose-400/30 text-rose-300 bg-rose-400/10",
};

/**
 * Universe-facts vision checks: the production's canon rules of the
 * world join the QA loop. Facts are authored here (or by DSH), a
 * vision model judges panel art against the active facts with a
 * confidence per fact, verdicts land as FACT_HELD / FACT_BROKEN
 * events, and confident violations rank into the re-render queue
 * (worst first) with a one-click re-render + re-check.
 */
function UniverseFactsPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<UniversePanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [newFact, setNewFact] = useState("");
  const [newCategory, setNewCategory] = useState("WORLD");
  const [adding, setAdding] = useState(false);
  const [shotId, setShotId] = useState("");
  const [checking, setChecking] = useState(false);
  const [rerendering, setRerendering] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ ref: string; text: string; clean: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RepaintRunRow | null>(null);
  const [runCap, setRunCap] = useState(3);
  const [runBusy, setRunBusy] = useState(false);

  // poll the runner while it is live so the step log streams in
  useEffect(() => {
    if (!run || (run.status !== "RUNNING" && run.status !== "PAUSED")) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/universe-facts/repaint?projectId=${projectId}`);
        const body = (await res.json()) as { run: RepaintRunRow | null };
        if (body.run) setRun(body.run);
      } catch { /* next tick retries */ }
    }, 4000);
    return () => clearInterval(t);
  }, [run?.id, run?.status, run && run.status === "RUNNING", projectId]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch(`/api/universe-facts?projectId=${projectId}`);
      const body = (await res.json()) as UniversePanelData;
      setData(body);
      if (!shotId) {
        const firstWithArt = body.shots.find((s) => s.hasArt);
        if (firstWithArt) setShotId(firstWithArt.shotId);
      }
      await loadRun();
    } catch {
      setError("Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function addFact() {
    if (!newFact.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/universe-facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text: newFact, category: newCategory }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Add failed");
      } else {
        setNewFact("");
        await refresh();
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleFact(fact: UniverseFactRow) {
    await fetch(`/api/universe-facts/${fact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !fact.active }),
    });
    await refresh();
  }

  async function removeFact(id: string) {
    await fetch(`/api/universe-facts/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function runCheck(targetShotId: string) {
    if (!targetShotId) return;
    setChecking(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/universe-facts/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId: targetShotId }),
      });
      const body = (await res.json()) as UniverseCheckResponse;
      if (!res.ok || body.error || !body.result) {
        setVerdict({ ref: "check", text: body.error ?? "Vision check failed", clean: false });
      } else {
        const r = body.result;
        const lines = r.verdicts.map((v) => `${v.holds ? "HELD" : "BROKEN"} ${(v.confidence * 100).toFixed(0)}% ${v.text}`);
        setVerdict({
          ref: r.shotRef,
          text: `${r.summary} (${lines.join(", ")})`,
          clean: r.broken === 0,
        });
        await refresh();
      }
    } catch {
      setVerdict({ ref: "check", text: "Vision check failed", clean: false });
    } finally {
      setChecking(false);
    }
  }

  async function rerenderAndCheck(row: UniverseQueueRow) {
    setRerendering(row.shotId);
    setError(null);
    try {
      const res = await fetch("/api/panel-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId: row.shotId, format: "MANHUA" }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Panel re-render failed");
        return;
      }
      await runCheck(row.shotId);
    } catch {
      setError("Panel re-render failed");
    } finally {
      setRerendering(null);
    }
  }

  async function loadRun() {
    try {
      const res = await fetch(`/api/universe-facts/repaint?projectId=${projectId}`);
      const body = (await res.json()) as { run: RepaintRunRow | null };
      setRun(body.run);
    } catch { /* surfaced by the next action */ }
  }

  async function startRun() {
    setRunBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/universe-facts/repaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, maxItems: runCap }),
      });
      const body = (await res.json()) as { run?: RepaintRunRow; error?: string };
      if (!res.ok || !body.run) setError(body.error ?? "Run failed to start");
      else setRun(body.run);
    } catch {
      setError("Run failed to start");
    } finally {
      setRunBusy(false);
    }
  }

  async function steerRun(action: "pause" | "resume" | "abort") {
    if (!run) return;
    setRunBusy(true);
    try {
      await fetch("/api/universe-facts/repaint", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id, action }),
      });
      await loadRun();
      await refresh();
    } finally {
      setRunBusy(false);
    }
  }

  const shotsWithArt = (data?.shots ?? []).filter((s) => s.hasArt);

  return (
    <div className="studio-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-sky-300" /> Universe-facts vision checks
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 max-w-xl">
            The world&apos;s canon joins the QA loop: register the rules of the universe, a vision model judges panel art
            against them with a confidence per fact, and confident violations rank into the re-render queue below.
            Every panel prompt carries the canon (fact-aware generation), and the supervised runner re-paints the
            queue without the clicks.
          </p>
        </div>
        <Button size="sm" variant="outline" className="border-sky-400/25 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Load facts + queue
        </Button>
      </div>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}

      {verdict && (
        <div className={cn(
          "rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
          verdict.clean ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-amber-400/25 bg-amber-400/10 text-amber-200"
        )}>
          <span className="font-semibold">{verdict.ref}</span> - {verdict.text}
        </div>
      )}

      {data && (
        <>
          <div className="flex gap-2 items-center flex-wrap">
            <Input
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="e.g. Her blade glows cyan when spirit energy channels"
              className="h-8 flex-1 min-w-[220px] bg-white/5 border-white/12 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") void addFact(); }}
            />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="h-8 rounded-md bg-white/5 border border-white/12 px-2 text-xs">
              {FACT_CATEGORIES.map((c) => <option key={c} className="bg-card">{c}</option>)}
            </select>
            <button
              onClick={() => void addFact()}
              disabled={adding || !newFact.trim()}
              className="h-8 rounded-md border border-sky-400/25 bg-sky-400/10 px-2.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add fact"}
            </button>
          </div>

          {data.facts.length > 0 && (
            <div className="space-y-1">
              {data.facts.map((f) => (
                <div key={f.id} className={cn("rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 flex items-center gap-2", !f.active && "opacity-50")}>
                  <span className={cn("px-1.5 py-0.5 rounded border text-[9px] shrink-0", CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.WORLD)}>{f.category}</span>
                  <span className="text-[11px] flex-1 min-w-0 truncate" title={f.text}>{f.text}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{f.source}</span>
                  <button onClick={() => void toggleFact(f)} title={f.active ? "Deactivate: vision checks skip this fact" : "Activate"} className="shrink-0 text-muted-foreground hover:text-sky-300 transition-colors">
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => void removeFact(f.id)} title="Delete fact" className="shrink-0 text-muted-foreground hover:text-rose-300 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={shotId}
              onChange={(e) => setShotId(e.target.value)}
              className="h-8 flex-1 min-w-[240px] rounded-md bg-white/5 border border-white/12 px-2 text-xs"
            >
              <option value="" className="bg-card">Pick a shot with panel art…</option>
              {shotsWithArt.map((s) => (
                <option key={s.shotId} value={s.shotId} className="bg-card">{s.ref} - {s.description.slice(0, 60)}</option>
              ))}
            </select>
            <button
              onClick={() => void runCheck(shotId)}
              disabled={checking || !shotId}
              title="Vision check: judge this panel against the active universe facts"
              className="h-8 rounded-md border border-sky-400/25 bg-sky-400/10 px-2.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40"
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run fact check"}
            </button>
          </div>

          {/* ── Supervised auto re-paint runner ── */}
          <div className="rounded-lg border border-violet-400/15 bg-violet-400/[0.03] px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide flex items-center gap-1.5">
                <PaintRoller className="h-3.5 w-3.5" /> Supervised auto re-paint
              </p>
              {run && (
                <span className={cn("px-1.5 py-0.5 rounded border text-[9px]", RUN_STATUS_COLORS[run.status])}>
                  {run.status} {run.index}/{run.total}
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <select value={runCap} onChange={(e) => setRunCap(Number(e.target.value))} className="h-7 rounded-md bg-white/5 border border-white/12 px-2 text-[10px]" title="How many queued panels this run visits (worst confidence first)">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n} className="bg-card">{n} panel{n > 1 ? "s" : ""}</option>)}
              </select>
              {!run || run.status === "DONE" || run.status === "ABORTED" ? (
                <button
                  onClick={() => void startRun()}
                  disabled={runBusy || data.queue.length === 0}
                  title="Walk the re-render queue worst-first: each step re-paints with fact-aware prompts and re-checks"
                  className="h-7 rounded-md border border-violet-400/25 bg-violet-400/10 px-2.5 text-[10px] font-semibold text-violet-200 hover:bg-violet-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  {runBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Start run
                </button>
              ) : (
                <div className="flex gap-1.5">
                  {run.status === "RUNNING" && (
                    <button onClick={() => void steerRun("pause")} disabled={runBusy} className="h-7 rounded-md border border-amber-400/25 bg-amber-400/10 px-2 text-[10px] font-semibold text-amber-200 hover:bg-amber-400/20 transition-colors disabled:opacity-40 flex items-center gap-1">
                      <Pause className="h-3 w-3" /> Pause
                    </button>
                  )}
                  {run.status === "PAUSED" && (
                    <button onClick={() => void steerRun("resume")} disabled={runBusy} className="h-7 rounded-md border border-sky-400/25 bg-sky-400/10 px-2 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40 flex items-center gap-1">
                      <Play className="h-3 w-3" /> Resume
                    </button>
                  )}
                  <button onClick={() => void steerRun("abort")} disabled={runBusy} className="h-7 rounded-md border border-rose-400/25 bg-rose-400/10 px-2 text-[10px] font-semibold text-rose-200 hover:bg-rose-400/20 transition-colors disabled:opacity-40 flex items-center gap-1">
                    <Square className="h-3 w-3" /> Abort
                  </button>
                </div>
              )}
              <span className="text-[9px] text-muted-foreground">each step: fact-aware re-paint, vision re-check, outcome logged; still-broken panels stop retrying and wait for you</span>
            </div>
            {run && run.steps.length > 0 && (
              <div className="space-y-1">
                {run.steps.map((s, i) => (
                  <div key={i} className="rounded-md border border-white/10 bg-black/25 px-2.5 py-1.5 flex items-center gap-2 flex-wrap">
                    <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0", OUTCOME_COLORS[s.outcome])}>{s.outcome.replace("_", " ")}</span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">{s.ref}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{(s.beforeWorst * 100).toFixed(0)}% → {s.afterBroken === 0 ? "holds" : `${s.afterBroken} still broken`}</span>
                    <span className="text-[10px] flex-1 min-w-[120px] truncate" title={s.error ?? s.afterSummary}>{s.error ?? s.afterSummary}</span>
                  </div>
                ))}
              </div>
            )}
            {run && run.status === "RUNNING" && (
              <p className="text-[9px] text-sky-300 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> working: re-painting and re-checking (each step is a real generation + vision pass, tens of seconds)</p>
            )}
          </div>

          {data.queue.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-rose-300 uppercase tracking-wide">Re-render queue (worst confidence first)</p>
              {data.queue.map((row) => (
                <div key={row.shotId} className="rounded-lg border border-rose-400/20 bg-black/25 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">{row.ref}</span>
                      <span className="text-[11px] truncate">{row.description}</span>
                      <span className="px-1.5 py-0.5 rounded border border-rose-400/30 text-rose-300 bg-rose-400/10 text-[9px] shrink-0">
                        worst {(row.worst * 100).toFixed(0)}%
                      </span>
                    </div>
                    <button
                      onClick={() => void rerenderAndCheck(row)}
                      disabled={rerendering === row.shotId}
                      title="Re-generate this panel, then run the fact check again"
                      className="h-6 shrink-0 rounded-md border border-violet-400/25 bg-violet-400/10 px-2 text-[9px] font-semibold text-violet-200 hover:bg-violet-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
                    >
                      {rerendering === row.shotId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      Re-render + re-check
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {row.items.map((it, i) => (
                      <span key={i} title={it.note} className="px-1.5 py-0.5 rounded border border-rose-400/25 text-rose-200 bg-rose-400/10 text-[9px]">
                        {(it.confidence * 100).toFixed(0)}% - {it.factText}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {data.facts.length === 0
                ? "No facts registered yet - add the first canon rule above (or ask DSH with add_universe_fact)."
                : "Re-render queue empty: no confident universe-fact violations on the checked panels."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AddEventDialog() {
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ entityName: "", entityType: "PROP", kind: "DESTROYED", episodeNumber: "", description: "", severity: "WARNING" });

  async function create() {
    setBusy(true);
    try {
      await api.addContinuityEvent({
        projectId,
        entityName: form.entityName,
        entityType: form.entityType,
        kind: form.kind,
        episodeNumber: form.episodeNumber ? Number(form.episodeNumber) : undefined,
        description: form.description,
        severity: form.severity,
      });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setOpen(false);
      setForm({ entityName: "", entityType: "PROP", kind: "DESTROYED", episodeNumber: "", description: "", severity: "WARNING" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-white/12 bg-white/5"><Plus className="h-4 w-4 mr-1.5" /> Register event</Button>
      </DialogTrigger>
      <DialogContent className="bg-card max-w-md">
        <DialogHeader><DialogTitle>Register continuity event</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Entity name</Label>
              <Input value={form.entityName} onChange={(e) => setForm({ ...form, entityName: e.target.value })} placeholder="Jade Sword" className="bg-white/5 border-white/12" />
            </div>
            <div className="grid gap-1.5"><Label>Episode #</Label>
              <Input type="number" value={form.episodeNumber} onChange={(e) => setForm({ ...form, episodeNumber: e.target.value })} className="bg-white/5 border-white/12" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Type</Label>
              <select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} className="h-9 rounded-md bg-white/5 border border-white/12 px-3 text-sm">
                {["PROP", "CHARACTER", "ENVIRONMENT", "ABILITY"].map((v) => <option key={v} className="bg-card">{v}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label>Kind</Label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="h-9 rounded-md bg-white/5 border border-white/12 px-3 text-sm">
                {["DESTROYED", "INJURED", "GAINED", "LOST", "TRANSFORMED", "CUSTOM"].map((v) => <option key={v} className="bg-card">{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shattered against Demon Lord Wei's chains…" className="bg-white/5 border-white/12" />
          </div>
          <Button onClick={create} disabled={busy || !form.entityName.trim()}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContinuityView({ project }: { project: import("@/lib/api-client").StudioProject }) {
  const eventsQ = useQuery({
    queryKey: ["continuity", project.id],
    queryFn: async () => {
      const res = await fetch(`/api/continuity?projectId=${project.id}`);
      return res.json() as Promise<Array<{
        id: string; entityType: string; entityName: string; kind: string;
        episodeNumber: number | null; description: string; severity: string;
      }>>;
    },
    refetchInterval: 8000,
  });

  return (
    <div>
      <SectionHeader
        title="Continuity Engine"
        sub="First-class canonical history. The system never silently creates an inconsistent asset - story text is checked against these events (see a scene in Story & Scenes for live conflict detection)."
        right={<AddEventDialog />}
      />
      <div className="space-y-2.5 max-h-[calc(100vh-13rem)] overflow-y-auto studio-scroll pr-1">
        <ArtContinuityPanel projectId={project.id} />

        <IdentityPanel projectId={project.id} />
        <CanonHealthPanel projectId={project.id} />
        <UniverseFactsPanel projectId={project.id} />
        {(eventsQ.data ?? []).map((ev) => (
          <div key={ev.id} className="studio-panel p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <ShieldAlert className={cn("h-4 w-4", ev.severity === "CRITICAL" ? "text-rose-400" : "text-amber-400")} />
                <span className="text-sm font-semibold">{ev.entityName}</span>
                <Badge variant="outline" className={cn("text-[10px]", KIND_COLORS[ev.kind] ?? KIND_COLORS.CUSTOM)}>{ev.kind}</Badge>
                <span className="text-[11px] text-muted-foreground">{ev.entityType}{ev.episodeNumber != null ? ` · Episode ${ev.episodeNumber}` : ""}</span>
              </div>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded border",
                ev.severity === "CRITICAL" ? "border-rose-400/30 text-rose-300 bg-rose-400/10"
                : ev.severity === "WARNING" ? "border-amber-400/30 text-amber-300 bg-amber-400/10"
                : "border-white/15 text-muted-foreground bg-white/5")}>
                {ev.severity}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed mt-2">{ev.description}</p>
          </div>
        ))}
        {(eventsQ.data ?? []).length === 0 && (
          <div className="studio-panel p-10 text-center text-sm text-muted-foreground">No continuity events registered yet.</div>
        )}
      </div>
    </div>
  );
}
