// Inject a DSH message whose trace carries an audition preview (UI verification),
// or remove it again (cleanup). Usage: bun scripts/inject-audition-trace.ts [clean]
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");

if (process.argv[2] === "clean") {
  const gone = await db.dshMessage.deleteMany({ where: { projectId: project.id, content: { contains: "[audition-preview-demo]" } } });
  console.log(`removed ${gone.count} injected message(s)`);
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
            "State voice performance set on Lin Yue \"Battle-damaged (temple fight)\" (Ep7): variant voice 'kazi', speed hint x0.9, pitch hint x0.75. Audition attached to this call: \"The Jade Sword still answers my call.\" performed by kazi at x0.74 pace with pitch x0.75 - tell the creator to play the preview in this trace to hear the new performance before re-rendering.",
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
