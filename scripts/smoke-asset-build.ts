// Smoke test: build one character + one environment asset through the
// real assets module (DB upsert, DNA compile, builder run, library move).
import { buildBlenderAsset, blenderAssetLibrary, inspectBlenderAsset } from "../src/lib/blender/assets";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const p = await db.project.findFirst({ where: { title: "Cloudveil Ascent" } });
  if (!p) {
    console.log("Cloudveil Ascent not found - projects:", (await db.project.findMany({ select: { title: true } })).map((x) => x.title).join(", "));
    return;
  }
  const cast = await db.character.findMany({ where: { projectId: p.id }, select: { name: true, modelSheetUrl: true } });
  const envs = await db.environment.findMany({ where: { projectId: p.id }, select: { name: true } });
  console.log("cast:", cast.map((c) => `${c.name}${c.modelSheetUrl ? " [sheet]" : " [NO SHEET]"}`).join(", "));
  console.log("envs:", envs.map((e) => e.name).join(", "));

  const heroName = cast.find((c) => c.modelSheetUrl)?.name ?? cast[0]?.name;
  if (heroName) {
    console.log(`\nbuilding character asset for ${heroName}...`);
    const res = await buildBlenderAsset(p.id, "CHARACTER", heroName, "smoke test build");
    console.log("build:", res.ok ? `OK v${res.version} ${res.objects} objects ${res.tris} tris ${(res.buildMs / 1000).toFixed(1)}s` : `FAILED: ${res.log.slice(-300)}`);
    if (res.ok) {
      const insp = await inspectBlenderAsset(res.assetId);
      console.log("inspect:", insp.ok ? (insp.skipped ? "skipped" : `${Math.round((insp.score ?? 0) * 100)}% ${insp.note ?? ""}`) : `failed: ${insp.error}`);
    }
  }
  const envName = envs[0]?.name;
  if (envName) {
    console.log(`\nbuilding environment asset for ${envName}...`);
    const res = await buildBlenderAsset(p.id, "ENVIRONMENT", envName);
    console.log("build:", res.ok ? `OK v${res.version} ${res.objects} objects ${res.tris} tris ${(res.buildMs / 1000).toFixed(1)}s` : `FAILED: ${res.log.slice(-300)}`);
  }
  const lib = await blenderAssetLibrary(p.id);
  console.log(`\nlibrary: ${lib.total} assets (${lib.ready} ready, ${lib.failed} failed) avgIdentity=${lib.avgIdentity === null ? "n/a" : `${Math.round(lib.avgIdentity * 100)}%`}`);
  for (const a of lib.assets) console.log(`  ${a.kind} ${a.refName}: ${a.status} v${a.version} ${a.previewPath ?? ""}`);
}

main().finally(() => db.$disconnect());
