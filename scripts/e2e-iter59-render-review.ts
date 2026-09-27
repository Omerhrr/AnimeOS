// Iteration 59 E2E: THE RENDER IS JUDGED - the learned assist layer
// (vision-guided render review). Proves, against the RUNNING studio,
// the REAL database and the REAL Blender runtime:
//   A. source: the RenderReview/RenderIssue models, the review lib
//      (local measurement + vision read against the directed intent,
//      provider-honest merge, one review per job), the evaluator
//      integration (pixel evidence into the inspection, issue findings
//      merged), the DSH tool (review_render, registry 75), the doctrine
//      (THE RENDER IS JUDGED + rule 37), the API/UI wiring
//   B. accounts + throwaway production
//   C. the local judge on synthetic frames: a dark frame raises
//      MAJOR EXPOSURE, a flat frame raises MAJOR CONTRAST, a gradient
//      frame judges clean, and the measurement is bit-exact across runs
//   D. honest refusals: a review with no clip refuses and says why
//   E. a REAL directed render: the pixel review runs on the finished
//      clip (metrics measured, intent carried, provider named, frame on
//      disk, issues persisted), the SAME review is reused on a second
//      call (the pixels did not change), the DSH inspection runs with
//      the review as evidence, the API rides the review to the card
//   F. the context line reports the pixel standing
//   G. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   H. cleanup (exact rows)
// Run: npx tsx scripts/e2e-iter59-render-review.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { measureFrame, judgeLocalFrame, reviewRenderJob } from "../src/lib/engine/render-review";
import { readFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter59-pixel-judge";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

class Jar {
  private m = new Map<string, string>();
  absorb(res: Response) {
    const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0) this.m.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  get header(): string {
    return Array.from(this.m.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function call(jar: Jar | null, p: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter59" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter59" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter59", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter59" },
    body: JSON.stringify({ email, name, password }),
  });
  if (res.status === 409) {
    const row = await db.user.findUnique({ where: { email } });
    if (!row) throw new Error(`register says 409 but ${email} is not in the db`);
    return { id: row.id, role: row.role };
  }
  if (!res.ok) throw new Error(`register failed for ${email}: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { user: { id: string; role: string } };
  return data.user;
}

function isMp4(p: string): boolean {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    return buf.subarray(4, 8).toString("ascii") === "ftyp" && fs.statSync(p).size > 1000;
  } catch {
    return false;
  }
}

async function main() {
  console.log("== Iteration 59: the render is judged - the learned assist layer ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A1 the RenderReview model exists (one review per job, provider named)", schema.includes("model RenderReview") && schema.includes("renderJobId String        @unique") && schema.includes("provider    String        @default(\"local\") // vision+local | vision | local"));
  check("A2 the RenderIssue model exists with the seven kinds", schema.includes("model RenderIssue") && schema.includes("// EXPOSURE | CONTRAST | READABILITY | PALETTE | INTENT | COMPOSITION | STAGE"));

  const lib = readFileSync("src/lib/engine/render-review.ts", "utf8");
  check("A3 the review lib exists (the learned assist layer, probed determinism language)", lib.includes("THE RENDER IS JUDGED (iteration 59 - the learned assist layer)") && lib.includes("the same bytes always land the same numbers"));
  check("A4 the local pass measures the frame (sharp decode, luminance, saturation, clipped fractions, histogram)", lib.includes("export async function measureFrame") && lib.includes("0.2126 * r + 0.7152 * g + 0.0722 * b") && lib.includes("darkFrac") && lib.includes("brightFrac") && lib.includes("histogram"));
  check("A5 the local judge scores exposure and contrast from measurements and cites its numbers", lib.includes("export function judgeLocalFrame") && lib.includes("the frame measures near-black (mean luminance") && lib.includes("the frame measures flat and washed (luminance spread"));
  check("A6 the vision pass reads the frame WITH the directed intent (grammar, fx, physics)", lib.includes("DIRECTED GRAMMAR: ${ctx.intent.grammar}") && lib.includes("DIRECTED FX: ${ctx.intent.fx.join(\", \")}") && lib.includes("DIRECTED PHYSICS: ${ctx.intent.physics.join(\", \")}"));
  check("A7 the merge is provider-honest and weighted over the criteria that ran", lib.includes("\"vision+local\" | \"vision\" | \"local\"") && lib.includes("function weightedOverall") && lib.includes("the vision pass did not answer; the verdict rests on the local measurements alone"));
  check("A8 one review per render job (the pixels do not change until a new attempt)", lib.includes("findUnique({ where: { renderJobId } })") && lib.includes("Reuses the existing review"));
  check("A9 the review is evidence, never a gate (the evaluator decides)", lib.includes("The pixel review is EVIDENCE, not a verdict: weigh it, then decide like a director."));

  const evaluator = readFileSync("src/lib/dsh/evaluator.ts", "utf8");
  check("A10 the inspection runs the pixel review before reasoning (and never blocks on it)", evaluator.includes("ensureRenderReview(job.id).catch(() => null)") && evaluator.includes("review that cannot run (no clip, no ffmpeg, no provider) never blocks"));
  check("A11 the pixel evidence rides the inspection prompt", evaluator.includes("const pixelSection = pixel && pixel.ok ? formatPixelEvidence(pixel.review) : null;") && evaluator.includes("${pixelSection ? `${pixelSection}\\n\\n` : \"\"}${PARAM_HINTS}"));
  check("A12 the review's MAJOR issues ride the inspection findings", evaluator.includes("pixel review (${pixel.review.provider})") && evaluator.includes("findings = [...pixelFindings, ...findings].slice(0, 8);"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A13 the registry stands at 80 tools (iter63 joined) (review_render judges the pixels)", toolCount === 80, `count=${toolCount}`);
  check("A14 review_render teaches the learned layer (local measure + vision read + honest provider)", tools.includes("JUDGE THE PIXELS") && tools.includes("vision+local | vision | local") && tools.includes("One review per render job"));
  check("A15 the tool refuses to review what does not exist", tools.includes("review what exists, not what is promised"));
  check("A16 the context carries the pixel standing", tools.includes("pixel: renderPixelContextLine(latestRenderReview)") && lib.includes("latest pixel review:"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A17 the curriculum grew THE RENDER IS JUDGED", prompts.includes("- THE RENDER IS JUDGED") && prompts.includes("A shot you never looked at is a shot you cannot promise."));
  check("A18 rule 37 teaches judging the pixels (evidence, not a gate)", prompts.includes("37. JUDGE THE PIXELS") && prompts.includes("an inspection that ignores a MAJOR EXPOSURE or an empty stage the review named is a director signing work they never saw"));

  const route = readFileSync("src/app/api/render-jobs/route.ts", "utf8");
  check("A19 the render queue rides the review to the card", route.includes("reviews: { orderBy: { createdAt: \"desc\" as const }, take: 1 }"));

  const apiClient = readFileSync("src/lib/api-client.ts", "utf8");
  check("A20 the client parses the verdict defensively", apiClient.includes("export function parseRenderVerdict") && apiClient.includes("corrupt verdict degrades to criteria-only"));

  const view = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A21 the render card shows the pixel review strip (state, overall, provider, issues, frame)", view.includes("Pixel review - passed") && view.includes("parseRenderVerdict(review.verdict)") && view.includes("the frame the review judged"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter59 Pixel Judge Lab ${MARK}`, logline: "a throwaway production for the pixel review proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway review lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the local judge on synthetic frames ─────────────────────
  const framesDir = path.join(process.cwd(), "tmp", "iter59-frames");
  mkdirSync(framesDir, { recursive: true });
  const darkFrame = path.join(framesDir, "dark.jpg");
  const flatFrame = path.join(framesDir, "flat.jpg");
  const gradFrame = path.join(framesDir, "grad.jpg");
  await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 6, g: 5, b: 8 } } }).jpeg().toFile(darkFrame);
  await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 120, g: 119, b: 121 } } }).jpeg().toFile(flatFrame);
  const gradSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0.12" stop-color="#20202a"/><stop offset="0.88" stop-color="#b0b0b8"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/></svg>`,
  );
  await sharp(gradSvg).jpeg().toFile(gradFrame);

  const darkM = await measureFrame(darkFrame);
  const darkJ = judgeLocalFrame(darkM);
  check("C1 the dark frame measures near-black and the judge raises MAJOR EXPOSURE", darkM.lumaMean < 0.14 && darkJ.issues.some((i) => i.severity === "MAJOR" && i.kind === "EXPOSURE"), JSON.stringify({ m: darkM.lumaMean, issues: darkJ.issues }));
  check("C2 the dark frame's exposure criterion scores low from the measurement", darkJ.criteria.exposure < 0.5, `exposure=${darkJ.criteria.exposure}`);
  const flatM = await measureFrame(flatFrame);
  const flatJ = judgeLocalFrame(flatM);
  check("C3 the flat frame measures washed and the judge raises MAJOR CONTRAST (its numbers cited)", flatM.lumaStd < 0.045 && flatJ.issues.some((i) => i.severity === "MAJOR" && i.kind === "CONTRAST") && flatJ.issues.some((i) => i.note.includes("luminance spread")), JSON.stringify({ std: flatM.lumaStd, issues: flatJ.issues }));
  const gradM = await measureFrame(gradFrame);
  const gradJ = judgeLocalFrame(gradM);
  check("C4 the gradient frame judges clean (no MAJOR issues, exposure and contrast score high)", gradJ.issues.every((i) => i.severity === "MINOR") && gradJ.criteria.exposure > 0.7 && gradJ.criteria.contrast > 0.7, JSON.stringify({ issues: gradJ.issues, c: gradJ.criteria }));
  const gradM2 = await measureFrame(gradFrame);
  check("C5 the measurement is bit-exact across runs (the seed law's spirit, for pixels)", JSON.stringify(gradM) === JSON.stringify(gradM2), JSON.stringify({ a: gradM.histogram.slice(0, 4), b: gradM2.histogram.slice(0, 4) }));
  rmSync(framesDir, { recursive: true, force: true });

  // ───────────────────── D. honest refusals ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Dailies" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "The judged clash", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Blade Saint Lin cuts the gate open as the storm breaks - the blade trails light", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "SLASH" });
  const noRender = await T("review_render", { sceneNumber: 1, shotNumber: 1 });
  check("D1 a review with no finished render refuses and says why", noRender.status === "ERROR" && noRender.result.includes("no finished render yet") && noRender.result.includes("review what exists, not what is promised"), noRender.result.slice(0, 190));
  const ghostJob = await T("review_render", { jobId: "no-such-job-id" });
  check("D2 an unknown explicit job refuses", ghostJob.status === "ERROR" && ghostJob.result.includes("No render job"), ghostJob.result.slice(0, 140));
  const ghostReview = await reviewRenderJob("no-such-job-id");
  check("D3 the lib refuses an unknown job honestly", !ghostReview.ok && ghostReview.error.includes("not found"), "ok" in ghostReview ? ghostReview.error.slice(0, 120) : "");

  // ───────────────────── E. the REAL directed render, judged ─────────────────────
  const lin = await T("create_character", { name: "E2E Blade Saint Lin", role: "PROTAGONIST", appearance: "a young sword cultivator in storm-grey layered robes with a topknot and a wind-torn sash, obsidian blade with a jade edge", personality: "stoic" });
  check("E0 the cast registers (the frame has a subject to read)", lin.status === "OK", lin.result.slice(0, 110));
  const gram = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: JSON.stringify([
    { move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.8, note: "push in as the storm gathers" },
    { move: "ORBIT", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "SLASH", note: "orbit as the blade clears" },
  ]) });
  check("E1 the lens is directed (the intent the review will judge against)", gram.status === "OK" && gram.result.includes("DOLLY_IN 0-50%"), gram.result.slice(0, 160));
  const fx = await T("set_shot_fx", { sceneNumber: 1, shotNumber: 1, fx: JSON.stringify([{ kind: "TRAIL", intensity: 0.85 }, { kind: "AURA", intensity: 0.5 }]) });
  check("E2 the spectacle is directed (the intent carries fx kinds)", fx.status === "OK" && fx.result.includes("TRAIL"), fx.result.slice(0, 160));

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  const shotRow = sceneRow ? await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 1 } }) : null;
  if (!sceneRow || !shotRow) throw new Error("scene/shot rows missing - cannot continue");
  console.log("   (real directed render follows - then the frame is judged)");
  const job = await createRenderJob(labId, shotRow.id, "PREVIEW");
  check("E3 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("E4 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("E5 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");

    const before = await db.renderReview.count({ where: { projectId: labId } });
    const res1 = await reviewRenderJob(job.id);
    if (!res1.ok) {
      check("E6 the pixel review runs on the finished clip", false, res1.error);
    } else {
      const v = res1.review.verdict;
      check("E6 the pixel review runs on the finished clip", Boolean(res1.review.id), res1.review.id);
      check("E7 the provider is named honestly (vision+local | vision | local)", ["vision+local", "vision", "local"].includes(res1.review.provider), res1.review.provider);
      check("E8 the frame was measured locally (metrics present, histogram 16 bins)", Boolean(v?.metrics) && (v?.metrics?.histogram.length ?? 0) === 16 && v!.metrics!.lumaMean >= 0 && v!.metrics!.lumaMean <= 1, JSON.stringify(v?.metrics));
      check("E9 the reviewed frame exists on disk (the poster the vision model saw)", Boolean(res1.review.framePath) && existsSync(path.join(process.cwd(), "public", res1.review.framePath ?? "/x")) && statSync(path.join(process.cwd(), "public", res1.review.framePath ?? "/x")).size > 500, res1.review.framePath ?? "none");
      check("E10 the intent was carried into the review (the grammar and fx the shot was directed with)", Boolean(v?.intent?.grammar) && (v?.intent?.grammar ?? "").includes("DOLLY_IN") && (v?.intent?.fx ?? []).some((k) => k.startsWith("TRAIL")), JSON.stringify(v?.intent));
      check("E11 the overall is a lawful 0..1 and the state is honest", res1.review.overall !== null && res1.review.overall >= 0 && res1.review.overall <= 1 && ["PASSED", "NEEDS_WORK"].includes(res1.review.state), `${res1.review.overall} ${res1.review.state}`);
      check("E12 the criteria carry both layers (exposure measured, vision's perceptual set when it answered)", typeof v?.criteria.exposure === "number" && typeof v?.criteria.contrast === "number" && (res1.review.provider === "local" || ["readability", "palette", "intent", "composition"].every((k) => typeof v?.criteria[k] === "number")), JSON.stringify(v?.criteria));
      check("E13 the issues persisted under the review row", (await db.renderIssue.count({ where: { renderJobId: job.id } })) === (await db.renderIssue.count({ where: { reviewId: res1.review.id } })), "issue rows vs reviewId");
      check("E14 the pixel review event landed", (await db.productionEvent.count({ where: { projectId: labId, summary: { contains: "Pixel review" } } })) >= 1, "event count");

      const res2 = await reviewRenderJob(job.id);
      check("E15 the second call reuses the SAME review (the pixels did not change)", res2.ok && res2.review.id === res1.review.id, `${res2.ok ? res2.review.id : res2.error} vs ${res1.review.id}`);
      const after = await db.renderReview.count({ where: { projectId: labId } });
      check("E16 no duplicate review rows (one per render job)", before === 0 && after === 1, `before=${before} after=${after}`);

      // The DSH inspection runs THROUGH the pixel evidence: claim the job
      // the way the queue does and let the evaluator weigh the review.
      await db.renderJob.update({ where: { id: job.id }, data: { status: "INSPECTING" } });
      const evalRoute = await import("../src/lib/dsh/evaluator");
      await evalRoute.runRenderEvaluation(job.id);
      const inspected = await db.renderJob.findUnique({ where: { id: job.id } });
      const evaluation = await db.evaluation.findUnique({ where: { renderJobId: job.id } });
      check("E17 the inspection completed with the review as evidence", Boolean(evaluation) && inspected?.status !== "INSPECTING", `status=${inspected?.status}`);
      check("E18 the inspection findings ride the pixel issues when the review raised MAJORs", !res1.review.verdict || res1.review.verdict.issues.every((i) => i.severity === "MINOR") || (JSON.parse(evaluation?.findings ?? "[]") as Array<{ note?: string }>).some((f) => (f.note ?? "").includes("pixel review")), "findings merged");
    }

    // The API rides the review to the card.
    const queueRes = await call(ownerJar, `/api/render-jobs?projectId=${labId}`);
    const queue = queueRes.status === 200 ? ((await queueRes.json()) as Array<{ id: string; reviews?: Array<{ renderJobId?: string }> }>) : [];
    const cardJob = queue.find((j) => j.id === job.id);
    check("E19 the render queue API carries the review to the card", queueRes.status === 200 && Boolean(cardJob) && Array.isArray(cardJob?.reviews) && (cardJob?.reviews?.length ?? 0) >= 1, `status=${queueRes.status} reviews=${cardJob?.reviews?.length ?? "none"}`);
  }

  // ───────────────────── F. the context line ─────────────────────
  const ctx = await buildCompactContext(labId);
  const pixelLine = (ctx as { pixel?: string | null })?.pixel ?? "";
  check("F1 the context pixel line reports the standing", pixelLine.includes("latest pixel review:") && pixelLine.includes("Sc1 Sh001"), pixelLine.slice(0, 220));

  // ───────────────────── G. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/render-jobs?projectId=whatever");
  check("G1 anonymous queue reads are 401", anon.status === 401);
  const strangerEmail = `stranger59-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger59", "stranger-pass-59");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-59");
  const strangerPost = await call(strangerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "judge the pixels" }) });
  check("G2 a non-member cannot direct the studio (403)", strangerPost.status === 403);
  const ownerGet = await call(ownerJar, `/api/render-jobs?projectId=${labId}`);
  check("G3 the OWNER reads the render standing anywhere (bypass intact)", ownerGet.status === 200);

  // ───────────────────── H. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  await db.user.delete({ where: { id: stranger.id } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverReviews = await db.renderReview.count({ where: { projectId: labId } });
  const leftoverFrames = existsSync(path.join(process.cwd(), "tmp", "iter59-frames"));
  check("H1 every throwaway row is gone (cascade holds, frames swept)", !leftover && leftoverReviews === 0 && !leftoverFrames);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("E2E crashed:", e);
    process.exit(1);
  });
