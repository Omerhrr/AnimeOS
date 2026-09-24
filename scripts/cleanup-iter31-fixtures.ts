// cleanup: remove leftover e2e-iter31 fixture projects + artifacts.
// The file sweep is DB-aware: a panel/render/sheet file whose id no
// longer exists as a Shot / RenderJob / Character row is orphaned and
// removed (no time-window guessing).
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();
const titles = ["Repaint and LipSync E2E", "Rig and Facts E2E", "E2E Temp Project", "Repaint Runner E2E", "Runner UI E2E", "E2E Browser Iter31"];

const stale = await db.project.findMany({ where: { title: { in: titles } }, select: { id: true, title: true } });
for (const p of stale) {
  console.log(`removing leftover fixture ${p.id} (${p.title})`);
  await db.project.delete({ where: { id: p.id } }).catch(() => {});
}

const shotIds = new Set((await db.shot.findMany({ select: { id: true } })).map((s) => s.id));
const jobIds = new Set((await db.renderJob.findMany({ select: { id: true } })).map((j) => j.id));
const charIds = new Set((await db.character.findMany({ select: { id: true } })).map((c) => c.id));

function stemOf(f: string): string {
  return f.replace(/\.(png|mp4|json|webp|jpg)$/, "").replace(/^\.(job|frames|plate)-/, "");
}

for (const [dir, ids] of [["panels", shotIds], ["renders", jobIds], ["sheets", charIds]] as const) {
  const full = path.join(process.cwd(), "public", dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) {
    const stem = stemOf(f);
    const orphan = !ids.has(stem) && (stem.startsWith("cmu") || f.startsWith(".job-") || f.startsWith(".frames-") || f.startsWith(".plate-"));
    if (orphan) {
      try { fs.rmSync(path.join(full, f), { recursive: true, force: true }); console.log(`swept ${dir}/${f}`); } catch { /* keep going */ }
    }
  }
}
console.log("cleanup done");
process.exit(0);
