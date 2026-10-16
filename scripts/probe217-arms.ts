// PROBE 217 - THE PAIRED ARMS ON THE PRESENTATION-PULL SEAM.
//
// THE 216 NIGHT NAMED THE SEAM WITH RECEIPTS FROM BOTH DIRECTIONS:
//   S002 (MEDIUM, scored 92): the anchor rode so hard the generation
//     reproduced the SHEET'S OWN FORMAT - a three-view turnaround
//     (front + front + back) with identity superb and the shot grammar
//     lost (the shot is ONE figure entering a temple).
//   S003 (CLOSEUP, scored 50): the shot demands a close-up on the face,
//     the anchor delivered full-body - the face small in frame, the
//     judge's face 30 / style 20 measure the distance.
//
// THE TWO ARMS, EACH RIDE CHANGES ONLY ITS NAMED FIX:
//   Arm CLAUSE - THE FRAMING CLAUSE (words): ONE film frame, ONE
//     viewpoint, ONE moment - NOT a model sheet, NOT a turnaround,
//     no multi-view grid, no duplicated figures, no studio backdrop.
//   Arm VIEW - THE ANCHOR-VIEW LAW (image): the anchor rides the
//     framing-matched TURNAROUND VIEW (the 121 law's own convention,
//     already the judge side's disk truth): CLOSEUP -> turn_close.png,
//     MEDIUM -> turn_three.png; stitched sheet only as fallback.
//
// The base prompt IS the production's own buildKeyframePrompt - the
// clause rides string-surgery at the exact seam the graduate will
// splice. Same judge (3 damped reads, the SAME instrument), same
// sizes, featured-cast worst, ZERO production writes.
//
// Run: DATABASE_URL=file:... npx tsx scripts/probe217-arms.ts
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
import { detectCast } from "../src/lib/ai/art";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart217");
const LEDGER = path.join(process.cwd(), "receipts", "identity-arc.jsonl");

// THE FRAMING CLAUSE (Arm CLAUSE - the 216 receipts' own words).
const FRAMING_CLAUSE_217 =
  "FRAMING LAW (binding): this is ONE film frame from the animated episode - a SINGLE composition, ONE viewpoint, the shot's own framing, ONE moment of the scene. " +
  "NOT a character model sheet, NOT a turnaround, NO multi-view grid, NO duplicated copies of the same character, NO side-by-side pose studies, NO neutral studio backdrop, no text labels. " +
  "The figure stands IN the scene's own environment, under the scene's own light, caught mid-moment.";

// THE 121 LAW'S VIEW MAP (the judge side's own convention, the same
// letter identity.ts rides - CLOSEUP -> close, MEDIUM -> three).
const VIEW_MAP: Record<string, string> = {
  EXTREME_CLOSEUP: "close",
  CLOSEUP: "close",
  MCU: "close",
  MEDIUM: "three",
  LOW_ANGLE: "front",
  WIDE: "front",
  ESTABLISHING: "front",
  WS: "front",
};

function framingViewFor(shotType: string | null): string {
  return VIEW_MAP[String(shotType ?? "MEDIUM").toUpperCase()] ?? "front";
}

// identity.ts's own framingViewUrl convention (design first, then model).
function framingViewUrl(
  c: { designSheetUrl?: string | null; modelSheetUrl?: string | null },
  view: string,
): string | null {
  for (const url of [c.designSheetUrl, c.modelSheetUrl]) {
    if (url && /turn_sheet\.png$/.test(url)) return url.replace(/turn_sheet\.png$/, `turn_${view}.png`);
  }
  return null;
}

function sizeFor(shotType: string | null): string {
  return shotType === "CLOSEUP" ? "1152x864" : "1344x768";
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The 216-night baseline for the cell (the ledger's own rows). */
function baselineWorst(ref: string): number | null {
  try {
    const rows = fs.readFileSync(LEDGER, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const hits = rows.filter((r) => r.night === "night-216-aikeyframe" && r.ref === ref);
    if (!hits.length) return null;
    return medianOf(hits.map((r) => r.worst));
  } catch {
    return null;
  }
}

interface RideResult {
  cell: string;
  ref: string;
  arm: "CLAUSE" | "VIEW";
  anchorNote: string;
  ok: boolean;
  error?: string;
  worst?: number;
  baseline?: number | null;
  entries?: IdentityScoreEntry[];
  pngPath?: string;
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

  const RIDES: Array<{ cell: string; shotId: string; arm: "CLAUSE" | "VIEW" }> = [
    { cell: "S002", shotId: "cmvapbg8c001gnt90u39jy5dc", arm: "CLAUSE" },
    { cell: "S002", shotId: "cmvapbg8c001gnt90u39jy5dc", arm: "VIEW" },
    { cell: "S003", shotId: "cmvapbg8d001int90hhvyh6ni", arm: "CLAUSE" },
    { cell: "S003", shotId: "cmvapbg8d001int90hhvyh6ni", arm: "VIEW" },
  ];

  const results: RideResult[] = [];
  for (const ride of RIDES) {
    const ref = `E7Sc12${ride.cell}`;
    console.log(`\n=== ${ref} arm=${ride.arm} ===`);
    const built = await buildKeyframePrompt(ride.shotId);
    if (!built.ok) {
      results.push({ cell: ride.cell, ref, arm: ride.arm, anchorNote: "", ok: false, error: built.error });
      continue;
    }
    const { build, shot } = built;

    // ARM CLAUSE: the framing clause rides at the exact seam the
    // graduate will splice (before the render-exactly tail).
    let prompt = build.prompt;
    if (ride.arm === "CLAUSE") {
      const tail = "Render the character(s) from the attached model sheet(s) EXACTLY as designed";
      const idx = prompt.lastIndexOf(tail);
      prompt =
        idx >= 0
          ? prompt.slice(0, idx) + FRAMING_CLAUSE_217 + " " + prompt.slice(idx)
          : prompt + " " + FRAMING_CLAUSE_217;
    }

    // THE ANCHOR IMAGES: the production law's own sheeted cast, then
    // Arm VIEW swaps the base image for the framing-matched view.
    const cast = detectCast(
      shot.scene.episode.season.project.characters,
      shot.description,
    ).filter((c) => c.modelSheetUrl);
    const view = framingViewFor(shot.shotType);
    const images: Array<{ url: string }> = [];
    const anchorNotes: string[] = [];
    for (const m of build.members) {
      if (ride.arm === "VIEW") {
        const charRow = cast.find((c) => c.name === m.name);
        const viewUrl = charRow ? framingViewUrl(charRow, view) : null;
        const viewData = viewUrl ? publicImageAsDataUrl(viewUrl) : null;
        if (viewData) {
          images.push({ url: viewData });
          anchorNotes.push(`${m.name}:[view:${view}]`);
          continue;
        }
        anchorNotes.push(`${m.name}:[view-miss->sheet]`);
      }
      const sheetData = m.sheetUrl ? publicImageAsDataUrl(m.sheetUrl) : null;
      if (sheetData) {
        images.push({ url: sheetData });
        anchorNotes.push(`${m.name}:[sheet]`);
      }
    }

    let base64: string | null = null;
    if (images.length > 0) {
      const res = (await zai.images.generations.edit({
        prompt,
        images,
        size: sizeFor(shot.shotType) as never,
      } as never)) as { data?: Array<{ base64?: string }> };
      base64 = res.data?.[0]?.base64 ?? null;
    } else {
      const res = (await zai.images.generations.create({
        prompt,
        size: sizeFor(shot.shotType) as never,
      })) as { data?: Array<{ base64?: string }> };
      base64 = res.data?.[0]?.base64 ?? null;
    }
    if (!base64) {
      results.push({ cell: ride.cell, ref, arm: ride.arm, anchorNote: anchorNotes.join(","), ok: false, error: "no pixels" });
      continue;
    }
    const dataUrl = `data:image/png;base64,${base64}`;
    const pngPath = path.join(OUT_DIR, `${ref}-${ride.arm}-keyframe.png`);
    fs.writeFileSync(pngPath, Buffer.from(base64, "base64"));

    const judged = await judgeDamped(shot, dataUrl);
    if ("error" in judged) {
      results.push({ cell: ride.cell, ref, arm: ride.arm, anchorNote: anchorNotes.join(","), ok: false, error: judged.error, pngPath });
      continue;
    }
    const baseline = baselineWorst(ref);
    results.push({
      cell: ride.cell, ref, arm: ride.arm, anchorNote: anchorNotes.join(","),
      ok: true, worst: judged.worst, baseline, entries: judged.entries, pngPath,
    });
    console.log(`anchor: ${anchorNotes.join(",")}`);
    for (const e of judged.entries) {
      console.log(`  ${e.characterName}: ${e.similarity} ${(JSON.stringify(e.aspects))}`);
      console.log(`    note: ${e.note.slice(0, 220)}`);
    }
    console.log(`WORST ${judged.worst} (216-night baseline ${baseline})`);
    await new Promise((r) => setTimeout(r, 10_000));
  }

  const report = { probe: "probe217-arms", at: new Date().toISOString(), results };
  fs.writeFileSync(path.join(OUT_DIR, "arm-report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(
      r.ok
        ? `${r.ref} ${r.arm}: worst ${r.worst} (baseline ${r.baseline}) anchor ${r.anchorNote}`
        : `${r.ref} ${r.arm}: MISS ${r.error}`,
    );
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
