// Backup/restore Ep7 scene dialogues (byte-identical) for browser verification
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("no project");
const mode = process.argv[2] ?? "backup";
const FILE = "/home/z/my-project/scripts/ep7-dialogue-backup.json";
const eps = await db.episode.findMany({
  where: { number: 7, season: { projectId: project.id } },
  include: { scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: { number: "asc" }, select: { id: true, number: true, dialogue: true } } } } },
});
if (mode === "backup") {
  const data: Record<string, string | null> = {};
  for (const ep of eps) for (const sc of ep.scenes) for (const sh of sc.shots) data[sh.id] = sh.dialogue;
  await Bun.write(FILE, JSON.stringify(data, null, 1));
  const speakers = new Set<string>();
  for (const ep of eps) for (const sc of ep.scenes) for (const sh of sc.shots) {
    try { for (const l of JSON.parse(sh.dialogue ?? "[]")) speakers.add(l.speaker); } catch {}
  }
  console.log(`backup: ${Object.keys(data).length} shots; speakers: ${[...speakers].join(", ")}`);
  for (const ep of eps) for (const sc of ep.scenes) {
    console.log(`Sc${sc.number} "${sc.title}": shots ${sc.shots.map((s) => s.number).join(", ")}`);
  }
} else {
  const data = JSON.parse(await Bun.file(FILE).text()) as Record<string, string | null>;
  let restored = 0;
  for (const [id, dialogue] of Object.entries(data)) {
    const before = await db.shot.findUnique({ where: { id }, select: { dialogue: true } });
    if (before && before.dialogue !== dialogue) {
      await db.shot.update({ where: { id }, data: { dialogue } });
      restored += 1;
    }
  }
  console.log(`restore: ${restored} shot(s) reverted`);
}
process.exit(0);
