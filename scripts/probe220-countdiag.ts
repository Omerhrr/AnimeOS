// PROBE 220b - the count abstention's own diagnostic (pixels-free).
//
// The 219 night's S003: "one count abstained honestly" - on a SOLO
// cell where the truth is 1. The count instrument validated 6/6 in
// the 219 evidence pass; an abstention on a clean solo draw is
// either (a) a transient chat blip the ladder absorbed as a miss or
// (b) an instrument gap the eye should own. The chat channel never
// blocked - this re-read is ridable NOW. The receipt: which take
// abstained, what the raw answer was, does it reproduce.
//
// Run: npx tsx scripts/probe220-countdiag.ts
import fs from "fs";
import path from "path";
import { countFiguresInFrame } from "../src/lib/ai/keyframe";

const FILES = [
  "inspect/aikeyframes/E7Sc12S003-keyframe.png", // 219 take 1 (full-body wide, solo)
  "inspect/aikeyframes/E7Sc12S003-take2-keyframe.png", // 219 take 2 (waist-up, solo)
];

async function main() {
  for (const rel of FILES) {
    const p = path.join(process.cwd(), rel);
    if (!fs.existsSync(p)) {
      console.log(`${rel}: ABSENT`);
      continue;
    }
    const dataUrl = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
    const r = await countFiguresInFrame(dataUrl);
    console.log(`${path.basename(rel)}: ${r.ok ? `count ${r.count}` : `ABSTAIN - ${r.error}`}`);
  }
}

main().catch((e) => { console.error("DIAG FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
