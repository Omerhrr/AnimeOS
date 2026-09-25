// Unit check for the block-robust affinity + the re-anchor baseline:
//  1. synthesizes a "sheet" and a matching "panel", plus a REFRAMED
//     panel (same subject, padded canvas + shifted composition), and
//     proves the block rung holds where the global 64-bit dHash drops;
//  2. drives identityDriftFromRows with a declining curve + a
//     re-anchor marker and verifies the trend baseline restarts.
// Run: bun scripts/check-block-affinity.ts
import sharp from "sharp";
import {
  embedImageFile,
  robustAffinityBetween,
  affinityBetween,
  BLOCK_GRID,
} from "../src/lib/embedding";
import { identityDriftFromRows } from "../src/lib/identity";
import fs from "fs";
import path from "path";

const tmp = path.join(process.cwd(), ".block-affinity-check");
fs.mkdirSync(tmp, { recursive: true });

interface Rect { x: number; y: number; w: number; h: number; rgb: [number, number, number] }

// deterministic synthetic "artwork": gradient sky + a robed figure block + a blade streak
function svgArt(width: number, height: number, figure: Rect, shiftX = 0, grade: "cool" | "crimson" = "cool"): string {
  const fig = { ...figure, x: figure.x + shiftX };
  const skyTop = grade === "cool" ? "#0b1026" : "#260b12";
  const skyBottom = grade === "cool" ? "#2a3550" : "#502a35";
  const moon = grade === "cool" ? "#dfe8ff" : "#ffd9d0";
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBottom}"/>
  </linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#sky)"/>
  <circle cx="${Math.round(width * 0.78)}" cy="${Math.round(height * 0.2)}" r="${Math.round(height * 0.09)}" fill="${moon}" opacity="0.9"/>
  <rect x="${fig.x}" y="${fig.y}" width="${fig.w}" height="${fig.h}" fill="rgb(${fig.rgb.join(",")})"/>
  <rect x="${fig.x + Math.round(fig.w * 0.35)}" y="${fig.y}" width="${Math.round(fig.w * 0.3)}" height="${Math.round(fig.h * 0.16)}" fill="#e8d8b0"/>
  <rect x="${fig.x + fig.w - 6}" y="${fig.y - 40}" width="6" height="46" fill="#7fe3ff"/>
  <rect x="0" y="${height - 30}" width="${width}" height="30" fill="#141a2e"/>
</svg>`;
}

async function writeArt(name: string, width: number, height: number, figure: Rect, shiftX = 0, grade: "cool" | "crimson" = "cool"): Promise<string> {
  const file = path.join(tmp, `${name}.png`);
  await sharp(Buffer.from(svgArt(width, height, figure, shiftX, grade))).png().toFile(file);
  return file;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

let failures = 0;
function expect(label: string, cond: boolean, detail: string) {
  if (!cond) failures += 1;
  console.log(`${cond ? "OK  " : "FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
}

async function main() {
  console.log("== block-robust affinity: reframe invariance ==");
  const W = 512;
  const H = 384;
  const fig: Rect = { x: 120, y: 120, w: 70, h: 190, rgb: [40, 96, 84] };
  const sheetFile = await writeArt("sheet", W, H, fig);           // the canonical look
  const panelFile = await writeArt("panel", W, H, fig, 14);       // near-identical composition
  // REFRAMED: the camera window moves over the SAME artwork (a crop
  // shift - the subject and moon land at slightly different canvas
  // positions, no new content is added)
  const reframeFile = path.join(tmp, "reframed.png");
  await sharp(Buffer.from(svgArt(W, H, fig, 14)))
    .extract({ left: 30, top: 20, width: W - 60, height: H - 40 })
    .png()
    .toFile(reframeFile);

  const sheet = await embedImageFile(sheetFile);
  const panel = await embedImageFile(panelFile);
  const reframed = await embedImageFile(reframeFile);
  // a REAL drift: a wrong-grade re-paint - the whole wash shifted crimson
  const driftedFile = await writeArt("drifted", W, H, fig, 14, "crimson");
  const driftedEmbed = await embedImageFile(driftedFile);
  if (!sheet || !panel || !reframed || !driftedEmbed) {
    console.log("FAIL embedding synthetic art failed");
    process.exit(1);
  }
  const driftedAff = robustAffinityBetween(driftedEmbed, sheet);
  expect("embedding carries block hashes", sheet.blocks.length === BLOCK_GRID * BLOCK_GRID, `${sheet.blocks.length} blocks, hexes ${sheet.blockHexes.slice(0, 3).join(",")}...`);
  expect("embedding carries quadrant palettes", sheet.quadrants.length === 4);

  const near = robustAffinityBetween(panel, sheet);
  const reframe = robustAffinityBetween(reframed, sheet);
  // the legacy readout for the same comparison (global-only)
  const legacyReframe = affinityBetween(reframed.palette, reframed.hash, sheet.palette, sheet.hash);

  console.log(`near-identical panel vs sheet: combined ${pct(near.combined)} (block structure ${pct(near.blockStructure)}, global ${pct(near.structure)}, palette ${pct(near.palette)}, ${near.blocksCompared} informative block(s))`);
  console.log(`reframed panel vs sheet:       combined ${pct(reframe.combined)} (block structure ${pct(reframe.blockStructure)}, global ${pct(reframe.structure)}, palette ${pct(reframe.palette)}, ${reframe.blocksCompared} informative block(s))`);
  console.log(`legacy global-only affinity for the reframed panel: combined ${pct(legacyReframe.combined)} (structure ${pct(legacyReframe.structure)})`);

  expect("near-identical composition scores high", near.combined > 0.75, `combined ${pct(near.combined)}`);
  expect("block structure survives the reframe", reframe.blockStructure > 0.7, `block ${pct(reframe.blockStructure)} vs global ${pct(reframe.structure)}`);
  expect("block rung beats the global hash on the reframe", reframe.blockStructure - reframe.structure > 0.05, `block advantage ${(100 * (reframe.blockStructure - reframe.structure)).toFixed(0)} points`);
  expect("robust combined reads higher than global structure on the reframe", reframe.combined > reframe.structure, `combined ${pct(reframe.combined)} > global structure ${pct(reframe.structure)}`);
  console.log(`drifted panel (crimson re-grade) vs sheet: combined ${pct(driftedAff.combined)} (palette ${pct(driftedAff.palette)}, block palette ${pct(driftedAff.blockPalette)})`);
  expect("a real grade drift scores clearly lower than the faithful panel", driftedAff.combined < near.combined - 0.1, `drift ${pct(driftedAff.combined)} << faithful ${pct(near.combined)}`);

  console.log("\n== re-anchor: drift baseline restart ==");
  const base = { scores: "", episode: 0, scene: 0, shot: 0, scoredAt: "" };
  const rows = [0.82, 0.78, 0.72, 0.64, 0.58, 0.55].map((score, i) => ({
    ...base,
    scores: JSON.stringify([{ characterName: "Lin Yue", similarity: score, aspects: {}, note: "" }]),
    episode: 1,
    scene: 1,
    shot: i + 1,
    scoredAt: new Date(Date.UTC(2026, 0, 1, 12, i)).toISOString(),
  }));
  const before = identityDriftFromRows(rows);
  const decline = before.find((c) => c.characterName === "Lin Yue");
  expect("curve reads DECLINING without a re-anchor", decline?.trend === "DECLINING", `delta ${(100 * (decline?.delta ?? 0)).toFixed(0)}%`);
  expect("no re-anchor marker before one lands", decline?.reanchoredAt === null);

  // re-anchor lands after shot 3: later points climb against the new sheet
  const reanchorAt = new Date(Date.UTC(2026, 0, 1, 12, 3)).toISOString();
  const rowsAfter = [...rows.slice(0, 4), 0.61, 0.7, 0.78].map((scoreOrRow, i) =>
    typeof scoreOrRow === "number"
      ? {
          ...base,
          scores: JSON.stringify([{ characterName: "Lin Yue", similarity: scoreOrRow, aspects: {}, note: "" }]),
          episode: 1, scene: 1, shot: i + 1,
          scoredAt: new Date(Date.UTC(2026, 0, 1, 12, i)).toISOString(),
        }
      : scoreOrRow,
  );
  const after = identityDriftFromRows(rowsAfter, { "Lin Yue": reanchorAt });
  const restarted = after.find((c) => c.characterName === "Lin Yue");
  expect("re-anchor marker lands on the curve", restarted?.reanchoredAt === reanchorAt);
  expect("baseline restarts after the re-anchor", restarted?.trend === "IMPROVING", `delta ${(100 * (restarted?.delta ?? 0)).toFixed(0)}% on ${restarted?.baseline} baseline point(s) of ${restarted?.panels} total`);
  expect("early points survive as history", restarted?.panels === 7);
  expect("old decline no longer drags the trend", (restarted?.delta ?? 0) > 0);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
