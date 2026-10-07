// THE EYE BEFORE THE PEN (iteration 140) - the honest cast payloads
// for the probe on the TWO NAMED CELLS: the S003 CLOSEUP (Lin Yue -
// the twice-named 'wrong gender/age features' cell, 138 S002 + 139
// S003) and the S004 WIDE (the paint rung's own cell - the 139 r3
// statement rode and the 'chibi' accusation HELD anyway). The drain's
// own assembly computed through the REAL lib functions. Emits
// probe140-cast.json so
// the python probe rides byte-exact colors instead of stale constants
// (the 132 probe's lesson, sharpened by the 137 restore: the sheets
// moved, so any hardcoded palette would be a lie).
// Run: DATABASE_URL=file:... npx tsx scripts/probe-138-cast.ts
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
    // the sheet conformance (the 128 design anchor + the sheet pull)
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
        // the build WEARS the rows: the pull/anchor rewrites the dye
        for (const r of rows) {
          if (r.skipped) continue;
          const key = r.role === "robe" ? "robeColor" : r.role === "accent" ? "robeAccent" : r.role === "hair" ? "hairColor" : null;
          if (key && r.to) member[key] = r.to;
        }
        member.sheetConformanceNote = `rows: ${rows.map((r) => `${r.role}${r.anchored ? "(anchored)" : ""} ${r.from}->${r.to}`).join("; ")}`;
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
  const s004 = shots.find((s) => s.number === 4);
  if (!s003 || !s004) throw new Error("S003/S004 missing");
  // the drain's own scene/env/choreo assembly (render.ts lines 320-331, 441-451)
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
    S004: {
      number: 4, description: s004.description, shotType: s004.shotType, lens: s004.lens,
      movement: s004.movement, duration: s004.duration, lighting: s004.lighting,
      cameraChoreo: choreo(s004),
      cast: await castFor(s004, castRows, episodeNumber),
    },
    scene: sceneDict,
  };
  fs.writeFileSync("probe140-cast.json", JSON.stringify(out, null, 1));
  console.log("probe140-cast.json written");
  console.log(`S003 cast: ${out.S003.cast.map((c) => `${c.name} robe ${c.robeColor} accent ${c.robeAccent} hair ${c.hairColor}`).join(" | ")}`);
  console.log(`S004 cast: ${out.S004.cast.map((c) => `${c.name} robe ${c.robeColor} accent ${c.robeAccent} hair ${c.hairColor}`).join(" | ")}`);
  process.exit(0);
}
main().catch((e) => { console.error("cast probe failed:", e); process.exit(1); });
