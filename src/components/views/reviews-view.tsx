"use client";

// ─────────────────────────────────────────────────────────────
// REVIEWS VIEW (Iteration 48: the studio becomes a workplace)
//
// The collaboration surface: renders parked at the human approval
// gate on one side, the crew's open comment threads on the other.
// VIEWERs read and speak here; approving and rejecting stay with
// EDITOR+ (DB-fresh on the API, session-shaped in the UI).
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  CheckCheck, ChevronDown, ChevronUp, Loader2, MessagesSquare, MessageSquare,
  Send, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";
import { api, type CommentRow, type StudioProject } from "@/lib/api-client";
import { SectionHeader } from "@/components/views/shared";
import { CommentThread } from "@/components/views/comment-thread";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ReviewsView({ project }: { project: StudioProject }) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const canDirect = session?.user?.role === "OWNER" || session?.user?.role === "EDITOR";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ["renderJobs", project.id],
    queryFn: () => api.renderJobs(project.id),
    refetchInterval: 4000,
  });
  const commentsQ = useQuery({
    queryKey: ["projectComments", project.id],
    queryFn: () => api.projectComments(project.id),
    refetchInterval: 10000,
  });

  const held = useMemo(
    () => (jobsQ.data ?? []).filter((j) => j.status === "REVIEW" && j.evaluation?.verdict === "APPROVED"),
    [jobsQ.data],
  );

  const openThreads = useMemo(() => {
    const all = commentsQ.data ?? [];
    const unresolved = all.filter((c) => !c.resolved);
    const groups = new Map<string, CommentRow[]>();
    for (const c of unresolved) {
      const key = `${c.anchorType}:${c.anchorId}`;
      const rows = groups.get(key) ?? [];
      rows.push(c);
      groups.set(key, rows);
    }
    return Array.from(groups.entries())
      .map(([key, rows]) => ({ key, rows: rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }))
      .sort((a, b) => b.rows[b.rows.length - 1].createdAt.localeCompare(a.rows[a.rows.length - 1].createdAt));
  }, [commentsQ.data]);

  // anchor labels resolved through the project tree when possible
  const anchorLabel = useMemo(() => {
    const shotIndex = new Map<string, { sceneNumber: number; shotNumber: number }>();
    const sceneIndex = new Map<string, { sceneNumber: number; title: string }>();
    const episodeIndex = new Map<string, { epNumber: number; title: string }>();
    for (const season of project.seasons) {
      for (const ep of season.episodes) {
        episodeIndex.set(ep.id, { epNumber: ep.number, title: ep.title });
        for (const sc of ep.scenes) {
          sceneIndex.set(sc.id, { sceneNumber: sc.number, title: sc.title });
          for (const sh of sc.shots) shotIndex.set(sh.id, { sceneNumber: sc.number, shotNumber: sh.number });
        }
      }
    }
    return (c: CommentRow): string => {
      switch (c.anchorType) {
        case "SHOT": {
          const s = shotIndex.get(c.anchorId);
          return s ? `Shot ${String(s.shotNumber).padStart(3, "0")} (Scene ${s.sceneNumber})` : `Shot ${c.anchorId.slice(-6)}`;
        }
        case "SCENE": {
          const s = sceneIndex.get(c.anchorId);
          return s ? `Scene ${s.sceneNumber} "${s.title}"` : `Scene ${c.anchorId.slice(-6)}`;
        }
        case "EPISODE": {
          const e = episodeIndex.get(c.anchorId);
          return e ? `Episode ${e.epNumber} "${e.title}"` : `Episode ${c.anchorId.slice(-6)}`;
        }
        case "TAKE":
          return `Voice take ${c.anchorId.slice(-6)}`;
        case "FACT":
          return `Canon fact ${c.anchorId.slice(-6)}`;
        default:
          return `${c.anchorType} ${c.anchorId.slice(-6)}`;
      }
    };
  }, [project]);

  async function approve(jobId: string) {
    setBusyId(jobId);
    try {
      await api.renderApprove(jobId);
      qc.invalidateQueries({ queryKey: ["renderJobs", project.id] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(jobId: string) {
    const note = rejectNote.trim();
    if (!note) return;
    setBusyId(jobId);
    try {
      await api.renderReject(jobId, note);
      setRejectingId(null);
      setRejectNote("");
      qc.invalidateQueries({ queryKey: ["renderJobs", project.id] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["projectComments", project.id] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send the revision request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Reviews"
        sub={
          project.approvalGate
            ? "The human approval gate is ARMED: DSH-approved renders wait here for a creator's decision, and the crew's open threads hang beside them."
            : "The crew's open threads. Arm the human approval gate (Render Queue) and DSH-approved renders will also wait here for a creator's decision."
        }
      />

      <div
        className={cn(
          "studio-panel p-4 mb-5 flex items-center gap-3",
          project.approvalGate ? "border-amber-400/30" : ""
        )}
      >
        <div className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border",
          project.approvalGate ? "bg-amber-400/10 border-amber-400/30" : "bg-white/5 border-white/12"
        )}>
          <ShieldAlert className={cn("h-4.5 w-4.5", project.approvalGate ? "text-amber-300" : "text-muted-foreground")} />
        </div>
        <div className="min-w-0 text-sm">
          <div className="font-semibold">
            Human approval gate: {project.approvalGate ? "ARMED" : "off"}
            {held.length > 0 && (
              <span className="ml-2 text-[9px] font-bold tracking-widest rounded px-1.5 py-0.5 border border-amber-400/40 bg-amber-400/10 text-amber-200 align-middle">
                {held.length} AWAITING DECISION
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
            {project.approvalGate
              ? "A DSH APPROVED inspection is a recommendation: the render parks at REVIEW and only a creator's approve releases it into FINAL. The gate is OWNER policy, toggled on the Render Queue."
              : "DSH approvals land directly. Arm the gate when you want the final say on every render before it counts."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
        <ShieldCheck className="h-3.5 w-3.5" /> Awaiting creator approval
      </div>
      {held.length === 0 ? (
        <div className="studio-panel p-6 text-center text-sm text-muted-foreground mb-6">
          {project.approvalGate
            ? "Nothing waits at the gate. Renders DSH approves will queue up here."
            : "The gate is off - nothing parks here. Arm it from the Render Queue to review DSH-approved renders yourself."}
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {held.map((job) => (
            <div key={job.id} className="studio-panel p-4 border-amber-400/25">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    {job.shot?.scene ? `Scene ${job.shot.scene.number} · ` : ""}
                    {job.shot ? `Shot ${String(job.shot.number).padStart(3, "0")}` : "Production master"}
                    <span className="text-[11px] font-normal text-muted-foreground">{job.mode} · attempt {job.attempt}</span>
                    <span className="text-[9px] font-bold tracking-widest rounded px-1.5 py-0.5 border border-amber-400/40 bg-amber-400/10 text-amber-200">HELD</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{job.evaluation?.summary}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{job.stage}</p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {canDirect && (
                    <>
                      <Button size="sm" className="h-7 text-[11px]" disabled={busyId === job.id} onClick={() => void approve(job.id)}>
                        {busyId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />} Approve - mark FINAL
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] border-rose-400/30 bg-rose-400/5 text-rose-200"
                        onClick={() => { setRejectingId(rejectingId === job.id ? null : job.id); setRejectNote(""); }}>
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {rejectingId === job.id && (
                <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-400/[0.04] p-3">
                  <div className="text-[11px] font-medium text-rose-200 mb-1.5">Request a revision - the note lands in this shot's thread</div>
                  <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Say what to fix..." className="min-h-[52px] text-[11px] bg-black/25 resize-none" />
                  <div className="flex justify-end gap-1.5 mt-2">
                    <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5" onClick={() => { setRejectingId(null); setRejectNote(""); }}>Cancel</Button>
                    <Button size="sm" className="h-7 text-[11px]" disabled={!rejectNote.trim() || busyId === job.id} onClick={() => void reject(job.id)}>
                      {busyId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />} Send
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
        <MessagesSquare className="h-3.5 w-3.5" /> Open crew threads ({openThreads.length})
      </div>
      {openThreads.length === 0 ? (
        <div className="studio-panel p-6 text-center text-sm text-muted-foreground">
          Every thread is resolved. Comment on any shot from its render card's Discuss button - every member of the studio can speak.
        </div>
      ) : (
        <div className="space-y-2">
          {openThreads.map(({ key, rows }) => {
            const last = rows[rows.length - 1];
            const expanded = openThread === key;
            return (
              <div key={key} className="studio-panel p-3">
                <button className="w-full text-left" onClick={() => setOpenThread(expanded ? null : key)}>
                  <div className="flex items-center gap-2 flex-wrap text-xs font-medium">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    {anchorLabel(last)}
                    <span className="text-[9px] font-bold tracking-widest rounded px-1 border border-amber-400/30 bg-amber-400/10 text-amber-300">
                      {rows.length} OPEN
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                      last {agoLabel(last.createdAt)} · {expanded ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />}
                    </span>
                  </div>
                  {!expanded && (
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-1">
                      <b className="font-medium text-foreground">{last.authorName}:</b> {last.body}
                    </p>
                  )}
                </button>
                {expanded && (
                  <div className="mt-3 pt-3 border-t border-white/8">
                    <CommentThread anchorType={last.anchorType} anchorId={last.anchorId} label={anchorLabel(last)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
