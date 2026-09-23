// Browser fixtures for Iteration 25 UI verification (seed | clean).
// seed: Ep12 fixture with a REAL wav-backed VOICE cue + an injected DSH
//       message carrying a playable arc chip; two audition-history rows
//       on the REAL Battle-damaged state (backed by existing wavs); one
//       production + one studio template pair ("browser fork") for the
//       cross-scope diff panel.
// clean: removes all of it. The real season is never modified.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;

const EP = 12;
const SC = 32;
const MSG_TAG = "[arc-chip-demo]";
const TEMPLATE_NAME = "browser fork";
const HIST_STATE_LABEL = "Battle-damaged (temple fight)";

if (process.argv[2] === "clean") {
  await db.episode.deleteMany({ where: { number: EP, season: { projectId } } });
  const gone = await db.dshMessage.deleteMany({ where: { projectId, content: { contains: MSG_TAG } } });
  const tmpl = await db.arcTemplate.deleteMany({ where: { name: TEMPLATE_NAME, OR: [{ projectId }, { projectId: null }] } });
  // history rows are identified by their seeded urls (existing audition wavs)
  const rows = await db.stateAudition.findMany({ where: { state: { label: HIST_STATE_LABEL, character: { projectId } } }, select: { id: true, url: true } });
  let hist = 0;
  for (const row of rows) {
    if (row.url.includes("variant-cmueba65e0001us5e03fxc47h") || row.url.includes("variant-cmud0e29s000mm0updcpjgz47")) {
      await db.stateAudition.delete({ where: { id: row.id } });
      hist += 1;
    }
  }
  console.log(`cleaned: ${gone.count} message(s), ${tmpl.count} template(s), ${hist} history row(s), episode ${EP}`);
} else {
  // ── fixture episode: one Lin Yue line in the span state + a REAL wav cue ──
  await db.episode.deleteMany({ where: { number: EP, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: EP, title: "Arc chip browser fixture", status: "DRAFT" } });
  const scene = await db.scene.create({ data: { episodeId: ep.id, number: SC, title: "Chip check", status: "DRAFT" } });
  const dialogue = JSON.stringify([{ speaker: "Lin Yue", text: "The storm bends, but it does not break me.", kind: "SPEECH", state: HIST_STATE_LABEL }]);
  const shot = await db.shot.create({ data: { sceneId: scene.id, number: 1, description: "Browser fixture shot", shotType: "CLOSEUP", dialogue } });
  // an EXISTING audition wav (real audio, no TTS in the fixture)
  await db.audioCue.create({
    data: {
      shotId: shot.id, kind: "VOICE", label: "Lin Yue: The storm bends, but it does not break me.",
      voiceUrl: "/auditions/variant-cmueba65e0001us5e03fxc47h.wav", voiceActor: "kazi",
      voiceDurationMs: 6120, voiceStateLabel: HIST_STATE_LABEL,
    },
  });

  const chip = {
    episodeId: ep.id,
    episodeNumber: EP,
    label: `Lin Yue - ${HIST_STATE_LABEL}`,
    ensemble: false,
    spans: [{ speakerKey: "lin yue", state: HIST_STATE_LABEL, shotIds: [shot.id] }],
  };
  const trace = [
    {
      step: 1,
      thought: "The battle-damaged arc is in place on Ep12 - the reply itself carries the play chip so the creator can hear it right here.",
      plan: ["Apply the arc", "Point the creator at the playable chip"],
      actions: [
        {
          tool: "apply_arc_template",
          args: { characterName: "Lin Yue", stateLabel: HIST_STATE_LABEL, template: "possession spread", scope: "scene", episodeNumber: EP, sceneNumber: SC },
          result:
            'Arc template "possession spread" (built-in) on Lin Yue with "Battle-damaged (temple fight)" across scene 32 shots 1-1: 1 line(s) stamped in shot(s) 1. Arc playback attached: the trace carries a play chip for this arc (Lin Yue - "Battle-damaged (temple fight)") - point the creator at it to hear the STORED takes in story order before re-rendering. Direction impact: 1 take is now stale - offer the re-render in this same turn.',
          status: "OK" as const,
          arcPlayback: chip,
        },
      ],
    },
  ];
  await db.dshMessage.create({
    data: {
      projectId,
      role: "dsh",
      content: `${MSG_TAG} The battle-damaged arc landed on Ep12. Press the play chip in the trace below to hear the arc's stored take straight from this reply.`,
      trace: JSON.stringify(trace),
    },
  });

  // ── audition history rows on the REAL state, backed by existing wavs ──
  const state = await db.characterState.findFirst({ where: { label: HIST_STATE_LABEL, character: { projectId } } });
  if (!state) throw new Error("Battle-damaged state not found");
  for (const [url, voiceId, speed] of [
    ["/auditions/variant-cmueba65e0001us5e03fxc47h.wav", "kazi", 0.74],
    ["/auditions/variant-cmud0e29s000mm0updcpjgz47.wav", "jam", 0.9],
  ] as const) {
    await db.stateAudition.create({
      data: {
        stateId: state.id, characterId: state.characterId, projectId,
        url, text: "The Jade Sword still answers my call.", source: "character line",
        voiceId, deliveryId: "INJURED", speed, pitch: 0.75, durationMs: 6052,
      },
    });
  }

  // ── template pair for the cross-scope diff: same name, different scopes + shapes ──
  await db.arcTemplate.deleteMany({ where: { name: TEMPLATE_NAME, OR: [{ projectId }, { projectId: null }] } });
  await db.arcTemplate.create({
    data: {
      projectId, scope: "PROJECT", name: TEMPLATE_NAME,
      description: "The production's own fork of the beat",
      segments: JSON.stringify([{ frac: 0.2, kind: "auto" }, { frac: 0.6, kind: "state" }, { frac: 0.2, kind: "auto" }]),
    },
  });
  await db.arcTemplate.create({
    data: {
      projectId: null, scope: "STUDIO", name: TEMPLATE_NAME,
      description: "The studio original every show starts from",
      segments: JSON.stringify([{ frac: 0.25, kind: "auto" }, { frac: 0.5, kind: "state" }, { frac: 0.25, kind: "auto" }]),
    },
  });

  console.log(`seeded: episode ${ep.id} fixture + chip message + 2 history rows + template pair`);
}
await db.$disconnect();
