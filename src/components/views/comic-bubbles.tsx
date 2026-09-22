"use client";

// Speech bubbles and the dialogue editor for Comic Mode panels.

import { useEffect, useState } from "react";
import { MessageSquarePlus, Plus, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import {
  BUBBLE_KINDS, bubbleSpots, serializeDialogue,
  type BubbleKind, type BubbleSpot, type DialogueLine,
} from "@/lib/comic/dialogue";
import { DELIVERIES, type DeliveryId } from "@/lib/comic/delivery";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function BubbleTail({ kind, spot, rtl, ink }: { kind: BubbleKind; spot: BubbleSpot; rtl: boolean; ink: string }) {
  if (kind === "SFX") return null;
  const tailLeft = spot.tail === "bl" ? "14%" : "70%";
  const pos = rtl
    ? { right: tailLeft, bottom: "-5px" }
    : { left: tailLeft, bottom: "-5px" };
  if (kind === "THOUGHT") {
    return (
      <span aria-hidden>
        <span className="absolute h-1.5 w-1.5 rounded-full border" style={{ ...pos, background: "#fff", borderColor: ink }} />
        <span className="absolute h-1 w-1 rounded-full border" style={{ ...(rtl ? { right: `calc(${tailLeft} + 6px)` } : { left: `calc(${tailLeft} + 6px)` }), bottom: "-10px", background: "#fff", borderColor: ink }} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="absolute h-2 w-2 rotate-45 border-b border-r"
      style={{ ...pos, background: "#fff", borderColor: ink }}
    />
  );
}

export function SpeechBubbles({ lines, rtl, ink }: { lines: DialogueLine[]; rtl: boolean; ink: string }) {
  // RTL mirroring happens in the style switch below (right: instead of left:) -
  // mirroring the spot values as well would double-flip and push bubbles off-panel.
  const spots = bubbleSpots(lines.length);
  return (
    <>
      {lines.map((line, i) => {
        const spot = spots[i] ?? spots[spots.length - 1];
        if (!spot) return null;
        if (line.kind === "SFX") {
          return (
            <span
              key={i}
              className="pointer-events-none absolute z-20 select-none whitespace-nowrap text-[13px] font-black italic tracking-wider"
              style={{
                top: spot.top,
                [rtl ? "right" : "left"]: spot.left,
                color: ink,
                transform: `rotate(${rtl ? 6 : -7}deg)`,
                textShadow: "0 0 2px #fff, 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff",
              }}
            >
              {line.text}
            </span>
          );
        }
        return (
          <div
            key={i}
            className="pointer-events-none absolute z-20"
            style={{ top: spot.top, [rtl ? "right" : "left"]: spot.left, maxWidth: "58%" }}
          >
            <div
              className="relative rounded-xl px-1.5 py-1 text-[9px] leading-snug text-neutral-900"
              style={{
                background: "#fff",
                border: line.kind === "THOUGHT" ? `1.5px dashed ${ink}` : `1.5px solid ${ink}`,
                borderRadius: line.kind === "THOUGHT" ? "14px 14px 14px 4px" : "12px",
              }}
            >
              {line.speaker && (
                <span className="mb-0.5 block text-[7.5px] font-bold uppercase tracking-widest" style={{ color: "#6b6355" }}>
                  {line.speaker}
                </span>
              )}
              {line.text}
              <BubbleTail kind={line.kind} spot={spot} rtl={rtl} ink={ink} />
            </div>
          </div>
        );
      })}
    </>
  );
}

export function DialogueEditor({
  shot,
  characterNames,
  open,
  onClose,
  onSaved,
}: {
  shot: { id: string; number: number; dialogue?: string | null; artworkUrl?: string | null };
  characterNames: string[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lines, setLines] = useState<DialogueLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLines(parseSafe(shot.dialogue));
      setError(null);
    }
  }, [open, shot.dialogue]);

  const update = (i: number, patch: Partial<DialogueLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const dialogue = lines.length === 0 ? "" : serializeDialogue(lines);
      await api.patchShot({ id: shot.id, dialogue });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dialogue");
    } finally {
      setSaving(false);
    }
  };

  const removeArt = async () => {
    setSaving(true);
    try {
      await api.patchShot({ id: shot.id, artworkUrl: null });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove art");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-lg max-h-[85vh] overflow-y-auto studio-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-primary" />
            Dialogue - Shot {String(shot.number).padStart(3, "0")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Bubbles render on every comic format. Order = reading order; 8 lines max. Per-line delivery directs voice takes line by line inside the shot (auto = state-aware).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2.5 space-y-2">
              <div className="flex gap-2">
                <Input
                  list="comic-speakers"
                  value={line.speaker}
                  onChange={(e) => update(i, { speaker: e.target.value })}
                  placeholder="Speaker (optional)"
                  className="h-8 bg-white/5 border-white/10 text-xs"
                />
                <Select value={line.kind} onValueChange={(v) => update(i, { kind: v as BubbleKind })}>
                  <SelectTrigger className="w-[110px] h-8 bg-white/5 border-white/10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="studio-root bg-[#12121a] border-white/10">
                    {BUBBLE_KINDS.map((k) => (
                      <SelectItem key={k.id} value={k.id} className="text-xs">{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon" variant="outline"
                  className="h-8 w-8 shrink-0 border-white/10 bg-white/5 hover:bg-rose-500/15 hover:text-rose-300"
                  onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                  aria-label="Remove line"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={line.text}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder={line.kind === "SFX" ? "WHAM! / SHAA- / rumble…" : "What is said…"}
                rows={2}
                className="bg-white/5 border-white/10 text-xs resize-none"
              />
              {/* line-level delivery: each line inside the shot can play in its own register */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground shrink-0">Delivery</span>
                <Select
                  value={line.delivery ?? "AUTO"}
                  onValueChange={(v) => update(i, { delivery: v === "AUTO" ? null : (v as DeliveryId) })}
                >
                  <SelectTrigger className="h-7 flex-1 bg-white/5 border-white/10 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="studio-root bg-[#12121a] border-white/10">
                    <SelectItem value="AUTO" className="text-[11px]">Auto · state-aware</SelectItem>
                    {DELIVERIES.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-[11px]">{d.label} · {d.blurb}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}

          <datalist id="comic-speakers">
            {characterNames.map((n) => <option key={n} value={n} />)}
          </datalist>

          {lines.length < 8 && (
            <Button
              variant="outline" size="sm"
              className="h-8 border-white/12 bg-white/5 text-xs"
              onClick={() => setLines((ls) => [...ls, { speaker: "", text: "", kind: "SPEECH" }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          )}

          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {shot.artworkUrl && (
            <Button
              variant="outline" size="sm"
              className="mr-auto h-8 border-white/12 bg-white/5 text-[11px] text-rose-300 hover:bg-rose-500/15"
              onClick={removeArt} disabled={saving}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Remove panel art
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 border-white/12 bg-white/5" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-8" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save dialogue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseSafe(raw: string | null | undefined): DialogueLine[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.map((l) => ({
      speaker: typeof l?.speaker === "string" ? l.speaker : "",
      text: typeof l?.text === "string" ? l.text : "",
      kind: (["SPEECH", "THOUGHT", "SFX"].includes(l?.kind) ? l.kind : "SPEECH") as BubbleKind,
      delivery: DELIVERIES.some((d) => d.id === l?.delivery) ? (l.delivery as DeliveryId) : null,
    }));
  } catch {
    return [];
  }
}
