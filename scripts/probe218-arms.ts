// PROBE 218 - THE PAIRED ARMS ON THE SWING, THE ARTIFACTS, AND THE
// SHADOW BUCKET.
//
// THE 217 NIGHT NAMED THE FRONTIER WITH ITS OWN RECEIPTS:
//   • THE CLOSE CELL'S SWING - S003's band across draws of the SAME
//     craft: 50 (night-216) / 60 (night-217) / 35-90 (the 217 arms).
//     The judge-variance damping answers reads of ONE image; the
//     DRAW variance (different pixels, same law) has no answer yet.
//   • THE ARTIFACTS - S003's draw carried a glow artifact on the
//     sheathed blade + twin moons + a sparkle vortex; S001's carried
//     twin moons + sparkles. Named by the eye, on the true pixels.
//   • THE SHADOW BUCKET - S002's draw swapped Lin's dye under the
//     dim-light words ("Backlight + interior shadows"): indigo robe,
//     green surviving as lining, palette 20 honest. The dim light
//     RECOLORED what the dye law bound.
//
// THREE ARMS, EACH RIDE CHANGES ONLY ITS NAMED FIX:
//   Arm SHADOW-DYE (S002): the dim light shades the garments, it
//     never recolors them - the committed hexes restated UNDER the
//     lighting words, the failure mode named (no indigo/violet
//     moonlit variant).
//   Arm ARTIFACT (S003): the scene-prop law - no second moon, no
//     sparkle vortex, no invented glow; the weapon law owns emission.
//   Arm TAKE x2 (S003, the production prompt UNCHANGED, two
//     independent takes): measures the draw swing directly and what
//     best-of-2 would ship - the take law's own evidence.
//
// The base prompt IS the production's own buildKeyframePrompt (the
// 217 graduate's full law: framing clause + close-face clause), the
// anchors ARE the production's own collection (sheets + the close
// view at the close rung). Same judge (3 damped reads), same sizes,
// featured-cast worst, ZERO production writes. Receipts to
// inspect/aiart218/.
//
// Run: npx tsx scripts/probe218-arms.ts
import { db } from "../src/lib/db";
import {
  loadIdentityShot,
  prepareIdentityContext,
  rawIdentityCall,
  parseIdentityVerdict,
  IDENTITY_ASPECTS,
  framingViewFor,
  framingViewUrl,
  type IdentityAspect,
  type IdentityScoreEntry,
  type IdentityVerdict,
} from "../src/lib/identity";
import { buildKeyframePrompt, isCloseRung, type KeyframeSheetDna } from "../src/lib/ai/keyframe";
import { publicImageAsDataUrl } from "../src/lib/continuity-art";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart218");
const LEDGER = path.join(process.cwd(), "receipts", "identity-arc.jsonl");

// ── the two clauses (the graduate's byte-carriers if they land) ──

/** Arm SHADOW-DYE: the dim-light words re-hue what the dye law
 *  bound (S002's receipt). Composed per member from the committed
 *  sheetDna hexes - the dye law's own numbers, restated UNDER the
 *  lighting's failure mode. */
function shadowDyeClause(members: Array<{ name: string; dna: KeyframeSheetDna | null }>): string | null {
  const named = members
    .map((m) => (m.dna?.robeColor ? `${m.name}'s robe stays exactly ${m.dna.robeColor}` : null))
    .filter(Boolean) as string[];
  if (named.length === 0) return null;
  return (
    "SHADOW-DYE LAW (binding): this scene's light is dim - dim light SHADES the garments, it never RECOLORS them. " +
    named.join(", ") +
    " under this lighting, the shadows and backlight falling OVER the fabric. " +
    "NOT an indigo, blue, or violet-shifted 'moonlit' variant; no hue swap, no color grade that replaces the committed dye."
  );
}

/** Arm ARTIFACT: the scene-prop law (the eye's named artifacts:
 *  twin moons, sparkle vortex, the sheathed blade's glow). */
const ARTIFACT_CLAUSE =
  "SCENE ARTIFACT LAW (binding): render ONLY the scene's own props and named light sources - NO second moon or duplicated celestial body, NO floating sparkle particles or swirling light-particle vortex, NO lens-flare clusters, NO invented glowing runes or energy effects the scene does not name. " +
  "A blade the shot's own language does not draw stays dark steel.";

// ── the shared machinery (the 217 probe's own shape) ──

function sizeFor(shotType: string | null): string {
  return shotType === "CLOSEUP" ? "1152x864" : "1344x768";
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The two arc nights' medians for the cell (the ledger's own rows). */
function arcBaseline(ref: { episode: number; scene: number; shot: number }): number | null {
  try {
    const rows = fs.readFileSync(LEDGER, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const hits = rows.filter(
      (r) => r.source === "AI_KEYFRAME" && r.ref.episode === ref.episode && r.ref.scene === ref.scene && r.ref.shot === ref.shot,
    );
    if (!hits.length) return null;
    return medianOf(hits.map((r) => r.worst));
  } catch {
    return null;
  }
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

/** The production's own anchor collection (generateKeyframeForShot's
 *  law: one sheet per member; at the CLOSE rung the framing view
 *  rides as a second image - the 217 anchor-view law). */
function collectAnchors(
  build: Build,
  shotType: string | null,
): { images: Array<{ url: string }>; notes: string[] } {
  const images: Array<{ url: string }> = [];
  const notes: string[] = [];
  const closeRung = isCloseRung(shotType);
  const viewName = framingViewFor(shotType);
  for (const m of build.members) {
    if (!m.sheetUrl) continue;
    const sheetData = publicImageAsDataUrl(m.sheetUrl);
    if (!sheetData) continue;
    images.push({ url: sheetData });
    notes.push(`${m.name}:[sheet]`);
    if (closeRung) {
      const viewUrl = framingViewUrl({ designSheetUrl: m.designSheetUrl, modelSheetUrl: m.sheetUrl }, viewName);
      const viewData = viewUrl ? publicImageAsDataUrl(viewUrl) : null;
      if (viewData) {
        images.push({ url: viewData });
        notes.push(`${m.name}:[view:${viewName}]`);
      }
    }
  }
  return { images, notes };
}

type Build = Extract<Awaited<ReturnType<typeof buildKeyframePrompt>>, { ok: true }>["build"];

interface RideResult {
  ride: string;
  cell: string;
  ref: string;
  arm: string;
  anchorNote: string;
  ok: boolean;
  error?: string;
  worst?: number;
  arcBaseline?: number | null;
  entries?: IdentityScoreEntry[];
  pngPath?: string;
}

async function ride(args: {
  zai: Awaited<ReturnType<typeof ZAI.create>>;
  cell: string;
  shotId: string;
  arm: string;
  extraClause: string | null;
  pngName: string;
}): Promise<RideResult> {
  const { zai, cell, shotId, arm, extraClause, pngName } = args;
  const ref = `E7Sc12${cell}`;
  console.log(`\n=== ${ref} arm=${arm} ===`);
  const built = await buildKeyframePrompt(shotId);
  if (!built.ok) {
    return { ride: pngName, cell, ref, arm, anchorNote: "", ok: false, error: built.error };
  }
  const { build, shot } = built;

  // THE SEAM: the clause rides where the graduate will splice it -
  // before the render-exactly tail.
  let prompt = build.prompt;
  if (extraClause) {
    const tail = "Render the character(s) from the attached model sheet(s) EXACTLY as designed";
    const idx = prompt.lastIndexOf(tail);
    prompt = idx >= 0 ? prompt.slice(0, idx) + extraClause + " " + prompt.slice(idx) : prompt + " " + extraClause;
  }

  const { images, notes } = collectAnchors(build, shot.shotType);
  const anchorNote = notes.join(",") || "unanchored";

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
    return { ride: pngName, cell, ref, arm, anchorNote, ok: false, error: "no pixels" };
  }
  const dataUrl = `data:image/png;base64,${base64}`;
  const pngPath = path.join(OUT_DIR, `${pngName}-keyframe.png`);
  fs.writeFileSync(pngPath, Buffer.from(base64, "base64"));

  const judged = await judgeDamped(shot, dataUrl);
  const base = arcBaseline({ episode: 7, scene: 12, shot: cell === "S002" ? 2 : 3 });
  if ("error" in judged) {
    return { ride: pngName, cell, ref, arm, anchorNote, ok: false, error: judged.error, arcBaseline: base, pngPath };
  }
  return {
    ride: pngName, cell, ref, arm, anchorNote,
    ok: true, worst: judged.worst, arcBaseline: base, entries: judged.entries, pngPath,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();

  // the real shot ids by the work's number chain
  const eps = await db.episode.findMany({ include: { season: true } });
  const ep = eps.find((e) => e.number === 7 && e.season?.number === 1);
  if (!ep) throw new Error("no ep7");
  const scenes = await db.scene.findMany({ where: { episodeId: ep.id } });
  const sc = scenes.find((s) => s.number === 12);
  if (!sc) throw new Error("no sc12");
  const shots = await db.shot.findMany({ where: { sceneId: sc.id } });
  const s002 = shots.find((s) => s.number === 2);
  const s003 = shots.find((s) => s.number === 3);
  if (!s002 || !s003) throw new Error("missing S002/S003");

  const results: RideResult[] = [];

  // the two clause arms need the members' dna -> build once, compose,
  // then ride with the composed clause (each ride a FRESH generation)
  const builtS002 = await buildKeyframePrompt(s002.id);
  const builtS003 = await buildKeyframePrompt(s003.id);
  if (!builtS002.ok || !builtS003.ok) throw new Error("prompt build failed");
  const shadowClause = shadowDyeClause(builtS002.build.members);

  // Ride 1: S002 + SHADOW-DYE
  results.push(await ride({ zai, cell: "S002", shotId: s002.id, arm: "SHADOW-DYE", extraClause: shadowClause, pngName: "S002-shadowdye" }));
  await new Promise((r) => setTimeout(r, 10_000));

  // Ride 2: S003 + ARTIFACT
  results.push(await ride({ zai, cell: "S003", shotId: s003.id, arm: "ARTIFACT", extraClause: ARTIFACT_CLAUSE, pngName: "S003-artifact" }));
  await new Promise((r) => setTimeout(r, 10_000));

  // Rides 3+4: S003 take x2 - the production prompt UNCHANGED, the
  // draw swing measured directly (the take law's own evidence)
  results.push(await ride({ zai, cell: "S003", shotId: s003.id, arm: "TAKE1", extraClause: null, pngName: "S003-take1" }));
  await new Promise((r) => setTimeout(r, 10_000));
  results.push(await ride({ zai, cell: "S003", shotId: s003.id, arm: "TAKE2", extraClause: null, pngName: "S003-take2" }));

  const report = { probe: "probe218-arms", at: new Date().toISOString(), results };
  fs.writeFileSync(path.join(OUT_DIR, "arm-report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(
      r.ok
        ? `${r.ref} ${r.arm}: worst ${r.worst} (arc baseline ${r.arcBaseline}) anchor ${r.anchorNote}`
        : `${r.ref} ${r.arm}: MISS ${r.error}`,
    );
    if (r.ok && r.entries) {
      for (const e of r.entries) {
        console.log(`  ${e.characterName}: ${(e.similarity * 100).toFixed(0)} ${JSON.stringify(e.aspects)}`);
        console.log(`    note: ${e.note.slice(0, 220)}`);
      }
    }
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
