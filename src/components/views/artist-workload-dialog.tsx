"use client";

// ─────────────────────────────────────────────────────────────
// ARTIST WORKLOAD-BALANCE VIEW
//
// How the episode's panels are distributed across the roster:
//   • per-artist bar rows - episode panels vs production-wide load,
//     art coverage and LoRA tuning per artist
//   • balance readout - production-wide spread judged against the
//     ideal per-artist share, so an uneven board is visible at a
//     glance (BALANCED / UNEVEN / SKEWED)
//   • "Distribute pool" - one click routes every unassigned panel
//     of this episode to the least-loaded roster members
//   • per-artist style affinity - which style LoRA each artist has
//     actually delivered with, scored from shot history + approval
// Full-scene autonomous staffing (specialism-aware) stays with DSH
// via auto_assign_scene_team; this view keeps humans in charge of
// the balance itself.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Loader2, Scale, Wand2 } from "lucide-react";
import { api, type ShotRow, type StudioProject } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ArtistWorkloadDialog({ project, shots }: { project: StudioProject; shots: ShotRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project", project.id] });

  const stats = useMemo(() => {
    const assigned = shots.filter((s) => s.artistId);
    const pool = shots.filter((s) => !s.artistId);
    const perArtist = project.artists.map((a) => {
      const owned = shots.filter((s) => s.artistId === a.id);
      return {
        artist: a,
        panels: owned.length,
        withArt: owned.filter((s) => s.artworkUrl).length,
        loraTuned: owned.filter((s) => s.loraId).length,
        done: owned.filter((s) => s.status === "APPROVED" || s.status === "FINAL").length,
        inflight: owned.filter((s) => ["QUEUED", "RENDERING", "REVIEW"].includes(s.status)).length,
        productionWide: a._count?.shots ?? owned.length,
      };
    });
    const maxPanels = Math.max(1, ...perArtist.map((p) => p.panels));
    // balance is judged on production-wide load (what artists actually feel);
    // the episode bars above are just this episode's slice of it
    const wideAssigned = perArtist.reduce((n, p) => n + p.productionWide, 0);
    const wideIdeal = perArtist.length > 0 ? wideAssigned / perArtist.length : 0;
    const wideDeviation = perArtist.reduce((n, p) => n + Math.abs(p.productionWide - wideIdeal), 0);
    const spread = wideAssigned > 0 && perArtist.length > 0 ? wideDeviation / (wideAssigned + perArtist.length) : 0;
    const balance = wideAssigned === 0 || perArtist.length === 0
      ? null
      : spread <= 0.12 ? "Balanced" : spread <= 0.3 ? "Uneven" : "Skewed";
    return { perArtist, pool, assigned: assigned.length, maxPanels, ideal: wideIdeal, balance };
  }, [project.artists, shots]);

  // per-artist style affinity: which style LoRA each artist actually
  // delivered with, production-wide. Score = usage share boosted by
  // the approval rate of that pairing, normalized to the artist's
  // strongest pairing (100).
  const affinity = useMemo(() => {
    const allShots: ShotRow[] = [];
    for (const season of project.seasons) {
      for (const ep of season.episodes) {
        for (const scene of ep.scenes) allShots.push(...scene.shots);
      }
    }
    const loraName = new Map(project.loras.map((l) => [l.id, l.name]));
    const isDone = (s: ShotRow) => s.status === "APPROVED" || s.status === "FINAL";
    const rows = project.artists.map((a) => {
      const owned = allShots.filter((s) => s.artistId === a.id);
      const pairings = project.loras
        .map((l) => {
          const bound = owned.filter((s) => s.loraId === l.id);
          const done = bound.filter(isDone).length;
          const avgStrength = bound.length
            ? bound.reduce((n, s) => n + (s.loraStrength ?? l.weight), 0) / bound.length
            : 0;
          const raw = bound.length * (0.55 + 0.45 * (bound.length ? done / bound.length : 0));
          return { loraId: l.id, name: loraName.get(l.id) ?? l.name, shots: bound.length, approved: done, avgStrength, raw };
        })
        .filter((p) => p.shots > 0)
        .sort((x, y) => y.raw - x.raw);
      const maxRaw = Math.max(1, ...pairings.map((p) => p.raw));
      return {
        artist: a,
        owned: owned.length,
        approved: owned.filter(isDone).length,
        pairings: pairings.map((p) => ({ ...p, affinity: Math.round((p.raw / maxRaw) * 100) })).slice(0, 3),
      };
    });
    return rows.filter((r) => r.pairings.length > 0);
  }, [project]);

  async function distributePool() {
    if (stats.pool.length === 0 || project.artists.length === 0) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      // least-production-load-first round robin over the roster
      const order = [...project.artists].sort((a, b) => (a._count?.shots ?? 0) - (b._count?.shots ?? 0));
      const buckets = new Map<string, string[]>();
      stats.pool.forEach((shot, i) => {
        const a = order[i % order.length];
        (buckets.get(a.id) ?? buckets.set(a.id, []).get(a.id)!).push(shot.id);
      });
      let updated = 0;
      for (const [artistId, ids] of buckets) {
        const res = await api.patchShot({ ids, artistId });
        updated += res.updated ?? ids.length;
      }
      setMsg(`${updated} pool panel${updated === 1 ? "" : "s"} distributed across ${buckets.size} artist${buckets.size === 1 ? "" : "s"} ✓`);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to distribute the pool");
    } finally {
      setBusy(false);
    }
  }

  const balanceTone =
    stats.balance === "Balanced" ? "text-teal-300 border-teal-400/30 bg-teal-400/10"
    : stats.balance === "Skewed" ? "text-rose-300 border-rose-400/30 bg-rose-400/10"
    : "text-amber-300 border-amber-400/30 bg-amber-400/10";

  return (
    <>
      <Button
        size="sm" variant="outline"
        className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
        onClick={() => { setMsg(null); setError(null); setOpen(true); }}
        title="Artist workload balance"
      >
        <BarChart3 className="h-3 w-3 mr-1" /> Workload
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="studio-root bg-[#12121a] border-white/10 text-foreground sm:max-w-lg max-h-[85vh] overflow-y-auto studio-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Artist workload balance
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Panel ownership across this episode vs the production-wide load. Route the pool with one click, or ask DSH to auto-staff a scene with <span className="font-mono text-[10px]">auto_assign_scene_team</span>.
            </DialogDescription>
          </DialogHeader>

          {/* balance readout */}
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Production-wide balance</div>
              <div className="text-sm text-foreground mt-0.5">
                {stats.assigned}/{shots.length} panels assigned this episode
                {stats.perArtist.length > 0 && (
                  <span className="text-muted-foreground"> · ideal {stats.ideal.toFixed(1)} per artist</span>
                )}
              </div>
            </div>
            {stats.balance && (
              <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-wide ${balanceTone}`}>
                {stats.balance.toUpperCase()}
              </span>
            )}
          </div>

          {/* per-artist bars */}
          <div className="space-y-2.5 max-h-72 overflow-y-auto studio-scroll pr-1">
            {stats.perArtist.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                Roster is empty - add artists from the Artists dialog, then distribute the pool.
              </p>
            )}
            {stats.perArtist.map((p) => (
              <div key={p.artist.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ background: p.artist.color }} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">{p.artist.name}</span>
                      {p.artist.role && <span className="text-[10px] text-muted-foreground ml-1.5">{p.artist.role}</span>}
                    </div>
                  </div>
                  <div className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                    <span className="text-foreground font-semibold">{p.panels}</span> ep · {p.productionWide} total
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(p.panels / stats.maxPanels) * 100}%`, background: p.artist.color, opacity: 0.85 }}
                  />
                </div>
                <div className="mt-1.5 flex gap-2 flex-wrap text-[9px] uppercase tracking-wider text-muted-foreground">
                  <span>art {p.withArt}/{p.panels}</span>
                  <span>lora {p.loraTuned}</span>
                  <span>in flight {p.inflight}</span>
                  <span>done {p.done}</span>
                </div>
              </div>
            ))}
            {stats.pool.length > 0 && (
              <div className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
                <span>Unassigned pool</span>
                <span className="tabular-nums text-foreground font-semibold">{stats.pool.length} panel{stats.pool.length === 1 ? "" : "s"}</span>
              </div>
            )}
          </div>

          {/* per-artist style affinity */}
          <div className="pt-1">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Style affinity</div>
            {affinity.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No style pairings yet: assign artists and LoRAs to panels (or let DSH auto-staff a scene) and their affinity history will surface here.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto studio-scroll pr-1">
                {affinity.map((row) => {
                  const top = row.pairings[0];
                  return (
                    <div key={row.artist.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: row.artist.color }} />
                          <span className="text-sm font-medium text-foreground truncate">{row.artist.name}</span>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
                            {row.owned} panel{row.owned === 1 ? "" : "s"} · {row.approved} done
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground shrink-0">top {top.affinity}</span>
                      </div>
                      <div className="mt-1.5 space-y-1.5">
                        {row.pairings.map((p, i) => (
                          <div key={p.loraId} className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-white/8 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${p.affinity}%`, background: row.artist.color, opacity: i === 0 ? 0.9 : 0.45 }}
                              />
                            </div>
                            <span className={cn("text-[9px] truncate max-w-[45%]", i === 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                              {p.name} · {p.shots} shot{p.shots === 1 ? "" : "s"} · @{p.avgStrength.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  Affinity = LoRA usage share boosted by the pairing's approval rate, normalized to each artist's strongest style (100). Route new panels to the artist whose affinity bar is highest for that adapter.
                </p>
              </div>
            )}
          </div>

          {msg && <p className="text-[11px] text-teal-300">{msg}</p>}
          {error && <p className="text-[11px] text-rose-300">{error}</p>}

          <DialogFooter>
            <Button
              size="sm" className="h-8"
              onClick={() => void distributePool()}
              disabled={busy || stats.pool.length === 0 || project.artists.length === 0}
              title={stats.pool.length === 0 ? "No unassigned panels in this episode" : "Route every unassigned panel to the least-loaded artists"}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
              Distribute pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
