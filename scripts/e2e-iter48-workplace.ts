// Iteration 48 E2E: the studio becomes a workplace.
// Proves, against the RUNNING studio and the REAL database:
//   A. the Comment model, the proxy allowlist, the evaluator gate and doctrine rule 25 exist in source
//   B. buildCompactContext carries the workplace line
//   C. the HTTP role matrix over real NextAuth cookie sessions:
//      unauth 401 / viewer reads 200 / viewer writes 403 EXCEPT comments 200 /
//      author-resolves-own 200 / viewer-cannot-resolve-others 403 /
//      promoted EDITOR resolves others 200 / gate flip OWNER-only 403 for EDITOR / OWNER arms the gate
//   D. the human gate end to end: a REVIEW job with real panel art is inspected by the real
//      DSH evaluator; an APPROVED verdict parks at "awaiting creator approval"; the owner's
//      REJECT lands the note in the shot's thread; the owner's APPROVE releases it to FINAL
// Run: bun scripts/e2e-iter48-workplace.ts
// Precondition: dev server on :3000, Immortal Path seeded, director@studio.dev (OWNER) and
// reader@studio.dev (VIEWER) present from iteration 45's roster.

import { db } from "../src/lib/db";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PROJECT_ID = "cmuhbro1n0000oh239eqktl0i";
const SHOT_ID = "cmuhbro2c001hoh23osva4ae5"; // Scene 12 Shot 3, real panel art
const OWNER = { email: "director@studio.dev", password: "anchored2026" };
const VIEWER = { email: "reader@studio.dev", password: "viewing123" };

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

// ── a tiny cookie jar + NextAuth credentials login (first in the repo) ──
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

async function call(jar: Jar | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter48" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter48" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter48", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  // the session must actually stick: an authed /api/comments read 200s
  const probe = await call(jar, `/api/comments?projectId=${PROJECT_ID}`);
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function main() {
  const startedAt = new Date();
  const createdCommentIds: string[] = [];
  let createdJobId: string | null = null;
  let shotStatusBefore = "DRAFT";
  const cleanup: string[] = [];

  // ───────────────────────── A. source-level checks ─────────────────────────
  console.log("\n== A. source-level checks ==");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("Comment model in schema with anchor index",
    schema.includes("model Comment {") && schema.includes("@@index([projectId, anchorType, anchorId])"));
  check("Project carries approvalGate", schema.includes("approvalGate     Boolean  @default(false)"));

  const proxy = readFileSync("src/proxy.ts", "utf8");
  check("proxy allowlists exactly /api/comments for VIEWER writes",
    proxy.includes('VIEWER_MUTABLE = new Set(["/api/comments"])') && proxy.includes("!VIEWER_MUTABLE.has(pathname)"));

  const evaluator = readFileSync("src/lib/dsh/evaluator.ts", "utf8");
  check("evaluator holds APPROVED renders at the human gate",
    evaluator.includes("gateHeld") && evaluator.includes("awaiting creator approval (human gate)"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("doctrine rule 25 teaches the workplace + the gate",
    prompts.includes("25. THE WORKPLACE IS HUMAN AT THE GATE"));

  const jobsRoute = readFileSync("src/app/api/render-jobs/route.ts", "utf8");
  check("approve/reject are DB-fresh EDITOR+ actions and reject requires a note",
    (jobsRoute.match(/requireRole\(req, "EDITOR"\)/g) ?? []).length >= 2 &&
    jobsRoute.includes("A rejection note is required"));

  const projectRoute = readFileSync("src/app/api/projects/[id]/route.ts", "utf8");
  check("gate flip is DB-fresh OWNER policy on the project PATCH",
    projectRoute.includes('requireRole(req, "OWNER")') && projectRoute.includes("data.approvalGate"));

  // ───────────────────────── B. DSH context line ─────────────────────────
  console.log("\n== B. DSH workplace context ==");
  const ctxModule = await import("../src/lib/dsh/tools");
  const ctx = await ctxModule.buildCompactContext(PROJECT_ID);
  check("buildCompactContext runs with the workplace field", Boolean(ctx) && "workplace" in (ctx as object));
  check("workplace line quiet with gate off and no threads",
    ctx?.workplace === null, `got ${JSON.stringify(ctx?.workplace)}`);

  // ───────────────────────── C. HTTP role matrix (real cookies) ─────────────────────────
  console.log("\n== C. HTTP role matrix ==");
  const anon = new Jar();
  const anonPost = await call(anon, "/api/comments", { method: "POST", body: JSON.stringify({ anchorType: "SHOT", anchorId: SHOT_ID, body: "sneak" }) });
  check("unauthenticated comment POST is 401", anonPost.status === 401, `got ${anonPost.status}`);
  const anonGet = await call(anon, `/api/comments?projectId=${PROJECT_ID}`);
  check("unauthenticated comment GET is 401", anonGet.status === 401, `got ${anonGet.status}`);

  const owner = await loginJar(OWNER.email, OWNER.password);
  const viewer = await loginJar(VIEWER.email, VIEWER.password);
  check("owner credentials login sticks", true);
  check("viewer credentials login sticks", true);

  const viewerRead = await call(viewer, `/api/render-jobs?projectId=${PROJECT_ID}`);
  check("viewer GET render queue is 200 (reads are reads)", viewerRead.status === 200, `got ${viewerRead.status}`);

  const viewerDirect = await call(viewer, "/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "approve", jobId: "fake" }) });
  check("viewer POST render-jobs is 403 (speak is not direct)", viewerDirect.status === 403, `got ${viewerDirect.status}`);

  const viewerComment = await (await call(viewer, "/api/comments", {
    method: "POST",
    body: JSON.stringify({ anchorType: "SHOT", anchorId: SHOT_ID, body: "Viewers can speak now: the blade glow here reads slightly dim against the sheet." }),
  })).json() as { id: string };
  createdCommentIds.push(viewerComment.id);
  check("viewer comment POST is 200 (the workplace exception)", Boolean(viewerComment.id));

  const badAnchor = await call(viewer, "/api/comments", { method: "POST", body: JSON.stringify({ anchorType: "SHOT", anchorId: "nope-does-not-exist", body: "x" }) });
  check("comment against an unknown anchor is 404 (the anchor row is the truth)", badAnchor.status === 404, `got ${badAnchor.status}`);

  const ownerComment = await (await call(owner, "/api/comments", {
    method: "POST",
    body: JSON.stringify({ anchorType: "SHOT", anchorId: SHOT_ID, body: "Noted. Keep the glow as designed; we re-grade in the pass, not in the panel." }),
  })).json() as { id: string };
  createdCommentIds.push(ownerComment.id);
  check("owner comment POST is 200", Boolean(ownerComment.id));

  const viewerResolvesOwn = await call(viewer, "/api/comments", { method: "PATCH", body: JSON.stringify({ id: viewerComment.id, action: "resolve" }) });
  check("viewer resolves their OWN thread (author rule)", viewerResolvesOwn.status === 200, `got ${viewerResolvesOwn.status}`);
  const viewerUnresolves = await call(viewer, "/api/comments", { method: "PATCH", body: JSON.stringify({ id: viewerComment.id, action: "unresolve" }) });
  check("viewer reopens their OWN thread", viewerUnresolves.status === 200, `got ${viewerUnresolves.status}`);
  const viewerResolvesOthers = await call(viewer, "/api/comments", { method: "PATCH", body: JSON.stringify({ id: ownerComment.id, action: "resolve" }) });
  check("viewer cannot resolve someone else's thread (403)", viewerResolvesOthers.status === 403, `got ${viewerResolvesOthers.status}`);

  // promote the viewer to EDITOR, re-login (JWT carries the claim), resolve as editor
  const promote = await call(owner, "/api/studio/members", { method: "PATCH", body: JSON.stringify({ userId: (await db.user.findUnique({ where: { email: VIEWER.email } }))!.id, role: "EDITOR" }) });
  check("owner promotes the viewer to EDITOR", promote.status === 200, `got ${promote.status}`);
  const editor = await loginJar(VIEWER.email, VIEWER.password);
  const editorResolves = await call(editor, "/api/comments", { method: "PATCH", body: JSON.stringify({ id: ownerComment.id, action: "resolve" }) });
  check("EDITOR resolves someone else's thread", editorResolves.status === 200, `got ${editorResolves.status}`);
  const editorUnresolves = await call(editor, "/api/comments", { method: "PATCH", body: JSON.stringify({ id: ownerComment.id, action: "unresolve" }) });
  check("EDITOR reopens it (state restored)", editorUnresolves.status === 200, `got ${editorUnresolves.status}`);
  const editorGateFlip = await call(editor, `/api/projects/${PROJECT_ID}`, { method: "PATCH", body: JSON.stringify({ approvalGate: true }) });
  check("EDITOR cannot flip the gate (403, OWNER policy)", editorGateFlip.status === 403, `got ${editorGateFlip.status}`);
  const demote = await call(owner, "/api/studio/members", { method: "PATCH", body: JSON.stringify({ userId: (await db.user.findUnique({ where: { email: VIEWER.email } }))!.id, role: "VIEWER" }) });
  check("owner restores the VIEWER role", demote.status === 200, `got ${demote.status}`);

  const ownerGateArm = await call(owner, `/api/projects/${PROJECT_ID}`, { method: "PATCH", body: JSON.stringify({ approvalGate: true }) });
  check("OWNER arms the human gate", ownerGateArm.status === 200, `got ${ownerGateArm.status}`);
  const armedProject = (await ownerGateArm.json()) as { id: string };
  check("gate flip responds with the project id (the next context line proves the state)", armedProject.id === PROJECT_ID, `got ${JSON.stringify(armedProject)}`);
  const ctxArmed = await ctxModule.buildCompactContext(PROJECT_ID);
  check("context workplace line reports the gate ARMED", Boolean(ctxArmed?.workplace?.includes("ARMED")), `got ${JSON.stringify(ctxArmed?.workplace)}`);

  // ───────────────────────── D. the gate end to end (real evaluator) ─────────────────────────
  console.log("\n== D. human gate end to end (real DSH inspection) ==");
  const shotBefore = await db.shot.findUniqueOrThrow({ where: { id: SHOT_ID }, select: { status: true } });
  shotStatusBefore = shotBefore.status;

  const job = await db.renderJob.create({
    data: {
      projectId: PROJECT_ID, shotId: SHOT_ID, mode: "PREVIEW", status: "REVIEW",
      progress: 100, stage: "Awaiting DSH inspection", attempt: 3, driver: "MOTION",
    },
  });
  createdJobId = job.id;
  cleanup.push(job.id);
  console.log(`  gate test job ${job.id} parked at REVIEW (attempt 3 biases the inspector forgiving)`);

  let gateHeld = false;
  let verdict = "UNKNOWN";
  for (let attempt = 1; attempt <= 3 && !gateHeld; attempt += 1) {
    await call(owner, `/api/render-jobs?projectId=${PROJECT_ID}`); // the tick claims + inspects
    const after = await db.renderJob.findUniqueOrThrow({ where: { id: job.id }, include: { evaluation: true, shot: true } });
    verdict = after.evaluation?.verdict ?? "NONE";
    if (verdict === "APPROVED" && after.status === "REVIEW" && after.stage.includes("human gate")) {
      gateHeld = true;
      check(`DSH APPROVED verdict parked at the gate (attempt ${attempt})`, true);
      check("gate-held job stage names the human gate", after.stage.includes("awaiting creator approval"), after.stage);
      check("gate-held job stays REVIEW (never auto-APPROVED)", after.status === "REVIEW");
      // the newest evaluation event for this job is the decisive one (an
      // earlier NEEDS_REVISION try leaves an older gateHeld:false event behind)
      const evRow = await db.productionEvent.findFirst({ where: { type: "EVALUATION", payload: { contains: job.id } }, orderBy: { createdAt: "desc" } });
      check("EVALUATION event records gateHeld", Boolean(evRow) && (evRow!.payload ?? "").includes('"gateHeld":true'));
    } else if (verdict === "NEEDS_REVISION" && attempt < 3) {
      console.log(`  inspection came back NEEDS_REVISION (attempt ${attempt}) - resetting for another honest try`);
      await db.evaluation.deleteMany({ where: { renderJobId: job.id } });
      await db.renderJob.update({ where: { id: job.id }, data: { status: "REVIEW", stage: "Awaiting DSH inspection" } });
    }
  }
  if (!gateHeld) {
    check("DSH APPROVED verdict parked at the gate", false, `verdict after tries: ${verdict}`);
  }

  const ctxHeld = await ctxModule.buildCompactContext(PROJECT_ID);
  check("context workplace line counts the held render",
    Boolean(ctxHeld?.workplace?.includes("awaiting creator approval")), `got ${JSON.stringify(ctxHeld?.workplace)}`);

  // the human REJECT half: the note must land in the shot's thread
  const rejectRes = await call(owner, "/api/render-jobs", {
    method: "POST",
    body: JSON.stringify({ action: "reject", jobId: job.id, note: "Camera too wide for the reveal: pull cameraDistance in and re-time the beat." }),
  });
  check("owner REJECT with note is 200", rejectRes.status === 200, `got ${rejectRes.status}`);
  const rejectedJob = await db.renderJob.findUniqueOrThrow({ where: { id: job.id } });
  check("rejected job lands in NEEDS_REVISION naming the requester", rejectedJob.status === "NEEDS_REVISION" && rejectedJob.stage.includes("Revision requested by"), rejectedJob.stage);
  const rejectComment = await db.comment.findFirst({ where: { anchorType: "SHOT", anchorId: SHOT_ID, body: { startsWith: "[Revision requested]" } }, orderBy: { createdAt: "desc" } });
  check("reject note landed in the shot's thread as a first-class comment", Boolean(rejectComment));
  if (rejectComment) createdCommentIds.push(rejectComment.id);
  const rejectNoNote = await call(owner, "/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "reject", jobId: job.id, note: "" }) });
  check("reject without a note is refused (400)", rejectNoNote.status === 400, `got ${rejectNoNote.status}`);

  // the human APPROVE half: the gate releases and the shot goes FINAL
  const approveRes = await call(owner, "/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "approve", jobId: job.id }) });
  check("owner APPROVE releases the render (200)", approveRes.status === 200, `got ${approveRes.status}`);
  const approvedJob = await db.renderJob.findUniqueOrThrow({ where: { id: job.id } });
  check("approved job is APPROVED naming the approver", approvedJob.status === "APPROVED" && approvedJob.stage.includes("Approved by"), approvedJob.stage);
  const shotAfter = await db.shot.findUniqueOrThrow({ where: { id: SHOT_ID }, select: { status: true } });
  check("approved shot is FINAL", shotAfter.status === "FINAL", shotAfter.status);
  const viewerApprove = await call(viewer, "/api/render-jobs", { method: "POST", body: JSON.stringify({ action: "approve", jobId: job.id }) });
  check("viewer approve stays 403 at the fine gate too", viewerApprove.status === 403, `got ${viewerApprove.status}`);

  const ctxThreads = await ctxModule.buildCompactContext(PROJECT_ID);
  check("context workplace line surfaces open threads while they exist",
    Boolean(ctxThreads?.workplace?.includes("unresolved thread")), `got ${JSON.stringify(ctxThreads?.workplace)}`);

  // ───────────────────────── cleanup (restore the studio exactly) ─────────────────────────
  console.log("\n== cleanup ==");
  await db.shot.update({ where: { id: SHOT_ID }, data: { status: shotStatusBefore } });
  console.log(`  shot restored to ${shotStatusBefore}`);
  await db.evaluation.deleteMany({ where: { renderJobId: job.id } });
  await db.renderJob.delete({ where: { id: job.id } }).catch(() => undefined);
  console.log("  gate test job + evaluation removed");
  const delComments = await db.comment.deleteMany({ where: { id: { in: createdCommentIds } } });
  console.log(`  ${delComments.count} test comment(s) removed`);
  const delEvents = await db.productionEvent.deleteMany({
    where: { projectId: PROJECT_ID, createdAt: { gte: startedAt }, type: { in: ["COMMENT", "STATE_CHANGE", "PROJECT", "EVALUATION"] } },
  });
  console.log(`  ${delEvents.count} test production event(s) removed`);
  await db.project.update({ where: { id: PROJECT_ID }, data: { approvalGate: false } });
  console.log("  approval gate released");
  const roster = await db.user.findUnique({ where: { email: VIEWER.email } });
  if (roster && roster.role !== "VIEWER") {
    await db.user.update({ where: { id: roster.id }, data: { role: "VIEWER" } });
    console.log("  viewer role restored");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error("E2E crashed:", e); process.exit(1); })
  .finally(() => db.$disconnect());
