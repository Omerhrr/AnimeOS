import { db } from "../src/lib/db";
import { castArcMeasurement, belowArcShotsForCharacter, REPAIR_MAX_SHOTS_PER_MEMBER } from "../src/lib/identity-repair";
import { buildRepairWorkOrders } from "../src/lib/repair-work-order";
import fs from "fs";
const identity = JSON.parse(fs.readFileSync("receipts/box-identity.json", "utf8")) as { projectId: string };
const review = JSON.parse(fs.readFileSync("receipts/release-review.json", "utf8")) as { projectId: string; episodeId: string };
async function main() {
  console.log("identity.projectId:", identity.projectId, "| review.projectId:", review.projectId, "| episode:", review.episodeId);
  const door = await castArcMeasurement(identity.projectId, review.episodeId);
  console.log("instrument:", door.instrument, "| bar:", door.measurement.bar, "| cast:", door.measurement.cast, "| anchored:", door.measurement.anchored, "| measured:", door.measurement.measured);
  for (const m of door.measurement.members) {
    console.log(`  ${m.name}: ${m.standing} | readings ${m.readings} | worst ${m.worst !== null ? Math.round(m.worst * 100) + "%" : "-"} | anchored ${m.anchored}`);
    if (m.standing === "BELOW") {
      const below = await belowArcShotsForCharacter(identity.projectId, review.episodeId, m.name, door.measurement.bar, REPAIR_MAX_SHOTS_PER_MEMBER);
      console.log(`     below queue: ${below.map((b) => `${b.ref}@${Math.round(b.similarity * 100)}%`).join(", ") || "(empty)"}`);
    }
  }
  const orders = buildRepairWorkOrders(review as never);
  for (const o of orders) console.log(`order ${o.source}: ${o.verdict} by ${o.answeredBy} named=[${o.namedRefs.join(",")}]`);
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
