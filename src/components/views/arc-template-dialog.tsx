"use client";

// ─────────────────────────────────────────────────────────────
// Reusable arc templates: pick a speaker, one of their development
// states, a shape and a target (one scene or the whole episode),
// preview the exact per-line result as a dry run, then paint it.
// The shape spans the WHOLE range (one arc across the beat, not a
// repeated mini-arc per shot). Beyond the built-ins (possession
// spread, full takeover, recovery arc) creators can build a custom
// segment layout and SAVE it as a production template: saved shapes
// join the registry here AND inside DSH (apply_arc_template and
// suggest_arc_template match them by name).
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Shapes, Trash2 } from "lucide-react";
import { api, type ArcTemplateRow } from "@/lib/api-client";
import { parseDialogue, serializeDialogue } from "@/lib/comic/dialogue";
import {
  ARC_TEMPLATES, applyArcTemplate, planTemplateAssignment,
  type ArcTemplate, type TemplateShotInput,
} from "@/lib/comic/arc-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface DialogShot { id: string; number: number; dialogue?: string | null }
interface DialogScene { id: string; number: number; title: string; shots: DialogShot[] }
interface DialogEpisode { id: string; number: number; title: string; scenes: DialogScene[] }

interface SpeakerState { label: string; episodeNumber: number | null; variantVoice: string | null }

const CUSTOM_ID = "__custom__";

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
  // production-saved templates, loaded when the dialog opens
  const [templates, setTemplates] = useState<ArcTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string>(ARC_TEMPLATES[0].id); // built-in slug, "user:<id>" or "__custom__"
  // custom shape editor: relative percents (normalized on use)
  const [customSegs, setCustomSegs] = useState<Array<{ pct: number; kind: "auto" | "state" }>>([
    { pct: 25, kind: "auto" }, { pct: 50, kind: "state" }, { pct: 25, kind: "auto" },
  ]);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [speaker, setSpeaker] = useState<string>("");
  const [stateLabel, setStateLabel] = useState<string>("");
  const [target, setTarget] = useState<string>("__episode__");

  const speakers = useMemo(
    () => characters.filter((c) => c.states.length > 0),
    [characters],
  );
  const activeSpeaker = speakers.find((c) => c.name === speaker) ?? null;

  // the effective shape: custom layout, a saved production template, or a built-in
  const template: ArcTemplate | null = useMemo(() => {
    if (templateId === CUSTOM_ID) {
      const segs = customSegs.filter((s) => s.pct > 0);
      if (segs.length === 0) return null;
      const total = segs.reduce((acc, s) => acc + s.pct, 0) || 1;
      return { id: CUSTOM_ID, name: "custom shape", description: "Your own segment layout", segments: segs.map((s) => ({ frac: s.pct / total, kind: s.kind })) };
    }
    const user = templates.find((t) => `user:${t.id}` === templateId);
    if (user) return { id: user.id, name: user.name, description: user.description ?? "", segments: user.segments };
    return ARC_TEMPLATES.find((t) => t.id === templateId) ?? ARC_TEMPLATES[0];
  }, [templateId, templates, customSegs]);

  const selectedSaved = templates.find((t) => `user:${t.id}` === templateId) ?? null;

  const openDialog = () => {
    setOpen(true);
    setError(null);
    void api
      .listArcTemplates(projectId)
      .then((rows) => setTemplates(rows))
      .catch(() => setTemplates([]));
  };

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
    if (!template) return { rows: [], speakerLines: 0, otherLines: 0 };
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

  const canApply = Boolean(speaker && stateLabel && template && preview.speakerLines > 0 && !busy);
  const canSave = Boolean(template && saveName.trim() && !saving);

  const apply = async () => {
    if (!canApply || !activeSpeaker || !template) return;
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

  const saveTemplate = async () => {
    if (!canSave || !template) return;
    setSaving(true);
    setError(null);
    try {
      const segs = template.segments.map((s) => ({ frac: Math.round(s.frac * 1000) / 1000, kind: s.kind }));
      const { id } = await api.createArcTemplate({ projectId, name: saveName.trim(), description: saveDesc.trim() || undefined, segments: segs });
      const rows = await api.listArcTemplates(projectId);
      setTemplates(rows);
      setTemplateId(`user:${id}`);
      setSaveName("");
      setSaveDesc("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the template");
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (row: ArcTemplateRow) => {
    if (!window.confirm(`Delete the saved template "${row.name}"? It disappears from this dialog and from DSH's registry.`)) return;
    setError(null);
    try {
      await api.deleteArcTemplate(row.id);
      const rows = await api.listArcTemplates(projectId);
      setTemplates(rows);
      if (templateId === `user:${row.id}`) setTemplateId(ARC_TEMPLATES[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the template");
    }
  };

  const setSegKind = (idx: number, kind: "auto" | "state") =>
    setCustomSegs((segs) => segs.map((s, i) => (i === idx ? { ...s, kind } : s)));
  const setSegPct = (idx: number, pct: number) =>
    setCustomSegs((segs) => segs.map((s, i) => (i === idx ? { ...s, pct } : s)));

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-[11px] border-violet-400/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20 print:hidden"
        onClick={openDialog}
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
                  <SelectGroup>
                    <SelectLabel className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Built-in shapes</SelectLabel>
                    {ARC_TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                    ))}
                  </SelectGroup>
                  {templates.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Production templates (saved)</SelectLabel>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={`user:${t.id}`} className="text-xs">{t.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Custom</SelectLabel>
                    <SelectItem value={CUSTOM_ID} className="text-xs">Custom shape (edit below)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {template && <ShapeBar template={template} stateLabel={stateLabel || "state"} />}
              {template && <p className="text-[10px] leading-snug text-muted-foreground">{template.description}</p>}
              {selectedSaved && (
                <div className="flex items-center justify-between rounded border border-violet-400/25 bg-violet-400/[0.06] px-2 py-1">
                  <span className="text-[10px] text-violet-200">
                    Saved on this production - DSH applies it by name and matches it against prose.
                  </span>
                  <Button
                    size="sm" variant="ghost"
                    className="h-5 w-5 p-0 text-rose-300 hover:bg-rose-400/10 hover:text-rose-200"
                    title={`Delete the saved template "${selectedSaved.name}"`}
                    onClick={() => void removeTemplate(selectedSaved)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {templateId === CUSTOM_ID && (
              <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/25 p-2.5">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  Segments - relative weights of the speaker&apos;s own lines
                </span>
                {customSegs.map((seg, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="flex overflow-hidden rounded border border-white/10">
                      <button
                        className={seg.kind === "auto" ? "bg-white/15 px-1.5 py-0.5 text-[9px] font-bold text-foreground" : "px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground hover:text-foreground"}
                        onClick={() => setSegKind(i, "auto")}
                        title="Auto segment: clears the override (episode-resolved state)"
                      >
                        auto
                      </button>
                      <button
                        className={seg.kind === "state" ? "bg-violet-500/80 px-1.5 py-0.5 text-[9px] font-bold text-white" : "px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground hover:text-foreground"}
                        onClick={() => setSegKind(i, "state")}
                        title="State segment: forces the chosen state (variant voice + hints)"
                      >
                        state
                      </button>
                    </div>
                    <input
                      type="number" min={1} max={100} value={seg.pct}
                      onChange={(e) => setSegPct(i, Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                      className="h-6 w-14 rounded border border-white/10 bg-white/5 px-1.5 text-center text-[10px]"
                    />
                    <span className="text-[10px] text-muted-foreground">%</span>
                    <Button
                      size="sm" variant="ghost"
                      className="ml-auto h-5 w-5 p-0 text-muted-foreground hover:text-rose-300"
                      disabled={customSegs.length <= 1}
                      onClick={() => setCustomSegs((segs) => segs.filter((_, k) => k !== i))}
                      title="Remove this segment"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm" variant="outline"
                  className="h-6 text-[10px] border-white/12 bg-white/5"
                  disabled={customSegs.length >= 6}
                  onClick={() => setCustomSegs((segs) => [...segs, { pct: 20, kind: "state" }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add segment
                </Button>
              </div>
            )}

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

            {/* save the current shape as a production template */}
            <div className="space-y-1.5 rounded-lg border border-violet-400/25 bg-violet-400/[0.05] p-2.5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-violet-200/90">Save this shape as a production template</span>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Saved shapes stay with this production: they appear in the Shape list above and inside DSH (apply_arc_template by name, suggest_arc_template matches them when you describe a beat in prose).
              </p>
              <div className="flex gap-1.5">
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Template name, e.g. corruption creep"
                  className="h-7 flex-1 bg-white/5 border-white/10 text-xs"
                />
                <Button size="sm" className="h-7" onClick={() => void saveTemplate()} disabled={!canSave}>
                  {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
              </div>
              <Input
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                placeholder="When does this shape fit? (optional, helps DSH match it to prose)"
                className="h-7 bg-white/5 border-white/10 text-xs"
              />
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
