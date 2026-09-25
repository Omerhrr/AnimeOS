// Smoke test: run the REAL Blender worker on a v4 designed payload
// (design DNA present) with a short duration so it completes fast.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const payload = {
  jobId: "design-smoke-v4",
  shot: {
    number: 4,
    description: "Yun Shu draws the Cloudveil blade in one breath, robes flaring",
    shotType: "MEDIUM",
    lens: "50mm",
    movement: "DOLLY_IN",
    poseStart: "STANCE",
    poseEnd: "DRAW",
    lighting: "moonlight rim, cyan blade glow",
    duration: 1.2,
    cast: [
      { name: "Yun Shu", hairColor: "#16161d", hairStyle: "long", robeColor: "#2f6d63", robeAccent: "#3f8f7a", skinTone: "#d9b48f", weaponType: "sword", bladeColor: "#5eead4", build: "lean" },
      { name: "Master Heiyan", hairColor: "#6b7280", hairStyle: "topknot", robeColor: "#4a5560", robeAccent: "#a8842c", skinTone: "#d9b48f", weaponType: "sword", bladeColor: "#5eead4", build: "sturdy" },
    ],
  },
  scene: {
    number: 2,
    title: "Trial of Cups",
    fogDensity: 0.45,
    lightningIntensity: 0.55,
    energyIntensity: 0.6,
    cameraDistance: 1.0,
    rimLightIntensity: 0.5,
    environment: {
      name: "Cloudveil Terrace", terrain: "terrace", timeOfDay: "night", weather: "storm",
      skyColor: "#0b1220", fogColor: "#0a1018", groundColor: "#16211d", keyLight: "#cfe0ee",
      features: ["moons", "bell", "banners", "pillars", "cloudsea"],
    },
  },
  project: { title: "Cloudveil Ascent", visualStyle: "DONGHUA", resolution: "1280x720", fps: 24 },
  mode: "PREVIEW",
};

const rendersDir = path.join(process.cwd(), "public", "renders");
fs.mkdirSync(rendersDir, { recursive: true });
const jobFile = path.join(rendersDir, ".job-design-smoke-v4.json");
fs.writeFileSync(jobFile, JSON.stringify({ jobId: payload.jobId, payload, outDir: rendersDir }));

const bin = "/home/z/blender-4.3.2-linux-x64/blender";
const script = path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py");
console.log("spawning worker...");
const child = spawn(bin, ["-b", "-P", script, "--", "--worker", "--job", jobFile], { stdio: ["ignore", "pipe", "pipe"] });
let out = "";
child.stdout.on("data", (c) => { out += c.toString(); });
child.stderr.on("data", (c) => { out += c.toString(); });
const t0 = Date.now();
const timer = setInterval(() => {
  try {
    const st = JSON.parse(fs.readFileSync(jobFile, "utf-8"));
    process.stdout.write(`\r[${Math.round((Date.now() - t0) / 1000)}s] ${st.stage} ${Math.round((st.progress ?? 0) * 100)}%   `);
    if (st.done) {
      clearInterval(timer);
      console.log(`\nDONE error=${st.error}`);
      console.log("design:", JSON.stringify(st.design));
      console.log("rig:", JSON.stringify(st.rig));
      console.log("poses:", JSON.stringify(st.posesResolved), "secondFigure:", st.secondFigure ?? "none");
      console.log("mp4:", st.mp4Path, fs.existsSync(st.mp4Path ?? "") ? `${fs.statSync(st.mp4Path).size} bytes` : "MISSING");
      process.exit(0);
    }
  } catch { /* not flushed yet */ }
}, 2000);
child.on("exit", (code) => {
  clearInterval(timer);
  console.log(`\nworker exited code=${code}`);
  console.log(out.split("\n").slice(-30).join("\n"));
  try {
    const st = JSON.parse(fs.readFileSync(jobFile, "utf-8"));
    console.log("final state:", JSON.stringify(st, null, 1).slice(0, 1500));
  } catch { /* no state */ }
  process.exit(code ?? 0);
});
