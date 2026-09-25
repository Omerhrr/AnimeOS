"use client";

// ─────────────────────────────────────────────────────────────
// WORKPLACE THREAD (Iteration 48)
//
// The one comment surface, reused everywhere a thread hangs:
// render queue cards (SHOT anchors), the Reviews view (every
// anchor), anywhere the crew talks about the work. EVERY signed-in
// member may speak (the proxy allowlists exactly /api/comments for
// VIEWERs); resolving stays with the thread's author and EDITOR+.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { CheckCircle2, Circle, Loader2, SendHorizonal } from "lucide-react";
import { api, type CommentRow } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function CommentThread({
  anchorType,
  anchorId,
  label,
  className,
}: {
  anchorType: string;
  anchorId: string;
  label?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const me = session?.user;
  const canModerate = me?.role === "OWNER" || me?.role === "EDITOR";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const threadQ = useQuery({
    queryKey: ["comments", anchorType, anchorId],
    queryFn: () => api.comments(anchorType, anchorId),
    refetchInterval: 15000,
  });

  const comments = threadQ.data ?? [];
  const openCount = comments.filter((c) => !c.resolved).length;

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.addComment(anchorType, anchorId, body);
      setDraft("");
      qc.invalidateQueries({ queryKey: ["comments", anchorType, anchorId] });
      qc.invalidateQueries({ queryKey: ["projectComments"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not post the comment");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(c: CommentRow, to: boolean) {
    setBusy(true);
    try {
      await api.resolveComment(c.id, to);
      qc.invalidateQueries({ queryKey: ["comments", anchorType, anchorId] });
      qc.invalidateQueries({ queryKey: ["projectComments"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not resolve the thread");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Thread{label ? ` - ${label}` : ""}</span>
        <span className="tabular-nums normal-case tracking-normal">{openCount} open · {comments.length} total</span>
      </div>

      {threadQ.isLoading ? (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading thread...</div>
      ) : comments.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">No comments yet - the crew is quiet on this one.</div>
      ) : (
        <div className="space-y-1.5">
          {comments.map((c) => {
            const mine = me?.id === c.authorId;
            const canResolve = mine || canModerate;
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed",
                  c.resolved ? "border-emerald-400/20 bg-emerald-400/[0.03] opacity-75" : "border-white/10 bg-white/[0.03]"
                )}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold">{c.authorName}</span>
                  {mine && <span className="text-[9px] rounded px-1 border border-white/12 bg-white/5 text-muted-foreground">you</span>}
                  <span className="text-muted-foreground" title={new Date(c.createdAt).toLocaleString()}>{ago(c.createdAt)}</span>
                  {c.resolved && (
                    <span className="text-[9px] font-bold tracking-widest rounded px-1 border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">RESOLVED</span>
                  )}
                  {canResolve && (
                    <button
                      className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => resolve(c, !c.resolved)}
                    >
                      {c.resolved ? "Reopen" : "Resolve"}
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-1.5 items-end">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Speak up - every member of the studio can comment..."
          className="min-h-[36px] h-[36px] max-h-24 text-[11px] resize-none bg-black/25"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void post();
          }}
        />
        <Button size="sm" className="h-9 text-[11px] shrink-0" disabled={busy || !draft.trim()} onClick={() => void post()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
        {openCount > 0 ? <Circle className="h-2.5 w-2.5 text-amber-400" /> : <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />}
        <span>Enter+Ctrl to post · the author or EDITOR+ resolves</span>
      </div>
    </div>
  );
}
