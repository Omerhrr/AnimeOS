"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Film, Loader2, MonitorPlay, ShieldAlert, CircleCheck, CircleX,
  Wand2, MapPin, CloudSun, Clock, Layers, Camera,
} from "lucide-react";
import { api, type SceneAnalysis, type StudioProject } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader, StatusBadge, SHOT_TYPE_LABELS } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function CreateEpisodeDialog({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [num, setNum] = useState(1);
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");

  async function create() {
    setBusy(true);
    try {
      await api.createEpisode({ projectId, seasonNumber: 1, number: num, title: title || `Episode ${num}`, synopsis });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setOpen(false);
      setTitle(""); setSynopsis("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-white/12 bg-white/5"><Plus className="h-4 w-4 mr-1.5" /> Episode</Button>
      </DialogTrigger>
      <DialogContent className="bg-card max-w-md">
        <DialogHeader><DialogTitle>New episode — {project.seasons[0]?.title ?? "Season 1"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5"><Label>Episode number</Label>
            <Input type="number" value={num} onChange={(e) => setNum(Number(e.target.value))} className="bg-white/5 border-white/12" />
          </div>
          <div className="grid gap-1.5"><Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Storm Over Azure Mountain" className="bg-white/5 border-white/12" />
          </div>
          <div className="grid gap-1.5"><Label>Synopsis</Label>
            <Textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="bg-white/5 border-white/12 min-h-[70px]" />
          </div>
          <Button onClick={create} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create episode</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateSceneDialog({ episodeId, episodeNumber }: { episodeId: string; episodeNumber: number }) {
  const qc = useQueryClient();
  const { projectId, previewSceneId } = useStudio();
  void previewSceneId;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [envName, setEnvName] = useState("");
  const [weather, setWeather] = useState("");

  async function create() {
    setBusy(true);
    try {
      await api.createScene({ episodeId, title: title || `Scene ${description.slice(0, 20)}`, description, environmentName: envName, weather });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setOpen(false);
      setTitle(""); setDescription(""); setEnvName(""); setWeather("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-white/12 bg-white/5"><Plus className="h-4 w-4 mr-1.5" /> Scene</Button>
      </DialogTrigger>
      <DialogContent className="bg-card max-w-lg">
        <DialogHeader><DialogTitle>New scene — Episode {episodeNumber}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5"><Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Ruined Temple" className="bg-white/5 border-white/12" />
          </div>
          <div className="grid gap-1.5"><Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Lin Yue enters an ancient ruined temple during a storm…" className="bg-white/5 border-white/12 min-h-[80px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Environment (name)</Label>
              <Input value={envName} onChange={(e) => setEnvName(e.target.value)} placeholder="Azure Mountain" className="bg-white/5 border-white/12" />
            </div>
            <div className="grid gap-1.5"><Label>Weather</Label>
              <Input value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="Storm" className="bg-white/5 border-white/12" />
            </div>
          </div>
          <Button onClick={create} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create scene</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SceneDetail({ analysis }: { analysis: SceneAnalysis }) {
  const { openPreview } = useStudio();
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [rendering, setRendering] = useState<string | null>(null);

  const scene = analysis.scene;

  async function renderShot(shotId: string, mode: "PREVIEW" | "FINAL") {
    setRendering(shotId);
    try {
      await api.renderCreate(shotId, mode);
      qc.invalidateQueries({ queryKey: ["renderJobs", projectId] });
    } finally {
      setRendering(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="studio-panel p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Scene {scene.number} — {scene.title}</h3>
              <StatusBadge status={scene.status} />
            </div>
            <p className="text-[13px] text-muted-foreground leading-relaxed mt-1.5 max-w-3xl">{scene.description}</p>
          </div>
          <Button size="sm" onClick={() => openPreview(scene.id)}>
            <MonitorPlay className="h-4 w-4 mr-1.5" /> Cinematic preview
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
          {scene.environment && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{scene.environment.name}</span>}
          {scene.timeOfDay && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{scene.timeOfDay}</span>}
          {scene.weather && <span className="inline-flex items-center gap-1"><CloudSun className="h-3 w-3" />{scene.weather}</span>}
          <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />fog {scene.fogDensity.toFixed(2)} · lightning {scene.lightningIntensity.toFixed(2)} · energy {scene.energyIntensity.toFixed(2)} · cam dist {scene.cameraDistance.toFixed(2)} · rim {scene.rimLightIntensity.toFixed(2)}</span>
        </div>
      </div>

      {/* Missing capability detection — §26 */}
      <div className="studio-panel p-4">
        <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-amber-300" /> Capability check
        </h4>
        {analysis.capabilities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No specific requirements detected in scene text.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-1.5">
            {analysis.capabilities.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px] rounded-md border border-white/8 bg-white/[0.02] px-2.5 py-2">
                {c.present ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <CircleX className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-medium">{c.requirement}</span>
                  <span className="text-muted-foreground"> · {c.category}</span>
                  <div className="text-[11px] text-muted-foreground">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Continuity — §27 */}
      {analysis.continuity.length > 0 && (
        <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.05] p-4">
          <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2 text-rose-200">
            <ShieldAlert className="h-4 w-4" /> Continuity conflict{analysis.continuity.length > 1 ? "s" : ""}
          </h4>
          <div className="space-y-3">
            {analysis.continuity.map((c, i) => (
              <div key={i} className="text-[12px]">
                <span className="font-medium text-rose-100">{c.entityName}</span>
                <span className="text-rose-300/80"> — {c.kind}{c.eventEpisode != null ? ` (Episode ${c.eventEpisode})` : ""}: </span>
                <span className="text-foreground/75">{c.description}</span>
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Possible resolutions: {c.resolutions.map((r, j) => (
                    <span key={j} className="inline-block mr-1.5 mb-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{j + 1}. {r}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shots — §30 */}
      <div className="studio-panel p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" /> Shot list ({scene.shots.length})
        </h4>
        {scene.shots.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">No shots yet — ask DSH to break this scene down.</p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto studio-scroll pr-1">
            {scene.shots.map((s) => (
              <div key={s.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-primary">SHOT {String(s.number).padStart(3, "0")}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{SHOT_TYPE_LABELS[s.shotType] ?? s.shotType}</span>
                      {s.lens && <span className="text-[11px] text-muted-foreground">{s.lens}</span>}
                      {s.movement && <span className="text-[11px] text-muted-foreground">· {s.movement.toLowerCase()}</span>}
                      <span className="text-[11px] text-muted-foreground">· {s.duration.toFixed(1)}s</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="text-[12px] leading-relaxed mt-1.5">{s.description}</p>
                    {s.lighting && <p className="text-[11px] text-muted-foreground mt-1">Lighting: {s.lighting}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" onClick={() => renderShot(s.id, "PREVIEW")} disabled={rendering === s.id}>
                      {rendering === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <MonitorPlay className="h-3 w-3 mr-1" />} Preview
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-emerald-400/25 bg-emerald-400/5 text-emerald-200" onClick={() => renderShot(s.id, "FINAL")} disabled={rendering === s.id}>
                      Final
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function StoryView({ project }: { project: StudioProject }) {
  const { projectId } = useStudio();
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);

  const episodes = project.seasons.flatMap((s) => s.episodes);
  const activeEpisode = episodes.find((e) => e.id === episodeId) ?? episodes[0];
  const activeScene = activeEpisode?.scenes.find((s) => s.id === sceneId) ?? activeEpisode?.scenes[0];

  const analysisQ = useQuery({
    queryKey: ["sceneAnalysis", activeScene?.id],
    queryFn: () => api.sceneAnalysis(activeScene!.id),
    enabled: Boolean(activeScene),
  });

  return (
    <div>
      <SectionHeader
        title="Story & Scenes"
        sub="Season → Episode → Scene → Shot. Scenes carry narrative intent; the pipeline derives production requirements from them."
        right={
          <div className="flex gap-2">
            {activeEpisode && <CreateSceneDialog episodeId={activeEpisode.id} episodeNumber={activeEpisode.number} />}
            <CreateEpisodeDialog project={project} />
          </div>
        }
      />

      <div className="grid lg:grid-cols-[260px_1fr] gap-4 items-start">
        {/* Episode / scene tree */}
        <div className="studio-panel p-3 max-h-[70vh] overflow-y-auto studio-scroll">
          {episodes.length === 0 && <p className="text-xs text-muted-foreground p-2">No episodes yet.</p>}
          {episodes.map((ep) => (
            <div key={ep.id} className="mb-1">
              <button
                onClick={() => { setEpisodeId(ep.id); setSceneId(ep.scenes[0]?.id ?? null); }}
                className={cn(
                  "w-full text-left rounded-lg px-2.5 py-2 text-[13px] flex items-center justify-between gap-2",
                  activeEpisode?.id === ep.id ? "bg-primary/12 text-primary" : "hover:bg-white/5"
                )}
              >
                <span className="truncate font-medium">E{String(ep.number).padStart(2, "0")} · {ep.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{ep.scenes.length} sc.</span>
              </button>
              {activeEpisode?.id === ep.id && (
                <div className="ml-3 pl-3 border-l border-white/10 my-1 space-y-0.5">
                  {ep.scenes.map((sc) => (
                    <button
                      key={sc.id}
                      onClick={() => setSceneId(sc.id)}
                      className={cn(
                        "w-full text-left rounded-md px-2 py-1.5 text-[12px] flex items-center justify-between gap-2",
                        activeScene?.id === sc.id ? "bg-white/8 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )}
                    >
                      <span className="truncate"><Film className="h-3 w-3 inline mr-1.5 -mt-0.5" />{sc.number}. {sc.title}</span>
                      <StatusBadge status={sc.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Scene detail */}
        {activeScene ? (
          analysisQ.data ? <SceneDetail analysis={analysisQ.data} />
            : <div className="studio-panel p-10 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="studio-panel p-10 text-center text-sm text-muted-foreground">
            Select or create a scene to inspect its production requirements.
          </div>
        )}
      </div>
    </div>
  );
}
