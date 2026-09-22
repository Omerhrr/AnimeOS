"use client";

// Artist roster - studio team management for multi-artist shot
// assignment. Deleting an artist unassigns their shots (pool fallback).

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { api, type StudioProject } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROSTER_COLORS = ["#e8b04b", "#5aa88f", "#b07cd8", "#d8767c", "#7c9cff", "#8fbf6a"];

export function ArtistsDialog({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState(ROSTER_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project", project.id] });

  async function create() {
    setCreating(true);
    setError(null);
    try {
      await api.createArtist({ projectId: project.id, name, role, color });
      setName(""); setRole("");
      setColor(ROSTER_COLORS[(project.artists.length + 1) % ROSTER_COLORS.length]);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add artist");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteArtist(id);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove artist");
    }
  }

  const canCreate = name.trim().length > 0;

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
        onClick={() => setOpen(true)}
      >
        <Users className="h-3 w-3 mr-1" /> Artists
        {project.artists.length > 0 && (
          <span className="ml-1 rounded-sm bg-primary/20 px-1 text-[8px] font-bold tracking-widest text-primary">{project.artists.length}</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-md max-h-[85vh] overflow-y-auto studio-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Artist roster
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Who owns which panel. Assign from the inspector button on any panel, in bulk from the board, balance via the Workload view, or let DSH staff whole scenes with <span className="font-mono text-[10px]">auto_assign_scene_team</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-56 overflow-y-auto studio-scroll pr-1">
            {project.artists.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Roster is empty - every panel sits in the unassigned pool.</p>
            )}
            {project.artists.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ background: a.color }} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{a.name}</div>
                    {a.role && <div className="text-[10px] text-muted-foreground truncate">{a.role}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{a._count?.shots ?? 0} panel{(a._count?.shots ?? 0) === 1 ? "" : "s"}</span>
                  <button
                    onClick={() => void remove(a.id)}
                    title="Remove from roster (their panels return to the pool)"
                    className="h-7 w-7 flex items-center justify-center rounded-md border border-white/10 text-muted-foreground hover:text-rose-300 hover:border-rose-400/40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <Plus className="h-3 w-3" /> Add artist
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mei Lin" className="bg-white/5 border-white/10 text-xs h-8" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Specialism</Label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backgrounds & environments" className="bg-white/5 border-white/10 text-xs h-8" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Board color</Label>
                <div className="flex gap-1.5 h-8 items-center">
                  {ROSTER_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`h-5 w-5 rounded-full border-2 transition-transform ${color === c ? "border-white scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                      aria-label={`color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {error && <p className="text-[11px] text-rose-300">{error}</p>}
          </div>

          <DialogFooter>
            <Button size="sm" className={`h-8 ${!canCreate ? "opacity-50 pointer-events-none" : ""}`} onClick={() => void create()} disabled={creating || !canCreate}>
              {creating && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Add to roster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
