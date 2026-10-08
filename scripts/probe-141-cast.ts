// THE EYE BEFORE THE PEN (iteration 141) - the 140 night's two named
// cells: the S003 forehead-highlight ellipse and the teal-vs-black
// dye cell (named EVERY night: 'hair is teal instead of black' - the
// design says #0d0d0d, the sheet DNA says #16161d, the sheet ART
// reads black, the render reads TEAL). The honest cast payloads on
// the drain's own assembly (the REAL lib functions), with the FULL
// member dict printed so the riding dye and its conformance rows are
// ON THE RECORD before any cut moves.
// Run: DATABASE_URL=file:... npx tsx scripts/probe-141-cast.ts
import { db } from "../src/lib/db";
import { detectCast } from "../src/lib/ai/art";
import { characterDesignDna, environmentDna } from "../src/lib/animation/design";
import { adherentDna, sheetDnaFresh } from "../src/lib/blender/adherence";
import { planSheetConformance, extractSheetPalette } from "../src/lib/blender/sheet-palette";
import { parseCameraChoreo } from "../src/lib/blender/camera-choreo";
import fs from "fs";
import path from "path";

const BOOTS_DEFAULT = "#2a2a30"; // render.ts's standing default

async function castFor(shot, castRows, episodeNumber) {
  const detected = detectCast(castRows, shot.description).slice(0, 2);
  const members = [];
  for (const c of detected) {
    const st = [...c.states]
      .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
      .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())[0];
    const regex = characterDesignDna({
      name: c.name, role: c.role, appearance: c.appearance, modelSheetPrompt: c.modelSheetPrompt,
      stateClothing: st?.clothing ?? null, stateWeapon: st?.weapon ?? null,
    });
    const fresh = sheetDnaFresh(c.sheetDna, c.modelSheetUrl);
    const dna = adherentDna(regex, fresh);
    const member: Record<string, unknown> = {
      name: c.name,
      hairStyle: dna.hairStyle,
      hairColor: dna.hairColor,
      robeColor: dna.robeColor,
      robeAccent: dna.robeAccent,
      skinTone: dna.skinTone,
      weaponType: dna.weaponType,
      conformFactor: dna.conformFactor,
      sheetFields: dna.sheetFields,
    };
    if (c.designSpec) {
      try { member.designSpec = JSON.parse(c.designSpec); } catch { /* a corrupt spec builds from the DNA */ }
    }
    member.regexHair = regex.hairColor; // the 141 probe's evidence: the TEXT dna's own hair read
    if (c.modelSheetUrl) {
      const sheetPath = path.join(process.cwd(), "public", c.modelSheetUrl.split("?")[0]);
      if (fs.existsSync(sheetPath)) {
        const palette = await extractSheetPalette(await fs.promises.readFile(sheetPath));
        const rows = planSheetConformance(
          { robe: dna.robeColor, accent: dna.robeAccent, hair: dna.hairColor, boots: BOOTS_DEFAULT },
          palette,
          dna.conformFactor,
          undefined,
          { robe: regex.robeColor, accent: regex.robeAccent, hair: regex.hairColor },
        );
        for (const r of rows) {
          if (r.skipped) continue;
          const key = r.role === "robe" ? "robeColor" : r.role === "accent" ? "robeAccent" : r.role === "hair" ? "hairColor" : null;
          if (key && r.to) member[key] = r.to;
        }
        member.sheetConformanceNote = `rows: ${rows.map((r) => `${r.role}${r.anchored ? "(anchored)" : ""} ${r.from}->${r.to}${r.skipped ? ` (${r.skipped.slice(0, 60)})` : ""}`).join("; ")}`;
      }
    }
    members.push(member);
  }
  return members;
}

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const episodeNumber = (await db.episode.findFirst({ where: { id: scene.episodeId } }))?.number ?? 7;
  const castRows = await db.character.findMany({ where: { projectId: project.id }, include: { states: true } });
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  const s003 = shots.find((s) => s.number === 3);
  const s005 = shots.find((s) => s.number === 5);
  if (!s003 || !s005) throw new Error("S003/S005 missing");
  const env = scene.environment
    ? environmentDna({
        name: scene.environment.name,
        description: scene.environment.description,
        atmosphere: scene.environment.atmosphere,
        timeOfDay: scene.environment.timeOfDay,
        weather: scene.environment.weather,
        sceneTimeOfDay: scene.timeOfDay,
        sceneWeather: scene.weather,
      })
    : null;
  const sceneDict = {
    number: scene.number, title: scene.title,
    fogDensity: scene.fogDensity, lightningIntensity: scene.lightningIntensity,
    energyIntensity: scene.energyIntensity, cameraDistance: scene.cameraDistance,
    rimLightIntensity: scene.rimLightIntensity,
    ...(env ? { environment: env } : {}),
  };
  const choreo = (shot) => parseCameraChoreo({ description: shot.description, shotType: shot.shotType });
  const out = {
    episodeNumber,
    S003: {
      number: 3, description: s003.description, shotType: s003.shotType, lens: s003.lens,
      movement: s003.movement, duration: s003.duration, lighting: s003.lighting,
      cameraChoreo: choreo(s003),
      cast: await castFor(s003, castRows, episodeNumber),
    },
    S005: {
      number: 5, description: s005.description, shotType: s005.shotType, lens: s005.lens,
      movement: s005.movement, duration: s005.duration, lighting: s005.lighting,
      cameraChoreo: choreo(s005),
      cast: await castFor(s005, castRows, episodeNumber),
    },
    scene: sceneDict,
  };
  fs.writeFileSync("probe141-cast.json", JSON.stringify(out, null, 1));
  console.log("probe141-cast.json written");
  for (const [k, v] of Object.entries(out)) {
    if (k === "scene" || k === "episodeNumber") continue;
    const shot = v as Record<string, unknown>;
    for (const m of shot.cast as Record<string, unknown>[]) {
      console.log(`${k} ${m.name}: hair ${m.hairColor} (regex ${m.regexHair}) robe ${m.robeColor} accent ${m.robeAccent}`);
      console.log(`   conformance: ${m.sheetConformanceNote ?? "none"}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("cast probe failed:", e); process.exit(1); });
