// RELEASE REVIEW 232 - the answer's first fruit, ridden for real.
// Reads the living identity (receipts/box-identity.json - the custody
// law's own artifact), takes the episode that carries the work (the
// seed's E7 Sc12), asks the gate for BOTH sources' own reads
// (AI_KEYFRAME - the arc's newest cohort, RENDER - the standing
// history), and turns them into the durable review through the pure
// law (src/lib/release-review.ts). Writes receipts/release-review.json
// and prints the map: the standing, and what stands between this
// episode and its first RELEASE verdict.
// Run: npx tsx scripts/release-review232.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER } from "../src/lib/identity-repair";
import { buildReleaseReview, type ReleaseReview } from "../src/lib/release-review";

const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";

async function main() {
  // the living identity - the custody law's own artifact names the body
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as {
    projectId: string;
    seededAt?: string;
    source?: string;
  };
  const projectId = identity.projectId;

  // the episode that carries the work: the most-shot episode (the
  // seed's E7 Sc12/6 on this box), deterministically the first by number
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
  const episodes = project.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, seasonNumber: s.number })));
  const shotCountOf = (e: { scenes: Array<{ _count: { shots: number } }> }) => e.scenes.reduce((a, sc) => a + sc._count.shots, 0);
  const episode = [...episodes].sort((a, b) => shotCountOf(b) - shotCountOf(a) || a.number - b.number)[0];
  if (!episode) throw new Error("no episode carries shots - nothing to review");
  const episodeTag = `E${episode.number}`;

  // the gate's own reads: every source the studio scores, one bar each
  const sources = ["AI_KEYFRAME", "RENDER"] as const;
  const reads = [];
  for (const source of sources) {
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

  console.log(`RELEASE REVIEW - ${project.title} ${episodeTag} "${episode.title}"`);
  console.log(`  ${review.headline}`);
  for (const s of review.sources) {
    console.log(`  ${s.gapLine}`);
    console.log(`    span: ${s.spanLine} | floor ${pctOf(s.floor)} | blockers: ${s.blocking.map((b) => `${b.key} ${b.verdict} p10 ${pctOf(b.p10)}`).join(", ") || "none"}`);
  }
  console.log("  the path:");
  for (const step of review.path) console.log(`    - ${step}`);
  console.log(`  receipt -> ${REVIEW_PATH}`);
}

function pctOf(v: number | null): string {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
