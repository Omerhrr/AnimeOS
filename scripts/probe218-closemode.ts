// PROBE 218b - THE FACE-MEDIUM ARM: the close rung's style law aims
// at the sheet's OWN medium.
//
// THE EYE'S RECEIPT (the 218 probe + the 217 record re-read):
//   • take1/take2 (framing TRUE, big face): the face renders
//     photoreal-cinematic - face 30 / style 10. The CLOSE-FACE
//     clause's words ("PAINTED CEL-ANIMATION ART... NOT a 3D
//     render") rode every draw and lost.
//   • the 217 close-face 90-draw (re-read with the eye): TWO figures
//     (front + side), full-body - identity superb on SMALL faces;
//     the framing was broken (the pull's other face).
//   • THE TARGET: the judge's style aspect compares against the
//     SHEET - and the sheet IS a simple 3D toon (the 211 finding's
//     own words). The close-face words aim at 2D cel; identity's
//     target is the sheet's own simple stylized toon. THE WORDS AIM
//     AT THE WRONG MEDIUM.
//
// TWO VARIANTS, ONE SEAM:
//   Ride M1 - the production law AS IS + the FACE-MEDIUM clause
//     appended (both mediums present: does the added naming win?).
//   Ride M2 - the close-face clause's medium words REPLACED by the
//     face-medium words (one target: the candidate graduate shape).
//
// Same judge (3 damped reads), the production anchors (sheet + close
// view), ZERO production writes. Receipts to inspect/aiart218/.
import { db } from "../src/lib/db";
import {
  loadIdentityShot,
  prepareIdentityContext,
  rawIdentityCall,
  parseIdentityVerdict,
  IDENTITY_ASPECTS,
  type IdentityAspect,
  type IdentityScoreEntry,
  type IdentityVerdict,
} from "../src/lib/identity";
import { buildKeyframePrompt } from "../src/lib/ai/keyframe";
import { publicImageAsDataUrl } from "../src/lib/continuity-art";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart218");

// THE FACE-MEDIUM WORDS: the sheet's own medium as THE target.
const FACE_MEDIUM_CLAUSE =
  "FACE-MEDIUM LAW (binding): the face is rendered in the attached model sheet's OWN simple stylized toon style - the same simple flat-shaded, clean-lined rendering as the sheet reference, at the sheet's own level of detail. " +
  "NOT a cinematic realistic face, NOT a photoreal human, NOT a high-detail illustration or game-cinematic 3D render - the sheet's simplicity IS the character design.";

// the graduated close-face clause's medium words (the M2 surgery's target)
const GRADUATED_MEDIUM_WORDS =
  "the face is PAINTED CEL-ANIMATION ART - flat color fields, clean ink lineart, sharp stylized 2D facial features on the close-view reference's own proportions. " +
  "NOT a realistic human face, NOT a 3D render, NO photoreal skin texture,";
const M2_REPLACEMENT_WORDS =
  "the face is rendered in the model sheet's OWN simple stylized toon style - the same simple flat-shaded, clean-lined rendering as the sheet reference, at the sheet's own level of detail. " +
  "NOT a cinematic realistic face, NOT a photoreal human, NO high-detail game-cinematic 3D render,";

function sizeFor(shotType: string | null): string {
  return shotType === "CLOSEUP" ? "1152x864" : "1344x768";
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function judgeDamped(
  shot: NonNullable<Awaited<ReturnType<typeof loadIdentityShot>>>,
  dataUrl: string,
  samples = 3,
): Promise<{ worst: number; entries: IdentityScoreEntry[] } | { error: string }> {
  const ctx = await prepareIdentityContext(shot, { imageData: dataUrl, error: "" });
  if (!ctx.ok) return { error: ctx.error };
  const names = ctx.sheets.map((s) => s.name);
  const verdicts: IdentityVerdict[] = [];
  let lastError = "";
  for (let i = 0; i < samples; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 5_000));
    const call = await rawIdentityCall(ctx, undefined);
    if (!call.ok) { lastError = call.error; continue; }
    const v = parseIdentityVerdict(call.raw, names);
    if (v) verdicts.push(v);
    else lastError = "unparsable verdict";
  }
  if (!verdicts.length) return { error: lastError || "no verdict" };
  const entries: IdentityScoreEntry[] = names.map((name) => {
    const rows = verdicts
      .map((v) => v.entries.find((e) => e.characterName === name))
      .filter((e): e is IdentityScoreEntry => !!e);
    if (!rows.length) return { characterName: name, similarity: 0, aspects: {}, note: "not detected" };
    const sim = medianOf(rows.map((r) => r.similarity));
    const aspects: Partial<Record<IdentityAspect, number>> = {};
    for (const aspect of IDENTITY_ASPECTS) {
      const vals = rows.map((r) => r.aspects[aspect]).filter((v): v is number => v !== undefined);
      if (vals.length) aspects[aspect] = medianOf(vals);
    }
    const noteRow = [...rows].sort((a, b) => Math.abs(a.similarity - sim) - Math.abs(b.similarity - sim))[0];
    return { characterName: name, similarity: sim, aspects, note: noteRow.note };
  });
  return { worst: Math.min(...entries.map((e) => e.similarity)), entries };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();
  const shotId = "cmvapbg8d001int90hhvyh6ni"; // E7 Sc12 S003, CLOSEUP
  const built = await buildKeyframePrompt(shotId);
  if (!built.ok) throw new Error(built.error);
  const { build, shot } = built;

  // the production anchors: sheet + close view (the 217 law)
  const images: Array<{ url: string }> = [];
  for (const m of build.members) {
    if (!m.sheetUrl) continue;
    const sheetData = publicImageAsDataUrl(m.sheetUrl);
    if (!sheetData) continue;
    images.push({ url: sheetData });
    const viewUrl = m.designSheetUrl ? m.designSheetUrl.replace(/turn_sheet\.png$/, "turn_close.png") : null;
    const viewData = viewUrl ? publicImageAsDataUrl(viewUrl) : null;
    if (viewData) images.push({ url: viewData });
  }
  console.log(`anchors: ${images.length} image(s)`);

  const closeFaceIdx = build.prompt.indexOf("CLOSE-FACE LAW");
  if (closeFaceIdx < 0) throw new Error("the graduated close-face clause not found in the production prompt");

  const RIDES: Array<{ name: string; prompt: string }> = [
    // M1: both mediums present (the clause appended before the tail)
    {
      name: "S003-medium-M1",
      prompt: (() => {
        const tail = "Render the character(s) from the attached model sheet(s) EXACTLY as designed";
        const idx = build.prompt.lastIndexOf(tail);
        return idx >= 0
          ? build.prompt.slice(0, idx) + FACE_MEDIUM_CLAUSE + " " + build.prompt.slice(idx)
          : build.prompt + " " + FACE_MEDIUM_CLAUSE;
      })(),
    },
    // M2: ONE target (the graduated medium words replaced)
    {
      name: "S003-medium-M2",
      prompt: build.prompt.replace(GRADUATED_MEDIUM_WORDS, M2_REPLACEMENT_WORDS),
    },
  ];

  const results: Array<{ name: string; ok: boolean; worst?: number; error?: string; entries?: IdentityScoreEntry[]; pngPath: string }> = [];
  for (const r of RIDES) {
    console.log(`\n=== ${r.name} ===`);
    const res = (await zai.images.generations.edit({
      prompt: r.prompt,
      images,
      size: sizeFor(shot.shotType) as never,
    } as never)) as { data?: Array<{ base64?: string }> };
    const base64 = res.data?.[0]?.base64 ?? null;
    if (!base64) {
      results.push({ name: r.name, ok: false, error: "no pixels", pngPath: "" });
      continue;
    }
    const dataUrl = `data:image/png;base64,${base64}`;
    const pngPath = path.join(OUT_DIR, `${r.name}-keyframe.png`);
    fs.writeFileSync(pngPath, Buffer.from(base64, "base64"));
    const judged = await judgeDamped(shot, dataUrl);
    if ("error" in judged) {
      results.push({ name: r.name, ok: false, error: judged.error, pngPath });
      continue;
    }
    results.push({ name: r.name, ok: true, worst: judged.worst, entries: judged.entries, pngPath });
    for (const e of judged.entries) {
      console.log(`  ${e.characterName}: ${(e.similarity * 100).toFixed(0)} ${JSON.stringify(e.aspects)}`);
      console.log(`    note: ${e.note.slice(0, 240)}`);
    }
    console.log(`WORST ${judged.worst}`);
    await new Promise((rr) => setTimeout(rr, 10_000));
  }

  const report = { probe: "probe218-closemode", at: new Date().toISOString(), results };
  fs.writeFileSync(path.join(OUT_DIR, "closemode-report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(r.ok ? `${r.name}: worst ${r.worst}` : `${r.name}: MISS ${r.error}`);
  }
  await db.$disconnect();
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error("PROBE FATAL", e);
    process.exit(1);
  }
})();
