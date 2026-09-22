"use client";

// Style LoRA Studio — the production's adapter registry. Registered
// trigger phrases + default weights are what the per-shot inspector
// and DSH's set_shot_lora tool attach to individual shots.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";
import { api, type StudioProject } from "@/lib/api-client";
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

  useEffect(() => {
    if (open) { setError(null); }
  }, [open]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project", project.id] });

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
              Adapters for &ldquo;{project.title}&rdquo;. Attach one to any panel (inspector button) — its trigger tokens are injected into that shot&apos;s art prompt at the chosen strength. DSH can attach them too via <span className="font-mono text-[10px]">set_shot_lora</span>.
            </DialogDescription>
          </DialogHeader>

          {/* registry list */}
          <div className="space-y-2 max-h-64 overflow-y-auto studio-scroll pr-1">
            {project.loras.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No adapters registered yet — add one below.</p>
            )}
            {project.loras.map((l) => (
              <div key={l.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{l.name}</span>
                      {l.baseModel && <span className="px-1 rounded-sm bg-white/10 text-[8px] font-mono tracking-widest text-muted-foreground">{l.baseModel}</span>}
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
                      onClick={() => void remove(l.id)}
                      title="Delete adapter (shots fall back to production style)"
                      className="h-7 w-7 flex items-center justify-center rounded-md border border-white/10 text-muted-foreground hover:text-rose-300 hover:border-rose-400/40 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
