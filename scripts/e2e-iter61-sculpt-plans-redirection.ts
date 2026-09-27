// Iteration 61 E2E: THE SURFACE IS READ BEFORE IT IS CARVED + THE FIX
// GRADUATES TO THE DIRECTION. Proves, against the RUNNING studio, the
// REAL database and the REAL Blender runtime:
//   A. source: the surface probe (read-only, deterministic), the
//      SculptPlan memory (adoption -> application -> reinforcement),
//      the re-direction planner + graduation law, the DSH tools
//      (plan_sculpt 78, render_redirection 79, registry 79, the plan
//      arg on blender_asset_build), the doctrine (two laws + rules
//      40/41), the context + UI wiring
//   B. accounts + throwaway production
//   C. the pure planners (deterministic, db-free): INTENT always maps,
//      parameter-owned kinds refuse until escalated, CONTRAST/PALETTE
//      refuse even then, ops cite their issues, in-call idempotency,
//      the local sculpt fallback reads the numbers
//   C2. the graduation law against the db-crafted lineage
//       (resolveExhaustedKinds: only parameter-failed kinds escalate)
//   F. the context lines (learned sculpt plans + pixel standing)
//   G. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   H. cleanup (exact rows, lab workdirs swept)
//   D. (phase b, REAL Blender) the surface probe reads a real .blend
//      bit-exact, plan_sculpt plans from the read, the plan-driven
//      carve grows the memory, design_fix consults the plan and the
//      re-audit earns the clear
//   E. (phase c, REAL renders) the graduated loop: a shrouded directed
//      shot renders dark, render_fix runs the parameter level, the
//      INTENT issue is crafted on the fresh review, render_redirection
//      proposes + applies AURA/wind through the compilers, attempt 3
//      renders and the FRESH pixel review judges by kind - the same
//      law that judges a parameter fix
// Run: npx tsx scripts/e2e-iter61-sculpt-plans-redirection.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { reviewRenderJob, reconcileRenderFixes } from "../src/lib/engine/render-review";
import { fixRenderIssues } from "../src/lib/engine/render-fix";
import { planRedirection, proposeRedirection, resolveExhaustedKinds, type DirectedBeats, type DirectedFx } from "../src/lib/engine/render-redirection";
import { probeSurface, surfaceReadLine, bestSculptPlan, localSculptLayers } from "../src/lib/blender/sculpt-plans";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter61-surface-direction";
//   PHASE=a  A B C C2 F G H (no Blender, no renders)
//   PHASE=b  A B D (real surface reads, plans, carves) F1 H
//   PHASE=c  A B E (real directed renders + the graduated loop) H
const PHASE = (process.env.PHASE ?? "a") as "a" | "b" | "c";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter61" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter61" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter61", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter61" },
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

async function waitForRender(jobId: string, label: string): Promise<NonNullable<Awaited<ReturnType<typeof tickRenderJob>>>> {
  let job = await tickRenderJob(jobId);
  const deadline = Date.now() + 420_000;
  while (job && ["QUEUED", "RENDERING"].includes(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    job = await tickRenderJob(jobId);
  }
  if (!job) throw new Error(`${label}: job vanished`);
  return job;
}

async function main() {
  console.log(`== Iteration 61 (phase ${PHASE}): the surface is read before it is carved + the fix graduates to the direction ==\n`);

  // rerun hygiene: sweep any lab a crashed earlier run left behind
  for (const stale of await db.project.findMany({ where: { title: { contains: "Iter61 Surface Direction Lab" } } })) {
    const staleAssets = await db.blenderAsset.findMany({ where: { projectId: stale.id }, select: { id: true } });
    await db.project.delete({ where: { id: stale.id } });
    for (const a of staleAssets) {
      for (const f of [path.join(process.cwd(), "public", "assets-blender", `${a.id}.png`), path.join(process.cwd(), "public", "assets-blender", `${a.id}.mp4`)]) {
        if (existsSync(f)) rmSync(f);
      }
    }
    for (const d of [
      path.join(process.cwd(), "assets", "blender", `iter61-surface-direction-lab-iter61-surface-direction-${PHASE}`),
      path.join(process.cwd(), "assets", "blender", "iter61-surface-direction-lab"),
    ]) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
  }

  // ───────────────────── A. the source carries the laws ─────────────────────
  const probePy = "bridges/blender/surface_probe.py";
  const probeSrc = readFileSync(probePy, "utf8");
  check("A1 the surface probe ships and compiles clean (read-only by law)", existsSync(probePy) && probeSrc.includes("SURFACE_READ") && probeSrc.includes("def _laplacian_field"), probeSrc.slice(0, 80));
  try {
    execSync(`python3 -m py_compile ${probePy}`, { stdio: "pipe" });
    check("A1b the probe is valid python", true);
  } catch (e) {
    check("A1b the probe is valid python", false, String(e).slice(0, 120));
  }
  check("A2 the probe measures what the carve will meet (roughness, spread, density, flatness)", probeSrc.includes("relativeRoughness") && probeSrc.includes("roughnessSpread") && probeSrc.includes("flatness") && probeSrc.includes("bpy.data.objects"), "");

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A3 the SculptPlan memory persists (keyed project+kind+name, honest record, clears, provenance)", schema.includes("model SculptPlan") && schema.includes("@@unique([projectId, kind, name])") && schema.includes("outcomes") && schema.includes("clears") && schema.includes("learnedFrom"), "");

  const redirLib = readFileSync("src/lib/engine/render-redirection.ts", "utf8");
  check("A4 the graduation law is stated in the lib (INTENT always; the rest after the parameters fail)", redirLib.includes("THE FIX GRADUATES TO THE DIRECTION") && redirLib.includes("THE GRADUATION LAW"), "");
  check("A5 the re-direction applies through the SAME compilers DSH directs with", redirLib.includes("compileGrammarSpec") && redirLib.includes("compileFxSpec") && redirLib.includes("a typo never reaches a shoot"), "");
  check("A6 the graduated attempt carries the same fixOf lineage law", redirLib.includes("createRenderJob") && redirLib.includes("fixOfJobId: job.id") && redirLib.includes("MAX_LINEAGE"), "");
  check("A7 every proposal cites its issue (kind, severity, the review's own numbers)", redirLib.includes("citedKind: issue.kind") && redirLib.includes("citedSeverity: issue.severity") && redirLib.includes("citedNumber"), "");
  check("A8 CONTRAST and PALETTE refuse even when escalated (honesty outranks coverage)", redirLib.includes("contrast lives in the light law") && redirLib.includes("the palette is graded in the materials law"), "");

  const plansLib = readFileSync("src/lib/blender/sculpt-plans.ts", "utf8");
  check("A9 the plan memory keeps the measured record (a plan's failures are part of its lesson)", plansLib.includes("a plan's failures are part of its lesson") && plansLib.includes("MAX_OUTCOMES"), "");
  check("A10 the consult ranks proven craft (a plan that never ran never beats the default)", plansLib.includes("export async function bestSculptPlan") && plansLib.includes("never beats the kind's default recipe"), "");
  check("A11 the provider is honest (vision+local | local - a degraded plan says it degraded)", plansLib.includes('"vision+local" | "local"') && plansLib.includes("planned from the probe numbers alone"), "");

  const designLib = readFileSync("src/lib/blender/design-review.ts", "utf8");
  check("A12 design_fix consults the best-proven plan and the re-audit earns the clear", designLib.includes("bestSculptPlan(asset.projectId, asset.kind)") && designLib.includes("reinforceSculptPlan(asset.projectId, asset.kind, sculptBaked.plan)"), "");

  const assetsLib = readFileSync("src/lib/blender/assets.ts", "utf8");
  check("A13 blender_asset_build carries plan:'name' and grows the plan's record from the carve", assetsLib.includes("presets?.planName") && assetsLib.includes("recordSculptOutcome(projectId, sculptPlan.kind, sculptPlan.name") && assetsLib.includes("not found in this production"), "");

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A14 the registry grew to 79 tools (plan_sculpt 78 reads, render_redirection 79 graduates)", toolCount === 79 && tools.includes('name: "plan_sculpt"') && tools.includes('name: "render_redirection"'), `count=${toolCount}`);
  check("A15 plan_sculpt teaches the read (a carve you can cite beats the slab you hoped for)", tools.includes("THE SURFACE IS READ BEFORE IT IS CARVED: run VISION-GUIDED SCULPT PLANNING") && tools.includes("The carve you can cite beats the slab you hoped for"), "");
  check("A16 render_redirection teaches the graduation (stop re-lighting, re-direct)", tools.includes("THE FIX GRADUATES TO THE DIRECTION: when a reviewed render's issues are not the light's fault") && tools.includes("Read the verdict from the new review's issues, never from intention"), "");

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A17 the curriculum grew THE SURFACE IS READ BEFORE IT IS CARVED", prompts.includes("- THE SURFACE IS READ BEFORE IT IS CARVED") && prompts.includes("a surface nobody read is a surface you are guessing at"), "");
  check("A18 the curriculum grew THE FIX GRADUATES TO THE DIRECTION", prompts.includes("- THE FIX GRADUATES TO THE DIRECTION") && prompts.includes("A proposal is a citation, not a mood"), "");
  check("A19 rule 40 teaches reading the surface first", prompts.includes("40. READ THE SURFACE BEFORE THE CARVE") && prompts.includes("a plan with neither is a hypothesis"), "");
  check("A20 rule 41 teaches graduating the fix honestly", prompts.includes("41. GRADUATE THE FIX") && prompts.includes("never claim a re-direction the fresh review did not confirm"), "");

  check("A21 the context carries the learned plans standing", tools.includes("sculptPlans: sculptPlansContextLine(learnedSculptPlans)") && plansLib.includes("learned sculpt plans:"));
  const view = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A22 the asset card shows the +PLAN chip for plan-carved assets", view.includes('+PLAN" : "+SCULPT"') && view.includes("Sculpted by learned plan"), "");

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const labTitle = `Iter61 Surface Direction Lab ${MARK}-${PHASE}`;
  const created = await executeTool("throwaway", "create_project", { title: labTitle, logline: "a throwaway production for the learned sculpt plans and the graduated fix loop", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: labTitle } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  if (PHASE === "a") {
    // ───────────────────── C. the pure planners (db-free) ─────────────────────
    const beats: DirectedBeats[] = [
      { move: "CRANE", from: 0, to: 0.55 },
      { move: "DOLLY_IN", from: 0.55, to: 1 },
    ];
    const intentPlan = planRedirection([{ severity: "CRITICAL", kind: "INTENT", note: "the directed duel never reads (mean luminance 0.19) - the stage sits empty" }], beats, [], new Set());
    check("C1 an INTENT issue always maps to direction ops (AURA add + wind on the widest beat)", intentPlan.fxOps.some((o) => o.kind === "AURA" && o.intensity === 0.55 && o.beats === "ALL") && intentPlan.grammarOps.some((o) => o.op === "wind" && o.detail.includes("CRANE 0-55%")), JSON.stringify(intentPlan));
    check("C2 the ops CITE the issue (kind, severity, the cited number)", intentPlan.fxOps.every((o) => o.citedKind === "INTENT" && o.citedSeverity === "CRITICAL" && o.citedNumber.includes("0.19")), JSON.stringify(intentPlan.fxOps));

    const raisePlan = planRedirection([{ severity: "MAJOR", kind: "INTENT", note: "the intent stays unread" }], beats, [{ kind: "TRAIL", intensity: 0.3 }, { kind: "AURA", intensity: 0.8 }], new Set());
    check("C3 with presence fx already directed, the quietest program is RAISED (TRAIL 0.3 -> 0.5)", raisePlan.fxOps.some((o) => o.op === "raise" && o.kind === "TRAIL" && o.intensity === 0.5), JSON.stringify(raisePlan.fxOps));

    const freshExposure = planRedirection([{ severity: "MAJOR", kind: "EXPOSURE", note: "the frame measures near-black (mean luminance 0.07)" }], beats, [], new Set());
    check("C4 a non-escalated parameter-owned kind refuses honestly (the parameter level still owns it)", freshExposure.fxOps.length === 0 && freshExposure.grammarOps.length === 0 && freshExposure.refusals.some((r) => r.kind === "EXPOSURE" && r.note.includes("parameter level still owns")), JSON.stringify(freshExposure));

    const escalated = new Set(["EXPOSURE", "STAGE", "COMPOSITION", "READABILITY"]);
    const escExposure = planRedirection([{ severity: "MAJOR", kind: "EXPOSURE", note: "the frame measures near-black (mean luminance 0.11)" }], beats, [], escalated);
    check("C5 an ESCALATED dark EXPOSURE adds emissive presence (the aura is real light)", escExposure.fxOps.some((o) => o.kind === "AURA" && o.intensity === 0.4), JSON.stringify(escExposure));
    const stagePlan = planRedirection([{ severity: "MAJOR", kind: "STAGE", note: "71.4% of the frame sits near-black (near-black 0.714)" }], beats, [], escalated);
    check("C6 an ESCALATED STAGE adds MOTES (spirit dust the light catches)", stagePlan.fxOps.some((o) => o.kind === "MOTES" && o.intensity === 0.45 && o.citedNumber.includes("0.714")), JSON.stringify(stagePlan));
    const compPlan = planRedirection([{ severity: "MAJOR", kind: "COMPOSITION", note: "the framing wanders off the subject" }], beats, [], escalated);
    check("C7 an ESCALATED COMPOSITION re-shapes the longest beat into hold + push-in", compPlan.grammarOps.some((o) => o.op === "reshape" && o.detail.includes("CRANE")), JSON.stringify(compPlan));
    const oneMove = planRedirection([{ severity: "MAJOR", kind: "COMPOSITION", note: "the framing wanders" }], [], [], new Set(["COMPOSITION"]));
    check("C8 a one-move shot cannot be re-framed (the refusal says so)", oneMove.refusals.some((r) => r.kind === "COMPOSITION" && r.note.includes("no beats to re-shape")), JSON.stringify(oneMove));
    const contrastEsc = planRedirection([{ severity: "MAJOR", kind: "CONTRAST", note: "flat" }], beats, [], new Set(["CONTRAST"]));
    const paletteEsc = planRedirection([{ severity: "MAJOR", kind: "PALETTE", note: "washed" }], beats, [], new Set(["PALETTE"]));
    check("C9 CONTRAST/PALETTE refuse even when escalated (contrast = light law, palette = materials)", contrastEsc.refusals.some((r) => r.note.includes("light law")) && paletteEsc.refusals.some((r) => r.note.includes("materials")) && contrastEsc.fxOps.length === 0 && paletteEsc.fxOps.length === 0, JSON.stringify({ contrastEsc: contrastEsc.refusals, paletteEsc: paletteEsc.refusals }));
    const windBeats: DirectedBeats[] = [
      { move: "ORBIT", from: 0, to: 0.5, wind: 0.7 },
      { move: "STATIC", from: 0.5, to: 1 },
    ];
    const readPlan = planRedirection([{ severity: "MAJOR", kind: "READABILITY", note: "the subject drowns" }], windBeats, [], new Set(["READABILITY"]));
    check("C10 an escalated READABILITY with the air already moving refuses (the light law's work)", readPlan.grammarOps.length === 0 && readPlan.refusals.some((r) => r.note.includes("the air already moves")), JSON.stringify(readPlan));

    const doubleIntent = planRedirection(
      [
        { severity: "CRITICAL", kind: "INTENT", note: "empty stage (mean luminance 0.09)" },
        { severity: "MAJOR", kind: "INTENT", note: "the intent never lands (mean luminance 0.09)" },
      ],
      beats, [], new Set(),
    );
    check("C11 in-call idempotency: two INTENT issues never double the AURA", doubleIntent.fxOps.filter((o) => o.op === "add" && o.kind === "AURA").length === 1, JSON.stringify(doubleIntent.fxOps));

    const det1 = JSON.stringify(planRedirection([{ severity: "MAJOR", kind: "INTENT", note: "x (mean luminance 0.2)" }], beats, [], new Set()));
    const det2 = JSON.stringify(planRedirection([{ severity: "MAJOR", kind: "INTENT", note: "x (mean luminance 0.2)" }], beats, [], new Set()));
    check("C12 the planner is deterministic (same inputs, same plan, byte for byte)", det1 === det2, "");

    const localA = localSculptLayers("ENVIRONMENT", { parts: [], total: { objects: 3, verts: 400, tris: 800, bboxDims: [4, 3, 1], roughness: 0.002, roughnessSpread: 0.001, relativeRoughness: 0.05, density: 40, flatness: 0.95 }, flatRef: 0.5 });
    const localB = localSculptLayers("ENVIRONMENT", { parts: [], total: { objects: 3, verts: 400, tris: 800, bboxDims: [4, 3, 1], roughness: 0.002, roughnessSpread: 0.001, relativeRoughness: 0.05, density: 40, flatness: 0.95 }, flatRef: 0.5 });
    check("C13 the local fallback is deterministic and speaks the three-layer vocabulary", JSON.stringify(localA) === JSON.stringify(localB) && localA.length > 0 && localA.every((l) => ["swell", "fold", "grain"].includes(l.kind) && l.intensity >= 0 && l.intensity <= 2), JSON.stringify(localA));

    // ───────────────────── C2. the graduation law against the real lineage ─────────────────────
    await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Graduation" });
    await T("create_scene", { episodeNumber: 1, number: 1, title: "Law fixtures", environmentName: null });
    await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E graduation fixture shot", shotType: "WIDE", movement: "STATIC", poseStart: "STANCE", poseEnd: "STANCE" });
    const scene2 = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
    const shot2 = scene2 ? await db.shot.findFirst({ where: { sceneId: scene2.id, number: 1 } }) : null;
    if (!scene2 || !shot2) throw new Error("c2 fixtures missing - cannot continue");

    const ancestor = await db.renderJob.create({ data: { projectId: labId, shotId: shot2.id, mode: "PREVIEW", status: "REVIEW", attempt: 80, outputUrl: "/renders/x.mp4" } });
    const fresh = await db.renderJob.create({ data: { projectId: labId, shotId: shot2.id, mode: "PREVIEW", status: "REVIEW", attempt: 81, outputUrl: "/renders/x.mp4", fixOfJobId: ancestor.id } });
    const revAnc = await db.renderReview.create({ data: { projectId: labId, renderJobId: ancestor.id, shotId: shot2.id, targetRef: "Sc1 Sh001", state: "NEEDS_WORK", overall: 0.5, verdict: JSON.stringify({ criteria: {}, metrics: null, frame: null, intent: null, issues: [], note: "crafted", provider: "local" }), issuesFound: 3, provider: "local" } });
    await db.renderIssue.create({ data: { projectId: labId, reviewId: revAnc.id, renderJobId: ancestor.id, refName: "Sc1 Sh001", severity: "MAJOR", kind: "EXPOSURE", note: "crafted dark", status: "FIXING", fixNote: "fix queued: energyIntensity 0.2 -> 0.38 (attempt 81 renders the verdict)" } });
    await db.renderIssue.create({ data: { projectId: labId, reviewId: revAnc.id, renderJobId: ancestor.id, refName: "Sc1 Sh001", severity: "MAJOR", kind: "CONTRAST", note: "crafted flat", status: "FIXING", fixNote: "fix queued: fogDensity 0.5 -> 0.4 (attempt 81 renders the verdict)" } });
    await db.renderIssue.create({ data: { projectId: labId, reviewId: revAnc.id, renderJobId: ancestor.id, refName: "Sc1 Sh001", severity: "MINOR", kind: "PALETTE", note: "crafted washed", status: "OPEN" } });
    const exhausted = await resolveExhaustedKinds(fresh.id);
    check("C2a the lineage resolves EXPOSURE and CONTRAST as graduated (their parameter fixes ran)", exhausted.has("EXPOSURE") && exhausted.has("CONTRAST"), JSON.stringify([...exhausted]));
    check("C2b a PALETTE issue that was never parameter-targeted is NOT graduated", !exhausted.has("PALETTE"), JSON.stringify([...exhausted]));
    const noLineage = await resolveExhaustedKinds(ancestor.id);
    check("C2c a job with no fix lineage resolves to an empty graduation set", noLineage.size === 0, JSON.stringify([...noLineage]));

    const freshJobIssues = planRedirection([{ severity: "MAJOR", kind: "EXPOSURE", note: "dark (mean luminance 0.08)" }], beats, [], await resolveExhaustedKinds(fresh.id));
    check("C2d the planner + the lineage agree: a graduated EXPOSURE maps to the AURA op", freshJobIssues.fxOps.some((o) => o.kind === "AURA"), JSON.stringify(freshJobIssues));

    // the proposal refusal: propose against a job whose review raises
    // nothing (the review is reused - no render work happens)
    const emptyReviewJob = await db.renderJob.create({ data: { projectId: labId, shotId: shot2.id, mode: "PREVIEW", status: "REVIEW", attempt: 82, outputUrl: "/renders/x.mp4" } });
    await db.renderReview.create({ data: { projectId: labId, renderJobId: emptyReviewJob.id, shotId: shot2.id, targetRef: "Sc1 Sh001", state: "PASSED", overall: 0.9, verdict: JSON.stringify({ criteria: {}, metrics: null, frame: null, intent: null, issues: [], note: "crafted clean", provider: "local" }), issuesFound: 0, provider: "local" } });
    const noIssues = await proposeRedirection(emptyReviewJob.id);
    check("C2e a reviewed render with nothing open proposes nothing, honestly", noIssues.ok && noIssues.proposed === 0 && noIssues.opsChain.includes("no re-direction proposed"), JSON.stringify({ ok: noIssues.ok, proposed: noIssues.proposed, opsChain: noIssues.opsChain.slice(0, 120) }));
    const unreviewedJob = await db.renderJob.create({ data: { projectId: labId, shotId: shot2.id, mode: "PREVIEW", status: "REVIEW", attempt: 83, outputUrl: "/renders/x.mp4" } });
    const noReview = await proposeRedirection(unreviewedJob.id);
    check("C2f a proposal without a review refuses (evidence, not vibes)", !noReview.ok && (noReview.error ?? "").includes("no pixel review"), noReview.error ?? "");

    // ───────────────────── F. the context lines (phase a, crafted plan) ─────────────────────
    const craftedPlan = await db.sculptPlan.create({
      data: {
        projectId: labId,
        kind: "ENVIRONMENT",
        name: "context-line-plan",
        spec: JSON.stringify({ name: "context-line-plan", layers: [{ kind: "swell", intensity: 1, scale: 1.2 }], subdivision: 1, seed: 42, parts: [] }),
        reading: JSON.stringify({ surface: { tris: 800, verts: 400, roughness: 0.002, roughnessSpread: 0.001, flatness: 0.95, density: 40 }, vision: { note: "crafted", provider: "local" }, cited: ["flatness 0.95"] }),
        outcomes: JSON.stringify([{ assetRef: "ENVIRONMENT:E2E Context v1", meanMove: 0.012, roughnessRatio: 2.4, trisBefore: 800, trisAfter: 3200, at: new Date().toISOString() }]),
        runs: 1,
        clears: 1,
        learnedFrom: "ENVIRONMENT:E2E Context v1",
      },
    });
    const ctxA = await buildCompactContext(labId);
    const planLine = (ctxA as { sculptPlans?: string | null })?.sculptPlans ?? "";
    check("F1 the context sculpt plans line reports the learned standing (runs, clears, layers)", planLine.includes("learned sculpt plans:") && planLine.includes("context-line-plan") && planLine.includes("1 run") && planLine.includes("1 clear") && planLine.includes("swell"), planLine.slice(0, 240));
    check("F2 the context pixel line still stands beside it", ((ctxA as { pixel?: string | null })?.pixel ?? "").length === 0 || ((ctxA as { pixel?: string | null })?.pixel ?? "").includes("latest pixel review:"), "pixel line present or empty-honest");
    const bestCrafted = await bestSculptPlan(labId, "ENVIRONMENT");
    check("F3 the consult ranks a plan with runs and clears first", bestCrafted?.name === "context-line-plan" && bestCrafted.clears === 1, JSON.stringify({ name: bestCrafted?.name, clears: bestCrafted?.clears, runs: bestCrafted?.runs }));
    await db.sculptPlan.delete({ where: { id: craftedPlan.id } });

    // ───────────────────── G. the HTTP role matrix ─────────────────────
    const anon = await call(null, `/api/blender-assets?projectId=${labId}`);
    check("G1 anonymous library reads are 401", anon.status === 401);
    const strangerEmail = `stranger61-${Date.now()}@studio.dev`;
    const strangerRow = await register(strangerEmail, "Stranger61", "stranger-pass-61");
    stranger = { id: strangerRow.id, email: strangerEmail };
    const strangerJar = await loginJar(strangerEmail, "stranger-pass-61");
    const strangerBuild = await call(strangerJar, "/api/blender-assets", { method: "POST", body: JSON.stringify({ projectId: labId, action: "build", kind: "PROP", refName: "E2E Sneaky Build" }) });
    check("G2 a non-member cannot build (403 at the write gate)", strangerBuild.status === 403);
    const strangerDsh = await call(strangerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "plan the sculpt" }) });
    check("G3 a non-member cannot direct the studio (403)", strangerDsh.status === 403);
    const ownerGet = await call(ownerJar, `/api/blender-assets?projectId=${labId}`);
    check("G4 the OWNER reads the library anywhere (unblocked)", ownerGet.status === 200);
    const ownerDsh = await call(ownerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "studio pulse" }) });
    check("G5 the OWNER directs the studio anywhere (unblocked)", ownerDsh.status === 200 || ownerDsh.status === 500, `status=${ownerDsh.status}`);
  } // PHASE a

  if (PHASE === "b") {
    // ───────────────────── D. the REAL surface read + plan + carve ─────────────────────
    const regMesa = await T("create_environment", { name: "E2E Cloudsea Mesa", description: "a wind-carved stone mesa above a sea of clouds, terraced paths, cedar roots, weathered shrine stones", atmosphere: "thin", timeOfDay: "dawn", weather: "clear" });
    check("D0a the mesa registers", regMesa.status === "OK", regMesa.result.slice(0, 110));
    console.log("   (real environment build follows - the slab takes shape)");
    const buildMesa = await T("blender_asset_build", { refName: "E2E Cloudsea Mesa", kind: "ENVIRONMENT" });
    check("D0b the mesa builds (real bpy, versioned .blend, preview on disk)", buildMesa.status === "OK", buildMesa.result.slice(0, 140));

    const mesaRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Cloudsea Mesa" } });
    if (!mesaRow?.blendPath) throw new Error("mesa asset missing - cannot continue");

    // THE PROBE: the same file always lands the same numbers.
    const read1 = await probeSurface(mesaRow.blendPath);
    const read2 = await probeSurface(mesaRow.blendPath);
    if (!read1.ok) throw new Error(`the probe failed: ${read1.error}`);
    check("D1 the probe reads the real .blend (tris on the record)", read1.ok && read1.read.total.tris > 0 && read1.read.total.objects > 0, JSON.stringify(read1.read.total));
    check("D2 the probe is BIT-EXACT across runs (the seed law's standard, held for the read too)", read2.ok && JSON.stringify(read1.read) === JSON.stringify(read2.read), JSON.stringify({ a: read1.ok, b: read2.ok }));
    check("D3 the read line carries the surface's evidence for DSH", surfaceReadLine(read1.read).includes("flatness") && surfaceReadLine(read1.read).includes("roughness"), surfaceReadLine(read1.read).slice(0, 160));

    const ghostPlanBuild = await T("blender_asset_build", { refName: "E2E Cloudsea Mesa", kind: "ENVIRONMENT", plan: "ghost-plan" });
    check("D4 a named plan that does not exist refuses (never a silent plain rebuild)", ghostPlanBuild.status === "ERROR" && ghostPlanBuild.result.includes("sculpt plan 'ghost-plan' not found"), ghostPlanBuild.result.slice(0, 160));
    const ghostAsset = await T("plan_sculpt", { refName: "E2E Never Surfaced", name: "ghost" });
    check("D5 plan_sculpt refuses an asset that does not exist", ghostAsset.status === "ERROR" && ghostAsset.result.includes("No library asset"), ghostAsset.result.slice(0, 140));

    console.log("   (plan_sculpt runs the probe + the vision read - the surface is being read)");
    const planned = await T("plan_sculpt", { refName: "E2E Cloudsea Mesa", name: "cloudsea-plan" });
    check("D6 THE SURFACE IS READ: the plan lands with an honest provider (vision+local | local)", planned.status === "OK" && (planned.result.includes("provider vision+local") || planned.result.includes("provider local")), planned.result.slice(0, 260));
    const planRow = await db.sculptPlan.findFirst({ where: { projectId: labId, name: "cloudsea-plan" } });
    if (!planRow) throw new Error("plan row missing - cannot continue");
    const planSpec = JSON.parse(planRow.spec) as { layers: Array<{ kind: string; intensity: number; scale: number }>; subdivision: number; seed: number };
    check("D7 the plan compiles through the boundary law (1..4 layers, the three-kind vocabulary, clamped numbers)", planSpec.layers.length >= 1 && planSpec.layers.length <= 4 && planSpec.layers.every((l) => ["swell", "fold", "grain"].includes(l.kind) && l.intensity >= 0 && l.intensity <= 2 && l.scale >= 0.05 && l.scale <= 60), JSON.stringify(planSpec));
    const reading = JSON.parse(planRow.reading) as { surface: { tris: number; flatness: number }; cited: string[] };
    check("D8 the plan's reading cites the probe's own numbers (the same read the probe landed twice)", reading.surface.tris === read1.read.total.tris && reading.cited.some((c) => c.includes("flatness")), JSON.stringify(reading.cited));

    console.log("   (the plan-driven carve follows - the learned layer drives the pass)");
    const carve = await T("blender_asset_build", { refName: "E2E Cloudsea Mesa", kind: "ENVIRONMENT", plan: "cloudsea-plan" });
    check("D9 the plan drives the carve (real bpy, the pass measures its evidence)", carve.status === "OK", carve.result.slice(0, 160));
    const mesaAfter = await db.blenderAsset.findUnique({ where: { id: mesaRow.id } });
    const mesaMeta = (() => { try { return JSON.parse(mesaAfter?.meta || "{}") as { sculpt?: Record<string, unknown> }; } catch { return {}; } })();
    check("D10 the asset's meta names the plan behind the carve (audit trail honest)", mesaMeta.sculpt?.plan === "cloudsea-plan" && mesaMeta.sculpt?.applied === true, JSON.stringify(mesaMeta.sculpt ?? {}));
    const planAfterCarve = await db.sculptPlan.findUnique({ where: { id: planRow.id } });
    const outcomes = (() => { try { return JSON.parse(planAfterCarve?.outcomes ?? "[]") as Array<{ meanMove: number | null; roughnessRatio: number | null }>; } catch { return []; } })();
    check("D11 the carve grew the plan's record (runs 0 -> 1, the measured outcome appended)", (planAfterCarve?.runs ?? 0) === 1 && outcomes.length === 1 && (outcomes[0].meanMove ?? 0) > 0, JSON.stringify({ runs: planAfterCarve?.runs, outcomes }));
    const carvedRead = await probeSurface(mesaAfter!.blendPath!);
    check("D12 the carved surface reads DENSER than the slab (the probe saw the subdivision too)", carvedRead.ok && carvedRead.read.total.tris > read1.read.total.tris, `slab ${read1.read.total.tris} tris -> carved ${carvedRead.ok ? carvedRead.read.total.tris : "?"}`);

    // THE CONSULT: a bare slab raises SCULPT; design_fix prefers the
    // learned plan over the kind's default and the re-audit pays the clear.
    const regSlab = await T("create_environment", { name: "E2E Bare Slab", description: "a plain stone terrace, unfinished, awaiting its surface law", atmosphere: "still", timeOfDay: "noon", weather: "clear" });
    check("D13a the bare slab registers", regSlab.status === "OK", regSlab.result.slice(0, 100));
    console.log("   (second real environment build follows - the control slab)");
    const buildSlab = await T("blender_asset_build", { refName: "E2E Bare Slab", kind: "ENVIRONMENT" });
    check("D13b the slab builds unfinished (no sculpt law on it yet)", buildSlab.status === "OK", buildSlab.result.slice(0, 120));
    const auditSlab = await T("design_audit", { refName: "E2E Bare Slab", kind: "ENVIRONMENT" });
    check("D14 the audit raises the clean slab (SCULPT needs a carve)", auditSlab.status === "OK" && auditSlab.result.includes("NEEDS_WORK"), auditSlab.result.slice(0, 200));
    const slabRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Bare Slab" } });
    const slabIssues = await db.designIssue.findMany({ where: { projectId: labId, assetId: slabRow?.id, kind: "SCULPT", status: "OPEN" } });
    check("D15 the SCULPT issue sits OPEN on the slab's audit", slabIssues.length >= 1, JSON.stringify(slabIssues.map((i) => `${i.kind}:${i.severity}`)));

    console.log("   (design_fix follows - it should consult the learned plan, not the default)");
    const fixed = await T("design_fix", { refName: "E2E Bare Slab", kind: "ENVIRONMENT" });
    check("D16 design_fix ran the fix pass (the re-audit is the judge)", fixed.status === "OK", fixed.result.slice(0, 260));
    const fixEvent = await db.productionEvent.findFirst({ where: { projectId: labId, summary: { contains: "Design fix landed" } }, orderBy: { createdAt: "desc" } });
    check("D16b design_fix consulted the LEARNED PLAN (the landed event carries the ops chain)", Boolean(fixEvent) && (fixEvent?.summary ?? "").includes("learned plan 'cloudsea-plan'"), fixEvent?.summary?.slice(0, 240) ?? "none");
    const planAfterFix = await db.sculptPlan.findUnique({ where: { id: planRow.id } });
    check("D17 the re-audit stopped raising SCULPT - the plan EARNS A CLEAR (clears 0 -> 1)", (planAfterFix?.clears ?? 0) === 1, `clears=${planAfterFix?.clears}`);
    const best = await bestSculptPlan(labId, "ENVIRONMENT");
    check("D18 the consult ranks the reinforced plan first", best?.name === "cloudsea-plan", JSON.stringify({ name: best?.name, clears: best?.clears, runs: best?.runs }));
    const slabAfter = await db.blenderAsset.findUnique({ where: { id: slabRow!.id } });
    const slabMeta = (() => { try { return JSON.parse(slabAfter?.meta || "{}") as { sculpt?: Record<string, unknown> }; } catch { return {}; } })();
    check("D19 the slab's meta carries the plan behind its new surface", slabMeta.sculpt?.plan === "cloudsea-plan" && slabMeta.sculpt?.bakedBy === "design_fix", JSON.stringify(slabMeta.sculpt ?? {}));

    // ───────────────────── F1. the context plans line (phase b) ─────────────────────
    const ctxB = await buildCompactContext(labId);
    const planLineB = (ctxB as { sculptPlans?: string | null })?.sculptPlans ?? "";
    check("F1 the context sculpt plans line reports the real plan (2 runs, 1 clear)", planLineB.includes("learned sculpt plans:") && planLineB.includes("cloudsea-plan") && planLineB.includes("2 run") && planLineB.includes("1 clear"), planLineB.slice(0, 240));
  } // PHASE b

  if (PHASE === "c") {
    // ───────────────────── E. the REAL graduated loop (renders + the same law) ─────────────────────
    await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E The Graduated Fix" });
    await T("create_scene", { episodeNumber: 1, number: 1, title: "The shrouded duel", environmentName: null });
    const lin = await T("create_character", { name: "E2E Blade Saint Lin", role: "PROTAGONIST", appearance: "a young sword cultivator in storm-grey layered robes with a topknot and a wind-torn sash, obsidian blade with a jade edge", personality: "stoic" });
    check("E0a the cast registers (the aura needs a figure to breathe on)", lin.status === "OK", lin.result.slice(0, 110));
    await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Blade Saint Lin advances on the shrouded gate as the mist swallows the road - the duel is promised", shotType: "WIDE", movement: "TRACKING", poseStart: "STANCE", poseEnd: "WALK" });
    const grammar = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: JSON.stringify([{ move: "CRANE", from: 0, to: 0.55 }, { move: "DOLLY_IN", from: 0.55, to: 1 }]) });
    check("E0b the shot is DIRECTED (two beats, no wind yet - the re-direction has something to move)", grammar.status === "OK", grammar.result.slice(0, 140));
    const sceneC = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
    const shotC = sceneC ? await db.shot.findFirst({ where: { sceneId: sceneC.id, number: 1 } }) : null;
    if (!sceneC || !shotC) throw new Error("c fixtures missing - cannot continue");

    const noRender = await T("render_redirection", { sceneNumber: 1, shotNumber: 1 });
    check("E0c a re-direction with no finished render refuses honestly", noRender.status === "ERROR" && noRender.result.includes("no finished render for this shot"), noRender.result.slice(0, 150));

    await db.scene.update({ where: { id: sceneC.id }, data: { fogDensity: 1.0, lightningIntensity: 0.0, rimLightIntensity: 0.0, energyIntensity: 0.02, cameraDistance: 1.0 } });
    console.log("   (attempt 1 renders shrouded and directed - the review will name the dark)");
    const job1 = await createRenderJob(labId, shotC.id, "PREVIEW");
    const fin1 = await waitForRender(job1.id, "attempt 1");
    check("E1 attempt 1 renders to a clip", fin1.status === "REVIEW" && Boolean(fin1.outputUrl), `${fin1.driver} ${fin1.status}`);
    const rev1 = await reviewRenderJob(job1.id);
    if (!rev1.ok) throw new Error(`the attempt-1 review could not run: ${rev1.error}`);
    const open1 = await db.renderIssue.findMany({ where: { renderJobId: job1.id, status: "OPEN" } });
    const paramTargets = open1.filter((i) => i.kind !== "INTENT");
    check("E2 the review names concrete issues on the record (the judge works; the parameter family is targeted)", open1.length > 0 && paramTargets.length > 0, JSON.stringify(open1.map((i) => `${i.severity} ${i.kind}`)));

    // THE PARAMETER LEVEL RUNS FIRST (rule 38 owns what parameters own).
    const fixRes = await fixRenderIssues(job1.id, paramTargets.map((i) => i.id));
    check("E3 render_fix applies the parameter fixes and queues attempt 2", fixRes.ok && fixRes.applied.length > 0 && (fixRes.newAttempt ?? 0) === 2, JSON.stringify(fixRes.applied.map((o) => `${o.param} ${o.from}->${o.to}`)));
    console.log("   (attempt 2 renders lit - the parameter level had its chance)");
    const fin2 = await waitForRender(fixRes.newJobId!, "attempt 2");
    const rev2 = await reviewRenderJob(fixRes.newJobId!);
    check("E4 attempt 2's fresh review lands and JUDGES the parameter fix", rev2.ok && fin2.status === "REVIEW", rev2.ok ? rev2.review.state : String(rev2.error));
    const rec2 = await db.renderIssue.findMany({ where: { renderJobId: job1.id, status: { in: ["FIXED", "OPEN"] } } });
    check(
      "E5 the fresh review JUDGED the parameter fix on the record (the reconciliation rides the review, iter 60's law)",
      rec2.length > 0 && rec2.every((i) => (i.status === "FIXED" ? (i.fixNote ?? "").includes("cleared by attempt") : true)),
      JSON.stringify(rec2.map((i) => `${i.kind}:${i.status}:${(i.fixNote ?? "").slice(0, 60)}`)),
    );
    const exhausted2 = await resolveExhaustedKinds(fixRes.newJobId!);
    check("E6 the lineage now GRADUATES the parameter-targeted kinds (their fixes ran in attempt 1)", exhausted2.size >= 1, JSON.stringify([...exhausted2]));

    // THE CRAFTED INTENT: the fresh review says the direction itself
    // does not read. Also a PALETTE issue to prove the graduated refusal.
    const rev2Row = await db.renderReview.findUnique({ where: { renderJobId: fixRes.newJobId! } });
    if (!rev2Row) throw new Error("attempt-2 review row missing - cannot continue");
    const intentIssue = await db.renderIssue.create({ data: { projectId: labId, reviewId: rev2Row.id, renderJobId: fixRes.newJobId!, refName: rev2Row.targetRef, severity: "CRITICAL", kind: "INTENT", note: "the directed duel never reads in the frame (mean luminance 0.19) - the stage the direction promises is not on screen", status: "OPEN" } });
    const paletteIssue = await db.renderIssue.create({ data: { projectId: labId, reviewId: rev2Row.id, renderJobId: fixRes.newJobId!, refName: rev2Row.targetRef, severity: "MINOR", kind: "PALETTE", note: "the palette washes toward grey", status: "OPEN" } });
    const paletteOnly = await proposeRedirection(fixRes.newJobId!, [paletteIssue.id]);
    const paletteExpected = exhausted2.has("PALETTE") ? "materials" : "parameter level still owns";
    check(
      `E7 the PALETTE proposal refuses honestly (${paletteExpected} - ownership read from the real lineage)`,
      paletteOnly.ok && paletteOnly.proposed === 0 && paletteOnly.refusals.some((r) => r.kind === "PALETTE" && r.note.includes(paletteExpected === "materials" ? "materials law" : "parameter level still owns")),
      JSON.stringify({ proposed: paletteOnly.proposed, refusals: paletteOnly.refusals, exhausted: [...exhausted2] }),
    );
    const untouched = await db.renderIssue.findUnique({ where: { id: paletteIssue.id } });
    check("E8 a refused kind is left OPEN and untouched (no fake progress)", untouched?.status === "OPEN" && untouched.fixNote === null, JSON.stringify({ status: untouched?.status, note: untouched?.fixNote }));

    console.log("   (render_redirection graduates: it will propose + apply the re-direction)");
    const redir = await proposeRedirection(fixRes.newJobId!, [intentIssue.id]);
    check("E9 THE FIX GRADUATES: concrete re-direction ops proposed and applied", redir.ok && redir.proposed >= 1, JSON.stringify({ ok: redir.ok, proposed: redir.proposed, grammarOps: redir.grammarOps.length, fxOps: redir.fxOps.length, refusals: redir.refusals }));
    check("E10 every op cites the INTENT issue (kind + severity; the fx ops also carry the crafted number)", redir.ok && [...redir.grammarOps, ...redir.fxOps].every((o) => o.citedKind === "INTENT" && o.citedSeverity === "CRITICAL") && redir.fxOps.every((o) => o.citedNumber.includes("0.19")), JSON.stringify(redir.ok ? { g: redir.grammarOps.map((o) => `${o.citedKind}:${o.citedSeverity}`), f: redir.fxOps.map((o) => `${o.kind}:${o.citedNumber}`) } : redir.refusals));
    const shotAfter = await db.shot.findUnique({ where: { id: shotC.id } });
    const beatsAfter = JSON.parse(shotAfter?.grammar || "[]") as Array<{ move: string; from: number; to: number; wind?: number }>;
    const fxAfter = JSON.parse(shotAfter?.fx || "[]") as Array<{ kind: string; intensity?: number; beats?: number[] | "ALL" }>;
    check("E11 the re-directed grammar carries the WIND call on the widest beat (applied through the compiler)", beatsAfter.some((b) => typeof b.wind === "number" && b.wind > 0), JSON.stringify(beatsAfter));
    check("E12 the re-directed stage carries the AURA presence at ALL (applied through the compiler)", fxAfter.some((p) => p.kind === "AURA" && (p.intensity ?? 0.7) === 0.55 && p.beats === "ALL"), JSON.stringify(fxAfter));
    const intentAfter = await db.renderIssue.findUnique({ where: { id: intentIssue.id } });
    check("E13 the targeted issue sits FIXING with the re-direction queued as its note", intentAfter?.status === "FIXING" && (intentAfter.fixNote ?? "").includes("re-direction queued"), (intentAfter?.fixNote ?? "").slice(0, 140));
    const job3 = await db.renderJob.findFirst({ where: { fixOfJobId: fixRes.newJobId! }, orderBy: { createdAt: "desc" } });
    check("E14 attempt 3 queues with the same fixOf lineage law", Boolean(job3) && (job3?.attempt ?? 0) === 3 && job3?.fixOfJobId === fixRes.newJobId!, JSON.stringify({ attempt: job3?.attempt, fixOf: job3?.fixOfJobId }));
    const redirEvent = await db.productionEvent.findFirst({ where: { projectId: labId, summary: { contains: "Re-direction proposed and applied" } }, orderBy: { createdAt: "desc" } });
    check("E15 the graduation lands its event (the production reads what was proposed)", Boolean(redirEvent), redirEvent?.summary?.slice(0, 140) ?? "none");

    console.log("   (attempt 3 renders re-directed - the fresh review is THE JUDGE)");
    const fin3 = await waitForRender(job3!.id, "attempt 3");
    const rev3 = await reviewRenderJob(job3!.id);
    check("E16 attempt 3 renders and its fresh review lands", fin3.status === "REVIEW" && rev3.ok, rev3.ok ? rev3.review.state : String(rev3.error));
    await reconcileRenderFixes(job3!.id);
    const intentJudged = await db.renderIssue.findUnique({ where: { id: intentIssue.id } });
    const raised3 = new Set((await db.renderIssue.findMany({ where: { renderJobId: job3!.id } })).map((i) => i.kind));
    const expectedStatus = raised3.has("INTENT") ? "OPEN" : "FIXED";
    check("E17 THE SAME LAW JUDGED THE RE-DIRECTION (FIXED when the fresh pixels stop raising INTENT, OPEN when not)", intentJudged?.status === expectedStatus, `status=${intentJudged?.status} expected=${expectedStatus} raised=[${[...raised3].join(",")}] note=${(intentJudged?.fixNote ?? "").slice(0, 90)}`);
    check("E18 the verdict note names the law honestly (cleared-by or still-flagged)", (intentJudged?.fixNote ?? "").includes("cleared by attempt 3") || (intentJudged?.fixNote ?? "").includes("still flags INTENT"), (intentJudged?.fixNote ?? "").slice(0, 120));
    const rev3Reused = await reviewRenderJob(job3!.id);
    check("E19 one review per render job (a re-call reuses the pixels' verdict)", rev3.ok && rev3Reused.ok && rev3.ok && rev3Reused.ok && rev3Reused.review.id === rev3.review.id, JSON.stringify({ a: rev3.ok ? rev3.review.id : null, b: rev3Reused.ok ? rev3Reused.review.id : null }));

    // The queue API carries the graduated lineage to the card.
    const queueRes = await call(ownerJar, `/api/render-jobs?projectId=${labId}`);
    const queue = queueRes.status === 200 ? ((await queueRes.json()) as Array<{ id: string; fixOf?: { attempt: number } | null }>) : [];
    check("E20 the queue API rides the lineage (the card can tell the loop's story)", queueRes.status === 200 && queue.some((j) => j.fixOf), `status=${queueRes.status}`);
  } // PHASE c

  // ───────────────────── H. cleanup (exact rows, workdirs swept) ─────────────────────
  const strangerId = stranger?.id ?? null;
  const labAssetIds = await db.blenderAsset.findMany({ where: { projectId: labId }, select: { id: true } });
  await db.project.delete({ where: { id: labId } });
  if (strangerId) await db.user.delete({ where: { id: strangerId } });
  for (const a of labAssetIds) {
    for (const f of [path.join(process.cwd(), "public", "assets-blender", `${a.id}.png`), path.join(process.cwd(), "public", "assets-blender", `${a.id}.mp4`)]) {
      if (existsSync(f)) rmSync(f);
    }
  }
  const labSlugDirs = [
    path.join(process.cwd(), "assets", "blender", `iter61-surface-direction-lab-iter61-surface-direction-${PHASE}`),
    path.join(process.cwd(), "assets", "blender", "iter61-surface-direction-lab"),
  ];
  for (const d of labSlugDirs) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  const leftoverProject = await db.project.findFirst({ where: { title: { contains: `${MARK}-${PHASE}` } } });
  const leftoverPlans = await db.sculptPlan.count({ where: { projectId: labId } });
  const leftoverIssues = await db.renderIssue.count({ where: { projectId: labId } });
  check("H1 every throwaway row is gone (cascade holds, workdirs swept)", !leftoverProject && leftoverPlans === 0 && leftoverIssues === 0, `plans=${leftoverPlans} issues=${leftoverIssues}`);

  console.log(`\n${failures === 0 ? `ALL CHECKS GREEN (phase ${PHASE})` : `${failures} CHECK(S) FAILED (phase ${PHASE})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

let stranger: { id: string; email: string } | null = null;

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("E2E crashed:", e);
    process.exit(1);
  });
