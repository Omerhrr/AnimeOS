// E2E: DSH plans that survive the turn (cross-turn plans + review gate).
// Steps:
//   plan - pure checks: the plans module (step validation: unknown
//          tools, meta tools, step caps, args shapes), the registry
//          (40 tools), doctrine rule 19, the API route + UI panel on
//          disk, and the production context plan lines.
//   tool - live pipeline: fixture project; DSH lands a 3-step plan
//          (create_terminology, set_shot_dialogue, add_universe_fact)
//          -> PROPOSED; run refused before approval; steer approve ->
//          ACTIVE; one step per call (cursor advances, result
//          recorded, production event lands); run 3 finishes the
//          plan -> DONE with every step DONE; guards on DONE; a
//          poisoned plan parks AT its failed step and the run stops;
//          pause/resume/abort steering; plans ride the production
//          context; creator-authored plans via the API. Every
//          artifact removed.
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import { buildCompactContext } from "@/lib/dsh/tools";
import {
  validatePlanSteps, createPlan, runPlanSteps, setPlanStatus,
  getPlan, listPlans, MAX_PLAN_STEPS, MAX_PLAN_RUN_STEPS,
} from "@/lib/dsh/plans";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const step = process.argv[2] ?? "plan";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // step validation
  const unknown = validatePlanSteps([{ tool: "definitely_not_a_tool", args: {}, why: "x" }]);
  check("unknown tools are rejected with the step number", !unknown.ok && unknown.error.includes("step 1"), unknown.ok ? "accepted" : unknown.error);
  const meta = validatePlanSteps([{ tool: "create_plan", args: {}, why: "recurse" }]);
  check("plan meta-tools cannot ride inside a plan", !meta.ok && meta.error.includes("meta-tool"), meta.ok ? "accepted" : meta.error);
  const noArgs = validatePlanSteps([{ tool: "create_terminology" }]);
  check("a step without args still validates (empty args)", noArgs.ok && Object.keys(noArgs.steps?.[0]?.args ?? { x: 1 }).length === 0, noArgs.ok ? "ok" : noArgs.error);
  const stringSteps = validatePlanSteps(JSON.stringify([{ tool: "create_terminology", args: { term: "Qi" }, why: "translation memory" }]));
  check("steps passed as a JSON string parse", stringSteps.ok && stringSteps.steps?.[0]?.why === "translation memory", stringSteps.ok ? "ok" : stringSteps.error);
  const tooMany = validatePlanSteps(Array.from({ length: MAX_PLAN_STEPS + 1 }, (_, i) => ({ tool: "create_terminology", args: { term: `t${i}` }, why: "x" })));
  check(`plans cap at ${MAX_PLAN_STEPS} steps`, !tooMany.ok && tooMany.error.includes("at most"), tooMany.ok ? "accepted" : tooMany.error);
  const empty = validatePlanSteps([]);
  check("an empty plan is rejected", !empty.ok && empty.error.includes("at least one step"), empty.ok ? "accepted" : empty.error);
  const clean = validatePlanSteps([
    { tool: "create_terminology", args: { term: "Qi" }, why: "translation memory" },
    { tool: "add_universe_fact", args: { text: "the sky has two moons", category: "WORLD" }, why: "canon" },
  ]);
  check("valid steps normalize to PENDING", clean.ok && clean.steps?.every((s) => s.status === "PENDING"), clean.ok ? `${clean.steps?.length} steps` : clean.error);

  // registry + doctrine
  check("the registry grew to 40 tools", TOOL_DEFS.length === 40, String(TOOL_DEFS.length));
  check("create_plan / run_plan / steer_plan are registered", ["create_plan", "run_plan", "steer_plan"].every((n) => TOOL_DEFS.some((t) => t.name === n)), "tool defs");
  const promptsSrc = fs.readFileSync(path.join(process.cwd(), "src", "lib", "dsh", "prompts.ts"), "utf-8");
  check("doctrine rule 19 teaches the plan lifecycle", promptsSrc.includes("PLANS THAT OUTLIVE THE TURN") && promptsSrc.includes("create_plan") && promptsSrc.includes("parks the plan AT that step"), "doctrine");
  check("the intro names the resumable plan loop", promptsSrc.includes("RESUMABLE PLAN") && promptsSrc.includes("plan review panel"), "intro");
  check("run budget is capped at 3 per call", MAX_PLAN_RUN_STEPS === 3, String(MAX_PLAN_RUN_STEPS));

  // API + UI on disk
  check("route exists: src/app/api/dsh-plans/route.ts", fs.existsSync(path.join(process.cwd(), "src", "app", "api", "dsh-plans", "route.ts")), "on disk");
  const consoleSrc = fs.readFileSync(path.join(process.cwd(), "src", "components", "views", "dsh-console.tsx"), "utf-8");
  check("dsh console mounts the plans review panel", consoleSrc.includes("Plans that outlive the turn") && consoleSrc.includes("Approve") && consoleSrc.includes("Run next step"), "panel");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const proj = await db.project.create({
    data: {
      title: "Plans E2E",
      logline: "cross-turn DSH plans",
      characters: { create: [{ name: "Lin Yue", role: "PROTAGONIST" }] },
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Terrace",
              scenes: {
                create: {
                  number: 1,
                  title: "Cloud Terrace",
                  description: "a rain-slick terrace above the cloud sea",
                  fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.5, cameraDistance: 1.0, rimLightIntensity: 0.5,
                  shots: { create: [{ number: 1, description: "Lin Yue watches the horizon", shotType: "CLOSEUP", movement: "STATIC", duration: 2 }] },
                },
              },
            },
          },
        },
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
  });
  const projectId = proj.id;
  const shot = proj.seasons[0].episodes[0].scenes[0].shots[0];

  try {
    // ── 1. DSH lands a plan -> PROPOSED, refused before approval ──
    const landed = await executeTool(projectId, "create_plan", {
      title: "Open the terrace beat",
      goal: "store the key term, author the line, register the canon",
      steps: [
        { tool: "create_terminology", args: { term: "Cloud Terrace", category: "LOCATION", translations: { "zh-CN": "云台" } }, why: "translation memory" },
        { tool: "set_shot_dialogue", args: { sceneNumber: 1, shotNumber: 1, lines: JSON.stringify([{ speaker: "Lin Yue", text: "The terrace remembers us.", kind: "SPEECH" }]) }, why: "author the beat's line" },
        { tool: "add_universe_fact", args: { text: "The Cloud Terrace sits above the cloud sea", category: "LOCATION" }, why: "register the canon" },
      ],
    });
    check("create_plan lands the plan", landed.status === "OK" && landed.result.includes("PROPOSED") && landed.result.includes("3 step(s)"), landed.result.slice(0, 110));
    const proposedPlans = await listPlans(projectId);
    const plan = proposedPlans[0];
    check("the plan waits PROPOSED with 3 pending steps", plan?.status === "PROPOSED" && plan.total === 3 && plan.steps.every((s) => s.status === "PENDING"), plan ? `${plan.status} ${plan.total}` : "none");

    const earlyRun = await runPlanSteps(plan!.id, 2);
    check("running a PROPOSED plan is refused", !earlyRun.ok && (earlyRun.error ?? "").includes("PROPOSED"), earlyRun.error?.slice(0, 80) ?? "ran");

    // ── 2. approve -> run one step per call ──
    const approved = await setPlanStatus(plan!.id, "ACTIVE");
    check("steer approve opens the runner", approved.ok, approved.error ?? "ok");
    const run1 = await runPlanSteps(plan!.id, 1);
    check("run executes step 1 through the real tool path", run1.ok && (run1.report ?? "").includes("[OK] step 1/3 create_terminology"), (run1.report ?? run1.error ?? "").slice(0, 110));
    const after1 = await getPlan(plan!.id);
    check("the cursor advanced and the step result recorded", after1?.cursor === 1 && after1.steps[0]?.status === "DONE" && (after1.steps[0]?.result ?? "").includes("translation memory"), `cursor=${after1?.cursor}`);
    const termStored = await db.terminology.findFirst({ where: { projectId, term: "Cloud Terrace" } });
    check("the step REALLY executed (term in the DB)", Boolean(termStored), termStored?.term ?? "missing");
    const ev1 = await db.productionEvent.findFirst({ where: { projectId, summary: { contains: "step 1/3 create_terminology" } } });
    check("the step landed a production event naming the plan", Boolean(ev1), ev1?.summary.slice(0, 80) ?? "none");

    // ── 3. run 3 -> finishes the plan ──
    const runRest = await runPlanSteps(plan!.id, 3);
    check("the remaining steps run in one call", runRest.ok && (runRest.report ?? "").includes("[OK] step 2/3") && (runRest.report ?? "").includes("[OK] step 3/3"), (runRest.report ?? runRest.error ?? "").slice(0, 130));
    const done = await getPlan(plan!.id);
    check("the plan finishes DONE with every step DONE", done?.status === "DONE" && done.done === 3 && done.failed === 0, `${done?.status} ${done?.done}/${done?.total}`);
    check("the report names nothing remaining", !(runRest.report ?? "").includes("remain"), (runRest.report ?? "").split("\n").pop() ?? "");
    const dialogueSet = JSON.parse((await db.shot.findUnique({ where: { id: shot.id } }))?.dialogue ?? "[]");
    check("the dialogue step REALLY executed", dialogueSet.length === 1 && dialogueSet[0].speaker === "Lin Yue", String(dialogueSet.length));
    const factStored = await db.universeFact.findFirst({ where: { projectId, text: { contains: "cloud sea" } } });
    check("the fact step REALLY executed", Boolean(factStored), factStored?.text ?? "missing");

    // guards on a finished plan
    const rerun = await runPlanSteps(plan!.id, 1);
    check("running a DONE plan is refused", !rerun.ok && (rerun.error ?? "").includes("DONE"), rerun.error?.slice(0, 60) ?? "ran");
    const resteer = await setPlanStatus(plan!.id, "ABORTED");
    check("steering a DONE plan is refused", !resteer.ok && (resteer.error ?? "").includes("no longer accepts"), resteer.error?.slice(0, 60) ?? "steered");

    // ── 4. a poisoned plan parks AT the failed step ──
    const poisoned = await createPlan(projectId, {
      title: "Poisoned beat",
      goal: "the second step targets a missing shot",
      steps: [
        { tool: "create_terminology", args: { term: "Moon Vein", why: "x" }, why: "fine" },
        { tool: "set_shot_dialogue", args: { sceneNumber: 9, shotNumber: 9, lines: "[]" }, why: "will fail: scene 9 does not exist" },
        { tool: "create_terminology", args: { term: "Never Reached" }, why: "must not run" },
      ],
      source: "CREATOR",
    });
    check("a creator-authored plan lands via the API module", poisoned.ok && poisoned.plan?.source === "CREATOR", poisoned.ok ? poisoned.plan!.id.slice(-6) : poisoned.error);
    await setPlanStatus(poisoned.plan!.id, "ACTIVE");
    const badRun = await runPlanSteps(poisoned.plan!.id, 3);
    check("the run executes the fine step then hits the poisoned one", badRun.ok && (badRun.report ?? "").includes("[OK] step 1/3") && (badRun.report ?? "").includes("[ERROR] step 2/3"), (badRun.report ?? "").slice(0, 150));
    const parked = await getPlan(poisoned.plan!.id);
    check("the plan parks ACTIVE at the failed step (cursor stays for retry)", parked?.status === "ACTIVE" && parked.cursor === 1 && parked.steps[1]?.status === "ERROR" && parked.failed === 1, `status=${parked?.status} cursor=${parked?.cursor}`);
    check("the step after the failure never ran", parked?.steps[2]?.status === "PENDING" && !(await db.terminology.findFirst({ where: { projectId, term: "Never Reached" } })), parked?.steps[2]?.status ?? "ran");
    check("the report tells the director how to retry", (badRun.report ?? "").includes("fix the cause and run the plan again"), (badRun.report ?? "").split("\n").pop() ?? "");

    // ── 5. pause / resume / abort steering ──
    const pause = await setPlanStatus(poisoned.plan!.id, "PAUSED");
    check("an ACTIVE plan pauses", pause.ok, pause.error ?? "ok");
    const pausedRun = await runPlanSteps(poisoned.plan!.id, 1);
    check("a PAUSED plan refuses to run", !pausedRun.ok && (pausedRun.error ?? "").includes("PAUSED"), pausedRun.error?.slice(0, 60) ?? "ran");
    const resume = await setPlanStatus(poisoned.plan!.id, "ACTIVE");
    check("resume re-opens the runner", resume.ok, resume.error ?? "ok");
    const aborted = await setPlanStatus(poisoned.plan!.id, "ABORTED");
    check("abort pulls the plug", aborted.ok, aborted.error ?? "ok");
    const abortedRun = await runPlanSteps(poisoned.plan!.id, 1);
    check("an ABORTED plan refuses to run", !abortedRun.ok && (abortedRun.error ?? "").includes("ABORTED"), abortedRun.error?.slice(0, 60) ?? "ran");
    const noApprove = await setPlanStatus(plan!.id, "ACTIVE");
    check("approving a DONE plan is refused", !noApprove.ok, noApprove.error?.slice(0, 60) ?? "approved");

    // ── 6. the context carries the plans for the NEXT conversation ──
    const ctx = await buildCompactContext(projectId);
    const planLines = (ctx?.plans ?? []) as string[];
    check("the production context lists both plans with progress", planLines.length === 2 && planLines.some((l) => l.startsWith("DONE")) && planLines.some((l) => l.startsWith("ABORTED")), planLines.join(" | ").slice(0, 160));

    // ── 7. the API surface mirrors the module ──
    const list = await fetch(`http://127.0.0.1:3000/api/dsh-plans?projectId=${projectId}`);
    const listBody = (await list.json()) as { plans?: Array<{ id: string }> };
    check("GET /api/dsh-plans lists the plans", list.status === 200 && listBody.plans?.length === 2, `${list.status} with ${listBody.plans?.length ?? 0}`);
    const apiPost = await fetch("http://127.0.0.1:3000/api/dsh-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title: "API plan", goal: "created by the creator", steps: [{ tool: "create_terminology", args: { term: "Sky Law" }, why: "canon law" }] }),
    });
    const postBody = (await apiPost.json()) as { plan?: { id: string; status: string }; error?: string };
    check("POST /api/dsh-plans creates a creator plan", apiPost.status === 201 && postBody.plan?.status === "PROPOSED", postBody.error ?? postBody.plan?.id.slice(-6) ?? "");
    if (postBody.plan) {
      const apiRun = await fetch("http://127.0.0.1:3000/api/dsh-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: postBody.plan.id, action: "run" }),
      });
      const runBody = (await apiRun.json()) as { error?: string };
      check("the API refuses running before approval", apiRun.status === 400 && (runBody.error ?? "").includes("PROPOSED"), runBody.error?.slice(0, 70) ?? "ran");
      const apiApprove = await fetch("http://127.0.0.1:3000/api/dsh-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: postBody.plan.id, action: "approve" }),
      });
      check("the API approves a plan", apiApprove.status === 200, String(apiApprove.status));
      const apiRun2 = await fetch("http://127.0.0.1:3000/api/dsh-plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: postBody.plan.id, action: "run", maxSteps: 1 }),
      });
      const run2Body = (await apiRun2.json()) as { report?: string };
      check("the API runs the approved plan", apiRun2.status === 200 && (run2Body.report ?? "").includes("[OK] step 1/1"), (run2Body.report ?? "").slice(0, 90));
    }

    // ── 8. DSH's run_plan with no id picks the latest ACTIVE plan ──
    const fresh = await executeTool(projectId, "create_plan", {
      title: "Continuation beat",
      goal: "two more terms across a later conversation",
      steps: [
        { tool: "create_terminology", args: { term: "Sky Law" }, why: "law one" },
        { tool: "create_terminology", args: { term: "Moon Vein Law" }, why: "law two" },
      ],
    });
    check("the continuation plan lands", fresh.status === "OK", fresh.result.slice(0, 90));
    await executeTool(projectId, "steer_plan", { action: "approve" });
    const pick = await executeTool(projectId, "run_plan", { maxSteps: 1 });
    check("DSH run_plan defaults to the latest ACTIVE plan", pick.status === "OK" && pick.result.includes("[OK] step 1/2"), pick.result.slice(0, 130));
    const steered = await executeTool(projectId, "steer_plan", { action: "pause" });
    check("steer_plan with no id picks the latest steerable plan", steered.status === "OK" && steered.result.includes("PAUSED"), steered.result.slice(0, 90));
    const contPlan = await db.dshPlan.findFirst({ where: { projectId, title: "Continuation beat" } });
    const pausedDshRun = await executeTool(projectId, "run_plan", { planId: contPlan?.id });
    check("DSH refuses to run a PAUSED plan", pausedDshRun.status === "ERROR" && pausedDshRun.result.includes("PAUSED"), pausedDshRun.result.slice(0, 70));
    await executeTool(projectId, "steer_plan", { action: "resume" });
    const pick2 = await executeTool(projectId, "run_plan", { maxSteps: 3 });
    check("a later call continues where the plan stopped", pick2.status === "OK" && pick2.result.includes("[OK] step 2/2") && pick2.result.includes("DONE"), pick2.result.slice(0, 130));
    const none = await executeTool(projectId, "run_plan", {});
    check("run_plan with no runnable plan reports it", none.status === "ERROR" && none.result.includes("No ACTIVE plan"), none.result.slice(0, 80));
  } finally {
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
