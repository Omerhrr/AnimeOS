// quick FINAL-job state readout (supports the budgeted finalall loop)
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const jobs = await p.renderJob.findMany({ where: { mode: "FINAL" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, status: true, progress: true, stage: true } });
console.log(JSON.stringify(jobs, null, 1));
await p.$disconnect();
