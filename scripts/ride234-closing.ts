// RIDE 234 - THE CLOSING LAW'S FIRST STAGING. The review's path's
// last step spoke the rule ("when every scored source reads
// p10 >= floor AND mean >= floor, the verdict turns RELEASE and the
// episode stages for publish") and nothing executed it. This ride
// does, honestly: the review is rebuilt LIVE from the gate's own
// reads (the truth of NOW), the pure closing law
// (src/lib/release-closing.ts) turns the standing into the staging
// order, and the order rides:
//   - a non-RELEASE standing REFUSES - the refusing sources' own
//     gapLines ride out verbatim, the gate keeps its teeth, and the
//     refusal is named in the receipt (this box's expected answer:
//     the standing is BELOW until the tail and the body lift),
//   - a RELEASE standing sends the staging through
//     stagePublishPackage - and the spine's own gate answers again
//     there (two gates in sequence, the stricter first).
// The refreshed review receipt rides out too (the map is the truth
// of NOW), read-only on the arc: the closing law moves nothing.
// Run: npx tsx scripts/ride234-closing.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER } from "../src/lib/identity-repair";
import { buildReleaseReview, type ReleaseReview } from "../src/lib/release-review";
import { closingStagingDecision } from "../src/lib/release-closing";
import { stagePublishPackage } from "../src/lib/comic/publish";

const RIDE_RECEIPT = "receipts/ride234.jsonl";
const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";

async function main() {
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const projectId = identity.projectId;

  // the deterministic episode pick (the same law release-review232 rides)
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      seasons: {
        orderBy: { number: "asc" as const },
        select: {
          number: true,
          episodes: {
            orderBy: { number: "asc" as const },
            select: { id: true, number: true, title: true, scenes: { select: { _count: { select: { shots: true } } } } },
          },
        },
      },
    },
  });
  if (!project) throw new Error(`project ${projectId} not found - the living identity names a body the db does not carry`);
  const episodes = project.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e })));
  const shotCountOf = (e: { scenes: Array<{ _count: { shots: number } }> }) => e.scenes.reduce((a, sc) => a + sc._count.shots, 0);
  const episode = [...episodes].sort((a, b) => shotCountOf(b) - shotCountOf(a) || a.number - b.number)[0];
  if (!episode) throw new Error("no episode carries shots - nothing to close");
  const episodeTag = `E${episode.number}`;

  // the gate's own reads, LIVE - the truth of NOW
  const reads = [];
  for (const source of ["AI_KEYFRAME", "RENDER"] as const) {
    reads.push(await episodeReleaseVerdict(projectId, episode.id, source));
  }
  const review: ReleaseReview = buildReleaseReview({
    projectId,
    episodeId: episode.id,
    episodeTag,
    episodeTitle: episode.title,
    reads,
    repairBudget: { members: REPAIR_MAX_MEMBERS, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
  });
  fs.writeFileSync(path.join(process.cwd(), REVIEW_PATH), JSON.stringify(review, null, 2) + "\n");

  // THE CLOSING DECISION (pure) - and the order rides
  const decision = closingStagingDecision(review);
  console.log(`RIDE 234 - THE CLOSING LAW`);
  console.log(`  ${decision.line}`);
  for (const r of decision.refusals) console.log(`    refuses: ${r}`);

  let staging: { platform: string; ok: boolean; answer: string } | null = null;
  if (decision.stage) {
    const staged = await stagePublishPackage(episode.id, "YOUTUBE");
    staging = {
      platform: "YOUTUBE",
      ok: staged.ok,
      answer: staged.ok ? `package staged (${staged.pkg.id ?? "idless"})` : `the spine's own gate refused: ${staged.error}`,
    };
    console.log(`  staging: ${staging.answer}`);
  } else {
    console.log(`  the gate keeps its teeth - no staging rides (the refusal is the work order)`);
  }

  const row = {
    kind: "closing",
    rodeAt: new Date().toISOString(),
    episodeId: episode.id,
    episodeTag,
    standing: review.standing.verdict,
    stage: decision.stage,
    line: decision.line,
    refusals: decision.refusals,
    ...(staging ? { staging } : {}),
  };
  fs.appendFileSync(path.join(process.cwd(), RIDE_RECEIPT), JSON.stringify(row) + "\n");
  console.log(`  receipt -> ${RIDE_RECEIPT}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
