// Builds worker payloads for the pixel-frontier test bench (S002 body read,
// S003 face light, S004 pan collision, S005 wide palette). Pure: no DB.
import fs from "node:fs";
import path from "node:path";
import { characterDesignDna, environmentDna } from "../src/lib/animation/design";
import { parseExpressionClip } from "../src/lib/blender/expressions";
import { parseCompProfile } from "../src/lib/blender/comp";
import { parseClothDirective } from "../src/lib/blender/cloth-directive";
import { parseCameraChoreo } from "../src/lib/blender/camera-choreo";
import { compileShotDirective } from "../src/lib/shot-directive";

const out = process.argv[2] ?? "/tmp/bench";
fs.mkdirSync(out, { recursive: true });

const hero = characterDesignDna({
  name: "Lin Yue",
  role: "PROTAGONIST",
  appearance: JSON.stringify({
    face: "sharp jaw, calm grey eyes",
    hair: "long black hair in a high topknot with a jade pin",
    body: "lean swordswoman",
    features: "white and jade-green layered hanfu robe, gold trim, jian sword",
  }),
  modelSheetPrompt: "Lin Yue, donghua swordswoman, long black hair high topknot, white hanfu with jade green sash and gold trim, straight jian",
  stateClothing: null,
  stateWeapon: null,
});
const env = environmentDna({
  name: "Moonlit Temple Terrace",
  description: "stone temple terrace with red lacquered pillars, lanterns, mountains",
  atmosphere: JSON.stringify(["mist", "moonlight"]),
  timeOfDay: "night",
  weather: "clear",
  sceneTimeOfDay: "night",
  sceneWeather: "clear",
});

const scene = { number: 1, title: "The Terrace Oath", fogDensity: 0.45, lightningIntensity: 0.3, energyIntensity: 0.6, cameraDistance: 1.0, rimLightIntensity: 0.5, environment: env };
const project = { title: "Bench", visualStyle: "DONGHUA", resolution: "1920x1080", fps: 12 };

const shots = [
  { id: "S002", number: 2, shotType: "MEDIUM", movement: "STATIC", lens: "50mm", description: "Lin Yue stands on the terrace, hand on her jian, resolve in her eyes", poseStart: "STANCE", poseEnd: "DRAW", duration: 1.0, lighting: "moonlight key" },
  { id: "S003", number: 3, shotType: "CLOSEUP", movement: "DOLLY_IN", lens: "85mm", description: "Close on Lin Yue's face as she speaks the oath calmly", poseStart: "STANCE", poseEnd: "STANCE", duration: 1.0, lighting: "moonlight key" },
  { id: "S004", number: 4, shotType: "MEDIUM", movement: "PAN", lens: "35mm", description: "The camera pans across the terrace pillars to find Lin Yue", poseStart: "WALK", poseEnd: "STANCE", duration: 2.0, lighting: "lantern light" },
  { id: "S005", number: 5, shotType: "WIDE", movement: "ORBIT", lens: "24mm", description: "Wide: Lin Yue alone on the terrace under the moon", poseStart: "STANCE", poseEnd: "STANCE", duration: 1.0, lighting: "moonlight" },
];

// the sheet read the night would carry: a white hanfu with a jade sash
// (the palette clusters a sheet measure would return)
const heroWithSheet = {
  ...hero,
  sheetConformance: {
    characterName: "Lin Yue",
    palette: ["#f0ece2", "#3f8f78", "#c9a24a", "#1b1b22", "#9cc7b6"],
    rows: [
      { mat: "RobeMat", from: hero.robeColor, to: "#e8e3d6", delta: 0.6 },
      { mat: "AccentMat", from: hero.robeAccent, to: "#3f8f78", delta: 0.4 },
    ],
    note: "bench sheet read",
  },
};

for (const s of shots) {
  const cast = [heroWithSheet];
  const shot: Record<string, unknown> = {
    number: s.number, description: s.description, shotType: s.shotType, lens: s.lens, movement: s.movement,
    poseStart: s.poseStart, poseEnd: s.poseEnd, lighting: s.lighting, duration: s.duration,
    expression: parseExpressionClip(s.description, s.poseStart, s.poseEnd),
    comp: parseCompProfile({ description: s.description, lighting: s.lighting, shotType: s.shotType, fogDensity: scene.fogDensity, lightningIntensity: scene.lightningIntensity }),
    clothDirective: parseClothDirective({ description: s.description, energyIntensity: scene.energyIntensity }),
    cameraChoreo: parseCameraChoreo({ description: s.description, shotType: s.shotType }),
    cast,
  };
  const d = compileShotDirective({
    movement: s.movement, poseStart: s.poseStart, poseEnd: s.poseEnd, duration: s.duration, lighting: s.lighting,
    grammar: null, fx: null, physics: null, choreo: null, cloth: null, flesh: null, speechLines: null,
    expressionPresent: Boolean(shot.expression), compPresent: true, clothDirectivePresent: true, cameraChoreoPresent: true,
  });
  shot.directiveHash = d.hash;
  const payload = { jobId: s.id, shot, scene, project, mode: "PREVIEW" };
  fs.writeFileSync(path.join(out, `${s.id}.json`), JSON.stringify({ jobId: s.id, payload, outDir: out }, null, 1));
}
console.log("payloads in", out, "robe", hero.robeColor, "hair", hero.hairStyle);
