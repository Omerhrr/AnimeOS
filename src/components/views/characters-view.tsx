"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, User, Users, Swords, Crown, Skull, Sparkles, Copy, Ghost, RefreshCcw,
  ChevronRight, Wand2, Loader2,
} from "lucide-react";
import { api, parseStringArray, type CharacterFull, type StudioProject } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
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

function CharacterSheet({ character, project }: { character: CharacterFull; project: StudioProject }) {
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

        {/* Development states — §18 */}
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

        {/* Relationships — §25 */}
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
  const [selected, setSelected] = useState<CharacterFull | null>(null);
  const core = project.characters.filter((c) => !c.derivativeType);
  const derivs = project.characters.filter((c) => c.derivativeType);

  return (
    <div>
      <SectionHeader
        title="Characters"
        sub="Persistent production entities — identity, development states, relationships, derivatives and animation libraries. Not just meshes."
        right={<CreateCharacterDialog />}
      />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[...core, ...derivs].map((c) => {
          const Icon = ROLE_ICONS[c.role ?? "SUPPORTING"] ?? User;
          const isDeriv = Boolean(c.derivativeType);
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
                <div className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border",
                  isDeriv ? "bg-violet-400/10 border-violet-400/30" : "bg-primary/12 border-primary/25"
                )}>
                  <Icon className={cn("h-4.5 w-4.5", isDeriv ? "text-violet-300" : "text-primary")} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground">{c.derivativeType ?? c.role ?? "Cast"}</div>
                </div>
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
        {selected && <CharacterSheet character={project.characters.find((c) => c.id === selected.id) ?? selected} project={project} />}
      </Sheet>
    </div>
  );
}

export { CreateCharacterDialog };
