"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { ChevronDown, Loader2, LogOut, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const ROLE_STYLE: Record<string, string> = {
  OWNER: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  EDITOR: "text-primary border-primary/30 bg-primary/10",
  VIEWER: "text-muted-foreground border-white/10 bg-white/5",
};

const ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;

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
