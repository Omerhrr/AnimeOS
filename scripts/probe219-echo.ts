// PROBE 219 - THE MULTI-FIGURE ECHO ON THE TWO-MEMBER CELL.
//
// THE 218 NIGHT NAMED THE FRONTIER WITH ITS OWN RECEIPTS:
//   S006's shipped draw carries the MULTI-FIGURE ECHO - the judge's
//   own words: "left green figure + center green figure + the
//   purple-robed figure on the right" - Lin DUPLICATED, Wei TRUE at
//   88. The dyes did not mix (the contrast clause held); the framing
//   pulled to THREE figures where the shot stages TWO. The
//   presentation pull's residual on the two-member cell.
//
// THE MECHANISM, NAMED: two anchor sheets ride the edit channel and
// each sheet is ITSELF a multi-pose turnaround grid. The 217 framing
// clause says "NO duplicated copies of the same character" - it rode
// the 218 night's S006 and the echo STILL happened: the clause aims
// at the single-character turnaround mode, the two-member cell
// reproduces BOTH sheets' grids at once. The words did not name the
// figure COUNT.
//
// THE ARM: THE FIGURE-COUNT CLAUSE - the two-member cell's own law
// in words. EXACTLY the cast count of human figures, each appearing
// once, every member named with its committed robe; and the
// mechanism stated in the sheet's own terms: the sheets contain
// multiple poses of the same characters - those are VIEWS, not
// extra people to place in the frame.
//
// PAIRED, READ-ONLY: the base prompt IS the production's own
// buildKeyframePrompt (the v2 law, every clause the receipts
// earned), the anchors ARE the production's own collection (both
// sheets at the WIDE rung). Arms:
//   CONTROL x1 - the law unchanged (a fresh draw of the v2 S006
//     cell: the swing's own reading beside the 218 night's 85).
//   COUNT x2 - the named fix, two rides (the arm's own draw swing;
//     one ride is a draw, two is a band).
// Same judge (3 damped reads), same sizes, featured-cast worst,
// ZERO production writes. The judge's NOTE is the primary eye-read
// (does the draw read exactly TWO figures?). Receipts to
// inspect/aiart219/.
//
// Run: npx tsx scripts/probe219-echo.ts
import { db } from "../src/lib/db";
import {
  loadIdentityShot,
  prepareIdentityContext,
  rawIdentityCall,
  parseIdentityVerdict,
  IDENTITY_ASPECTS,
  type IdentityScoreEntry,
  type IdentityVerdict,
} from "../src/lib/identity";
import { buildKeyframePrompt, isCloseRung, type KeyframeSheetDna } from "../src/lib/ai/keyframe";
import { publicImageAsDataUrl } from "../src/lib/continuity-art";
import { framingViewFor, framingViewUrl } from "../src/lib/identity";
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "inspect", "aiart219");
const LEDGER = path.join(process.cwd(), "receipts", "identity-arc.jsonl");

// ── the clause (the graduate's byte-carrier if it lands) ──

/** Arm COUNT: the figure-count law (the multi-figure echo's own
 *  failure mode in words - the 218 night's receipt, the judge's
 *  three-figures reading on a two-figure shot). Member-generic:
 *  rides the multi-member condition (the contrast clause's own),
 *  names the exact count and every member's committed robe, and
 *  states the mechanism in the sheet's own terms - the grid's
 *  poses are VIEWS, not people. */
export function figureCountClause(members: Array<{ name: string; dna: KeyframeSheetDna | null }>): string | null {
  if (members.length < 2) return null;
  const roster = members
    .map((m) => (m.dna?.robeColor ? `${m.name} (${m.dna.robeColor})` : m.name))
    .join(" and ");
  return (
    `FIGURE-COUNT LAW (binding): this frame stages EXACTLY ${members.length} human figures - no more. ` +
    `The ${members.length} figures are ${roster}, each appearing EXACTLY ONCE in the composition. ` +
    `NO third figure, NO duplicate or echo of either character, NO background passerby wearing either robe, ` +
    `NO reflection that shows another copy of a figure. ` +
    `The attached model sheets show multiple poses of the SAME two characters - those are reference VIEWS of one person each, NOT extra people to place in the frame.`
  );
}

// ── the shared machinery (the 218 probe's own shape) ──

function sizeFor(shotType: string | null): string {
  return shotType === "CLOSEUP" ? "1152x864" : "1344x768";
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The arc medians for the cell (the ledger's own rows, all cohorts). */
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
): Promise<{ worst: number; entries: IdentityScoreEntry[]; notes: string[] } | { error: string }> {
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
  const notes = verdicts.map((v) => v.entries.map((e) => e.note).join(" | "));
  return { worst: Math.min(...entries.map((e) => e.similarity)), entries, notes };
}

/** The production's own anchor collection (both sheets at WIDE; the
 *  close-rung view law kept for shape parity). */
function collectAnchors(
  build: Extract<Awaited<ReturnType<typeof buildKeyframePrompt>>, { ok: true }>["build"],
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

interface RideResult {
  ride: string;
  arm: string;
  anchorNote: string;
  ok: boolean;
  error?: string;
  worst?: number;
  arcBaseline?: number | null;
  entries?: IdentityScoreEntry[];
  notes?: string[];
  pngPath?: string;
}

async function ride(args: {
  zai: Awaited<ReturnType<typeof ZAI.create>>;
  shotId: string;
  arm: string;
  extraClause: string | null;
  pngName: string;
}): Promise<RideResult> {
  const { zai, shotId, arm, extraClause, pngName } = args;
  console.log(`\n=== E7Sc12S006 arm=${arm} ===`);
  const built = await buildKeyframePrompt(shotId);
  if (!built.ok) {
    return { ride: pngName, arm, anchorNote: "", ok: false, error: built.error };
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
    return { ride: pngName, arm, anchorNote, ok: false, error: "no pixels" };
  }
  const dataUrl = `data:image/png;base64,${base64}`;
  const pngPath = path.join(OUT_DIR, `${pngName}-keyframe.png`);
  fs.writeFileSync(pngPath, Buffer.from(base64, "base64"));

  const judged = await judgeDamped(shot, dataUrl);
  const base = arcBaseline({ episode: 7, scene: 12, shot: 6 });
  if ("error" in judged) {
    return { ride: pngName, arm, anchorNote, ok: false, error: judged.error, arcBaseline: base, pngPath };
  }
  return {
    ride: pngName, arm, anchorNote,
    ok: true, worst: judged.worst, arcBaseline: base, entries: judged.entries, notes: judged.notes, pngPath,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();

  const eps = await db.episode.findMany({ include: { season: true } });
  const ep = eps.find((e) => e.number === 7 && e.season?.number === 1);
  if (!ep) throw new Error("no ep7");
  const scenes = await db.scene.findMany({ where: { episodeId: ep.id } });
  const sc = scenes.find((s) => s.number === 12);
  if (!sc) throw new Error("no sc12");
  const shots = await db.shot.findMany({ where: { sceneId: sc.id } });
  const s006 = shots.find((s) => s.number === 6);
  if (!s006) throw new Error("missing S006");

  // compose the clause once from the real members' dna
  const built = await buildKeyframePrompt(s006.id);
  if (!built.ok) throw new Error(`prompt build failed: ${built.error}`);
  const countClause = figureCountClause(built.build.members);
  if (!countClause) throw new Error("the count clause did not compose - members shape changed");
  console.log("THE COUNT CLAUSE:\n" + countClause + "\n");
  console.log(`members: ${built.build.members.map((m) => m.name).join(" + ")}`);
  console.log(`arc baseline (all cohorts, median worst): ${arcBaseline({ episode: 7, scene: 12, shot: 6 })}`);

  const results: RideResult[] = [];

  // Ride 1: CONTROL - the production law unchanged (the fresh draw)
  results.push(await ride({ zai, shotId: s006.id, arm: "CONTROL", extraClause: null, pngName: "S006-control" }));
  await new Promise((r) => setTimeout(r, 10_000));

  // Rides 2+3: COUNT x2 - the named fix, two rides (the arm's band)
  results.push(await ride({ zai, shotId: s006.id, arm: "COUNT1", extraClause: countClause, pngName: "S006-count1" }));
  await new Promise((r) => setTimeout(r, 10_000));
  results.push(await ride({ zai, shotId: s006.id, arm: "COUNT2", extraClause: countClause, pngName: "S006-count2" }));

  const report = { probe: "probe219-echo", at: new Date().toISOString(), results };
  fs.writeFileSync(path.join(OUT_DIR, "echo-report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(
      r.ok
        ? `${r.ride} ${r.arm}: worst ${r.worst} (arc baseline ${r.arcBaseline}) anchor ${r.anchorNote}`
        : `${r.ride} ${r.arm}: MISS ${r.error}`,
    );
    if (r.ok) {
      for (const e of r.entries ?? []) {
        const a = Object.entries(e.aspects ?? {}).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}`).join(", ");
        console.log(`    ${e.characterName} ${Math.round(e.similarity * 100)} [${a}]`);
        console.log(`    note: ${e.note}`);
      }
    }
  }
  console.log(`\nreceipts: ${OUT_DIR}`);
  await db.$disconnect();
}

main().catch((e) => { console.error("PROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
