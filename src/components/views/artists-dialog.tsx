"use client";

// Artist roster - studio team management for multi-artist shot
// assignment, plus per-artist voice casting: each artist carries a
// TTS voice and can be cast as the speaking voice of characters.
// Deleting an artist unassigns their shots and clears their voice
// castings (FK is SetNull).

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AudioLines, Loader2, Plus, Trash2, Users } from "lucide-react";
import { api, type StudioProject } from "@/lib/api-client";
import { VOICES, voiceById } from "@/lib/comic/voice-catalog";
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

  async function setArtistVoice(id: string, voiceId: string) {
    try {
      await api.patchArtist(id, { voiceId: voiceId || null });
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set voice");
    }
  }

  async function castVoice(characterId: string, artistId: string) {
    try {
      await api.patchCharacter(characterId, { voiceArtistId: artistId || null });
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cast voice");
    }
  }

  const canCreate = name.trim().length > 0;
  const artistById = new Map(project.artists.map((a) => [a.id, a]));
  const castCount = project.characters.filter((c) => c.voiceArtist).length;

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
        <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-lg max-h-[85vh] overflow-y-auto studio-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Artist roster
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Who owns which panel, and who speaks for whom. Assign panels from the inspector, balance via the Workload view, or let DSH staff whole scenes with <span className="font-mono text-[10px]">auto_assign_scene_team</span>. Voice takes render with the cast artist&apos;s voice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-56 overflow-y-auto studio-scroll pr-1">
            {project.artists.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Roster is empty - every panel sits in the unassigned pool.</p>
            )}
            {project.artists.map((a) => (
              <div key={a.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
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
                      title="Remove from roster (their panels return to the pool, voice castings clear)"
                      className="h-7 w-7 flex items-center justify-center rounded-md border border-white/10 text-muted-foreground hover:text-rose-300 hover:border-rose-400/40 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 pl-6">
                  <AudioLines className="h-3 w-3 shrink-0 text-cyan-300/80" />
                  <select
                    value={a.voiceId ?? ""}
                    onChange={(e) => void setArtistVoice(a.id, e.target.value)}
                    className="h-6 flex-1 rounded border border-white/10 bg-black/30 px-1.5 text-[10px] text-foreground"
                    title="The TTS voice this artist performs with"
                  >
                    <option value="" className="bg-[#12121a]">no voice assigned</option>
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#12121a]">{v.id} · {v.blurb}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* per-artist voice casting: characters -> roster voices */}
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-200 flex items-center gap-1.5">
                <AudioLines className="h-3 w-3" /> Voice casting
              </div>
              <span className="text-[9px] font-mono text-cyan-300/80">{castCount}/{project.characters.length} cast</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Bind a character to the roster artist who speaks for them. Their VOICE cues render with that artist&apos;s voice; DSH can also cast via <span className="font-mono text-[9px]">cast_voice_actor</span>.
            </p>
            {project.characters.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No characters yet - cast voices once the cast exists.</p>
            )}
            <div className="space-y-1.5 max-h-40 overflow-y-auto studio-scroll pr-1">
              {project.characters.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="w-28 shrink-0 min-w-0">
                    <div className="text-[11px] text-foreground truncate">{c.name}</div>
                    {c.role && <div className="text-[9px] text-muted-foreground truncate">{c.role.toLowerCase()}</div>}
                  </div>
                  <select
                    value={c.voiceArtist?.id ?? ""}
                    onChange={(e) => void castVoice(c.id, e.target.value)}
                    className="h-7 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-[10px] text-foreground"
                  >
                    <option value="" className="bg-[#12121a]">uncast · default voice</option>
                    {project.artists.map((a) => (
                      <option key={a.id} value={a.id} className="bg-[#12121a]">
                        {a.name} · {a.voiceId ? `${a.voiceId} (${voiceById(a.voiceId).blurb})` : "no voice set"}
                      </option>
                    ))}
                  </select>
                  {c.voiceArtist && artistById.get(c.voiceArtist.id) && (
                    <span className="text-[9px] font-mono text-cyan-300/80 shrink-0">
                      {c.voiceArtist.voiceId ? "cast" : "voice missing"}
                    </span>
                  )}
                </div>
              ))}
            </div>
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
