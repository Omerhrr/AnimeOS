"use client";

import { useQuery } from "@tanstack/react-query";
import { Link2, MonitorPlay, Users, Film, ArrowRight, ShieldCheck, ShieldX } from "lucide-react";
import { api, parseFindings } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader, StatCard, StatusBadge } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

export function DashboardView() {
  const { projectId, setView, openPreview } = useStudio();

  const projectQ = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.project(projectId!),
    enabled: Boolean(projectId),
  });
  const jobsQ = useQuery({
    queryKey: ["renderJobs", projectId],
    queryFn: () => api.renderJobs(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: 2500,
  });

  if (!projectQ.data) return null;
  const p = projectQ.data;

  const allScenes = p.seasons.flatMap((s) => s.episodes.flatMap((e) => e.scenes));
  const allShots = allScenes.flatMap((s) => s.shots);
  const approvedShots = allShots.filter((s) => s.status === "APPROVED" || s.status === "FINAL").length;
  const totalDuration = allShots.reduce((n, s) => n + s.duration, 0);
  const activeJobs = (jobsQ.data ?? []).filter((j) => ["RENDERING", "QUEUED", "INSPECTING"].includes(j.status));
  const recentEvents = p.productionEvents.slice(0, 8);
  const latestEvaluationJob = (jobsQ.data ?? []).find((j) => j.evaluation);

  // find a scene to preview (first scene with shots)
  const previewScene = allScenes.find((s) => s.shots.length > 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Studio Dashboard - ${p.title}`}
        sub={p.logline ?? "AI-native production workspace"}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Episodes" value={p.seasons.reduce((n, s) => n + s.episodes.length, 0)} hint={`${p.seasons.length} season(s)`} />
        <StatCard label="Characters" value={p.characters.length} hint="persistent entities" />
        <StatCard label="Shots" value={allShots.length} hint={`${approvedShots} approved`} accent />
        <StatCard label="Screen time" value={`${Math.floor(totalDuration / 60)}m ${Math.round(totalDuration % 60)}s`} hint={`${totalDuration.toFixed(1)}s total`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Active renders */}
        <div className="studio-panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-primary" />
              Render queue
            </h3>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setView("render")}>
              Open queue <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          {activeJobs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              No active renders. Queue a preview from Story &amp; Scenes or ask DSH.
            </p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto studio-scroll pr-1">
              {activeJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium truncate">
                      {job.shot?.scene ? `Scene ${job.shot.scene.number} · ` : ""}
                      {job.shot ? `Shot ${String(job.shot.number).padStart(3, "0")}` : "Production render"}{" "}
                      <span className="text-muted-foreground">({job.mode}, attempt {job.attempt})</span>
                    </span>
                    <StatusBadge status={job.status} />
                  </div>
                  <Progress value={job.progress} className="h-1.5" />
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>{job.stage}</span>
                    <span className="tabular-nums">{Math.round(job.progress)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {latestEvaluationJob?.evaluation && (
            <div className="mt-4 rounded-lg border border-violet-400/20 bg-violet-400/[0.05] p-3">
              <div className="flex items-center gap-2 mb-1.5">
                {latestEvaluationJob.evaluation.verdict === "APPROVED" ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <ShieldX className="h-3.5 w-3.5 text-violet-300" />
                )}
                <span className="text-xs font-semibold">Latest DSH inspection - {latestEvaluationJob.evaluation.verdict.replace("_", " ")}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{latestEvaluationJob.evaluation.summary}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                {parseFindings(latestEvaluationJob.evaluation.findings).length} findings ·{" "}
                <button className="underline hover:text-foreground" onClick={() => setView("render")}>review in queue</button>
              </p>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <div className="studio-panel p-4">
            <h3 className="text-sm font-semibold mb-3">Direct</h3>
            <div className="space-y-2">
              <Button className="w-full justify-start h-9" onClick={() => setView("dsh")}>
                <Users className="h-4 w-4 mr-2" /> Give DSH a direction
              </Button>
              <Button variant="outline" className="w-full justify-start h-9 border-white/12 bg-white/5" onClick={() => setView("story")}>
                <Film className="h-4 w-4 mr-2" /> Break down scenes
              </Button>
              {previewScene && (
                <Button variant="outline" className="w-full justify-start h-9 border-white/12 bg-white/5" onClick={() => openPreview(previewScene.id)}>
                  <MonitorPlay className="h-4 w-4 mr-2" /> Cinematic preview
                </Button>
              )}
            </div>
          </div>

          <div className="studio-panel p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Production context
            </h3>
            <ScrollArea className="h-56 pr-2 studio-scroll">
              <div className="space-y-1.5">
                {recentEvents.map((e) => (
                  <div key={e.id} className="text-[11px] leading-relaxed border-l-2 border-white/10 pl-2.5 py-0.5">
                    <span className={e.actor === "DSH" ? "text-violet-300" : e.actor === "USER" ? "text-amber-300" : "text-teal-300"}>
                      {e.actor}
                    </span>{" "}
                    <span className="text-muted-foreground">{e.summary}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
