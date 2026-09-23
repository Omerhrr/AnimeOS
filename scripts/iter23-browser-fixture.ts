// Browser-pass fixture for Iteration 23: a saved template at v2 (one
// replaced shape in its history) for the version-badge/history UI, plus
// a TEMPORARY state-arc stamp on Ep8 Sc20 S1 so the panel inspector can
// be screenshotted with an arc card + its stored take. arc mode backs up
// the dialogue bytes first; arc-restore puts them back exactly.
// Modes: create | cleanup | arc | arc-restore
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const NAME = "browser version probe";
const BACKUP = "scripts/iter23-browser-fixture.json";

if (process.argv[2] === "create") {
  await db.arcTemplate.deleteMany({ where: { projectId: project.id, name: NAME } });
  const row = await db.arcTemplate.create({
    data: {
      projectId: project.id,
      scope: "PROJECT",
      name: NAME,
      description: "probe for the version badge + history UI",
      segments: JSON.stringify([{ frac: 0.2, kind: "auto" }, { frac: 0.6, kind: "state" }, { frac: 0.2, kind: "auto" }]),
      version: 2,
      versions: JSON.stringify([{
        version: 1,
        segments: [{ frac: 0.25, kind: "auto" }, { frac: 0.5, kind: "state" }, { frac: 0.25, kind: "auto" }],
        note: "tightened the state run for the browser pass",
        at: new Date().toISOString(),
      }]),
    },
  });
  console.log("created", row.id);
} else if (process.argv[2] === "cleanup") {
  await db.arcTemplate.deleteMany({ where: { projectId: project.id, name: NAME } });
  console.log("cleaned");
} else if (process.argv[2] === "arc") {
  const shot = await db.shot.findFirst({
    where: { scene: { number: 20, episode: { number: 8, season: { projectId: project.id } } }, number: 1 },
  });
  if (!shot?.dialogue) throw new Error("Ep8 Sc20 S1 dialogue missing");
  writeFileSync(BACKUP, JSON.stringify({ shotId: shot.id, dialogue: shot.dialogue }));
  const lines = JSON.parse(shot.dialogue);
  for (const l of lines) {
    if ((l.speaker ?? "").trim().toLowerCase() === "lin yue") l.state = "Battle-damaged (temple fight)";
  }
  await db.shot.update({ where: { id: shot.id }, data: { dialogue: JSON.stringify(lines) } });
  console.log("arc stamped on Ep8 Sc20 S1 (backup at", BACKUP + ")");
} else if (process.argv[2] === "arc-restore") {
  if (!existsSync(BACKUP)) throw new Error("no backup file");
  const backup = JSON.parse(readFileSync(BACKUP, "utf8")) as { shotId: string; dialogue: string };
  const shot = await db.shot.findUnique({ where: { id: backup.shotId } });
  await db.shot.update({ where: { id: backup.shotId }, data: { dialogue: backup.dialogue } });
  console.log("restored:", shot?.dialogue === backup.dialogue ? "already identical" : "dialogue put back");
} else {
  throw new Error("unknown mode");
}
await db.$disconnect();
