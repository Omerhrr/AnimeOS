// Iteration 22 browser fixture: stamp a two-speaker ENSEMBLE beat on the
// real Ep7 Sc12 (S1 Lin Yue + S2 Su Yan lines sharing one arcBatch) so the
// ruler lanes / panel inspector can be screenshotted with ensemble badges.
// Self-contained: "apply" snapshots S1..S3 dialogues first, "restore" puts
// the originals back byte-identical. The stamped shots carry no audio cues,
// so the season diff stays 0 fresh / 0 stale / 1 unrendered throughout.
import { PrismaClient } from "@prisma/client";
import { serializeDialogue } from "../src/lib/comic/dialogue";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("no project");
const mode = process.argv[2] ?? "apply";
const FILE = "/home/z/my-project/scripts/iter22-browser-fixture.json";

const scene = await db.scene.findFirst({
  where: { number: 12, episode: { number: 7, season: { projectId: project.id } } },
  include: { shots: { orderBy: { number: "asc" } } },
});
if (!scene) throw new Error("Ep7 Sc12 not found");
const shotByNumber = (n: number) => scene.shots.find((s) => s.number === n);
if (!shotByNumber(1) || !shotByNumber(2) || !shotByNumber(3)) throw new Error("Sc12 shots 1..3 missing");

if (mode === "apply") {
  const backup: Record<string, string | null> = {};
  for (const n of [1, 2, 3]) backup[String(n)] = shotByNumber(n)!.dialogue;
  await Bun.write(FILE, JSON.stringify(backup));
  const batch = "ens-browser-demo";
  await db.shot.update({
    where: { id: shotByNumber(1)!.id },
    data: { dialogue: serializeDialogue([{ speaker: "Lin Yue", text: "The mountain holds its breath.", kind: "SPEECH", state: "S02 - Foundation Established", arcBatch: batch }]) },
  });
  await db.shot.update({
    where: { id: shotByNumber(2)!.id },
    data: { dialogue: serializeDialogue([{ speaker: "Su Yan", text: "Because something wakes beneath it.", kind: "SPEECH", state: "Possessed", arcBatch: batch }]) },
  });
  console.log("applied: S1 Lin Yue + S2 Su Yan share", batch);
} else {
  const backup = JSON.parse(await Bun.file(FILE).text()) as Record<string, string | null>;
  let reverted = 0;
  for (const [n, dialogue] of Object.entries(backup)) {
    const shot = shotByNumber(Number(n))!;
    if (shot.dialogue !== dialogue) {
      await db.shot.update({ where: { id: shot.id }, data: { dialogue } });
      reverted += 1;
    }
  }
  console.log(`restore: ${reverted} shot(s) reverted`);
}
process.exit(0);
