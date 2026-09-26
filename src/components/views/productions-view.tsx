"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Plus, FolderKanban, Loader2, UsersRound } from "lucide-react";
import { api } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader, StatusBadge, StatCard } from "@/components/views/shared";
import { CrewDialog } from "@/components/views/crew-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ANIMATION_TYPES, FORMATS, STYLE_PRESETS, VISUAL_STYLES } from "@/lib/types";

const LANGS = ["zh-CN", "ja-JP", "ko-KR", "en-US", "fr-FR", "es-ES", "ar-SA", "pt-BR", "ha-NG", "yo-NG", "ig-NG"];

function CreateProductionDialog() {
  const qc = useQueryClient();
  const { setProject, setView } = useStudio();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [format, setFormat] = useState<string>("SERIES");
  const [animation, setAnimation] = useState<string>("3D");
  const [style, setStyle] = useState<string>("DONGHUA");
  const [language, setLanguage] = useState<string>("zh-CN");
  const [subs, setSubs] = useState<string[]>(["en-US"]);
  const [fps, setFps] = useState(24);
  const [resolution, setResolution] = useState("1920x1080");

  function pickStyle(s: string) {
    setStyle(s);
    setLanguage(STYLE_PRESETS[s]?.language ?? "en-US");
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { id } = await api.createProject({
        title, logline, format, animationType: animation, visualStyle: style,
        originalLanguage: language, subtitleLanguages: subs, fps, resolution,
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setProject(id);
      setView("dashboard");
      setOpen(false);
      setTitle(""); setLogline("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> New production</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto studio-scroll bg-card">
        <DialogHeader>
          <DialogTitle>Create new production</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Immortal Path" className="bg-white/5 border-white/12" />
          </div>
          <div className="grid gap-1.5">
            <Label>Logline</Label>
            <Textarea value={logline} onChange={(e) => setLogline(e.target.value)} placeholder="One sentence that sells the story…" className="bg-white/5 border-white/12 min-h-[60px]" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Format</Label>
              <RadioGroup value={format} onValueChange={setFormat} className="flex gap-3 flex-wrap">
                {FORMATS.map((f) => (
                  <Label key={f} className="flex items-center gap-1.5 text-xs border border-white/12 rounded-lg px-3 py-2 cursor-pointer bg-white/[0.03] has-[[data-state=checked]]:border-primary/50">
                    <RadioGroupItem value={f} /> {f.charAt(0) + f.slice(1).toLowerCase().replace("_", " ")}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div className="grid gap-2">
              <Label>Animation</Label>
              <RadioGroup value={animation} onValueChange={setAnimation} className="flex gap-3 flex-wrap">
                {ANIMATION_TYPES.map((a) => (
                  <Label key={a} className="flex items-center gap-1.5 text-xs border border-white/12 rounded-lg px-3 py-2 cursor-pointer bg-white/[0.03] has-[[data-state=checked]]:border-primary/50">
                    <RadioGroupItem value={a} /> {a}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Visual style</Label>
            <RadioGroup value={style} onValueChange={pickStyle} className="grid sm:grid-cols-2 gap-2">
              {VISUAL_STYLES.map((s) => (
                <Label key={s} className="flex items-start gap-2 text-xs border border-white/12 rounded-lg px-3 py-2.5 cursor-pointer bg-white/[0.03] has-[[data-state=checked]]:border-primary/50">
                  <RadioGroupItem value={s} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{STYLE_PRESETS[s].label}</span>
                    <span className="block text-muted-foreground mt-0.5 leading-relaxed">{STYLE_PRESETS[s].vibe}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Original language</Label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="h-9 rounded-md bg-white/5 border border-white/12 px-3 text-sm"
              >
                {LANGS.map((l) => <option key={l} value={l} className="bg-card">{l}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Subtitle languages</Label>
              <div className="flex flex-wrap gap-1.5">
                {LANGS.slice(0, 7).map((l) => (
                  <Label key={l} className="flex items-center gap-1 text-[11px] border border-white/12 rounded px-2 py-1 cursor-pointer bg-white/[0.03] has-[[data-state=checked]]:border-primary/50">
                    <Checkbox
                      checked={subs.includes(l)}
                      onCheckedChange={(c) => setSubs((prev) => (c ? [...prev, l] : prev.filter((x) => x !== l)))}
                    />
                    {l}
                  </Label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Frame rate</Label>
              <Input type="number" value={fps} onChange={(e) => setFps(Number(e.target.value))} className="bg-white/5 border-white/12" />
            </div>
            <div className="grid gap-1.5">
              <Label>Resolution</Label>
              <Input value={resolution} onChange={(e) => setResolution(e.target.value)} className="bg-white/5 border-white/12" />
            </div>
          </div>

          <Button onClick={create} disabled={busy || !title.trim()} className="mt-1">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Initialize production
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ProductionsView() {
  const { projectId, setProject, setView } = useStudio();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "VIEWER";
  const isOwner = role === "OWNER";
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const projects = projectsQ.data ?? [];

  return (
    <div>
      <SectionHeader
        title="Productions"
        sub={isOwner
          ? "Every production is a persistent animated universe - and as OWNER you hold full access to every one of them."
          : "The productions on your slate. An OWNER adds you to a crew from a production's Crew panel."}
        right={<CreateProductionDialog />}
      />
      {projects.length === 0 ? (
        <div className="studio-panel p-10 text-center">
          <UsersRound className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-sm font-medium mb-1">
            {isOwner ? "No productions yet" : "Nothing on your slate yet"}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            {isOwner
              ? "Initialize the first production - you will have full access to it and to everything the studio makes after it."
              : "You are not on any production's crew yet. Ask an OWNER to add you - they choose which productions you see and which dashboard lens leads for you."}
          </p>
        </div>
      ) : (
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => { setProject(p.id); setView("dashboard"); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setProject(p.id); setView("dashboard"); } }}
            className={`studio-panel p-5 text-left transition-all hover:border-white/20 hover:bg-white/[0.045] cursor-pointer ${p.id === projectId ? "ring-1 ring-primary/50" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/12 border border-primary/25 flex items-center justify-center shrink-0">
                  <FolderKanban className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {STYLE_PRESETS[p.visualStyle]?.label ?? p.visualStyle} · {p.originalLanguage}
                  </div>
                </div>
              </div>
              <StatusBadge status={p.status} />
            </div>
            {p.logline && <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed line-clamp-2">{p.logline}</p>}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <StatCard label="Episodes" value={p.episodeCount} />
              <StatCard label="Cast" value={p.characterCount} />
              <StatCard label="Renders" value={p.renderCount} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{p.format}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{p.animationType}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{p.fps} fps</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{p.resolution}</span>
              {typeof p.crewCount === "number" && (
                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">crew {p.crewCount}</span>
              )}
              <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                <CrewDialog projectId={p.id} title={p.title} />
              </span>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
