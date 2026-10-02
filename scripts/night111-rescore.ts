// ─────────────────────────────────────────────────────────────
// NIGHT 111 RE-SCORE - real vision over the night's real clips.
//
// For every shot of the standing scene: scoreShotIdentity(shot,
// "RENDER") - the pose-matched filmstrip judged against the cast's
// model sheets by the REAL vision channel - then the distribution
// (mean / median / p10 against the 70% release floor) and the REAL
// publish attempt whose gate must answer verbatim.
//
// Iteration 117: THE VERDICT IS THE MEDIAN OF ITS SAMPLES - each
// shot scores ANIMEOS_SCORE_SAMPLES times (default 3) over the SAME
// artifact and the per-entry median persists, so one verdict's
// variance cannot move the distribution the gate reads (116's
// finding: identical pixels re-rolled -20/-25 between passes).
//
// Run AFTER scripts/night111-run.ts reports 6/6 real Blender clips.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { scoreShotIdentity, scoreShotIdentityMedian } from "../src/lib/identity";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const TITLE = "Immortal Path";
const EMAIL = "director@studio.dev";
const PASSWORD = "anchored2026";
const FLOOR = 0.7;
const SAMPLES = Math.max(1, Math.min(7, Number(process.env.ANIMEOS_SCORE_SAMPLES ?? 3)));

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p10 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(0.1 * s.length) - 1);
  return s[idx];
};

async function main() {
  const project = await db.project.findFirst({ where: { title: TITLE } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const episode = await db.episode.findFirst({ where: { id: scene.episodeId } });
  if (!episode) throw new Error("episode missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  console.log(`re-scoring ${shots.length} shots of EP${String(episode.number).padStart(2, "0")} Sc${String(scene.number).padStart(2, "0")}`);

  const worsts: number[] = [];
  const refused: string[] = [];
  console.log(`samples per shot: ${SAMPLES} (the verdict is the per-entry median)`);
  for (const s of shots) {
    const res = SAMPLES > 1
      ? await scoreShotIdentityMedian(s.id, "RENDER", SAMPLES)
      : await scoreShotIdentity(s.id, "RENDER");
    if (res.ok) {
      const v = res.scored.verdict;
      worsts.push(v.worst);
      for (const e of v.entries) {
        const aspectLine = Object.entries(e.aspects ?? {})
          .map(([k, n]) => `${k} ${Math.round((n as number) * 100)}%`)
          .join(", ");
        console.log(`S00${s.number} ${e.characterName}: ${Math.round(e.similarity * 100)}% [${aspectLine}]`);
        console.log(`        note: ${e.note.slice(0, 170)}`);
      }
      console.log(`S00${s.number} SHOT WORST ${Math.round(v.worst * 100)}%`);
    } else {
      refused.push(`S00${s.number}: ${res.error}`);
      console.log(`S00${s.number}: REFUSED - ${res.error}`);
    }
  }

  console.log("\n── DISTRIBUTION ──");
  console.log(`scored ${worsts.length}, refused ${refused.length}`);
  console.log(`mean   ${Math.round(mean(worsts) * 100)}%`);
  console.log(`median ${Math.round(median(worsts) * 100)}%`);
  console.log(`p10    ${Math.round(p10(worsts) * 100)}%`);
  console.log(`floor  ${Math.round(FLOOR * 100)}%`);
  const under = worsts.filter((w) => w < FLOOR).length;
  const verdict = worsts.length === 0 || under > 0 ? "BELOW" : "CLEAR";
  console.log(`verdict: ${verdict} (${under}/${worsts.length} under the floor)`);
  for (const r of refused) console.log(`refused: ${r}`);

  // ── the REAL gate answers ─────────────────────────────────
  console.log("\n── PUBLISH ATTEMPT (the real gate) ──");
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const jar = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const res = await fetch(`${BASE}/api/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: jar },
    body: JSON.stringify({ episodeId: episode.id, platform: "YOUTUBE" }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`POST /api/publish -> ${res.status}`);
  console.log(JSON.stringify(body, null, 2).slice(0, 1200));
}

main()
  .catch((e) => { console.error("re-score failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
