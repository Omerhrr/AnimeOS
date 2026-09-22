"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Loader2 } from "lucide-react";
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
  CUSTOM: "border-white/20 text-muted-foreground bg-white/5",
};

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
