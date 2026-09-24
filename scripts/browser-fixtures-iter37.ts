// Browser fixtures for Iteration 37 UI verification (seed | clean).
// seed: a standalone fixture production "E2E Browser Iter37" with two
//       facts whose verdict events span two episodes (one DECLINING
//       curve, one STABLE) and a posted studio digest whose delivery
//       outcomes show FAILED (nothing listens on the probe URL) - the
//       honest display seam for the delivery chips.
// clean: deletes the fixture production (cascades).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TITLE = "E2E Browser Iter37";

if (process.argv[2] === "clean") {
  const proj = await db.project.findFirst({ where: { title: TITLE }, select: { id: true } });
  if (proj) await db.project.delete({ where: { id: proj.id } });
  console.log(`cleaned: fixture project ${proj ? "(cascaded)" : "(absent)"}`);
  process.exit(0);
}

const proj = await db.project.create({
  data: {
    title: TITLE,
    logline: "browser fixture: fact drift curves + digest delivery",
    characters: { create: [{ name: "Lin Yue", role: "PROTAGONIST" }] },
    seasons: {
      create: {
        number: 1,
        title: "S1",
        episodes: {
          create: [
            { number: 1, title: "Embers", scenes: { create: { number: 1, title: "Ash Steps", shots: { create: { number: 1, description: "Lin Yue on the stair", shotType: "MEDIUM", duration: 3 } } } } },
            { number: 2, title: "Cinders", scenes: { create: { number: 2, title: "Cold Camp", shots: { create: { number: 1, description: "Lin Yue at the fire", shotType: "WIDE", duration: 3 } } } } },
          ],
        },
      },
    },
  },
});
console.log(`fixture project ${proj.id}`);

// two facts with verdict events across episodes: the mask curve
// declines 0.9 -> 0.55; the moons curve stays stable
const facts = await db.universeFact.createManyAndReturn({
  data: [
    { projectId: proj.id, text: "the antagonist never removes his mask", category: "RULE", source: "USER" },
    { projectId: proj.id, text: "two moons hang over the arena", category: "WORLD", source: "USER" },
  ],
});
const ev = (factText: string, kind: string, conf: number, episode: number, shotRef: string) => ({
  projectId: proj.id,
  entityType: "UNIVERSE_FACT",
  entityName: factText.slice(0, 90),
  kind,
  episodeNumber: episode,
  description: `[universe shotX] (${shotRef}) confidence ${conf.toFixed(2)} - note`.slice(0, 900),
  severity: kind === "FACT_BROKEN" && conf >= 0.6 ? "WARNING" : "INFO",
});
await db.continuityEvent.createMany({
  data: [
    ev(facts[0].text, "FACT_HELD", 0.9, 1, "E1 Sc1 S001"),
    ev(facts[1].text, "FACT_HELD", 0.82, 1, "E1 Sc1 S001"),
    ev(facts[0].text, "FACT_BROKEN", 0.55, 2, "E2 Sc2 S001"),
    ev(facts[1].text, "FACT_HELD", 0.8, 2, "E2 Sc2 S001"),
  ],
});
console.log(`facts: ${facts.length}, 4 verdict events (mask DECLINING, moons STABLE)`);

// a posted digest with delivery outcomes recorded (the probe webhook
// refuses nothing listens there -> honest FAILED chip)
const digest = await postDailyDigestForBrowser(proj.id);
console.log(`digest: ${digest}`);

async function postDailyDigestForBrowser(projectId: string): Promise<string> {
  const { postDailyDigest } = await import("@/lib/digest");
  const result = await postDailyDigest(projectId, 24, { webhookUrl: "http://127.0.0.1:59999/probe" });
  return result.ok ? `${result.digest.headline} (${result.deliveries.length} delivery outcome(s))` : "FAIL";
}

console.log("seeded");
process.exit(0);
