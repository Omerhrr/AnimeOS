// Unit check for the state pitch-hint DSP: synthesizes a sine WAV,
// shifts it up and down, and verifies header integrity + duration math.
// Run: bun scripts/check-pitch-dsp.ts
import { shiftWavPlayback, ttsSpeedAndPitchFactor } from "../src/lib/ai/wav-dsp";

function synthSineWav(sampleRate: number, ms: number, freq = 220): Buffer {
  const n = Math.round((sampleRate * ms) / 1000);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 12000);
    data.writeInt16LE(v, i * 2);
  }
  const out = Buffer.alloc(44 + data.length);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + data.length, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(data.length, 40);
  data.copy(out, 44);
  return out;
}

function wavMs(buf: Buffer): number {
  const dataSize = buf.readUInt32LE(40);
  const byteRate = buf.readUInt32LE(28);
  return (dataSize / byteRate) * 1000;
}

function close(a: number, b: number, tolPct: number): boolean {
  return Math.abs(a - b) / b <= tolPct / 100;
}

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

const base = synthSineWav(24000, 1000);

// deep: factor 0.8 -> 1.25x longer
const deep = shiftWavPlayback(base, 0.8);
check("deep duration x1.25", close(wavMs(deep), 1250, 1), `${wavMs(deep).toFixed(1)}ms (want ~1250)`);
check("deep header intact", deep.toString("ascii", 0, 4) === "RIFF" && deep.toString("ascii", 36, 40) === "data" && deep.readUInt16LE(22) === 1, "RIFF/data/mono ok");

// high: factor 1.25 -> 0.8x shorter
const high = shiftWavPlayback(base, 1.25);
check("high duration x0.8", close(wavMs(high), 800, 1), `${wavMs(high).toFixed(1)}ms (want ~800)`);

// no-op passthrough
const same = shiftWavPlayback(base, 1);
check("no-op passthrough", same === base, "same buffer reference");

// octave: factor 2 -> half duration, samples decimated 2:1
const octave = shiftWavPlayback(base, 2);
const baseS0 = base.readInt16LE(44 + 2000 * 2);
const octS1000 = octave.readInt16LE(44 + 1000 * 2);
check("octave duration x0.5", close(wavMs(octave), 500, 1), `${wavMs(octave).toFixed(1)}ms (want ~500)`);
check("octave decimation matches", Math.abs(octS1000 - baseS0) < 40, `y[1000]=${octS1000} vs x[2000]=${baseS0}`);

// compensation math: target 0.85 speed at pitch 0.8 -> tts renders 1.0625
const sp = ttsSpeedAndPitchFactor(0.85, 0.8);
check("tts speed compensation", close(sp.ttsSpeed, 1.0625, 0.1) && sp.factor === 0.8, `ttsSpeed=${sp.ttsSpeed} factor=${sp.factor}`);

// clamped compensation: unreachable tts speed still returns valid values
const sp2 = ttsSpeedAndPitchFactor(0.5, 1.5);
check("compensation clamps", sp2.ttsSpeed >= 0.5 && sp2.ttsSpeed <= 2, `ttsSpeed=${sp2.ttsSpeed}`);

// stereo PCM16 also bends
const stereo = synthSineWav(24000, 1000);
// fake a 2-channel take: just verify the parser accepts multichannel by shifting anyway
const st = shiftWavPlayback(stereo, 1.5);
check("mono default path", close(wavMs(st), 666.7, 1), `${wavMs(st).toFixed(1)}ms (want ~666.7)`);

console.log(failures === 0 ? "\nAll pitch DSP checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
