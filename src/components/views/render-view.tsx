"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MonitorPlay, CheckCheck, RotateCcw, ThumbsUp, ShieldCheck, ShieldX, Loader2, Cable,
  Layers, ListFilter, Play, Clapperboard, Timer,
} from "lucide-react";
import { api, parseActions, parseFindings, type StudioProject, type BridgeStatusInfo, type EpisodeCutResult } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader, StatusBadge } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatSeconds, parseTelemetry, providerLedger } from "@/lib/engine/telemetry";
import { cn } from "@/lib/utils";

function EngineDriverCard() {
  const bridgeQ = useQuery({ queryKey: ["bridge"], queryFn: api.bridgeStatus, refetchInterval: 5000 });
  const s = bridgeQ.data;
  const live = s?.mode === "LIVE_BLENDER" && s.reachable;
  const motion = s?.mode === "MOTION";
  const img2vid = (s as BridgeStatusInfo | undefined)?.img2vid;

  return (
    <div className={cn(
      "studio-panel p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3",
      live ? "border-emerald-400/25" : motion ? "border-teal-400/25" : ""
    )}>
      <div className={cn(
        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border",
        live ? "bg-emerald-400/10 border-emerald-400/30" : motion ? "bg-teal-400/10 border-teal-400/30" : "bg-white/5 border-white/12"
      )}>
        <Cable className={cn("h-4.5 w-4.5", live ? "text-emerald-300" : motion ? "text-teal-300" : "text-muted-foreground")} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          Engine driver
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-widest border",
            live ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300"
              : motion ? "bg-teal-400/10 border-teal-400/30 text-teal-300"
              : "bg-white/5 border-white/12 text-muted-foreground"
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-400 dsh-pulse" : motion ? "bg-teal-400" : "bg-neutral-500")} />
            {live ? "LIVE BLENDER" : motion ? "MOTION ENGINE" : "SIMULATOR"}
          </span>
          {s?.busy && live && (
            <span className="rounded bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-amber-300">RENDERING</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
          {live
            ? `Blender ${s?.blenderVersion ?? ""} attached${s?.source === "local" ? " (headless worker pool)" : ` at ${s?.host ?? ""}`}${s?.scene && s.source !== "local" ? ` · scene “${s.scene}”` : ""} - animated sequence renders flow back into the queue.`
            : s?.detail ?? "Probing bridge…"}
        </p>
        {!live && (
          <p className="text-[10px] text-muted-foreground/80 mt-1">
            Every job renders a sequenced clip driven by the shot&apos;s camera grammar (movement · shot type · lens · lighting · fog · lightning · energy) plus the character&apos;s pose program (start pose → end pose), and muxes with the episode stems at export.
          </p>
        )}
        {!live && s?.envHint && (
          <p className="text-[10px] text-muted-foreground/80 mt-1 font-mono">ANIMEOS_BLENDER_HOST={s.envHint}</p>
        )}
        {img2vid?.available && img2vid.provider === "host" && (
          <p className="text-[10px] text-teal-200/80 mt-1 font-mono">ANIMEOS_IMG2VID_HOST={img2vid.host} - PREVIZ slot: pose-carrying hero shots preview motion through the attached interpolation provider (finals stay on the designed engines)</p>
        )}
        {img2vid?.available && img2vid.provider === "zai" && (
          <p className="text-[10px] text-teal-200/80 mt-1 font-mono">img2vid PREVIZ slot: built-in interpolation model opted in (ANIMEOS_IMG2VID=on) - pose-carrying hero shots get motion previz only, never the final render</p>
        )}
        {!img2vid?.available && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">img2vid previz slot: off (default). The output is designed, not generated - opt in with ANIMEOS_IMG2VID=on or an attached host only for motion previz and benchmarks.</p>
        )}
      </div>
      {!live && (
        <p className="sm:ml-auto text-[10px] leading-relaxed text-muted-foreground/80 sm:max-w-[290px] sm:text-right">
          Attach one: run <span className="font-mono">blender -b -P bridges/blender/animeos_bridge.py</span>, then set <span className="font-mono">ANIMEOS_BLENDER_HOST=127.0.0.1:8100</span>.
        </p>
      )}
    </div>
  );
}

type QueueFilter = "ALL" | "ACTIVE" | "REVIEW" | "DONE";

const FILTERS: Array<{ id: QueueFilter; label: string; match: (status: string) => boolean }> = [
  { id: "ALL", label: "All", match: () => true },
  { id: "ACTIVE", label: "Rendering", match: (s) => ["QUEUED", "RENDERING", "INSPECTING"].includes(s) },
  { id: "REVIEW", label: "Needs review", match: (s) => ["REVIEW", "NEEDS_REVISION"].includes(s) },
  { id: "DONE", label: "Approved", match: (s) => ["APPROVED", "FAILED"].includes(s) },
];

function BatchRenderCard({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"PREVIEW" | "FINAL">("PREVIEW");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const episodes = useMemo(
    () => project.seasons
      .flatMap((s) => s.episodes)
      .sort((a, b) => a.number - b.number)
      .map((ep) => ({
        ...ep,
        shotCount: ep.scenes.reduce((n, sc) => n + sc.shots.length, 0),
        finalCount: ep.scenes.reduce((n, sc) => n + sc.shots.filter((sh) => sh.status === "FINAL").length, 0),
      })),
    [project.seasons]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = episodes.length > 0 && selected.size === episodes.length;
  const selectedShots = episodes
    .filter((ep) => selected.has(ep.id))
    .reduce((n, ep) => n + ep.shotCount, 0);

  async function queue() {
    if (selected.size === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.renderBatch([...selected], mode);
      setResult(`${r.created} render${r.created === 1 ? "" : "s"} queued across ${r.episodes} episode${r.episodes === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} already FINAL skipped` : ""}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["renderJobs", project.id] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    } catch (err) {
      setResult(err instanceof Error ? `Failed: ${err.message}` : "Batch queue failed");
    } finally {
      setBusy(false);
    }
  }

  if (episodes.length === 0) return null;

  return (
    <div className="studio-panel p-4 mb-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Layers className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Batch render</span>
        <span className="text-[11px] text-muted-foreground">queue every shot across episodes - DSH inspects each preview as it lands</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setMode("PREVIEW")}
            className={cn("px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors", mode === "PREVIEW" ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5")}
          >PREVIEW</button>
          <button
            onClick={() => setMode("FINAL")}
            className={cn("px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors", mode === "FINAL" ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5")}
          >FINAL</button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mt-3">
        {episodes.map((ep, i) => {
          const on = selected.has(ep.id);
          return (
            <button
              key={ep.id}
              onClick={() => toggle(ep.id)}
              title={ep.title}
              className={cn(
                "px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors",
                on ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
              )}
            >
              E{String(ep.number).padStart(2, "0")}
              <span className="ml-1 text-[9px] opacity-70 tabular-nums">{ep.shotCount} shot{ep.shotCount === 1 ? "" : "s"}{ep.finalCount > 0 ? ` · ${ep.finalCount} final` : ""}</span>
            </button>
          );
        })}
        <button
          onClick={() => setSelected(allSelected ? new Set() : new Set(episodes.map((e) => e.id)))}
          className="px-2.5 h-7 rounded-lg text-[11px] font-medium border border-dashed border-white/20 text-muted-foreground hover:text-foreground transition-colors"
        >
          {allSelected ? "Clear" : "All episodes"}
        </button>
      </div>

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <Button
          size="sm" className="h-7 text-[11px]"
          disabled={busy || selected.size === 0}
          onClick={() => void queue()}
        >
          {busy ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Play className="h-3 w-3 mr-1.5" />}
          Queue {selectedShots} render{selectedShots === 1 ? "" : "s"} ({mode})
        </Button>
        {result && <span className="text-[11px] text-teal-200/90">{result}</span>}
        {!result && selected.size === 0 && (
          <span className="text-[11px] text-muted-foreground">Pick one or more episodes - shots already marked FINAL are skipped.</span>
        )}
      </div>
    </div>
  );}

function EpisodeCutCard({ project }: { project: StudioProject }) {
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<"PREVIEW" | "FINAL">("PREVIEW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cut, setCut] = useState<EpisodeCutResult | null>(null);

  const episodes = useMemo(
    () => project.seasons.flatMap((s) => s.episodes).sort((a, b) => a.number - b.number),
    [project.seasons]
  );

  async function exportCut() {
    if (!episodeId) return;
    setBusy(true);
    setError(null);
    setCut(null);
    try {
      const r = await api.exportCut(episodeId, mode);
      setCut(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cut export failed");
    } finally {
      setBusy(false);
    }
  }

  if (episodes.length === 0) return null;

  return (
    <div className="studio-panel p-4 mb-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Clapperboard className="h-4 w-4 text-teal-300" />
        <span className="text-sm font-semibold">Episode cut</span>
        <span className="text-[11px] text-muted-foreground">concatenate each shot&apos;s animated clip in story order, synthesize the stems server-side, mux video + audio into one mp4</span>
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <select
          value={episodeId ?? ""}
          onChange={(e) => { setEpisodeId(e.target.value || null); setCut(null); setError(null); }}
          className="h-7 rounded-lg bg-white/5 border border-white/12 text-[11px] px-2 text-foreground"
          aria-label="Episode to cut"
        >
          <option value="">Pick an episode…</option>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>E{String(ep.number).padStart(2, "0")} · {ep.title}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode("PREVIEW")}
            className={cn("px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors", mode === "PREVIEW" ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5")}
          >PREVIEW</button>
          <button
            onClick={() => setMode("FINAL")}
            className={cn("px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors", mode === "FINAL" ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5")}
          >FINAL</button>
        </div>
        <Button size="sm" className="h-7 text-[11px]" disabled={busy || !episodeId} onClick={() => void exportCut()}>
          {busy ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Clapperboard className="h-3 w-3 mr-1.5" />}
          {busy ? "Rendering + muxing…" : "Export cut (mp4)"}
        </Button>
      </div>
      {error && <p className="text-[11px] text-rose-300 mt-2">{error}</p>}
      {cut && (
        <div className="mt-3">
          <video
            key={cut.url}
            src={cut.url}
            controls
            loop
            muted
            playsInline
            preload="metadata"
            className="w-full rounded-lg border border-white/10 bg-black"
            style={{ maxHeight: 340 }}
          />
          <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-muted-foreground">
            <a href={cut.url} download={cut.file} className="text-teal-300 hover:underline">download {cut.file}</a>
            <span>· {cut.width}x{cut.height} @ {Math.round(cut.fps)}fps</span>
            <span>· {(cut.durationMs / 1000).toFixed(1)}s</span>
            <span>· {cut.shotCount} shot{cut.shotCount === 1 ? "" : "s"}</span>
            <span>· {cut.cueCount} stem cue{cut.cueCount === 1 ? "" : "s"}</span>
            {cut.renderedNow > 0 && <span className="text-amber-300">· {cut.renderedNow} rendered inline</span>}
            <a href={cut.manifestFile} target="_blank" rel="noreferrer" className="hover:underline">manifest</a>
          </div>
          {cut.warnings.length > 0 && (
            <div className="mt-1.5 text-[10px] text-amber-300/90 leading-relaxed">{cut.warnings.join(" · ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function RenderView({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const { projectId, openPreview } = useStudio();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("ALL");

  const jobsQ = useQuery({
    queryKey: ["renderJobs", projectId],
    queryFn: () => api.renderJobs(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: 2000,
  });

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusyId(id);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ["renderJobs", projectId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    } finally {
      setBusyId(null);
    }
  }

  const jobs = jobsQ.data ?? [];
  const counts = useMemo(() => ({
    active: jobs.filter((j) => ["QUEUED", "RENDERING", "INSPECTING"].includes(j.status)).length,
    review: jobs.filter((j) => ["REVIEW", "NEEDS_REVISION"].includes(j.status)).length,
    approved: jobs.filter((j) => ["APPROVED"].includes(j.status)).length,
  }), [jobs]);
  // per-provider ledger: latency + cost aggregated over every job that
  // finished with telemetry (spans chain takeovers, credits bill the final provider)
  const ledger = useMemo(
    () => providerLedger(jobs.map((j) => parseTelemetry(j.telemetry))),
    [jobs],
  );
  const totalCredits = useMemo(
    () => jobs.reduce((n, j) => n + (parseTelemetry(j.telemetry)?.credits ?? 0), 0),
    [jobs],
  );
  const visibleJobs = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    return f ? jobs.filter((j) => f.match(j.status)) : jobs;
  }, [jobs, filter]);

  return (
    <div>
      <SectionHeader
        title="Render Queue"
        sub="Headless Blender workers when a binary exists, the built-in MOTION engine otherwise - every job renders a real animated clip per shot's camera grammar. Completed previews go straight to DSH for inspection."
      />

      <EngineDriverCard />

      <BatchRenderCard project={project} />

      <EpisodeCutCard project={project} />

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mr-1">
          <span className="px-2 py-0.5 rounded border border-amber-400/25 bg-amber-400/5 tabular-nums">{counts.active} active</span>
          <span className="px-2 py-0.5 rounded border border-violet-400/25 bg-violet-400/5 tabular-nums">{counts.review} in review</span>
          <span className="px-2 py-0.5 rounded border border-emerald-400/25 bg-emerald-400/5 tabular-nums">{counts.approved} approved</span>
          {totalCredits > 0 && (
            <span className="px-2 py-0.5 rounded border border-sky-400/25 bg-sky-400/5 tabular-nums" title="Estimated cost over these jobs (hosted providers bill per clip-second)">~{totalCredits} credits</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors",
                filter === f.id ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {ledger.length > 0 && (
        <div className="studio-panel p-3 mb-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
            <Timer className="h-3.5 w-3.5" /> Provider ledger - latency &amp; cost per engine
          </div>
          <div className="flex flex-wrap gap-2">
            {ledger.map((row) => (
              <div key={row.provider} className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5">
                <div className="text-[11px] font-semibold tabular-nums">{row.provider} <span className="font-normal text-muted-foreground">· {row.jobs} job{row.jobs === 1 ? "" : "s"}</span></div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  avg {formatSeconds(row.avgMs)} · total {formatSeconds(row.totalMs)}
                  {row.credits > 0 ? <span className="text-sky-300"> · ~{row.credits} credits</span> : <span> · 0 credits</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="studio-panel p-10 text-center text-sm text-muted-foreground">
          Queue is empty. Use Batch render above, trigger previews from Story &amp; Scenes, or tell DSH to render a shot.
        </div>
      )}

      <div className="space-y-3 max-h-[calc(100vh-13rem)] overflow-y-auto studio-scroll pr-1">
        {visibleJobs.map((job) => {
          const findings = parseFindings(job.evaluation?.findings);
          const actions = parseActions(job.evaluation?.actions);
          const active = ["RENDERING", "QUEUED", "INSPECTING"].includes(job.status);
          return (
            <div key={job.id} className={cn(
              "studio-panel p-4",
              job.status === "NEEDS_REVISION" && "border-violet-400/25",
              job.status === "APPROVED" && "border-emerald-400/25"
            )}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
                    <MonitorPlay className="h-4 w-4 text-primary" />
                    {job.shot?.scene ? `Scene ${job.shot.scene.number} · ` : ""}
                    {job.shot ? `Shot ${String(job.shot.number).padStart(3, "0")}` : "Production master"}
                    <span className="text-[11px] font-normal text-muted-foreground">{job.mode} · attempt {job.attempt}</span>
                    <span
                      title={
                        job.driver === "BLENDER" || job.driver === "BLENDER_LOCAL"
                          ? "Rendered by a headless Blender sequence worker (Cycles; skeletal stand-in when the shot carries poses)"
                          : job.driver === "IMG2VID"
                            ? "PREVIZ animatic from the interpolation provider (pose-to-motion over key art) - a previz pass, not a final render"
                            : job.driver === "MOTION"
                              ? "Rendered by the built-in MOTION engine (ffmpeg camera grammar over key art; poses as a blocking approximation)"
                              : "Rendered by the wall-clock simulator"
                      }
                      className={cn(
                        "rounded px-1 py-[1px] text-[8px] font-bold tracking-widest border",
                        job.driver === "BLENDER" || job.driver === "BLENDER_LOCAL"
                          ? "bg-emerald-400/10 border-emerald-400/30 text-emerald-300"
                          : job.driver === "IMG2VID"
                            ? "bg-sky-400/10 border-sky-400/30 text-sky-300"
                            : job.driver === "MOTION"
                              ? "bg-teal-400/10 border-teal-400/30 text-teal-300"
                              : "bg-white/5 border-white/12 text-muted-foreground"
                      )}
                    >
                      {job.driver === "BLENDER" || job.driver === "BLENDER_LOCAL" ? "BLENDER" : job.driver === "IMG2VID" ? "PREVIZ" : job.driver === "MOTION" ? "MOTION" : "SIM"}
                    </span>
                    <StatusBadge status={job.status} />
                  </div>
                  {job.shot && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-1">{job.shot.description}</p>}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {job.shot?.scene && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" onClick={() => openPreview(job.shot!.scene!.id, job.shot!.number)}>
                      View in 3D
                    </Button>
                  )}
                  {job.status === "NEEDS_REVISION" && (
                    <Button size="sm" className="h-7 text-[11px]" disabled={busyId === job.id}
                      onClick={() => act(() => api.renderApply(job.evaluation!.id), job.id)}>
                      {busyId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />}
                      Apply DSH fixes &amp; re-render
                    </Button>
                  )}
                  {["NEEDS_REVISION", "REVIEW"].includes(job.status) && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" disabled={busyId === job.id}
                      onClick={() => act(() => api.renderRetry(job.id), job.id)}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Retry
                    </Button>
                  )}
                  {["NEEDS_REVISION", "REVIEW", "APPROVED"].includes(job.status) && job.shot && job.status !== "APPROVED" && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-emerald-400/30 bg-emerald-400/5 text-emerald-200" disabled={busyId === job.id}
                      onClick={() => act(() => api.renderApprove(job.id), job.id)}>
                      <ThumbsUp className="h-3 w-3 mr-1" /> Creator approve
                    </Button>
                  )}
                </div>
              </div>

              {(() => {
                const tel = parseTelemetry(job.telemetry);
                if (!tel || tel.spans.length === 0) return null;
                return (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px] leading-relaxed">
                    <Timer className="h-3 w-3 text-muted-foreground shrink-0" />
                    {tel.spans.map((span, i) => (
                      <span
                        key={i}
                        title={`${span.provider}${span.note ? ` (${span.note})` : ""} worked ${formatSeconds(span.ms)} on this job`}
                        className="rounded px-1.5 py-0.5 border border-white/12 bg-white/5 tabular-nums"
                      >
                        <span className="text-muted-foreground">{i > 0 ? "→ " : ""}</span>
                        <span className="font-semibold">{span.provider}</span> {formatSeconds(span.ms)}
                        {span.note && <span className="text-muted-foreground"> · {span.note}</span>}
                      </span>
                    ))}
                    {tel.credits > 0 && (
                      <span className="rounded px-1.5 py-0.5 border border-sky-400/25 bg-sky-400/5 text-sky-300 tabular-nums" title="Estimated cost: hosted providers bill per clip-second (MOTION and local Blender compute is free)">
                        ~{tel.credits} credits
                      </span>
                    )}
                    {tel.takeovers.length > 0 && (
                      <span className="text-amber-300/80" title={tel.takeovers.join("; ")}>takeover</span>
                    )}
                  </div>
                );
              })()}

              {job.outputUrl && !active && (
                <video
                  key={job.id}
                  src={job.outputUrl}
                  controls
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full rounded-lg border border-white/10 bg-black mt-3"
                  style={{ maxHeight: 280 }}
                />
              )}

              {active && (
                <div className="mt-3">
                  <Progress value={job.progress} className="h-1.5" />
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>{job.stage}</span>
                    <span className="tabular-nums">{Math.round(job.progress)}%</span>
                  </div>
                </div>
              )}

              {job.evaluation && !active && (
                <div className="mt-3 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {job.evaluation.verdict === "APPROVED" ? (
                      <><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> DSH inspection - Approved</>
                    ) : (
                      <><ShieldX className="h-3.5 w-3.5 text-violet-300" /> DSH inspection - Needs revision</>
                    )}
                    {job.evaluation.applied && <span className="text-[10px] font-normal text-muted-foreground">(modifications applied)</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">{job.evaluation.summary}</p>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2.5">
                    {findings.map((f, i) => (
                      <div key={i} className="text-[11px] leading-relaxed flex gap-1.5">
                        <span className={f.status === "GOOD" ? "text-emerald-400" : "text-amber-400"}>{f.status === "GOOD" ? "●" : "▲"}</span>
                        <span><b className="font-medium">{f.aspect}:</b> <span className="text-muted-foreground">{f.note}</span></span>
                      </div>
                    ))}
                  </div>
                  {actions.length > 0 && !job.evaluation.applied && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/8">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Proposed modifications</div>
                      <div className="space-y-1">
                        {actions.map((a, i) => (
                          <div key={i} className="text-[11px] font-mono text-teal-200/90">
                            {a.param}: {String(a.from)} → <b>{String(a.to)}</b>
                            <span className="text-muted-foreground font-sans"> - {a.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
