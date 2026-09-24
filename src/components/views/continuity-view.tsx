"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Loader2, ScanEye } from "lucide-react";
import { api } from "@/lib/api-client";
import { useStudio } from "@/lib/store";
import { SectionHeader } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const KIND_COLORS: Record<string, string> = {
  DESTROYED: "border-rose-400/40 text-rose-300 bg-rose-400/10",
  INJURED: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  LOST: "border-amber-400/40 text-amber-300 bg-amber-400/10",
  GAINED: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  TRANSFORMED: "border-violet-400/40 text-violet-300 bg-violet-400/10",
  ART_DRIFT: "border-rose-400/40 text-rose-300 bg-rose-400/10",
  ART_VERIFIED: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
  CUSTOM: "border-white/20 text-muted-foreground bg-white/5",
};

interface ArtItem {
  kind: "stale-state" | "stale-anchor" | "anchor-missing";
  severity: "INFO" | "WARNING";
  characterName: string;
  note: string;
}

interface ArtShotReport {
  shotId: string;
  ref: string;
  episode: number;
  sceneNumber: number;
  number: number;
  description: string;
  hasArt: boolean;
  items: ArtItem[];
}

interface ArtScan {
  shots: ArtShotReport[];
  counts: { staleState: number; staleAnchor: number; anchorMissing: number; checked: number; flagged: number };
}

/**
 * Art-aware continuity: the art layer joins the continuity engine.
 * The scan compares timestamps (panel art vs the episode-active state
 * and the current model-sheet anchor) and coverage (featured cast
 * without a sheet); the VLM check sends a hero panel against the
 * character's canonical sheet and lands an ART_DRIFT / ART_VERIFIED
 * continuity event.
 */
function ArtContinuityPanel({ projectId }: { projectId: string }) {
  const [scan, setScan] = useState<ArtScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ shotRef: string; text: string; clean: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetch(`/api/continuity-art?projectId=${projectId}`);
      const body = (await res.json()) as ArtScan;
      setScan(body);
    } catch {
      setError("Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function runVlmCheck(shotId: string, ref: string) {
    setChecking(shotId);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/continuity-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId }),
      });
      const body = (await res.json()) as { error?: string; verdict?: { summary: string; drift: Array<{ aspect: string; note: string }>; characterName: string | null }; eventKind?: string };
      if (!res.ok || body.error) {
        setVerdict({ shotRef: ref, text: body.error ?? "VLM check failed", clean: false });
      } else if (body.verdict && body.eventKind) {
        const driftTxt = body.verdict.drift.map((d) => `${d.aspect}: ${d.note}`).join("; ");
        setVerdict({
          shotRef: ref,
          text: `${body.eventKind} vs ${body.verdict.characterName}'s sheet - ${body.verdict.summary}${driftTxt ? ` (${driftTxt})` : ""}`,
          clean: body.eventKind === "ART_VERIFIED",
        });
      }
    } catch {
      setVerdict({ shotRef: ref, text: "VLM check failed", clean: false });
    } finally {
      setChecking(null);
    }
  }

  const flagged = (scan?.shots ?? []).filter((s) => s.items.length > 0).slice(0, 8);
  const ITEM_COLORS: Record<string, string> = {
    "stale-state": "border-amber-400/30 text-amber-200 bg-amber-400/10",
    "stale-anchor": "border-violet-400/30 text-violet-200 bg-violet-400/10",
    "anchor-missing": "border-white/20 text-muted-foreground bg-white/5",
  };

  return (
    <div className="studio-panel p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ScanEye className="h-4 w-4 text-teal-300" /> Art-aware continuity
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 max-w-xl">
            The art layer joins the continuity engine: panel art is checked against the episode-active state and the
            character&apos;s canonical model-sheet anchor, and a vision check compares a hero panel against the sheet itself.
          </p>
        </div>
        <Button size="sm" variant="outline" className="border-teal-400/25 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20" onClick={() => void runScan()} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ScanEye className="h-4 w-4 mr-1.5" />}
          Scan art layer
        </Button>
      </div>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}

      {verdict && (
        <div className={cn(
          "rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
          verdict.clean ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-amber-400/25 bg-amber-400/10 text-amber-200"
        )}>
          <span className="font-semibold">{verdict.shotRef}</span> - {verdict.text}
        </div>
      )}

      {scan && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-muted-foreground">{scan.counts.checked} shots checked</span>
          <span className="px-2 py-1 rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-200">{scan.counts.staleState} stale vs state</span>
          <span className="px-2 py-1 rounded-md border border-violet-400/25 bg-violet-400/10 text-violet-200">{scan.counts.staleAnchor} stale vs anchor</span>
          <span className="px-2 py-1 rounded-md border border-white/15 bg-white/5 text-muted-foreground">{scan.counts.anchorMissing} missing anchors</span>
          {scan.counts.flagged === 0 && (
            <span className="px-2 py-1 rounded-md border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">art layer clean</span>
          )}
        </div>
      )}

      {flagged.length > 0 && (
        <div className="space-y-1.5">
          {flagged.map((s) => (
            <div key={s.shotId} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{s.ref}</span>
                  <span className="text-[11px] truncate">{s.description}</span>
                </div>
                {s.hasArt && (
                  <button
                    onClick={() => void runVlmCheck(s.shotId, s.ref)}
                    disabled={checking === s.shotId}
                    title="Vision check: compare this panel against the featured character's canonical model sheet"
                    className="h-6 shrink-0 rounded-md border border-teal-400/25 bg-teal-400/10 px-2 text-[9px] font-semibold text-teal-200 hover:bg-teal-400/20 transition-colors disabled:opacity-40"
                  >
                    {checking === s.shotId ? <Loader2 className="h-3 w-3 animate-spin" /> : "VLM check"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {s.items.map((it, i) => (
                  <span key={i} title={it.note} className={cn("px-1.5 py-0.5 rounded border text-[9px]", ITEM_COLORS[it.kind])}>
                    {it.kind} - {it.characterName}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddEventDialog() {
  const qc = useQueryClient();
  const { projectId } = useStudio();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ entityName: "", entityType: "PROP", kind: "DESTROYED", episodeNumber: "", description: "", severity: "WARNING" });

  async function create() {
    setBusy(true);
    try {
      await api.addContinuityEvent({
        projectId,
        entityName: form.entityName,
        entityType: form.entityType,
        kind: form.kind,
        episodeNumber: form.episodeNumber ? Number(form.episodeNumber) : undefined,
        description: form.description,
        severity: form.severity,
      });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setOpen(false);
      setForm({ entityName: "", entityType: "PROP", kind: "DESTROYED", episodeNumber: "", description: "", severity: "WARNING" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-white/12 bg-white/5"><Plus className="h-4 w-4 mr-1.5" /> Register event</Button>
      </DialogTrigger>
      <DialogContent className="bg-card max-w-md">
        <DialogHeader><DialogTitle>Register continuity event</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Entity name</Label>
              <Input value={form.entityName} onChange={(e) => setForm({ ...form, entityName: e.target.value })} placeholder="Jade Sword" className="bg-white/5 border-white/12" />
            </div>
            <div className="grid gap-1.5"><Label>Episode #</Label>
              <Input type="number" value={form.episodeNumber} onChange={(e) => setForm({ ...form, episodeNumber: e.target.value })} className="bg-white/5 border-white/12" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Type</Label>
              <select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} className="h-9 rounded-md bg-white/5 border border-white/12 px-3 text-sm">
                {["PROP", "CHARACTER", "ENVIRONMENT", "ABILITY"].map((v) => <option key={v} className="bg-card">{v}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label>Kind</Label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="h-9 rounded-md bg-white/5 border border-white/12 px-3 text-sm">
                {["DESTROYED", "INJURED", "GAINED", "LOST", "TRANSFORMED", "CUSTOM"].map((v) => <option key={v} className="bg-card">{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shattered against Demon Lord Wei's chains…" className="bg-white/5 border-white/12" />
          </div>
          <Button onClick={create} disabled={busy || !form.entityName.trim()}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Register</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContinuityView({ project }: { project: import("@/lib/api-client").StudioProject }) {
  const eventsQ = useQuery({
    queryKey: ["continuity", project.id],
    queryFn: async () => {
      const res = await fetch(`/api/continuity?projectId=${project.id}`);
      return res.json() as Promise<Array<{
        id: string; entityType: string; entityName: string; kind: string;
        episodeNumber: number | null; description: string; severity: string;
      }>>;
    },
    refetchInterval: 8000,
  });

  return (
    <div>
      <SectionHeader
        title="Continuity Engine"
        sub="First-class canonical history. The system never silently creates an inconsistent asset - story text is checked against these events (see a scene in Story & Scenes for live conflict detection)."
        right={<AddEventDialog />}
      />
      <div className="space-y-2.5 max-h-[calc(100vh-13rem)] overflow-y-auto studio-scroll pr-1">
        <ArtContinuityPanel projectId={project.id} />
        {(eventsQ.data ?? []).map((ev) => (
          <div key={ev.id} className="studio-panel p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <ShieldAlert className={cn("h-4 w-4", ev.severity === "CRITICAL" ? "text-rose-400" : "text-amber-400")} />
                <span className="text-sm font-semibold">{ev.entityName}</span>
                <Badge variant="outline" className={cn("text-[10px]", KIND_COLORS[ev.kind] ?? KIND_COLORS.CUSTOM)}>{ev.kind}</Badge>
                <span className="text-[11px] text-muted-foreground">{ev.entityType}{ev.episodeNumber != null ? ` · Episode ${ev.episodeNumber}` : ""}</span>
              </div>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded border",
                ev.severity === "CRITICAL" ? "border-rose-400/30 text-rose-300 bg-rose-400/10"
                : ev.severity === "WARNING" ? "border-amber-400/30 text-amber-300 bg-amber-400/10"
                : "border-white/15 text-muted-foreground bg-white/5")}>
                {ev.severity}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed mt-2">{ev.description}</p>
          </div>
        ))}
        {(eventsQ.data ?? []).length === 0 && (
          <div className="studio-panel p-10 text-center text-sm text-muted-foreground">No continuity events registered yet.</div>
        )}
      </div>
    </div>
  );
}
