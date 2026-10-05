// PROBE 132 - THE GENDER/BUILD TELL (the 131 night's named frontier).
// "a simplified chibi style rather than the detailed male features of
// the sheet" - the judge's own words at S002 (Lin Yue, MEDIUM). The
// record's hypothesis: the build's spec reads female-shaped against a
// sheet that depicts a male youth. This probe reads the REAL chain
// offline (no render owed for the DNA half):
//   1. the cast rows as the render path sees them (designSpec present?)
//   2. the resolved spec through the BRIDGE'S OWN resolve_spec (run
//      under the provisioned Blender's python so the law is byte-exact)
//   3. the sheet DNA's gender/build section vs the spec (what the
//      sheet depicts vs what the builder builds)
// Run: DATABASE_URL=file:... npx tsx scripts/probe-132-dna.ts
import { db } from "../src/lib/db";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runtimeBlenderBin } from "../src/lib/blender/runtime";

const SCENE_CAST = ["Lin Yue", "Demon Lord Wei"];

async function main() {
  const chars = await db.character.findMany();
  const py = `
import json, sys, os, importlib.util
sys.path.insert(0, ${JSON.stringify(path.join(process.cwd(), "bridges", "blender"))})
spec = importlib.util.spec_from_file_location("anime_character", ${JSON.stringify(path.join(process.cwd(), "bridges", "blender", "anime_character.py"))})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
payload = json.load(open(sys.argv[-1]))
out = {}
for name, dna in payload.items():
    s = m.resolve_spec(dna)
    out[name] = {
        "gender": s["body"]["gender"], "build": s["body"]["build"],
        "shoulders": s["body"]["shoulders"], "hips": s["body"]["hips"],
        "bust": s["body"]["bust"], "headScale": s["body"]["headScale"],
        "face": s["face"], "eyes": s["eyes"], "brows": s["brows"],
        "hair": {k: s["hair"][k] for k in ("style", "length", "volume", "accessory")},
        "outfit": s["outfit"],
    }
json.dump(out, open(sys.argv[-2], "w"))
`;
  const pyFile = "/tmp/probe-132-resolve.py";
  const inFile = "/tmp/probe-132-dna.json";
  const outFile = "/tmp/probe-132-spec.json";
  fs.writeFileSync(pyFile, py);
  const payload: Record<string, unknown> = {};
  for (const c of chars) {
    if (!SCENE_CAST.includes(c.name)) continue;
    const ds = c.designSpec ? JSON.parse(c.designSpec) : null;
    payload[c.name] = { name: c.name, build: "lean", hairStyle: "topknot", designSpec: ds };
  }
  fs.writeFileSync(inFile, JSON.stringify(payload));
  const bin = runtimeBlenderBin();
  const pyBin = path.join(path.dirname(bin), "python", "bin", "python3.11");
  const runner = fs.existsSync(pyBin) ? pyBin : bin;
  const args = fs.existsSync(pyBin) ? [pyFile, outFile, inFile] : ["-b", "--factory-startup", "-P", pyFile, "--", outFile, inFile];
  execFileSync(runner, args, { stdio: "pipe" });
  const spec = JSON.parse(fs.readFileSync(outFile, "utf8"));

  console.log("== THE RESOLVED SPECS (the bridge's own law) ==");
  for (const [name, s] of Object.entries(spec as Record<string, any>)) {
    console.log(`== ${name} ==`);
    console.log(`  gender: ${s.gender} | build: ${s.build} | shoulders: ${s.shoulders} | hips: ${s.hips} | bust: ${s.bust} | headScale: ${s.headScale}`);
    console.log(`  face: ${JSON.stringify(s.face)}`);
    console.log(`  eyes: size ${s.eyes.size} tilt ${s.eyes.tilt} shape ${s.eyes.shape} lashes ${s.eyes.lashes}`);
    console.log(`  brows: thickness ${s.brows.thickness} arch ${s.brows.arch}`);
    console.log(`  hair: ${JSON.stringify(s.hair)}`);
    console.log(`  outfit: ${JSON.stringify(s.outfit)}`);
  }

  console.log("\n== THE SHEET DNA's GENDER/BUILD SECTION ==");
  for (const c of chars) {
    if (!SCENE_CAST.includes(c.name)) continue;
    let dna: any = null;
    try { dna = typeof c.sheetDna === "string" ? JSON.parse(c.sheetDna) : c.sheetDna; } catch { /* absent */ }
    console.log(`${c.name}: sheetDna.build=${dna?.build} faceShape=${dna?.faceShape} hairStyle=${dna?.hairStyle} beard=${dna?.beard}`);
    console.log(`  silhouette: ${dna?.silhouette}`);
    const ds = c.designSpec ? JSON.parse(c.designSpec) : null;
    console.log(`  designSpec: ${ds ? `gender=${ds.body?.gender} shoulders=${ds.body?.shoulders} hips=${ds.body?.hips} bust=${ds.body?.bust} headScale=${ds.body?.headScale}` : "ABSENT (defaults rule)"}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
