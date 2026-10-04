// quick env-DNA probe for the set-brush eye check
import { db } from "../src/lib/db";
import { environmentDna } from "../src/lib/animation/design";

async function main() {
  const envs = await db.environment.findMany();
  console.error("found:", envs.map((e) => e.name).join(","));
  const env = envs.find((e) => /temple/i.test(e.name)) ?? envs[0];
  const dna = environmentDna({
    name: env.name,
    description: env.description,
    atmosphere: env.atmosphere,
    timeOfDay: env.timeOfDay,
    weather: env.weather,
    sceneTimeOfDay: "night",
    sceneWeather: "storm",
  });
  console.log(JSON.stringify(dna));
  await db.$disconnect();
}
main();
