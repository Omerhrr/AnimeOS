import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const proj = await db.project.findFirst({ where: { title: "E2E Browser Iter34" }, select: { id: true } });
if (!proj) { console.log("project gone (already cleaned)"); process.exit(0); }
const plans = await db.dshPlan.findMany({ where: { projectId: proj.id }, select: { title: true, status: true, source: true, steps: true } });
for (const p of plans) console.log("PLAN:", p.status, p.source, p.title, `steps=${JSON.parse(p.steps).length}`);
const scores = await db.identityScore.findMany({ where: { projectId: proj.id }, select: { worst: true, castSize: true, scores: true } });
for (const s of scores) console.log("IDENTITY:", s.worst, "cast", s.castSize, s.scores.slice(0, 60));
const events = await db.continuityEvent.findMany({ where: { projectId: proj.id, kind: { in: ["IDENTITY_VERIFIED", "IDENTITY_DRIFT"] } }, select: { kind: true, severity: true, description: true } });
for (const e of events) console.log("EVENT:", e.kind, e.severity, e.description.slice(0, 70));
const jobs = await db.renderJob.findMany({ where: { projectId: proj.id }, select: { driver: true, status: true, telemetry: true } });
for (const j of jobs) console.log("JOB:", j.driver, j.status, j.telemetry?.slice(0, 90));
process.exit(0);
