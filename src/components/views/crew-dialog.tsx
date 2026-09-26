"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound, Loader2, UserPlus, Trash2, Crown, KeyRound, Copy, Check } from "lucide-react";
import { api, type Craft } from "@/lib/api-client";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const CRAFTS: Array<{ id: Craft; label: string; hint: string }> = [
  { id: "DIRECTING", label: "Directing", hint: "story + DSH lead" },
  { id: "ART", label: "Art", hint: "panels + identity" },
  { id: "VOICE", label: "Voice", hint: "casts + takes" },
  { id: "REVIEW", label: "Review", hint: "gate + threads" },
];

const ROLE_STYLE: Record<string, string> = {
  OWNER: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  EDITOR: "text-primary border-primary/30 bg-primary/10",
  VIEWER: "text-muted-foreground border-white/10 bg-white/5",
};

/** The per-production crew panel: OWNER manages membership and craft
 *  lenses, members see their crew, everyone else never gets here
 *  (the production itself is not on their slate). */
export function CrewDialog({ projectId, title }: { projectId: string; title: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "VIEWER";
  const isOwner = role === "OWNER";
  const [open, setOpen] = useState(false);
  const [addUserId, setAddUserId] = useState<string>("");
  const [addCraft, setAddCraft] = useState<Craft>("REVIEW");
  const [busy, setBusy] = useState(false);
  // Invite cutting (Iteration 50): a key for someone NOT in the
  // studio yet, pre-aimed at THIS production's crew.
  const [inviteRole, setInviteRole] = useState<string>("VIEWER");
  const [inviteCraft, setInviteCraft] = useState<Craft>("REVIEW");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const qc = useQueryClient();
  const crewQ = useQuery({
    queryKey: ["crew", projectId],
    queryFn: () => api.crew(projectId),
    enabled: open,
  });

  async function run(fn: () => Promise<{ note?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.note) toast({ title: "Crew updated", description: res.note });
      await qc.invalidateQueries({ queryKey: ["crew", projectId] });
      await qc.invalidateQueries({ queryKey: ["emphasis"] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      toast({ title: "Crew change failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function cutInvite() {
    setInviteBusy(true);
    setInviteLink(null);
    setInviteCopied(false);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole, projectId, craft: inviteCraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInviteLink(`${window.location.origin}/signin?invite=${data.code}`);
        toast({ title: "Invite cut", description: data.note });
      } else {
        toast({ title: "Could not cut invite", description: data.error ?? String(res.status) });
      }
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm" variant="outline"
          className="h-7 text-[11px] border-white/15 bg-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          <UsersRound className="h-3.5 w-3.5 mr-1" /> Crew
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UsersRound className="h-4 w-4 text-primary" /> Crew - {title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isOwner
              ? "You own the studio: add or remove crew and set each member's craft lens. Craft leads their dashboard - it is not a permission."
              : "Your crew on this production. Your craft lens decides which dashboard panels lead; ask an OWNER to change membership."}
          </DialogDescription>
        </DialogHeader>

        {crewQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> loading crew…
          </div>
        ) : crewQ.isError ? (
          <p className="text-xs text-red-300 py-4 text-center">This production is not on your slate - crew visible to members only.</p>
        ) : crewQ.data ? (
          <div className="space-y-3">
            {crewQ.data.viaOwner && (
              <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                <Crown className="h-3 w-3" /> You are an OWNER - implicit member of every crew, never blocked.
              </p>
            )}

            {isOwner && crewQ.data.candidates.length > 0 && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select value={addUserId} onValueChange={setAddUserId}>
                    <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10">
                      <SelectValue placeholder="Add a studio member…" />
                    </SelectTrigger>
                    <SelectContent>
                      {crewQ.data.candidates.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">
                          {u.name} · {u.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select value={addCraft} onValueChange={(v) => setAddCraft(v as Craft)}>
                  <SelectTrigger className="h-8 w-[120px] text-xs bg-white/5 border-white/10" aria-label="craft for the new member">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRAFTS.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm" className="h-8"
                  disabled={busy || !addUserId}
                  onClick={() => {
                    void run(() => api.addCrewMember(projectId, { userId: addUserId, craft: addCraft }));
                    setAddUserId("");
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
            )}

            {isOwner && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Not in the studio yet? Cut an invite for this crew</Label>
                    <div className="flex gap-2">
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 w-[100px]" aria-label="invite role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VIEWER" className="text-xs">VIEWER</SelectItem>
                          <SelectItem value="EDITOR" className="text-xs">EDITOR</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={inviteCraft} onValueChange={(v) => setInviteCraft(v as Craft)}>
                        <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 w-[120px]" aria-label="invite craft lens">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CRAFTS.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={inviteBusy} onClick={() => void cutInvite()}>
                        {inviteBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <KeyRound className="h-3.5 w-3.5 mr-1" />} Cut
                      </Button>
                    </div>
                  </div>
                </div>
                {inviteLink && (
                  <div className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2 py-1.5 flex items-center gap-1.5">
                    <Input readOnly value={inviteLink} className="h-6 text-[10px] font-mono bg-black/30 border-white/10" onFocus={(e) => e.target.select()} />
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                      aria-label="Copy invite link"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteLink);
                          setInviteCopied(true);
                          setTimeout(() => setInviteCopied(false), 1500);
                        } catch {
                          toast({ title: "Copy failed", description: "Select the link and copy it manually." });
                        }
                      }}
                    >
                      {inviteCopied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto studio-scroll -mx-1 px-1 space-y-1.5">
              {crewQ.data.members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-semibold text-primary">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {m.name}
                      {m.userId === crewQ.data.selfId && <span className="ml-1.5 text-[9px] text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border tracking-widest shrink-0 ${ROLE_STYLE[m.role] ?? ROLE_STYLE.VIEWER}`}>
                    {m.role}
                  </span>
                  {isOwner ? (
                    <>
                      <Select
                        value={m.craft}
                        onValueChange={(v) => void run(() => api.patchCraft(projectId, { userId: m.userId, craft: v }))}
                      >
                        <SelectTrigger className="h-7 w-[110px] text-[10px] bg-white/5 border-white/10 shrink-0" aria-label={`Craft lens for ${m.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CRAFTS.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.label} <span className="text-muted-foreground">· {c.hint}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-red-300 hover:text-red-200 shrink-0"
                        aria-label={`Remove ${m.name} from the crew`}
                        disabled={busy}
                        onClick={() => void run(() => api.removeCrewMember(projectId, m.userId))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground shrink-0">{m.craft.toLowerCase()} lens</span>
                  )}
                </div>
              ))}
              {crewQ.data.members.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No crew yet - only OWNERs (who see everything) can open this production.
                </p>
              )}
            </div>

            {crewQ.data.selfCraft && !crewQ.data.viaOwner && (
              <div className="pt-1 border-t border-white/8 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Your lens on this production:</span>
                <Select
                  value={crewQ.data.selfCraft}
                  onValueChange={(v) => void run(() => api.patchCraft(projectId, { userId: crewQ.data.selfId, craft: v }))}
                >
                  <SelectTrigger className="h-7 w-[120px] text-[10px] bg-white/5 border-white/10" aria-label="your craft lens">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRAFTS.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
