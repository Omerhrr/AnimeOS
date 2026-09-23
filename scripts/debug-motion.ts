// One-off: render two clips directly through the MOTION engine to surface errors.
import { renderShotClip } from "@/lib/bridge/motion";
import fs from "fs";
import path from "path";

const out = "/tmp/motion-debug";
fs.mkdirSync(out, { recursive: true });

const base = {
  fogDensity: 0.45, lightningIntensity: 0.55, energyIntensity: 0.6,
  cameraDistance: 1.0, rimLightIntensity: 0.5,
  fps: 24, resolution: "1280x720", mode: "PREVIEW" as const,
};

const cases = [
  { jobId: "dbg-static", shotType: "MEDIUM", movement: "STATIC", lens: null, lighting: null, duration: 1.6 },
  { jobId: "dbg-dolly", shotType: "CLOSEUP", movement: "DOLLY_IN", lens: "85mm", lighting: "night", duration: 2.0 },
];

for (const c of cases) {
  const r = await renderShotClip({ ...base, ...c, shotNumber: 1, artworkUrl: null, onProgress: (p) => process.stdout.write(`\r${c.jobId}: ${Math.round(p * 100)}%`) });
  console.log(`\n${c.jobId}: outputUrl=${r.outputUrl} error=${r.error ?? "none"}`);
  if (r.outputUrl) {
    const abs = path.join(process.cwd(), "public", r.outputUrl.replace(/^\//, ""));
    console.log(`  size=${fs.statSync(abs).size}`);
  }
}
process.exit(0);
