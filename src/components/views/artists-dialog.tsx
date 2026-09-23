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
// voice when one is bound, plus the state's speed/pitch hints. When
// the auditioned line has a stored take, the response carries it as
// the A side and the board can play current vs proposed back to back.
// ENSEMBLE TRY rows: several speakers in ONE batch - one A/B row per
// speaker (A = the current stored take, B = the proposed read), a
// per-row compare, and a sequence play that reads the whole ensemble
// in cast order.

import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Headphones, History, Loader2, Play, Plus, Square, Trash2, Users } from "lucide-react";
import { api, type StudioProject, type AuditionResult, type AuditionCurrentSide } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { VOICES, defaultVoiceFor, voiceById } from "@/lib/comic/voice-catalog";
import { DELIVERIES, type DeliveryId } from "@/lib/comic/delivery";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROSTER_COLORS = ["#e8b04b", "#5aa88f", "#b07cd8", "#d8767c", "#7c9cff", "#8fbf6a"];

function shortAuditionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * PER-STATE AUDITION HISTORY: every past proposed read of ONE state
 * (DSH binds + ensemble applies, plus the board's own state tries),
 * newest first, each replayable and removable - so a performance the
 * director liked three auditions ago is still one click away.
 */
function StateAuditionHistory({ stateId, playing, onPlay, refreshKey }: {
  stateId: string;
  playing: string | null;
  onPlay: (key: string, url: string) => void;
  refreshKey: number;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["state-auditions", stateId, refreshKey],
    queryFn: () => api.stateAuditions(stateId),
  });
  const rows = q.data?.auditions ?? [];
  async function remove(id: string) {
    try {
      await api.deleteStateAudition(id);
      await qc.invalidateQueries({ queryKey: ["state-auditions", stateId] });
    } catch {
      // best-effort removal
    }
  }
  return (
    <div className="ml-6 mt-1 space-y-1 rounded border border-violet-400/20 bg-violet-400/[0.04] p-1.5">
      <div className="text-[8px] uppercase tracking-[0.14em] text-violet-300/90">
        audition history - {rows.length} recorded read{rows.length === 1 ? "" : "s"} (newest first)
      </div>
      {q.isLoading && <div className="text-[10px] text-muted-foreground">loading history...</div>}
      {!q.isLoading && rows.length === 0 && (
        <div className="text-[10px] text-muted-foreground">
          no auditions recorded for this state yet - run a state try here, or let DSH bind a variant or land an arc (every proposed read lands here).
        </div>
      )}
      {rows.map((row) => {
        const key = `hist:${row.id}`;
        const isPlaying = playing === key;
        return (
          <div key={row.id} className="flex items-center gap-1.5 rounded border border-white/10 bg-black/25 px-1.5 py-0.5">
            <button
              onClick={() => onPlay(key, row.url)}
              title={`Play this recorded read: ${row.voiceId} in ${row.deliveryId.toLowerCase()}${row.durationMs ? ` · ${(row.durationMs / 1000).toFixed(1)}s` : ""}`}
              className="h-5 w-5 flex items-center justify-center rounded-md border border-violet-400/25 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20 transition-colors shrink-0"
            >
              {isPlaying ? <Square className="h-2 w-2" /> : <Play className="h-2.5 w-2.5" />}
            </button>
            <span className="shrink-0 font-mono text-[9px] text-violet-200/90">
              {row.voiceId}
              {row.speed !== 1 ? ` · x${row.speed}` : ""}
              {row.pitch !== 1 ? ` · pitch ${row.pitch}` : ""}
              {row.durationMs ? ` · ${(row.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
            <span className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground">&quot;{row.text}&quot;</span>
            <span className="shrink-0 text-[8px] text-muted-foreground/70">{shortAuditionDate(row.createdAt)}</span>
            <button
              onClick={() => void remove(row.id)}
              title="Remove this recorded read (and its file)"
              className="h-5 w-5 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-300 transition-colors shrink-0"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

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
  // per-state audition history: open/closed per character + a refresh counter
  // bumped after every new recorded read so an open history list refetches
  const [histOpen, setHistOpen] = useState<Record<string, boolean>>({});
  const [histRefresh, setHistRefresh] = useState(0);
  // A/B pairs from the last state audition per character: the stored take of the line + the proposed render
  const [statePairs, setStatePairs] = useState<Record<string, { proposed: AuditionResult; current: AuditionCurrentSide } | null>>(({}));
  // ensemble try: selected characters, rendered rows, batch state
  const [ensSel, setEnsSel] = useState<Record<string, boolean>>({});
  const [ensRows, setEnsRows] = useState<AuditionResult[] | null>(null);
  const [ensSkips, setEnsSkips] = useState<Array<{ entry: string; reason: string }>>([]);
  const [ensBusy, setEnsBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // sequence token: bumping it cancels any running multi-clip playback
  const seqRef = useRef(0);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  // stop any audition clip when the dialog closes
  useEffect(() => {
    if (!open) {
      seqRef.current += 1;
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
    seqRef.current += 1; // cancels any running ensemble sequence
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
      setStatePairs((prev) => ({ ...prev, [characterId]: res.current ? { proposed: res, current: res.current } : null }));
      // the read just landed in the state's history: refresh an open list
      setHistRefresh((n) => n + 1);
      const bits = [
        `state audition: "${v?.stateLabel ?? "state"}"`,
        `${res.voiceId}${v?.variantVoiceId ? " (variant voice)" : " (cast voice)"}`,
        `x${res.delivery.speed.toFixed(2)}`,
        res.pitch !== 1 ? `pitch x${res.pitch.toFixed(2)}` : null,
        v?.episodeNumber != null ? `@Ep${v.episodeNumber}` : null,
        res.speaker ? `${res.speaker}'s line` : res.source,
        res.durationMs ? `${(res.durationMs / 1000).toFixed(1)}s` : "",
        res.current ? `A/B ready: current take ${res.current.voiceId ?? "?"}${res.current.durationMs ? ` · ${(res.current.durationMs / 1000).toFixed(1)}s` : ""}` : null,
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

  // ── ensemble try: multi-speaker A/B rows ─────────────────────────

  function decodeAudition(res: { audio: string; mimeType: string }): string {
    const bin = atob(res.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: res.mimeType }));
  }

  /** Play one decoded clip to the end (or until the sequence token moves). */
  function playClipAwait(key: string, res: { audio: string; mimeType: string }, token: number): Promise<void> {
    return new Promise((resolve) => {
      const url = decodeAudition(res);
      const audio = new Audio(url);
      audioRef.current = audio;
      setAuditionPlaying(key);
      const done = () => {
        URL.revokeObjectURL(url);
        if (seqRef.current === token) setAuditionPlaying(null);
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.onpause = done; // stop() pauses: resolve the waiter instead of hanging
      void audio.play().catch(done);
    });
  }

  /** Play a stored-take URL (the A side) to the end. */
  function playUrlAwait(key: string, url: string, token: number): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      setAuditionPlaying(key);
      const done = () => {
        if (seqRef.current === token) setAuditionPlaying(null);
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.onpause = done; // stop() pauses: resolve the waiter instead of hanging
      void audio.play().catch(done);
    });
  }

  /** Play a stored history read (a wav under /auditions/) to the end. */
  function playHistoryRow(key: string, url: string) {
    stopAudition();
    void playUrlAwait(key, url, seqRef.current);
  }

  /** ENSEMBLE audition: one API call renders every selected speaker; rows come back with their A/B sides. */
  async function runEnsembleAudition() {
    const selected = project.characters.filter((c) => ensSel[c.id]);
    if (selected.length < 2) return;
    stopAudition();
    setEnsBusy(true);
    setAuditionMsg(null);
    setError(null);
    try {
      const res = await api.auditionEnsemble({
        projectId: project.id,
        delivery: auditionDelivery,
        text: auditionLine.trim() || undefined,
        ensemble: selected.map((c) => ({ speaker: c.name, stateId: stateSel[c.id] || undefined })),
      });
      setEnsRows(res.rows);
      setEnsSkips(res.skipped);
      const bits = [
        `ensemble audition: ${res.rows.length} row${res.rows.length === 1 ? "" : "s"} rendered`,
        res.skipped.length > 0 ? `${res.skipped.length} skipped` : null,
        "not saved as takes",
      ].filter(Boolean);
      setAuditionMsg(bits.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ensemble audition failed");
    } finally {
      setEnsBusy(false);
    }
  }

  /** Play ONE side of an ensemble row: "current" (stored take) or "proposed" (throwaway render). */
  async function playEnsSide(idx: number, side: "current" | "proposed") {
    const row = ensRows?.[idx];
    if (!row) return;
    stopAudition();
    const token = seqRef.current;
    setAuditionBusy(`ens:${idx}:${side}`);
    try {
      if (side === "current" && row.current) await playUrlAwait(`ens-play-${idx}`, row.current.url, token);
      else await playClipAwait(`ens-play-${idx}`, row, token);
    } finally {
      if (seqRef.current === token) setAuditionBusy(null);
    }
  }

  /** A/B compare on one ensemble row: the current stored take first, then the proposed read. */
  async function playEnsCompare(idx: number) {
    const row = ensRows?.[idx];
    if (!row?.current) return;
    stopAudition();
    const token = seqRef.current;
    setAuditionBusy(`ens-ab:${idx}`);
    try {
      await playUrlAwait(`ens-ab-play-${idx}`, row.current.url, token);
      if (seqRef.current !== token) return; // stopped mid-leg
      await playClipAwait(`ens-ab-play-${idx}`, row, token);
    } finally {
      if (seqRef.current === token) setAuditionBusy(null);
    }
  }

  /** Sequence play: every row's PROPOSED read in cast order - the ensemble table read. */
  async function playEnsSequence() {
    if (!ensRows || ensRows.length === 0) return;
    stopAudition();
    const token = seqRef.current;
    setAuditionBusy("ens-seq");
    try {
      for (let i = 0; i < ensRows.length; i += 1) {
        if (seqRef.current !== token) return;
        await playClipAwait(`ens-seq-${i}`, ensRows[i], token);
        if (seqRef.current !== token) return;
      }
    } finally {
      if (seqRef.current === token) setAuditionBusy(null);
    }
  }

  /** A/B compare: play the current stored take of the line, then the proposed performance, back to back. */
  async function playCompare(characterId: string) {
    const pair = statePairs[characterId];
    if (!pair) return;
    stopAudition();
    setAuditionBusy(`ab:${characterId}`);
    setError(null);
    try {
      // leg 1: the current stored take (same-origin URL under /voices/)
      const currentAudio = new Audio(pair.current.url);
      audioRef.current = currentAudio;
      setAuditionPlaying(`ab-play-${characterId}`);
      await new Promise<void>((resolve) => {
        currentAudio.onended = () => resolve();
        currentAudio.onerror = () => resolve();
        void currentAudio.play().catch(() => resolve());
      });
      // stopAudition() during leg 1 swaps audioRef: do not roll into leg 2
      if (audioRef.current !== currentAudio) return;
      // leg 2: the proposed performance (throwaway base64 render)
      const bin = atob(pair.proposed.audio);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: pair.proposed.mimeType }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setAuditionPlaying(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : "A/B compare failed");
      setAuditionPlaying(null);
    } finally {
      setAuditionBusy(null);
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
                    {statePairs[c.id] && (
                      <button
                        onClick={() => void playCompare(c.id)}
                        disabled={auditionBusy === `ab:${c.id}`}
                        title={`A/B compare: the current stored take (${statePairs[c.id]!.current.voiceId ?? "unknown voice"}) first, then the proposed ${statePairs[c.id]!.proposed.voiceId} read, back to back`}
                        className="h-6 w-6 flex items-center justify-center rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-colors shrink-0"
                      >
                        {auditionBusy === `ab:${c.id}`
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : auditionPlaying === `ab-play-${c.id}`
                            ? <Square className="h-2.5 w-2.5" />
                            : <Headphones className="h-2.5 w-2.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => setHistOpen((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                      disabled={!stateSel[c.id]}
                      title={stateSel[c.id]
                        ? "Show this state's audition history: every past proposed read of the state, replayable"
                        : "Pick a state first - the history is per state"}
                      className={cn(
                        "h-6 w-6 flex items-center justify-center rounded-md border transition-colors shrink-0",
                        histOpen[c.id] && stateSel[c.id]
                          ? "border-violet-400/40 bg-violet-400/15 text-violet-200"
                          : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
                        !stateSel[c.id] && "opacity-40",
                      )}
                    >
                      <History className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
                {histOpen[c.id] && stateSel[c.id] && (
                  <StateAuditionHistory
                    stateId={stateSel[c.id]}
                    playing={auditionPlaying}
                    onPlay={playHistoryRow}
                    refreshKey={histRefresh}
                  />
                )}
                </Fragment>
              ))}
            </div>

            {/* ENSEMBLE TRY: multi-speaker A/B rows - one batch call, one row per speaker */}
            {project.characters.length >= 2 && (
              <div className="space-y-1.5 rounded-lg border border-teal-400/20 bg-teal-400/[0.04] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-teal-200 flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Ensemble try
                  </div>
                  <span className="text-[9px] font-mono text-teal-300/80">
                    {project.characters.filter((c) => ensSel[c.id]).length} picked · A/B rows
                  </span>
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Pick two or more characters and audition them as ONE batch: the board renders every speaker with their picked state (see each row&apos;s state try above) or cast voice, and lays out one A/B row per speaker - A is the current stored take of the line, B is the proposed read. Play a side, compare a row, or run the whole ensemble in sequence.
                </p>
                <div className="flex flex-wrap gap-1">
                  {project.characters.map((c) => {
                    const on = Boolean(ensSel[c.id]);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setEnsSel((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                        title={on ? `Remove ${c.name} from the ensemble batch` : `Add ${c.name} to the ensemble batch (their picked state, if any, drives the audition)`}
                        className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${on ? "bg-teal-400/20 border-teal-400/40 text-teal-100" : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"}`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-[11px] border-teal-400/30 bg-teal-400/10 text-teal-100 hover:bg-teal-400/20"
                  disabled={ensBusy || project.characters.filter((c) => ensSel[c.id]).length < 2}
                  onClick={() => void runEnsembleAudition()}
                >
                  {ensBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <AudioLines className="h-3 w-3 mr-1" />}
                  Audition ensemble
                  {project.characters.filter((c) => ensSel[c.id]).length >= 2 && ` (${project.characters.filter((c) => ensSel[c.id]).length})`}
                </Button>
                {ensRows && ensRows.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] uppercase tracking-[0.14em] text-teal-200/90">
                        {ensRows.length} A/B row{ensRows.length === 1 ? "" : "s"} · {auditionDelivery.toLowerCase()}
                      </span>
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => void playEnsSequence()}
                          disabled={auditionBusy === "ens-seq"}
                          title="Play every row's proposed read in cast order - hear the ensemble as one scene"
                          className="h-6 rounded-md border border-teal-400/30 bg-teal-400/10 px-2 text-[9px] font-bold text-teal-200 hover:bg-teal-400/20 transition-colors flex items-center gap-1"
                        >
                          {auditionBusy === "ens-seq" ? <Loader2 className="h-3 w-3 animate-spin" /> : auditionPlaying?.startsWith("ens-seq") ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
                          play sequence
                        </button>
                        <button
                          onClick={stopAudition}
                          title="Stop playback"
                          className="h-6 w-6 flex items-center justify-center rounded-md border border-white/15 bg-white/5 text-muted-foreground hover:text-foreground"
                        >
                          <Square className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    </div>
                    {ensRows.map((row, idx) => (
                      <div key={`${row.speaker ?? idx}-${idx}`} className="flex items-center gap-1.5 rounded border border-white/10 bg-black/25 px-2 py-1">
                        <div className="w-24 shrink-0 min-w-0">
                          <div className="text-[10px] text-foreground truncate">{row.speaker ?? "?"}</div>
                          <div className="text-[8px] text-muted-foreground truncate">
                            {row.variant?.stateLabel ?? "cast voice"} · {row.voiceId}
                          </div>
                        </div>
                        {row.current ? (
                          <button
                            onClick={() => void playEnsSide(idx, "current")}
                            disabled={auditionBusy === `ens:${idx}:current`}
                            title={`A: the current stored take${row.current.voiceId ? ` by ${row.current.voiceId}` : ""}${row.current.durationMs ? ` · ${(row.current.durationMs / 1000).toFixed(1)}s` : ""}`}
                            className="h-6 w-6 flex items-center justify-center rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-colors shrink-0 font-bold text-[9px]"
                          >
                            {auditionBusy === `ens:${idx}:current` ? <Loader2 className="h-3 w-3 animate-spin" /> : auditionPlaying === `ens-play-${idx}` ? <Square className="h-2.5 w-2.5" /> : "A"}
                          </button>
                        ) : (
                          <span
                            title="No stored take of the auditioned line yet - the A side stays empty"
                            className="h-6 w-6 flex items-center justify-center rounded-md border border-white/8 text-[9px] font-bold text-muted-foreground/50 shrink-0"
                          >
                            A
                          </span>
                        )}
                        <button
                          onClick={() => void playEnsSide(idx, "proposed")}
                          disabled={auditionBusy === `ens:${idx}:proposed`}
                          title={`B: the proposed read - ${row.voiceId}${row.durationMs ? ` · ${(row.durationMs / 1000).toFixed(1)}s` : ""}`}
                          className="h-6 w-6 flex items-center justify-center rounded-md border border-violet-400/25 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20 transition-colors shrink-0 font-bold text-[9px]"
                        >
                          {auditionBusy === `ens:${idx}:proposed` ? <Loader2 className="h-3 w-3 animate-spin" /> : auditionPlaying === `ens-play-${idx}` ? <Square className="h-2.5 w-2.5" /> : "B"}
                        </button>
                        {row.current && (
                          <button
                            onClick={() => void playEnsCompare(idx)}
                            disabled={auditionBusy === `ens-ab:${idx}`}
                            title={`A/B: current take first (${row.current.voiceId ?? "unknown voice"}), then the proposed ${row.voiceId} read`}
                            className="h-6 w-6 flex items-center justify-center rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-colors shrink-0"
                          >
                            {auditionBusy === `ens-ab:${idx}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Headphones className="h-2.5 w-2.5" />}
                          </button>
                        )}
                        <span className="text-[9px] font-mono text-muted-foreground truncate flex-1">
                          &quot;{row.text}&quot;
                        </span>
                      </div>
                    ))}
                    {ensSkips.length > 0 && (
                      <p className="text-[9px] font-mono text-amber-300/90">
                        skipped: {ensSkips.map((s) => `${s.entry} (${s.reason})`).join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
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
