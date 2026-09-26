"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Link2, MonitorPlay, Users, Film, ArrowRight, ShieldCheck, ShieldX,
  Clapperboard, Palette, Mic2, MessagesSquare, Radio, Crown, UserCog,
} from "lucide-react";
import { api, parseFindings, type StudioEmphasis, type Craft } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader, StatCard, StatusBadge } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

const CRAFT_CHIP: Record<Craft, { label: string; icon: typeof Clapperboard; cls: string; blurb: string }> = {
  DIRECTING: { label: "Directing lens", icon: Film, cls: "text-amber-300 border-amber-400/30 bg-amber-400/10", blurb: "Story funnel, DSH direction and the gate - your slate leads." },
  ART: { label: "Art lens", icon: Palette, cls: "text-violet-300 border-violet-400/30 bg-violet-400/10", blurb: "Identity drift and panel coverage lead your dashboard." },
  VOICE: { label: "Voice lens", icon: Mic2, cls: "text-teal-300 border-teal-400/30 bg-teal-400/10", blurb: "Casts, takes and auditions lead your dashboard." },
  REVIEW: { label: "Review lens", icon: MessagesSquare, cls: "text-sky-300 border-sky-400/30 bg-sky-400/10", blurb: "Approval queue and open crew threads lead your dashboard." },
};

function CraftChip({ emphasis }: { emphasis: StudioEmphasis }) {
  const { self } = emphasis;
  if (self.role === "OWNER") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase px-2 py-1 rounded border text-amber-300 border-amber-400/30 bg-amber-400/10">
        <Crown className="h-3 w-3" /> Owner - full studio, never blocked
      </span>
    );
  }
  const lens = CRAFT_CHIP[self.craft ?? "REVIEW"];
  const Icon = lens.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase px-2 py-1 rounded border ${lens.cls}`}>
      <UserCog className="h-3 w-3" /> {lens.label}
    </span>
  );
}

/** Studio-wide overview - the OWNER's wide lens (others never get it). */
function StudioWidePanel({ emphasis }: { emphasis: StudioEmphasis }) {
  const studio = emphasis.studio;
  const { setProject, setView } = useStudio();
  if (!studio) return null;
  return (
    <div className="studio-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-300" /> Studio-wide - {studio.projectCount} production{studio.projectCount === 1 ? "" : "s"}, {studio.memberCount} member{studio.memberCount === 1 ? "" : "s"}
        </h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">full access</span>
      </div>
      {studio.projects.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">No productions yet - create the first one from Productions.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {studio.projects.map((p) => (
            <button
              key={p.id}
              className="text-left rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 hover:border-primary/30 transition-colors"
              onClick={() => { setProject(p.id); setView("dashboard"); }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">{p.title}</span>
                {p.gate && <span className="text-[9px] px-1 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-300 shrink-0">GATE</span>}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {p.episodeCount} ep · {p.renderCount} renders · crew {p.crewCount} · {p.status}
              </div>
            </button>
          ))}
        </div>
      )}
      {studio.roster.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/8 flex flex-wrap gap-1.5">
          {studio.roster.map((m, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-muted-foreground">
              {m.name} · {m.role}{m.lastSeenAt ? " · live" : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Story funnel + latest DSH direction - the DIRECTING lens. */
function DirectingPanel({ emphasis }: { emphasis: StudioEmphasis }) {
  const p = emphasis.project!;
  const { setView } = useStudio();
  const lastDsh = [...p.dsh].reverse().find((m) => m.role === "dsh");
  return (
    <div className="studio-panel p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Film className="h-4 w-4 text-primary" /> Direction board
      </h3>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.funnel.episodes}</div>
          <div className="text-[10px] text-muted-foreground mt-1">episodes</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.funnel.scenes}</div>
          <div className="text-[10px] text-muted-foreground mt-1">scenes</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.funnel.approvedShots}/{p.funnel.shots}</div>
          <div className="text-[10px] text-muted-foreground mt-1">shots approved</div>
        </div>
      </div>
      {lastDsh ? (
        <div className="rounded-lg border border-violet-400/20 bg-violet-400/[0.05] p-3">
          <div className="text-[10px] uppercase tracking-widest text-violet-300 mb-1">DSH's latest direction</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">{lastDsh.content.slice(0, 320)}{lastDsh.content.length > 320 ? "…" : ""}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2">No DSH turns yet - open DSH Director to give the first direction.</p>
      )}
      <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs text-muted-foreground" onClick={() => setView("dsh")}>
        Open DSH Director <ArrowRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}

/** Identity drift + panel coverage - the ART lens. */
function ArtPanel({ emphasis }: { emphasis: StudioEmphasis }) {
  const p = emphasis.project!;
  const { setView } = useStudio();
  return (
    <div className="studio-panel p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Palette className="h-4 w-4 text-violet-300" /> Art pipeline
      </h3>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.art.panelsWithArt}/{p.art.panels}</div>
          <div className="text-[10px] text-muted-foreground mt-1">panels with art</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.identity.avg !== null ? `${p.identity.avg}%` : "·"}</div>
          <div className="text-[10px] text-muted-foreground mt-1">recent identity</div>
        </div>
      </div>
      {p.identity.latest.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No identity scores yet - generate panels and score them from Continuity.</p>
      ) : (
        <div className="space-y-1.5">
          {p.identity.latest.slice(0, 4).map((s) => {
            const pct = Math.round(s.worst * 100);
            return (
              <div key={s.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
                <Progress value={pct} className="h-1.5 flex-1" />
                <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">{s.source.toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      )}
      <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs text-muted-foreground" onClick={() => setView("continuity")}>
        Open Continuity <ArrowRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}

/** Voice cast + takes - the VOICE lens. */
function VoicePanel({ emphasis }: { emphasis: StudioEmphasis }) {
  const p = emphasis.project!;
  const { setView } = useStudio();
  return (
    <div className="studio-panel p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Mic2 className="h-4 w-4 text-teal-300" /> Voice desk
      </h3>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.voice.takes}</div>
          <div className="text-[10px] text-muted-foreground mt-1">rendered takes</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.voice.auditions}</div>
          <div className="text-[10px] text-muted-foreground mt-1">state auditions</div>
        </div>
      </div>
      {p.voice.cast.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No voice casting yet - bind roster artists to characters from Characters.</p>
      ) : (
        <div className="space-y-1.5">
          {p.voice.cast.map((c) => (
            <div key={c.character} className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5">
              <span className="text-xs font-medium truncate">{c.character}</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 truncate"><Radio className="h-3 w-3" />{c.artist}</span>
            </div>
          ))}
        </div>
      )}
      <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs text-muted-foreground" onClick={() => setView("timeline")}>
        Open sound timeline <ArrowRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}

/** Approval queue + open threads - the REVIEW lens (and the viewer's watch panel). */
function ReviewPanel({ emphasis }: { emphasis: StudioEmphasis }) {
  const p = emphasis.project!;
  const { setView } = useStudio();
  return (
    <div className="studio-panel p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-sky-300" /> Reviews &amp; threads
      </h3>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.render.awaitingApproval}</div>
          <div className="text-[10px] text-muted-foreground mt-1">awaiting approval</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.render.needsRevision}</div>
          <div className="text-[10px] text-muted-foreground mt-1">needs revision</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
          <div className="text-lg font-semibold leading-none">{p.threads.openCount}</div>
          <div className="text-[10px] text-muted-foreground mt-1">open threads</div>
        </div>
      </div>
      {p.threads.latest.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No open crew threads - the room is quiet.</p>
      ) : (
        <div className="space-y-1.5">
          {p.threads.latest.map((t) => (
            <div key={t.id} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5">
              <div className="text-[10px] text-muted-foreground">{t.authorName} on {t.anchorType.toLowerCase()}</div>
              <div className="text-[11px] truncate">{t.body}</div>
            </div>
          ))}
        </div>
      )}
      <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs text-muted-foreground" onClick={() => setView("reviews")}>
        Open Reviews <ArrowRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}

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
  const emphasisQ = useQuery({
    queryKey: ["emphasis", projectId],
    queryFn: () => api.emphasis(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 5000,
  });

  if (!projectQ.data || !emphasisQ.data?.project) {
    if (emphasisQ.data && !emphasisQ.data.project && emphasisQ.data.self) {
      // signed in but this production is not on their slate (or none selected)
      return (
        <div className="space-y-6">
          <SectionHeader title="Studio Dashboard" sub="AI-native production workspace" />
          <div className="studio-panel p-8 text-center">
            <CraftChip emphasis={emphasisQ.data} />
            <p className="text-sm text-muted-foreground mt-4">
              {emphasisQ.data.studio
                ? "Select a production from the header - you have access to every one of them."
                : "This production is not on your slate. Ask an OWNER to add you to the crew from the production's Crew panel."}
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const p = projectQ.data;
  const emphasis = emphasisQ.data;
  const ep = emphasis.project!;

  const allScenes = p.seasons.flatMap((s) => s.episodes.flatMap((e) => e.scenes));
  const allShots = allScenes.flatMap((s) => s.shots);
  const totalDuration = allShots.reduce((n, s) => n + s.duration, 0);
  const activeJobs = ep.render.active;
  const latestEvaluationJob = (jobsQ.data ?? []).find((j) => j.evaluation);
  const previewScene = allScenes.find((s) => s.shots.length > 0);

  const craft: Craft = emphasis.self.craft ?? "REVIEW";
  const isOwner = emphasis.self.role === "OWNER";
  const isViewer = emphasis.self.role === "VIEWER";
  const showDirecting = isOwner || craft === "DIRECTING" || (!isViewer && emphasis.self.craft === null);
  const showArt = isOwner || craft === "ART";
  const showVoice = isOwner || craft === "VOICE";
  const showReview = isOwner || craft === "REVIEW" || isViewer;
  const lens = CRAFT_CHIP[craft];

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Studio Dashboard - ${p.title}`}
        sub={p.logline ?? "AI-native production workspace"}
      />

      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <CraftChip emphasis={emphasis} />
        {ep.approvalGate && (
          <span className="text-[10px] px-2 py-1 rounded border border-amber-400/30 bg-amber-400/10 text-amber-300 uppercase tracking-widest">
            Human gate armed
          </span>
        )}
        <span className={`text-[10px] px-2 py-1 rounded border ${lens.cls} normal-case tracking-normal`}>{lens.blurb}</span>
      </div>

      {isOwner && <StudioWidePanel emphasis={emphasis} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Episodes" value={ep.funnel.episodes} hint={`${allScenes.length} scene(s)`} />
        <StatCard label="Characters" value={p.characters.length} hint="persistent entities" />
        <StatCard label="Shots" value={ep.funnel.shots} hint={`${ep.funnel.approvedShots} approved`} accent />
        <StatCard label="Screen time" value={`${Math.floor(ep.funnel.totalDurationSec / 60)}m ${ep.funnel.totalDurationSec % 60}s`} hint={`${totalDuration.toFixed(1)}s total`} />
      </div>

      {/* Emphasis panels: the caller's craft leads */}
      {(showDirecting || showArt || showVoice || showReview) && (
        <div className="grid lg:grid-cols-2 gap-4">
          {showDirecting && <DirectingPanel emphasis={emphasis} />}
          {showArt && <ArtPanel emphasis={emphasis} />}
          {showVoice && <VoicePanel emphasis={emphasis} />}
          {showReview && <ReviewPanel emphasis={emphasis} />}
        </div>
      )}

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
                      Production render <span className="text-muted-foreground">({job.mode}, attempt {job.attempt})</span>
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

        {/* Quick actions + context */}
        <div className="space-y-4">
          <div className="studio-panel p-4">
            <h3 className="text-sm font-semibold mb-3">Your desk</h3>
            <div className="space-y-2">
              {!isViewer && (
                <Button className="w-full justify-start h-9" onClick={() => setView("dsh")}>
                  <Users className="h-4 w-4 mr-2" /> Give DSH a direction
                </Button>
              )}
              <Button variant="outline" className="w-full justify-start h-9 border-white/12 bg-white/5" onClick={() => setView("story")}>
                <Film className="h-4 w-4 mr-2" /> Break down scenes
              </Button>
              {previewScene && (
                <Button variant="outline" className="w-full justify-start h-9 border-white/12 bg-white/5" onClick={() => openPreview(previewScene.id)}>
                  <MonitorPlay className="h-4 w-4 mr-2" /> Cinematic preview
                </Button>
              )}
              {isViewer && (
                <p className="text-[10px] text-muted-foreground leading-relaxed px-1">
                  You watch and speak here - directing stays with EDITORs and the OWNER.
                </p>
              )}
            </div>
          </div>

          <div className="studio-panel p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Production context
            </h3>
            <ScrollArea className="h-56 pr-2 studio-scroll">
              <div className="space-y-1.5">
                {ep.events.map((e) => (
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
