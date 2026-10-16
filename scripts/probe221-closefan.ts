// PROBE 221 - THE CLOSE RUNG'S TAKE FAN (the 220 frontier's evidence
// item, paired, READ-ONLY - no ledger write, no night append).
//
// The close cell's band is a TRADE AXIS (the 220 eye receipt): the
// draws alternate between framing-lost (the anchor's presentation
// pull) and medium-drifted (the 218 photoreal trade), and k=2 can
// only ship the better of two misses when the draws sit on opposite
// sides. The question the k=3 fan answers: does a THIRD sample land
// a take that holds BOTH (framing AND medium) - the 217 arm's 90
// draw proved the mode exists? The band's history is four nights
// deep (50/60/85/40); this probe adds the fan's own sample.
//
// The base law UNCHANGED (the production prompt byte-exact, the
// v3 law riding); the ONLY delta is the fan width k=3. The shipped
// selection obeys the 219 law (the count guard first, the damped
// worst breaking the tie).
//
// Run: npx tsx scripts/probe221-closefan.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { scoreAiKeyframeWithTakes } from "../src/lib/ai/keyframe";

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart221");

async function main() {
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true } } } });
  if (!scene) throw new Error("E7 Sc12 missing");
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 3 }, select: { id: true } });
  if (!shot) throw new Error("S003 missing");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const r = await scoreAiKeyframeWithTakes(shot.id, { takes: 3, samples: 3, outDir: OUT_DIR });

  const receipt: Record<string, unknown> = { probe: "closefan-k3", shot: "E7 Sc12 S003", takes: 3 };
  if (!r.ok) {
    console.log(`PROBE MISS: ${(r as { error: string }).error}`);
    receipt.ok = false;
    receipt.error = (r as { error: string }).error;
  } else {
    const ok = r as Extract<typeof r, { ok: true }>;
    console.log(`S003 k=3 fan: shipped worst ${Math.round(ok.verdict.worst * 100)} (mode ${ok.recipe.mode})`);
    for (const t of ok.takes) {
      console.log(`  take${t.take}: ${t.ok ? `worst ${Math.round((t.worst ?? 0) * 100)} (n=${t.countedFigures ?? "?"})${t.shipped ? " SHIPPED" : ""}` : `MISS - ${t.error?.slice(0, 100)}`}`);
    }
    for (const e of ok.verdict.entries) {
      console.log(`  ${e.characterName}: similarity ${Math.round(e.similarity * 100)} aspects ${JSON.stringify(Object.fromEntries(Object.entries(e.aspects).map(([k, v]) => [k, Math.round((v as number) * 100)])))}`);
    }
    receipt.ok = true;
    receipt.worst = ok.verdict.worst;
    receipt.takesReceipt = ok.takes;
    receipt.entries = ok.verdict.entries;
    receipt.pngPath = ok.recipe.pngPath;
  }
  fs.writeFileSync(path.join(OUT_DIR, "closefan-report.json"), JSON.stringify(receipt, null, 2));
  console.log(`receipt: ${path.join(OUT_DIR, "closefan-report.json")}`);
  await db.$disconnect();
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
