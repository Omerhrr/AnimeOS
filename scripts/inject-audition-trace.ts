// Inject a DSH message whose trace carries an audition preview (UI verification),
// an ENSEMBLE audition preview (one row per engaged speaker), or remove them
// again (cleanup). Usage: bun scripts/inject-audition-trace.ts [ensemble] [clean]
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");

if (process.argv[2] === "clean") {
  const gone = await db.dshMessage.deleteMany({
    where: { projectId: project.id, OR: [{ content: { contains: "[audition-preview-demo]" } }, { content: { contains: "[ensemble-audition-demo]" } }] },
  });
  console.log(`removed ${gone.count} injected message(s)`);
} else if (process.argv[2] === "ensemble") {
  const row = (over: Record<string, unknown>) => ({
    url: "/auditions/variant-cmueba65e0001us5e03fxc47h.wav?v=1790166000000",
    mimeType: "audio/wav",
    durationMs: 6120,
    text: "The Jade Sword still answers my call.",
    source: "character line" as const,
    voiceId: "kazi",
    deliveryId: "INJURED",
    speed: 0.9,
    pitch: 0.75,
    stateLabel: "Battle-damaged (temple fight)",
    characterName: "Lin Yue",
    current: {
      cueId: "cmueba65q0009us5e5x7uojac",
      url: "/voices/cmueba65q0009us5e5x7uojac.wav?v=1790166000000",
      mimeType: "audio/wav",
      durationMs: 3358,
      voiceId: "douji",
      deliveryId: "INJURED",
      stateLabel: null as string | null,
      origin: "stored take" as const,
    },
    ...over,
  });
  const ensembleAudition = {
    speakers: [
      row({}),
      row({
        characterName: "Chen Hao",
        stateLabel: "Possessor (parallel beat)",
        text: "Then watch it answer for both of us.",
        url: "/voices/cmueba65q0009us5e5x7uojac.wav?v=1790166000001",
        voiceId: "chun",
        deliveryId: "EXCITED",
        speed: 1,
        pitch: 1,
        durationMs: 2980,
        current: null,
      }),
    ],
    skipped: ["- Nobody Here: SKIPPED (Character 'Nobody Here' not found.)"],
  };
  const trace = [
    {
      step: 1,
      thought: "The rivals crack together: one possession spread lands on both speakers in a single batch, so the ensemble audition rides the same call.",
      plan: ["Apply possession spread to the ensemble", "Point the creator at the audition rows"],
      actions: [
        {
          tool: "apply_arc_template",
          args: {
            characters: [{ name: "Lin Yue" }, { name: "Chen Hao", stateLabel: "Possessor (parallel beat)" }],
            stateLabel: "Battle-damaged (temple fight)",
            template: "possession spread",
            scope: "scene",
            episodeNumber: 8,
            sceneNumber: 20,
          },
          result:
            "Ensemble arc template \"possession spread\" with 2 speakers across scene 20 shots 1-4: 2 line(s) stamped in shot(s) 2, 3. - Lin Yue with \"Battle-damaged (temple fight)\": 1 line(s) stamped of 2. - Chen Hao with \"Possessor (parallel beat)\": 1 line(s) stamped of 2. Ensemble audition attached to this call: 2 proposed reads (Lin Yue \"Battle-damaged (temple fight)\", Chen Hao \"Possessor (parallel beat)\") - tell the creator to play the rows (or the sequence) in this trace to hear the new beat before re-rendering. Direction impact: 2 takes are now stale - offer the re-render in this same turn.",
          status: "OK" as const,
          ensembleAudition,
        },
      ],
    },
  ];
  const msg = await db.dshMessage.create({
    data: {
      projectId: project.id,
      role: "dsh",
      content: "[ensemble-audition-demo] The possession spread landed on both rivals in one batch. Each engaged speaker carries a proposed read in the trace below: play the rows or the whole sequence to hear the beat before deciding on the re-render.",
      trace: JSON.stringify(trace),
    },
  });
  console.log(`injected ensemble message ${msg.id}`);
} else {
  const audition = {
    url: "/auditions/variant-cmud0e29s000mm0updcpjgz47.wav?v=1790110312325",
    mimeType: "audio/wav",
    durationMs: 6052,
    text: "The Jade Sword still answers my call.",
    source: "character line",
    voiceId: "kazi",
    deliveryId: "INJURED",
    speed: 0.74,
    pitch: 0.75,
    stateLabel: "Battle-damaged (temple fight)",
    characterName: "Lin Yue",
    current: {
      cueId: "cmud1jgch0001m097p6uxcn3t",
      url: "/voices/cmud1jgch0001m097p6uxcn3t.wav?v=1790109012861",
      mimeType: "audio/wav",
      durationMs: 3358,
      voiceId: "jam",
      deliveryId: "INJURED",
      stateLabel: "Battle-damaged (temple fight)",
      origin: "stored take",
    },
  };
  const trace = [
    {
      step: 1,
      thought: "The possessed beat needs a different instrument: binding kazi to the battle-damaged state with a slower, deeper read.",
      plan: ["Bind the variant voice to the state", "Point the creator at the audition"],
      actions: [
        {
          tool: "set_state_voice_variant",
          args: { characterName: "Lin Yue", stateLabel: "battle-damaged", voice: "kazi", speedHint: 0.9, pitchHint: 0.75 },
          result:
            "State voice performance set on Lin Yue \"Battle-damaged (temple fight)\" (Ep7): variant voice 'kazi', speed hint x0.9, pitch hint x0.75. Audition attached to this call as an A/B pair: the current stored take (jam) and the NEW performance (kazi at x0.74 pace with pitch x0.75) of the same line - tell the creator to play both in this trace and compare before re-rendering.",
          status: "OK",
          audition,
        },
      ],
    },
  ];
  const msg = await db.dshMessage.create({
    data: {
      projectId: project.id,
      role: "dsh",
      content: "[audition-preview-demo] I bound kazi to Lin Yue's battle-damaged state with a slower, deeper read. An audition of the new performance is attached to the tool call below: play it to hear the variant before I re-render the stale take.",
      trace: JSON.stringify(trace),
    },
  });
  console.log(`injected message ${msg.id}`);
}
await db.$disconnect();
