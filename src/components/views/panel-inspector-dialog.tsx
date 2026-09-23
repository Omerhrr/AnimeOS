"use client";

// Per-panel inspector: multi-artist assignment + per-shot style LoRA
// fine-tuning. The compiled LoRA directive shown here is the client
// mirror of src/lib/ai/art.ts → shotLoraDirective().

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Route, SlidersHorizontal, Square, Users, Zap } from "lucide-react";
import { api, type ArtistRow, type SceneWithShots, type ShotRow, type StyleLoraRow } from "@/lib/api-client";
import { parseDialogue } from "@/lib/comic/dialogue";
import {
  arcSpansForShot, computeArcSpans, describeArcPosition, ensembleGroupSizes, formatArcRange,
  groupEnsembleSpans, type ArcSpan,
} from "@/lib/comic/arcs";
import { buildArcTakes, mergeArcTakes, type ArcPlaybackShot, type ArcTakeItem } from "@/lib/comic/arc-playback";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Client mirror of the server-side compile (art.ts). */
function compileLoraDirective(lora: StyleLoraRow | null, strength: number | null): string | null {
  if (!lora?.triggerPhrase?.trim()) return null;
  const s = Math.min(1.2, Math.max(0.1, strength ?? lora.weight));
  const dominance = s >= 0.75 ? "this adapter dominates the visual style" : "blend this adapter with the base production style";
  return `style LoRA "${lora.name}" active (trigger tokens: ${lora.triggerPhrase.trim()}) at strength ${s.toFixed(2)} - ${dominance}`;
}

/** An arc span touching the inspected shot, enriched with ensemble info. */
type InspectorArc = ArcSpan & { startsHere: boolean; endsHere: boolean; ensemble: number; group: number; order: number };

type InspectorArcCard =
  | { kind: "single"; arc: InspectorArc }
  | { kind: "ensemble"; size: number; arcs: InspectorArc[] };

/** Stable key for one arc span (playback queues and playing state are keyed by it). */
function arcKey(a: ArcSpan): string {
  return `${a.speakerKey}:${a.state}:${a.startShotId}`;
}

/**
 * One arc card: violet when it stands alone, inset teal-tinted when
 * it renders inside an ensemble cluster. The play button queues the
 * arc's STORED takes in story order - a quick audition of the beat's
 * progression without touching the stems.
 */
function InspectorArcCard({
  a, shotDialogue, inset, takeCount, playing, onPlay, onStop,
}: {
  a: InspectorArc;
  shotDialogue: string | null | undefined;
  inset?: boolean;
  takeCount: number;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
}) {
  const arcLines = parseDialogue(shotDialogue).filter(
    (l) => l.speaker.trim().toLowerCase() === a.speakerKey && (l.state ?? null) === a.state
  );
  return (
    <div className={cn(
      "space-y-1",
      inset
        ? "rounded-md border border-teal-400/20 bg-black/25 p-2"
        : "rounded-lg border border-violet-400/25 bg-violet-400/[0.07] p-2.5",
    )}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold text-violet-200 truncate max-w-[230px]">{a.state}</span>
        <span className="text-[10px] text-muted-foreground">{a.speaker}</span>
        {a.crossesScene && (
          <span className="px-1 rounded-sm text-[8px] font-bold tracking-widest uppercase bg-violet-400/25 text-violet-200">cross-scene</span>
        )}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-[9px] font-mono text-muted-foreground" title="Rendered takes on this arc's lines">
            {takeCount} take{takeCount === 1 ? "" : "s"}
          </span>
          <button
            onClick={playing ? onStop : onPlay}
            disabled={takeCount === 0}
            title={takeCount === 0
              ? "No rendered takes on this arc's lines yet - render or re-render the lines first"
              : playing
                ? "Stop the arc playback"
                : `Arc playback: hear this arc's ${takeCount} stored take${takeCount === 1 ? "" : "s"} in sequence (story order)`}
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded-md border transition-colors",
              takeCount === 0
                ? "border-white/8 text-muted-foreground/40"
                : "border-cyan-400/25 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20",
            )}
          >
            {playing ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
          </button>
        </span>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground">
        {formatArcRange(a)} · {a.lineCount} line{a.lineCount === 1 ? "" : "s"} across {a.shotCount} shot{a.shotCount === 1 ? "" : "s"} · {describeArcPosition(a.startsHere, a.endsHere)}
      </div>
      {arcLines.length > 0 && (
        <div className="space-y-0.5">
          {arcLines.map((l, i) => (
            <p key={i} className="text-[10px] text-foreground/80 truncate">&quot;{l.text}&quot;</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function PanelInspectorDialog({
  shot, artists, loras, episodeScenes, open, onClose, onSaved,
}: {
  shot: ShotRow;
  artists: ArtistRow[];
  loras: StyleLoraRow[];
  /** ordered scenes of the inspected shot's episode: enables the state-arc span section */
  episodeScenes?: SceneWithShots[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [artistId, setArtistId] = useState<string | null>(shot.artistId ?? null);
  const [loraId, setLoraId] = useState<string | null>(shot.loraId ?? null);
  const [strength, setStrength] = useState<number>(shot.loraStrength ?? shot.lora?.weight ?? 0.8);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // arc playback: one sequential player for the whole dialog; the key
  // names the card currently playing, the token cancels the queue
  const playTokenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [arcPlayKey, setArcPlayKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setArtistId(shot.artistId ?? null);
      setLoraId(shot.loraId ?? null);
      setStrength(shot.loraStrength ?? shot.lora?.weight ?? 0.8);
      setError(null);
    } else {
      stopArcPlayback();
    }
  }, [open]);

  function stopArcPlayback() {
    playTokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setArcPlayKey(null);
  }

  /** Play a take queue in order; any stop/close/new play bumps the token and ends this loop. */
  async function playArcTakes(key: string, takes: ArcTakeItem[]) {
    stopArcPlayback();
    const token = playTokenRef.current;
    setArcPlayKey(key);
    for (const t of takes) {
      if (playTokenRef.current !== token) return;
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
    if (playTokenRef.current === token) setArcPlayKey(null);
  }

  const selectedLora = loras.find((l) => l.id === loraId) ?? null;
  const directive = compileLoraDirective(selectedLora, loraId ? strength : null);

  // state arc spans across the episode; which of them touch THIS shot;
  // spans from different speakers sharing a shot cluster into one
  // ENSEMBLE card (a parallel beat painted on several characters)
  const arcCards = useMemo<InspectorArcCard[]>(() => {
    if (!episodeScenes || episodeScenes.length === 0) return [];
    const ordered = [...episodeScenes]
      .sort((a, b) => a.number - b.number)
      .flatMap((sc) =>
        [...sc.shots]
          .sort((a, b) => a.number - b.number)
          .map((sh) => ({ id: sh.id, sceneId: sc.id, sceneNumber: sc.number, number: sh.number, dialogue: sh.dialogue ?? null }))
      );
    const all = computeArcSpans(ordered);
    const groups = groupEnsembleSpans(all);
    const sizes = ensembleGroupSizes(groups);
    const meta = new Map<string, { group: number; ensemble: number; order: number }>();
    all.forEach((s, i) => {
      meta.set(`${s.speakerKey}:${s.state}:${s.startShotId}`, { group: groups[i], ensemble: sizes[groups[i]] ?? 1, order: i });
    });
    const touching: InspectorArc[] = arcSpansForShot(all, shot.id).map((a) => {
      const m = meta.get(`${a.speakerKey}:${a.state}:${a.startShotId}`);
      return { ...a, ensemble: m?.ensemble ?? 1, group: m?.group ?? -1, order: m?.order ?? 0 };
    });
    const cards: InspectorArcCard[] = [];
    const ensByGroup = new Map<number, InspectorArc[]>();
    for (const a of touching) {
      if (a.ensemble > 1) {
        const arr = ensByGroup.get(a.group) ?? [];
        arr.push(a);
        ensByGroup.set(a.group, arr);
      } else {
        cards.push({ kind: "single", arc: a });
      }
    }
    for (const arcs of ensByGroup.values()) {
      cards.push({ kind: "ensemble", size: arcs[0].ensemble, arcs });
    }
    return cards.sort((x, y) => {
      const ox = x.kind === "single" ? x.arc.order : x.arcs[0].order;
      const oy = y.kind === "single" ? y.arc.order : y.arcs[0].order;
      return ox - oy;
    });
  }, [episodeScenes, shot.id]);

  // ordered episode shots with their audio cues: the raw material for
  // arc playback queues (buildArcTakes matches takes to lines by label)
  const playbackShots = useMemo<ArcPlaybackShot[]>(
    () =>
      (episodeScenes ?? []).flatMap((sc) =>
        [...sc.shots]
          .sort((a, b) => a.number - b.number)
          .map((sh) => ({
            id: sh.id,
            sceneNumber: sc.number,
            number: sh.number,
            dialogue: sh.dialogue ?? null,
            audioCues: (sh.audioCues ?? []).map((c) => ({
              kind: c.kind,
              label: c.label,
              voiceUrl: c.voiceUrl,
              voiceDurationMs: c.voiceDurationMs,
              voiceActor: c.voiceActor,
              voiceStateLabel: c.voiceStateLabel,
            })),
          })),
      ),
    [episodeScenes],
  );

  // stored-take queues per arc card: single arcs get their own queue,
  // ensemble clusters get a merged story-order queue (Play beat) and
  // every member keeps a solo queue
  const takesByKey = useMemo(() => {
    const map = new Map<string, ArcTakeItem[]>();
    for (const card of arcCards) {
      if (card.kind === "single") {
        const k = arcKey(card.arc);
        if (!map.has(k)) map.set(k, buildArcTakes(card.arc, playbackShots));
      } else {
        for (const a of card.arcs) {
          const k = arcKey(a);
          if (!map.has(k)) map.set(k, buildArcTakes(a, playbackShots));
        }
        const ensKey = `beat:${card.arcs.map((a) => a.speakerKey).join(":")}`;
        map.set(ensKey, mergeArcTakes(card.arcs, playbackShots));
      }
    }
    return map;
  }, [arcCards, playbackShots]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patchShot({
        id: shot.id,
        artistId: artistId,
        loraId: loraId,
        loraStrength: loraId ? strength : null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save panel assignment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-lg max-h-[85vh] overflow-y-auto studio-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Panel inspector - shot {String(shot.number).padStart(3, "0")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground line-clamp-2">
            {shot.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── State arcs (span view across the episode) ── */}
          {episodeScenes && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs">
                <Route className="h-3.5 w-3.5 text-primary" /> State arcs
              </Label>
              {arcCards.length === 0 ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  No state arc touches this shot. Stamp one from the dialogue editor (the State row&apos;s arrow buttons) or ask DSH for set_state_arc; arcs force the state&apos;s variant voice, speed/pitch hints and register on every line they cover.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {arcCards.map((card) =>
                    card.kind === "single" ? (
                      <InspectorArcCard
                        key={arcKey(card.arc)}
                        a={card.arc}
                        shotDialogue={shot.dialogue}
                        takeCount={takesByKey.get(arcKey(card.arc))?.length ?? 0}
                        playing={arcPlayKey === arcKey(card.arc)}
                        onPlay={() => void playArcTakes(arcKey(card.arc), takesByKey.get(arcKey(card.arc)) ?? [])}
                        onStop={stopArcPlayback}
                      />
                    ) : (
                      <div
                        key={`ens:${card.arcs.map((a) => a.speakerKey).join(":")}`}
                        className="rounded-lg border border-teal-400/30 bg-teal-400/[0.05] p-2 space-y-1.5"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1 rounded-sm text-[8px] font-bold tracking-widest uppercase bg-teal-400/25 text-teal-200">ensemble beat</span>
                          <span className="text-[10px] text-teal-200/80">
                            {card.size} speaker{card.size === 1 ? "" : "s"} in parallel · {card.arcs.length} arc{card.arcs.length === 1 ? "" : "s"} on this shot
                          </span>
                          {(() => {
                            const beatKey = `beat:${card.arcs.map((a) => a.speakerKey).join(":")}`;
                            const beatTakes = takesByKey.get(beatKey) ?? [];
                            return (
                              <span className="ml-auto flex items-center gap-1 shrink-0">
                                <span className="text-[9px] font-mono text-teal-200/70">
                                  {beatTakes.length} take{beatTakes.length === 1 ? "" : "s"} merged
                                </span>
                                <button
                                  onClick={arcPlayKey === beatKey ? stopArcPlayback : () => void playArcTakes(beatKey, beatTakes)}
                                  disabled={beatTakes.length === 0}
                                  title={beatTakes.length === 0
                                    ? "No rendered takes on this beat's lines yet"
                                    : arcPlayKey === beatKey
                                      ? "Stop the beat playback"
                                      : `Play the WHOLE beat: all ${card.arcs.length} speakers' takes merged in story order (${beatTakes.length} takes)`}
                                  className={cn(
                                    "h-6 rounded-md border px-2 text-[9px] font-bold flex items-center gap-1 transition-colors",
                                    beatTakes.length === 0
                                      ? "border-white/8 text-muted-foreground/40"
                                      : "border-teal-400/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20",
                                  )}
                                >
                                  {arcPlayKey === beatKey ? <Square className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
                                  play beat
                                </button>
                              </span>
                            );
                          })()}
                        </div>
                        {card.arcs.map((a) => (
                          <InspectorArcCard
                            key={arcKey(a)}
                            a={a}
                            shotDialogue={shot.dialogue}
                            inset
                            takeCount={takesByKey.get(arcKey(a))?.length ?? 0}
                            playing={arcPlayKey === arcKey(a)}
                            onPlay={() => void playArcTakes(arcKey(a), takesByKey.get(arcKey(a)) ?? [])}
                            onStop={stopArcPlayback}
                          />
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Artist assignment ── */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5 text-primary" /> Assigned artist
            </Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setArtistId(null)}
                className={cn(
                  "px-2.5 h-8 rounded-lg text-xs border transition-colors",
                  artistId === null
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
                )}
              >
                Unassigned
              </button>
              {artists.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setArtistId(a.id)}
                  title={a.role ?? a.name}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs border transition-colors",
                    artistId === a.id
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
                  )}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </button>
              ))}
              {artists.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Roster is empty - add artists from the Artists button in the toolbar.</p>
              )}
            </div>
            {artistId && (
              <p className="text-[11px] text-muted-foreground">
                {artists.find((a) => a.id === artistId)?.role ?? "Roster member"}
              </p>
            )}
          </div>

          {/* ── Style LoRA ── */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5 text-primary" /> Style LoRA fine-tuning
            </Label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto studio-scroll pr-1">
              <button
                onClick={() => setLoraId(null)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors",
                  loraId === null
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
                )}
              >
                Production style only (no adapter)
              </button>
              {loras.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLoraId(l.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                    loraId === l.id
                      ? "bg-primary/15 border-primary/30"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-xs font-medium", loraId === l.id ? "text-primary" : "text-foreground")}>{l.name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground">
                      w{l.weight.toFixed(2)} · {l._count?.shots ?? 0} shot{(l._count?.shots ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <code className="block mt-0.5 text-[9px] font-mono text-teal-200/80 truncate">{l.triggerPhrase}</code>
                </button>
              ))}
            </div>

            {loraId && selectedLora && (
              <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">Strength</Label>
                  <span className="text-xs font-mono tabular-nums text-primary">{strength.toFixed(2)}</span>
                </div>
                <Slider
                  value={[strength]}
                  min={0.1} max={1.2} step={0.05}
                  onValueChange={(v) => setStrength(v[0] ?? 0.8)}
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {strength >= 0.75 ? "≥ 0.75 - the adapter dominates the production style." : "Blends with the base production style."}
                </p>
                <div className="rounded border border-white/10 bg-black/40 p-2">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Injected into this shot&apos;s art prompt</div>
                  <p className="text-[10px] font-mono leading-relaxed text-teal-200/90 break-words">{directive}</p>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" className="h-8 border-white/12 bg-white/5" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-8" onClick={() => void save()} disabled={saving || artists.length + loras.length === 0}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save panel assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
