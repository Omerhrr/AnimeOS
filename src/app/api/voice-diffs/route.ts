export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryProfile } from "@/lib/comic/delivery";
import {
  parseTakeSig, resolveTakePlan, sigChanges, splitCueLabel,
} from "@/lib/ai/voice-plan";
import { renderVoiceTake } from "@/lib/ai/voice-render";

// ─────────────────────────────────────────────────────────────
// PER-EPISODE VOICE DIRECTION DIFF
//
// A voice take is only as current as the direction it was made
// with. Every take stamps a snapshot of its inputs (voiceSig:
// text + voice + delivery + base speed); this route re-resolves
// what each VOICE cue WOULD render as today and diffs:
//   fresh      - take matches the current direction
//   stale      - direction moved (delivery / voice / line text /
//                speed), the take needs a re-render
//   unrendered - no take yet
// POST re-renders ONLY the stale takes of one episode, so a
// single state beat or line-level delivery edit never re-renders
// the whole episode.
// ─────────────────────────────────────────────────────────────

const CHANGED_LABELS: Record<string, string> = {
  text: "line text",
  voice: "voice / casting",
  delivery: "delivery direction",
  speed: "base speed",
  snapshot: "predates direction snapshots",
};

function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

async function loadEpisodeCues(episodeId: string) {
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

async function diffEpisode(ep: NonNullable<Awaited<ReturnType<typeof loadEpisodeCues>>>) {
  const projectId = ep.season.projectId;
  const cues: Array<Record<string, unknown>> = [];
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
            projectId,
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
              voiceId: plan.cast.voiceId,
              castArtistName: plan.cast.artistName,
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const episodeId = searchParams.get("episodeId");
  const projectId = searchParams.get("projectId");
  if (!episodeId && !projectId) {
    return NextResponse.json({ error: "episodeId or projectId required" }, { status: 400 });
  }

  const episodes = await db.episode.findMany({
    where: episodeId ? { id: episodeId } : { season: { projectId: projectId! } },
    orderBy: [{ season: { number: "asc" } }, { number: "asc" }],
  });
  if (episodes.length === 0) return NextResponse.json({ episodes: [] });

  const out: Array<Awaited<ReturnType<typeof diffEpisode>>> = [];
  for (const ep of episodes) {
    const full = await loadEpisodeCues(ep.id);
    if (full) out.push(await diffEpisode(full));
  }
  return NextResponse.json({ episodes: out });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const episodeId = body.episodeId ? String(body.episodeId) : "";
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });

  const ep = await loadEpisodeCues(episodeId);
  if (!ep) return NextResponse.json({ error: "Episode not found" }, { status: 404 });

  // resolve which takes are stale before touching anything
  const projectId = ep.season.projectId;
  const staleCues: Array<{ cueId: string; changed: string[]; speaker: string }> = [];
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
          // blocked cues cannot be re-rendered either; the diff GET surfaces them
        }
      }
    }
  }

  if (staleCues.length === 0) {
    const total = ep.scenes.reduce((n, s) => n + s.shots.reduce((m, sh) => m + sh.audioCues.length, 0), 0);
    return NextResponse.json({
      reRendered: [],
      failed: [],
      summary: `All rendered takes already match the current direction (${total} VOICE cue(s) in Episode ${ep.number})`,
    });
  }

  // re-render ONLY the stale takes, small pool so TTS is not hammered
  const reRendered: Array<Record<string, unknown>> = [];
  const failed: Array<{ cueId: string; error: string }> = [];
  const queue = [...staleCues];
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        const res = await renderVoiceTake(item.cueId);
        const d = res.delivery as { id: string };
        reRendered.push({
          cueId: item.cueId,
          speaker: item.speaker,
          deliveryId: d.id,
          changed: item.changed.map((c) => CHANGED_LABELS[c] ?? c),
        });
      } catch (err) {
        failed.push({ cueId: item.cueId, error: err instanceof Error ? err.message : "render failed" });
      }
    }
  });
  await Promise.all(workers);

  const changeTally = staleCues
    .flatMap((c) => c.changed)
    .reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
  const tallyText = Object.entries(changeTally)
    .map(([k, v]) => `${v} ${CHANGED_LABELS[k] ?? k}`)
    .join(", ");
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: `Direction diff re-rendered ${reRendered.length} of ${staleCues.length} stale take(s) in Episode ${ep.number} (${tallyText || "snapshot refresh"})`,
    },
  });

  const total = ep.scenes.reduce((n, s) => n + s.shots.reduce((m, sh) => m + sh.audioCues.length, 0), 0);
  return NextResponse.json({
    reRendered,
    failed,
    summary: `Re-rendered ${reRendered.length} of ${staleCues.length} stale take(s) in Episode ${ep.number} (${tallyText || "snapshot refresh"}); ${total - staleCues.length} take(s) untouched`,
  });
}
