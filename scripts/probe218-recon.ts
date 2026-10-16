// probe218-recon - READ-ONLY: the 218 frontier's own terrain.
// The two blocking buckets (close 55 BELOW / shadow 66 BELOW) -
// which shots sit in each, what the lighting words actually say,
// what the arc nights scored, what the receipts named.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface ArcLine {
  source: string; night: string; worst: number;
  scores: Array<{ characterName: string; similarity: number; aspects?: Record<string, number> }>;
  ref: { episode: number; scene: number; shot: number };
}

async function main() {
  const eps = await db.episode.findMany({ include: { season: true } });
  const ep = eps.find((e) => e.number === 7 && e.season?.number === 1);
  if (!ep) { console.log("no ep7"); return; }
  const scenes = await db.scene.findMany({ where: { episodeId: ep.id } });
  const sc = scenes.find((s) => s.number === 12);
  if (!sc) { console.log("scenes:", scenes.map((s) => s.number).join(",")); return; }
  const shots = await db.shot.findMany({ where: { sceneId: sc.id }, orderBy: { number: "asc" } });

  console.log("=== THE SIX SHOTS (the buckets' own terrain) ===");
  for (const sh of shots) {
    console.log(`S${String(sh.number).padStart(3, "0")} type=${sh.shotType} move=${sh.movement} pose=${sh.poseStart ?? "-"}`);
    console.log(`   lighting=${JSON.stringify(sh.lighting)}`);
    console.log(`   desc=${(sh.description ?? "").slice(0, 130)}`);
  }

  // the arc receipt lines for this scene, both nights
  const fs = await import("fs");
  const path = await import("path");
  const receiptPath = path.join(process.cwd(), "receipts/identity-arc.jsonl");
  const lines = fs.readFileSync(receiptPath, "utf8").split("\n").filter(Boolean);
  const arc: ArcLine[] = [];
  for (const l of lines) { try { arc.push(JSON.parse(l) as ArcLine); } catch { /* skip */ } }
  const mine = arc.filter((a) => a.source === "AI_KEYFRAME" && a.ref.episode === 7 && a.ref.scene === 12);
  console.log("\n=== THE ARC NIGHTS (per shot, per night) ===");
  const byShot = new Map<number, Array<{ night: string; worst: number; aspects: Record<string, number> }>>();
  for (const a of mine) {
    const rec = byShot.get(a.ref.shot) ?? [];
    const first = a.scores[0];
    rec.push({ night: a.night, worst: a.worst, aspects: (first?.aspects ?? {}) as Record<string, number> });
    byShot.set(a.ref.shot, rec);
  }
  for (const [shot, recs] of [...byShot.entries()].sort((a, b) => a[0] - b[0])) {
    for (const r of recs) {
      const asp = Object.entries(r.aspects).map(([k, v]) => `${k}=${typeof v === "number" ? (v * 100).toFixed(0) : v}`).join(" ");
      console.log(`S${String(shot).padStart(3, "0")} ${r.night}: worst ${(r.worst * 100).toFixed(0)}  [${asp}]`);
    }
  }
}

main().finally(() => db.$disconnect());
