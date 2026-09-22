"use client";

// Per-episode voice direction diff. A take is only as current as
// the direction it was made with: this board re-resolves what every
// VOICE cue in the episode WOULD render as today (delivery chain,
// cast, line text) and diffs it against the snapshot stamped on the
// take at render time. One click re-renders only the stale takes -
// a single state beat or line-level delivery edit never re-renders
// the whole episode.

import { useCallback, useEffect, useState } from "react";
import { GitCompare, Loader2, RefreshCcwDot } from "lucide-react";
import { api, type VoiceDiffEpisode, type VoiceDiffRow } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STATUS_META: Record<VoiceDiffRow["status"], { label: string; cls: string }> = {
  fresh: { label: "fresh", cls: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10" },
  stale: { label: "stale", cls: "text-amber-300 border-amber-400/30 bg-amber-400/10" },
  unrendered: { label: "no take", cls: "text-muted-foreground border-white/15 bg-white/5" },
  blocked: { label: "blocked", cls: "text-rose-300 border-rose-400/30 bg-rose-400/10" },
};

export function VoiceDiffDialog({
  episode,
}: {
  episode: { id: string; number: number; title: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [diff, setDiff] = useState<VoiceDiffEpisode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!episode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.voiceDiff(episode.id);
      setDiff(res.episodes[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to diff direction");
    } finally {
      setLoading(false);
    }
  }, [episode]);

  useEffect(() => {
    if (open) {
      setResult(null);
      void load();
    }
  }, [open, load]);

  async function reRenderStale() {
    if (!episode) return;
    setRerendering(true);
    setResult(null);
    try {
      const res = await api.reRenderStaleVoices(episode.id);
      setResult(res.summary);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-render failed");
    } finally {
      setRerendering(false);
    }
  }

  const stale = diff?.stale ?? 0;

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
        disabled={!episode}
        onClick={() => setOpen(true)}
        title="Diff every voice take against the current direction and re-render only what moved"
      >
        <GitCompare className="h-3 w-3 mr-1" /> Direction diff
        {stale > 0 && (
          <span className="ml-1 rounded-sm bg-amber-400/25 px-1 text-[8px] font-bold tracking-widest text-amber-300">{stale}</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-2xl max-h-[85vh] overflow-y-auto studio-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-primary" /> Direction diff
              {diff && <span className="text-xs font-normal text-muted-foreground">Episode {String(diff.number).padStart(2, "0")} · {diff.title}</span>}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Every take keeps a snapshot of its inputs (text, voice, delivery, speed). Stale takes no longer match today&apos;s direction - re-render touches only those.
            </DialogDescription>
          </DialogHeader>

          {diff && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{diff.total} VOICE cue{diff.total === 1 ? "" : "s"}</span>
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">{diff.fresh} fresh</span>
              <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">{diff.stale} stale</span>
              <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{diff.unrendered} no take</span>
              <Button
                size="sm" className="h-7 ml-auto text-[11px]"
                onClick={() => void reRenderStale()}
                disabled={rerendering || loading || stale === 0}
                title={stale === 0 ? "Nothing to re-render - every take matches the current direction" : `Re-render ${stale} stale take(s) only`}
              >
                {rerendering ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Re-rendering…</> : <><RefreshCcwDot className="h-3 w-3 mr-1" /> Re-render affected ({stale})</>}
              </Button>
            </div>
          )}

          <div className="space-y-1.5 max-h-80 overflow-y-auto studio-scroll pr-1">
            {loading && (
              <p className="flex items-center gap-2 py-4 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving direction…</p>
            )}
            {!loading && diff?.cues.length === 0 && (
              <p className="py-4 text-[11px] text-muted-foreground">No VOICE cues in this episode - score dialogue on a shot&apos;s motion timeline first.</p>
            )}
            {!loading && diff?.cues.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <div key={row.cueId} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-sm bg-white/10 px-1 py-0.5 text-[8px] font-mono font-bold tracking-wider text-foreground/80">
                      {String(row.shotNumber).padStart(3, "0")}
                    </span>
                    <span className={cn("shrink-0 rounded-sm border px-1 py-0.5 text-[8px] font-bold tracking-widest uppercase", meta.cls)}>{meta.label}</span>
                    <span className="text-[11px] font-medium text-foreground truncate">{row.speaker || "narration"}</span>
                    <span className="text-[10px] text-muted-foreground truncate flex-1">{row.text}</span>
                  </div>
                  <div className="mt-1 pl-1 text-[10px] leading-relaxed">
                    {row.status === "stale" && (
                      <p className="text-amber-200/90">
                        moved: {row.changed.join(", ")}
                        {row.taken && (
                          <span className="text-muted-foreground">
                            {" "}· was {row.taken.deliveryId.toLowerCase()} x{row.taken.baseSpeed.toFixed(2)} · {row.taken.voiceId}
                          </span>
                        )}
                      </p>
                    )}
                    {row.current ? (
                      <p className="text-muted-foreground">
                        now: {row.current.deliveryLabel.toLowerCase()}
                        <span className="font-mono">
                          {row.current.source === "line" ? " (line delivery)" : row.current.source === "direction" ? " (standing)" : row.current.source === "auto" ? " (state)" : " (manual)"}
                          {row.current.stateLabel ? ` · ${row.current.stateLabel}` : ""}
                          {" "}· x{row.current.effectiveSpeed.toFixed(2)} · {row.current.voiceId}
                        </span>
                        {row.current.castArtistName && <span className="text-cyan-300/80"> · cast {row.current.castArtistName}</span>}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">direction unresolved (empty speakable text)</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {result && <p className="text-[11px] text-cyan-300">{result}</p>}
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
