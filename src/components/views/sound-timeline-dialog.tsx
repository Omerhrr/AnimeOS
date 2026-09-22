"use client";

// Sound / SFX timing editor for a shot's motion panel.
// The timeline is the shot's duration (ms); cues are blocks you can
// add by clicking the track, edit inline, and preview with the
// WebAudio CuePlayer (synthesized - no audio files needed).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Drama, Loader2, Music, Play, Plus, Square, Trash2, Wand2 } from "lucide-react";
import { api, type AudioCueKind, type AudioCueRow, type ShotRow } from "@/lib/api-client";
import { parseDialogue } from "@/lib/comic/dialogue";
import { CUE_KIND_META, CuePlayer } from "@/lib/comic/audio";
import { DELIVERIES, deliveryProfile } from "@/lib/comic/delivery";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const KINDS: AudioCueKind[] = ["SFX", "VOICE", "BGM", "AMBIENCE"];

// Same roster the server exposes via GET /api/voice-renders
const VOICES: Array<{ id: string; blurb: string }> = [
  { id: "tongtong", blurb: "Warm, gentle" },
  { id: "chuichui", blurb: "Bright, playful" },
  { id: "xiaochen", blurb: "Calm, steady" },
  { id: "jam", blurb: "British, refined" },
  { id: "kazi", blurb: "Clear, neutral" },
  { id: "douji", blurb: "Natural, flowing" },
  { id: "luodo", blurb: "Expressive, resonant" },
];

/** Deterministic default casting: the same speaker always lands on the same voice. */
function defaultVoiceFor(speaker: string): string {
  let h = 2166136261;
  for (let i = 0; i < speaker.length; i++) {
    h ^= speaker.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return VOICES[(h >>> 0) % VOICES.length].id;
}

/** The speed a take was actually performed at: stored base x its delivery multiplier. */
function effectiveTakeSpeed(cue: AudioCueRow): number {
  const base = cue.voiceSpeed ?? 1.0;
  const mul = deliveryProfile(cue.voiceState).speedMul;
  return Math.round(base * mul * 100) / 100;
}

export function SoundTimelineDialog({
  shot, open, onClose, onChanged,
}: {
  shot: ShotRow;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [cues, setCues] = useState<AudioCueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState<string>("");
  const [voiceDraft, setVoiceDraft] = useState<string>("tongtong");
  const [speedDraft, setSpeedDraft] = useState(1.0);
  const [deliveryDraft, setDeliveryDraft] = useState<string>("AUTO");
  const [deliveryInfo, setDeliveryInfo] = useState<{ id: string; label: string; source: string; stateLabel: string | null; speed: number } | null>(null);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const playerRef = useRef<CuePlayer | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const totalMs = Math.max(500, Math.round((shot.duration ?? 4) * 1000));
  const selected = cues.find((c) => c.id === selectedId) ?? null;
  const playing = playheadMs !== null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.audioCues(shot.id);
      setCues(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cues");
    } finally {
      setLoading(false);
    }
  }, [shot.id]);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setPlayheadMs(null);
      void load();
    }
    return () => {
      playerRef.current?.stop();
      setPlayheadMs(null);
    };
  }, [open, load]);

  // keep the label draft in sync with which cue is selected
  useEffect(() => {
    setLabelDraft(selected?.label ?? "");
  }, [selected?.id, selected?.label]);

  // voice casting defaults follow the selected VOICE cue's speaker
  useEffect(() => {
    if (!selected || selected.kind !== "VOICE") return;
    const speaker = selected.label.includes(": ") ? selected.label.split(":")[0].trim() : "";
    setVoiceDraft(selected.voiceActor ?? defaultVoiceFor(speaker || selected.label));
    setSpeedDraft(selected.voiceSpeed ?? 1.0);
    setDeliveryDraft("AUTO");
    setDeliveryInfo(
      selected.voiceUrl
        ? {
            id: selected.voiceState ?? "NEUTRAL",
            label: (DELIVERIES.find((d) => d.id === (selected.voiceState ?? "NEUTRAL")) ?? DELIVERIES[0]).label,
            source: "last take",
            stateLabel: selected.voiceStateLabel,
            speed: effectiveTakeSpeed(selected),
          }
        : null,
    );
  }, [selected?.id, selected?.kind, selected?.voiceActor, selected?.voiceSpeed, selected?.voiceUrl]);

  function ensurePlayer(): CuePlayer {
    if (!playerRef.current) playerRef.current = new CuePlayer();
    return playerRef.current;
  }

  async function addCueAt(clientX?: number) {
    const track = trackRef.current;
    let ratio = 0.35;
    if (track && clientX !== undefined) {
      const rect = track.getBoundingClientRect();
      ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }
    const startMs = Math.min(totalMs - 100, Math.round(ratio * totalMs));
    try {
      const cue = await api.createAudioCue({ shotId: shot.id, kind: "SFX", label: "New SFX", startMs, durationMs: Math.min(600, totalMs - startMs) });
      setCues((cs) => [...cs, cue].sort((a, b) => a.startMs - b.startMs));
      setSelectedId(cue.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add cue");
    }
  }

  async function patchCue(id: string, patch: Record<string, unknown>) {
    // optimistic local update, then persist
    setCues((cs) => cs.map((c) => (c.id === id ? { ...c, ...(patch as Partial<AudioCueRow>) } : c)));
    try {
      await api.patchAudioCue(id, patch);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cue");
      void load();
    }
  }

  async function removeCue(id: string) {
    setCues((cs) => cs.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      await api.deleteAudioCue(id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete cue");
      void load();
    }
  }

  const renderCueVoice = useCallback(async (cue: AudioCueRow, voice?: string, speed?: number, delivery?: string) => {
    setRenderingIds((s) => new Set(s).add(cue.id));
    setBatchMsg(null);
    try {
      const res = await api.renderVoice(cue.id, voice, speed, delivery);
      setCues((cs) => cs.map((c) => (c.id === res.cue.id ? res.cue : c)).sort((a, b) => a.startMs - b.startMs));
      if (selectedId === cue.id) setDeliveryInfo(res.delivery);
      onChanged();
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice render failed");
      return null;
    } finally {
      setRenderingIds((s) => {
        const next = new Set(s);
        next.delete(cue.id);
        return next;
      });
    }
  }, [onChanged, selectedId]);

  const renderAllVoices = useCallback(async () => {
    const pending = cues.filter((c) => c.kind === "VOICE" && !c.voiceUrl);
    if (pending.length === 0) {
      setBatchMsg("Every VOICE cue already has a rendered take");
      return;
    }
    let done = 0;
    let stateAware = 0;
    // small pool so the TTS service is not hammered
    const queue = [...pending];
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length > 0) {
        const cue = queue.shift();
        if (!cue) break;
        const speaker = cue.label.includes(": ") ? cue.label.split(":")[0].trim() : "";
        // AUTO delivery: the server resolves the speaker's character state
        const res = await renderCueVoice(cue, defaultVoiceFor(speaker || cue.label), 1.0, "AUTO");
        if (res) {
          done++;
          if (res.delivery.id !== "NEUTRAL") stateAware++;
        }
      }
    });
    await Promise.all(workers);
    setBatchMsg(
      `Rendered ${done} voice take${done === 1 ? "" : "s"} (auto-cast, character-state delivery)${stateAware > 0 ? ` · ${stateAware} in a non-neutral state` : ""}`,
    );
  }, [cues, renderCueVoice]);

  const voiceStats = useMemo(() => {
    const voiceCues = cues.filter((c) => c.kind === "VOICE");
    return { total: voiceCues.length, rendered: voiceCues.filter((c) => c.voiceUrl).length };
  }, [cues]);

  function autoScore() {
    // non-destructive: only ADDS cues, existing ones stay
    void (async () => {
      try {
        const lines = parseDialogue(shot.dialogue);
        const weather = /storm|rain/i.test(shot.description) ? "Storm rain bed" : "Environment bed";
        await api.createAudioCue({ shotId: shot.id, kind: "AMBIENCE", label: weather, startMs: 0, durationMs: totalMs, volume: 0.5 });
        if (shot.movement && shot.movement !== "STATIC") {
          await api.createAudioCue({
            shotId: shot.id, kind: "SFX",
            label: `Camera ${shot.movement.toLowerCase()} - air swish`,
            startMs: Math.round(totalMs * 0.12), durationMs: Math.min(900, Math.round(totalMs * 0.25)), volume: 0.55,
          });
        }
        lines.forEach((line, i) => {
          const startMs = Math.round(((i + 1) / (lines.length + 1)) * totalMs);
          void api.createAudioCue({
            shotId: shot.id, kind: "VOICE",
            label: line.speaker ? `${line.speaker}: ${line.text}` : line.text,
            startMs, durationMs: Math.min(Math.max(900, line.text.length * 55), totalMs - startMs - 50),
            volume: 0.9,
          });
        });
        await load();
        onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Auto-score failed");
      }
    })();
  }

  function play() {
    if (playing) {
      playerRef.current?.stop();
      setPlayheadMs(null);
      return;
    }
    ensurePlayer().play(
      cues,
      totalMs,
      (ms) => setPlayheadMs(Math.min(ms, totalMs)),
      () => setPlayheadMs(null),
    );
    setPlayheadMs(0);
  }

  const pct = (ms: number) => `${(ms / totalMs) * 100}%`;
  const rulerTicks = Array.from({ length: Math.floor(totalMs / 500) + 1 }, (_, i) => i * 500);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { playerRef.current?.stop(); onClose(); } }}>
      <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-2xl max-h-[85vh] overflow-y-auto studio-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" /> Motion sound - shot {String(shot.number).padStart(3, "0")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {(shot.movement && shot.movement !== "STATIC" ? `Motion panel (${shot.movement})` : "Static panel")} · {totalMs}ms timeline · click the track to drop a cue, click a block to edit.
          </DialogDescription>
        </DialogHeader>

        {/* transport */}
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8" onClick={play} disabled={cues.length === 0 && !playing}>
            {playing ? <><Square className="h-3.5 w-3.5 mr-1" /> Stop</> : <><Play className="h-3.5 w-3.5 mr-1" /> Preview sound</>}
          </Button>
          <Button size="sm" variant="outline" className="h-8 border-white/12 bg-white/5 text-[11px]" onClick={autoScore}>
            <Wand2 className="h-3.5 w-3.5 mr-1" /> Auto-score from shot
          </Button>
          <Button size="sm" variant="outline" className="h-8 border-white/12 bg-white/5 text-[11px]" onClick={() => void addCueAt()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add cue
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-8 border-white/12 bg-white/5 text-[11px]"
            onClick={() => void renderAllVoices()}
            disabled={voiceStats.total === 0 || renderingIds.size > 0}
            title={voiceStats.total === 0 ? "No VOICE cues on this timeline" : "Render every VOICE cue missing a take (auto-cast voices)"}
          >
            {renderingIds.size > 0 ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <AudioLines className="h-3.5 w-3.5 mr-1" />}
            Render voices {voiceStats.total > 0 && `(${voiceStats.rendered}/${voiceStats.total})`}
          </Button>
          <span className="ml-auto text-xs font-mono tabular-nums text-muted-foreground">
            {playing ? `${(playheadMs / 1000).toFixed(2)}s / ${(totalMs / 1000).toFixed(2)}s` : `${(totalMs / 1000).toFixed(2)}s`}
          </span>
        </div>

        {/* timeline */}
        <div className="select-none">
          <div className="relative" style={{ height: 150 }} ref={trackRef}>
            {/* ruler */}
            {rulerTicks.map((ms) => (
              <div key={ms} className="absolute top-0 flex flex-col items-center" style={{ left: pct(ms), transform: "translateX(-50%)" }}>
                <div className={cn("w-px bg-white/20", ms % 1000 === 0 ? "h-2.5" : "h-1.5")} />
                {ms % 1000 === 0 && <span className="text-[8px] font-mono text-muted-foreground -translate-y-0.5">{ms / 1000}s</span>}
              </div>
            ))}
            {/* track surface */}
            <div
              className="absolute inset-x-0 rounded-md border border-white/12 bg-black/35"
              style={{ top: 24, height: 96 }}
              onClick={(e) => { if (!playing) void addCueAt(e.clientX); }}
            />
            {/* lane labels */}
            {["AMB", "BGM", "VOX", "SFX"].map((lane, i) => (
              <span key={lane} className="absolute left-0.5 text-[7px] font-mono tracking-widest text-white/25 z-0" style={{ top: 34 + i * 22 }}>{lane}</span>
            ))}
            {/* cue blocks */}
            {cues.map((cue) => {
              const meta = CUE_KIND_META[cue.kind as AudioCueKind] ?? CUE_KIND_META.SFX;
              const isSel = cue.id === selectedId;
              return (
                <button
                  key={cue.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(isSel ? null : cue.id); }}
                  className={cn(
                    "absolute rounded-sm border px-1 py-0.5 text-left overflow-hidden transition-shadow",
                    isSel ? "ring-2 ring-white/60 z-20" : "hover:brightness-110 z-10"
                  )}
                  style={{
                    left: `calc(${pct(cue.startMs)} + 16px)`,
                    width: `max(16px, ${pct(cue.durationMs)})`,
                    top: 30 + (cue.kind === "AMBIENCE" ? 0 : cue.kind === "BGM" ? 22 : cue.kind === "VOICE" ? 44 : 66),
                    height: 18,
                    background: `${meta.color}33`,
                    borderColor: meta.color,
                  }}
                  title={`${meta.label}: ${cue.label} (${cue.startMs}ms +${cue.durationMs}ms)${cue.kind === "VOICE" && cue.voiceUrl ? ` · TTS take ${cue.voiceActor ?? ""} ${((cue.voiceDurationMs ?? 0) / 1000).toFixed(1)}s${cue.voiceState && cue.voiceState !== "NEUTRAL" ? ` · ${cue.voiceState.toLowerCase()} delivery` : ""}` : ""}`}
                >
                  <span className="block text-[8px] font-semibold leading-tight truncate text-white">
                    {cue.kind === "VOICE" && cue.voiceUrl && <span className="text-cyan-300 mr-0.5">●</span>}
                    {cue.label}
                  </span>
                </button>
              );
            })}
            {/* playhead */}
            {playing && (
              <div className="absolute w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-30" style={{ left: pct(playheadMs ?? 0), top: 24, height: 96 }} />
            )}
          </div>
          {/* legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {KINDS.map((k) => (
              <span key={k} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ background: `${CUE_KIND_META[k].color}66`, border: `1px solid ${CUE_KIND_META[k].color}` }} />
                {CUE_KIND_META[k].label} - {CUE_KIND_META[k].blurb}
              </span>
            ))}
          </div>
        </div>

        {/* selected cue editor */}
        {selected && (
          <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Edit cue</Label>
              <span className="text-[9px] font-mono text-muted-foreground">{selected.id.slice(-6)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 grid gap-1.5">
                <Label className="text-[10px]">Label {selected.kind === "VOICE" && "(spoken by the preview - text after the colon)"}</Label>
                <Input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={() => { if (labelDraft.trim() && labelDraft !== selected.label) void patchCue(selected.id, { label: labelDraft.trim() }); }}
                  className="bg-white/5 border-white/10 text-xs h-8"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Kind</Label>
                <div className="flex gap-1">
                  {KINDS.map((k) => (
                    <button
                      key={k}
                      onClick={() => void patchCue(selected.id, { kind: k })}
                      className={cn(
                        "flex-1 h-8 rounded-md border text-[10px] font-semibold transition-colors",
                        selected.kind === k ? "border-white/40" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                      style={selected.kind === k ? { background: `${CUE_KIND_META[k].color}30`, color: CUE_KIND_META[k].color } : undefined}
                    >
                      {CUE_KIND_META[k].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Volume</Label>
                <div className="flex items-center gap-2 h-8">
                  <Slider
                    value={[selected.volume]}
                    min={0.05} max={1} step={0.05}
                    onValueChange={(v) => void patchCue(selected.id, { volume: v[0] ?? 0.8 })}
                    className="flex-1"
                  />
                  <span className="w-8 text-right text-[10px] font-mono tabular-nums text-muted-foreground">{selected.volume.toFixed(2)}</span>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Start (ms)</Label>
                <Input
                  type="number" min={0} max={totalMs}
                  value={selected.startMs}
                  onChange={(e) => void patchCue(selected.id, { startMs: Number(e.target.value) })}
                  className="bg-white/5 border-white/10 text-xs h-8 tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Duration (ms)</Label>
                <Input
                  type="number" min={50} max={totalMs}
                  value={selected.durationMs}
                  onChange={(e) => void patchCue(selected.id, { durationMs: Number(e.target.value) })}
                  className="bg-white/5 border-white/10 text-xs h-8 tabular-nums"
                />
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-8 border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-[11px]" onClick={() => void removeCue(selected.id)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete cue
            </Button>
          </div>
        )}

        {/* real TTS voice render (VOICE cues only) */}
        {selected && selected.kind === "VOICE" && (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] flex items-center gap-1.5 text-cyan-200"><AudioLines className="h-3.5 w-3.5" /> Real voice render</Label>
              {selected.voiceUrl ? (
                <span className="text-[9px] font-mono text-cyan-300/90">
                  take: {selected.voiceActor} · {((selected.voiceDurationMs ?? 0) / 1000).toFixed(1)}s · x{effectiveTakeSpeed(selected).toFixed(2)}
                  {selected.voiceState && selected.voiceState !== "NEUTRAL" && ` · ${selected.voiceState.toLowerCase()}`}
                </span>
              ) : (
                <span className="text-[9px] text-muted-foreground">no take yet, preview speaks via browser TTS</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Voice actor (TTS)</Label>
                <select
                  value={voiceDraft}
                  onChange={(e) => setVoiceDraft(e.target.value)}
                  className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-foreground"
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id} className="bg-[#12121a]">{v.id} · {v.blurb}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px]">Delivery (character state)</Label>
                <select
                  value={deliveryDraft}
                  onChange={(e) => setDeliveryDraft(e.target.value)}
                  className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-foreground"
                >
                  <option value="AUTO" className="bg-[#12121a]">auto · from character state</option>
                  {DELIVERIES.map((d) => (
                    <option key={d.id} value={d.id} className="bg-[#12121a]">{d.label} · {d.blurb}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px]">Speed</Label>
                  <span className="text-[10px] font-mono tabular-nums text-cyan-300">x{speedDraft.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 h-8">
                  <Slider value={[speedDraft]} min={0.5} max={2} step={0.05} onValueChange={(v) => setSpeedDraft(v[0] ?? 1)} className="flex-1" />
                </div>
              </div>
            </div>
            {deliveryInfo && (
              <p className="flex items-center gap-1.5 text-[10px] text-cyan-200/90">
                <Drama className="h-3 w-3 shrink-0" />
                delivery: {deliveryInfo.label.toLowerCase()}
                {deliveryInfo.stateLabel && <span className="text-muted-foreground">(from “{deliveryInfo.stateLabel}”)</span>}
                <span className="font-mono text-muted-foreground">· speed x{deliveryInfo.speed.toFixed(2)} · {deliveryInfo.source}</span>
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm" className="h-8"
                onClick={() => void renderCueVoice(selected, voiceDraft, speedDraft, deliveryDraft)}
                disabled={renderingIds.has(selected.id)}
              >
                {renderingIds.has(selected.id)
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Rendering…</>
                  : <><AudioLines className="h-3.5 w-3.5 mr-1" /> {selected.voiceUrl ? "Re-render take" : "Render voice take"}</>}
              </Button>
              <span className="text-[9px] text-muted-foreground">
                The take is mixed into exported slice stems and played by the live preview.
              </span>
            </div>
          </div>
        )}

        {loading && (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading cues…</p>
        )}
        {batchMsg && <p className="text-[11px] text-cyan-300">{batchMsg}</p>}
        {!loading && cues.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            No cues yet - click the track to place one, or hit Auto-score to bed ambience, movement SFX and dialogue VOICE automatically.
          </p>
        )}
        {error && <p className="text-[11px] text-rose-300">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
