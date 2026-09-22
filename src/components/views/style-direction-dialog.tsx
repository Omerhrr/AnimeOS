"use client";

// Per-production art style tuning — the compiled tokens from this
// dialog are injected into every future panel-art and model-sheet
// prompt (server-side in src/lib/ai/art.ts). DSH can tune the same
// fields via the set_art_style tool.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Palette, RotateCcw } from "lucide-react";
import { api, type StudioProject } from "@/lib/api-client";
import { STYLE_PRESETS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Client mirror of the server-side productionStyleTokens compile. */
function compileStyle(p: { visualStyle: string; artStylePrompt: string; artPalettePrompt: string }, presetToken: string) {
  return [p.artStylePrompt.trim() || presetToken, p.artPalettePrompt.trim()].filter(Boolean).join(", ");
}

const PRESET_TOKENS: Record<string, string> = {
  DONGHUA: "cinematic Chinese donghua art style, xianxia aesthetic, flowing robes, ink-wash influenced atmosphere, jade-teal and gold palette",
  ANIME: "Japanese anime art style, cel shading, crisp linework, expressive eyes, vibrant but controlled palette",
  KOREAN: "Korean manhwa art style, sleek line art, soft dramatic shading, modern fantasy mood",
  WESTERN: "stylized western animation art style, bold graphic shapes, expressive character design",
  CUSTOM: "consistent custom production art style, coherent character design language",
};

export function StyleDirectionDialog({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState("");
  const [palette, setPalette] = useState("");
  const [negative, setNegative] = useState("");

  useEffect(() => {
    if (open) {
      setStyle(project.artStylePrompt ?? "");
      setPalette(project.artPalettePrompt ?? "");
      setNegative(project.artNegativePrompt ?? "");
      setError(null);
    }
  }, [open, project.artStylePrompt, project.artPalettePrompt, project.artNegativePrompt]);

  const preset = STYLE_PRESETS[project.visualStyle];
  const presetToken = PRESET_TOKENS[project.visualStyle] ?? PRESET_TOKENS.CUSTOM;
  const usingCustom = style.trim().length > 0;

  const compiled = compileStyle({ visualStyle: project.visualStyle, artStylePrompt: style, artPalettePrompt: palette }, presetToken);
  const compiledNegative = ["no text, no speech bubbles, no captions, no watermark, no border, no panel frame", negative.trim()].filter(Boolean).join(", ");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateProject(project.id, {
        artStylePrompt: style,
        artPalettePrompt: palette,
        artNegativePrompt: negative,
      });
      await qc.invalidateQueries({ queryKey: ["project", project.id] });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save style direction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
        onClick={() => setOpen(true)}
      >
        <Palette className="h-3 w-3 mr-1" /> Style direction
        {usingCustom && <span className="ml-1 rounded-sm bg-primary/20 px-1 text-[8px] font-bold tracking-widest text-primary">CUSTOM</span>}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-xl max-h-[85vh] overflow-y-auto studio-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Art style direction
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Tune how every art prompt in “{project.title}” is compiled. Base preset:{" "}
              <b className="text-foreground">{preset?.label ?? project.visualStyle}</b>
              {preset ? ` — ${preset.vibe}` : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Custom style directive <span className="text-muted-foreground font-normal">(overrides the preset tokens when set)</span></Label>
              <Textarea
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                rows={2}
                placeholder="e.g. wuxia ink-wash style, gold rim lighting, misty mountain atmosphere, painterly brushwork"
                className="bg-white/5 border-white/10 text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Palette tokens</Label>
              <Input
                value={palette}
                onChange={(e) => setPalette(e.target.value)}
                placeholder="e.g. jade green, ink black, warm gold highlights"
                className="bg-white/5 border-white/10 text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Extra negative tokens</Label>
              <Input
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
                placeholder="e.g. no modern clothing, no western architecture"
                className="bg-white/5 border-white/10 text-xs"
              />
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Compiled into every prompt</div>
              <p className="text-[11px] font-mono leading-relaxed text-teal-200/90 break-words">{compiled}</p>
              <p className="text-[11px] font-mono leading-relaxed text-rose-200/70 break-words mt-1">negative: {compiledNegative}</p>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Applies to all new panel art and model sheets in this production — existing artwork is unchanged until regenerated.
              DSH can also tune this direction itself via its <span className="font-mono text-[10px]">set_art_style</span> tool.
            </p>
            {error && <p className="text-[11px] text-rose-300">{error}</p>}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline" size="sm"
              className="mr-auto h-8 border-white/12 bg-white/5 text-[11px]"
              onClick={() => { setStyle(""); setPalette(""); setNegative(""); }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Reset fields
            </Button>
            <Button variant="outline" size="sm" className="h-8 border-white/12 bg-white/5" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" className="h-8" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Save style direction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
