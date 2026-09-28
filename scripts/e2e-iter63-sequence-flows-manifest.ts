// Iteration 63 E2E: the studio remembers its sentences (learned
// sequence flows) + the sequence manifest panel (the director's
// call sheet in the UI).
// Proves, against the RUNNING studio, the REAL database:
//   A. source: the learned layer (adoption / application / consult /
//      reinforcement), the registry 80, the doctrine (rule 42 + the
//      sequence law), the manifest route + panel + nav
//   B. accounts + throwaway production
//   C. adoption: learn_sequence_flow (honest refusals, spec copy,
//      re-adoption keeps the record)
//   D. application: program-driven directions grow the flow's
//      measured record (whole = verified, clean read = clear);
//      the register consult directs from the best-proven flow and
//      never consults a flow that never landed whole
//   E. the manifest: HTTP read of programs, flows and the episode
//      call sheet (beats, poses, world bindings, render state)
//   F. the HTTP role matrix (anon 401, VIEWER reads the call sheet,
//      OWNER unblocked)
//   G. context line + cleanup (exact rows)
// Run: bun scripts/e2e-iter63-sequence-flows-manifest.ts
// Precondition: dev server on :3000.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { buildCompactContext } from "../src/lib/dsh/tools";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter63-seq-flows-manifest";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter63" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter63" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter63", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter63" },
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

async function main() {
  console.log("== Iteration 63: the studio remembers its sentences, the call sheet is legible ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const flows = readFileSync("src/lib/dsh/sequence-flows.ts", "utf8");
  check("A1 the memory is keyed (project, register, name) with seven registers", flows.includes("BATTLE") && flows.includes("PURSUIT") && flows.includes("REVEAL") && flows.includes("STANDOFF") && flows.includes("RITUAL") && flows.includes("INTRIGUE") && flows.includes("RESOLVE") && flows.includes("projectId_register_name"));
  check("A2 the clear law is the clean read on a whole landing", flows.includes("const cleared = verified && outcome.moveClashes === 0"));
  check("A3 the consult never trusts a flow that never landed whole", flows.includes("f.outcomes.some((o) => o.verified)"));
  check("A4 the record is honest (capped, appended whatever it measured)", flows.includes("MAX_OUTCOMES = 24") && flows.includes("slice(-MAX_OUTCOMES)"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A5 the registry grew to 80 tools (learn_sequence_flow joins)", toolCount === 85, `count=${toolCount}`);
  check("A6 learn_sequence_flow adopts a verified program per register", tools.includes('name: "learn_sequence_flow"') && tools.includes("ADOPT A VERIFIED SEQUENCE"));
  check("A7 the consult path starts from the sentence that verified", tools.includes("THE STUDIO REMEMBERS ITS SENTENCES") && tools.includes("bestSequenceFlow(projectId, register)") && tools.includes("No learned flow for register"));
  check("A8 the memory grows from what the run measured", tools.includes("THE MEMORY GROWS FROM WHAT THE RUN MEASURED") && tools.includes("verified: unused === 0 && directed > 0") && tools.includes("flowsLearnedFromProgram(projectId, programName)"));
  check("A9 the consult names the flow honestly in the result", tools.includes("learned flow '${flow.name}' (register ${flow.register}") && tools.includes("the clean read earns the clear"));
  check("A10 the context carries the learned sequence flows line", tools.includes("listSequenceFlows(projectId).catch(() => [])") && tools.includes("sequenceFlows: sequenceFlowsContextLine(learnedSequenceFlows)"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A11 rule 42 teaches the sentence memory", prompts.includes("42. DIRECT FROM MEMORY") && prompts.includes("a flow that never landed whole is never consulted") && prompts.includes("rewrites its cutting language from scratch every episode is amnesiac"));
  check("A12 the sequence law grew the memory + the manifest", prompts.includes("THE STUDIO REMEMBERS ITS SENTENCES: a verified program can be adopted as a learned sequence flow per dramatic register") && prompts.includes("the manifest panel shows the creator the whole call sheet"));

  const route = readFileSync("src/app/api/sequence-manifest/route.ts", "utf8");
  check("A13 the manifest route reads the three ledgers behind crew access", route.includes("requireProjectAccess") && route.includes("designPreset.findMany") && route.includes("sequenceFlow.findMany") && route.includes("latestByShot"));

  const apiClient = readFileSync("src/lib/api-client.ts", "utf8");
  check("A14 the client carries the manifest types + query", apiClient.includes("export interface SequenceManifest") && apiClient.includes("sequenceManifest: (projectId: string)"));

  const manifestView = readFileSync("src/components/views/manifest-view.tsx", "utf8");
  check("A15 the panel shows programs, flows and the call sheet", manifestView.includes("Sequence programs") && manifestView.includes("Learned sequence flows") && manifestView.includes("The call sheet") && manifestView.includes("function BeatChain"));

  const shell = readFileSync("src/components/studio/studio-shell.tsx", "utf8");
  const store = readFileSync("src/lib/store.ts", "utf8");
  check("A16 the Manifest view is navigable", shell.includes('{ id: "manifest", label: "Manifest"') && shell.includes("<ManifestView") && store.includes('| "manifest"'));
  check("A17 the flow card reads runs / clears / landed-whole honestly", manifestView.includes("f.clears} clear") && manifestView.includes("last {f.lastVerified ? \"landed whole\" : \"did not land whole\"}"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const viewerLogin = await register(`viewer-${MARK}@studio.dev`, "Read Only", "viewing123");
  check("B2 the fresh account lands VIEWER", viewerLogin.role === "VIEWER", viewerLogin.role);
  const viewerJar = await loginJar(`viewer-${MARK}@studio.dev`, "viewing123");

  const created = await executeTool("throwaway", "create_project", { title: `Iter63 Sequence Flow Lab ${MARK}`, logline: "a throwaway production for the learned sequence flows + manifest proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const addMember = await call(ownerJar, `/api/projects/${labId}/members`, { method: "POST", body: JSON.stringify({ userId: viewerLogin.id }) });
  check("B4 the viewer joins the lab's crew", addMember.status === 200 || addMember.status === 201, String(addMember.status));

  // ───────────────────── C. adoption ─────────────────────
  const programA = await T("design_sequence", { name: "E2E Raid Program", description: "find, break - the world answers", slots: JSON.stringify([
    { grammar: "The Reveal", fx: "The Slash", note: "the reveal flares" },
    { grammar: "The Assault", physics: "The Clash" },
  ]) });
  check("C1 the raid program registers (2 slots, fx + physics)", programA.status === "OK" && programA.result.includes("+fx The Slash") && programA.result.includes("+physics The Clash"), programA.result.slice(0, 220));

  const badRegister = await T("learn_sequence_flow", { name: "E2E Wrong", register: "MELEE", program: "E2E Raid Program" });
  check("C2 an unknown register refuses with the vocabulary", badRegister.status === "ERROR" && badRegister.result.includes("register must be one of BATTLE | PURSUIT | REVEAL"), badRegister.result.slice(0, 200));
  const ghostProgram = await T("learn_sequence_flow", { name: "E2E Ghost Flow", register: "BATTLE", program: "E2E Ghost Program" });
  check("C3 a flow is learned from a program that exists", ghostProgram.status === "ERROR" && ghostProgram.result.includes("No sequence program named 'E2E Ghost Program'"), ghostProgram.result.slice(0, 200));

  const adopt = await T("learn_sequence_flow", { name: "E2E Raid Flow", register: "BATTLE", program: "E2E Raid Program" });
  check("C4 the raid flow is adopted for BATTLE", adopt.status === "OK" && adopt.result.includes("SEQUENCE FLOW 'E2E Raid Flow' remembered for battle direction") && adopt.result.includes("The Reveal -> The Assault") && adopt.result.includes("learned from program 'E2E Raid Program'"), adopt.result.slice(0, 320));
  const flowRow = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "E2E Raid Flow" } } });
  const flowSpec = flowRow ? (JSON.parse(flowRow.spec) as { slots: Array<{ grammar: string; fx: string | null; physics: string | null }> }) : null;
  check("C5 the flow's spec carries the validated slots (world bindings included)", flowRow?.runs === 0 && flowRow?.clears === 0 && flowSpec?.slots.length === 2 && flowSpec.slots[0].fx === "The Slash" && flowSpec.slots[1].physics === "The Clash", JSON.stringify(flowSpec));

  const reAdopt = await T("learn_sequence_flow", { name: "E2E Raid Flow", register: "BATTLE", program: "E2E Raid Program", description: "re-lawed" });
  check("C6 re-adoption re-laws the spec and keeps the flow", reAdopt.status === "OK" && (await db.sequenceFlow.count({ where: { projectId: labId, register: "BATTLE", name: "E2E Raid Flow" } })) === 1);

  const programB = await T("design_sequence", { name: "E2E Overreach Program", slots: JSON.stringify([
    { grammar: "The Reveal" },
    { grammar: "The Standoff" },
    { grammar: "The Assault" },
  ]) });
  check("C7 the overreach program registers (3 slots)", programB.status === "OK", programB.result.slice(0, 160));
  const adoptB = await T("learn_sequence_flow", { name: "E2E Overreach Flow", register: "BATTLE", program: "E2E Overreach Program" });
  check("C8 the overreach flow is adopted too (never run yet)", adoptB.status === "OK", adoptB.result.slice(0, 160));

  // ───────────────────── D. application + consult ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Sentence Memory" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "First clash", environmentName: null });
  await T("create_scene", { episodeNumber: 1, number: 2, title: "Second clash", environmentName: null });
  for (const scn of [1, 2]) {
    for (const n of [1, 2]) {
      await T("create_shot", {
        sceneNumber: scn, number: n,
        description: `the duel beats land - scene ${scn} shot ${n}, E2E Cultivator Lin in frame`,
        shotType: n === 1 ? "ESTABLISHING" : "MEDIUM",
        movement: "STATIC",
      });
    }
  }

  const consultEmpty = await T("direct_sequence", { sceneNumber: 1, register: "BATTLE" });
  check("D1 the consult refuses while no flow ever landed whole", consultEmpty.status === "ERROR" && consultEmpty.result.includes("No learned flow for register BATTLE that ever landed whole") && consultEmpty.result.includes("BATTLE:'E2E Raid Flow'"), consultEmpty.result.slice(0, 300));
  const noRegister = await T("direct_sequence", { sceneNumber: 1 });
  check("D2 a bare direct names all three paths", noRegister.status === "ERROR" && noRegister.result.includes("pass program:'<name>', a slots JSON array, or register:'<register>'"), noRegister.result.slice(0, 220));
  const badReg = await T("direct_sequence", { sceneNumber: 1, register: "MELEE" });
  check("D3 the consult validates the register", badReg.status === "ERROR" && badReg.result.includes("register must be one of"), badReg.result.slice(0, 200));

  const dirA = await T("direct_sequence", { sceneNumber: 1, program: "E2E Raid Program" });
  check("D4 the program lands whole and the flow records a clear", dirA.status === "OK" && dirA.result.includes("SEQUENCE DIRECTED (program 'E2E Raid Program') across 2 shot(s)") && dirA.result.includes("Memory: learned flow 'E2E Raid Flow' (BATTLE) recorded the run: 1 run(s), 1 clear(s) - the sentence landed whole, the clean read earns the clear"), dirA.result.slice(-420));
  const afterA = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "E2E Raid Flow" } } });
  const outcomeA = afterA && afterA.outcomes !== "[]" ? (JSON.parse(afterA.outcomes) as Array<{ program: string | null; slots: number; directed: number; unused: number; verified: boolean; moveClashes: number }>)[0] : null;
  check("D5 the measured outcome is honest (program, slots 2, directed 2, verified)", outcomeA !== null && outcomeA.program === "E2E Raid Program" && outcomeA.slots === 2 && outcomeA.directed === 2 && outcomeA.unused === 0 && outcomeA.verified === true, JSON.stringify(outcomeA));

  const dirB = await T("direct_sequence", { sceneNumber: 1, program: "E2E Overreach Program" });
  check("D6 the overreach does NOT land whole (1 slot had no shot)", dirB.status === "OK" && dirB.result.includes("1 slot(s) had no shot to direct") && dirB.result.includes("learned flow 'E2E Overreach Flow' (BATTLE) recorded the run: 1 run(s), 0 clear(s) - the sentence did NOT land whole"), dirB.result.slice(-460));
  const afterB = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "E2E Overreach Flow" } } });
  check("D7 no clear for a sentence that did not land whole", afterB?.runs === 1 && afterB?.clears === 0, `runs=${afterB?.runs} clears=${afterB?.clears}`);

  const consult = await T("direct_sequence", { sceneNumber: 2, register: "BATTLE", render: true });
  check("D8 the consult directs from the best-proven flow (never the unproven one)", consult.status === "OK" && consult.result.includes("SEQUENCE DIRECTED (learned flow 'E2E Raid Flow' (register BATTLE, 1 run(s), 1 clear(s)))") && !consult.result.includes("Overreach"), consult.result.slice(0, 420));
  check("D9 the consult's run grows the memory too (2 runs, 2 clears) and queues the renders", consult.status === "OK" && consult.result.includes("Memory: learned flow 'E2E Raid Flow' (BATTLE) recorded the run: 2 run(s), 2 clear(s)") && consult.result.includes("2 PREVIEW render job(s) queued"), consult.result.slice(-420));
  const afterConsult = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "E2E Raid Flow" } } });
  check("D10 the flow's record carries both applications", afterConsult?.runs === 2 && afterConsult?.clears === 2, `runs=${afterConsult?.runs} clears=${afterConsult?.clears}`);

  const scene2Shots = await db.shot.findMany({
    where: { scene: { episode: { season: { projectId: labId } }, number: 2 } },
    orderBy: { number: "asc" },
  });
  const grammar2 = scene2Shots[0]?.grammar ? (JSON.parse(scene2Shots[0].grammar) as Array<{ move: string }>) : null;
  const fx2 = scene2Shots[0]?.fx ? (JSON.parse(scene2Shots[0].fx) as Array<{ kind: string }>) : null;
  const phys1b = (await db.shot.findMany({ where: { scene: { episode: { season: { projectId: labId } }, number: 1 } }, orderBy: { number: "asc" } }))[1];
  const physS1 = phys1b?.physics ? (JSON.parse(phys1b.physics) as Array<{ kind: string }>) : null;
  check("D11 the consult stamps the grammar + the world exactly like the program path", grammar2?.[0]?.move === "CRANE" && (fx2 ?? []).some((p) => p.kind === "TRAIL"), `grammar=${scene2Shots[0]?.grammar ?? "null"}`);
  check("D12 the earlier program run left the clash physics on scene 1 shot 2", (physS1 ?? []).some((p) => p.kind === "KNOCK"), phys1b?.physics ?? "null");

  const ghostRegister = await T("direct_sequence", { sceneNumber: 2, register: "PURSUIT" });
  check("D13 a register with no flows refuses with the registry", ghostRegister.status === "ERROR" && ghostRegister.result.includes("No learned flow for register PURSUIT") && ghostRegister.result.includes("BATTLE:'E2E Raid Flow'"), ghostRegister.result.slice(0, 300));

  // ───────────────────── E. the manifest ─────────────────────
  const manifestRes = await call(ownerJar, `/api/sequence-manifest?projectId=${labId}`);
  check("E1 the OWNER reads the manifest", manifestRes.status === 200, String(manifestRes.status));
  const manifest = (await manifestRes.json()) as {
    episodes: Array<{ number: number; scenes: Array<{ number: number; shots: Array<{ label: string; beats: Array<{ move: string; from: number; to: number; wind?: number }>; fx: Array<{ kind: string }>; physics: Array<{ kind: string }>; render: { status: string } | null }> }> }>;
    programs: Array<{ name: string; slots: Array<{ grammar: string }>; usageCount: number }>;
    flows: Array<{ register: string; name: string; runs: number; clears: number; learnedFrom: string | null; lastVerified: boolean | null }>;
  };
  const ep1 = manifest.episodes.find((e) => e.number === 1);
  const sc1 = ep1?.scenes.find((s) => s.number === 1);
  const sc2 = ep1?.scenes.find((s) => s.number === 2);
  check("E2 the call sheet carries both scenes with two shots each", ep1 !== undefined && sc1?.shots.length === 2 && sc2?.shots.length === 2, JSON.stringify(ep1?.scenes.map((s) => s.shots.length)));
  check("E3 the beat chain reads the grammar cut by cut", sc1?.shots[0]?.beats[0]?.move === "CRANE" && sc1?.shots[0]?.beats.length === 2 && sc2?.shots[0]?.beats[0]?.move === "CRANE", JSON.stringify(sc1?.shots[0]?.beats));
  check("E4 the world bindings ride the call sheet", (sc1?.shots[0]?.fx ?? []).some((p) => p.kind === "TRAIL") && (sc1?.shots[1]?.physics ?? []).some((p) => p.kind === "KNOCK"), JSON.stringify({ fx: sc1?.shots[0]?.fx, phys: sc1?.shots[1]?.physics }));
  check("E5 the render state rides the call sheet (the consult queued PREVIEW renders)", sc2?.shots.every((sh) => sh.render !== null && sh.render.mode === "PREVIEW") === true, JSON.stringify(sc2?.shots.map((sh) => sh.render)));
  const raidProgram = manifest.programs.find((p) => p.name === "E2E Raid Program");
  const overreachProgram = manifest.programs.find((p) => p.name === "E2E Overreach Program");
  check("E6 the programs ledger carries both sentences with usage", raidProgram?.slots.length === 2 && (raidProgram?.usageCount ?? 0) >= 1 && overreachProgram?.slots.length === 3, JSON.stringify(manifest.programs.map((p) => `${p.name}:${p.slots.length}:${p.usageCount}`)));
  const raidFlow = manifest.flows.find((f) => f.name === "E2E Raid Flow");
  const overreachFlow = manifest.flows.find((f) => f.name === "E2E Overreach Flow");
  check("E7 the flows ledger carries the measured records", raidFlow?.runs === 2 && raidFlow?.clears === 2 && raidFlow?.learnedFrom === "E2E Raid Program" && overreachFlow?.runs === 1 && overreachFlow?.clears === 0 && overreachFlow?.lastVerified === false, JSON.stringify(manifest.flows));

  // ───────────────────── F. the HTTP role matrix ─────────────────────
  const anon = await call(null, `/api/sequence-manifest?projectId=${labId}`);
  check("F1 anonymous manifest reads are 401", anon.status === 401);
  const viewerGet = await call(viewerJar, `/api/sequence-manifest?projectId=${labId}`);
  check("F2 the VIEWER reads the call sheet (crew-readable)", viewerGet.status === 200, String(viewerGet.status));
  const ownerDsh = await call(ownerJar, `/api/dsh?projectId=${labId}`);
  check("F3 the OWNER reads the production's direction (bypass intact)", ownerDsh.status === 200);

  // ───────────────────── G. context line + cleanup ─────────────────────
  const ctx = await buildCompactContext(labId);
  check("G1 the context carries the learned sequence flows standing", ctx?.sequenceFlows?.includes("learned sequence flows:") === true && ctx?.sequenceFlows?.includes("BATTLE 'E2E Raid Flow' The Reveal>The Assault (2 runs, 2 clears, 2/2 landed whole)") === true, ctx?.sequenceFlows ?? "null");

  await db.project.delete({ where: { id: labId } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverFlows = await db.sequenceFlow.count({ where: { projectId: labId } });
  const leftoverUser = await db.user.findUnique({ where: { email: `viewer-${MARK}@studio.dev` } });
  if (leftoverUser) await db.user.delete({ where: { id: leftoverUser.id } });
  check("G2 every throwaway row is gone (cascade holds)", !leftover && leftoverFlows === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
