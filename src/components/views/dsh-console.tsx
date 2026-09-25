"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send, Loader2, Brain, ListChecks, Wrench, CircleCheck, CircleX, User,
  Sparkles, ChevronDown, ChevronUp, Volume2, Play, Square, Route, ClipboardList,
  CalendarClock, Clock, Mail, Trash2, Wand2,
} from "lucide-react";
import { api, parseTrace, type DshMessageRow } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { buildArcTakes, mergeArcTakes, type ArcPlaybackShot, type ArcTakeItem } from "@/lib/comic/arc-playback";
import type { ArcPlaybackChip, EnsembleAuditionPreview, TraceStep } from "@/lib/types";

const SUGGESTIONS = [
  "Create a new donghua production called 'Azure Sky' about a cloud-riding swordswoman",
  "Break Scene 12 into shots with full cinematography",
  "Check Scene 12 for missing capabilities and fix them",
  "Render a preview of shot 5 in scene 12 and inspect it",
];

// ─────────────────────────────────────────────────────────────
// PLANS THAT OUTLIVE THE TURN: DSH lands cross-turn plans as
// PROPOSED; this panel is the creator's review gate - approve a plan
// to open its runner, then run the next steps (a few per click) or
// pause/abort between them. Run state lives in the DB, so the panel,
// DSH and any later conversation see the same progress.
// ─────────────────────────────────────────────────────────────
interface PlanStepRow {
  tool: string;
  args: Record<string, unknown>;
  why: string;
  status: "PENDING" | "DONE" | "ERROR";
  result?: string;
  at?: string;
}

interface PlanRow {
  id: string;
  title: string;
  goal: string;
  status: "PROPOSED" | "ACTIVE" | "PAUSED" | "DONE" | "ABORTED";
  source: "DSH" | "CREATOR";
  cursor: number;
  total: number;
  done: number;
  failed: number;
  steps: PlanStepRow[];
  createdAt: string;
  updatedAt: string;
}

const PLAN_STATUS_COLORS: Record<string, string> = {
  PROPOSED: "border-violet-400/30 text-violet-300 bg-violet-400/10",
  ACTIVE: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  PAUSED: "border-amber-400/30 text-amber-300 bg-amber-400/10",
  DONE: "border-sky-400/30 text-sky-300 bg-sky-400/10",
  ABORTED: "border-white/20 text-muted-foreground bg-white/5",
};

const STEP_DOT: Record<string, string> = {
  PENDING: "bg-white/20",
  DONE: "bg-emerald-400",
  ERROR: "bg-rose-400",
};

/** One episode row of the per-episode template catalog. */
interface TemplateEpisode {
  episodeId: string;
  seasonNumber: number;
  number: number;
  title: string;
  sceneCount: number;
  shotCount: number;
  templates: Array<{ id: string; name: string; summary: string; cadenceHint: string; stepCount: number }>;
}

interface SavedTemplateRow {
  id: string;
  projectId: string | null;
  scope: "PROJECT" | "STUDIO";
  baseId: string;
  name: string;
  summary: string;
  cadenceHint: string;
  stepCount: number;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

function PlansPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // per-episode templates: episode pick + landing state
  const [episodeId, setEpisodeId] = useState("");
  const [landing, setLanding] = useState<string | null>(null);
  const [landMsg, setLandMsg] = useState<string | null>(null);
  // creator-authored variations: the authoring editor
  const [showAuthor, setShowAuthor] = useState(false);
  const [baseId, setBaseId] = useState("beat-breakdown");
  const [vName, setVName] = useState("");
  const [vSummary, setVSummary] = useState("");
  const [vCadence, setVCadence] = useState("nightly - a few steps per fire");
  const [vScope, setVScope] = useState<"PROJECT" | "STUDIO">("PROJECT");
  const [vSteps, setVSteps] = useState<Array<{ tool: string; args: string; why: string }>>([]);
  const [savingVar, setSavingVar] = useState(false);
  const [varMsg, setVarMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const plansQ = useQuery({
    queryKey: ["dshPlans", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/dsh-plans?projectId=${projectId}`);
      const body = (await res.json()) as { plans?: PlanRow[] };
      return body.plans ?? [];
    },
    enabled: Boolean(projectId),
    refetchInterval: (q) => ((q.state.data ?? []).some((p) => p.status === "ACTIVE") ? 5000 : false),
  });
  const catalogQ = useQuery({
    queryKey: ["planTemplates", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/plan-templates?projectId=${projectId}`);
      const body = (await res.json()) as { episodes?: TemplateEpisode[]; saved?: SavedTemplateRow[] };
      return { episodes: body.episodes ?? [], saved: body.saved ?? [] };
    },
    enabled: Boolean(projectId) && open,
  });
  const plans = plansQ.data ?? [];
  const episodes = catalogQ.data?.episodes ?? [];
  const savedTemplates = catalogQ.data?.saved ?? [];
  const pickedEpisode = episodes.find((e) => e.episodeId === episodeId) ?? episodes[0] ?? null;
  const proposed = plans.filter((p) => p.status === "PROPOSED").length;
  const active = plans.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED").length;

  async function act(planId: string, action: string, maxSteps?: number) {
    setBusyId(planId);
    setError(null);
    try {
      const res = await fetch("/api/dsh-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, action, maxSteps }),
      });
      const body = (await res.json()) as { error?: string; report?: string };
      if (!res.ok) setError(body.error ?? "Plan action failed");
      else if (body.report) console.log("plan run report:", body.report);
    } catch {
      setError("Plan action failed");
    } finally {
      setBusyId(null);
      await qc.invalidateQueries({ queryKey: ["dshPlans", projectId] });
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  async function land(templateId: string) {
    if (!pickedEpisode) return;
    setLanding(templateId);
    setLandMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/plan-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, episodeId: pickedEpisode.episodeId, templateId }),
      });
      const body = (await res.json()) as { error?: string; planTitle?: string };
      if (!res.ok) setError(body.error ?? "Landing failed");
      else setLandMsg(`'${body.planTitle}' landed as a proposal - approve it above to open its runner.`);
    } catch {
      setError("Landing failed");
    } finally {
      setLanding(null);
      await qc.invalidateQueries({ queryKey: ["dshPlans", projectId] });
    }
  }

  // Authoring: load a built-in's resolved steps as the starting point,
  // then edit every row (tool / args JSON / why) into a variation.
  async function loadBase() {
    if (!pickedEpisode) return;
    setVarMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/plan-templates?projectId=${projectId}&episodeId=${pickedEpisode.episodeId}&templateId=${baseId}`);
      const body = (await res.json()) as { error?: string; steps?: Array<{ tool: string; args: Record<string, unknown>; why: string }> };
      if (!res.ok || !body.steps) {
        setError(body.error ?? "Loading the base failed");
        return;
      }
      setVSteps(body.steps.map((s) => ({ tool: s.tool, args: JSON.stringify(s.args), why: s.why })));
      setVarMsg(`Loaded the '${baseId}' built-in for ${pickedEpisode.title} - edit the rows, then save it as a variation.`);
    } catch {
      setError("Loading the base failed");
    }
  }

  async function saveVariation() {
    setSavingVar(true);
    setVarMsg(null);
    setError(null);
    try {
      const steps: Array<{ tool: string; args: Record<string, unknown>; why: string }> = [];
      for (const [i, s] of vSteps.entries()) {
        if (!s.tool.trim()) {
          setError(`Step ${i + 1}: tool is required`);
          return;
        }
        let args: Record<string, unknown> = {};
        if (s.args.trim()) {
          try {
            args = JSON.parse(s.args) as Record<string, unknown>;
          } catch {
            setError(`Step ${i + 1}: args is not valid JSON (tip: {} is a valid empty arg set; tokens {episode}, {latestScene}, {title} resolve at landing)`);
            return;
          }
        }
        steps.push({ tool: s.tool.trim(), args, why: s.why.trim() });
      }
      const res = await fetch("/api/plan-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, baseId, name: vName, summary: vSummary, cadenceHint: vCadence, scope: vScope, steps }),
      });
      const body = (await res.json()) as { error?: string; template?: { name: string } };
      if (!res.ok) {
        setError(body.error ?? "Saving the variation failed");
        return;
      }
      setVarMsg(`Variation '${body.template?.name ?? vName}' saved - it now lands like a built-in (Land as plan below or land_episode_plan).`);
      setVName("");
      setVSummary("");
      setVSteps([]);
      await qc.invalidateQueries({ queryKey: ["planTemplates", projectId] });
    } finally {
      setSavingVar(false);
    }
  }

  async function removeVariation(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/plan-templates?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Delete failed");
      } else {
        setVarMsg("Variation deleted.");
      }
    } catch {
      setError("Delete failed");
    } finally {
      setDeletingId(null);
      await qc.invalidateQueries({ queryKey: ["planTemplates", projectId] });
    }
  }

  // The panel always renders now: even with zero plans it carries the
  // per-episode template catalog (the nightly-breakdown entry point).

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-300">
          <ClipboardList className="h-3.5 w-3.5" />
          Plans that outlive the turn
          {proposed > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-violet-400/30 text-violet-300 bg-violet-400/10 normal-case tracking-normal">{proposed} awaiting review</span>
          )}
          {active > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-emerald-400/30 text-emerald-300 bg-emerald-400/10 normal-case tracking-normal">{active} in flight</span>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-[26rem] overflow-y-auto studio-scroll">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            DSH landed these ordered tool-call lists for work that spans turns or days. Approve a proposal to open its runner;
            running executes real production steps and records each result. A failed step parks the plan for a retry.
          </p>
          {error && (
            <div className="text-[10px] text-rose-300 bg-rose-400/10 border border-rose-400/25 rounded-md px-2 py-1">{error}</div>
          )}
          {landMsg && (
            <div className="text-[10px] text-teal-300 bg-teal-400/10 border border-teal-400/25 rounded-md px-2 py-1">{landMsg}</div>
          )}
          {plans.map((p) => (
            <div key={p.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold", PLAN_STATUS_COLORS[p.status])}>{p.status}</span>
                <span className="text-[12px] font-medium">{p.title}</span>
                <span className="text-[9px] text-muted-foreground font-mono">{p.done}/{p.total} done{p.failed ? ` · ${p.failed} failed` : ""}</span>
                <span className="text-[9px] text-muted-foreground">via {p.source === "DSH" ? "DSH" : "creator"}</span>
                <span className="flex-1" />
                {p.status === "PROPOSED" && (
                  <button onClick={() => void act(p.id, "approve")} disabled={busyId === p.id} className="h-6 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-400/20 transition-colors disabled:opacity-40">Approve</button>
                )}
                {(p.status === "ACTIVE") && (
                  <>
                    <button onClick={() => void act(p.id, "run", 1)} disabled={busyId === p.id} className="h-6 rounded-md border border-teal-400/25 bg-teal-400/10 px-2 text-[10px] font-semibold text-teal-200 hover:bg-teal-400/20 transition-colors disabled:opacity-40 flex items-center gap-1">
                      {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}Run next step
                    </button>
                    <button onClick={() => void act(p.id, "run", 3)} disabled={busyId === p.id} className="h-6 rounded-md border border-teal-400/25 bg-teal-400/[0.06] px-2 text-[10px] text-teal-200/90 hover:bg-teal-400/15 transition-colors disabled:opacity-40">Run 3</button>
                    <button onClick={() => void act(p.id, "pause")} disabled={busyId === p.id} className="h-6 rounded-md border border-amber-400/25 bg-amber-400/10 px-2 text-[10px] text-amber-200 hover:bg-amber-400/20 transition-colors disabled:opacity-40">Pause</button>
                  </>
                )}
                {p.status === "PAUSED" && (
                  <button onClick={() => void act(p.id, "resume")} disabled={busyId === p.id} className="h-6 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-400/20 transition-colors disabled:opacity-40">Resume</button>
                )}
                {(p.status === "ACTIVE" || p.status === "PAUSED" || p.status === "PROPOSED") && (
                  <button onClick={() => void act(p.id, "abort")} disabled={busyId === p.id} className="h-6 rounded-md border border-rose-400/25 bg-rose-400/10 px-2 text-[10px] text-rose-200 hover:bg-rose-400/20 transition-colors disabled:opacity-40">Abort</button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{p.goal}</p>
              <div className="space-y-1">
                {p.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px] leading-relaxed">
                    <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", STEP_DOT[s.status] ?? "bg-white/20")} />
                    <span className="text-muted-foreground/70 font-mono shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-mono text-[9px] text-sky-300/90 shrink-0">{s.tool}</span>
                    <span className="text-muted-foreground truncate" title={s.why}>{s.why || (s.status !== "PENDING" ? (s.result ?? "").split("\n")[0] : "")}</span>
                    {s.status === "ERROR" && <span className="text-rose-300 shrink-0">failed</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {episodes.length > 0 && (
            <div className="rounded-lg border border-teal-400/15 bg-teal-400/[0.03] p-2.5 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-300">Per-episode templates</span>
                <select
                  value={pickedEpisode?.episodeId ?? ""}
                  onChange={(e) => { setEpisodeId(e.target.value); setLandMsg(null); }}
                  className="h-6 rounded-md bg-white/5 border border-white/12 text-[10px] px-1.5 text-foreground"
                  aria-label="Episode for the template"
                >
                  {episodes.map((ep) => (
                    <option key={ep.episodeId} value={ep.episodeId}>
                      S{ep.seasonNumber} E{String(ep.number).padStart(2, "0")} · {ep.title} ({ep.shotCount} shots)
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Land a shaped plan for the picked episode: numbers resolve from the production now, the plan waits as a proposal.
                Approve once, then run by hand or arm a nightly schedule - the nightly-breakdown pattern without hand-writing steps.
              </p>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {(pickedEpisode?.templates ?? []).map((t) => (
                  <div key={t.id} className="rounded-md border border-white/10 bg-black/25 p-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium">{t.name}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{t.stepCount} steps</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3" title={t.summary}>{t.summary}</p>
                    <div className="flex items-center gap-1.5 mt-auto pt-1">
                      <button
                        onClick={() => void land(t.id)}
                        disabled={landing === t.id || !pickedEpisode}
                        className="h-6 rounded-md border border-teal-400/25 bg-teal-400/10 px-2 text-[10px] font-semibold text-teal-200 hover:bg-teal-400/20 transition-colors disabled:opacity-40"
                      >
                        {landing === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Land as plan"}
                      </button>
                      <span className="text-[9px] text-muted-foreground truncate" title={t.cadenceHint}>{t.cadenceHint}</span>
                    </div>
                  </div>
                ))}
              </div>

              {savedTemplates.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/90">Your variations</div>
                  {savedTemplates.map((t) => (
                    <div key={t.id} className="rounded-md border border-violet-400/15 bg-violet-400/[0.04] p-2 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-medium">{t.name}</span>
                        <span className="px-1 py-0.5 rounded border border-violet-400/30 text-violet-300 bg-violet-400/10 text-[8px] font-semibold">{t.scope === "STUDIO" ? "STUDIO LIBRARY" : "THIS PRODUCTION"}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">{t.stepCount} steps · from {t.baseId}</span>
                        {t.usageCount > 0 && <span className="text-[9px] text-muted-foreground">· landed {t.usageCount}x</span>}
                        <span className="flex-1" />
                        <button
                          onClick={() => void land(t.id)}
                          disabled={landing === t.id || !pickedEpisode}
                          title="Land this variation as a PROPOSED plan for the picked episode"
                          className="h-6 rounded-md border border-teal-400/25 bg-teal-400/10 px-2 text-[10px] font-semibold text-teal-200 hover:bg-teal-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          {landing === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Land as plan"}
                        </button>
                        <button
                          onClick={() => void removeVariation(t.id)}
                          disabled={deletingId === t.id}
                          title="Delete this variation (plans already landed from it are unaffected)"
                          className="h-6 rounded-md border border-rose-400/25 bg-rose-400/10 px-2 text-[9px] text-rose-200 hover:bg-rose-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          {deletingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2" title={t.summary}>{t.summary}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-md border border-white/10 bg-black/20">
                <button
                  onClick={() => setShowAuthor((v) => !v)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold text-violet-300 hover:text-violet-200"
                >
                  <Wand2 className="h-3 w-3" />
                  {showAuthor ? "Hide the variation author" : "Author a variation"}
                  <span className="flex-1" />
                  {showAuthor ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </button>
                {showAuthor && (
                  <div className="px-2 pb-2 space-y-2">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Clone a built-in for the picked episode, reshape its rows (tool, args JSON, why), and save it as your own
                      template. In args, the tokens <span className="font-mono">{"{episode}"}</span>,{" "}
                      <span className="font-mono">{"{latestScene}"}</span> and <span className="font-mono">{"{title}"}</span> resolve to the
                      real episode numbers at landing time, so one variation serves every episode. Tools are validated against the
                      DSH registry on save.
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={baseId}
                        onChange={(e) => setBaseId(e.target.value)}
                        className="h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
                      >
                        <option value="beat-breakdown">beat-breakdown</option>
                        <option value="panel-pass">panel-pass</option>
                        <option value="render-pass">render-pass</option>
                        <option value="canon-audit">canon-audit</option>
                      </select>
                      <button
                        onClick={() => void loadBase()}
                        disabled={!pickedEpisode}
                        className="h-7 rounded-md border border-sky-400/25 bg-sky-400/10 px-2 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40"
                      >
                        Load base steps
                      </button>
                      <select
                        value={vScope}
                        onChange={(e) => setVScope(e.target.value as "PROJECT" | "STUDIO")}
                        className="h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
                        title="PROJECT saves it to this production; STUDIO shares it with every production"
                      >
                        <option value="PROJECT">This production</option>
                        <option value="STUDIO">Studio library</option>
                      </select>
                    </div>
                    <input
                      value={vName}
                      onChange={(e) => setVName(e.target.value)}
                      placeholder="Variation name (e.g. Two-shot beat breakdown)"
                      className="w-full h-7 rounded-md border border-white/10 bg-black/30 px-2 text-[11px] outline-none focus:border-white/25"
                    />
                    <input
                      value={vSummary}
                      onChange={(e) => setVSummary(e.target.value)}
                      placeholder="What this variation does (becomes the plan's goal)"
                      className="w-full h-7 rounded-md border border-white/10 bg-black/30 px-2 text-[11px] outline-none focus:border-white/25"
                    />
                    <input
                      value={vCadence}
                      onChange={(e) => setVCadence(e.target.value)}
                      placeholder="Cadence hint (e.g. nightly - a few steps per fire)"
                      className="w-full h-7 rounded-md border border-white/10 bg-black/30 px-2 text-[11px] outline-none focus:border-white/25"
                    />
                    {vSteps.map((s, i) => (
                      <div key={i} className="rounded-md border border-white/10 bg-black/25 p-1.5 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono text-muted-foreground shrink-0">{String(i + 1).padStart(2, "0")}</span>
                          <input
                            value={s.tool}
                            onChange={(e) => setVSteps((rows) => rows.map((r, j) => (j === i ? { ...r, tool: e.target.value } : r)))}
                            placeholder="DSH tool (e.g. create_shot)"
                            className="flex-1 h-6 rounded border border-white/10 bg-black/30 px-1.5 text-[10px] font-mono outline-none focus:border-white/25"
                          />
                          <button
                            onClick={() => setVSteps((rows) => rows.filter((_, j) => j !== i))}
                            title="Remove this step"
                            className="h-6 rounded border border-rose-400/25 bg-rose-400/10 px-1.5 text-[9px] text-rose-200 hover:bg-rose-400/20"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <textarea
                          value={s.args}
                          onChange={(e) => setVSteps((rows) => rows.map((r, j) => (j === i ? { ...r, args: e.target.value } : r)))}
                          placeholder='args JSON, e.g. {"episodeNumber":"{episode}","shotType":"MEDIUM"}'
                          rows={2}
                          className="w-full rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] font-mono outline-none focus:border-white/25 studio-scroll"
                        />
                        <input
                          value={s.why}
                          onChange={(e) => setVSteps((rows) => rows.map((r, j) => (j === i ? { ...r, why: e.target.value } : r)))}
                          placeholder="why this step exists (one line)"
                          className="w-full h-6 rounded border border-white/10 bg-black/30 px-1.5 text-[10px] outline-none focus:border-white/25"
                        />
                      </div>
                    ))}
                    {vSteps.length > 0 && vSteps.length < 12 && (
                      <button
                        onClick={() => setVSteps((rows) => [...rows, { tool: "", args: "{}", why: "" }])}
                        className="h-6 rounded-md border border-white/15 bg-white/5 px-2 text-[10px] text-muted-foreground hover:bg-white/10"
                      >
                        + Add a step
                      </button>
                    )}
                    <button
                      onClick={() => void saveVariation()}
                      disabled={savingVar || !vName.trim() || !vSummary.trim() || vSteps.length === 0}
                      className="h-7 rounded-md border border-violet-400/25 bg-violet-400/10 px-2.5 text-[10px] font-semibold text-violet-200 hover:bg-violet-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
                    >
                      {savingVar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      Save variation
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CADENCE SCHEDULER: recurring studio work nobody has to click -
 * nightly plan runs (approved plans walk a few steps per fire) and
 * render-queue supervision (tick render jobs, start a supervised
 * re-paint pass when the universe queue is dirty and no run is
 * live). Every fire lands as a production event; the row keeps the
 * last status + report so the creator can audit what ran overnight.
 */
interface ScheduleRow {
  id: string;
  name: string;
  kind: "PLAN_RUN" | "REPAINT_QUEUE" | "DAILY_DIGEST" | "PUBLISH_RUN";
  planId: string | null;
  planTitle: string | null;
  publishEpisode: number | null;
  publishPlatform: string | null;
  cadence: string;
  cadenceLabel: string;
  maxSteps: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastStatus: "OK" | "SKIPPED" | "ERROR" | null;
  lastReport: string | null;
  runCount: number;
  createdAt: string;
}

interface ScheduleHealthRowUi {
  scheduleId: string;
  name: string;
  enabled: boolean;
  overdue: boolean;
  lastStatus: "OK" | "SKIPPED" | "ERROR" | null;
  window: { ok: number; skipped: number; error: number; fires: number };
  errorStreak: number;
  okRate: number | null;
  headline: string;
}

interface ScheduleDigest {
  rows: ScheduleHealthRowUi[];
  armed: number;
  overdue: number;
  erroring: number;
  windowDays: number;
  window: { ok: number; skipped: number; error: number; fires: number };
  headline: string;
}

const SCHED_STATUS_COLORS: Record<string, string> = {
  OK: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  SKIPPED: "border-amber-400/30 text-amber-300 bg-amber-400/10",
  ERROR: "border-rose-400/30 text-rose-300 bg-rose-400/10",
};

function nextRunLabel(iso: string | null): string {
  if (!iso) return "unscheduled";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "due";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function SchedulerPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"PLAN_RUN" | "REPAINT_QUEUE" | "DAILY_DIGEST" | "PUBLISH_RUN">("PLAN_RUN");
  const [cadence, setCadence] = useState("DAILY");
  const [hourUtc, setHourUtc] = useState(2);
  const [planId, setPlanId] = useState("");
  const [maxSteps, setMaxSteps] = useState(3);
  const [publishEpisode, setPublishEpisode] = useState(1);
  const [publishPlatform, setPublishPlatform] = useState("YOUTUBE");

  const schedulesQ = useQuery({
    queryKey: ["studioSchedules", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/schedules?projectId=${projectId}`);
      const body = (await res.json()) as { schedules?: ScheduleRow[]; digest?: ScheduleDigest };
      return { schedules: body.schedules ?? [], digest: body.digest ?? null };
    },
    enabled: Boolean(projectId),
    refetchInterval: (q) => ((q.state.data?.schedules ?? []).some((s) => s.enabled) ? 8000 : false),
  });
  const plansQ = useQuery({
    queryKey: ["dshPlans", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/dsh-plans?projectId=${projectId}`);
      const body = (await res.json()) as { plans?: Array<{ id: string; title: string; status: string }> };
      return body.plans ?? [];
    },
    enabled: Boolean(projectId) && open,
  });
  const schedules = schedulesQ.data?.schedules ?? [];
  const digest = schedulesQ.data?.digest ?? null;
  const activePlans = (plansQ.data ?? []).filter((p) => p.status === "ACTIVE");

  async function act(scheduleId: string, action: string) {
    setBusyId(scheduleId);
    setError(null);
    try {
      if (action === "delete") {
        const res = await fetch(`/api/schedules?id=${scheduleId}`, { method: "DELETE" });
        if (!res.ok) setError("Delete failed");
      } else {
        const res = await fetch("/api/schedules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduleId, action }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) setError(body.error ?? "Schedule action failed");
      }
    } catch {
      setError("Schedule action failed");
    } finally {
      setBusyId(null);
      await qc.invalidateQueries({ queryKey: ["studioSchedules", projectId] });
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name.trim() || (kind === "PLAN_RUN" ? "Nightly plan run" : kind === "DAILY_DIGEST" ? "Daily digest" : kind === "PUBLISH_RUN" ? `Publish staging EP${publishEpisode}` : "Render-queue watch"),
          kind,
          cadence,
          hourUtc,
          intervalHours: 1,
          maxSteps,
          planId: kind === "PLAN_RUN" && planId ? planId : null,
          publishEpisode: kind === "PUBLISH_RUN" ? publishEpisode : null,
          publishPlatform: kind === "PUBLISH_RUN" ? publishPlatform : null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setError(body.error ?? "Create failed");
      else setName("");
    } catch {
      setError("Create failed");
    } finally {
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ["studioSchedules", projectId] });
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  const onCount = schedules.filter((s) => s.enabled).length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
          <CalendarClock className="h-3.5 w-3.5" />
          Cadence scheduler
          {schedules.length > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-amber-400/30 text-amber-300 bg-amber-400/10 normal-case tracking-normal">
              {onCount} of {schedules.length} armed
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-80 overflow-y-auto studio-scroll">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            The studio keeps working between conversations: a PLAN_RUN schedule walks an approved plan a few steps per fire
            (nightly breakdowns), REPAINT_QUEUE supervises renders and starts a re-paint pass when the universe queue is dirty,
            DAILY_DIGEST posts a catch-up digest of the last 24 hours, and PUBLISH_RUN stages the delivery-spine publish
            package for an episode + platform on its cadence. Every fire lands as a production event with its outcome.
          </p>
          {digest && (
            <div className="flex flex-wrap gap-1.5 text-[9px]">
              <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-muted-foreground tabular-nums">
                {digest.armed} armed of {digest.rows.length}
              </span>
              {digest.window.fires > 0 ? (
                <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-muted-foreground tabular-nums">
                  {digest.windowDays}d: {digest.window.ok} OK / {digest.window.skipped} skipped / {digest.window.error} error
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-muted-foreground">no fires in {digest.windowDays}d</span>
              )}
              {digest.overdue > 0 && (
                <span className="px-1.5 py-0.5 rounded border border-amber-400/30 text-amber-300 bg-amber-400/10 tabular-nums">{digest.overdue} overdue</span>
              )}
              {digest.erroring > 0 && (
                <span className="px-1.5 py-0.5 rounded border border-rose-400/30 text-rose-300 bg-rose-400/10 tabular-nums">{digest.erroring} needs attention</span>
              )}
            </div>
          )}
          {digest && digest.rows.some((r) => r.errorStreak >= 2 || (r.enabled && r.lastStatus === "ERROR")) && (
            <div className="space-y-0.5">
              {digest.rows.filter((r) => r.errorStreak >= 2 || (r.enabled && r.lastStatus === "ERROR")).map((r) => (
                <p key={r.scheduleId} className="text-[9px] text-rose-300/90 truncate" title={r.headline}>
                  {r.errorStreak >= 2 ? `${r.errorStreak} errors in a row` : "last fire errored"}: {r.name}
                </p>
              ))}
            </div>
          )}
          {error && (
            <div className="text-[10px] text-rose-300 bg-rose-400/10 border border-rose-400/25 rounded-md px-2 py-1">{error}</div>
          )}
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Schedule name (e.g. Nightly Episode 2 breakdown)"
                className="flex-1 min-w-40 h-7 rounded-md border border-white/10 bg-black/30 px-2 text-[11px] outline-none focus:border-white/25"
              />
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "PLAN_RUN" | "REPAINT_QUEUE" | "DAILY_DIGEST" | "PUBLISH_RUN")}
                className="h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
              >
                <option value="PLAN_RUN">Plan run</option>
                <option value="REPAINT_QUEUE">Render-queue watch</option>
                <option value="DAILY_DIGEST">Daily digest</option>
                <option value="PUBLISH_RUN">Publish staging</option>
              </select>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
              >
                <option value="HOURLY">Hourly</option>
                <option value="DAILY">Nightly</option>
                <option value="WEEKLY">Weekly</option>
              </select>
              {cadence !== "HOURLY" && (
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  hour
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hourUtc}
                    onChange={(e) => setHourUtc(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-12 h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
                  />
                  UTC
                </label>
              )}
              {kind === "PUBLISH_RUN" && (
                <>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    EP
                    <input
                      type="number"
                      min={1}
                      value={publishEpisode}
                      onChange={(e) => setPublishEpisode(Math.max(1, Number(e.target.value) || 1))}
                      className="w-12 h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
                    />
                  </label>
                  <select
                    value={publishPlatform}
                    onChange={(e) => setPublishPlatform(e.target.value)}
                    className="h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
                  >
                    <option value="YOUTUBE">YouTube</option>
                    <option value="BILIBILI">Bilibili</option>
                    <option value="DOUYIN">Douyin</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="STUDIO_INGEST">Studio ingest</option>
                  </select>
                </>
              )}
              {kind === "PLAN_RUN" && (
                <>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none max-w-45"
                  >
                    <option value="">Latest ACTIVE plan</option>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                  <select
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(Math.min(3, Math.max(1, Number(e.target.value) || 1)))}
                    className="h-7 rounded-md border border-white/10 bg-black/30 px-1.5 text-[11px] outline-none"
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>{n} step{n === 1 ? "" : "s"}/fire</option>
                    ))}
                  </select>
                </>
              )}
              <button
                onClick={() => void create()}
                disabled={creating}
                className="h-7 rounded-md border border-amber-400/25 bg-amber-400/10 px-2.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                Schedule
              </button>
            </div>
          </div>
          {schedules.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">No schedules registered yet - the studio only works when you are in the room.</p>
          )}
          {schedules.map((s) => (
            <div key={s.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold", s.enabled ? "border-emerald-400/30 text-emerald-300 bg-emerald-400/10" : "border-white/20 text-muted-foreground bg-white/5")}>
                  {s.enabled ? "ON" : "OFF"}
                </span>
                <span className="text-[12px] font-medium">{s.name}</span>
                <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold", s.kind === "PLAN_RUN" ? "border-teal-400/30 text-teal-300 bg-teal-400/10" : s.kind === "DAILY_DIGEST" ? "border-sky-400/30 text-sky-300 bg-sky-400/10" : s.kind === "PUBLISH_RUN" ? "border-fuchsia-400/30 text-fuchsia-300 bg-fuchsia-400/10" : "border-amber-400/30 text-amber-300 bg-amber-400/10")}>
                  {s.kind === "PLAN_RUN" ? "PLAN RUN" : s.kind === "DAILY_DIGEST" ? "DAILY DIGEST" : s.kind === "PUBLISH_RUN" ? "PUBLISH RUN" : "RENDER WATCH"}
                </span>
                {s.kind === "PUBLISH_RUN" && s.publishEpisode != null && (
                  <span className="text-[9px] text-fuchsia-300/90 font-mono">EP{String(s.publishEpisode).padStart(2, "0")} -&gt; {s.publishPlatform}</span>
                )}
                {s.lastStatus && (
                  <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-semibold", SCHED_STATUS_COLORS[s.lastStatus])}>
                    last {s.lastStatus}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground">{s.cadenceLabel}{s.kind === "PLAN_RUN" ? ` · ${s.maxSteps} step${s.maxSteps === 1 ? "" : "s"}/fire` : ""}</span>
                <span className="flex-1" />
                <span className="text-[9px] text-muted-foreground font-mono">{s.runCount} fire{s.runCount === 1 ? "" : "s"}</span>
                <button onClick={() => void act(s.id, "run")} disabled={busyId === s.id || !s.enabled} className="h-6 rounded-md border border-teal-400/25 bg-teal-400/10 px-2 text-[10px] font-semibold text-teal-200 hover:bg-teal-400/20 transition-colors disabled:opacity-40 flex items-center gap-1">
                  {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}Run now
                </button>
                <button onClick={() => void act(s.id, s.enabled ? "disable" : "enable")} disabled={busyId === s.id} className="h-6 rounded-md border border-white/15 bg-white/5 px-2 text-[10px] text-muted-foreground hover:bg-white/10 transition-colors disabled:opacity-40">
                  {s.enabled ? "Disarm" : "Arm"}
                </button>
                <button onClick={() => void act(s.id, "delete")} disabled={busyId === s.id} className="h-6 rounded-md border border-rose-400/25 bg-rose-400/10 px-2 text-[10px] text-rose-200 hover:bg-rose-400/20 transition-colors disabled:opacity-40">
                  Delete
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                <span>{s.kind === "PLAN_RUN" ? (s.planTitle ? `plan: ${s.planTitle}` : "latest ACTIVE plan") : s.kind === "DAILY_DIGEST" ? "posts the 24h digest to the creator" : "universe queue + render jobs"}</span>
                <span>·</span>
                <span className="font-mono">next fire {nextRunLabel(s.nextRunAt)}</span>
              </div>
              {s.lastReport && (
                <p className="text-[10px] leading-relaxed text-muted-foreground/85 truncate" title={s.lastReport}>{s.lastReport}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * STUDIO DIGEST: the studio writes to the creator. The latest posted
 * digests (a DAILY_DIGEST schedule posts them on its cadence; Post
 * now lands one immediately) with the full section lines, plus an
 * arm shortcut when no digest cadence exists yet.
 */
interface DigestRowUi {
  id: string;
  headline: string;
  text: string;
  windowHours: number;
  events: number;
  createdAt: string;
  deliveries: Array<{ kind: string; target: string; ok: boolean; detail: string }>;
}

function DigestPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [arming, setArming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hookInput, setHookInput] = useState("");
  const [mailInput, setMailInput] = useState("");
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliveryMsg, setDeliveryMsg] = useState<string | null>(null);

  const digestsQ = useQuery({
    queryKey: ["studioDigests", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/digest?projectId=${projectId}`);
      const body = (await res.json()) as { digests?: DigestRowUi[] };
      return body.digests ?? [];
    },
    enabled: Boolean(projectId),
    refetchInterval: (q) => ((q.state.data ?? []).length === 0 ? false : 30000),
  });
  const schedulesQ = useQuery({
    queryKey: ["studioDigestArmed", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/schedules?projectId=${projectId}`);
      const body = (await res.json()) as { schedules?: Array<{ id: string; kind: string; enabled: boolean; webhookUrl: string | null; digestEmail: string | null }> };
      return body.schedules ?? [];
    },
    enabled: Boolean(projectId), // the collapsed header chip reads this too
  });
  const digests = digestsQ.data ?? [];
  const digestSchedule = (schedulesQ.data ?? []).find((s) => s.kind === "DAILY_DIGEST" && s.enabled) ?? null;
  const digestArmed = Boolean(digestSchedule);

  async function post() {
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setError(body.error ?? "Post failed");
    } catch {
      setError("Post failed");
    } finally {
      setPosting(false);
      await qc.invalidateQueries({ queryKey: ["studioDigests", projectId] });
    }
  }

  async function arm() {
    setArming(true);
    setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: "Daily digest", kind: "DAILY_DIGEST", cadence: "DAILY", hourUtc: 2 }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setError(body.error ?? "Arm failed");
    } catch {
      setError("Arm failed");
    } finally {
      setArming(false);
      await qc.invalidateQueries({ queryKey: ["studioDigests", projectId] });
      await qc.invalidateQueries({ queryKey: ["studioDigestArmed", projectId] });
      await qc.invalidateQueries({ queryKey: ["studioSchedules", projectId] });
    }
  }

  // Delivery beyond the studio: the digest POSTs itself to a webhook
  // and/or mails itself via SMTP (when ANIMEOS_SMTP_URL is set).
  async function saveDelivery() {
    if (!digestSchedule) return;
    setSavingDelivery(true);
    setDeliveryMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: digestSchedule.id, action: "set_delivery", webhookUrl: hookInput, digestEmail: mailInput }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Saving delivery failed");
      } else {
        setDeliveryMsg("Delivery targets saved - the next digest POSTs to the webhook and/or mails the address (email needs ANIMEOS_SMTP_URL).");
      }
    } catch {
      setError("Saving delivery failed");
    } finally {
      setSavingDelivery(false);
      await qc.invalidateQueries({ queryKey: ["studioDigestArmed", projectId] });
      await qc.invalidateQueries({ queryKey: ["studioSchedules", projectId] });
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">
          <Mail className="h-3.5 w-3.5" />
          Studio digest
          {digests.length > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-sky-400/30 text-sky-300 bg-sky-400/10 normal-case tracking-normal">
              latest {digests[0].windowHours}h · {digests[0].events} event(s)
            </span>
          )}
          {!digestArmed && (
            <span className="px-1.5 py-0.5 rounded border border-amber-400/30 text-amber-300 bg-amber-400/10 normal-case tracking-normal">no digest cadence</span>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-80 overflow-y-auto studio-scroll">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            The studio writes to you: a digest aggregates a window of activity (renders queued, plan steps executed, schedule
            fires, canon and identity-drift headlines, queue pressure) into one readable message. Arm the nightly cadence below,
            or post one right now.
          </p>
          {error && (
            <div className="text-[10px] text-rose-300 bg-rose-400/10 border border-rose-400/25 rounded-md px-2 py-1">{error}</div>
          )}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => void post()}
              disabled={posting}
              className="h-7 rounded-md border border-sky-400/25 bg-sky-400/10 px-2.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              Post digest now
            </button>
            {!digestArmed && (
              <button
                onClick={() => void arm()}
                disabled={arming}
                className="h-7 rounded-md border border-amber-400/25 bg-amber-400/10 px-2.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {arming ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarClock className="h-3 w-3" />}
                Arm nightly digest
              </button>
            )}
          </div>

          {digestSchedule && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300/90">Delivery beyond the studio</div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                The nightly digest can POST itself to a webhook (Slack/Discord gateways, automation) and mail itself via SMTP
                (set <span className="font-mono">ANIMEOS_SMTP_URL</span> to enable email). Every outcome is recorded on the digest.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  value={hookInput}
                  onChange={(e) => setHookInput(e.target.value)}
                  placeholder="https://hooks.example.com/animeos (webhook URL)"
                  className="flex-1 min-w-45 h-7 rounded-md border border-white/10 bg-black/30 px-2 text-[10px] font-mono outline-none focus:border-white/25"
                />
                <input
                  value={mailInput}
                  onChange={(e) => setMailInput(e.target.value)}
                  placeholder="creator@example.com (email)"
                  className="flex-1 min-w-40 h-7 rounded-md border border-white/10 bg-black/30 px-2 text-[10px] outline-none focus:border-white/25"
                />
                <button
                  onClick={() => void saveDelivery()}
                  disabled={savingDelivery}
                  className="h-7 rounded-md border border-sky-400/25 bg-sky-400/10 px-2.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  {savingDelivery ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Save delivery
                </button>
              </div>
              {(digestSchedule.webhookUrl || digestSchedule.digestEmail) && (
                <p className="text-[9px] text-muted-foreground font-mono truncate">
                  armed targets: {digestSchedule.webhookUrl ? "webhook" : ""}{digestSchedule.webhookUrl && digestSchedule.digestEmail ? " + " : ""}{digestSchedule.digestEmail ? "email" : ""}
                </p>
              )}
              {deliveryMsg && <p className="text-[10px] text-emerald-300">{deliveryMsg}</p>}
            </div>
          )}
          {digests.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">No digests posted yet - press Post digest now, or arm the nightly cadence.</p>
          ) : (
            digests.map((d, i) => {
              const lines = d.text.split("\n");
              const isOpen = expanded === d.id;
              return (
                <div key={d.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-1.5">
                  <button onClick={() => setExpanded(isOpen ? null : d.id)} className="w-full text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      {i === 0 && (
                        <span className="px-1.5 py-0.5 rounded border border-sky-400/30 text-sky-300 bg-sky-400/10 text-[9px] font-semibold">LATEST</span>
                      )}
                      <span className="text-[11px] font-medium">{d.headline}</span>
                      <span className="flex-1" />
                      <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                        {d.createdAt.slice(5, 16).replace("T", " ")}Z
                      </span>
                    </div>
                  </button>
                  {(isOpen ? lines : lines.slice(0, 3)).map((line, j) => (
                    <p key={j} className="text-[10px] text-muted-foreground/90 leading-relaxed">{line}</p>
                  ))}
                  {d.deliveries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.deliveries.map((del, j) => (
                        <span
                          key={j}
                          title={del.detail}
                          className={cn(
                            "px-1.5 py-0.5 rounded border text-[9px] tabular-nums",
                            del.ok ? "border-emerald-400/30 text-emerald-300 bg-emerald-400/10" : "border-rose-400/30 text-rose-300 bg-rose-400/10"
                          )}
                        >
                          {del.kind} {del.ok ? "OK" : "FAILED"} - {del.target}
                        </span>
                      ))}
                    </div>
                  )}
                  {lines.length > 3 && (
                    <button onClick={() => setExpanded(isOpen ? null : d.id)} className="text-[9px] text-sky-300/80 hover:text-sky-200">
                      {isOpen ? "show less" : `+${lines.length - 3} more section(s)`}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Same-turn ENSEMBLE audition block: an ensemble apply renders ONE
 * proposed read per engaged speaker (A/B against the stored take when
 * one exists) and attaches it to the trace, so the creator hears the
 * whole beat right where the arc landed. The sequence player walks the
 * proposed reads in speaker order; any stop/new play/close cancels it.
 */
function EnsembleAuditionBlock({ preview }: { preview: EnsembleAuditionPreview }) {
  const seqRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(
    () => () => {
      seqRef.current += 1;
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  function stop() {
    seqRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }

  async function playSequence() {
    stop();
    const token = seqRef.current;
    setPlaying(true);
    for (const row of preview.speakers) {
      if (seqRef.current !== token) return;
      await new Promise<void>((resolve) => {
        const audio = new Audio(row.url);
        audioRef.current = audio;
        const done = () => resolve();
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = done; // stop() pauses: resolve instead of hanging
        void audio.play().catch(done);
      });
    }
    if (seqRef.current === token) setPlaying(false);
  }

  return (
    <div className="rounded-md border border-teal-400/25 bg-teal-400/[0.06] p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-teal-300">
          <Volume2 className="h-3 w-3" />
          Ensemble audition - {preview.speakers.length} speaker{preview.speakers.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={playing ? stop : () => void playSequence()}
          disabled={preview.speakers.length === 0}
          title={playing
            ? "Stop the sequence"
            : `Play every speaker's proposed read in order (${preview.speakers.length} row${preview.speakers.length === 1 ? "" : "s"})`}
          className={cn(
            "ml-auto h-6 rounded-md border px-2 text-[9px] font-bold flex items-center gap-1 transition-colors",
            preview.speakers.length === 0
              ? "border-white/8 text-muted-foreground/40"
              : "border-teal-400/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20",
          )}
        >
          {playing ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
          {playing ? "stop" : "play sequence"}
        </button>
      </div>
      {preview.speakers.map((row, i) => (
        <div key={i} className="space-y-1 rounded border border-white/8 bg-black/25 p-1.5">
          <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.14em] text-teal-200/90">
            <span className="truncate normal-case tracking-normal font-semibold">{row.characterName}</span>
            <span className="font-mono tracking-normal normal-case shrink-0">
              &quot;{row.stateLabel}&quot;
              {row.speed !== 1 && ` · x${row.speed} pace`}
              {row.pitch !== 1 && ` · pitch x${row.pitch}`}
              {row.durationMs ? ` · ${(row.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
          </div>
          {row.current && (
            <div className="space-y-0.5">
              <div className="text-[9px] uppercase tracking-[0.14em] text-slate-300/70">current take</div>
              <audio controls preload="none" src={row.current.url} className="w-full h-8 opacity-90" />
            </div>
          )}
          <div className="space-y-0.5">
            <div className="text-[9px] uppercase tracking-[0.14em] text-teal-300/90">{row.current ? "proposed" : "audition"}</div>
            <audio controls preload="none" src={row.url} className="w-full h-8" />
          </div>
          <div className="text-[10px] leading-relaxed text-muted-foreground">
            {row.current && <span className="text-amber-300/90">A/B: current first, then proposed. </span>}
            <span className="italic">&quot;{row.text}&quot;</span>
            {` · ${row.source}`}
          </div>
        </div>
      ))}
      {preview.skipped.length > 0 && (
        <div className="text-[10px] leading-relaxed text-muted-foreground">Skipped: {preview.skipped.join(" ")}</div>
      )}
    </div>
  );
}

/**
 * PLAYABLE ARC CHIP inside the DSH reply: an arc tool lands a span
 * (or an ensemble beat) and the trace carries a chip that plays the
 * arc's STORED takes in story order - the same buildArcTakes /
 * mergeArcTakes chain the ruler bars use, now fed by the episode's
 * arc-playback feed, fetched right here when the block mounts.
 * One token-guarded sequential player; stop/new play/unmount cancels.
 */
function ArcPlaybackBlock({ chip }: { chip: ArcPlaybackChip }) {
  const feedQ = useQuery({
    queryKey: ["arc-playback", chip.episodeId],
    queryFn: () => api.arcPlayback(chip.episodeId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const seqRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const takes: ArcTakeItem[] = useMemo(() => {
    const feed = feedQ.data;
    if (!feed) return [];
    const shots: ArcPlaybackShot[] = feed.shots.map((s) => ({
      id: s.id,
      sceneNumber: s.sceneNumber,
      number: s.number,
      dialogue: s.dialogue,
      audioCues: s.audioCues,
    }));
    if (chip.ensemble) return mergeArcTakes(chip.spans, shots);
    return chip.spans.length > 0 ? buildArcTakes(chip.spans[0], shots) : [];
  }, [feedQ.data, chip]);

  useEffect(
    () => () => {
      seqRef.current += 1;
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  function stop() {
    seqRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }

  async function playSequence() {
    stop();
    const token = seqRef.current;
    setPlaying(true);
    for (const t of takes) {
      if (seqRef.current !== token) return;
      await new Promise<void>((resolve) => {
        const audio = new Audio(t.url);
        audioRef.current = audio;
        const done = () => resolve();
        audio.onended = done;
        audio.onerror = done;
        audio.onpause = done; // stop() pauses: resolve instead of hanging
        void audio.play().catch(done);
      });
    }
    if (seqRef.current === token) setPlaying(false);
  }

  const takeCount = takes.length;
  return (
    <div className="rounded-md border border-violet-400/25 bg-violet-400/[0.06] p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-300">
          <Route className="h-3 w-3" />
          Playable arc - {chip.label} · Ep{chip.episodeNumber}
        </span>
        <button
          onClick={playing ? stop : () => void playSequence()}
          disabled={takeCount === 0 || feedQ.isLoading}
          title={playing
            ? "Stop the arc playback"
            : takeCount === 0
              ? "No rendered takes in this arc span yet"
              : `Play this arc's ${takeCount} stored take${takeCount === 1 ? "" : "s"} in story order`}
          className={cn(
            "ml-auto h-6 rounded-md border px-2 text-[9px] font-bold flex items-center gap-1 transition-colors",
            takeCount === 0 && !feedQ.isLoading
              ? "border-white/8 text-muted-foreground/40"
              : "border-cyan-300/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20",
          )}
        >
          {playing ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
          {playing ? "stop" : `play arc${takeCount > 0 ? ` · ${takeCount}` : ""}`}
        </button>
      </div>
      <div className="text-[10px] leading-relaxed text-muted-foreground">
        {feedQ.isLoading
          ? "Loading the arc's stored takes..."
          : feedQ.isError
            ? "The arc playback feed failed to load."
            : takeCount === 0
              ? "No rendered takes in this span yet - play the chip again after the re-render lands."
              : chip.ensemble
                ? `${takeCount} stored take${takeCount === 1 ? "" : "s"} of the whole beat, merged in story order - the takes as they stand BEFORE the re-render.`
                : `${takeCount} stored take${takeCount === 1 ? "" : "s"} in story order - the takes as they stand BEFORE the re-render.`}
      </div>
      {takeCount > 0 && !feedQ.isLoading && (
        <div className="space-y-0.5 max-h-28 overflow-y-auto studio-scroll pr-1">
          {takes.map((t, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-white/8 bg-black/25 px-1.5 py-0.5 text-[10px]">
              <span className="shrink-0 font-mono text-muted-foreground">
                Sc{String(t.sceneNumber).padStart(2, "0")} · S{String(t.shotNumber).padStart(3, "0")}
              </span>
              <span className="shrink-0 font-semibold text-violet-200/90">{t.speaker}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">&quot;{t.text}&quot;</span>
              {t.durationMs != null && <span className="shrink-0 font-mono text-muted-foreground/70">{(t.durationMs / 1000).toFixed(1)}s</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TraceBlock({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(true);
  if (!steps.length) return null;
  return (
    <div className="mt-2 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-violet-200/90 hover:bg-violet-400/5"
      >
        <Brain className="h-3.5 w-3.5" />
        DSH execution trace - {steps.length} round{steps.length > 1 ? "s" : ""},{" "}
        {steps.reduce((n, s) => n + s.actions.length, 0)} tool call{steps.reduce((n, s) => n + s.actions.length, 0) > 1 ? "s" : ""}
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {steps.map((step) => (
            <div key={step.step} className="border-l-2 border-violet-400/30 pl-3 space-y-2">
              <div className="text-[11px] leading-relaxed text-violet-100/80">
                <span className="font-semibold text-violet-300">Thought · </span>
                {step.thought || "-"}
              </div>
              {step.plan.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5 font-medium text-foreground/70 mb-1">
                    <ListChecks className="h-3 w-3" /> Plan
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 ml-1">
                    {step.plan.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                </div>
              )}
              {step.actions.map((a, i) => (
                <div key={i} className="rounded-md bg-black/30 border border-white/8 p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    {a.status === "OK" ? (
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <CircleX className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    )}
                    <Wrench className="h-3 w-3 text-muted-foreground" />
                    <span className="text-primary font-semibold">{a.tool}</span>
                  </div>
                  {Object.keys(a.args).length > 0 && (
                    <pre className="text-[10px] text-muted-foreground overflow-x-auto studio-scroll whitespace-pre-wrap break-words">
                      {JSON.stringify(a.args, null, 1)}
                    </pre>
                  )}
                  <div className="text-[11px] text-foreground/70 whitespace-pre-wrap leading-relaxed">{a.result}</div>
                  {/* same-turn audition proposal: a variant bind renders a preview of the new performance,
                      paired with the current stored take of the same line when one exists (A/B);
                      an ensemble apply renders ONE row per engaged speaker plus a sequence player */}
                  {a.audition && (
                    <div className="rounded-md border border-emerald-400/25 bg-emerald-400/[0.06] p-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                        <Volume2 className="h-3 w-3" />
                        Audition - {a.audition.characterName} &quot;{a.audition.stateLabel}&quot;
                      </div>
                      {a.audition.current && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-slate-300/70">
                            <span>current take</span>
                            <span className="font-mono tracking-normal normal-case">
                              {a.audition.current.voiceId ?? "unknown voice"}
                              {a.audition.current.durationMs ? ` · ${(a.audition.current.durationMs / 1000).toFixed(1)}s` : ""}
                              {a.audition.current.stateLabel ? ` · ${a.audition.current.stateLabel}` : ""}
                            </span>
                          </div>
                          <audio controls preload="none" src={a.audition.current.url} className="w-full h-8 opacity-90" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-emerald-300/90">
                          <span>{a.audition.current ? "proposed" : "audition"}</span>
                          <span className="font-mono tracking-normal normal-case">
                            {a.audition.voiceId}
                            {a.audition.speed !== 1 && ` · x${a.audition.speed} pace`}
                            {a.audition.pitch !== 1 && ` · pitch x${a.audition.pitch}`}
                            {a.audition.durationMs ? ` · ${(a.audition.durationMs / 1000).toFixed(1)}s` : ""}
                          </span>
                        </div>
                        <audio controls preload="none" src={a.audition.url} className="w-full h-8" />
                      </div>
                      <div className="text-[10px] leading-relaxed text-muted-foreground">
                        {a.audition.current && <span className="text-amber-300/90">A/B: current first, then proposed. </span>}
                        <span className="italic">&quot;{a.audition.text}&quot;</span>
                        {` · ${a.audition.source}`}
                      </div>
                    </div>
                  )}
                  {a.ensembleAudition && <EnsembleAuditionBlock preview={a.ensembleAudition} />}
                  {a.arcPlayback && <ArcPlaybackBlock chip={a.arcPlayback} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DshConsole() {
  const { projectId, setProject } = useStudio();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<DshMessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQ = useQuery({
    queryKey: ["dsh", projectId],
    queryFn: () => api.dshMessages(projectId!),
    enabled: Boolean(projectId),
  });

  const messages = [...(messagesQ.data ?? []), ...local];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || busy || !projectId) return;
    setInput("");
    setBusy(true);
    setError(null);
    const optimistic: DshMessageRow = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: msg,
      trace: null,
      createdAt: new Date().toISOString(),
    };
    setLocal((prev) => [...prev, optimistic]);
    try {
      const result = await api.dshTurn(projectId, msg);
      setLocal((prev) => [
        ...prev,
        {
          id: `local-dsh-${Date.now()}`,
          role: "dsh",
          content: result.reply,
          trace: JSON.stringify(result.trace),
          createdAt: new Date().toISOString(),
        },
      ]);
      // DSH may have created/switched to another production mid-turn
      if (result.activeProjectId && result.activeProjectId !== projectId) {
        setProject(result.activeProjectId);
      }
      const target = result.activeProjectId ?? projectId;
      // Production state may have changed massively (and DSH may have
      // landed a cross-turn plan for the work that did not fit)
      qc.invalidateQueries({ queryKey: ["project", target] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["renderJobs", target] });
      qc.invalidateQueries({ queryKey: ["dshPlans", target] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "DSH could not complete the turn");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-4.5 w-4.5 text-primary" />
          DSH - AI Director
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Speak in natural language. DSH plans, calls production tools, observes results, and reports back - every decision is traceable.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto studio-scroll space-y-4 pr-1">
        {projectId && <PlansPanel projectId={projectId} />}
        {projectId && <DigestPanel projectId={projectId} />}
        {projectId && <SchedulerPanel projectId={projectId} />}

        {messages.length === 0 && !busy && (
          <div className="studio-panel p-5">
            <p className="text-sm font-medium mb-1">The set is quiet, director.</p>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Describe what should happen - DSH understands the production state: characters, continuity, environments, scenes and shots.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-[11px] leading-relaxed rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-colors p-3"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "dsh" && (
              <div className="h-7 w-7 shrink-0 rounded-lg bg-violet-400/15 border border-violet-400/30 flex items-center justify-center mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              </div>
            )}
            <div className={cn("max-w-[85%] md:max-w-[75%]", m.role === "user" && "order-first")}>
              <div
                className={cn(
                  "rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary/15 border border-primary/25 text-foreground"
                    : "studio-panel"
                )}
              >
                {m.content}
              </div>
              {m.role === "dsh" && <TraceBlock steps={parseTrace(m.trace)} />}
            </div>
            {m.role === "user" && (
              <div className="h-7 w-7 shrink-0 rounded-lg bg-white/8 border border-white/15 flex items-center justify-center mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex gap-3 items-center text-muted-foreground">
            <div className="h-7 w-7 rounded-lg bg-violet-400/15 border border-violet-400/30 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-violet-300 dsh-pulse" />
            </div>
            <span className="text-xs flex items-center gap-2">
              DSH is directing - planning, calling tools, observing results
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          </div>
        )}
        {error && (
          <div className="text-xs text-rose-300 bg-rose-400/10 border border-rose-400/25 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Direct the production…  (e.g. 'Continue Episode 7 - create the confrontation scene and break it into shots')"
          className="min-h-[52px] max-h-40 bg-white/[0.04] border-white/12 text-[13px] resize-none"
          disabled={busy}
        />
        <Button size="icon" className="h-[52px] w-[52px] shrink-0" onClick={() => send()} disabled={busy || !input.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
