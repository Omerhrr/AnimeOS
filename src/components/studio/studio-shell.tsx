"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Clapperboard, MessageSquareDot, FolderKanban, Users, Film, GanttChartSquare,
  MonitorPlay, ShieldAlert, Languages, History, Sparkles, Loader2, Gauge, BookOpen, Captions,
  MessagesSquare,
} from "lucide-react";
import { useStudio, type StudioView, } from "@/lib/store";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DashboardView } from "@/components/views/dashboard-view";
import { DshConsole } from "@/components/views/dsh-console";
import { ProductionsView } from "@/components/views/productions-view";
import { CharactersView } from "@/components/views/characters-view";
import { StoryView } from "@/components/views/story-view";
import { ComicView } from "@/components/views/comic-view";
import { TimelineView } from "@/components/views/timeline-view";
import { RenderView } from "@/components/views/render-view";
import { ContinuityView } from "@/components/views/continuity-view";
import { TerminologyView } from "@/components/views/terminology-view";
import { SubtitlesView } from "@/components/views/subtitles-view";
import { ReviewsView } from "@/components/views/reviews-view";
import { HistoryView } from "@/components/views/history-view";
import { UserMenu } from "@/components/studio/user-menu";

const CinematicPreview = dynamic(
  () => import("@/components/preview/cinematic-preview").then((m) => m.CinematicPreview),
  { ssr: false }
);

const NAV: Array<{ id: StudioView; label: string; icon: React.ComponentType<{ className?: string }>; group: string }> = [
  { id: "dashboard", label: "Dashboard", icon: GaugeIcon, group: "Studio" },
  { id: "dsh", label: "DSH Director", icon: MessageSquareDot, group: "Studio" },
  { id: "productions", label: "Productions", icon: FolderKanban, group: "Production" },
  { id: "characters", label: "Characters", icon: Users, group: "Production" },
  { id: "story", label: "Story & Scenes", icon: Film, group: "Production" },
  { id: "comic", label: "Comic Mode", icon: BookOpen, group: "Production" },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare, group: "Production" },
  { id: "render", label: "Render Queue", icon: MonitorPlay, group: "Pipeline" },
  { id: "reviews", label: "Reviews", icon: MessagesSquare, group: "Pipeline" },
  { id: "continuity", label: "Continuity", icon: ShieldAlert, group: "Pipeline" },
  { id: "terminology", label: "Terminology", icon: Languages, group: "Pipeline" },
  { id: "subtitles", label: "Subtitles", icon: Captions, group: "Pipeline" },
  { id: "history", label: "History", icon: History, group: "Pipeline" },
];

function GaugeIcon(props: { className?: string }) {
  return <Sparkles className={props.className} />;
}

function Shell() {
  const { view, setView, projectId, setProject, previewOpen } = useStudio();
  const bootstrappedRef = useRef(false);

  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: api.projects });

  useEffect(() => {
    if (!bootstrappedRef.current && projectsQ.data && projectsQ.data.length > 0) {
      bootstrappedRef.current = true;
      const id = projectId ?? projectsQ.data[0].id;
      queueMicrotask(() => setProject(id));
    }
  }, [projectsQ.data, projectId, setProject]);

  const projectQ = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.project(projectId!),
    enabled: Boolean(projectId),
  });

  if (projectsQ.isLoading) {
    return (
      <div className="studio-root min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm tracking-wide">Initializing production environment…</span>
        </div>
      </div>
    );
  }

  const project = projectQ.data;

  return (
    <div className="studio-root dark min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-white/8 flex items-center gap-2 sm:gap-4 px-3 sm:px-4 bg-black/30 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Clapperboard className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Animation OS</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">AI-Native Production</div>
          </div>
        </div>

        <div className="hidden md:block h-6 w-px bg-white/10 mx-1" />

        {project && (
          <div className="flex items-center gap-2 min-w-0">
            <Select value={projectId ?? undefined} onValueChange={setProject}>
              <SelectTrigger className="w-[150px] sm:w-[220px] h-8 bg-white/5 border-white/10 text-xs">
                <SelectValue placeholder="Select production" />
              </SelectTrigger>
              <SelectContent>
                {(projectsQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} · {p.visualStyle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{project.format}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{project.animationType}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{project.fps} fps</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{project.resolution}</span>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary dsh-pulse" />
            DSH online
          </span>
          <Button size="sm" variant="outline" className="hidden sm:inline-flex h-8 border-white/15 bg-white/5" onClick={() => setView("dsh")}>
            <MessageSquareDot className="h-3.5 w-3.5 mr-1.5" />
            Direct with DSH
          </Button>
          <Button size="icon" variant="outline" className="sm:hidden h-8 w-8 border-white/15 bg-white/5" onClick={() => setView("dsh")} aria-label="Direct with DSH">
            <MessageSquareDot className="h-3.5 w-3.5" />
          </Button>
          <UserMenu />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <nav className="w-14 md:w-52 shrink-0 border-r border-white/8 bg-black/20 py-3 flex flex-col gap-0.5 overflow-y-auto studio-scroll">
          {["Studio", "Production", "Pipeline"].map((group) => (
            <div key={group} className="px-2">
              <div className="hidden md:block px-2 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {group}
              </div>
              {NAV.filter((n) => n.group === group).map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id)}
                    aria-label={item.label}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2 md:px-3 h-10 rounded-lg text-[13px] transition-colors",
                      active
                        ? "bg-primary/12 text-primary border border-primary/25"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden md:inline truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="mt-auto hidden md:block px-4 pt-4 pb-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground/60">
              DSH decides · Tools execute · Engine builds · State remembers
            </p>
          </div>
        </nav>

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-y-auto studio-scroll">
          {!project ? (
            <div className="p-6">
              <ProductionsView />
            </div>
          ) : (
            <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
              {view === "dashboard" && <DashboardView />}
              {view === "dsh" && <DshConsole />}
              {view === "productions" && <ProductionsView />}
              {view === "characters" && <CharactersView project={project} />}
              {view === "story" && <StoryView project={project} />}
              {view === "comic" && <ComicView project={project} />}
              {view === "timeline" && <TimelineView project={project} />}
              {view === "render" && <RenderView project={project} />}
              {view === "reviews" && <ReviewsView project={project} />}
              {view === "continuity" && <ContinuityView project={project} />}
              {view === "terminology" && <TerminologyView project={project} />}
              {view === "subtitles" && <SubtitlesView project={project} />}
              {view === "history" && <HistoryView project={project} />}
            </div>
          )}
        </main>
      </div>

      {previewOpen && <CinematicPreview />}
    </div>
  );
}

export function StudioShell() {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 4000, refetchOnWindowFocus: false } },
      })
  );
  return (
    <QueryClientProvider client={qc}>
      <Shell />
    </QueryClientProvider>
  );
}
