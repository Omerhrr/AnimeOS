"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  MonitorPlay, CheckCheck, RotateCcw, ThumbsUp, ShieldCheck, ShieldX, Loader2, Cable, Boxes,
  Layers, ListFilter, Play, Clapperboard, Timer, Send, MessagesSquare, ShieldAlert, XCircle,
  ClipboardCheck, Wrench, Download,
} from "lucide-react";
import { api, parseActions, parseFindings, type StudioProject, type BridgeStatusInfo, type EpisodeCutResult } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader, StatusBadge } from "@/components/views/shared";
import { CommentThread } from "@/components/views/comment-thread";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { formatSeconds, parseTelemetry, providerLedger } from "@/lib/engine/telemetry";
import { cn } from "@/lib/utils";

// The HUMAN GATE control (Iteration 48): studio policy, OWNER-only.
// Armed, a DSH APPROVED inspection parks the render at REVIEW until a
// creator releases it - the gate lives between the evaluator and the
// queue's APPROVED state.
function ApprovalGateControl({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "OWNER";
  const [busy, setBusy] = useState(false);
  const armed = project.approvalGate;

  async function toggle() {
    if (!isOwner || busy) return;
    setBusy(true);
    try {
      await api.setApprovalGate(project.id, !armed);
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not change the gate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void toggle()}
      disabled={!isOwner || busy}
      title={isOwner
        ? armed ? "The human approval gate is ARMED - click to release it (DSH approvals land directly again)" : "Arm the human approval gate - DSH-approved renders will wait for a creator's approval"
        : "Only an OWNER can arm or release the approval gate"}
      className={cn(
        "px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors inline-flex items-center gap-1.5",
        armed ? "bg-amber-400/15 text-amber-200 border-amber-400/40" : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground",
        !isOwner && "cursor-not-allowed opacity-80"
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
      Human gate: {armed ? "ARMED" : "off"}
    </button>
  );
}

function EngineDriverCard() {
  const bridgeQ = useQuery({ queryKey: ["bridge"], queryFn: api.bridgeStatus, refetchInterval: 5000 });
  const runtimeQ = useQuery({ queryKey: ["blender-runtime"], queryFn: api.blenderRuntime, refetchInterval: 8000 });
  const s = bridgeQ.data;
  const rt = runtimeQ.data;
  const live = s?.mode === "LIVE_BLENDER" && s.reachable;
  const motion = s?.mode === "MOTION";
  const img2vid = (s as BridgeStatusInfo | undefined)?.img2vid;
  const resident = rt?.resident;

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
            ? `Blender ${s?.blenderVersion ?? ""} attached${s?.source === "resident" ? " (resident runtime)" : s?.source === "local" ? " (headless worker pool)" : ` at ${s?.host ?? ""}`}${s?.scene && s.source !== "local" && s.source !== "resident" ? ` · scene “${s.scene}”` : ""} - animated sequence renders flow back into the queue.`
            : s?.detail ?? "Probing bridge…"}
        </p>
        {resident && (
          <p className="text-[10px] text-muted-foreground/80 mt-1 font-mono">
            RUNTIME: blender {rt?.version ?? "-"} · binary {rt?.binary ? "present" : "missing"}{rt?.provisioning ? " · PROVISIONING" : ""} · resident {resident.healthy ? "healthy" : resident.running ? "running" : "down"} on :{resident.port} · restarts {resident.restarts}{resident.lastError ? ` · ${resident.lastError}` : ""}
          </p>
        )}
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

// Blender ASSET LIBRARY (design once, render many): the DESIGNED
// characters, environments, props and creatures the studio's own
// Blender runtime built, with version, preview, quality grade and the
// self-correcting DESIGN LOOP (audit + fix) wired to the same API DSH
// drives.
function kindLabel(kind: string): string {
  if (kind === "CHARACTER") return "CHAR";
  if (kind === "ENVIRONMENT") return "ENV";
  if (kind === "PROP") return "PROP";
  return "CREATURE";
}

function BlenderAssetLibraryCard() {
  const { projectId } = useStudio();
  const { data: session } = useSession();
  const qc = useQueryClient();
  const canDirect = session?.user?.role === "OWNER" || session?.user?.role === "EDITOR";
  const [busy, setBusy] = useState<string | null>(null);
  const [designNote, setDesignNote] = useState<string | null>(null);
  const assetsQ = useQuery({
    queryKey: ["blender-assets", projectId],
    queryFn: () => api.blenderAssets(projectId ?? ""),
    enabled: Boolean(projectId),
    refetchInterval: 10000,
  });
  const designQ = useQuery({
    queryKey: ["design-reviews", projectId],
    queryFn: () => api.designReviews(projectId ?? ""),
    enabled: Boolean(projectId),
    refetchInterval: 10000,
  });
  const runDesign = async (action: "audit" | "fix", refName: string, kind: string) => {
    if (!projectId) return;
    setBusy(`${action}:${refName}`);
    setDesignNote(null);
    try {
      const res = (await api.designReviewAction({ action, projectId, refName, kind })) as {
        ok?: boolean;
        error?: string;
        state?: string;
        overall?: number;
        issues?: Array<{ severity: string; kind: string; note: string }>;
        versionAfter?: number | null;
        fixed?: number;
        attempted?: number;
        reAudit?: { state: string; overall: number };
      };
      if (res.ok === false && res.error) {
        setDesignNote(`${action.toUpperCase()} failed: ${res.error}`);
      } else if (action === "audit") {
        const issueCount = res.issues?.length ?? 0;
        setDesignNote(`Audit ${res.state ?? "?"} at ${Math.round((res.overall ?? 0) * 100)}% - ${issueCount} issue(s) found${issueCount ? `: ${res.issues!.slice(0, 3).map((i) => `${i.severity} ${i.kind}`).join(", ")}` : ""}`);
      } else {
        setDesignNote(`Fix landed v${res.versionAfter ?? "?"}: ${res.fixed ?? 0}/${res.attempted ?? 0} issue(s) cleared by the re-audit${res.reAudit ? `, re-audit ${res.reAudit.state} at ${Math.round(res.reAudit.overall * 100)}%` : ""}`);
      }
      await qc.invalidateQueries({ queryKey: ["design-reviews", projectId] });
      await qc.invalidateQueries({ queryKey: ["blender-assets", projectId] });
    } catch (err) {
      setDesignNote(`${action.toUpperCase()} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  const runExport = async (refName: string, format: "GLB" | "FBX") => {
    if (!projectId) return;
    setBusy(`export:${refName}:${format}`);
    setDesignNote(null);
    try {
      const res = (await api.blenderExport({ projectId, refName, format, verify: true })) as {
        ok?: boolean;
        error?: string;
        verified?: boolean;
        publicPath?: string | null;
        report?: { bytes?: number; meshesSrc?: number; meshesRe?: number; triDeltaPct?: number; bboxDeltaPct?: number; missing?: string[] } | null;
      };
      if (res.ok === false && res.error) {
        setDesignNote(`EXPORT failed: ${res.error}`);
      } else {
        const rep = res.report ?? {};
        setDesignNote(`EXPORT ${format} ${res.verified ? "VERIFIED" : "NOT VERIFIED"} - ${rep.meshesRe ?? "?"}/${rep.meshesSrc ?? "?"} meshes, tri delta ${rep.triDeltaPct ?? "?"}%, bbox delta ${rep.bboxDeltaPct ?? "?"}%${res.publicPath ? " - downloading from /exports/" : ""}`);
      }
      await qc.invalidateQueries({ queryKey: ["blender-assets", projectId] });
    } catch (err) {
      setDesignNote(`EXPORT failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };
  const lib = assetsQ.data;
  const design = designQ.data;
  if (!lib || lib.total === 0) {
    return (
      <div className="studio-panel p-4 mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Boxes className="h-4 w-4 text-fuchsia-300" />
          Blender asset library
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
          No DESIGNED assets yet. DSH designs them with blender_asset_build: each character, environment, prop and creature becomes a versioned .blend in the library - and every render job of that cast/environment (or shot text naming a prop) loads the asset instead of rebuilding procedural stand-ins. Props and creatures then get a motion preset (design_motion + rebuild): the card plays the baked performance loop. The design loop (audit, fix, re-audit) keeps the quality bar honest.
        </p>
      </div>
    );
  }
  return (
    <div className="studio-panel p-4 mb-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Boxes className="h-4 w-4 text-fuchsia-300" />
        Blender asset library
        <span className="rounded bg-fuchsia-400/10 border border-fuchsia-400/30 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-fuchsia-300">
          {lib.ready}/{lib.total} READY
        </span>
        {lib.avgIdentity !== null && (
          <span className="rounded bg-white/5 border border-white/12 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-muted-foreground">
            IDENTITY {Math.round(lib.avgIdentity * 100)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
        {lib.assets.map((a) => {
          const openForAsset = design?.openIssues.filter((i) => i.refName === a.refName) ?? [];
          return (
            <div key={a.id} className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="aspect-square bg-black/40 relative">
                {a.loopPath ? (
                  <video
                    src={a.loopPath}
                    poster={a.previewPath ?? undefined}
                    muted
                    loop
                    autoPlay
                    playsInline
                    controls
                    className="w-full h-full object-cover"
                    title={`Performing '${a.motionPreset}' - the baked armature loop`}
                  />
                ) : a.previewPath ? (
                  <img src={a.previewPath} alt={a.refName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground/60">no preview</div>
                )}
                <span className="absolute top-1 left-1 rounded px-1 py-0.5 text-[8px] font-bold tracking-widest bg-black/60 text-white/80">
                  {kindLabel(a.kind)}
                </span>
                {a.qualityScore != null && (
                  <span className="absolute top-1 right-1 rounded px-1 py-0.5 text-[8px] font-bold tabular-nums bg-black/60 text-amber-300">
                    Q {Math.round(a.qualityScore * 100)}%
                  </span>
                )}
                {a.identityScore !== null && (
                  <span className="absolute bottom-1 right-1 rounded px-1 py-0.5 text-[8px] font-bold tabular-nums bg-black/60 text-emerald-300">
                    {Math.round(a.identityScore * 100)}%
                  </span>
                )}
                {a.loopPath && (
                  <span className="absolute bottom-1 left-8 rounded px-1 py-0.5 text-[8px] font-bold tracking-wider bg-black/60 text-cyan-300" title={`Baked motion preset: ${a.motionPreset}`}>
                    {a.motionPreset ?? "MOTION"}
                  </span>
                )}
                {a.variationPreset && (
                  <span className="absolute top-1 left-14 rounded px-1 py-0.5 text-[8px] font-bold tracking-wider bg-black/60 text-lime-300" title={`GN variation preset: ${a.variationPreset}`}>
                    +GN
                  </span>
                )}
                {a.sculptPreset && (
                  <span className="absolute top-1 left-[4.25rem] rounded px-1 py-0.5 text-[8px] font-bold tracking-wider bg-black/60 text-amber-300" title={`Sculpt preset: ${a.sculptPreset}`}>
                    +SCULPT
                  </span>
                )}
                {openForAsset.length > 0 && (
                  <span className="absolute bottom-1 left-1 rounded px-1 py-0.5 text-[8px] font-bold bg-black/60 text-rose-300">
                    {openForAsset.length} issue{openForAsset.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="p-1.5">
                <div className="text-[11px] font-medium truncate" title={a.refName}>{a.refName}</div>
                <div className="text-[9px] text-muted-foreground font-mono">
                  v{a.version} · {a.status}
                </div>
                {canDirect && (
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => runDesign("audit", a.refName, a.kind)}
                      className="h-5 px-1.5 text-[9px] gap-0.5 flex-1"
                      title="Design audit: per-criterion scores + issue registry"
                    >
                      {busy === `audit:${a.refName}` ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ClipboardCheck className="h-2.5 w-2.5" />}
                      Audit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null || openForAsset.length === 0}
                      onClick={() => runDesign("fix", a.refName, a.kind)}
                      className="h-5 px-1.5 text-[9px] gap-0.5 flex-1"
                      title="Design fix: real bpy refinement pass, version bump, re-audit"
                    >
                      {busy === `fix:${a.refName}` ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Wrench className="h-2.5 w-2.5" />}
                      Fix{openForAsset.length > 0 ? ` (${openForAsset.length})` : ""}
                    </Button>
                  </div>
                )}
                {canDirect && (
                  <div className="flex items-center gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => runExport(a.refName, "GLB")}
                      className="h-5 px-1.5 text-[9px] gap-0.5 flex-1"
                      title="Export GLB + verify the round trip (re-import + compare)"
                    >
                      {busy === `export:${a.refName}:GLB` ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
                      GLB
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => runExport(a.refName, "FBX")}
                      className="h-5 px-1.5 text-[9px] gap-0.5 flex-1"
                      title="Export FBX + verify the round trip (re-import + compare)"
                    >
                      {busy === `export:${a.refName}:FBX` ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
                      FBX
                    </Button>
                    {(() => {
                      const chip = lib.exports?.[a.id];
                      if (!chip) return null;
                      return (
                        <a
                          href={chip.publicPath ?? "#"}
                          title={`Last export ${chip.format} - ${chip.verified ? `VERIFIED, drift ${Math.round((chip.drift ?? 0) * 100)}%` : "NOT VERIFIED"}`}
                          className={`rounded px-1 py-0.5 text-[8px] font-bold tracking-wider ${chip.verified ? "bg-emerald-400/10 border border-emerald-400/30 text-emerald-300" : "bg-rose-400/10 border border-rose-400/30 text-rose-300"}`}
                        >
                          {chip.verified ? "VER" : "UNVER"}
                        </a>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {designNote && (
        <div className="mt-3 text-[10px] text-emerald-200 bg-emerald-400/5 border border-emerald-400/20 rounded px-1.5 py-1">
          {designNote}
        </div>
      )}
      {design && (design.openIssues.length > 0 || design.reviews.length > 0) && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground">
            <ClipboardCheck className="h-3 w-3" /> DESIGN LOOP
            <span className="rounded bg-white/5 border border-white/12 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-muted-foreground">
              BAR {design.reviews[0]?.bar ? Math.round(design.reviews[0].bar * 100) : 72}%
            </span>
            {design.bySeverity.CRITICAL > 0 && <span className="text-rose-300">{design.bySeverity.CRITICAL} CRITICAL</span>}
            {design.bySeverity.MAJOR > 0 && <span className="text-amber-300">{design.bySeverity.MAJOR} MAJOR</span>}
            {design.bySeverity.MINOR > 0 && <span className="text-sky-300">{design.bySeverity.MINOR} MINOR</span>}
          </div>
          {design.openIssues.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {design.openIssues.slice(0, 5).map((i) => (
                <div key={i.id} className="text-[10px] leading-snug flex gap-1.5">
                  <span className={cn(
                    "font-bold shrink-0",
                    i.severity === "CRITICAL" ? "text-rose-300" : i.severity === "MAJOR" ? "text-amber-300" : "text-sky-300",
                  )}>
                    {i.severity}
                  </span>
                  <span className="text-muted-foreground shrink-0">{i.kind} on {i.refName}:</span>
                  <span className="text-foreground/70 truncate" title={i.note}>{i.note}</span>
                </div>
              ))}
            </div>
          )}
          {design.reviews.length > 0 && design.openIssues.length === 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Latest audit: {design.reviews[0].targetRef} {design.reviews[0].state}
              {design.reviews[0].overall !== null ? ` at ${Math.round((design.reviews[0].overall ?? 0) * 100)}%` : ""} - the library stands.
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/70 mt-2">
        READY assets ride every matching render payload - the worker loads the designed .blend instead of rebuilding procedural stand-ins, and named props/creatures ride shots whose text mentions them (a performing asset's baked armature loop plays live in the render). Identity is vision-scored against the canonical sheets; the quality grade comes from the design loop DSH runs with design_audit / design_fix, and its MOTION criterion keeps props and creatures performing instead of standing still.
      </p>
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

interface PublishPackageUi {
  platform: string;
  platformLabel: string;
  title: string;
  description: string;
  tags: string[];
  ready: boolean;
  subtitle: { format: string; filename: string | null; cues: number; note: string };
  conformance: Array<{ label: string; ok: boolean; detail: string }>;
  checklist: string[];
  integration: { configured: boolean; detail: string; envKeys: string[] };
  package: { dir: string; files: string[] } | null; // the hand-off folder written next to the cut
  cut: { url: string; file: string; durationMs: number; width: number; height: number; fps: number; bytes: number };
}

interface PublishInfoUi {
  presets: Array<{ id: string; label: string; blurb: string; orientation: string; width: number; height: number; maxDurationSec: number; titleMaxChars: number; subtitleFormat: string; notes: string[]; envKeys: string[] }>;
  recent: Array<{ id: string; platform: string; platformLabel: string; ready: boolean; checksPassed: number; checksTotal: number; title: string; url: string; file: string; subtitleCues: number; subtitleFormat: string; packageDir: string | null; createdAt: string }>;
}

/**
 * Platform publishing: the delivery spine's last mile. A staged
 * package is a real conformance check of the exported cut against
 * the platform preset, plus metadata + subtitle sidecars - staged
 * locally and honestly (no network upload happens in this build).
 */
function PublishingPanel({ project }: { project: StudioProject }) {
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("YOUTUBE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkg, setPkg] = useState<PublishPackageUi | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const episodes = useMemo(
    () => project.seasons.flatMap((s) => s.episodes).sort((a, b) => a.number - b.number),
    [project.seasons]
  );

  const infoQ = useQuery({ queryKey: ["publishInfo", project.id], queryFn: () => api.publishInfo(project.id) });
  const info = infoQ.data;
  const preset = info?.presets.find((p) => p.id === platform);

  async function stage() {
    if (!episodeId) return;
    setBusy(true);
    setError(null);
    setPkg(null);
    setUploadNote(null);
    try {
      const r = await api.stagePublish(episodeId, platform);
      setPkg(r);
      void infoQ.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish staging failed");
    } finally {
      setBusy(false);
    }
  }

  // the credential-gated half: run the platform's real upload adapter
  // on a staged package - every outcome is recorded on the event
  async function upload(eventId: string) {
    setUploadingId(eventId);
    setError(null);
    setUploadNote(null);
    try {
      const r = await api.uploadPackage(eventId);
      setUploadNote(`${r.ok ? "Upload OK" : "Upload FAILED"} - ${r.detail}`);
      void infoQ.refetch();
    } catch (err) {
      setUploadNote(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  }

  if (episodes.length === 0) return null;

  return (
    <div className="studio-panel p-4 mb-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Send className="h-4 w-4 text-sky-300" />
        <span className="text-sm font-semibold">Publishing</span>
        <span className="text-[11px] text-muted-foreground">stage the exported cut for a platform: conformance checks, metadata, subtitle sidecar - packages are staged locally, upload stays a manual (or credential-gated) hand-off</span>
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <select
          value={episodeId ?? ""}
          onChange={(e) => { setEpisodeId(e.target.value || null); setPkg(null); setError(null); }}
          className="h-7 rounded-lg bg-white/5 border border-white/12 text-[11px] px-2 text-foreground"
          aria-label="Episode to publish"
        >
          <option value="">Pick an episode…</option>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>E{String(ep.number).padStart(2, "0")} · {ep.title}</option>
          ))}
        </select>
        <select
          value={platform}
          onChange={(e) => { setPlatform(e.target.value); setPkg(null); setError(null); }}
          className="h-7 rounded-lg bg-white/5 border border-white/12 text-[11px] px-2 text-foreground"
          aria-label="Platform preset"
        >
          {(info?.presets ?? [{ id: "YOUTUBE", label: "YouTube", blurb: "", orientation: "LANDSCAPE", width: 1920, height: 1080, maxDurationSec: 0, titleMaxChars: 0, subtitleFormat: "srt", notes: [], envKeys: [] }]).map((p) => (
            <option key={p.id} value={p.id}>{p.label} · {p.width}x{p.height} {p.orientation === "VERTICAL" ? "(9:16)" : "(16:9)"}</option>
          ))}
        </select>
        <Button size="sm" className="h-7 text-[11px]" disabled={busy || !episodeId} onClick={() => void stage()}>
          {busy ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Send className="h-3 w-3 mr-1.5" />}
          {busy ? "Checking conformance…" : "Stage package"}
        </Button>
        {preset && <span className="text-[10px] text-muted-foreground">{preset.blurb}</span>}
      </div>

      {error && <p className="text-[11px] text-rose-300 mt-2">{error}</p>}

      {pkg && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("px-2 py-1 rounded-md border text-[10px] font-semibold", pkg.ready ? "border-emerald-400/30 text-emerald-300 bg-emerald-400/10" : "border-amber-400/30 text-amber-300 bg-amber-400/10")}>
              {pkg.ready ? "READY" : "NOT READY"} · {pkg.conformance.filter((c) => c.ok).length}/{pkg.conformance.length} checks
            </span>
            <span className="text-[11px] font-medium truncate max-w-md" title={pkg.title}>{pkg.title}</span>
            <span className="text-[10px] text-muted-foreground">{pkg.platformLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pkg.conformance.map((c) => (
              <span
                key={c.label}
                title={c.detail}
                className={cn("px-1.5 py-0.5 rounded border text-[9px] font-medium", c.ok ? "border-emerald-400/25 text-emerald-300/90 bg-emerald-400/[0.06]" : "border-rose-400/30 text-rose-300 bg-rose-400/10")}
              >
                {c.ok ? "OK" : "FAIL"} {c.label}
              </span>
            ))}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 space-y-1 text-[10px] text-muted-foreground leading-relaxed">
            <div><span className="text-foreground/80">description:</span> {pkg.description.slice(0, 180)}{pkg.description.length > 180 ? "…" : ""}</div>
            <div><span className="text-foreground/80">tags:</span> {pkg.tags.join(" · ")}</div>
            <div><span className="text-foreground/80">subtitles:</span> {pkg.subtitle.format === "none" ? pkg.subtitle.note : `${pkg.subtitle.format.toUpperCase()} ${pkg.subtitle.cues} cue(s) -> ${pkg.subtitle.filename}`}</div>
            <div><span className="text-foreground/80">integration:</span> {pkg.integration.detail}</div>
            <div><span className="text-foreground/80">hand-off folder:</span> {pkg.package ? <span className="font-mono text-sky-300/90">{pkg.package.dir}</span> : <span>not written (the cut or the disk write was unavailable - staging still stands)</span>}{pkg.package && <span> · {pkg.package.files.join(", ")}</span>}</div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {pkg.checklist.map((c, i) => <span key={i} className="before:content-['•'] before:mr-1">{c}</span>)}
          </div>
        </div>
      )}

      {info && info.recent.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-[10px] uppercase tracking-[0.14em] text-sky-300/90">Staged packages</div>
          {info.recent.slice(0, 5).map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 flex items-center gap-2 text-[10px]">
              <span className={cn("px-1.5 py-0.5 rounded border font-semibold shrink-0", r.ready ? "border-emerald-400/25 text-emerald-300 bg-emerald-400/10" : "border-amber-400/30 text-amber-300 bg-amber-400/10")}>
                {r.ready ? "READY" : "BLOCKED"}
              </span>
              <span className="text-[11px] truncate flex-1" title={r.title}>{r.title}</span>
              <span className="text-muted-foreground shrink-0">{r.platformLabel}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">{r.checksPassed}/{r.checksTotal} checks</span>
              {r.subtitleCues > 0 && <span className="text-muted-foreground shrink-0">{r.subtitleFormat.toUpperCase()} {r.subtitleCues}</span>}
              {r.packageDir && <span className="font-mono text-sky-300/80 shrink-0" title={`hand-off folder: ${r.packageDir}`}>folder</span>}
              {r.platform !== "STUDIO_INGEST" && (
                <button
                  onClick={() => void upload(r.id)}
                  disabled={uploadingId === r.id}
                  title="Run the platform's real upload adapter (credential-gated: the honest refusal names the missing env key)"
                  className="h-5 shrink-0 rounded-md border border-sky-400/25 bg-sky-400/10 px-1.5 text-[9px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40"
                >
                  {uploadingId === r.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Upload"}
                </button>
              )}
            </div>
          ))}
          {uploadNote && <p className={cn("text-[10px] leading-relaxed", uploadNote.startsWith("Upload OK") ? "text-emerald-300" : "text-amber-300")}>{uploadNote}</p>}
        </div>
      )}
    </div>
  );
}

export function RenderView({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const { projectId, openPreview } = useStudio();
  const { data: session } = useSession();
  const canDirect = session?.user?.role === "OWNER" || session?.user?.role === "EDITOR";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("ALL");
  // the human reject flow: which card is asking for a note, and the note
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

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

  async function sendReject(jobId: string) {
    const note = rejectNote.trim();
    if (!note) return;
    await act(() => api.renderReject(jobId, note), jobId);
    setRejectingId(null);
    setRejectNote("");
  }

  const jobs = jobsQ.data ?? [];
  const counts = useMemo(() => ({
    active: jobs.filter((j) => ["QUEUED", "RENDERING", "INSPECTING"].includes(j.status)).length,
    review: jobs.filter((j) => ["REVIEW", "NEEDS_REVISION"].includes(j.status)).length,
    approved: jobs.filter((j) => ["APPROVED"].includes(j.status)).length,
    // DSH said APPROVED but the human gate holds the render at REVIEW
    gateHeld: jobs.filter((j) => j.status === "REVIEW" && j.evaluation?.verdict === "APPROVED").length,
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

      <BlenderAssetLibraryCard />

      <BatchRenderCard project={project} />

      <EpisodeCutCard project={project} />
      <PublishingPanel project={project} />

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mr-1">
          <span className="px-2 py-0.5 rounded border border-amber-400/25 bg-amber-400/5 tabular-nums">{counts.active} active</span>
          <span className="px-2 py-0.5 rounded border border-violet-400/25 bg-violet-400/5 tabular-nums">{counts.review} in review</span>
          <span className="px-2 py-0.5 rounded border border-emerald-400/25 bg-emerald-400/5 tabular-nums">{counts.approved} approved</span>
          {counts.gateHeld > 0 && (
            <span className="px-2 py-0.5 rounded border border-amber-400/40 bg-amber-400/10 text-amber-200 tabular-nums font-medium" title="DSH approved these renders, but the human approval gate holds them at REVIEW until a creator releases them">{counts.gateHeld} awaiting approval</span>
          )}
          {totalCredits > 0 && (
            <span className="px-2 py-0.5 rounded border border-sky-400/25 bg-sky-400/5 tabular-nums" title="Estimated cost over these jobs (hosted providers bill per clip-second)">~{totalCredits} credits</span>
          )}
        </div>
        <ApprovalGateControl project={project} />
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
                    {(() => {
                      // DIRECTED MOTION GRAMMAR chips: the shot's beat sequence
                      const beats = (() => {
                        try {
                          const g = job.shot?.grammar ? (JSON.parse(job.shot.grammar) as Array<{ move?: string; from?: number; to?: number; wind?: number }>) : null;
                          return g && Array.isArray(g) && g.length >= 2 ? g : null;
                        } catch { return null; }
                      })();
                      if (!beats) return null;
                      return (
                        <span className="inline-flex items-center gap-1 flex-wrap" title="Directed motion grammar - the worker plays these camera beats in order; cloth and hair ride each beat (a W flag marks a directed wind call)">
                          {beats.map((b, i) => (
                            <span key={i} className={cn(
                              "rounded px-1 py-[1px] text-[8px] font-bold tracking-wider border",
                              (b.wind ?? 0) > 0
                                ? "bg-sky-400/10 border-sky-400/40 text-sky-300"
                                : "bg-violet-400/10 border-violet-400/30 text-violet-300",
                            )}>
                              {b.move} {Math.round((b.from ?? 0) * 100)}-{Math.round((b.to ?? 0) * 100)}%{(b.wind ?? 0) > 0 ? ` W${b.wind!.toFixed(1)}` : ""}
                            </span>
                          ))}
                        </span>
                      );
                    })()}
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
                  {job.shot && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" title="Open the workplace thread on this shot">
                          <MessagesSquare className="h-3 w-3 mr-1" /> Discuss
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 max-h-96 overflow-y-auto studio-scroll" align="end">
                        <CommentThread anchorType="SHOT" anchorId={job.shot.id} label={`Shot ${String(job.shot.number).padStart(3, "0")}`} />
                      </PopoverContent>
                    </Popover>
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
                  {canDirect && ["NEEDS_REVISION", "REVIEW", "APPROVED"].includes(job.status) && job.shot && job.status !== "APPROVED" && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-emerald-400/30 bg-emerald-400/5 text-emerald-200" disabled={busyId === job.id}
                      onClick={() => act(() => api.renderApprove(job.id), job.id)}>
                      <ThumbsUp className="h-3 w-3 mr-1" /> Approve
                    </Button>
                  )}
                  {canDirect && ["NEEDS_REVISION", "REVIEW"].includes(job.status) && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-rose-400/30 bg-rose-400/5 text-rose-200"
                      onClick={() => { setRejectingId(rejectingId === job.id ? null : job.id); setRejectNote(""); }}>
                      <XCircle className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  )}
                </div>
              </div>

              {rejectingId === job.id && (
                <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/[0.04] p-3">
                  <div className="text-[11px] font-medium text-rose-200 mb-1.5">Request a revision - the note lands in this shot's thread</div>
                  <Textarea
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Say what to fix: camera closer on the blade glow, tighten the fog, re-time the beat..."
                    className="min-h-[52px] text-[11px] bg-black/25 resize-none"
                  />
                  <div className="flex justify-end gap-1.5 mt-2">
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" onClick={() => { setRejectingId(null); setRejectNote(""); }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-[11px]" disabled={!rejectNote.trim() || busyId === job.id} onClick={() => void sendReject(job.id)}>
                      {busyId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Send
                    </Button>
                  </div>
                </div>
              )}

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
                  <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
                    {job.evaluation.verdict === "APPROVED" ? (
                      <><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> DSH inspection - Approved</>
                    ) : (
                      <><ShieldX className="h-3.5 w-3.5 text-violet-300" /> DSH inspection - Needs revision</>
                    )}
                    {job.evaluation.applied && <span className="text-[10px] font-normal text-muted-foreground">(modifications applied)</span>}
                    {job.evaluation.verdict === "APPROVED" && job.status === "REVIEW" && (
                      <span className="text-[9px] font-bold tracking-widest rounded px-1.5 py-0.5 border border-amber-400/40 bg-amber-400/10 text-amber-200" title="The human approval gate is armed: DSH's approval is a recommendation - a creator releases this render">
                        HELD AT THE HUMAN GATE
                      </span>
                    )}
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
