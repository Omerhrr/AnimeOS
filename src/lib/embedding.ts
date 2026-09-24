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
// Comparing a panel against a character's model sheet yields an
// AFFINITY in 0..1 (higher = closer): the mean of the palette cosine
// similarity and the bit agreement of the structure hashes.
//
// This is a TRIPWIRE, not an identity verdict: it knows the artwork
// drifted, not what drifted or why (the vision identity score stays
// the authority). Its value: instant, free, deterministic, and it
// keeps a drift watch alive when the vision provider is down.
// Pure math is exported separately from the sharp IO so the E2E can
// exercise it without decoding images.
// ─────────────────────────────────────────────────────────────

export const STRUCTURE_BITS = 64;

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

/** Bit agreement of two 64-bit hashes, 0..1. Pure. */
export function structureSimilarity(a: bigint, b: bigint): number {
  const ONE = BigInt(1);
  let diff = a ^ b;
  let bits = 0;
  while (diff) {
    bits += Number(diff & ONE);
    diff >>= ONE;
  }
  return 1 - bits / STRUCTURE_BITS;
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

/** Hex form of a structure hash for storage. */
export function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
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
}

interface SharpRaw {
  data: Buffer;
  info: { channels: number; width: number; height: number };
}

/**
 * Embed one image from disk through sharp: downscale to 32x32, take
 * the RGB pixels for the palette histogram and the grayscale grid
 * for the 64-bit dHash.
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
    // dHash grid: average 32x32 pixels down to 9x8 luminance cells
    const gray = new Array<number>(72).fill(0);
    const counts = new Array<number>(72).fill(0);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const i = (y * 32 + x) * 3;
        const lum = 0.299 * raw.data[i] + 0.587 * raw.data[i + 1] + 0.114 * raw.data[i + 2];
        const gx = Math.min(8, Math.floor((x / 32) * 9));
        const gy = Math.min(7, Math.floor((y / 32) * 8));
        const cell = gy * 9 + gx;
        gray[cell] += lum;
        counts[cell] += 1;
      }
    }
    const grayAvg = gray.map((v, i) => (counts[i] > 0 ? v / counts[i] : 0));
    const hash = structureHashFromGray(grayAvg);
    return { palette, hash, hashHex: hashToHex(hash) };
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
