// NIGHT 217 - THE AI-KEYFRAME RENDER SOURCE'S SECOND NIGHT.
//
// The 216 night read PROVISIONAL (nights 1 - a single-night read
// cannot carry a build decision). This night is the SECOND: the arc's
// two-night median exits PROVISIONAL (the 141 band's answer covers
// the generator's own swing - S003 rode 75 -> 50 across the 215/216
// boards, S002 75 -> 92). The 217 arms ride in the production law:
// the FRAMING clause (every cell), the CLOSE-FACE clause (the close
// rung), the ANCHOR-VIEW law (the close view as the second anchor on
// the close rung - the recipe names the view receipt).
//
// Run (detached, the double-fork law):
//   DATABASE_URL=file:... npx tsx scripts/night217-aikeyframe.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const episode = await db.episode.findFirst({ where: { season: { projectId: project.id }, number: 7 } });
  if (!episode) throw new Error("E7 missing");

  const NIGHT = process.env.ANIMEOS_NIGHT_TAG ?? "night-217-aikeyframe";
  const SAMPLES = Number(process.env.ANIMEOS_NIGHT_SAMPLES ?? "3");
  const OUT_DIR = process.env.ANIMEOS_NIGHT_OUTDIR ?? `inspect/aikeyframes/${NIGHT}`;
  console.log(`NIGHT 217: ${NIGHT} - the SECOND night over E7 (${SAMPLES} damped reads per keyframe, pixels -> ${OUT_DIR})`);

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
    const mode = `${r.mode}${r.anchoredSheets?.length ? ` [${r.anchoredSheets.join(" + ")}]` : ""}${r.anchorViews?.length ? ` views:[${r.anchorViews.join(" + ")}]` : ""}`;
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
    console.log(`  floor ${(g.floor * 100).toFixed(0)}% | arc ${g.arc} | nights ${g.nights}${g.provisional ? " (PROVISIONAL)" : " (the two-night median STANDS)"} | readings ${g.readings}`);
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
  console.log(`\nNIGHT 217 COMPLETE: ${pass}/${report.results.length} scored, gate verdict ${report.gate?.verdict ?? "UNREAD"}`);
  process.exit(0);
}
main().catch((e) => { console.error("NIGHT 217 FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
