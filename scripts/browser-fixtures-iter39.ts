// Browser fixtures for Iteration 39 UI verification (seed | clean).
// seed: a fixture production "E2E Browser Iter39" with a cast character
//       (clone-train button target), a fact whose HELD verdicts still
//       DECLINE across episodes (the curve-aware suggestion fires even
//       with a perfect hold rate), and a pre-staged publish package
//       whose Upload button refuses honestly without credentials.
// clean: deletes the fixture production (cascades).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter39";

if (process.argv[2] === "clean") {
  const proj = await db.project.findFirst({ where: { title: TITLE }, select: { id: true } });
  if (proj) await db.project.delete({ where: { id: proj.id } });
  console.log(`cleaned: fixture project ${proj ? "(cascaded)" : "(absent)"}`);
  process.exit(0);
}

const proj = await db.project.create({
  data: {
    title: TITLE,
    logline: "browser fixture: neural acoustic + upload adapters + curve suggestions + voice clone",
    characters: { create: [{ name: "Lin Yue", role: "PROTAGONIST" }] },
    seasons: {
      create: {
        number: 1,
        title: "S1",
        episodes: {
          create: {
            number: 1,
            title: "Embers",
            scenes: {
              create: {
                number: 1,
                title: "Ash Steps",
                shots: { create: { number: 1, description: "Lin Yue on the stair", shotType: "MEDIUM", duration: 3 } },
              },
            },
          },
        },
      },
    },
  },
  include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
});
const shot = proj.seasons[0].episodes[0].scenes[0].shots[0];
console.log(`fixture project ${proj.id}`);

// a fact the audits keep PESSIMIZING about while never breaking:
// confidence 0.9 -> 0.75 -> 0.4 across two episodes, all HELD. The
// hold-rate rule cannot fire (100% held); only the curve rule can.
const fact = await db.universeFact.create({
  data: { projectId: proj.id, text: "the stair holds spirit embers", category: "WORLD", source: "USER" },
});
const ev = (conf: number, episode: number, ref: string) => ({
  projectId: proj.id,
  entityType: "UNIVERSE_FACT",
  entityName: fact.text.slice(0, 90),
  kind: "FACT_HELD",
  episodeNumber: episode,
  description: `[universe ${shot.id}] (${ref}) confidence ${conf.toFixed(2)} - embers fainter than last panel`.slice(0, 900),
  severity: "INFO",
});
await db.continuityEvent.createMany({ data: [ev(0.9, 1, "E1 Sc1 S001"), ev(0.75, 1, "E1 Sc1 S001"), ev(0.4, 2, "E1 Sc1 S001")] });

// a pre-staged publish package (no cut file needed: the upload path
// refuses on credentials before touching the disk)
await db.productionEvent.create({
  data: {
    projectId: proj.id,
    actor: "USER",
    type: "PUBLISH",
    summary: "Publish package staged - EP01 -> YouTube: 5/5 checks passed, ready for upload",
    payload: JSON.stringify({
      platform: "YOUTUBE",
      platformLabel: "YouTube",
      ready: true,
      checksPassed: 5,
      checksTotal: 5,
      title: "E2E Browser Iter39 - EP01 Embers",
      description: "Browser fixture package.",
      subtitle: { format: "srt", cues: 1, filename: "e2e-browser-iter39-ep01.srt" },
      integration: { configured: false, detail: "no upload credentials (ANIMEOS_YT_ACCESS_TOKEN)", envKeys: ["ANIMEOS_YT_ACCESS_TOKEN"] },
      cut: { url: "/renders/cuts/e2e-browser-iter39-ep01.mp4", file: "e2e-browser-iter39-ep01.mp4", durationMs: 3000, width: 960, height: 540, fps: 24, bytes: 1000 },
      conformance: [],
      tags: ["fixture"],
    }),
  },
});

console.log(`fact: ${fact.text} (3 HELD verdicts declining 0.9 -> 0.4 -> curve suggestion)`);
console.log("seeded");
process.exit(0);
