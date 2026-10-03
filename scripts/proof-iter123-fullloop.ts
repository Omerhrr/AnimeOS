// THE 123 FULL-LOOP PROOF: the real studio API re-renders the S006
// paired WIDE (both cast members ride) through the warm pool at the
// new laws, waits for the clip, reads the face boxes off the job
// file, builds the REAL face-crop strip through identity.ts, and runs
// ONE real vision re-score of the shot. The pixels and the verdict
// land in the log for the eye to read.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const EMAIL = "director@studio.dev";
const PASSWORD = "anchored2026";
const db = new PrismaClient();
const ROOT = process.cwd();

async function main() {
  const project = await db.project.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const scene = await db.scene.findFirstOrThrow({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: [{ episode: { number: "asc" } }, { number: "asc" }],
  });
  const shot = await db.shot.findFirstOrThrow({ where: { sceneId: scene.id, id: "cmus75ven001npwkrawiqn7lq" } });
  console.log("[proof] shot", shot.id.slice(-8), shot.shotType, "-", shot.description.slice(0, 80));

  // mint the session (the studio's own door)
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const jar = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  console.log("[proof] session minted");

  // submit the render (the studio builds the payload from the rows)
  const res = await fetch(`${BASE}/api/render-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: jar },
    body: JSON.stringify({ shotId: shot.id, mode: "PREVIEW" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`submit failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const jobId = (body as { job?: { id?: string }; id?: string }).job?.id ?? (body as { id?: string }).id;
  console.log("[proof] render job submitted:", jobId);

  // wait for the clip (40 min cap)
  const t0 = Date.now();
  let done: { status: string; outputUrl: string | null; stage: string } | null = null;
  while (Date.now() - t0 < 40 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 15000));
    // drive the tick exactly like the UI: GET ticks jobs + hands
    // finished renders over (the night111 law)
    await fetch(`${BASE}/api/render-jobs?projectId=${project.id}`, { headers: { cookie: jar } }).catch(() => null);
    const j = await db.renderJob.findUniqueOrThrow({ where: { id: jobId! } });
    console.log(`[proof] ${Math.round((Date.now() - t0) / 1000)}s stage=${j.stage} status=${j.status}`);
    if (["REVIEW", "APPROVED", "NEEDS_REVISION", "FAILED"].includes(j.status)) {
      done = { status: j.status, outputUrl: j.outputUrl, stage: j.stage };
      break;
    }
  }
  if (!done || !done.outputUrl || done.status === "FAILED") throw new Error(`render did not land: ${JSON.stringify(done)}`);
  console.log("[proof] CLIP LANDED:", done.outputUrl, "status", done.status);

  // the face boxes off the job file
  const jobFile = path.join(ROOT, "public", "renders", `.job-${jobId}.json`);
  const state = JSON.parse(fs.readFileSync(jobFile, "utf8"));
  const fb = state?.state?.render?.faceBoxes;
  console.log("[proof] faceBoxes:", JSON.stringify(fb));

  // the REAL face-crop strip through identity.ts
  const { readRenderFaceBoxes, extractFaceCropStrip } = await import("../src/lib/identity");
  const boxes = readRenderFaceBoxes(jobId!);
  console.log("[proof] parsed boxes:", JSON.stringify(boxes));
  if (boxes) {
    const stamps = [0.22, 0.4, 0.62].map((f) => Math.round(Number(state?.state?.render?.faceBoxes?.marks?.[fb ? undefined : undefined]) * 100) / 100);
    void stamps;
    const { probeMedia, ffmpegPath } = await import("../src/lib/bridge/motion");
    void probeMedia; void ffmpegPath;
    const postersDir = path.join(ROOT, "public", "renders", "posters");
    const framePaths = [0, 1, 2].map((i) => path.join(postersDir, `${jobId}.strip${i}.jpg`)).filter((p) => fs.existsSync(p));
    // the strip frames may not exist yet (identity builds them at score
    // time) - extract them at the marks with ffmpeg
    const ff = "ffmpeg";
    const clipAbs = path.join(ROOT, "public", done!.outputUrl!.split("?")[0].replace(/^\//, ""));
    const marks: number[] = boxes.marks;
    for (let i = 0; i < marks.length; i++) {
      const out = path.join(postersDir, `${jobId}.strip${i}.jpg`);
      const r = (await import("node:child_process")).spawnSync(ff, ["-y", "-ss", marks[i].toFixed(2), "-i", clipAbs, "-frames:v", "1", "-q:v", "3", out], { stdio: "ignore" });
      if (r.status === 0 && fs.existsSync(out)) framePaths[i] = out;
    }
    const strip = await extractFaceCropStrip(jobId!, boxes, framePaths);
    console.log("[proof] face strip:", strip ? `${strip.dataUrl.length} bytes, members ${strip.members.join(", ")}` : "NULL");
    if (strip) {
      const b64 = strip.dataUrl.split(",")[1];
      const out = path.join("/home/z/my-project/inspect", "iter123-facestrip.jpg");
      fs.writeFileSync(out, Buffer.from(b64, "base64"));
      console.log("[proof] strip written for the eye:", out);
      // the full strip frame too, for scale comparison
      fs.copyFileSync(framePaths[0], path.join("/home/z/my-project/inspect", "iter123-fullframe.jpg"));
    }
  }

  // ONE real vision re-score of the finished clip (the judge sees the face)
  const { scoreRenderIdentity } = await import("../src/lib/identity");
  const scored = await scoreRenderIdentity(shot.id);
  if (scored.ok) {
    const row = scored.scored;
    console.log("[proof] RE-SCORE worst", row.worst);
    for (const e of (row.scores as unknown as Array<{ characterName: string; similarity: number; aspects: Record<string, number>; note?: string }>)) {
      console.log("[proof] char", e.characterName, "sim", e.similarity, "aspects", JSON.stringify(e.aspects));
      console.log("[proof]   note:", (e.note ?? "").slice(0, 300));
    }
  } else {
    console.log("[proof] re-score refused:", scored.error);
  }
  console.log("[proof] DONE");
}

main()
  .catch((e) => { console.error("[proof] FAILED:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => db.$disconnect());
