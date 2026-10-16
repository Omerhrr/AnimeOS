// PROBE 219B - THE FIGURE-COUNT PROBE, VALIDATED AGAINST THE EYE'S
// OWN LABELED PIXELS.
//
// THE 219A EVIDENCE PASS NAMED THE SEAM: the multi-figure echo on
// the two-member cell is a DRAW SWING the words did not own (the
// count clause's 92 ride DISOBEYED its own binding - three figures
// where two were staged - and the take law's best-of selection,
// riding identity alone, would have SHIPPED that gallery draw over
// the 85 true frame). The selection instrument is GRAMMAR-BLIND.
//
// THE LEVER CANDIDATE: a figure-count probe - one cheap vision call
// per take, the count answer riding the take law's selection as a
// GUARD (a take whose counted figures != the cast's expected count
// is demoted; identity breaks the tie among honest takes).
//
// THE VALIDATION SET - six draws the EYE has already labeled (this
// iteration's receipts, the eye before the instrument):
//   1. aiart219/S006-count1  -> 3  (the gallery echo, Lin x2 + Wei)
//   2. aikeyframes/E7Sc12S006 (night-218 shipped) -> 3 (the lineup)
//   3. aiart219/S006-count2  -> 2  (pre-clash, twin moons)
//   4. aiart219/S006-control -> 2  (the clash, full grammar)
//   5. night-216-aikeyframe/E7Sc12S006 -> 2 (the fist-clash two-shot)
//   6. aikeyframes/E7Sc12S001 (night-218) -> 1 (the solo mountain)
// The probe rides 2 count calls per draw (the call-variance band),
// the integer parsed from a strict prompt. The instrument earns its
// place ONLY by agreeing with the eye - especially on the two echo
// draws, the cases the guard exists to catch.
//
// Read-only. Receipts to inspect/aiart219/.
//
// Run: npx tsx scripts/probe219-countpass.ts
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart219");

const COUNT_PROMPT =
  "You are a composition checker for an animation production. Count the DISTINCT human figures (people - whole body, partial body, reflection, or silhouette) that appear IN THIS FRAME. " +
  "Do not count statues, paintings, clothing, or weapons on the ground. " +
  "If the same character appears more than once, EACH copy counts as a separate figure. " +
  "Answer with ONLY a single integer digit and nothing else.";

interface Labeled {
  file: string;
  label: number;
  note: string;
}

const LABELED: Labeled[] = [
  { file: "inspect/aiart219/S006-count1-keyframe.png", label: 3, note: "the gallery echo (219A COUNT1, scored 92)" },
  { file: "inspect/aikeyframes/E7Sc12S006-keyframe.png", label: 3, note: "night-218's shipped lineup (scored 85)" },
  { file: "inspect/aiart219/S006-count2-keyframe.png", label: 2, note: "the pre-clash two-shot (219A COUNT2, scored 85)" },
  { file: "inspect/aiart219/S006-control-keyframe.png", label: 2, note: "the full-grammar clash (219A CONTROL, scored 85)" },
  { file: "inspect/aikeyframes/night-216-aikeyframe/E7Sc12S006-keyframe.png", label: 2, note: "night-216's fist-clash two-shot" },
  { file: "inspect/aikeyframes/E7Sc12S001-keyframe.png", label: 1, note: "night-218's solo mountain (scored 90)" },
];

function parseCount(raw: string): number | null {
  const m = raw.match(/\d/);
  return m ? parseInt(m[0], 10) : null;
}

async function countCall(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  dataUrl: string,
): Promise<{ ok: true; count: number; raw: string } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = (await zai.chat.completions.createVision({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: COUNT_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      })) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = res.choices?.[0]?.message?.content ?? "";
      const count = parseCount(raw);
      if (count === null) return { ok: false, error: `unparsable: ${raw.slice(0, 80)}` };
      return { ok: true, count, raw: raw.trim().slice(0, 40) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < 2 && (msg.includes("429") || msg.toLowerCase().includes("too many requests"))) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 20_000 : 45_000));
        continue;
      }
      return { ok: false, error: msg };
    }
  }
  return { ok: false, error: "unreachable" };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();
  const results: Array<{ file: string; label: number; note: string; calls: Array<number | string>; agree: boolean }> = [];

  for (const l of LABELED) {
    const abs = path.join(process.cwd(), l.file);
    if (!fs.existsSync(abs)) {
      console.log(`${path.basename(l.file)}: MISSING on disk (skip)`);
      continue;
    }
    const b64 = fs.readFileSync(abs).toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;
    const calls: Array<number | string> = [];
    for (let i = 0; i < 2; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 5_000));
      const r = await countCall(zai, dataUrl);
      calls.push(r.ok ? r.count : `ERR:${r.error.slice(0, 40)}`);
    }
    const numeric = calls.filter((c): c is number => typeof c === "number");
    const mode = numeric.length ? numeric.sort((a, b) => numeric.filter((x) => x === a).length - numeric.filter((x) => x === b).length).pop()! : null;
    const agree = mode === l.label;
    results.push({ file: l.file, label: l.label, note: l.note, calls, agree });
    console.log(`${path.basename(l.file)}  eye=${l.label}  probe=${calls.join("/")}  ${agree ? "AGREE" : "DISAGREE"}  (${l.note})`);
    await new Promise((r) => setTimeout(r, 5_000));
  }

  const judged = results.length;
  const agreed = results.filter((r) => r.agree).length;
  const echoDraws = results.filter((r) => r.label === 3);
  const echoCaught = echoDraws.filter((r) => r.agree).length;
  const report = { probe: "probe219-countpass", at: new Date().toISOString(), results, judged, agreed, echoDraws: echoDraws.length, echoCaught };
  fs.writeFileSync(path.join(OUT_DIR, "countpass-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n=== VERDICT ===`);
  console.log(`agreement: ${agreed}/${judged} draws`);
  console.log(`the echo draws caught: ${echoCaught}/${echoDraws.length} (the guard's own cases)`);
  console.log(`receipts: ${OUT_DIR}`);
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
