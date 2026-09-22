"use client";

// Artist roster - studio team management for multi-artist shot
// assignment, plus per-artist voice casting: each artist carries a
// TTS voice and can be cast as the speaking voice of characters.
// Deleting an artist unassigns their shots and clears their voice
// castings (FK is SetNull).
//
// Casting-board auditions: any roster voice can be auditioned with a
// throwaway TTS render (a board line, or the character's own first
// dialogue line) before committing a casting - no cue or take is
// created. STATE auditions go one deeper: pick one of a character's
// development states and hear exactly how it performs - the variant
// voice when one is bound, plus the state's speed/pitch hints.

import { Fragment, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AudioLines, Loader2, Play, Plus, Square, Trash2, Users } from "lucide-react";
import { api, type StudioProject } from "@/lib/api-client";
import { VOICES, defaultVoiceFor, voiceById } from "@/lib/comic/voice-catalog";
import { DELIVERIES, type DeliveryId } from "@/lib/comic/delivery";
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
  // casting-board audition state (throwaway renders, nothing persisted)
  const [auditionDelivery, setAuditionDelivery] = useState<DeliveryId>("EXCITED");
  const [auditionLine, setAuditionLine] = useState("");
  const [auditionBusy, setAuditionBusy] = useState<string | null>(null);
  const [auditionPlaying, setAuditionPlaying] = useState<string | null>(null);
  const [auditionMsg, setAuditionMsg] = useState<string | null>(null);
  // state auditions: per-character selected development state
  const [stateSel, setStateSel] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  // stop any audition clip when the dialog closes
  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      audioRef.current = null;
      setAuditionPlaying(null);
    }
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

  function stopAudition() {
    audioRef.current?.pause();
    audioRef.current = null;
    setAuditionPlaying(null);
  }

  /** Throwaway TTS audition: renders one line with a voice and plays it; no cue or take is stored. */
  async function playAudition(key: string, voiceId: string, speaker?: string) {
    stopAudition();
    setAuditionBusy(key);
    setAuditionMsg(null);
    setError(null);
    try {
      const res = await api.auditionVoice({
        projectId: project.id,
        voiceId,
        delivery: auditionDelivery,
        text: auditionLine.trim() || undefined,
        speaker: auditionLine.trim() ? undefined : speaker,
      });
      await playClip(key, res);
      setAuditionMsg(
        `audition: ${res.voiceId} · ${res.delivery.label.toLowerCase()}${res.speaker ? ` · ${res.speaker}'s line` : ` · ${res.source}`}${res.durationMs ? ` · ${(res.durationMs / 1000).toFixed(1)}s` : ""} · not saved as a take`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audition failed");
      setAuditionPlaying(null);
    } finally {
      setAuditionBusy(null);
    }
  }

  /** State audition: hear how a development state performs - variant voice + speed/pitch hints - without binding anything. */
  async function playStateAudition(characterId: string) {
    const stateId = stateSel[characterId];
    if (!stateId) return;
    stopAudition();
    setAuditionBusy(`state:${characterId}`);
    setAuditionMsg(null);
    setError(null);
    try {
      const res = await api.auditionVoice({
        projectId: project.id,
        stateId,
        delivery: auditionDelivery,
        text: auditionLine.trim() || undefined,
        // no speaker override: the API reads the state's own character, so
        // an empty board line auditions the character's first dialogue line
      });
      await playClip(`state-play-${characterId}`, res);
      const v = res.variant;
      const bits = [
        `state audition: "${v?.stateLabel ?? "state"}"`,
        `${res.voiceId}${v?.variantVoiceId ? " (variant voice)" : " (cast voice)"}`,
        `x${res.delivery.speed.toFixed(2)}`,
        res.pitch !== 1 ? `pitch x${res.pitch.toFixed(2)}` : null,
        v?.episodeNumber != null ? `@Ep${v.episodeNumber}` : null,
        res.speaker ? `${res.speaker}'s line` : res.source,
        res.durationMs ? `${(res.durationMs / 1000).toFixed(1)}s` : "",
        "not saved as a take",
      ].filter(Boolean);
      setAuditionMsg(bits.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "State audition failed");
      setAuditionPlaying(null);
    } finally {
      setAuditionBusy(null);
    }
  }

  /** Decode + play an audition clip; shared by voice and state auditions. */
  async function playClip(key: string, res: { audio: string; mimeType: string; durationMs: number | null }) {
    const bin = atob(res.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType }));
    const audio = new Audio(url);
    audioRef.current = audio;
    setAuditionPlaying(key);
    audio.onended = () => {
      setAuditionPlaying(null);
      URL.revokeObjectURL(url);
    };
    await audio.play();
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
                  <button
                    onClick={() => void playAudition(`artist:${a.id}`, a.voiceId ?? defaultVoiceFor(a.name))}
                    disabled={auditionBusy === `artist:${a.id}`}
                    title={`Audition ${a.voiceId ?? defaultVoiceFor(a.name)} on the board's line (throwaway render, nothing is saved)`}
                    className="h-6 w-6 flex items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 transition-colors shrink-0"
                  >
                    {auditionBusy === `artist:${a.id}`
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : auditionPlaying === `artist:${a.id}`
                        ? <Square className="h-2.5 w-2.5" />
                        : <Play className="h-2.5 w-2.5" />}
                  </button>
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
              Bind a character to the roster artist who speaks for them. Their VOICE cues render with that artist&apos;s voice; DSH can also cast via <span className="font-mono text-[9px]">cast_voice_actor</span>. Pick a development state under a character to audition how that state performs (variant voice + speed/pitch hints) before binding it.
            </p>
            {/* audition controls: register + optional line, applied to every audition button below */}
            <div className="flex items-center gap-2">
              <select
                value={auditionDelivery}
                onChange={(e) => setAuditionDelivery(e.target.value as DeliveryId)}
                className="h-7 w-24 shrink-0 rounded-md border border-white/10 bg-black/30 px-1.5 text-[10px] text-foreground"
                title="Register the audition is performed in"
              >
                {DELIVERIES.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#12121a]">{d.label}</option>
                ))}
              </select>
              <input
                value={auditionLine}
                onChange={(e) => setAuditionLine(e.target.value)}
                placeholder="Audition line (empty = the character's own first line)"
                className="h-7 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-[10px] text-foreground placeholder:text-muted-foreground/70"
              />
              {auditionPlaying && (
                <button
                  onClick={stopAudition}
                  className="h-7 w-7 flex items-center justify-center rounded-md border border-white/15 bg-white/5 text-muted-foreground hover:text-foreground shrink-0"
                  title="Stop the audition clip"
                >
                  <Square className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            {project.characters.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No characters yet - cast voices once the cast exists.</p>
            )}
            <div className="space-y-1.5 max-h-40 overflow-y-auto studio-scroll pr-1">
              {project.characters.map((c) => (
                <Fragment key={c.id}>
                <div className="flex items-center gap-2">
                  <div className="w-24 shrink-0 min-w-0">
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
                  <button
                    onClick={() => {
                      const artist = c.voiceArtist && artistById.get(c.voiceArtist.id);
                      void playAudition(`char:${c.id}`, artist?.voiceId ?? defaultVoiceFor(c.name), c.name);
                    }}
                    disabled={auditionBusy === `char:${c.id}`}
                    title={`Audition ${c.name}'s voice (their own first line when the board line is empty)`}
                    className="h-7 w-7 flex items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 transition-colors shrink-0"
                  >
                    {auditionBusy === `char:${c.id}`
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : auditionPlaying === `char:${c.id}`
                        ? <Square className="h-2.5 w-2.5" />
                        : <Play className="h-2.5 w-2.5" />}
                  </button>
                </div>
                {c.states.length > 0 && (
                  <div className="flex items-center gap-2 pl-6 -mt-0.5">
                    <span className="text-[8px] uppercase tracking-[0.14em] text-violet-300/80 shrink-0">state try</span>
                    <select
                      value={stateSel[c.id] ?? ""}
                      onChange={(e) => setStateSel({ ...stateSel, [c.id]: e.target.value })}
                      className="h-6 flex-1 rounded border border-violet-400/20 bg-black/30 px-1.5 text-[10px] text-foreground"
                      title="Audition how this development state performs: its variant voice plus speed/pitch hints (throwaway render, nothing is saved)"
                    >
                      <option value="" className="bg-[#12121a]">pick a state to audition...</option>
                      {c.states.map((s) => (
                        <option key={s.id} value={s.id} className="bg-[#12121a]">
                          {s.label}
                          {s.voiceVariant ? ` · ${s.voiceVariant}` : ""}
                          {s.speedHint != null ? ` · x${s.speedHint}` : ""}
                          {s.pitchHint != null ? ` · pitch ${s.pitchHint}` : ""}
                          {s.episodeNumber ? ` @Ep${s.episodeNumber}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void playStateAudition(c.id)}
                      disabled={!stateSel[c.id] || auditionBusy === `state:${c.id}`}
                      title="Hear the selected state: variant voice and speed/pitch hints on the board's line (throwaway render, nothing is saved)"
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-violet-400/25 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20 transition-colors shrink-0"
                    >
                      {auditionBusy === `state:${c.id}`
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : auditionPlaying === `state-play-${c.id}`
                          ? <Square className="h-2.5 w-2.5" />
                          : <Play className="h-2.5 w-2.5" />}
                    </button>
                  </div>
                )}
                </Fragment>
              ))}
            </div>
            {auditionMsg && (
              <p className="text-[10px] font-mono text-cyan-300/90">{auditionMsg}</p>
            )}
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
