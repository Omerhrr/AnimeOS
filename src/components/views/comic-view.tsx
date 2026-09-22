"use client";

import { useMemo, useState } from "react";
import { BookOpen, BookOpenCheck, FileDown, Layers, MoveRight } from "lucide-react";
import type { StudioProject, SceneWithShots } from "@/lib/api-client";
import {
  COMIC_FORMATS, layoutScene, stripHeight,
  type ComicFormat, type PanelPlacement, type ShotLike,
} from "@/lib/comic/layout";
import { PanelArt } from "@/components/views/comic-panel-art";
import { SectionHeader } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-neutral-400",
  QUEUED: "bg-amber-500",
  RENDERING: "bg-amber-500 animate-pulse",
  REVIEW: "bg-violet-500",
  INSPECTING: "bg-violet-500 animate-pulse",
  APPROVED: "bg-emerald-500",
  FINAL: "bg-emerald-500",
  FAILED: "bg-rose-500",
};

interface ScenePages {
  scene: SceneWithShots;
  pages: ReturnType<typeof layoutScene>;
}

function SceneChips({ scene }: { scene: SceneWithShots }) {
  const chips = [scene.environment?.name, scene.timeOfDay, scene.weather].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-widest" style={{ background: "#25335c", color: "#f8f4e9" }}>SCENE {String(scene.number).padStart(2, "0")}</span>
      <span className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>{scene.title}</span>
      {chips.map((c) => (
        <span key={String(c)} className="px-1.5 py-0.5 rounded border border-neutral-300 bg-white/60 text-[10px] text-neutral-600">{c}</span>
      ))}
    </div>
  );
}

function PanelFrame({
  panel, format, rtl, scene,
}: {
  panel: PanelPlacement;
  format: ComicFormat;
  rtl: boolean;
  scene: SceneWithShots;
}) {
  const cfg = COMIC_FORMATS[format];
  const shot = panel.shot;
  const dynamic = shot.movement && ["PAN", "TRACKING", "DOLLY_IN", "ORBIT", "CRANE"].includes(shot.movement);
  const shotNo = String(shot.number).padStart(3, "0");

  return (
    <figure
      className={cn("comic-panel relative overflow-hidden bg-white", panel.emphasis && "comic-splash")}
      style={{
        gridColumn: `${panel.colStart} / span ${panel.colSpan}`,
        gridRow: `span ${panel.rowSpan}`,
        border: `${panel.emphasis ? 3 : 2}px solid ${cfg.ink}`,
        minHeight: panel.rowSpan >= 2 ? 230 : panel.colSpan >= 5 ? 150 : 112,
      }}
    >
      <PanelArt
        shotType={shot.shotType}
        movement={shot.movement}
        weather={scene.weather}
        timeOfDay={scene.timeOfDay}
        seed={shot.number + scene.number * 100}
        format={format}
      />

      {/* shot number chip */}
      <span
        className={cn("absolute top-1 px-1.5 py-[1px] text-[9px] font-mono font-bold tracking-wider", rtl ? "right-1" : "left-1")}
        style={{ background: cfg.ink, color: cfg.paper }}
      >
        {shotNo}
      </span>

      {/* status dot */}
      <span className={cn("absolute bottom-1.5 h-2 w-2 rounded-full", rtl ? "left-1.5" : "right-1.5", STATUS_DOT[shot.status] ?? "bg-neutral-400")} title={shot.status} />

      {/* movement chip */}
      {dynamic && (
        <span
          className={cn("absolute bottom-1 px-1 py-[1px] text-[8px] font-mono tracking-wider flex items-center gap-0.5", rtl ? "right-1" : "left-1")}
          style={{ border: `1px solid ${cfg.ink}`, color: cfg.ink, background: "rgba(255,255,255,0.75)" }}
        >
          <MoveRight className="h-2 w-2" style={{ transform: rtl ? "scaleX(-1)" : undefined }} />
          {shot.movement}
        </span>
      )}

      {/* caption box */}
      <figcaption
        className={cn("absolute top-6 max-w-[75%] px-1.5 py-1 text-[9px] leading-snug text-neutral-900", rtl ? "right-1 text-right" : "left-1 text-left")}
        style={{ background: "rgba(255,255,255,0.88)", border: `1px solid ${cfg.ink}`, maxWidth: "72%" }}
      >
        {shot.description}
      </figcaption>
    </figure>
  );
}

function WebtoonPanel({ shot, scene, format }: { shot: ShotLike; scene: SceneWithShots; format: ComicFormat }) {
  const cfg = COMIC_FORMATS[format];
  const dynamic = shot.movement && ["PAN", "TRACKING", "DOLLY_IN", "ORBIT", "CRANE"].includes(shot.movement);
  return (
    <figure className="comic-panel relative overflow-hidden bg-white" style={{ border: `2px solid ${cfg.ink}`, height: stripHeight(shot.shotType) }}>
      <PanelArt
        shotType={shot.shotType}
        movement={shot.movement}
        weather={scene.weather}
        timeOfDay={scene.timeOfDay}
        seed={shot.number + scene.number * 100}
        format={format}
      />
      <span className="absolute top-1 left-1 px-1.5 py-[1px] text-[9px] font-mono font-bold tracking-wider" style={{ background: cfg.ink, color: cfg.paper }}>
        {String(shot.number).padStart(3, "0")}
      </span>
      {dynamic && (
        <span className="absolute bottom-1 right-1 px-1 py-[1px] text-[8px] font-mono tracking-wider" style={{ border: `1px solid ${cfg.ink}`, color: cfg.ink, background: "rgba(255,255,255,0.75)" }}>
          {shot.movement}
        </span>
      )}
      <figcaption className="absolute top-6 left-1 px-1.5 py-1 text-[9px] leading-snug text-neutral-900" style={{ background: "rgba(255,255,255,0.88)", border: `1px solid ${cfg.ink}`, maxWidth: "76%" }}>
        {shot.description}
      </figcaption>
    </figure>
  );
}

export function ComicView({ project }: { project: StudioProject }) {
  const [format, setFormat] = useState<ComicFormat>("MANHUA");
  const [episodeIdx, setEpisodeIdx] = useState(0);
  const cfg = COMIC_FORMATS[format];

  const episodes = useMemo(
    () => project.seasons.flatMap((s) => s.episodes).sort((a, b) => a.number - b.number),
    [project.seasons]
  );
  const episode = episodes[Math.min(episodeIdx, Math.max(episodes.length - 1, 0))];

  const scenePages: ScenePages[] = useMemo(() => {
    if (!episode) return [];
    return [...episode.scenes]
      .sort((a, b) => a.number - b.number)
      .map((scene) => ({ scene, pages: layoutScene(scene, scene.shots as ShotLike[]) }));
  }, [episode]);

  const stats = useMemo(() => {
    let pages = 0, panels = 0, splash = 0;
    for (const sp of scenePages)
      for (const pg of sp.pages) {
        pages += 1;
        for (const p of pg.panels) {
          panels += 1;
          if (p.emphasis) splash += 1;
        }
      }
    return { pages, panels, splash, readMin: Math.max(1, Math.round(panels * 7 / 60)) };
  }, [scenePages]);

  if (!episode) {
    return (
      <div>
        <SectionHeader title="Comic Mode" sub="Storyboard episodes as manhua, manhwa/webtoon or manga pages." />
        <div className="studio-panel p-10 text-center text-sm text-muted-foreground">
          No episodes yet — create one in Story & Scenes, or ask DSH to break down a scene.
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Comic Mode"
        sub="The episode re-composed as sequential art. Panel layout is derived from the shot breakdown — no re-authoring."
        right={
          <div className="flex items-center gap-1.5 flex-wrap">
            {episodes.map((ep, i) => (
              <Button key={ep.id} size="sm" variant={i === episodeIdx ? "default" : "outline"}
                className={cn("h-7 text-[11px]", i !== episodeIdx && "border-white/12 bg-white/5")}
                onClick={() => setEpisodeIdx(i)}>
                E{String(ep.number).padStart(2, "0")}
              </Button>
            ))}
          </div>
        }
      />

      {/* format selector */}
      <div className="studio-panel p-3 mb-5 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(COMIC_FORMATS) as ComicFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                "px-3 h-8 rounded-lg text-xs font-medium border transition-colors",
                format === f
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
              )}
            >
              {COMIC_FORMATS[f].label}
              <span className="ml-1.5 text-[9px] uppercase tracking-widest opacity-60">{COMIC_FORMATS[f].origin}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground lg:ml-2">{cfg.blurb}</p>
        <div className="lg:ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          {cfg.readingDirection === "RTL" && (
            <span className="flex items-center gap-1"><MoveRight className="h-3 w-3 rotate-180" /> right-to-left</span>
          )}
          {cfg.readingDirection === "VERTICAL" && (
            <span className="flex items-center gap-1"><MoveRight className="h-3 w-3 rotate-90" /> vertical scroll</span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden" onClick={() => window.print()}>
            <FileDown className="h-3 w-3 mr-1" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 print:hidden">
        {[
          { icon: Layers, label: "Panels", value: stats.panels },
          { icon: BookOpen, label: cfg.readingDirection === "VERTICAL" ? "Scroll cards" : "Pages", value: stats.pages },
          { icon: BookOpenCheck, label: "Splash panels", value: stats.splash },
          { icon: BookOpen, label: "Est. read", value: `${stats.readMin} min` },
        ].map((s) => (
          <div key={s.label} className="studio-panel p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <s.icon className="h-3 w-3" /> {s.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* pages */}
      <div className="comic-print-area space-y-10">
        {scenePages.map(({ scene, pages }) =>
          pages.length === 0 ? (
            <div key={scene.id} className="studio-panel p-5 text-xs text-muted-foreground">
              <SceneChips scene={scene} /> — no shots yet
            </div>
          ) : (
            <section key={scene.id} className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <div className="rounded-lg border border-white/12 bg-white/5 px-4 py-2 print:hidden">
                  <SceneChips scene={scene} />
                </div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {cfg.readingDirection === "VERTICAL" ? (
                <div className="mx-auto max-w-[520px] space-y-4" style={{ padding: `0 ${cfg.gutter / 2}px` }}>
                  {pages.map((pg) =>
                    pg.panels.map((p) => (
                      <div key={p.shot.id}>
                        <WebtoonPanel shot={p.shot} scene={scene} format={format} />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6 items-start print:block">
                  {pages.map((pg) => (
                    <article
                      key={`${pg.sceneId}-${pg.indexInScene}`}
                      className="comic-page mx-auto w-full max-w-[560px] rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.45)] print:shadow-none"
                      style={{ background: cfg.paper, padding: cfg.gutter * 1.4 }}
                    >
                      <div
                        dir={cfg.readingDirection === "RTL" ? "rtl" : "ltr"}
                        className="grid grid-cols-6"
                        style={{ gap: cfg.gutter }}
                      >
                        {pg.panels.map((p) => (
                          <PanelFrame key={p.shot.id} panel={p} format={format} rtl={cfg.readingDirection === "RTL"} scene={scene} />
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[9px] font-mono tracking-widest" style={{ color: "#8a8578" }}>
                        <span>{project.title.toUpperCase()}</span>
                        <span>
                          SC{String(pg.sceneNumber).padStart(2, "0")} · P{pg.indexInScene + 1}
                          {cfg.readingDirection === "RTL" ? " ◀" : ""}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-8 print:hidden">
        Panel sizing follows shot grammar: establishing shots claim splash pages, close-ups pack tight, dynamic movements get speed lines.
        The layout engine is deterministic — the same shot breakdown always yields the same pages.
      </p>
    </div>
  );
}
