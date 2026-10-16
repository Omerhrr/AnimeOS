// NIGHT 216 - THE AI-KEYFRAME RENDER SOURCE CLASS'S FIRST NIGHT.
//
// The 213-215 probes validated the lever and the arms; the 216 class
// (src/lib/ai/keyframe.ts) compiles them into the production render
// source. This night is the class's own first ride: one anchored
// keyframe per shot of EP07 Sc12 (the six-cell board), the SAME
// identity instrument reading each (the judge-variance damped
// median), the arc rows APPENDING WITH THE SOURCE NAMED
// ("AI_KEYFRAME" - the durable ledger carries them), and the SAME
// release gate reading the source's own board at the source's own bar
// (0.7 - candidate shipping pixels answer the shipping floor).
//
// The honest verdict discipline: a shot that fails generation or
// scoring rides NO row (the REFUSED pattern); the gate reads what the
// ledger actually carries; a one-night board reads PROVISIONAL (the
// 141 band's answer is the multi-night median, not one sweep).
//
// Run (detached, the double-fork law):
//   DATABASE_URL=file:... npx tsx scripts/night216-aikeyframe.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const episode = await db.episode.findFirst({ where: { season: { projectId: project.id }, number: 7 } });
  if (!episode) throw new Error("E7 missing");

  const NIGHT = process.env.ANIMEOS_NIGHT_TAG ?? "night-216-aikeyframe";
  const SAMPLES = Number(process.env.ANIMEOS_NIGHT_SAMPLES ?? "3");
  const OUT_DIR = process.env.ANIMEOS_NIGHT_OUTDIR ?? `inspect/aikeyframes/${NIGHT}`;
  console.log(`NIGHT 216: ${NIGHT} - the AI_KEYFRAME render source's first night over E7 (${SAMPLES} damped reads per keyframe, pixels -> ${OUT_DIR})`);

  const { runAiKeyframeNight } = await import("../src/lib/ai/keyframe");
  const report = await runAiKeyframeNight(project.id, episode.id, { night: NIGHT, samples: SAMPLES, outDir: OUT_DIR });

  console.log(`\ncohort: ${report.cohort} (the bridge law versions)`);
  let pass = 0;
  for (const r of report.results) {
    if (!r.ok) {
      console.log(`${r.ref}: REFUSED - ${String(r.error).slice(0, 160)}`);
      continue;
    }
    pass += 1;
    const mode = `${r.mode}${r.anchoredSheets?.length ? ` [${r.anchoredSheets.join(" + ")}]` : ""}`;
    for (const e of r.entries ?? []) {
      const aspects = Object.entries(e.aspects ?? {})
        .map(([k, n]) => `${k} ${Math.round((n as number) * 100)}`)
        .join(", ");
      console.log(`${r.ref} ${e.characterName}: ${Math.round(e.similarity * 100)}% [${aspects}]`);
    }
    console.log(`${r.ref} SHOT WORST ${Math.round((r.worst ?? 0) * 100)}% (${mode}, ${r.sampleCount} reads)`);
  }
  console.log(`\nappended: ${report.appended}/${report.results.length} shots rode ${NIGHT} with source AI_KEYFRAME`);

  if (report.gate) {
    const g = report.gate;
    console.log(`\nTHE GATE (episodeReleaseVerdict at the AI_KEYFRAME bar):`);
    console.log(`  floor ${(g.floor * 100).toFixed(0)}% | arc ${g.arc} | nights ${g.nights}${g.provisional ? " (PROVISIONAL - the multi-night median is the release number)" : ""} | readings ${g.readings}`);
    console.log(`  VERDICT: ${g.verdict}`);
    if (g.blocking.length > 0) {
      console.log(`  blocking cells (worst p10 first):`);
      for (const c of g.blocking) {
        console.log(`    ${c.key}: p10 ${Math.round((c.p10 ?? 0) * 100)} / median ${Math.round((c.median ?? 0) * 100)} / n ${c.n} (${c.verdict})`);
      }
    }
  } else {
    console.log(`\nTHE GATE: refused to read - ${report.gateError ?? "unknown"}`);
  }

  await db.$disconnect();
  // THE WATCHER'S HELPER LAW: exit explicitly - the Prisma pool keeps
  // the tsx event loop alive after disconnect.
  console.log(`\nNIGHT 216 COMPLETE: ${pass}/${report.results.length} scored, gate verdict ${report.gate?.verdict ?? "UNREAD"}`);
  process.exit(0);
}
main().catch((e) => { console.error("NIGHT 216 FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
