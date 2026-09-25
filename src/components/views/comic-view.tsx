"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, BookOpenCheck, CheckSquare, FileDown, Layers, MoveRight, Music, Route, SlidersHorizontal, Sparkles, Loader2, MessageSquarePlus, Scissors, TriangleAlert, Users, X, Zap } from "lucide-react";
import type { StudioProject, SceneWithShots, ShotRow } from "@/lib/api-client";
import { api } from "@/lib/api-client";
import { poseChip } from "@/lib/animation/poses";
import {
  COMIC_FORMATS, layoutScene, stripHeight,
  type ComicFormat, type PanelPlacement, type ComicPage,
} from "@/lib/comic/layout";
import { parseDialogue, serializeDialogue, stampStateArc } from "@/lib/comic/dialogue";
import {
  arcSpansForShot, computeArcSpans, describeArcPosition, ensembleGroupSizes, formatArcRange,
  groupEnsembleSpans, type ArcSpan,
} from "@/lib/comic/arcs";
import { exportWebtoonSlices } from "@/lib/comic/export-slices";
import { toast } from "@/hooks/use-toast";
import { PanelArt } from "@/components/views/comic-panel-art";
import { SpeechBubbles, DialogueEditor } from "@/components/views/comic-bubbles";
import { ArcRuler } from "@/components/views/arc-ruler";
import { ArcTemplateDialog } from "@/components/views/arc-template-dialog";
import { StyleDirectionDialog } from "@/components/views/style-direction-dialog";
import { LoraStudioDialog } from "@/components/views/lora-studio-dialog";
import { ArtistsDialog } from "@/components/views/artists-dialog";
import { ArtistWorkloadDialog } from "@/components/views/artist-workload-dialog";
import { VoiceDiffDialog } from "@/components/views/voice-diff-dialog";
import { PanelInspectorDialog } from "@/components/views/panel-inspector-dialog";
import { SoundTimelineDialog } from "@/components/views/sound-timeline-dialog";
import { SectionHeader } from "@/components/views/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-neutral-400",
  QUEUED: "bg-amber-500",
  RENDERING: "bg-amber-500 animate-pulse",
  REVIEW: "bg-violet-500",
  INSPECTING: "bg-violet-500 animate-pulse",
  APPROVED: "bg-emerald-500",
  FINAL: "bg-emerald-500",
  FAILED: "bg-rose-500",
};

function bubbleCapacity(panel: PanelPlacement): number {
  if (panel.emphasis) return 4;
  if (panel.colSpan <= 3 && panel.rowSpan === 1) return 2;
  return 3;
}

interface PanelActions {
  onEdit: (shot: ShotRow) => void;
  onGenerateArt: (shotId: string) => void;
  onInspect: (shot: ShotRow) => void;
  onSound: (shot: ShotRow) => void;
  genStatus: Record<string, "loading" | "error">;
  selectMode: boolean;
}

export type ArcChips = Array<ArcSpan & { startsHere: boolean; endsHere: boolean; ensemble: number }>;

/** Violet arc chips stacked under the shot-number chip: a state span lives on this card. */
function ArcChips({ spans, rtl }: { spans?: ArcChips; rtl: boolean }) {
  if (!spans || spans.length === 0) return null;
  return (
    <span
      className={cn("absolute top-[46px] z-10 flex flex-col items-start gap-1 print:hidden", rtl ? "right-1 items-end" : "left-1")}
      onClick={(e) => e.stopPropagation()}
    >
      {spans.slice(0, 2).map((a) => (
        <span
          key={`${a.speakerKey}:${a.state}:${a.startShotId}`}
          title={`State arc "${a.state}" - ${a.speaker} - ${formatArcRange(a)}${a.crossesScene ? " (crosses scenes)" : ""} - ${describeArcPosition(a.startsHere, a.endsHere)}${a.ensemble > 1 ? ` - ensemble beat: ${a.ensemble} speakers in parallel` : ""}`}
          className="flex max-w-[92px] items-center gap-1 px-1 py-[1px] text-[8px] font-bold leading-tight tracking-wider"
          style={{
            border: a.ensemble > 1 ? "1px solid rgba(94,234,212,0.7)" : "1px solid rgba(139,92,246,0.6)",
            borderRadius: 3,
            background: a.startsHere ? "rgba(124,58,237,0.92)" : "rgba(255,255,255,0.9)",
            color: a.startsHere ? "#ffffff" : "#6d28d9",
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={a.startsHere
              ? { background: "#ffffff" }
              : { boxShadow: "inset 0 0 0 1.5px currentColor" }}
          />
          <span className="truncate">{a.state}</span>
          {a.ensemble > 1 && (
            <span
              className="shrink-0 rounded-sm px-0.5 text-[7px]"
              style={{ background: "rgba(19,78,74,0.92)", color: "#99f6e4" }}
            >
              ×{a.ensemble}
            </span>
          )}
        </span>
      ))}
      {spans.length > 2 && (
        <span className="px-1 text-[7px] font-bold tracking-wider text-violet-700" style={{ background: "rgba(255,255,255,0.85)", borderRadius: 3 }}>
          +{spans.length - 2} arc{spans.length - 2 === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

function PanelToolbar({
  shot, actions, rtl, ink, paper,
}: {
  shot: ShotRow;
  actions: PanelActions;
  rtl: boolean;
  ink: string;
  paper: string;
}) {
  const status = actions.genStatus[shot.id];
  const scored = (shot.audioCues?.length ?? 0) > 0;
  return (
    <span
      className={cn("absolute top-1 z-20 flex gap-1 print:hidden", rtl ? "left-1" : "right-1")}
      style={{ flexDirection: rtl ? "row-reverse" : "row" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => actions.onGenerateArt(shot.id)}
        disabled={status === "loading"}
        title={shot.artworkUrl ? "Regenerate AI art" : "Generate AI art"}
        className={cn(
          "flex h-4.5 w-4.5 items-center justify-center rounded-sm border transition-colors",
          status === "error" ? "text-rose-600" : "text-neutral-700 hover:bg-black/5"
        )}
        style={{ background: "rgba(255,255,255,0.85)", borderColor: ink }}
      >
        {status === "loading"
          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
          : <Sparkles className="h-2.5 w-2.5" />}
      </button>
      <button
        onClick={() => actions.onEdit(shot)}
        title="Edit dialogue"
        className="flex h-4.5 w-4.5 items-center justify-center rounded-sm border text-neutral-700 transition-colors hover:bg-black/5"
        style={{ background: "rgba(255,255,255,0.85)", borderColor: ink }}
      >
        <MessageSquarePlus className="h-2.5 w-2.5" />
      </button>
      <button
        onClick={() => actions.onInspect(shot)}
        title="Artist + style LoRA"
        className="flex h-4.5 w-4.5 items-center justify-center rounded-sm border text-neutral-700 transition-colors hover:bg-black/5"
        style={{ background: "rgba(255,255,255,0.85)", borderColor: ink }}
      >
        <SlidersHorizontal className="h-2.5 w-2.5" />
      </button>
      <button
        onClick={() => actions.onSound(shot)}
        title="Motion sound / SFX timing"
        className={cn(
          "flex h-4.5 w-4.5 items-center justify-center rounded-sm border transition-colors",
          scored ? "text-amber-700" : "text-neutral-700 hover:bg-black/5"
        )}
        style={{ background: scored ? "rgba(232,176,75,0.35)" : "rgba(255,255,255,0.85)", borderColor: ink }}
      >
        <Music className="h-2.5 w-2.5" />
      </button>
      {shot.artworkUrl && (
        <span
          className="flex h-4.5 items-center rounded-sm border px-1 text-[7px] font-bold tracking-widest"
          style={{ background: ink, color: paper, borderColor: ink }}
        >
          AI
        </span>
      )}
      {shot.lora && (
        <span
          title={`Style LoRA ${shot.lora.name} @ ${(shot.loraStrength ?? shot.lora.weight).toFixed(2)}`}
          className="flex h-4.5 items-center gap-0.5 rounded-sm border px-1 text-[7px] font-bold tracking-wider"
          style={{ background: "rgba(232,176,75,0.85)", color: "#1c1917", borderColor: ink }}
        >
          <Zap className="h-2 w-2" /> {shot.lora.name.split("-")[0].slice(0, 4).toUpperCase()}
        </span>
      )}
      {shot.artist && (
        <span
          title={`Artist: ${shot.artist.name}`}
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[7px] font-bold"
          style={{ background: shot.artist.color, color: "#1c1917", borderColor: ink }}
        >
          {shot.artist.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function PanelFrame({
  panel, format, rtl, scene, actions, dimmed, selected, onToggleSelect, arcChips,
}: {
  panel: PanelPlacement<ShotRow>;
  format: ComicFormat;
  rtl: boolean;
  scene: SceneWithShots;
  actions: PanelActions;
  dimmed: boolean;
  selected: boolean;
  onToggleSelect: (shotId: string) => void;
  arcChips?: ArcChips;
}) {
  const cfg = COMIC_FORMATS[format];
  const shot = panel.shot;
  const dynamic = shot.movement && ["PAN", "TRACKING", "DOLLY_IN", "ORBIT", "CRANE"].includes(shot.movement);
  const lines = parseDialogue(shot.dialogue).slice(0, bubbleCapacity(panel));
  const loading = actions.genStatus[shot.id] === "loading";

  return (
    <figure
      data-shot-id={shot.id}
      onClick={actions.selectMode ? () => onToggleSelect(shot.id) : undefined}
      className={cn(
        "comic-panel relative overflow-hidden bg-white",
        panel.emphasis && "comic-splash",
        dimmed && "opacity-25 grayscale",
        actions.selectMode && "cursor-pointer",
        selected && "outline outline-2 outline-offset-2 outline-primary z-10"
      )}
      style={{
        gridColumn: `${panel.colStart} / span ${panel.colSpan}`,
        gridRow: `span ${panel.rowSpan}`,
        border: `${panel.emphasis ? 3 : 2}px solid ${cfg.ink}`,
        minHeight: panel.rowSpan >= 2 ? 230 : panel.colSpan >= 5 ? 150 : 112,
      }}
    >
      {shot.artworkUrl ? (
        <img
          src={shot.artworkUrl}
          alt={shot.description}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <PanelArt
          shotType={shot.shotType}
          movement={shot.movement}
          weather={scene.weather}
          timeOfDay={scene.timeOfDay}
          seed={shot.number + scene.number * 100}
          format={format}
        />
      )}

      {loading && (
        <span className="absolute inset-0 z-10 animate-pulse bg-white/40" aria-label="Generating art" />
      )}

      <SpeechBubbles lines={lines} rtl={rtl} ink={cfg.ink} />
      <PanelToolbar shot={shot} actions={actions} rtl={rtl} ink={cfg.ink} paper={cfg.paper} />

      {/* shot number chip */}
      <span
        className={cn("absolute top-7 px-1.5 py-[1px] text-[9px] font-mono font-bold tracking-wider z-10", rtl ? "right-1" : "left-1")}
        style={{ background: cfg.ink, color: cfg.paper }}
      >
        {String(shot.number).padStart(3, "0")}
      </span>

      {/* state arc chips: which spans live on this card */}
      <ArcChips spans={arcChips} rtl={rtl} />

      {/* status dot */}
      <span className={cn("absolute bottom-1.5 h-2 w-2 rounded-full z-10", rtl ? "left-1.5" : "right-1.5", STATUS_DOT[shot.status] ?? "bg-neutral-400")} title={shot.status} />

      {/* movement + pose chips */}
      {(dynamic || poseChip(shot.poseStart, shot.poseEnd)) && (
        <span className={cn("absolute bottom-1 flex gap-1 z-10", rtl ? "right-1" : "left-1")}>
          {dynamic && (
            <span
              className="px-1 py-[1px] text-[8px] font-mono tracking-wider"
              style={{ border: `1px solid ${cfg.ink}`, color: cfg.ink, background: "rgba(255,255,255,0.75)" }}
            >
              {shot.movement}
            </span>
          )}
          {poseChip(shot.poseStart, shot.poseEnd) && (
            <span
              className="px-1 py-[1px] text-[8px] font-mono font-bold tracking-wider text-teal-700"
              style={{ border: "1px solid #0f766e", background: "rgba(204,251,241,0.85)" }}
              title="Character motion: engines interpolate these poses across the clip"
            >
              {poseChip(shot.poseStart, shot.poseEnd)}
            </span>
          )}
        </span>
      )}

      {/* narration caption - clamped when bubbles share the panel (avoid overlap) */}
      <figcaption
        className={cn("absolute bottom-6 z-10 px-1.5 py-1 text-[9px] leading-snug text-neutral-900", rtl ? "right-1 text-right" : "left-1 text-left", lines.length > 0 ? "line-clamp-1" : "line-clamp-2")}
        style={{ background: "rgba(255,255,255,0.88)", border: `1px solid ${cfg.ink}`, maxWidth: "72%" }}
      >
        {shot.description}
      </figcaption>
    </figure>
  );
}

function WebtoonPanel({
  shot, scene, format, actions, dimmed, selected, onToggleSelect, arcChips,
}: {
  shot: ShotRow;
  scene: SceneWithShots;
  format: ComicFormat;
  actions: PanelActions;
  dimmed: boolean;
  selected: boolean;
  onToggleSelect: (shotId: string) => void;
  arcChips?: ArcChips;
}) {
  const cfg = COMIC_FORMATS[format];
  const dynamic = shot.movement && ["PAN", "TRACKING", "DOLLY_IN", "ORBIT", "CRANE"].includes(shot.movement);
  const lines = parseDialogue(shot.dialogue).slice(0, 3);
  const loading = actions.genStatus[shot.id] === "loading";
  return (
    <figure
      data-shot-id={shot.id}
      onClick={actions.selectMode ? () => onToggleSelect(shot.id) : undefined}
      className={cn(
        "comic-panel relative overflow-hidden bg-white",
        dimmed && "opacity-25 grayscale",
        actions.selectMode && "cursor-pointer",
        selected && "outline outline-2 outline-offset-2 outline-primary z-10"
      )}
      style={{ border: `2px solid ${cfg.ink}`, height: stripHeight(shot.shotType) }}
    >
      {shot.artworkUrl ? (
        <img src={shot.artworkUrl} alt={shot.description} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <PanelArt
          shotType={shot.shotType}
          movement={shot.movement}
          weather={scene.weather}
          timeOfDay={scene.timeOfDay}
          seed={shot.number + scene.number * 100}
          format={format}
        />
      )}
      {loading && <span className="absolute inset-0 z-10 animate-pulse bg-white/40" aria-label="Generating art" />}
      <SpeechBubbles lines={lines} rtl={false} ink={cfg.ink} />
      <PanelToolbar shot={shot} actions={actions} rtl={false} ink={cfg.ink} paper={cfg.paper} />
      <span className="absolute top-7 left-1 z-10 px-1.5 py-[1px] text-[9px] font-mono font-bold tracking-wider" style={{ background: cfg.ink, color: cfg.paper }}>
        {String(shot.number).padStart(3, "0")}
      </span>
      <ArcChips spans={arcChips} rtl={false} />
      {(dynamic || poseChip(shot.poseStart, shot.poseEnd)) && (
        <span className="absolute bottom-1 right-1 z-10 flex gap-1">
          {dynamic && (
            <span className="px-1 py-[1px] text-[8px] font-mono tracking-wider" style={{ border: `1px solid ${cfg.ink}`, color: cfg.ink, background: "rgba(255,255,255,0.75)" }}>
              {shot.movement}
            </span>
          )}
          {poseChip(shot.poseStart, shot.poseEnd) && (
            <span
              className="px-1 py-[1px] text-[8px] font-mono font-bold tracking-wider text-teal-700"
              style={{ border: "1px solid #0f766e", background: "rgba(204,251,241,0.85)" }}
              title="Character motion: engines interpolate these poses across the clip"
            >
              {poseChip(shot.poseStart, shot.poseEnd)}
            </span>
          )}
        </span>
      )}
      <figcaption className={cn("absolute bottom-6 left-1 z-10 px-1.5 py-1 text-[9px] leading-snug text-neutral-900", lines.length > 0 ? "line-clamp-1" : "line-clamp-2")} style={{ background: "rgba(255,255,255,0.88)", border: `1px solid ${cfg.ink}`, maxWidth: "76%" }}>
        {shot.description}
      </figcaption>
    </figure>
  );
}

export function ComicView({ project }: { project: StudioProject }) {
  const [format, setFormat] = useState<ComicFormat>("MANHUA");
  const [episodeIdx, setEpisodeIdx] = useState(0);
  const [editingShot, setEditingShot] = useState<ShotRow | null>(null);
  const [inspectingShot, setInspectingShot] = useState<ShotRow | null>(null);
  const [soundShot, setSoundShot] = useState<ShotRow | null>(null);
  const [genStatus, setGenStatus] = useState<Record<string, "loading" | "error">>({});
  const [exporting, setExporting] = useState<string | null>(null);
  // export pre-flight: direction-currency check that gates the download when takes are stale/blocked
  const [preflight, setPreflight] = useState<{
    voiceStatus: Record<string, { status: "fresh" | "stale" | "unrendered" | "blocked"; changed: string[] }>;
    rows: Array<{ cueId: string; shotNumber: number; speaker: string; text: string; status: "stale" | "blocked" | "unrendered"; changed: string[] }>;
    fresh: number;
    unrendered: number;
  } | null>(null);
  const [artistFilter, setArtistFilter] = useState<"ALL" | "NONE" | string>("ALL");
  const [rulerOpen, setRulerOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkArtist, setBulkArtist] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const cfg = COMIC_FORMATS[format];

  const episodes = useMemo(
    () => project.seasons.flatMap((s) => s.episodes).sort((a, b) => a.number - b.number),
    [project.seasons]
  );
  const episode = episodes[Math.min(episodeIdx, Math.max(episodes.length - 1, 0))];

  const scenePages: Array<{ scene: SceneWithShots; pages: ComicPage<ShotRow>[] }> = useMemo(() => {
    if (!episode) return [];
    return [...episode.scenes]
      .sort((a, b) => a.number - b.number)
      .map((scene) => ({ scene, pages: layoutScene(scene, scene.shots) }));
  }, [episode]);

  const allShots = useMemo(() => scenePages.flatMap((sp) => sp.pages.flatMap((p) => p.panels.map((pl) => pl.shot))), [scenePages]);
  const withoutArt = allShots.filter((s) => !s.artworkUrl);
  const generatingCount = Object.values(genStatus).filter((s) => s === "loading").length;
  const cueCount = allShots.reduce((n, s) => n + (s.audioCues?.length ?? 0), 0);
  const loraCoverage = allShots.filter((s) => s.loraId).length;
  const assignedCount = allShots.filter((s) => s.artistId).length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["project", project.id] });

  const toggleSelect = (shotId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(shotId)) next.delete(shotId);
      else next.add(shotId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkMsg(null);
  };

  const bulkAssign = async () => {
    if (!bulkArtist || selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await api.patchShot({ ids: [...selectedIds], artistId: bulkArtist === "__none__" ? null : bulkArtist });
      setBulkMsg(`Assigned ${res.updated ?? selectedIds.size} panel${selectedIds.size === 1 ? "" : "s"} ✓`);
      await invalidate();
      setTimeout(() => { setBulkMsg(null); exitSelectMode(); }, 1200);
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : "Bulk assign failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const generateArt = async (shotId: string) => {
    setGenStatus((st) => ({ ...st, [shotId]: "loading" }));
    try {
      await api.generatePanelArt(shotId, format);
      await invalidate();
      setGenStatus((st) => {
        const { [shotId]: _done, ...rest } = st;
        return rest;
      });
    } catch {
      setGenStatus((st) => ({ ...st, [shotId]: "error" }));
      setTimeout(() => setGenStatus((st) => {
        const { [shotId]: _gone, ...rest } = st;
        return rest;
      }), 4000);
    }
  };

  const generateAll = async () => {
    const targets = withoutArt.map((s) => s.id);
    for (let i = 0; i < targets.length; i += 2) {
      await Promise.allSettled(targets.slice(i, i + 2).map((id) => generateArt(id)));
    }
  };

  const runSliceExport = async () => {
    if (!episode || format !== "MANHWA" || allShots.length === 0) return;
    setPreflight(null);
    setExporting("Checking direction currency…");
    // direction diff first: the manifest tags every voice stem fresh vs stale
    let voiceStatus: Record<string, { status: "fresh" | "stale" | "unrendered" | "blocked"; changed: string[] }> | undefined;
    let diffRows: Awaited<ReturnType<typeof api.voiceDiff>>["episodes"][number]["cues"] = [];
    try {
      const diff = await api.voiceDiff(episode.id);
      diffRows = diff.episodes[0]?.cues ?? [];
      voiceStatus = Object.fromEntries(diffRows.map((r) => [r.cueId, { status: r.status, changed: r.changed }]));
    } catch {
      // diff unavailable: export proceeds with untagged (unknown) currency
    }
    setExporting(null);
    // pre-flight gate: stale or blocked takes would mix their old render into the stems
    const offenders = diffRows.filter((r) => r.status === "stale" || r.status === "blocked");
    if (offenders.length > 0) {
      setPreflight({
        voiceStatus: voiceStatus ?? {},
        rows: offenders.map((r) => ({
          cueId: r.cueId, shotNumber: r.shotNumber, speaker: r.speaker,
          text: r.text.length > 44 ? `${r.text.slice(0, 43)}…` : r.text,
          status: r.status as "stale" | "blocked", changed: r.changed,
        })),
        fresh: diffRows.filter((r) => r.status === "fresh").length,
        unrendered: diffRows.filter((r) => r.status === "unrendered").length,
      });
      return;
    }
    await doSliceExport(voiceStatus);
  };

  const doSliceExport = async (voiceStatus?: Record<string, { status: "fresh" | "stale" | "unrendered" | "blocked"; changed: string[] }>) => {
    if (!episode || format !== "MANHWA" || allShots.length === 0) return;
    setPreflight(null);
    try {
      const slices = await exportWebtoonSlices({
        projectName: project.title,
        episodeNumber: episode.number,
        episodeTitle: episode.title,
        shots: allShots.map((s) => ({
          id: s.id, number: s.number, description: s.description,
          shotType: s.shotType, artworkUrl: s.artworkUrl, dialogue: s.dialogue,
          duration: s.duration,
          loraName: s.lora?.name ?? null,
          loraStrength: s.loraStrength ?? null,
          artistName: s.artist?.name ?? null,
          audioCues: (s.audioCues ?? []).map((c) => ({
            cueId: c.id,
            kind: c.kind, label: c.label, startMs: c.startMs, durationMs: c.durationMs, volume: c.volume,
            voiceUrl: c.voiceUrl, voiceActor: c.voiceActor, voiceDurationMs: c.voiceDurationMs,
            voiceState: c.voiceState, voiceStateLabel: c.voiceStateLabel,
            voiceDelivery: c.voiceDelivery, voiceNote: c.voiceNote, voiceCast: c.voiceCast,
          })),
        })),
        voiceStatus,
        onProgress: (msg) => setExporting(msg),
      });
      const stale = Object.values(voiceStatus ?? {}).filter((s) => s.status === "stale").length;
      setExporting(`${slices} slice${slices === 1 ? "" : "s"} downloaded ✓${stale > 0 ? ` - manifest flags ${stale} stale take${stale === 1 ? "" : "s"}` : " - all takes fresh"}`);
      setTimeout(() => setExporting(null), 3500);
    } catch (err) {
      console.error("Webtoon slice export failed:", err);
      setExporting("Export failed - see console");
      setTimeout(() => setExporting(null), 4000);
    }
  };

  // Book export (CBZ / PDF): the server assembles the SAME page layout
  // this view reads into a paged book - the MANGA format's RTL binding
  // is carried into ComicInfo.xml and the PDF viewer preferences.
  const runBookExport = async (bookFormat: "cbz" | "pdf") => {
    if (!episode || exporting !== null) return;
    const direction = format === "MANGA" ? "rtl" : "ltr";
    setExporting(`Building ${bookFormat.toUpperCase()}…`);
    try {
      const res = await fetch(`/api/export/book?episodeId=${encodeURIComponent(episode.id)}&format=${bookFormat}&direction=${direction}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Export refused", description: data.error ?? `HTTP ${res.status}` });
        setExporting(null);
        return;
      }
      const meta = JSON.parse(decodeURIComponent(res.headers.get("X-Book-Meta") ?? "{}"));
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = meta.filename ?? `${project.title.replace(/\s+/g, "-").toLowerCase()}-ep${String(episode.number).padStart(2, "0")}.${bookFormat}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExporting(`${meta.pages ?? "?"} page(s) downloaded as ${bookFormat.toUpperCase()} ✓`);
      setTimeout(() => setExporting(null), 3500);
    } catch (err) {
      console.error("Book export failed:", err);
      setExporting("Export failed - see console");
      setTimeout(() => setExporting(null), 4000);
    }
  };

  const stats = useMemo(() => {
    let pages = 0, panels = 0, splash = 0;
    for (const sp of scenePages)
      for (const pg of sp.pages) {
        pages += 1;
        for (const p of pg.panels) {
          panels += 1;
          if (p.emphasis) splash += 1;
        }
      }
    const withArt = allShots.filter((s) => s.artworkUrl).length;
    return { pages, panels, splash, withArt, readMin: Math.max(1, Math.round(panels * 7 / 60)) };
  }, [scenePages, allShots]);

  const characterNames = useMemo(() => {
    const names = new Set(project.characters.map((c) => c.name));
    for (const shot of allShots) for (const line of parseDialogue(shot.dialogue)) {
      if (line.speaker) names.add(line.speaker);
    }
    return [...names];
  }, [project.characters, allShots]);

  // speaker name (lowercase) -> development states, for the dialogue editor's per-line state overrides
  const speakerStates = useMemo(() => {
    const map: Record<string, Array<{ label: string; episodeNumber: number | null; variantVoice: string | null }>> = {};
    for (const c of project.characters) {
      map[c.name.trim().toLowerCase()] = c.states.map((s) => ({
        label: s.label,
        episodeNumber: s.episodeNumber,
        variantVoice: s.voiceVariant ?? null,
      }));
    }
    return map;
  }, [project.characters]);

  // episode-ordered shots (scene number, then shot number) feed the arc-span computation
  const orderedShots = useMemo(() => {
    if (!episode) return [];
    return [...episode.scenes]
      .sort((a, b) => a.number - b.number)
      .flatMap((sc) =>
        [...sc.shots]
          .sort((a, b) => a.number - b.number)
          .map((sh) => ({ id: sh.id, sceneId: sc.id, sceneNumber: sc.number, number: sh.number, dialogue: sh.dialogue ?? null }))
      );
  }, [episode]);
  const arcSpans = useMemo(() => computeArcSpans(orderedShots), [orderedShots]);
  // ensemble grouping: spans from different speakers sharing a shot read as one parallel beat
  const arcGroups = useMemo(() => groupEnsembleSpans(arcSpans), [arcSpans]);
  const arcGroupSizes = useMemo(() => ensembleGroupSizes(arcGroups), [arcGroups]);
  const arcChipsByShot = useMemo(() => {
    const map: Record<string, ArcChips> = {};
    arcSpans.forEach((span, i) => {
      const ensemble = arcGroupSizes[arcGroups[i]] ?? 1;
      for (const shotId of span.shotIds) {
        (map[shotId] ??= []).push({ ...span, startsHere: span.startShotId === shotId, endsHere: span.endShotId === shotId, ensemble });
      }
    });
    return map;
  }, [arcSpans, arcGroups, arcGroupSizes]);

  // state arc: stamp a line's picked state (or clear) onto the speaker's following lines,
  // within the scene (default) or across scene boundaries through the end of the episode
  const extendStateArc = async (shot: ShotRow, lineIndex: number, state: string | null, scope: "scene" | "episode" = "scene") => {
    const speaker = parseDialogue(shot.dialogue)[lineIndex]?.speaker?.trim();
    if (!speaker) throw new Error("The arc needs a speaker on that line");
    const ordered = scope === "episode"
      ? [...(episode?.scenes ?? [])].sort((a, b) => a.number - b.number).flatMap((sc) => [...sc.shots].sort((a, b) => a.number - b.number))
      : allShots.filter((s) => s.sceneId === shot.sceneId).sort((a, b) => a.number - b.number);
    let stamping = false;
    let stamped = 0;
    for (const s of ordered) {
      if (s.id === shot.id) stamping = true;
      if (!stamping) continue;
      const [next, n] = stampStateArc(parseDialogue(s.dialogue), speaker, s.id === shot.id ? lineIndex : 0, state);
      if (n > 0) {
        await api.patchShot({ id: s.id, dialogue: serializeDialogue(next) });
        stamped += n;
      }
    }
    if (stamped > 0) invalidate();
  };

  if (!episode) {
    return (
      <div>
        <SectionHeader title="Comic Mode" sub="Storyboard episodes as manhua, manhwa/webtoon or manga pages." />
        <div className="studio-panel p-10 text-center text-sm text-muted-foreground">
          No episodes yet - create one in Story & Scenes, or ask DSH to break down a scene.
        </div>
      </div>
    );
  }

  const actions: PanelActions = {
    onEdit: (shot) => setEditingShot(shot),
    onGenerateArt: (shotId) => void generateArt(shotId),
    onInspect: (shot) => setInspectingShot(shot),
    onSound: (shot) => setSoundShot(shot),
    genStatus,
    selectMode,
  };

  const isDimmed = (shot: ShotRow) =>
    artistFilter !== "ALL" &&
    (artistFilter === "NONE" ? Boolean(shot.artistId) : shot.artistId !== artistFilter);

  return (
    <div>
      <SectionHeader
        title="Comic Mode"
        sub="The episode re-composed as sequential art. Panel layout is derived from the shot breakdown - no re-authoring."
        right={
          <div className="flex gap-1.5 flex-wrap">
            {episodes.map((ep, i) => (
              <Button key={ep.id} size="sm" variant={i === episodeIdx ? "default" : "outline"}
                className={cn("h-7 text-[11px]", i !== episodeIdx && "border-white/12 bg-white/5")}
                onClick={() => setEpisodeIdx(i)}>
                E{String(ep.number).padStart(2, "0")}
              </Button>
            ))}
          </div>
        }
      />

      {/* format + batch actions bar */}
      <div className="studio-panel p-3 mb-5 flex flex-col xl:flex-row xl:items-center gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(COMIC_FORMATS) as ComicFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                "px-3 h-8 rounded-lg text-xs font-medium border transition-colors",
                format === f
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
              )}
            >
              {COMIC_FORMATS[f].label}
              <span className="ml-1.5 text-[9px] uppercase tracking-widest opacity-60">{COMIC_FORMATS[f].origin}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground xl:ml-2">{cfg.blurb}</p>
        <div className="xl:ml-auto flex items-center gap-2 flex-wrap">
          <Button
            size="sm" variant={rulerOpen ? "default" : "outline"}
            className={cn("h-7 text-[11px] print:hidden", rulerOpen ? "bg-violet-500/90 hover:bg-violet-500" : "border-violet-400/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20")}
            onClick={() => setRulerOpen((o) => !o)}
            title="Season-wide arc ruler: every state arc drawn across the season's episodes"
          >
            <Route className="h-3 w-3 mr-1" /> Arc ruler
          </Button>
          <ArcTemplateDialog
            projectId={project.id}
            characters={project.characters.map((c) => ({
              name: c.name,
              states: c.states.map((s) => ({ label: s.label, episodeNumber: s.episodeNumber, variantVoice: s.voiceVariant ?? null })),
            }))}
            episode={episode}
          />
          <StyleDirectionDialog project={project} />
          <LoraStudioDialog project={project} />
          <ArtistsDialog project={project} />
          <ArtistWorkloadDialog project={project} shots={allShots} />
          <VoiceDiffDialog episode={episode ? { id: episode.id, number: episode.number, title: episode.title } : null} projectId={project.id} />
          <Button
            size="sm" variant="outline"
            className="h-7 text-[11px] border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 print:hidden"
            onClick={() => void generateAll()}
            disabled={generatingCount > 0 || withoutArt.length === 0}
          >
            {generatingCount > 0
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {generatingCount} generating…</>
              : <><Sparkles className="h-3 w-3 mr-1" /> Generate art {withoutArt.length > 0 ? `(${withoutArt.length} left)` : "✓"}</>}
          </Button>
          <span className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground">
            {cfg.readingDirection === "RTL" && <><MoveRight className="h-3 w-3 rotate-180" /> right-to-left</>}
            {cfg.readingDirection === "VERTICAL" && <><MoveRight className="h-3 w-3 rotate-90" /> vertical scroll</>}
          </span>
          <Button
            size="sm" variant="outline"
            className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
            title={format === "MANHWA" ? "Export 800px-wide platform slices (ZIP)" : "Switch to Manhwa / Webtoon format to export slices"}
            disabled={format !== "MANHWA" || exporting !== null || allShots.length === 0}
            onClick={() => void runSliceExport()}
          >
            {exporting !== null
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {exporting}</>
              : <><Scissors className="h-3 w-3 mr-1" /> Export slices</>}
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
            title={`Page book of this episode as CBZ (${cfg.readingDirection === "RTL" ? "manga RTL" : "LTR"} binding, ComicInfo.xml included)`}
            disabled={exporting !== null || allShots.length === 0}
            onClick={() => void runBookExport("cbz")}
          >
            <BookOpenCheck className="h-3 w-3 mr-1" /> Export CBZ
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
            title={`Page book of this episode as PDF (${cfg.readingDirection === "RTL" ? "panels composed right-to-left, viewer Direction hint set" : "panels composed left-to-right"})`}
            disabled={exporting !== null || allShots.length === 0}
            onClick={() => void runBookExport("pdf")}
          >
            <FileDown className="h-3 w-3 mr-1" /> Export PDF
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden" onClick={() => window.print()}>
            <FileDown className="h-3 w-3 mr-1" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* season-wide arc ruler: spans drawn across the season's episodes */}
      {rulerOpen && (
        <ArcRuler
          projectId={project.id}
          episodes={episodes}
          activeEpisodeNumber={episode?.number ?? null}
          onPickEpisode={(epNumber) => {
            const idx = episodes.findIndex((e) => e.number === epNumber);
            if (idx >= 0) setEpisodeIdx(idx);
          }}
        />
      )}

      {/* export pre-flight: stems flagged stale or blocked before anything downloads */}
      {preflight && (
        <div className="studio-panel p-3 mb-5 border-amber-400/30 bg-amber-400/[0.05] space-y-2 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" />
              Export pre-flight: {preflight.rows.length} take{preflight.rows.length === 1 ? "" : "s"} would mix their OLD render into the stems
            </div>
            <button onClick={() => setPreflight(null)} className="text-muted-foreground hover:text-foreground" title="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1 max-h-44 overflow-y-auto studio-scroll pr-1">
            {preflight.rows.map((r) => (
              <div key={r.cueId} className="flex items-center gap-2 text-[10px] font-mono rounded border border-white/8 bg-black/25 px-2 py-1">
                <span className={cn("px-1 rounded-sm text-[8px] font-bold tracking-widest uppercase shrink-0",
                  r.status === "stale" ? "bg-amber-400/25 text-amber-300" : "bg-rose-400/25 text-rose-300")}>
                  {r.status}
                </span>
                <span className="text-muted-foreground shrink-0">S{r.shotNumber}</span>
                <span className="text-foreground/80 shrink-0">{r.speaker || "narration"}</span>
                <span className="text-muted-foreground truncate">&quot;{r.text}&quot;</span>
                <span className="text-amber-300/80 shrink-0 ml-auto">{r.changed.join(", ") || "direction moved"}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[11px] border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
              onClick={() => void doSliceExport(preflight.voiceStatus)}>
              <Scissors className="h-3 w-3 mr-1" /> Export anyway ({preflight.fresh} fresh)
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Re-render the stale takes first from the Direction diff board{preflight.unrendered > 0 ? ` · ${preflight.unrendered} cue${preflight.unrendered === 1 ? "" : "s"} unrendered (synthesized blip in stems)` : ""}
            </span>
          </div>
        </div>
      )}

      {/* artist filter + bulk assignment bar */}
      <div className="studio-panel p-3 mb-5 flex flex-col md:flex-row md:items-center gap-3 print:hidden">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mr-1 flex items-center gap-1">
            <Users className="h-3 w-3" /> Artists
          </span>
          <button
            onClick={() => setArtistFilter("ALL")}
            className={cn(
              "px-2.5 h-7 rounded-lg text-[11px] border transition-colors",
              artistFilter === "ALL" ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
            )}
          >
            All {allShots.length}
          </button>
          {project.artists.map((a) => (
            <button
              key={a.id}
              onClick={() => setArtistFilter(a.id)}
              title={a.role ?? a.name}
              className={cn(
                "flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] border transition-colors",
                artistFilter === a.id ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
              {a.name}
              <span className="text-[9px] opacity-70 tabular-nums">{a._count?.shots ?? 0}</span>
            </button>
          ))}
          <button
            onClick={() => setArtistFilter("NONE")}
            className={cn(
              "px-2.5 h-7 rounded-lg text-[11px] border transition-colors",
              artistFilter === "NONE" ? "bg-primary/15 text-primary border-primary/30" : "text-muted-foreground border-white/10 bg-white/5 hover:text-foreground"
            )}
          >
            Pool {allShots.length - assignedCount}
          </button>
        </div>
        <div className="md:ml-auto flex items-center gap-2">
          <Button
            size="sm" variant={selectMode ? "default" : "outline"}
            className="h-7 text-[11px] border-white/12 bg-white/5 print:hidden"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            {selectMode ? <><X className="h-3 w-3 mr-1" /> Cancel</> : <><CheckSquare className="h-3 w-3 mr-1" /> Bulk assign</>}
          </Button>
          {selectMode && (
            <>
              <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected - click panels to toggle</span>
              <select
                value={bulkArtist}
                onChange={(e) => setBulkArtist(e.target.value)}
                className="h-7 rounded-md border border-white/10 bg-white/5 text-[11px] px-1.5 text-foreground"
              >
                <option value="" disabled>Assign to…</option>
                {project.artists.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
                <option value="__none__">- Unassigned pool -</option>
              </select>
              <Button size="sm" className="h-7 text-[11px]" onClick={() => void bulkAssign()} disabled={!bulkArtist || selectedIds.size === 0 || bulkBusy}>
                {bulkBusy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Apply
              </Button>
            </>
          )}
          {bulkMsg && <span className="text-[11px] text-teal-300">{bulkMsg}</span>}
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-6 print:hidden">
        {[
          { icon: Layers, label: "Panels", value: stats.panels },
          { icon: BookOpen, label: cfg.readingDirection === "VERTICAL" ? "Scroll cards" : "Pages", value: stats.pages },
          { icon: BookOpenCheck, label: "Splash panels", value: stats.splash },
          { icon: Sparkles, label: "AI art ready", value: `${stats.withArt}/${stats.panels}` },
          { icon: Zap, label: "LoRA tuned", value: `${loraCoverage}/${stats.panels}` },
          { icon: Users, label: "Assigned", value: `${assignedCount}/${stats.panels}` },
          { icon: Music, label: "Sound cues", value: cueCount },
          { icon: BookOpen, label: "Est. read", value: `${stats.readMin} min` },
        ].map((s) => (
          <div key={s.label} className="studio-panel p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <s.icon className="h-3 w-3" /> {s.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* pages */}
      <div className="comic-print-area space-y-10">
        {scenePages.map(({ scene, pages }) =>
          pages.length === 0 ? (
            <div key={scene.id} className="studio-panel p-5 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-widest" style={{ background: "#25335c", color: "#f8f4e9" }}>
                SCENE {String(scene.number).padStart(2, "0")}
              </span>
              <span className="ml-2" style={{ color: "#d4d4d4" }}>{scene.title} - no shots yet</span>
            </div>
          ) : (
            <section key={scene.id} className="space-y-5">
              <div className="flex items-center gap-3 print:hidden">
                <div className="h-px flex-1 bg-white/10" />
                <div className="rounded-lg border border-white/12 bg-white/5 px-4 py-2 flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-widest" style={{ background: "#25335c", color: "#f8f4e9" }}>
                    SCENE {String(scene.number).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{scene.title}</span>
                  {[scene.environment?.name, scene.timeOfDay, scene.weather].filter(Boolean).map((c) => (
                    <span key={String(c)} className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-[10px] text-muted-foreground">{c}</span>
                  ))}
                </div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {cfg.readingDirection === "VERTICAL" ? (
                <div className="mx-auto max-w-[520px] space-y-4" style={{ padding: `0 ${cfg.gutter / 2}px` }}>
                  {pages.map((pg) =>
                    pg.panels.map((p) => (
                      <div key={p.shot.id}>
                        <WebtoonPanel
                          shot={p.shot} scene={scene} format={format} actions={actions}
                          dimmed={isDimmed(p.shot)}
                          selected={selectedIds.has(p.shot.id)}
                          onToggleSelect={toggleSelect}
                          arcChips={arcChipsByShot[p.shot.id]}
                        />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6 items-start print:block">
                  {pages.map((pg) => (
                    <article
                      key={`${pg.sceneId}-${pg.indexInScene}`}
                      className="comic-page mx-auto w-full max-w-[560px] rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.45)] print:shadow-none"
                      style={{ background: cfg.paper, padding: cfg.gutter * 1.4 }}
                    >
                      <div
                        dir={cfg.readingDirection === "RTL" ? "rtl" : "ltr"}
                        className="grid grid-cols-6"
                        style={{ gap: cfg.gutter }}
                      >
                        {pg.panels.map((p) => (
                          <PanelFrame
                            key={p.shot.id} panel={p} format={format} rtl={cfg.readingDirection === "RTL"} scene={scene} actions={actions}
                            dimmed={isDimmed(p.shot)}
                            selected={selectedIds.has(p.shot.id)}
                            onToggleSelect={toggleSelect}
                            arcChips={arcChipsByShot[p.shot.id]}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[9px] font-mono tracking-widest" style={{ color: "#8a8578" }}>
                        <span>{project.title.toUpperCase()}</span>
                        <span>
                          SC{String(pg.sceneNumber).padStart(2, "0")} · P{pg.indexInScene + 1}
                          {cfg.readingDirection === "RTL" ? " ◀" : ""}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-8 print:hidden">
        Panel sizing follows shot grammar: establishing shots claim splash pages, close-ups pack tight, dynamic movements get speed lines.
        Hit the ✦ on any panel to generate AI artwork, the ✎ to author speech bubbles, the sliders to assign an artist and fine-tune the shot&apos;s style LoRA,
        and the ♪ to time sound cues on the motion timeline (with a synthesized preview).
        In webtoon format, Export slices packages the strip into 800px-wide platform-ready PNG slices with a manifest that carries audio timing, artists and LoRA metadata.
      </p>

      {editingShot && (
        <DialogueEditor
          shot={editingShot}
          characterNames={characterNames}
          speakerStates={speakerStates}
          open
          onClose={() => setEditingShot(null)}
          onSaved={invalidate}
          onExtendArc={(lineIndex, state) => extendStateArc(editingShot, lineIndex, state, "scene")}
          onExtendEpisodeArc={(lineIndex, state) => extendStateArc(editingShot, lineIndex, state, "episode")}
        />
      )}

      {inspectingShot && (
        <PanelInspectorDialog
          shot={inspectingShot}
          artists={project.artists}
          loras={project.loras}
          characters={project.characters}
          episodeNumber={episode?.number ?? null}
          episodeScenes={episode?.scenes}
          open
          onClose={() => setInspectingShot(null)}
          onSaved={invalidate}
        />
      )}

      {soundShot && (
        <SoundTimelineDialog
          shot={soundShot}
          open
          onClose={() => setSoundShot(null)}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}
