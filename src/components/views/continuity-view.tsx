"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Loader2, ScanEye, Globe2, RefreshCw, Wand2, Trash2, Power, Play, Pause, Square, PaintRoller } from "lucide-react";
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
