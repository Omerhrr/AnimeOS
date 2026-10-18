"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, CalendarClock, CalendarX2, CheckCircle2, ClipboardList, Map as MapIcon, Ban } from "lucide-react";
import { api, type ReleaseEpisode, type ReleaseReviewPayload } from "@/lib/api-client";
import { SectionHeader, StatusBadge } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// THE RELEASE CALENDAR (iteration 68): when the show meets its
// audience. Slated episodes plot on a month grid; DUE/RELEASED are
// computed at read time from the release date (no state to drift);
// the unscheduled tray lists what has no date yet. EDITOR+ slate
// and unschedule (calendar dialog or the DSH tool); the crew reads.
//
// THE RELEASE REVIEW, READ (iteration 233): the panel also reads
// the map - the gate's own refusal turned into the path between the
// episode and its first RELEASE verdict, plus the work orders the
// 233 law derives (the named worst refs, the answerer named). The
// review is a map, not a lever: read-only for everyone - the gate
// keeps its teeth.
// ─────────────────────────────────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StateChip({ ep }: { ep: ReleaseEpisode }) {
  if (ep.state === "DUE") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
        <CheckCircle2 className="h-2.5 w-2.5" /> {ep.releaseAt && ep.releaseAt.slice(0, 10) < dayKey(new Date()) ? "released" : "due"}
      </span>
    );
  }
  if (ep.state === "SLATED") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border border-sky-400/40 bg-sky-400/10 text-sky-300">
        <CalendarClock className="h-2.5 w-2.5" /> in {ep.daysUntil}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border border-white/15 bg-white/5 text-muted-foreground">
      <CalendarX2 className="h-2.5 w-2.5" /> unscheduled
    </span>
  );
}

// THE VERDICT CHIP (the gate's own word, colored) + the review
// section (iteration 233): headline, per-source map, work orders,
// THE PATH. Read-only - the map rides, the gate keeps its teeth.
const VERDICT_CHIP: Record<string, string> = {
  RELEASE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  HOLD: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  BELOW: "border-red-400/40 bg-red-400/10 text-red-300",
  UNSCORED: "border-white/15 bg-white/5 text-muted-foreground",
};

const ANSWERER_WORD: Record<string, string> = {
  "repair-pass": "the repair pass answers",
  "night-law": "the night law answers",
  "measure-first": "measure first",
};

function ReleaseReviewSection({ payload }: { payload: ReleaseReviewPayload }) {
  const { review, workOrders } = payload;
  return (
    <div className="studio-panel p-4 mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-primary" /> The release review
        </h3>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border", VERDICT_CHIP[review.standing.verdict])}>
            {review.standing.verdict}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">law v{review.law.version}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {review.headline} · reviewed {review.reviewedAt.slice(0, 10)} · {review.episodeTag} “{review.episodeTitle}”
      </p>
      <div className="grid md:grid-cols-2 gap-2 mb-3">
        {review.sources.map((s) => {
          const order = workOrders.find((o) => o.source === s.source);
          return (
            <div key={s.source} className="rounded border border-white/8 bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold">{s.source}</span>
                <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border", VERDICT_CHIP[s.verdict])}>{s.verdict}</span>
              </div>
              <p className="text-[11px] leading-relaxed mb-1.5">{s.gapLine}</p>
              <p className="text-[10px] text-muted-foreground mb-1">{s.spanLine} · floor {Math.round(s.floor * 100)}%</p>
              {s.blocking.length > 0 && (
                <p className="text-[10px] text-muted-foreground mb-1">
                  blockers: {s.blocking.map((b) => `${b.key} ${b.verdict} p10 ${b.p10 === null ? "-" : `${Math.round(b.p10 * 100)}%`}${b.worstRef ? ` @ ${b.worstRef}` : ""}`).join(" · ")}
                </p>
              )}
              {order && (
                <p className="text-[10px] text-amber-200/90 flex items-start gap-1 mt-1">
                  <ClipboardList className="h-3 w-3 mt-0.5 shrink-0" />
                  <span><span className="font-medium">{ANSWERER_WORD[order.answeredBy]}</span> ({order.budget.members}×{order.budget.shotsPerMember} per pass, night {order.night}) — {order.orderLine}</span>
                </p>
 )}
            </div>
          );
        })}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">the path · {review.path.length} step(s)</p>
        <ol className="space-y-1">
          {review.path.map((step, i) => (
            <li key={i} className="text-[11px] leading-relaxed flex items-start gap-1.5">
              <span className="text-primary font-semibold shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
        <Ban className="h-3 w-3" /> the review is a map, not a lever - the gate keeps its teeth (an episode publishes on RELEASE only).
      </p>
    </div>
  );
}

function EpisodeChip({ ep, onClick }: { ep: ReleaseEpisode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-1.5 py-1 rounded border text-[10px] leading-tight transition-colors",
        ep.state === "DUE" && "border-emerald-400/30 bg-emerald-400/[0.07] hover:border-emerald-400/60",
        ep.state === "SLATED" && "border-sky-400/30 bg-sky-400/[0.07] hover:border-sky-400/60",
      )}
    >
      <span className="font-medium">EP{ep.number}</span>
      <span className="text-muted-foreground"> · {ep.title}</span>
      {ep.releasePlatform && <span className="text-amber-300"> · {ep.releasePlatform}</span>}
    </button>
  );
}

export function CalendarView({ project }: { project: { id: string } }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "VIEWER";
  const canSlate = role === "OWNER" || role === "EDITOR";
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState<ReleaseEpisode | null>(null);
  const [date, setDate] = useState("");
  const [platform, setPlatform] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const calQ = useQuery({
    queryKey: ["releases", project.id],
    queryFn: () => api.releases(project.id),
    refetchInterval: 30_000,
  });

  // THE MAP, READ (iteration 233): the review rides the same read
  // cadence - the numbers are the gate's own, re-read as the arc does.
  const reviewQ = useQuery({
    queryKey: ["release-review", project.id],
    queryFn: () => api.releaseReview(project.id),
    refetchInterval: 60_000,
  });

  const byDay = useMemo(() => {
    const m = new Map<string, ReleaseEpisode[]>();
    for (const ep of calQ.data?.episodes ?? []) {
      if (!ep.releaseAt) continue;
      const key = ep.releaseAt.slice(0, 10);
      m.set(key, [...(m.get(key) ?? []), ep]);
    }
    return m;
  }, [calQ.data]);

  const grid = useMemo(() => {
    const y = cursor.getFullYear();
    const mo = cursor.getMonth();
    const first = new Date(y, mo, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const days: Array<{ date: Date; inMonth: boolean } | null> = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    const last = new Date(y, mo + 1, 0).getDate();
    for (let d = 1; d <= last; d++) days.push({ date: new Date(y, mo, d), inMonth: true });
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [cursor]);

  const today = dayKey(new Date());

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErr(null);
    try {
      await api.setRelease({
        episodeId: editing.id,
        releaseAt: date, // "" unschedules
        releasePlatform: platform === "" ? null : platform,
      });
      await qc.invalidateQueries({ queryKey: ["releases", project.id] });
      setEditing(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed to slate the release");
    } finally {
      setSaving(false);
    }
  }

  function openEditor(ep: ReleaseEpisode) {
    if (!canSlate) return;
    setEditing(ep);
    setDate(ep.releaseAt ? ep.releaseAt.slice(0, 10) : "");
    setPlatform(ep.releasePlatform ?? "");
    setErr(null);
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <SectionHeader
        title="Release Calendar"
        sub="When the show meets its audience. DUE and RELEASED are read straight off the dates - the production status stays the render pipeline's truth."
        right={
          canSlate ? (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">click an episode to slate</span>
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">crew read-only</span>
          )
        }
      />

      {calQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the calendar…
        </div>
      ) : (
        <>
          {/* THE RELEASE REVIEW (iteration 233) - the map above the calendar */}
          {reviewQ.data ? (
            <ReleaseReviewSection payload={reviewQ.data} />
          ) : reviewQ.isLoading ? null : null}

          {/* month grid */}
          <div className="studio-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((cell, i) => {
                if (!cell) return <div key={i} className="min-h-16 rounded border border-transparent" />;
                const key = dayKey(cell.date);
                const eps = byDay.get(key) ?? [];
                const isToday = key === today;
                return (
                  <div key={i} className={cn("min-h-16 rounded border p-1 flex flex-col gap-1", isToday ? "border-primary/40 bg-primary/[0.06]" : "border-white/8 bg-white/[0.02]")}>
                    <div className={cn("text-[10px]", isToday ? "text-primary font-semibold" : "text-muted-foreground")}>{cell.date.getDate()}</div>
                    {eps.map((ep) => <EpisodeChip key={ep.id} ep={ep} onClick={() => openEditor(ep)} />)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ledger rows */}
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div className="studio-panel p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-sky-300" /> Slated &amp; due</h3>
              {(calQ.data?.slated.length ?? 0) + (calQ.data?.due.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Nothing slated yet - direct one with DSH (schedule_release) or click an episode on the grid.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...(calQ.data?.due ?? []), ...(calQ.data?.slated ?? [])].map((ep) => (
                    <button key={ep.id} className="flex items-center justify-between gap-2 rounded border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-left hover:border-primary/30" onClick={() => openEditor(ep)}>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">EP{ep.number} · {ep.title}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {ep.releaseAt?.slice(0, 10)}{ep.releasePlatform ? ` · ${ep.releasePlatform}` : ""} · {ep.sceneCount} scene(s), {ep.approvedShots}/{ep.shotCount} shots approved
                        </div>
                      </div>
                      <StateChip ep={ep} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="studio-panel p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarX2 className="h-4 w-4 text-muted-foreground" /> Unscheduled</h3>
              {(calQ.data?.unscheduled.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Every episode has a date on the calendar.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {calQ.data?.unscheduled.map((ep) => (
                    <button key={ep.id} className="flex items-center justify-between gap-2 rounded border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-left hover:border-primary/30" onClick={() => openEditor(ep)}>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">EP{ep.number} · {ep.title}</div>
                        <div className="text-[10px] text-muted-foreground">{ep.sceneCount} scene(s), {ep.approvedShots}/{ep.shotCount} shots approved · {ep.status.toLowerCase()}</div>
                      </div>
                      <StatusBadge status={ep.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* slate dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Slate EP{editing?.number} · {editing?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <label className="text-xs text-muted-foreground">
              Release date
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 bg-white/5 border-white/10" />
            </label>
            <label className="text-xs text-muted-foreground">
              Platform (optional)
              <Input type="text" placeholder="Bilibili, Crunchyroll, YouTube…" value={platform} onChange={(e) => setPlatform(e.target.value)} className="mt-1 bg-white/5 border-white/10" />
            </label>
            {err && <p className="text-xs text-red-400">{err}</p>}
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" disabled={saving || (!date && !editing?.releaseAt)} onClick={() => { setDate(""); }}>
                clear date
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs border-white/15 bg-white/5" onClick={() => setEditing(null)}>Cancel</Button>
                <Button size="sm" className="h-8 text-xs" disabled={saving} onClick={save}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : date ? "Slate" : "Unschedule"}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              An empty date unschedules the episode. DSH can slate too: schedule_release episodeNumber:1 releaseAt:'2026-03-14' platform:'Bilibili'.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
