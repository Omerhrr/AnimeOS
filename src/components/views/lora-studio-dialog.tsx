"use client";

// Style LoRA Studio: the production's adapter registry. Registered
// trigger phrases + default weights are what the per-shot inspector
// and DSH's set_shot_lora tool attach to individual shots. Each
// adapter can also be fine-tuned with a simulated training run that
// distills the production's approved panels (loss curve, steps and
// milestones included).

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { api, type LoraTrainRunRow, type StudioProject } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function LoraStudioDialog({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [baseModel, setBaseModel] = useState("");
  const [notes, setNotes] = useState("");
  const [weight, setWeight] = useState(0.8);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<LoraTrainRunRow[]>([]);
  const [training, setTraining] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setError(null); }
  }, [open]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project", project.id] });

  // dataset census: approved panels with generated art, production-wide
  const dataset = useMemo(() => {
    let approved = 0;
    for (const season of project.seasons) {
      for (const ep of season.episodes) {
        for (const scene of ep.scenes) {
          for (const shot of scene.shots) {
            if ((shot.status === "APPROVED" || shot.status === "FINAL") && shot.artworkUrl) approved++;
          }
        }
      }
    }
    return approved;
  }, [project]);

  // latest run per adapter, polled while anything is in flight
  const latestRunByLora = useMemo(() => {
    const map = new Map<string, LoraTrainRunRow>();
    for (const r of runs) {
      if (!map.has(r.loraId) || new Date(r.startedAt) > new Date(map.get(r.loraId)!.startedAt)) {
        map.set(r.loraId, r);
      }
    }
    return map;
  }, [runs]);
  const anyRunning = runs.some((r) => r.status === "RUNNING");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const poll = async () => {
      try {
        const rows = await api.loraRuns(project.id);
        if (alive) setRuns(rows);
      } catch { /* polling is best-effort */ }
    };
    void poll();
    const t = window.setInterval(() => void poll(), 1500);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [open, project.id, anyRunning]);

  async function train(id: string) {
    setTraining(id);
    setError(null);
    try {
      await api.trainLora(id);
      const rows = await api.loraRuns(project.id);
      setRuns(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start training run");
    } finally {
      setTraining(null);
    }
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      await api.createLora({ projectId: project.id, name, triggerPhrase: trigger, weight, baseModel, notes });
      setName(""); setTrigger(""); setBaseModel(""); setNotes(""); setWeight(0.8);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register LoRA");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteLora(id);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete LoRA");
    }
  }

  const canCreate = name.trim() && trigger.trim();

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
        onClick={() => setOpen(true)}
      >
        <Zap className="h-3 w-3 mr-1" /> LoRA
        {project.loras.length > 0 && (
          <span className="ml-1 rounded-sm bg-primary/20 px-1 text-[8px] font-bold tracking-widest text-primary">{project.loras.length}</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-xl max-h-[85vh] overflow-y-auto studio-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Style LoRA registry
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Adapters for &ldquo;{project.title}&rdquo;. Attach one to any panel (inspector button): its trigger tokens are injected into that shot&apos;s art prompt at the chosen strength. Fine-tune an adapter from the production&apos;s approved panels with a simulated training run.
            </DialogDescription>
          </DialogHeader>

          {/* registry list */}
          <div className="space-y-2 max-h-80 overflow-y-auto studio-scroll pr-1">
            {project.loras.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No adapters registered yet - add one below.</p>
            )}
            {project.loras.map((l) => {
              const run = latestRunByLora.get(l.id) ?? null;
              const isTraining = run?.status === "RUNNING" || l.status === "TRAINING";
              const progress = isTraining && run ? run.progress : l.trainProgress;
              return (
                <div key={l.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{l.name}</span>
                        {l.baseModel && <span className="px-1 rounded-sm bg-white/10 text-[8px] font-mono tracking-widest text-muted-foreground">{l.baseModel}</span>}
                        {isTraining ? (
                          <span className="px-1 rounded-sm bg-amber-400/15 text-[8px] font-mono tracking-widest text-amber-300">TRAINING</span>
                        ) : l.trainedPanels ? (
                          <span className="px-1 rounded-sm bg-teal-400/15 text-[8px] font-mono tracking-widest text-teal-300">TRAINED · {l.trainedPanels} PANELS</span>
                        ) : null}
                      </div>
                      <code className="block text-[9px] font-mono text-teal-200/80 truncate mt-0.5">{l.triggerPhrase}</code>
                      {l.notes && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{l.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono tabular-nums text-primary">{l.weight.toFixed(2)}</div>
                        <div className="text-[9px] text-muted-foreground">{l._count?.shots ?? 0} shot{(l._count?.shots ?? 0) === 1 ? "" : "s"}</div>
                      </div>
                      <button
                        onClick={() => void train(l.id)}
                        disabled={isTraining || training === l.id}
                        title={
                          isTraining
                            ? "Training run in flight"
                            : dataset === 0
                              ? "Needs approved panels with generated art"
                              : `Simulated fine-tune from ${dataset} approved panel${dataset === 1 ? "" : "s"}`
                        }
                        className="h-7 px-2 flex items-center gap-1 rounded-md border border-white/10 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:border-white/25 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        {training === l.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <FlaskConical className="h-3 w-3 text-amber-300" />}
                        Train
                      </button>
                      <button
                        onClick={() => void remove(l.id)}
                        title="Delete adapter (shots fall back to production style)"
                        className="h-7 w-7 flex items-center justify-center rounded-md border border-white/10 text-muted-foreground hover:text-rose-300 hover:border-rose-400/40 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* live training readout */}
                  {(isTraining || (run && run.status === "COMPLETED")) && (
                    <div className="mt-2.5 rounded-md border border-white/10 bg-black/30 px-2.5 py-2">
                      <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                        <span>
                          {isTraining
                            ? `step ${run?.step ?? 0}/${run?.totalSteps ?? 0}`
                            : `run completed · ${run?.panelCount ?? 0} panels`}
                        </span>
                        <span className={isTraining ? "text-amber-300" : "text-teal-300"}>
                          loss {run ? (run.lossCurve ? JSON.parse(run.lossCurve).slice(-1)[0]?.toFixed(3) : "...") : "..."}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-white/8 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", isTraining ? "bg-amber-400/80" : "bg-teal-400/80")}
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </div>
                      {run?.lossCurve && <LossSpark curve={JSON.parse(run.lossCurve)} training={isTraining} />}
                      {isTraining && run?.runLog && (
                        <p className="mt-1 text-[9px] text-muted-foreground truncate">
                          {JSON.parse(run.runLog).slice(-1)[0]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* create form */}
          <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <Plus className="h-3 w-3" /> Register adapter
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Adapter name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ink-wash-flashback" className="bg-white/5 border-white/10 text-xs h-8" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Base checkpoint</Label>
                <Input value={baseModel} onChange={(e) => setBaseModel(e.target.value)} placeholder="SDXL / FLUX.1 / …" className="bg-white/5 border-white/10 text-xs h-8" />
              </div>
              <div className="col-span-2 grid gap-1.5">
                <Label className="text-[10px]">Trigger phrase <span className="text-muted-foreground font-normal">(injected verbatim into the art prompt)</span></Label>
                <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="inkwash_2d, monochrome_wash, brush_stroke_edges" className="bg-white/5 border-white/10 text-xs h-8 font-mono" />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px]">Default strength</Label>
                  <span className="text-[10px] font-mono tabular-nums text-primary">{weight.toFixed(2)}</span>
                </div>
                <Slider value={[weight]} min={0.1} max={1.2} step={0.05} onValueChange={(v) => setWeight(v[0] ?? 0.8)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where to use it" className="bg-white/5 border-white/10 text-xs h-8" />
              </div>
            </div>
            {error && <p className="text-[11px] text-rose-300">{error}</p>}
          </div>

          <DialogFooter>
            <Button size="sm" className={cn("h-8", !canCreate && "opacity-50 pointer-events-none")} onClick={() => void create()} disabled={creating || !canCreate}>
              {creating && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Register LoRA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Tiny inline loss-curve sparkline for a training run. */
function LossSpark({ curve, training }: { curve: number[]; training: boolean }) {
  if (curve.length < 2) return null;
  const max = Math.max(...curve, 0.1);
  const min = Math.min(...curve, 0);
  const span = Math.max(0.001, max - min);
  const pts = curve
    .map((v, i) => `${(i / (curve.length - 1)) * 100},${28 - ((v - min) / span) * 26}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-1.5 w-full h-6">
      <polyline
        points={pts}
        fill="none"
        strokeWidth="1.5"
        className={training ? "stroke-amber-400/80" : "stroke-teal-400/80"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
