"use client";

// ─────────────────────────────────────────────────────────────
// Reusable arc templates ("possession spread" and siblings):
// pick a speaker, one of their development states, a shape and a
// target (one scene or the whole episode), preview the exact
// per-line result as a dry run, then paint it. The shape spans the
// WHOLE range (one arc across the beat, not a repeated mini-arc
// per shot). DSH paints the same shapes through apply_arc_template.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Shapes } from "lucide-react";
import { api } from "@/lib/api-client";
import { parseDialogue, serializeDialogue } from "@/lib/comic/dialogue";
import {
  ARC_TEMPLATES, applyArcTemplate, planTemplateAssignment,
  type ArcTemplate, type TemplateShotInput,
} from "@/lib/comic/arc-templates";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface DialogShot { id: string; number: number; dialogue?: string | null }
interface DialogScene { id: string; number: number; title: string; shots: DialogShot[] }
interface DialogEpisode { id: string; number: number; title: string; scenes: DialogScene[] }

interface SpeakerState { label: string; episodeNumber: number | null; variantVoice: string | null }

/** A tiny stacked shape preview: one block per segment, violet = state, outlined = auto. */
function ShapeBar({ template, stateLabel }: { template: ArcTemplate; stateLabel: string | null }) {
  return (
    <div className="flex h-4 w-full overflow-hidden rounded border border-violet-400/30" title={template.description}>
      {template.segments.map((seg, i) => (
        <span
          key={i}
          className={seg.kind === "state" ? "flex items-center justify-center truncate bg-violet-500/80 px-1 text-[7px] font-bold tracking-wider text-white" : "flex items-center justify-center bg-white/10 px-1 text-[7px] font-bold tracking-wider text-muted-foreground"}
          style={{ flexGrow: seg.frac, flexBasis: 0 }}
        >
          {seg.kind === "state" ? (stateLabel ?? "state") : "auto"}
        </span>
      ))}
    </div>
  );
}

export function ArcTemplateDialog({ projectId, characters, episode }: { projectId: string; characters: Array<{ name: string; states: SpeakerState[] }>; episode: DialogEpisode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(ARC_TEMPLATES[0].id);
  const [speaker, setSpeaker] = useState<string>("");
  const [stateLabel, setStateLabel] = useState<string>("");
  const [target, setTarget] = useState<string>("__episode__");

  const speakers = useMemo(
    () => characters.filter((c) => c.states.length > 0),
    [characters],
  );
  const activeSpeaker = speakers.find((c) => c.name === speaker) ?? null;

  const template = ARC_TEMPLATES.find((t) => t.id === templateId) ?? ARC_TEMPLATES[0];

  // ordered shots of the target range (one scene, or the whole episode)
  const targetShots: DialogShot[] = useMemo(() => {
    if (target === "__episode__") {
      return [...episode.scenes]
        .sort((a, b) => a.number - b.number)
        .flatMap((sc) => [...sc.shots].sort((a, b) => a.number - b.number));
    }
    const sc = episode.scenes.find((s) => s.id === target);
    return sc ? [...sc.shots].sort((a, b) => a.number - b.number) : [];
  }, [episode.scenes, target]);

  // dry run: the exact per-line plan, computed live, nothing written
  const preview = useMemo(() => {
    const parsed = targetShots.map((sh) => ({ shotId: sh.id, lines: parseDialogue(sh.dialogue) }));
    const want = speaker.trim().toLowerCase();
    const positions: Array<{ shotIdx: number; lineIdx: number }> = [];
    parsed.forEach((p, si) => {
      p.lines.forEach((l, li) => {
        if (l.speaker && l.speaker.trim().toLowerCase() === want) positions.push({ shotIdx: si, lineIdx: li });
      });
    });
    const plan = planTemplateAssignment(positions.length, template);
    const rows = positions.map((pos, k) => ({
      shotNumber: targetShots[pos.shotIdx].number,
      text: parsed[pos.shotIdx].lines[pos.lineIdx].text,
      result: plan[k] === "state" ? (stateLabel || "state") : "auto",
    }));
    return { rows, speakerLines: positions.length, otherLines: parsed.reduce((n, p) => n + p.lines.length, 0) - positions.length };
  }, [targetShots, speaker, template, stateLabel]);

  const canApply = Boolean(speaker && stateLabel && preview.speakerLines > 0 && !busy);

  const apply = async () => {
    if (!canApply || !activeSpeaker) return;
    setBusy(true);
    setError(null);
    try {
      const parsed: TemplateShotInput[] = targetShots.map((sh) => ({ shotId: sh.id, lines: parseDialogue(sh.dialogue) }));
      const [results] = applyArcTemplate(parsed, activeSpeaker.name, template, stateLabel);
      for (let i = 0; i < results.length; i += 1) {
        if (!results[i].changed) continue;
        await api.patchShot({ id: results[i].shotId, dialogue: serializeDialogue(results[i].lines) });
      }
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply the arc template");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-[11px] border-violet-400/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20 print:hidden"
        onClick={() => { setOpen(true); setError(null); }}
      >
        <Shapes className="h-3 w-3 mr-1" /> Arc templates
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-lg max-h-[85vh] overflow-y-auto studio-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shapes className="h-4 w-4 text-violet-300" />
              Arc templates - Ep{String(episode.number).padStart(2, "0")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              A reusable beat shape painted onto one speaker&apos;s lines across the range: auto lines keep the episode-resolved state, state lines perform with the chosen state&apos;s variant voice and hints. The shape stretches over any beat length; nothing is written until you hit Apply.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Shape</span>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="studio-root bg-[#12121a] border-white/10">
                  {ARC_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ShapeBar template={template} stateLabel={stateLabel || "state"} />
              <p className="text-[10px] leading-snug text-muted-foreground">{template.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Speaker</span>
                <Select value={speaker} onValueChange={(v) => { setSpeaker(v); setStateLabel(""); }}>
                  <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue placeholder="Pick a character" /></SelectTrigger>
                  <SelectContent className="studio-root bg-[#12121a] border-white/10">
                    {speakers.map((c) => (
                      <SelectItem key={c.name} value={c.name} className="text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">State (drives the violet runs)</span>
                <Select value={stateLabel} onValueChange={setStateLabel} disabled={!activeSpeaker}>
                  <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue placeholder={activeSpeaker ? "Pick a state" : "Pick a speaker first"} /></SelectTrigger>
                  <SelectContent className="studio-root bg-[#12121a] border-white/10">
                    {(activeSpeaker?.states ?? []).map((s) => (
                      <SelectItem key={s.label} value={s.label} className="text-xs">
                        {s.label}{s.episodeNumber != null ? ` · Ep${s.episodeNumber}` : ""}{s.variantVoice ? ` · ${s.variantVoice}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Target range</span>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="studio-root bg-[#12121a] border-white/10">
                  <SelectItem value="__episode__" className="text-xs">Whole episode (all scenes)</SelectItem>
                  {[...episode.scenes].sort((a, b) => a.number - b.number).map((sc) => (
                    <SelectItem key={sc.id} value={sc.id} className="text-xs">
                      Sc{String(sc.number).padStart(2, "0")} only - {sc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* dry-run preview */}
            <div className="rounded-lg border border-white/10 bg-black/25 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Dry run - {preview.speakerLines} line{preview.speakerLines === 1 ? "" : "s"} of {speaker || "…"}{preview.otherLines > 0 ? `, ${preview.otherLines} other line${preview.otherLines === 1 ? "" : "s"} untouched` : ""}</span>
              </div>
              {speaker && preview.speakerLines === 0 && (
                <p className="text-[10px] text-amber-300">{speaker} has no lines in this range - widen the target or pick another speaker.</p>
              )}
              <div className="space-y-0.5 max-h-40 overflow-y-auto studio-scroll pr-1">
                {preview.rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono rounded border border-white/8 bg-black/25 px-2 py-0.5">
                    <span className="text-muted-foreground shrink-0">S{String(r.shotNumber).padStart(3, "0")}</span>
                    <span className="text-muted-foreground truncate flex-1">&quot;{r.text}&quot;</span>
                    <span className={r.result === "auto" ? "text-neutral-400 shrink-0" : "text-violet-300 font-bold shrink-0"}>{r.result}</span>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-[11px] text-rose-300">{error}</p>}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" className="h-8 border-white/12 bg-white/5" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" className="h-8" onClick={() => void apply()} disabled={!canApply}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Apply template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
