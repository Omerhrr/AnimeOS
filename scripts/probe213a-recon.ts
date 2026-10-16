// probe213a-recon.ts — read-only recon for the AI-art lever probe:
// the E7 Sc12 shots, the cast's anchor fields, the committed per-shot baseline.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const db = new PrismaClient();

type ArcLine = {
  night: string;
  cohort?: string;
  worst?: number;
  scores: Array<{ characterName: string; similarity: number; aspects: Record<string, number>; note?: string }>;
  ref: { episode: number; scene: number; shot: number };
  source?: string;
};

const main = async () => {
  // 1) the shots
  const shots = await db.shot.findMany({
    where: { scene: { number: 12, episode: { number: 7 } } },
    orderBy: { number: "asc" },
    include: {
      scene: { include: { episode: { include: { season: { select: { projectId: true } } } } } },
    },
  });
  for (const s of shots) {
    console.log(
      `S${String(s.number).padStart(3, "0")} id=${s.id} type=${s.shotType ?? "?"} art=${s.artworkUrl ?? "none"}`,
    );
    console.log(`   desc: ${(s.description ?? "").slice(0, 160)}`);
  }
  if (shots.length === 0) {
    console.log("NO SHOTS for E7 Sc12 — dumping all scenes of E7");
    const scenes = await db.scene.findMany({
      where: { episode: { number: 7 } },
      include: { episode: true, shots: true },
    });
    for (const sc of scenes) console.log(`Sc${sc.number} id=${sc.id} shots=${sc.shots.length}`);
  }

  // 2) the cast anchors
  const projectId = shots[0]?.scene?.episode?.season?.projectId;
  const chars = await db.character.findMany({
    where: { projectId },
    include: { states: true },
  });
  for (const c of chars) {
    console.log(
      `CHAR ${c.name}: modelSheet=${c.modelSheetUrl ?? "none"} designSheet=${c.designSheetUrl ?? "none"} states=${c.states.length}`,
    );
    console.log(`   modelSheetPrompt: ${(c.modelSheetPrompt ?? "").slice(0, 240)}`);
    const spec = c.designSpec ? JSON.parse(c.designSpec) : null;
    if (spec) console.log(`   designSpec keys: ${Object.keys(spec).join(",")}`);
  }

  // 3) committed baseline: latest night per shot
  const lines: ArcLine[] = readFileSync("receipts/identity-arc.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const byShot = new Map<number, ArcLine>();
  for (const l of lines) {
    const prev = byShot.get(l.ref.shot);
    if (!prev || l.night > prev.night) byShot.set(l.ref.shot, l);
  }
  console.log("=== committed baseline (latest night per shot) ===");
  for (const [shot, l] of [...byShot.entries()].sort((a, b) => a[0] - b[0])) {
    const sims = l.scores.map((s) => Math.round(s.similarity * 100));
    console.log(
      `S${String(shot).padStart(3, "0")} ${l.night} worst=${Math.round((l.worst ?? 0) * 100)} sims=[${sims}]`,
    );
  }
  await db.$disconnect();
};
main();
