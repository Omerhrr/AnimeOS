"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListVideo, ScrollText, Brain, Loader2 } from "lucide-react";
import type { StudioProject, ManifestShot } from "@/lib/api-client";
import { api } from "@/lib/api-client";
import { SectionHeader, StatusBadge } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// THE SEQUENCE MANIFEST (iteration 63) - the director's call
// sheet. Three ledgers in one read: the sentences the studio
// CAN direct (named programs), the sentences it REMEMBERS
// (learned flows with their measured records), and the episode
// cut by cut - every shot's beat chain, pose pair, the world
// bindings, the render state.
// ─────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function BeatChain({ shot }: { shot: ManifestShot }) {
  if (shot.beats.length === 0) {
    return <span className="text-[11px] text-muted-foreground">single movement ({shot.shotType.toLowerCase()})</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shot.beats.map((b, i) => (
        <span
          key={i}
          title={`${b.move} ${pct(b.from)}-${pct(b.to)}${b.wind ? ` - wind ${b.wind.toFixed(1)}` : ""}${b.poses ? ` - pose ${b.poses}` : ""}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-white/85"
        >
          {b.move}
          <span className="text-muted-foreground">{pct(b.from)}-{pct(b.to)}</span>
          {(b.wind ?? 0) > 0 && <span className="text-cyan-300" title={`wind ${b.wind?.toFixed(1)} - the robes ride this beat`}>W{(b.wind ?? 0).toFixed(1)}</span>}
        </span>
      ))}
    </div>
  );
}

export function ManifestView({ project }: { project: StudioProject }) {
  const manifestQ = useQuery({
    queryKey: ["sequence-manifest", project.id],
    queryFn: () => api.sequenceManifest(project.id),
    refetchInterval: 8000,
  });
  const [episodeIdx, setEpisodeIdx] = useState(0);

  if (manifestQ.isLoading) {
    return (
      <div>
        <SectionHeader title="Sequence Manifest" sub="The director's call sheet." />
        <div className="studio-panel p-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the cutting language…
        </div>
      </div>
    );
  }

  const manifest = manifestQ.data;
  const episodes = manifest?.episodes ?? [];
  const episode = episodes[Math.min(episodeIdx, Math.max(0, episodes.length - 1))];

  return (
    <div>
      <SectionHeader
        title="Sequence Manifest"
        sub="The director's call sheet: the cutting language as it stands - the named programs, the learned flows, and every shot's beats, poses, world bindings and render state."
      />

      {/* The sentences the studio can direct */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <ScrollText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">Sequence programs</h3>
          <span className="text-[11px] text-muted-foreground">{manifest?.programs.length ?? 0} - designed with design_sequence, applied with direct_sequence</span>
        </div>
        {(manifest?.programs.length ?? 0) === 0 ? (
          <div className="studio-panel p-6 text-center text-sm text-muted-foreground">
            No sequence programs yet - ask DSH to design one (design_sequence).
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {manifest!.programs.map((p) => (
              <div key={p.name} className="studio-panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">used {p.usageCount}x</span>
                </div>
                {p.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {p.slots.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="text-white/30 text-[10px]">→</span>}
                      <span
                        title={`${s.note ?? s.grammar}${s.fx ? ` - fx: ${s.fx}` : ""}${s.physics ? ` - physics: ${s.physics}` : ""}`}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10"
                      >
                        {s.grammar}
                      </span>
                      {s.fx && <span className="px-1 py-0.5 rounded text-[9px] bg-amber-400/10 border border-amber-400/25 text-amber-300">fx</span>}
                      {s.physics && <span className="px-1 py-0.5 rounded text-[9px] bg-orange-400/10 border border-orange-400/25 text-orange-300">phys</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The sentences the studio remembers */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-violet-300" />
          <h3 className="text-sm font-semibold tracking-tight">Learned sequence flows</h3>
          <span className="text-[11px] text-muted-foreground">{manifest?.flows.length ?? 0} - adopted with learn_sequence_flow, consulted by register</span>
        </div>
        {(manifest?.flows.length ?? 0) === 0 ? (
          <div className="studio-panel p-6 text-center text-sm text-muted-foreground">
            Nothing remembered yet - a verified program can be adopted as a flow (learn_sequence_flow) and consulted with direct_sequence register:&apos;{"<register>"}&apos;.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {manifest!.flows.map((f) => (
              <div key={`${f.register}:${f.name}`} className="studio-panel p-3">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-violet-400/10 border border-violet-400/25 text-violet-300">{f.register}</span>
                  <span className="text-sm font-semibold truncate">{f.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {f.slots.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="text-white/30 text-[10px]">→</span>}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10">{s.grammar}</span>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">{f.runs} run{f.runs === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span className="tabular-nums text-emerald-300">{f.clears} clear{f.clears === 1 ? "" : "s"}</span>
                  {f.lastVerified !== null && (
                    <>
                      <span>·</span>
                      <span className={f.lastVerified ? "text-emerald-300" : "text-amber-300"}>
                        last {f.lastVerified ? "landed whole" : "did not land whole"}
                      </span>
                    </>
                  )}
                  {f.learnedFrom && <span className="truncate" title={`learned from program '${f.learnedFrom}'`}>· from {f.learnedFrom}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The episode, cut by cut */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ListVideo className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">The call sheet</h3>
          <span className="text-[11px] text-muted-foreground">every shot&apos;s beats, poses and world bindings, scene by scene</span>
          <div className="ml-auto flex gap-1.5 flex-wrap">
            {episodes.map((ep, i) => (
              <Button key={ep.id} size="sm" variant={i === episodeIdx ? "default" : "outline"}
                className={cn("h-7 text-[11px]", i !== episodeIdx && "border-white/12 bg-white/5")}
                onClick={() => setEpisodeIdx(i)}>
                E{String(ep.number).padStart(2, "0")}
              </Button>
            ))}
          </div>
        </div>
        {!episode ? (
          <div className="studio-panel p-10 text-center text-sm text-muted-foreground">No episodes yet - create one in Story &amp; Scenes.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">Episode {episode.number} - {episode.title}</span>
              <StatusBadge status={episode.status} />
              <span className="text-[11px] text-muted-foreground">{episode.scenes.length} scene(s)</span>
            </div>
            {episode.scenes.map((scene) => (
              <div key={scene.number} className="studio-panel p-4">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Scene {scene.number} - {scene.title}</span>
                    <StatusBadge status={scene.status} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{scene.shots.length} shot(s)</span>
                </div>
                <div className="space-y-2">
                  {scene.shots.map((shot) => (
                    <div key={shot.id} className="rounded-lg border border-white/8 bg-black/20 p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-white/70">{shot.label}</span>
                        <StatusBadge status={shot.status} />
                        <span className="text-[10px] text-muted-foreground">{shot.shotType.toLowerCase()} · {shot.duration.toFixed(1)}s</span>
                        {shot.render && (
                          <span className="text-[10px] text-muted-foreground" title={`latest render: ${shot.render.mode} attempt ${shot.render.attempt}`}>
                            · render {shot.render.status.toLowerCase()} ({shot.render.mode.toLowerCase()}, a{shot.render.attempt})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{shot.description}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <BeatChain shot={shot} />
                        {(shot.poseStart || shot.poseEnd) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-400/10 border border-sky-400/25 text-sky-300" title="the shot's global pose pair - the body performs the beat">
                            {shot.poseStart ?? "?"}→{shot.poseEnd ?? "?"}
                          </span>
                        )}
                        {shot.fx.map((p, i) => (
                          <span key={`fx${i}`} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-400/10 border border-amber-400/25 text-amber-300" title={`fx program: ${p.kind}${p.intensity !== undefined ? ` @${p.intensity}` : ""}`}>
                            FX {p.kind}{p.intensity !== undefined ? ` @${p.intensity}` : ""}
                          </span>
                        ))}
                        {shot.physics.map((p, i) => (
                          <span key={`ph${i}`} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-orange-400/10 border border-orange-400/25 text-orange-300" title={`physics program: ${p.kind}${p.intensity !== undefined ? ` @${p.intensity}` : ""}`}>
                            PHYS {p.kind}{p.intensity !== undefined ? ` @${p.intensity}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {scene.shots.length === 0 && (
                    <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-[11px] text-muted-foreground">
                      No shots - ask DSH to break this scene down.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
