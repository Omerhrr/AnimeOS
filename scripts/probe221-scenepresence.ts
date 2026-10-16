// PROBE 221b - THE SCENE-PRESENCE INSTRUMENT (the 219 countpass's
// twin, validated against THE EYE'S OWN LABELED PIXELS).
//
// The 221 night's S003 shipped a 95 that the eye read as a STUDIO
// VOID: a figurine bust on a gray backdrop - identity-true,
// grammar-EMPTY, no temple, no storm, no rain, no place. The judge's
// instrument priced it the close cell's all-time high because
// identity cannot see PLACE (the 219 guard fixed figure-count
// blindness; scene-presence blindness stayed open). THE EYE'S
// LABELED SET (eight frames, inspect/aiart221/label-*): one void
// (0 anchors) and seven scene-true frames (structure + sky +
// weather). THE INSTRUMENT: one cheap vision call on the drawn frame
// ALONE, one integer 0-3 (architecture / sky / weather present).
// THE VALIDATION: 8/8 agreement = the instrument earns the law; any
// miss = the honest record and the graduation waits.
//
// Run: npx tsx scripts/probe221-scenepresence.ts
import fs from "fs";
import path from "path";
import { countSceneAnchors } from "../src/lib/ai/keyframe";

const DIR = path.join(process.cwd(), "inspect", "aiart221");
// the eye's labels: [file, expectedAnchors] - the void the eye named,
// the seven scene-true frames (the fan draws, the wide, the S006,
// the 216/217 receipts)
const LABELED: Array<[string, number]> = [
  ["label-void-bust-95.png", 0],
  ["label-scene-wide-60.png", 3],
  ["label-scene-s006-88.png", 3],
  ["label-scene-216-50.png", 3],
  ["label-scene-217-60.png", 3],
  ["label-scene-fan1-40.png", 3],
  ["label-scene-fan2-swap-60.png", 3],
  ["label-scene-fan3-40.png", 3],
];

async function main() {
  let agree = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const [file, expected] of LABELED) {
    const p = path.join(DIR, file);
    if (!fs.existsSync(p)) {
      console.log(`${file}: ABSENT (the set is broken)`);
      rows.push({ file, expected, ok: false, error: "absent" });
      continue;
    }
    const dataUrl = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
    const r = await countSceneAnchors(dataUrl);
    if (!r.ok) {
      console.log(`${file}: INSTRUMENT MISS - ${r.error.slice(0, 90)}`);
      rows.push({ file, expected, ok: false, error: r.error });
      continue;
    }
    const hit = r.count === expected || (expected > 0 && r.count > 0);
    // the law's own threshold is BINARY (0 = void, >=1 = scene): the
    // per-frame agreement counts an exact hit as hit AND a scene
    // frame read at any positive anchor count as hit (the demotion
    // rule never fires on it); the exact number is still recorded.
    if (hit) agree++;
    console.log(`${file}: expected ${expected}, instrument ${r.count} - ${hit ? "AGREE" : "MISS"}`);
    rows.push({ file, expected, count: r.count, hit });
  }
  const report = { probe: "scenepresence-validation", labeled: rows.length, agree, misses: rows.length - agree, rows };
  fs.writeFileSync(path.join(DIR, "scenepresence-report.json"), JSON.stringify(report, null, 2));
  console.log(`\nVALIDATION: ${agree}/${rows.length} agreement with the eye's labels`);
  console.log(`receipt: ${path.join(DIR, "scenepresence-report.json")}`);
  await import("../src/lib/db").then((m) => m.db.$disconnect());
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
