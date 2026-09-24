"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, User, Users, Swords, Crown, Skull, Sparkles, Copy, Ghost, RefreshCcw,
  ChevronRight, Wand2, Loader2, IdCard, AudioLines,
} from "lucide-react";
import { api, parseStringArray, type CharacterFull, type StudioProject } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { VOICES } from "@/lib/comic/voice-catalog";
import { POSES, poseChip } from "@/lib/animation/poses";
import { SectionHeader } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ROLE_ICONS: Record<string, typeof User> = {
  PROTAGONIST: Sparkles,
  RIVAL: Swords,
  MENTOR: Crown,
  ANTAGONIST: Skull,
  SUPPORTING: User,
};

const DERIV_ICONS: Record<string, typeof Copy> = {
  CLONE: Copy,
  AVATAR: Ghost,
  REINCARNATION: RefreshCcw,
  POSSESSION: Ghost,
  DISGUISE: Copy,
  TRANSFORMATION: Wand2,
};

function CreateCharacterDialog() {
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", role: "SUPPORTING", age: "", personality: "", backstory: "", abilities: "" });

  async function create() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.createCharacter({
        projectId,
        name: form.name,
        role: form.role,
        age: form.age || undefined,
        personality: form.personality || undefined,
        backstory: form.backstory || undefined,
        abilities: form.abilities ? form.abilities.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setOpen(false);
      setForm({ name: "", role: "SUPPORTING", age: "", personality: "", backstory: "", abilities: "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> New character</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto studio-scroll bg-card">
        <DialogHeader><DialogTitle>Create character</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white/5 border-white/12" placeholder="Lin Yue" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="h-9 rounded-md bg-white/5 border border-white/12 px-3 text-sm">
                {["PROTAGONIST", "RIVAL", "MENTOR", "ANTAGONIST", "SUPPORTING"].map((r) => (
                  <option key={r} value={r} className="bg-card">{r}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Age</Label>
              <Input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="bg-white/5 border-white/12" placeholder="16" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Personality</Label>
            <Textarea value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} className="bg-white/5 border-white/12 min-h-[54px]" />
          </div>
          <div className="grid gap-1.5">
            <Label>Backstory</Label>
            <Textarea value={form.backstory} onChange={(e) => setForm({ ...form, backstory: e.target.value })} className="bg-white/5 border-white/12 min-h-[54px]" />
          </div>
          <div className="grid gap-1.5">
            <Label>Abilities (comma-separated)</Label>
            <Input value={form.abilities} onChange={(e) => setForm({ ...form, abilities: e.target.value })} className="bg-white/5 border-white/12" placeholder="Basic Swordsmanship, Azure Flame" />
          </div>
          <Button onClick={create} disabled={busy || !form.name.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create character
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// tiny helper to read projectId from store inside dialog

/** State voice performance: variant voice + speed/pitch hints. While the
 * state is episode-effective, lines perform with this voice at this pace
 * and pitch, and the direction diff flags takes rendered before a change. */
const SPEED_HINTS = ["0.8", "0.85", "0.9", "0.95", "1.05", "1.1", "1.15", "1.2"];
const PITCH_HINTS = ["0.75", "0.8", "0.9", "1.1", "1.2", "1.3"];

function StateVoiceVariantSelect({ state }: { state: CharacterFull["states"][number] }) {
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [busy, setBusy] = useState(false);
  const patch = (p: { voiceVariant?: string; speedHint?: number | null; pitchHint?: number | null }) => {
    setBusy(true);
    void api.patchCharacterState(state.id, p)
      .then(() => qc.invalidateQueries({ queryKey: ["project", projectId] }))
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Variant voice</span>
        <select
          value={state.voiceVariant ?? ""}
          disabled={busy}
          onChange={(e) => patch({ voiceVariant: e.target.value })}
          title="While this state is episode-effective, the character's lines perform with this voice instead of the cast artist's voice; the direction diff flags older takes stale"
          className="h-6 flex-1 rounded-md bg-white/5 border border-white/12 px-1.5 text-[10px]"
        >
          <option value="" className="bg-card">Auto (cast voice)</option>
          {VOICES.map((v) => (
            <option key={v.id} value={v.id} className="bg-card">{v.id} - {v.blurb}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Speed hint</span>
        <select
          value={state.speedHint != null ? String(state.speedHint) : ""}
          disabled={busy}
          onChange={(e) => patch({ speedHint: e.target.value === "" ? null : Number(e.target.value) })}
          title="While this state is effective, takes render at this multiple of the base speed; changing it flags older takes stale"
          className="h-6 w-20 rounded-md bg-white/5 border border-white/12 px-1.5 text-[10px]"
        >
          <option value="" className="bg-card">Auto</option>
          {SPEED_HINTS.map((s) => (
            <option key={s} value={s} className="bg-card">x{s}</option>
          ))}
        </select>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Pitch hint</span>
        <select
          value={state.pitchHint != null ? String(state.pitchHint) : ""}
          disabled={busy}
          onChange={(e) => patch({ pitchHint: e.target.value === "" ? null : Number(e.target.value) })}
          title="While this state is effective, takes bend playback pitch by this factor (below 1 reads deeper, above 1 higher); changing it flags older takes stale"
          className="h-6 w-20 rounded-md bg-white/5 border border-white/12 px-1.5 text-[10px]"
        >
          <option value="" className="bg-card">Natural</option>
          {PITCH_HINTS.map((s) => (
            <option key={s} value={s} className="bg-card">{Number(s) < 1 ? "deep" : "high"} x{s}</option>
          ))}
        </select>
        {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

/**
 * State pose preset: the start/end pair the character PERFORMS while
 * this state is episode-effective. Shots featuring the character
 * inherit it via applyStatePoses - the development state changes HOW
 * a pose is performed. "Library" re-resolves the preset from the
 * label (e.g. furious lands STANCE -> LUNGE).
 */
function StatePosePresetSelect({ state }: { state: CharacterFull["states"][number] }) {
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [busy, setBusy] = useState(false);
  const patch = (p: { poseStart?: string; poseEnd?: string; auto?: boolean }) => {
    setBusy(true);
    void api.patchCharacterState(state.id, p)
      .then(() => qc.invalidateQueries({ queryKey: ["project", projectId] }))
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-muted-foreground" title="The body language this state performs: shots featuring the character inherit the pair via Use state poses (panel inspector) or applyStatePoses (shots API)">
          Pose preset
        </span>
        <select
          value={state.poseStart ?? ""}
          disabled={busy}
          onChange={(e) => patch({ poseStart: e.target.value })}
          title="Start pose of this state's performance"
          className="h-6 w-[104px] rounded-md bg-white/5 border border-white/12 px-1.5 text-[10px]"
        >
          <option value="" className="bg-card">Start: none</option>
          {POSES.map((p) => (
            <option key={p} value={p} className="bg-card">{p}</option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground">-&gt;</span>
        <select
          value={state.poseEnd ?? ""}
          disabled={busy}
          onChange={(e) => patch({ poseEnd: e.target.value })}
          title="End pose of this state's performance"
          className="h-6 w-[104px] rounded-md bg-white/5 border border-white/12 px-1.5 text-[10px]"
        >
          <option value="" className="bg-card">End: none</option>
          {POSES.map((p) => (
            <option key={p} value={p} className="bg-card">{p}</option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() => patch({ auto: true })}
          title="Apply the library preset resolved from this state's label (e.g. furious lands STANCE -> LUNGE)"
          className="h-6 shrink-0 rounded-md border border-teal-400/25 bg-teal-400/10 px-1.5 text-[9px] font-semibold text-teal-200 hover:bg-teal-400/20 transition-colors disabled:opacity-40"
        >
          Library
        </button>
        {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {(state.poseStart || state.poseEnd) && (
        <p className="text-[9px] text-teal-200/70 truncate">
          body language: {poseChip(state.poseStart, state.poseEnd)} - lands on shots via Use state poses
        </p>
      )}
    </div>
  );
}

function CharacterSheet({
  character, project, onGenerateSheet, sheetBusy,
}: {
  character: CharacterFull;
  project: StudioProject;
  onGenerateSheet: (id: string) => void;
  sheetBusy: boolean;
}) {
  const abilities = parseStringArray(character.abilities);
  const animLib = parseStringArray(character.animationLib);
  const Icon = ROLE_ICONS[character.role ?? "SUPPORTING"] ?? User;
  const parent = project.characters.find((c) => c.id === character.parentId);

  return (
    <SheetContent className="w-full sm:max-w-lg overflow-y-auto studio-scroll bg-card border-white/10">
      <SheetHeader className="pb-0">
        <SheetTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/12 border border-primary/25 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            {character.name}
            {character.derivativeType && (
              <Badge variant="outline" className="ml-2 text-[10px] border-violet-400/40 text-violet-300">
                {character.derivativeType}
              </Badge>
            )}
          </div>
        </SheetTitle>
        <p className="text-xs text-muted-foreground">
          {character.role ?? "Cast"}{character.age ? ` · ${character.age}` : ""}
          {parent && ` · derived from ${parent.name}`}
        </p>
      </SheetHeader>

      <div className="px-4 pb-6 space-y-5 text-sm">
        {/* Model sheet - the casting-consistency reference (§16) */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <IdCard className="h-3.5 w-3.5" /> Model sheet
            </h4>
            <Button
              size="sm" variant="outline"
              className="h-7 text-[11px] border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              disabled={sheetBusy}
              onClick={() => onGenerateSheet(character.id)}
            >
              {sheetBusy
                ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Generating…</>
                : <><Sparkles className="h-3 w-3 mr-1.5" /> {character.modelSheetUrl ? "Regenerate" : "Generate"}</>}
            </Button>
          </div>
          {character.modelSheetUrl ? (
            <figure className="overflow-hidden rounded-lg border border-white/12">
              <img
                src={character.modelSheetUrl}
                alt={`${character.name} model sheet`}
                className="aspect-square w-full object-cover"
              />
              <figcaption className="bg-white/5 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                Turnaround reference - injected as the canonical visual anchor into every panel featuring {character.name}.
              </figcaption>
            </figure>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              No sheet yet. Generating one creates a turnaround reference image and stores the canonical visual anchor that keeps {character.name}&apos;s face and wardrobe consistent across every panel and episode.
            </p>
          )}
          {character.modelSheetPrompt && (
            <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Canonical visual anchor</div>
              <p className="text-[11px] font-mono leading-relaxed text-teal-200/90">{character.modelSheetPrompt}</p>
            </div>
          )}
        </section>

        {character.personality && (
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Personality</h4>
            <p className="text-[13px] leading-relaxed">{character.personality}</p>
          </section>
        )}
        {character.backstory && (
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Backstory</h4>
            <p className="text-[13px] leading-relaxed">{character.backstory}</p>
          </section>
        )}

        {/* Development states - §18 */}
        <section>
          <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Development states</h4>
          {character.states.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recorded states yet.</p>
          ) : (
            <div className="space-y-2">
              {character.states.map((s) => (
                <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{s.label}</span>
                    <Badge variant="outline" className="text-[9px] border-white/15 text-muted-foreground">{s.stateType}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
                    {s.episodeNumber != null && <span>Ep {s.episodeNumber}</span>}
                    {s.cultivation && <span>{s.cultivation}</span>}
                    {s.weapon && <span>⚔ {s.weapon}</span>}
                    {s.clothing && <span>{s.clothing}</span>}
                  </div>
                  <StateVoiceVariantSelect state={s} />
                  <StatePosePresetSelect state={s} />
                </div>
              ))}
            </div>
          )}
        </section>

        {abilities.length > 0 && (
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Abilities</h4>
            <div className="flex flex-wrap gap-1.5">
              {abilities.map((a) => (
                <Badge key={a} variant="outline" className="border-amber-400/30 text-amber-200 text-[11px]">{a}</Badge>
              ))}
            </div>
          </section>
        )}

        {animLib.length > 0 && (
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Animation library</h4>
            <div className="flex flex-wrap gap-1.5">
              {animLib.map((a) => (
                <span key={a} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">{a}</span>
              ))}
            </div>
          </section>
        )}

        {/* Relationships - §25 */}
        {(character.relationsFrom.length > 0 || character.relationsTo.length > 0) && (
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Relationships</h4>
            <div className="space-y-1.5">
              {character.relationsFrom.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] border-white/15">{r.type}</Badge>
                  <span>→</span>
                  <span className="text-foreground/80">{r.to.name}</span>
                </div>
              ))}
              {character.relationsTo.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{r.from.name}</span>
                  <span>→</span>
                  <Badge variant="outline" className="text-[10px] border-white/15">{r.type}</Badge>
                </div>
              ))}
            </div>
          </section>
        )}

        {character.derivatives.length > 0 && (
          <section>
            <h4 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Derivatives (§20)</h4>
            <div className="space-y-1">
              {character.derivatives.map((d) => {
                const DIcon = DERIV_ICONS[d.derivativeType ?? "CLONE"] ?? Copy;
                return (
                  <div key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ChevronRight className="h-3 w-3" />
                    <DIcon className="h-3 w-3 text-violet-300" />
                    <span className="text-foreground/80">{d.name}</span>
                    {d.derivativeType && <span className="text-[10px]">({d.derivativeType.toLowerCase()})</span>}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </SheetContent>
  );
}

export function CharactersView({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CharacterFull | null>(null);
  const [sheetBusy, setSheetBusy] = useState<Record<string, boolean>>({});
  const core = project.characters.filter((c) => !c.derivativeType);
  const derivs = project.characters.filter((c) => c.derivativeType);

  const generateSheet = async (characterId: string) => {
    setSheetBusy((st) => ({ ...st, [characterId]: true }));
    try {
      await api.generateCharacterSheet(characterId);
      await qc.invalidateQueries({ queryKey: ["project", project.id] });
    } finally {
      setSheetBusy((st) => {
        const { [characterId]: _done, ...rest } = st;
        return rest;
      });
    }
  };

  // the voice-clone slot: train the character's own voice from their
  // rendered takes (honest refusals surface as the button's title)
  const [cloneNote, setCloneNote] = useState<string | null>(null);
  const [cloneBusy, setCloneBusy] = useState<string | null>(null);
  const trainClone = async (characterId: string) => {
    setCloneBusy(characterId);
    setCloneNote(null);
    try {
      const r = await api.trainVoiceClone(characterId);
      setCloneNote(`Voice clone trained for ${r.characterName}: ${r.voiceId} (${r.takes} take(s))`);
      await qc.invalidateQueries({ queryKey: ["project", project.id] });
    } catch (err) {
      setCloneNote(err instanceof Error ? err.message : "Voice clone training failed");
    } finally {
      setCloneBusy(null);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Characters"
        sub="Persistent production entities - identity, development states, relationships, derivatives and animation libraries. Not just meshes."
        right={<CreateCharacterDialog />}
      />
      {cloneNote && (
        <p className={cn("text-[11px] mb-2 rounded-lg border px-3 py-2", cloneNote.startsWith("Voice clone trained") ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-amber-400/25 bg-amber-400/10 text-amber-200")}>{cloneNote}</p>
      )}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[...core, ...derivs].map((c) => {
          const Icon = ROLE_ICONS[c.role ?? "SUPPORTING"] ?? User;
          const isDeriv = Boolean(c.derivativeType);
          const busy = Boolean(sheetBusy[c.id]);
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={cn(
                "studio-panel p-4 text-left transition-all hover:border-white/20 hover:bg-white/[0.045]",
                isDeriv && "border-violet-400/15"
              )}
            >
              <div className="flex items-center gap-3">
                {c.modelSheetUrl ? (
                  <img
                    src={c.modelSheetUrl}
                    alt={`${c.name} model sheet`}
                    className="h-12 w-12 rounded-lg object-cover shrink-0 border border-white/15"
                  />
                ) : (
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border",
                    isDeriv ? "bg-violet-400/10 border-violet-400/30" : "bg-primary/12 border-primary/25"
                  )}>
                    <Icon className={cn("h-4.5 w-4.5", isDeriv ? "text-violet-300" : "text-primary")} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                    {c.name}
                    {c.modelSheetUrl && (
                      <span title="Model sheet generated - casting anchor active" className="inline-flex items-center rounded bg-emerald-400/10 border border-emerald-400/30 px-1 text-[8px] font-bold tracking-widest text-emerald-300">
                        ANCHOR
                      </span>
                    )}
                    {c.cloneVoiceId && (
                      <span title={`Voice clone trained (${c.cloneVoiceId}) - their lines perform with their own voice when the clone provider is configured`} className="inline-flex items-center rounded bg-violet-400/10 border border-violet-400/30 px-1 text-[8px] font-bold tracking-widest text-violet-300">
                        CLONED
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{c.derivativeType ?? c.role ?? "Cast"}</div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.modelSheetUrl ? "Regenerate" : "Generate"} model sheet for ${c.name}`}
                  onClick={(e) => { e.stopPropagation(); void generateSheet(c.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); void generateSheet(c.id); } }}
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20 print:hidden"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Train voice clone for ${c.name}`}
                  title="Train the character's voice from their rendered takes (needs ANIMEOS_VOICE_CLONE_URL)"
                  onClick={(e) => { e.stopPropagation(); void trainClone(c.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); void trainClone(c.id); } }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-violet-400/30 bg-violet-400/10 text-violet-300 transition-colors hover:bg-violet-400/20"
                >
                  {cloneBusy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AudioLines className="h-3.5 w-3.5" />}
                </span>
              </div>
              {c.personality && (
                <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed line-clamp-2">{c.personality}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-2.5">
                {parseStringArray(c.abilities).slice(0, 3).map((a) => (
                  <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-200">{a}</span>
                ))}
                {c.states.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">
                    {c.states.length} state{c.states.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <CharacterSheet
            character={project.characters.find((c) => c.id === selected.id) ?? selected}
            project={project}
            onGenerateSheet={(id) => void generateSheet(id)}
            sheetBusy={Boolean(sheetBusy[selected.id])}
          />
        )}
      </Sheet>
    </div>
  );
}

export { CreateCharacterDialog };
