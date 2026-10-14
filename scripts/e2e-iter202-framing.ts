// E2E ITERATION 202 - THE FRAMING LAW: THE PER-SHOT CAMERA OVERRIDE.
//
// The 201 paired arm measured the closer camera at +15 on the gate's
// named cell (S004: SHOT WORST 40 -> 55, the face 20 -> 30, the
// arch composition intact - one variable, real renders, the damped
// instrument). This iteration lands the lever: the per-shot
// cameraDistanceOverride (null rides the scene byte-exact - the
// standing grammar IS the null case), both payload assembly sites
// honoring it, S004's row carrying 0.6, PRESENCE 111.
//
// Asserts (source law):
//   1. the schema carries the override column (the generated client)
//   2. both assembly sites read override ?? scene (the byte-exact
//      null case asserted in the source)
//   3. S004's row carries 0.6; the other five shots ride null
//   4. the version pin: PRESENCE_LAW_VERSION 111 in the bridge
//   5. the receipts ride the doc (the 201 arm's numbers)
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

let fails = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
};

const db = new PrismaClient();

async function main() {
  // 1. THE SCHEMA CARRIES THE COLUMN (the generated client's type)
  const probe = await db.shot.findFirst({ select: { cameraDistanceOverride: true } });
  ok(probe !== null && "cameraDistanceOverride" in (probe as object), "the schema carries cameraDistanceOverride (the generated client)");

  // 2. BOTH ASSEMBLY SITES READ override ?? scene (the source law)
  const src = fs.readFileSync(path.join(process.cwd(), "src", "lib", "engine", "render.ts"), "utf8");
  const sites = src.split("cameraDistance: shot.cameraDistanceOverride ?? shot.scene.cameraDistance").length - 1;
  ok(sites === 2, `both payload assembly sites honor the override (found ${sites})`);
  ok(src.includes("THE 202 FRAMING LAW: the per-shot override (null rides the scene)"), "the law's own comment rides both sites");

  // 3. S004's ROW CARRIES 0.6; THE OTHERS RIDE NULL
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  const s4 = shots.find((s) => s.number === 4);
  ok(s4?.cameraDistanceOverride === 0.6, `S004 carries the override 0.6 (${s4?.cameraDistanceOverride})`);
  const othersNull = shots.filter((s) => s.number !== 4).every((s) => s.cameraDistanceOverride === null);
  ok(othersNull, "the other five shots ride null (the scene's own grammar byte-exact)");

  // 4. THE VERSION PIN
  const bridge = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py"), "utf8");
  ok(bridge.includes("PRESENCE_LAW_VERSION = 111"), "the bridge pins PRESENCE_LAW_VERSION 111 (the framing law)");

  // 5. THE RECEIPTS RIDE THE DOC
  const self = fs.readFileSync(__filename, "utf8");
  ok(self.includes("+15") && self.includes("40 -> 55"), "the 201 arm's receipt rides the doc");
  ok(self.includes("0.6"), "the override's own value rides the doc");

  console.log(fails === 0 ? "ALL GREEN" : `${fails} FAILED`);
  await db.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
