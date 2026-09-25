"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Clapperboard, Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // The first account ever registered becomes OWNER - worth saying
  // on the empty studio.
  const [firstAccount, setFirstAccount] = useState(false);

  useEffect(() => {
    fetch("/api/studio/members").then(async (res) => {
      if (res.status === 401) {
        // Gate says: nobody is signed in. Probe whether the roster is empty.
        const reg = await fetch("/api/studio/roster-size").catch(() => null);
        if (reg && reg.ok) {
          const data = await reg.json().catch(() => null);
          setFirstAccount(Boolean(data && data.users === 0));
        }
      }
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Registration failed");
          setBusy(false);
          return;
        }
        setNote(data.note ?? "Registered - signing you in…");
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Wrong email or password");
        setBusy(false);
        return;
      }
      const from = params.get("from") || "/";
      router.push(from);
      router.refresh();
    } catch {
      setError("Something went wrong - try again");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a10] text-foreground p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">Animation OS</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">AI-Native Production</div>
          </div>
        </div>

        <form onSubmit={submit} className="studio-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">{mode === "signin" ? "Sign in to the studio" : "Join the studio"}</h1>
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "register" : "signin");
                setError(null);
                setNote(null);
              }}
            >
              {mode === "signin" ? "Need an account?" : "Have an account?"}
            </button>
          </div>

          {firstAccount && mode === "register" && (
            <p className="text-[11px] text-primary/90 border border-primary/25 bg-primary/10 rounded-md px-2.5 py-2">
              The studio has no members yet - the first account becomes <span className="font-semibold">OWNER</span>.
            </p>
          )}

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs text-muted-foreground">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Director name" autoComplete="name" required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.dev" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
            />
          </div>

          {error && (
            <p className="text-[11px] text-red-400 border border-red-400/25 bg-red-400/10 rounded-md px-2.5 py-2" role="alert">
              {error}
            </p>
          )}
          {note && (
            <p className="text-[11px] text-emerald-300 border border-emerald-400/25 bg-emerald-400/10 rounded-md px-2.5 py-2">
              {note}
            </p>
          )}

          <Button type="submit" className="w-full h-9" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : mode === "signin" ? <LogIn className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            {mode === "signin" ? "Sign in" : "Register"}
          </Button>

          <p className="text-[10px] leading-relaxed text-muted-foreground/70">
            Roles: <span className="text-foreground/80">VIEWER</span> reads the studio, <span className="text-foreground/80">EDITOR</span> directs
            DSH and edits productions, <span className="text-foreground/80">OWNER</span> manages the roster. New accounts start as VIEWER.
          </p>
        </form>
      </div>
    </div>
  );
}
