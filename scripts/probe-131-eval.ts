import { db } from "../src/lib/db";
import { runRenderEvaluation } from "../src/lib/dsh/evaluator";

async function main() {
  const jobId = process.argv[2];
  const job = await db.renderJob.findUnique({ where: { id: jobId } });
  if (!job) { console.log("no such job"); process.exit(1); }
  console.log("job:", job.status, job.stage?.slice(0, 80));
  try {
    const ev = await runRenderEvaluation(jobId);
    console.log("EVAL OK:", ev ? `status=${ev.status} score=${(ev as any).score ?? "-"}` : "null");
  } catch (e) {
    console.log("EVAL THREW:", e instanceof Error ? `${e.message}\n${e.stack?.slice(0, 600)}` : String(e));
  }
  await db.$disconnect();
}
main();
