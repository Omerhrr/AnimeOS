// ─────────────────────────────────────────────────────────────
// WAV PLAYBACK-RATE DSP (state pitch hints)
//
// The TTS engine's `speed` parameter is pitch-preserving, so a state
// pitch hint (<1 deeper, >1 higher) is realized in two steps:
//   1. render the take at ttsSpeed = targetSpeed / pitch
//   2. shift the WAV playback rate by `pitch` (y[n] = x[n * pitch])
// The shift multiplies pitch by the factor and divides duration by the
// same factor, so the compensated render lands back on the requested
// pace with the pitch bend applied.
// Unsupported formats pass through untouched (a take without the bend
// beats a corrupted one), and everything here is pure buffer math so
// it can be unit-checked without a TTS round trip.
// ─────────────────────────────────────────────────────────────

const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2;

interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  audioFormat: number;
  dataOffset: number;
  dataSize: number;
}

function parseWav(buf: Buffer): WavInfo | null {
  try {
    if (buf.length < 44) return null;
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
    let fmt: Omit<WavInfo, "dataOffset" | "dataSize"> | null = null;
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === "fmt " && size >= 16) {
        fmt = {
          audioFormat: buf.readUInt16LE(off + 8),
          channels: buf.readUInt16LE(off + 10),
          sampleRate: buf.readUInt32LE(off + 12),
          bitsPerSample: buf.readUInt16LE(off + 22),
          blockAlign: buf.readUInt16LE(off + 20),
        };
      } else if (id === "data") {
        if (!fmt) return null;
        return { ...fmt, dataOffset: off + 8, dataSize: Math.min(size, buf.length - off - 8) };
      }
      off += 8 + size + (size % 2);
    }
    return null;
  } catch {
    return null;
  }
}

function writeWavHeader(out: Buffer, sampleRate: number, channels: number, bits: number, dataBytes: number) {
  const blockAlign = channels * (bits / 8);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(Math.round(sampleRate * blockAlign), 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bits, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
}

/**
 * Shift a WAV's playback rate by `factor`: >1 is shorter and higher,
 * <1 is longer and deeper. Only PCM16 takes are bent; anything else
 * (or a no-op factor within 1%) comes back unchanged.
 */
export function shiftWavPlayback(buf: Buffer, factor: number): Buffer {
  if (!Number.isFinite(factor)) return buf;
  const f = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
  if (Math.abs(f - 1) < 0.01) return buf;
  const wav = parseWav(buf);
  if (!wav || wav.audioFormat !== 1 || wav.bitsPerSample !== 16 || wav.blockAlign < wav.channels * 2) return buf;
  const frames = Math.floor(wav.dataSize / wav.blockAlign);
  if (frames < 2) return buf;

  const outFrames = Math.max(2, Math.floor((frames - 1) / f) + 1);
  const out = Buffer.alloc(44 + outFrames * wav.blockAlign);
  writeWavHeader(out, wav.sampleRate, wav.channels, wav.bitsPerSample, outFrames * wav.blockAlign);
  for (let i = 0; i < outFrames; i++) {
    const pos = Math.min(frames - 1, i * f);
    const i0 = Math.floor(pos);
    const i1 = Math.min(frames - 1, i0 + 1);
    const t = pos - i0;
    for (let ch = 0; ch < wav.channels; ch++) {
      const a = buf.readInt16LE(wav.dataOffset + i0 * wav.blockAlign + ch * 2);
      const b = buf.readInt16LE(wav.dataOffset + i1 * wav.blockAlign + ch * 2);
      out.writeInt16LE(Math.round(a + (b - a) * t), 44 + i * wav.blockAlign + ch * 2);
    }
  }
  return out;
}

/**
 * Split a take's requested performance into TTS inputs: the speed the
 * engine should render at and the playback factor to apply afterwards,
 * so the finished take sits at `targetSpeed` with the pitch bend.
 */
export function ttsSpeedAndPitchFactor(targetSpeed: number, pitch: number): { ttsSpeed: number; factor: number } {
  const p = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, Number.isFinite(pitch) ? pitch : 1));
  const s = Math.min(2, Math.max(0.5, Number.isFinite(targetSpeed) ? targetSpeed : 1));
  const ttsSpeed = Math.min(2, Math.max(0.5, s / p));
  return { ttsSpeed, factor: p };
}
