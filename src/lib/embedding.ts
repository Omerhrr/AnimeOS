import sharp from "sharp";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// PROVIDER-FREE IMAGE EMBEDDINGS (the drift tripwire)
//
// A deterministic, local embedding for artwork-level comparison:
//
//   structure  - a 64-bit dHash: the grayscale image is downscaled
//                to 9x8 and each bit records whether a pixel is
//                brighter than its right neighbour. Layout shifts,
//                composition flips and regrades move the bits.
//   palette    - a 4x4x4 RGB histogram (64 floats, L2-normalized)
//                from the same downscaled image. Palette regressions
//                (a re-paint that came back with the wrong grade)
//                move the histogram hard.
//
//   blocks     - the COMPOSITION-ROBUST rung (block-v1): the image
//                is split into a 3x3 grid of regions, each region
//                carrying its own 16-bit dHash (a 5x4 luminance grid)
//                and the image a 2x2 grid of quadrant palette
//                histograms. A reframe or a subject move only moves
//                the blocks the subject crossed - the other regions'
//                local texture gradients survive - so the BLOCK
//                agreement stays high where the global 64-bit hash
//                collapses. The robust affinity blends block-dominant
//                structure (0.3 global + 0.7 block) and quadrant-
//                dominant palette (0.5 + 0.5), and every component
//                is reported so a chip can show what held.
//
// Comparing a panel against a character's model sheet yields an
// AFFINITY in 0..1 (higher = closer).
//
// This is a TRIPWIRE, not an identity verdict: it knows the artwork
// drifted, not what drifted or why (the vision identity score stays
// the authority). Its value: instant, free, deterministic, and it
// keeps a drift watch alive when the vision provider is down.
// Pure math is exported separately from the sharp IO so the E2E can
// exercise it without decoding images.
// ─────────────────────────────────────────────────────────────

export const STRUCTURE_BITS = 64;

// block-v1 geometry: 3x3 structure blocks over the 32x32 decode,
// each block hashed on a 5x4 luminance grid (16 bits per block),
// plus a 2x2 grid of quadrant palette histograms. A block whose
// MEAN NEIGHBOUR DIFFERENCE is below FLAT_BLOCK_SIGNAL carries no
// dHash signal (its bits are resampling noise - a vertical gradient
// has zero horizontal differences) and ABSTAINS from the block vote
// instead of polluting it.
export const BLOCK_GRID = 3;
export const BLOCK_HASH_BITS = 16;
export const BLOCK_GRID_CELLS = 5; // per-block dHash grid width
export const BLOCK_GRID_ROWS = 4; // per-block dHash grid height
export const QUAD_GRID = 2;
export const FLAT_BLOCK_SIGNAL = 1.5; // mean |left-right| luminance levels, 0..255 scale
export const MIN_INFORMATIVE_BLOCKS = 2; // below this the block vote falls back to the global hash

/** L2-normalize a float vector (all-zero stays all-zero). Pure. */
export function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0));
  return norm === 0 ? vec.map(() => 0) : vec.map((v) => v / norm);
}

/**
 * 4x4x4 RGB palette histogram from raw RGB pixels (row-major, 3 per
 * pixel). Each channel is quantized to 4 bins; the result is
 * L2-normalized. Pure.
 */
export function paletteHistogramFromPixels(pixels: Uint8Array | number[]): number[] {
  const hist = new Array<number>(64).fill(0);
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const r = Math.min(3, Math.floor((pixels[i] / 256) * 4));
    const g = Math.min(3, Math.floor((pixels[i + 1] / 256) * 4));
    const b = Math.min(3, Math.floor((pixels[i + 2] / 256) * 4));
    hist[r * 16 + g * 4 + b] += 1;
  }
  const total = pixels.length >= 3 ? Math.floor(pixels.length / 3) : 0;
  if (total === 0) return hist;
  return l2Normalize(hist.map((v) => v / total));
}

/**
 * 64-bit dHash from raw GRAYSCALE pixels laid out row-major in a
 * 9-wide by 8-high grid: bit k (left-to-right, top-to-bottom) is 1
 * when a pixel is brighter than its right neighbour. Pure.
 */
export function structureHashFromGray(gray: Uint8Array | number[], width = 9, height = 8): bigint {
  const ZERO = BigInt(0);
  const ONE = BigInt(1);
  let hash = ZERO;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const left = gray[y * width + x] ?? 0;
      const right = gray[y * width + x + 1] ?? 0;
      if (left > right) hash |= ONE << BigInt(y * (width - 1) + x);
    }
  }
  return hash;
}

/** Cosine similarity of two vectors (0 when either is empty). Pure. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Bit agreement of two hashes of a declared width, 0..1. Pure. */
export function structureSimilarityBits(a: bigint, b: bigint, bits: number): number {
  const ONE = BigInt(1);
  let diff = a ^ b;
  let bitsSet = 0;
  while (diff) {
    bitsSet += Number(diff & ONE);
    diff >>= ONE;
  }
  return bits > 0 ? 1 - bitsSet / bits : 1;
}

/** Bit agreement of two 64-bit hashes, 0..1. Pure. */
export function structureSimilarity(a: bigint, b: bigint): number {
  return structureSimilarityBits(a, b, STRUCTURE_BITS);
}

/**
 * Per-block 16-bit dHashes from a luminance field: the field is cut
 * into a BLOCK_GRID x BLOCK_GRID grid of regions, each region
 * area-averaged down to a BLOCK_GRID_CELLS x BLOCK_GRID_ROWS grid and
 * hashed with the same right-neighbour dHash rule (row-major, block
 * by block). Each block also reports its SIGNAL - the mean absolute
 * difference the hash bits encode - so near-flat regions (vertical
 * gradients, letterbox bars) can abstain from the comparison. Pure.
 */
export function blockHashesFromLuma(
  lum: (x: number, y: number) => number,
  width: number,
  height: number,
): Array<{ hash: bigint; signal: number }> {
  const out: Array<{ hash: bigint; signal: number }> = [];
  const gw = BLOCK_GRID_CELLS;
  const gh = BLOCK_GRID_ROWS;
  for (let by = 0; by < BLOCK_GRID; by += 1) {
    for (let bx = 0; bx < BLOCK_GRID; bx += 1) {
      const x0 = Math.floor((width * bx) / BLOCK_GRID);
      const x1 = Math.floor((width * (bx + 1)) / BLOCK_GRID);
      const y0 = Math.floor((height * by) / BLOCK_GRID);
      const y1 = Math.floor((height * (by + 1)) / BLOCK_GRID);
      // area-average the region down to the block grid
      const gray = new Array<number>(gw * gh).fill(0);
      const counts = new Array<number>(gw * gh).fill(0);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const gx = Math.min(gw - 1, Math.floor(((x - x0) / Math.max(1, x1 - x0)) * gw));
          const gy = Math.min(gh - 1, Math.floor(((y - y0) / Math.max(1, y1 - y0)) * gh));
          gray[gy * gw + gx] += lum(x, y);
          counts[gy * gw + gx] += 1;
        }
      }
      const avg = gray.map((v, i) => (counts[i] > 0 ? v / counts[i] : 0));
      // the dHash signal: how much luminance the bits actually encode
      let signalSum = 0;
      let signalN = 0;
      for (let y = 0; y < gh; y += 1) {
        for (let x = 0; x < gw - 1; x += 1) {
          signalSum += Math.abs(avg[y * gw + x] - avg[y * gw + x + 1]);
          signalN += 1;
        }
      }
      out.push({ hash: structureHashFromGray(avg, gw, gh), signal: signalN > 0 ? signalSum / signalN : 0 });
    }
  }
  return out;
}

/**
 * Per-quadrant 4x4x4 palette histograms from raw RGB pixels laid out
 * row-major (3 per pixel) over a width x height image: QUAD_GRID x
 * QUAD_GRID regions, each histogram L2-normalized on its own. Pure.
 */
export function quadrantPalettesFromPixels(
  pixels: Uint8Array | number[],
  width: number,
  height: number,
): number[][] {
  const quads: number[][] = [];
  for (let qy = 0; qy < QUAD_GRID; qy += 1) {
    for (let qx = 0; qx < QUAD_GRID; qx += 1) {
      const x0 = Math.floor((width * qx) / QUAD_GRID);
      const x1 = Math.floor((width * (qx + 1)) / QUAD_GRID);
      const y0 = Math.floor((height * qy) / QUAD_GRID);
      const y1 = Math.floor((height * (qy + 1)) / QUAD_GRID);
      const slice: number[] = [];
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * width + x) * 3;
          slice.push(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
        }
      }
      quads.push(paletteHistogramFromPixels(slice));
    }
  }
  return quads;
}

/** The affinity readout: palette cosine and structure agreement, averaged. Pure. */
export function affinityBetween(
  paletteA: number[],
  hashA: bigint,
  paletteB: number[],
  hashB: bigint,
): { palette: number; structure: number; combined: number } {
  const structure = structureSimilarity(hashA, hashB);
  const palette = Math.max(0, cosineSimilarity(paletteA, paletteB));
  return { palette, structure, combined: (palette + structure) / 2 };
}

/** Median of a numeric array (mean of the two middles on even length). Pure. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface RobustAffinity {
  palette: number; // global palette cosine (legacy axis, reported)
  structure: number; // global 64-bit dHash agreement (legacy axis, reported)
  blockStructure: number; // mean per-block agreement over INFORMATIVE blocks, 0..1
  blockPalette: number; // mean per-quadrant palette cosine, 0..1
  structureRobust: number; // 0.3 global + 0.7 block
  paletteRobust: number; // 0.5 global + 0.5 quadrant
  combined: number; // mean of the two robust axes
  blocksCompared: number; // how many blocks passed the flat gate (of 9)
}

/**
 * The COMPOSITION-ROBUST affinity: block-dominant structure and
 * quadrant-dominant palette, with the legacy global axes still
 * reported so a chip can show exactly what held and what moved.
 * Blocks whose MEAN NEIGHBOUR DIFFERENCE is below FLAT_BLOCK_SIGNAL
 * in EITHER image abstain; the surviving blocks vote and the vote is
 * pooled by MEDIAN so a subject crossing a block boundary cannot sink
 * it; when fewer than MIN_INFORMATIVE_BLOCKS remain the block vote
 * falls back to the global hash honestly. Pure.
 */
export function robustAffinityBetween(a: ImageEmbedding, b: ImageEmbedding): RobustAffinity {
  const structure = structureSimilarity(a.hash, b.hash);
  const palette = Math.max(0, cosineSimilarity(a.palette, b.palette));
  const n = Math.min(a.blocks.length, b.blocks.length);
  const agreements: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const aFlat = (a.blockSignal[i] ?? 0) < FLAT_BLOCK_SIGNAL;
    const bFlat = (b.blockSignal[i] ?? 0) < FLAT_BLOCK_SIGNAL;
    if (aFlat || bFlat) continue; // a block with no dHash signal does not vote
    agreements.push(structureSimilarityBits(a.blocks[i], b.blocks[i], BLOCK_HASH_BITS));
  }
  const blockStructure = agreements.length >= MIN_INFORMATIVE_BLOCKS
    ? median(agreements)
    : structure; // honest fallback: not enough textured regions to vote
  const qn = Math.min(a.quadrants.length, b.quadrants.length);
  const blockPalette = qn > 0
    ? Math.max(0, a.quadrants.slice(0, qn).reduce((acc, p, i) => acc + cosineSimilarity(p, b.quadrants[i]), 0) / qn)
    : palette;
  const structureRobust = 0.3 * structure + 0.7 * blockStructure;
  const paletteRobust = 0.5 * palette + 0.5 * blockPalette;
  return { palette, structure, blockStructure, blockPalette, structureRobust, paletteRobust, combined: (structureRobust + paletteRobust) / 2, blocksCompared: agreements.length };
}

/** Hex form of a structure hash for storage. */
export function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
}

/** Hex form of a 16-bit block hash for storage (4 chars). */
export function blockHashToHex(hash: bigint): string {
  return hash.toString(16).padStart(4, "0");
}

/** Parse a stored hex hash back to bigint (0 on garbage). */
export function hexToHash(hex: string): bigint {
  const clean = /^"[0-9a-fA-F]+"$/.test(hex) ? hex.slice(1, -1) : hex;
  if (!/^[0-9a-fA-F]{1,16}$/.test(clean)) return BigInt(0);
  return BigInt(`0x${clean}`);
}

export interface ImageEmbedding {
  palette: number[];
  hash: bigint;
  hashHex: string;
  blocks: bigint[]; // BLOCK_GRID^2 per-region 16-bit dHashes
  blockSignal: number[]; // per-block mean |left-right| (the flat gate)
  blockHexes: string[]; // hex of the same, for storage/audit
  quadrants: number[][]; // QUAD_GRID^2 per-region palette histograms
}

interface SharpRaw {
  data: Buffer;
  info: { channels: number; width: number; height: number };
}

/**
 * Embed one image from disk through sharp: downscale to 32x32, take
 * the RGB pixels for the palette histograms (global + quadrants) and
 * the grayscale grid for the 64-bit dHash plus the 3x3 per-block
 * 16-bit dHashes (the composition-robust rung).
 */
export async function embedImageFile(file: string): Promise<ImageEmbedding | null> {
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (stat.size <= 0 || stat.size > 8 * 1024 * 1024) return null;
  try {
    const img = sharp(file).resize(32, 32, { fit: "fill" }).removeAlpha();
    const raw = (await img.raw().toBuffer({ resolveWithObject: true })) as unknown as SharpRaw;
    if (!raw.data || raw.data.length < 32 * 32 * 3) return null;
    const palette = paletteHistogramFromPixels(raw.data);
    const quadrants = quadrantPalettesFromPixels(raw.data, 32, 32);
    // luminance field over the 32x32 decode (shared by both hash rungs)
    const luma = (x: number, y: number): number => {
      const i = (y * 32 + x) * 3;
      return 0.299 * raw.data[i] + 0.587 * raw.data[i + 1] + 0.114 * raw.data[i + 2];
    };
    // dHash grid: average 32x32 pixels down to 9x8 luminance cells
    const gray = new Array<number>(72).fill(0);
    const counts = new Array<number>(72).fill(0);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const gx = Math.min(8, Math.floor((x / 32) * 9));
        const gy = Math.min(7, Math.floor((y / 32) * 8));
        const cell = gy * 9 + gx;
        gray[cell] += luma(x, y);
        counts[cell] += 1;
      }
    }
    const grayAvg = gray.map((v, i) => (counts[i] > 0 ? v / counts[i] : 0));
    const hash = structureHashFromGray(grayAvg);
    const blockData = blockHashesFromLuma(luma, 32, 32);
    return {
      palette,
      hash,
      hashHex: hashToHex(hash),
      blocks: blockData.map((b) => b.hash),
      blockSignal: blockData.map((b) => b.signal),
      blockHexes: blockData.map((b) => blockHashToHex(b.hash)),
      quadrants,
    };
  } catch {
    return null;
  }
}

/** Embed a public-relative image path (the same roots the art pipeline writes). */
export function embedPublicImage(publicPath: string | null | undefined): Promise<ImageEmbedding | null> {
  if (!publicPath) return Promise.resolve(null);
  const clean = publicPath.split("?")[0];
  const file = path.join(process.cwd(), "public", path.normalize(clean).replace(/^([.][.][/\\])+/, ""));
  return embedImageFile(file);
}
