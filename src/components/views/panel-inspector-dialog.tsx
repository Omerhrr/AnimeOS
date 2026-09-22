"use client";

// Per-panel inspector: multi-artist assignment + per-shot style LoRA
// fine-tuning. The compiled LoRA directive shown here is the client
// mirror of src/lib/ai/art.ts → shotLoraDirective().

import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal, Users, Zap } from "lucide-react";
import { api, type ArtistRow, type ShotRow, type StyleLoraRow } from "@/lib/api-client";
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

export function PanelInspectorDialog({
  shot, artists, loras, open, onClose, onSaved,
}: {
  shot: ShotRow;
  artists: ArtistRow[];
  loras: StyleLoraRow[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [artistId, setArtistId] = useState<string | null>(shot.artistId ?? null);
  const [loraId, setLoraId] = useState<string | null>(shot.loraId ?? null);
  const [strength, setStrength] = useState<number>(shot.loraStrength ?? shot.lora?.weight ?? 0.8);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setArtistId(shot.artistId ?? null);
      setLoraId(shot.loraId ?? null);
      setStrength(shot.loraStrength ?? shot.lora?.weight ?? 0.8);
      setError(null);
    }
  }, [open, shot.artistId, shot.loraId, shot.loraStrength, shot.lora?.weight]);

  const selectedLora = loras.find((l) => l.id === loraId) ?? null;
  const directive = compileLoraDirective(selectedLora, loraId ? strength : null);

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
