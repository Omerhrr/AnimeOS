// Fail RENDERING jobs whose local worker state file is gone or stale.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
const db = new PrismaClient();
async function main() {
  const jobs = await db.renderJob.findMany({ where: { status: "RENDERING" } });
  for (const j of jobs) {
    const f = path.join(process.cwd(), "public", "renders", `.job-${j.id}.json`);
    let stale = !fs.existsSync(f);
    if (!stale) stale = Date.now() - fs.statSync(f).mtimeMs > 15 * 60_000;
    if (stale) {
      await db.renderJob.update({ where: { id: j.id }, data: { status: "FAILED", stage: "worker lost (stale state file)", finishedAt: new Date() } });
      const shot = j.shotId ? await db.shot.update({ where: { id: j.shotId }, data: { status: "REVIEW" } }).catch(() => null) : null;
      console.log(`failed stale job ${j.id}${shot ? " (shot requeued)" : ""}`);
    } else {
      console.log(`job ${j.id} alive, left alone`);
    }
  }
}
main().finally(() => process.exit(0));
