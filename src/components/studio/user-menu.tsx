"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Check, ChevronDown, Copy, KeyRound, Loader2, LogOut, ShieldCheck, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: string;
  lastSeenAt: string | null;
  createdAt: string;
}

interface InviteRow {
  id: string;
  code: string;
  role: string;
  projectId: string | null;
  projectTitle: string | null;
  craft: string | null;
  status: "ACTIVE" | "USED" | "EXPIRED" | "REVOKED";
  createdByName: string;
  usedBy: { id: string; name: string; email: string } | null;
  usedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface ProjectOption {
  id: string;
  title: string;
}

const ROLE_STYLE: Record<string, string> = {
  OWNER: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  EDITOR: "text-primary border-primary/30 bg-primary/10",
  VIEWER: "text-muted-foreground border-white/10 bg-white/5",
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  USED: "text-muted-foreground border-white/10 bg-white/5",
  EXPIRED: "text-orange-300 border-orange-400/30 bg-orange-400/10",
  REVOKED: "text-red-300 border-red-400/30 bg-red-400/10",
};

const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
const INVITE_ROLES = ["EDITOR", "VIEWER"] as const;
const CRAFTS = ["DIRECTING", "ART", "VOICE", "REVIEW"] as const;

function lastSeenLabel(iso: string | null): string {
  if (!iso) return "never active";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never active";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "active just now";
  if (mins < 60) return `active ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `active ${hours}h ago`;
  return `active ${Math.round(hours / 24)}d ago`;
}

/** The OWNER's keyring: cut single-use invites, hand out links, revoke what is unused. */
function InvitesDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [role, setRole] = useState<string>("VIEWER");
  const [projectId, setProjectId] = useState<string>("none");
  const [craft, setCraft] = useState<string>("REVIEW");
  const [expiry, setExpiry] = useState<string>("0");
  const [cutting, setCutting] = useState(false);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, proj] = await Promise.all([
        fetch("/api/invites").then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: {} }))),
        fetch("/api/projects").then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false, d: {} }))),
      ]);
      if (inv.ok) setRows(inv.d.invites ?? []);
      // /api/projects answers with a bare array (the caller's slate)
      if (proj.ok) setProjects(Array.isArray(proj.d) ? (proj.d as ProjectOption[]) : ((proj.d.projects ?? []) as ProjectOption[]));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function cutInvite() {
    setCutting(true);
    setFreshCode(null);
    setCopied(false);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          projectId: projectId === "none" ? undefined : projectId,
          craft: projectId === "none" ? undefined : craft,
          expiresInDays: expiry === "0" ? undefined : Number(expiry),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFreshCode(data.code);
        toast({ title: "Invite cut", description: data.note });
        await load();
      } else {
        toast({ title: "Could not cut invite", description: data.error ?? String(res.status) });
      }
    } finally {
      setCutting(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch("/api/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "revoke" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Invite revoked" });
        await load();
      } else {
        toast({ title: "Could not revoke", description: data.error ?? String(res.status) });
      }
    } finally {
      setRevokingId(null);
    }
  }

  const link = freshCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/signin?invite=${freshCode}`
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem
          className="text-xs cursor-pointer"
          onSelect={(e) => e.preventDefault()}
        >
          <KeyRound className="h-3.5 w-3.5 mr-2" /> Invites
          <ShieldCheck className="h-3 w-3 ml-auto text-amber-300" aria-label="owner only" />
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> Invites
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cut a single-use key: it carries the role the newcomer arrives with and, when you name a
            production, a seat on that crew. Ownership is never invited - it is earned in the roster.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Arrives as</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Expires</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0" className="text-xs">never</SelectItem>
                  <SelectItem value="7" className="text-xs">in 7 days</SelectItem>
                  <SelectItem value="30" className="text-xs">in 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Crew seat (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">no production</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Craft lens</Label>
              <Select value={craft} onValueChange={setCraft} disabled={projectId === "none"}>
                <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 disabled:opacity-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRAFTS.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button size="sm" className="w-full h-8 text-xs" disabled={cutting} onClick={() => void cutInvite()}>
            {cutting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <KeyRound className="h-3.5 w-3.5 mr-2" />}
            Cut invite
          </Button>
          {link && (
            <div className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-2 space-y-1.5">
              <p className="text-[10px] text-emerald-200">Hand this link to your newcomer - it registers them once:</p>
              <div className="flex items-center gap-1.5">
                <Input readOnly value={link} className="h-7 text-[10px] font-mono bg-black/30 border-white/10" onFocus={(e) => e.target.select()} />
                <Button
                  size="sm" variant="outline" className="h-7 px-2 shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      toast({ title: "Copy failed", description: "Select the link text and copy it manually." });
                    }
                  }}
                  aria-label="Copy invite link"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> loading invites…
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto studio-scroll -mx-1 px-1 space-y-1.5">
            {rows.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <span className="font-mono">{inv.code.slice(0, 4)}…{inv.code.slice(-2)}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border tracking-widest ${ROLE_STYLE[inv.role] ?? ROLE_STYLE.VIEWER}`}>{inv.role}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border tracking-widest ${STATUS_STYLE[inv.status] ?? ""}`}>{inv.status}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {inv.projectTitle ? `${inv.projectTitle} · ${inv.craft ?? "REVIEW"} lens · ` : "studio-wide · "}
                    {inv.usedBy ? `used by ${inv.usedBy.name}` : inv.expiresAt ? `expires ${new Date(inv.expiresAt).toLocaleDateString()}` : "no expiry"}
                  </div>
                </div>
                {inv.status === "ACTIVE" && (
                  revokingId === inv.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] text-red-300 hover:text-red-200" onClick={() => void revoke(inv.id)}>
                      <X className="h-3 w-3 mr-1" /> Revoke
                    </Button>
                  )
                )}
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No invites cut yet.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadRoster() {
    setLoading(true);
    try {
      const res = await fetch("/api/studio/members");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRows(data.users ?? []);
        setSelfId(data.selfId ?? null);
      } else {
        toast({ title: "Roster unavailable", description: data.error ?? String(res.status) });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadRoster();
  }, [open]);

  async function setRole(userId: string, role: string) {
    setSavingId(userId);
    try {
      const res = await fetch("/api/studio/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Role updated", description: data.note });
        await loadRoster();
      } else {
        toast({ title: "Could not update role", description: data.error ?? String(res.status) });
      }
    } finally {
      setSavingId(null);
    }
  }

  if (status === "loading") {
    return (
      <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> session…
      </span>
    );
  }

  const name = session?.user?.name ?? session?.user?.email ?? "member";
  const role = session?.user?.role ?? "VIEWER";
  const selfIsOwner = role === "OWNER";

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm" variant="outline"
              className="h-8 border-white/15 bg-white/5 gap-1.5 px-2"
              aria-label={`Signed in as ${name} (${role}) - account menu`}
            >
              <span className="h-5 w-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-semibold text-primary">
                {name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden md:inline max-w-[120px] truncate text-xs">{name}</span>
              <span className={`hidden lg:inline text-[9px] px-1.5 py-0.5 rounded border tracking-widest ${ROLE_STYLE[role] ?? ROLE_STYLE.VIEWER}`}>
                {role}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">
              <div className="font-semibold">{name}</div>
              <div className="text-muted-foreground font-normal">{session?.user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DialogTrigger asChild>
              <DropdownMenuItem className="text-xs cursor-pointer">
                <UsersRound className="h-3.5 w-3.5 mr-2" /> Studio roster
                {selfIsOwner && <ShieldCheck className="h-3 w-3 ml-auto text-amber-300" aria-label="you can manage roles" />}
              </DropdownMenuItem>
            </DialogTrigger>
            {selfIsOwner && <InvitesDialog />}
            <DropdownMenuItem
              className="text-xs cursor-pointer text-red-300 focus:text-red-300"
              onClick={() => void signOut({ callbackUrl: "/signin" })}
            >
              <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-4 w-4 text-primary" /> Studio roster
            </DialogTitle>
            <DialogDescription className="text-xs">
              The studio is a shared workspace. VIEWER reads, EDITOR directs and edits, OWNER manages this roster.
              {selfIsOwner ? " You are an OWNER - change roles below." : " Ask an OWNER to change roles."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> loading roster…
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto studio-scroll -mx-1 px-1 space-y-1.5">
              {rows.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-semibold text-primary">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {m.name}
                      {m.id === selfId && <span className="ml-1.5 text-[9px] text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.email} · {lastSeenLabel(m.lastSeenAt)}</div>
                  </div>
                  {selfIsOwner && m.id !== selfId ? (
                    savingId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Select value={m.role} onValueChange={(v) => void setRole(m.id, v)}>
                        <SelectTrigger className="h-7 w-[104px] text-[10px] bg-white/5 border-white/10" aria-label={`Role for ${m.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border tracking-widest ${ROLE_STYLE[m.role] ?? ROLE_STYLE.VIEWER}`}>
                      {m.role}
                    </span>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No members found.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
