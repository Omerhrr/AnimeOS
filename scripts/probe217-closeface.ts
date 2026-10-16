// PROBE 217c - THE CLOSE-FACE CLAUSE: the closeup's own failure mode
// in words.
//
// THE RECEIPTS (the 217 rides so far, S003's own line):
//   sheet + clause         -> 35 (style 0.1: realistic drift)
//   close view alone       -> 40 (face up 0.5, wardrobe down 0.3)
//   sheet + view + clause  -> 65 (framing PULLED UP to waist-up,
//                               wardrobe TRUE, but the face drifted
//                               3D-real + invented features: green
//                               headband, facial dot, hair down)
// The face is the last seam. THE CLOSE-FACE CLAUSE names it: the face
// is painted cel-animation art on the close view's own proportions -
// no realism, no invented accessories, the reference's own hairstyle.
//
// Run: DATABASE_URL=file:... npx tsx scripts/probe217-closeface.ts
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

const FRAMING_CLAUSE_217 =
  "FRAMING LAW (binding): this is ONE film frame from the animated episode - a SINGLE composition, ONE viewpoint, the shot's own framing, ONE moment of the scene. " +
  "NOT a character model sheet, NOT a turnaround, NO multi-view grid, NO duplicated copies of the same character, NO side-by-side pose studies, NO neutral studio backdrop, no text labels. " +
  "The figure stands IN the scene's own environment, under the scene's own light, caught mid-moment.";

const CLOSE_FACE_CLAUSE_217 =
  "CLOSE-FACE LAW (binding): the face is PAINTED CEL-ANIMATION ART - flat color fields, clean ink lineart, sharp stylized 2D facial features on the close-view reference's own proportions. " +
  "NOT a realistic human face, NOT a 3D render, NO photoreal skin texture, no invented accessories (no headband, no facial markings or paint), and the hairstyle is EXACTLY the reference's own (the tied topknot with its gold crown, no loose hair).";

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

function framingViewUrl(
  c: { designSheetUrl?: string | null; modelSheetUrl?: string | null },
  view: string,
): string | null {
  for (const url of [c.designSheetUrl, c.modelSheetUrl]) {
    if (url && /turn_sheet\.png$/.test(url)) return url.replace(/turn_sheet\.png$/, `turn_${view}.png`);
  }
  return null;
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
  const shotId = "cmvapbg8d001int90hhvyh6ni"; // E7 Sc12 S003, CLOSEUP
  console.log("=== E7Sc12S003 arm=BOTH+CLOSE-FACE ===");
  const built = await buildKeyframePrompt(shotId);
  if (!built.ok) {
    console.log("build failed:", built.error);
    return;
  }
  const { build, shot } = built;
  const tail = "Render the character(s) from the attached model sheet(s) EXACTLY as designed";
  const idx = build.prompt.lastIndexOf(tail);
  const prompt =
    idx >= 0
      ? build.prompt.slice(0, idx) + FRAMING_CLAUSE_217 + " " + CLOSE_FACE_CLAUSE_217 + " " + build.prompt.slice(idx)
      : build.prompt + " " + FRAMING_CLAUSE_217 + " " + CLOSE_FACE_CLAUSE_217;

  const cast = detectCast(
    shot.scene.episode.season.project.characters,
    shot.description,
  ).filter((c) => c.modelSheetUrl);
  const images: Array<{ url: string }> = [];
  const anchorNotes: string[] = [];
  for (const m of build.members) {
    const sheetData = m.sheetUrl ? publicImageAsDataUrl(m.sheetUrl) : null;
    if (sheetData) {
      images.push({ url: sheetData });
      anchorNotes.push(`${m.name}:[sheet]`);
    }
    const charRow = cast.find((c) => c.name === m.name);
    const viewUrl = charRow ? framingViewUrl(charRow, "close") : null;
    const viewData = viewUrl ? publicImageAsDataUrl(viewUrl) : null;
    if (viewData) {
      images.push({ url: viewData });
      anchorNotes.push(`${m.name}:[view:close]`);
    }
  }

  const zai = await ZAI.create();
  const res = (await zai.images.generations.edit({
    prompt,
    images,
    size: "1152x864" as never,
  } as never)) as { data?: Array<{ base64?: string }> };
  const base64 = res.data?.[0]?.base64 ?? null;
  if (!base64) {
    console.log("no pixels");
    return;
  }
  fs.writeFileSync(path.join(OUT_DIR, "E7Sc12S003-CLOSEFACE-keyframe.png"), Buffer.from(base64, "base64"));
  const judged = await judgeDamped(shot, `data:image/png;base64,${base64}`);
  if ("error" in judged) {
    console.log("judge error:", judged.error);
    return;
  }
  console.log(`anchor: ${anchorNotes.join(",")}`);
  for (const e of judged.entries) {
    console.log(`  ${e.characterName}: ${e.similarity} ${JSON.stringify(e.aspects)}`);
    console.log(`    note: ${e.note.slice(0, 300)}`);
  }
  console.log(`WORST ${judged.worst}`);
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
