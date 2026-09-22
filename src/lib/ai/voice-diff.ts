import { db } from "@/lib/db";
import { deliveryProfile } from "@/lib/comic/delivery";
import {
  parseTakeSig, resolveTakePlan, sigChanges, splitCueLabel,
} from "@/lib/ai/voice-plan";
import { renderVoiceTake } from "@/lib/ai/voice-render";

// ─────────────────────────────────────────────────────────────
// DIRECTION DIFF CORE
//
// A voice take is only as current as the direction it was made
// with. Every take stamps a snapshot of its inputs (voiceSig:
// text + voice + delivery + base speed); this module re-resolves
// what each VOICE cue WOULD render as today and diffs:
//   fresh      - take matches the current direction
//   stale      - direction moved (delivery / voice / line text /
//                speed), the take needs a re-render
//   unrendered - no take yet
//   blocked    - no speakable text, direction unresolved
// Shared by the voice-diffs API route and the DSH tools
// (diff_episode_direction, diff_all_episodes). Re-render helpers
// touch ONLY stale takes so a single state beat or line-level
// delivery edit never re-renders the whole episode.
// ─────────────────────────────────────────────────────────────

export const CHANGED_LABELS: Record<string, string> = {
  text: "line text",
  voice: "voice / casting",
  delivery: "delivery direction",
  speed: "base speed",
  snapshot: "predates direction snapshots",
};

export interface DiffCueRow {
  cueId: string;
  shotId: string;
  sceneNumber: number;
  shotNumber: number;
  speaker: string;
  text: string;
  status: "fresh" | "stale" | "unrendered" | "blocked";
  changed: string[];
  current: {
    deliveryId: string;
    deliveryLabel: string;
    source: string;
    stateLabel: string | null;
    voiceId: string;
    castArtistName: string | null;
    variant: { voiceId: string; stateLabel: string } | null;
    baseSpeed: number;
    effectiveSpeed: number;
  } | null;
  taken: { voiceId: string; deliveryId: string; baseSpeed: number } | null;
  takeInfo: {
    rendered: boolean;
    voiceActor: string | null;
    voiceState: string | null;
    voiceCast: string | null;
  };
}

export interface EpisodeDiff {
  episodeId: string;
  number: number;
  title: string;
  total: number;
  fresh: number;
  stale: number;
  unrendered: number;
  cues: DiffCueRow[];
}

export interface StaleCue {
  cueId: string;
  changed: string[];
  speaker: string;
}

type EpisodeWithCues = NonNullable<Awaited<ReturnType<typeof loadEpisodeCues>>>;

function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export async function loadEpisodeCues(episodeId: string) {
  return db.episode.findUnique({
    where: { id: episodeId },
    include: {
      season: { select: { projectId: true } },
      scenes: {
        orderBy: { number: "asc" },
        include: {
          shots: {
            orderBy: { number: "asc" },
            include: { audioCues: { where: { kind: "VOICE" }, orderBy: { startMs: "asc" } } },
          },
        },
      },
    },
  });
}

export async function diffEpisode(ep: EpisodeWithCues): Promise<EpisodeDiff> {
  const cues: DiffCueRow[] = [];
  let fresh = 0;
  let stale = 0;
  let unrendered = 0;

  for (const scene of ep.scenes) {
    for (const shot of scene.shots) {
      for (const cue of shot.audioCues) {
        const { speaker, text } = splitCueLabel(cue.label);
        try {
          const plan = await resolveTakePlan(
            { label: cue.label, voiceDelivery: cue.voiceDelivery, voiceSpeed: cue.voiceSpeed, shot: { dialogue: shot.dialogue } },
            ep.season.projectId,
            ep.number,
          );
          const stored = parseTakeSig(cue.voiceSig);
          const changed = !cue.voiceUrl ? [] : !stored ? ["snapshot"] : sigChanges(stored, plan.sig);
          const status = !cue.voiceUrl ? "unrendered" : changed.length > 0 ? "stale" : "fresh";
          if (status === "fresh") fresh += 1;
          else if (status === "stale") stale += 1;
          else unrendered += 1;
          cues.push({
            cueId: cue.id,
            shotId: shot.id,
            sceneNumber: scene.number,
            shotNumber: shot.number,
            speaker,
            text: cut(text, 90),
            status,
            changed: changed.map((c) => CHANGED_LABELS[c] ?? c),
            current: {
              deliveryId: plan.delivery.id,
              deliveryLabel: deliveryProfile(plan.delivery.id).label,
              source: plan.delivery.source,
              stateLabel: plan.delivery.stateLabel,
              voiceId: plan.voiceId,
              castArtistName: plan.cast.artistName,
              variant: plan.variant ? { voiceId: plan.variant.voiceId, stateLabel: plan.variant.stateLabel } : null,
              baseSpeed: plan.baseSpeed,
              effectiveSpeed: plan.speed,
            },
            taken: stored ? { voiceId: stored.v, deliveryId: stored.d, baseSpeed: stored.s } : null,
            takeInfo: {
              rendered: Boolean(cue.voiceUrl),
              voiceActor: cue.voiceActor,
              voiceState: cue.voiceState,
              voiceCast: cue.voiceCast,
            },
          });
        } catch {
          // unresolvable cue (no speakable text): surface it as blocked, not stale
          cues.push({
            cueId: cue.id,
            shotId: shot.id,
            sceneNumber: scene.number,
            shotNumber: shot.number,
            speaker,
            text: cut(text, 90),
            status: "blocked",
            changed: [],
            current: null,
            taken: null,
            takeInfo: { rendered: Boolean(cue.voiceUrl), voiceActor: cue.voiceActor, voiceState: cue.voiceState, voiceCast: cue.voiceCast },
          });
        }
      }
    }
  }
  return {
    episodeId: ep.id,
    number: ep.number,
    title: ep.title,
    total: cues.length,
    fresh,
    stale,
    unrendered,
    cues,
  };
}

export async function diffEpisodeById(episodeId: string): Promise<EpisodeDiff | null> {
  const ep = await loadEpisodeCues(episodeId);
  return ep ? diffEpisode(ep) : null;
}

/** Batch diff: every episode of a production, in season + episode order. */
export async function diffProjectEpisodes(projectId: string): Promise<EpisodeDiff[]> {
  const eps = await db.episode.findMany({
    where: { season: { projectId } },
    orderBy: [{ season: { number: "asc" } }, { number: "asc" }],
  });
  const out: EpisodeDiff[] = [];
  for (const ep of eps) {
    const full = await loadEpisodeCues(ep.id);
    if (full) out.push(await diffEpisode(full));
  }
  return out;
}

/** Resolve which rendered takes of one episode are stale (and why). */
async function resolveStale(ep: EpisodeWithCues): Promise<{ staleCues: StaleCue[]; total: number }> {
  const projectId = ep.season.projectId;
  const staleCues: StaleCue[] = [];
  for (const scene of ep.scenes) {
    for (const shot of scene.shots) {
      for (const cue of shot.audioCues) {
        if (!cue.voiceUrl) continue; // unrendered cues are the sound timeline's job
        try {
          const plan = await resolveTakePlan(
            { label: cue.label, voiceDelivery: cue.voiceDelivery, voiceSpeed: cue.voiceSpeed, shot: { dialogue: shot.dialogue } },
            projectId,
            ep.number,
          );
          const stored = parseTakeSig(cue.voiceSig);
          const changed = !stored ? ["snapshot"] : sigChanges(stored, plan.sig);
          if (changed.length > 0) {
            staleCues.push({ cueId: cue.id, changed, speaker: plan.speaker });
          }
        } catch {
          // blocked cues cannot be re-rendered either; the diff surfaces them
        }
      }
    }
  }
  const total = ep.scenes.reduce((n, s) => n + s.shots.reduce((m, sh) => m + sh.audioCues.length, 0), 0);
  return { staleCues, total };
}

/** Render up to `budget` stale takes with a small worker pool (TTS friendly). */
async function renderStaleBatch(staleCues: StaleCue[], budget: number) {
  const reRendered: Array<{ cueId: string; speaker: string; deliveryId: string; changed: string[] }> = [];
  const failed: Array<{ cueId: string; error: string }> = [];
  const queue = staleCues.slice(0, Math.max(0, budget));
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        const res = await renderVoiceTake(item.cueId);
        reRendered.push({
          cueId: item.cueId,
          speaker: item.speaker,
          deliveryId: res.delivery.id,
          changed: item.changed.map((c) => CHANGED_LABELS[c] ?? c),
        });
      } catch (err) {
        failed.push({ cueId: item.cueId, error: err instanceof Error ? err.message : "render failed" });
      }
    }
  });
  await Promise.all(workers);
  return { reRendered, failed };
}

function tallyText(staleCues: StaleCue[]): string {
  const tally = staleCues
    .flatMap((c) => c.changed)
    .reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
  return Object.entries(tally)
    .map(([k, v]) => `${v} ${CHANGED_LABELS[k] ?? k}`)
    .join(", ");
}

export interface ReRenderOutcome {
  reRendered: Array<{ cueId: string; speaker: string; deliveryId: string; changed: string[] }>;
  failed: Array<{ cueId: string; error: string }>;
  staleCount: number;
  remaining: number;
  summary: string;
}

/**
 * Re-render ONLY the stale takes of one episode. actor "USER" keeps
 * the API route's history voice; DSH passes "DSH".
 */
export async function reRenderStaleTakes(
  episodeId: string,
  opts: { actor?: string; limit?: number } = {},
): Promise<ReRenderOutcome | null> {
  const ep = await loadEpisodeCues(episodeId);
  if (!ep) return null;
  const { staleCues, total } = await resolveStale(ep);
  if (staleCues.length === 0) {
    return {
      reRendered: [],
      failed: [],
      staleCount: 0,
      remaining: 0,
      summary: `All rendered takes already match the current direction (${total} VOICE cue(s) in Episode ${ep.number})`,
    };
  }
  const { reRendered, failed } = await renderStaleBatch(staleCues, opts.limit ?? staleCues.length);
  const text = tallyText(staleCues);
  await db.productionEvent.create({
    data: {
      projectId: ep.season.projectId,
      actor: opts.actor ?? "USER",
      type: "STATE_CHANGE",
      summary: `${opts.actor === "DSH" ? "DSH direction diff" : "Direction diff"} re-rendered ${reRendered.length} of ${staleCues.length} stale take(s) in Episode ${ep.number} (${text || "snapshot refresh"})`,
    },
  });
  return {
    reRendered,
    failed,
    staleCount: staleCues.length,
    remaining: staleCues.length - reRendered.length - failed.length,
    summary: `Re-rendered ${reRendered.length} of ${staleCues.length} stale take(s) in Episode ${ep.number} (${text || "snapshot refresh"}); ${total - staleCues.length} take(s) untouched`,
  };
}

export interface BatchReRenderOutcome {
  episodes: Array<{ episodeId: string; number: number; title: string; staleCount: number; reRendered: number; failed: number }>;
  reRenderedCount: number;
  failedCount: number;
  remaining: number;
  summary: string;
}

/**
 * Batch re-render stale takes across EVERY episode of a production,
 * capped by `limit` per call so TTS is not hammered. Reports how many
 * stale takes remain for a follow-up call.
 */
export async function reRenderStaleAcrossProject(
  projectId: string,
  opts: { actor?: string; limit?: number } = {},
): Promise<BatchReRenderOutcome> {
  const limit = Math.min(32, Math.max(1, opts.limit ?? 16));
  const eps = await db.episode.findMany({
    where: { season: { projectId } },
    orderBy: [{ season: { number: "asc" } }, { number: "asc" }],
  });

  const episodes: BatchReRenderOutcome["episodes"] = [];
  let reRenderedCount = 0;
  let failedCount = 0;
  let staleTotal = 0;
  let budget = limit;

  for (const ep of eps) {
    const full = await loadEpisodeCues(ep.id);
    if (!full) continue;
    const { staleCues } = await resolveStale(full);
    if (staleCues.length === 0) {
      episodes.push({ episodeId: ep.id, number: ep.number, title: ep.title, staleCount: 0, reRendered: 0, failed: 0 });
      continue;
    }
    staleTotal += staleCues.length;
    if (budget <= 0) {
      episodes.push({ episodeId: ep.id, number: ep.number, title: ep.title, staleCount: staleCues.length, reRendered: 0, failed: 0 });
      continue;
    }
    const { reRendered, failed } = await renderStaleBatch(staleCues, budget);
    budget -= reRendered.length + failed.length;
    reRenderedCount += reRendered.length;
    failedCount += failed.length;
    episodes.push({ episodeId: ep.id, number: ep.number, title: ep.title, staleCount: staleCues.length, reRendered: reRendered.length, failed: failed.length });
  }

  const remaining = Math.max(0, staleTotal - reRenderedCount - failedCount);
  const touched = episodes.filter((e) => e.staleCount > 0);
  if (reRenderedCount > 0 || failedCount > 0) {
    await db.productionEvent.create({
      data: {
        projectId,
        actor: opts.actor ?? "USER",
        type: "STATE_CHANGE",
        summary: `${opts.actor === "DSH" ? "DSH batch direction diff" : "Batch direction diff"} re-rendered ${reRenderedCount} stale take(s) across ${touched.length} episode(s)${failedCount ? `, ${failedCount} failed` : ""}${remaining ? `, ${remaining} stale take(s) remain for a follow-up call` : ""}`,
      },
    });
  }
  const perEp = touched.map((e) => `Ep${String(e.number).padStart(2, "0")} ${e.reRendered}/${e.staleCount}`).join(", ");
  return {
    episodes,
    reRenderedCount,
    failedCount,
    remaining,
    summary: reRenderedCount === 0 && staleTotal === 0
      ? "Every rendered take across all episodes already matches the current direction"
      : `Batch re-rendered ${reRenderedCount} of ${staleTotal} stale take(s)${perEp ? ` (${perEp})` : ""}${failedCount ? `, ${failedCount} failed` : ""}${remaining ? `; ${remaining} stale take(s) remain, call again to continue` : ""}`,
  };
}
