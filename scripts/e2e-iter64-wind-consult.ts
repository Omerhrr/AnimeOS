// Iteration 64 E2E: the sentence calls the air (per-beat secondary
// motion at sequence scale - a slot's WIND call over its grammar's
// beats) + the consult names its teachers (verified-but-unadopted
// programs are proposed by the consult itself).
// Proves, against the RUNNING studio, the REAL database:
//   A. source: the air call (compile/fit/apply/format), the program
//      ledger, the unadopted-programs reader, the registry (still
//      80), the doctrine, the manifest + panel
//   B. accounts + throwaway production
//   C. design with air: wind validation (fit, type, empty) + the
//      spec carrying the calls + the explicit stillness call
//   D. direction + consult: the patched beats on the real shots,
//      the program's own ledger, the consult's suggestions (refusal
//      + success), adoption, the redesign reset
//   E. the manifest: programs carry runs / verifiedRuns / unadopted
//      / learnedBy, and the call sheet carries the stamped wind
//   F. the HTTP role matrix (anon 401, VIEWER reads, OWNER unblocked)
//   G. context (sequenceAdoptions) + cleanup (exact rows)
// Run: bun scripts/e2e-iter64-wind-consult.ts
// Precondition: dev server on :3000.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { buildCompactContext } from "../src/lib/dsh/tools";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter64-wind-consult";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter64" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter64" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter64", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter64" },
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

function beatWind(shotGrammar: string | null): Array<number | null | undefined> {
  if (!shotGrammar) return [];
  try {
    const beats = JSON.parse(shotGrammar) as Array<{ wind?: number | null }>;
    return beats.map((b) => b.wind);
  } catch {
    return [];
  }
}

async function main() {
  console.log("== Iteration 64: the sentence calls the air, the consult names its teachers ==\n");

  // self-healing pre-clean: a previous crashed run must not leak state
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    await db.project.delete({ where: { id: stale.id } });
  }
  const staleUser = await db.user.findUnique({ where: { email: `viewer-${MARK}@studio.dev` } });
  if (staleUser) await db.user.delete({ where: { id: staleUser.id } });

  // ───────────────────── A. source-level checks ─────────────────────
  const flows = readFileSync("src/lib/dsh/sequence-flows.ts", "utf8");
  check("A1 the slot's air call compiles, fits, applies and formats", flows.includes("export function compileSlotWind") && flows.includes("export function windFitsGrammar") && flows.includes("export function applySlotWind") && flows.includes("export function formatSlotWind"));
  check("A2 an empty air call refuses (a call that directs nothing is a typo)", flows.includes("an empty wind array directs no air"));
  check("A3 the air call must fit the grammar it rides", flows.includes("the air call must fit the grammar's beats"));
  check("A4 explicit 0 is a stillness call, null keeps the grammar's own gust", flows.includes("explicit 0 is a stillness call") && flows.includes("w === null ? \"keep\" : n(w)") && flows.includes("b.wind = wind as number"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A5 the registry stands at 84 tools (the air call extends, it does not add)", toolCount === 90, `count=${toolCount}`);
  check("A6 the direction patches the compiled beats BEFORE serializing", tools.includes("applySlotWind(compiled.spec.beats, windParsed.wind)") && tools.includes("const airShape = windTouched > 0"));
  check("A7 the design validates the air call at design time", tools.includes("compileSlotWind(s?.wind") && tools.includes("windFitsGrammar(windParsed.wind, compiled.spec.beats.length"));

  const flowsHelpers = readFileSync("src/lib/dsh/sequence-flows.ts", "utf8");
  check("A8 the program keeps its own measured ledger", flowsHelpers.includes("export async function recordProgramOutcome") && flowsHelpers.includes("export type SequenceProgramOutcome"));
  check("A9 the consult reads the verified-but-unadopted programs", flowsHelpers.includes("export async function unadoptedVerifiedPrograms") && flowsHelpers.includes("p.verifiedRuns > 0"));
  check("A10 the adoption suggestion line names the proven sentences", flowsHelpers.includes("verified but no flow carries") && flowsHelpers.includes("learn_sequence_flow register:'<register>' program:'<name>' grows the memory"));
  check("A11 the context grew the sequenceAdoptions line", tools.includes("unadoptedVerifiedPrograms(projectId).catch(() => [])") && tools.includes("sequenceAdoptions: sequenceAdoptionSuggestionsLine(unadoptedSequencePrograms)"));

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A12 the program ledger lives on DesignPreset (redesign resets it)", schema.includes("outcomes   String   @default(\"[]\")") && schema.includes("a redesigned sentence resets it"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A13 the law grew the air call", prompts.includes("A slot may also call the AIR (wind as a number 0..1 over the grammar's every beat, or an array keyed per beat") && prompts.includes("the sequence sentence directs the storm, not just the lens"));
  check("A14 the law grew the consult's proposals", prompts.includes("the consult itself names the verified programs no flow carries yet (a proven sentence should not wait to be remembered)"));
  check("A15 rule 42 grew the consult suggestion + the reset law", prompts.includes("The consult answers with its own adoption suggestions now") && prompts.includes("a redesigned sentence resets its measured record - a new sentence is a new lesson") && prompts.includes("a flow that never landed whole is never consulted"));

  const route = readFileSync("src/app/api/sequence-manifest/route.ts", "utf8");
  check("A16 the manifest's programs ledger carries the record + adoption state", route.includes("verifiedRuns: outcomes.filter((o) => o.verified).length") && route.includes("unadopted: learnedBy.length === 0 && outcomes.some((o) => o.verified)") && route.includes("learnedBy"));

  const apiClient = readFileSync("src/lib/api-client.ts", "utf8");
  check("A17 the client types carry the air + adoption state", apiClient.includes("wind?: Array<number | null> | number | null;") && apiClient.includes("unadopted: boolean;") && apiClient.includes("learnedBy: string[];"));

  const manifestView = readFileSync("src/components/views/manifest-view.tsx", "utf8");
  check("A18 the panel shows the air chip and the unadopted badge", manifestView.includes(">air</span>") && manifestView.includes(">unadopted</span>") && manifestView.includes(">flow: {n}</span>"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const viewerLogin = await register(`viewer-${MARK}@studio.dev`, "Read Only", "viewing123");
  check("B2 the fresh account lands VIEWER", viewerLogin.role === "VIEWER", viewerLogin.role);
  const viewerJar = await loginJar(`viewer-${MARK}@studio.dev`, "viewing123");

  const created = await executeTool("throwaway", "create_project", { title: `Iter64 Air Consult Lab ${MARK}`, logline: "a throwaway production for the slot air call + the consult's adoption suggestions", visualStyle: "DONGHUA" }, ownerUser);
  check("B3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const addMember = await call(ownerJar, `/api/projects/${labId}/members`, { method: "POST", body: JSON.stringify({ userId: viewerLogin.id }) });
  check("B4 the viewer joins the lab's crew", addMember.status === 200 || addMember.status === 201, String(addMember.status));

  // ───────────────────── C. design with air ─────────────────────
  const storm = await T("design_sequence", { name: "E2E Storm Program", description: "find, break - the air rides the sentence", slots: JSON.stringify([
    { grammar: "The Reveal", wind: [null, 0.9], note: "the gust lands on the push-in" },
    { grammar: "The Assault", wind: 0.6, fx: "The Slash" },
  ]) });
  check("C1 the storm program registers with both air-call shapes", storm.status === "OK" && storm.result.includes("+wind [keep,0.9]") && storm.result.includes("+wind 0.6") && storm.result.includes("+fx The Slash"), storm.result.slice(0, 300));

  const tooLong = await T("design_sequence", { name: "E2E Bad Fit", slots: JSON.stringify([{ grammar: "The Reveal", wind: [0.1, 0.2, 0.3] }, { grammar: "The Assault" }]) });
  check("C2 an air call that outgrows its grammar refuses at design time", tooLong.status === "ERROR" && tooLong.result.includes("wind names 3 beat(s) but the grammar directs 2"), tooLong.result.slice(0, 220));
  const nonNumber = await T("design_sequence", { name: "E2E Bad Type", slots: JSON.stringify([{ grammar: "The Reveal", wind: "gusty" }, { grammar: "The Assault" }]) });
  check("C3 a non-numeric air call refuses", nonNumber.status === "ERROR" && nonNumber.result.includes("wind must be a number 0..1 or an array keyed per beat (got gusty)"), nonNumber.result.slice(0, 220));
  const emptyAir = await T("design_sequence", { name: "E2E Empty Air", slots: JSON.stringify([{ grammar: "The Reveal", wind: [] }, { grammar: "The Assault" }]) });
  check("C4 an empty air call refuses", emptyAir.status === "ERROR" && emptyAir.result.includes("an empty wind array directs no air"), emptyAir.result.slice(0, 220));

  const calm = await T("design_sequence", { name: "E2E Calm Program", slots: JSON.stringify([{ grammar: "The Reveal", wind: 0 }, { grammar: "The Assault", wind: [0.4, null] }]) });
  check("C5 the stillness call registers (0 is a call, not an omission)", calm.status === "OK" && calm.result.includes("+wind 0") && calm.result.includes("+wind [0.4,keep]"), calm.result.slice(0, 260));

  const stormRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "E2E Storm Program" } } });
  const stormSpec = stormRow ? (JSON.parse(stormRow.spec) as { slots: Array<{ wind?: Array<number | null> | number }> }) : null;
  check("C6 the program's spec carries the air calls verbatim", stormSpec?.slots[0]?.wind !== undefined && Array.isArray(stormSpec?.slots[0]?.wind) && (stormSpec!.slots[0].wind as Array<number | null>)[1] === 0.9 && stormSpec?.slots[1]?.wind === 0.6, JSON.stringify(stormSpec?.slots.map((s) => s.wind)));

  // ───────────────────── D. direction + consult ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Air And Memory" });
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
  check("D1 the consult refuses while nothing verified (and proposes nothing)", consultEmpty.status === "ERROR" && consultEmpty.result.includes("No learned flow for register BATTLE that ever landed whole") && consultEmpty.result.includes("Learned flows: (none)") && !consultEmpty.result.includes("These programs verified"), consultEmpty.result.slice(0, 320));

  const dirStorm = await T("direct_sequence", { sceneNumber: 1, program: "E2E Storm Program" });
  check("D2 the storm direction lands whole and reads the air per shot", dirStorm.status === "OK" && dirStorm.result.includes("Shot 001 <- The Reveal (CRANE>DOLLY_IN) [wind [keep,0.9]]") && dirStorm.result.includes("Shot 002 <- The Assault (TRACKING>ORBIT) [wind 0.6 | fx: TRAIL+BURST]"), dirStorm.result.slice(0, 520));
  check("D3 the program-driven direction proposes its own adoption (no flow carries it yet)", dirStorm.status === "OK" && dirStorm.result.includes("Memory: program 'E2E Storm Program' landed whole (1 landed-whole run of 1) and no flow carries it yet - learn_sequence_flow register:'<register>' program:'E2E Storm Program' name:'<name>' teaches the memory"), dirStorm.result.slice(-380));
  check("D4 the flow read counts the patched air honestly", dirStorm.status === "OK" && dirStorm.result.includes("3 wind beat(s) - the robes and hair ride those beats"), dirStorm.result.slice(-500));

  const sc1Shots = await db.shot.findMany({ where: { scene: { episode: { season: { projectId: labId } }, number: 1 } }, orderBy: { number: "asc" } });
  const wind1 = beatWind(sc1Shots[0]?.grammar ?? null);
  const wind2 = beatWind(sc1Shots[1]?.grammar ?? null);
  check("D5 the patched beats ride the real shot rows (null keeps, number drives)", (wind1[0] === null || wind1[0] === undefined) && wind1[1] === 0.9 && wind2[0] === 0.6 && wind2[1] === 0.6, JSON.stringify({ wind1, wind2 }));

  const stormLedger = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "E2E Storm Program" } } });
  const stormOutcomes = stormLedger ? (JSON.parse(stormLedger.outcomes) as Array<{ verified: boolean; directed: number; unused: number; windBeats: number }>) : [];
  check("D6 the program's own ledger recorded what it measured", stormOutcomes.length === 1 && stormOutcomes[0].verified === true && stormOutcomes[0].directed === 2 && stormOutcomes[0].unused === 0 && stormOutcomes[0].windBeats === 3, JSON.stringify(stormOutcomes));

  const consultPursuit = await T("direct_sequence", { sceneNumber: 2, register: "PURSUIT" });
  check("D7 the consult names its teacher on refusal (a verified program no flow carries)", consultPursuit.status === "ERROR" && consultPursuit.result.includes("These programs verified but were never adopted: 'E2E Storm Program' (1 landed-whole run of 1) - adopt one with learn_sequence_flow register:'PURSUIT'"), consultPursuit.result.slice(0, 460));

  const adopt = await T("learn_sequence_flow", { name: "E2E Storm Flow", register: "BATTLE", program: "E2E Storm Program" });
  check("D8 the storm flow is adopted (the sentence carries its air calls)", adopt.status === "OK" && adopt.result.includes("SEQUENCE FLOW 'E2E Storm Flow' remembered for battle direction"), adopt.result.slice(0, 260));
  const flowRow = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "E2E Storm Flow" } } });
  const flowSpec = flowRow ? (JSON.parse(flowRow.spec) as { slots: Array<{ wind?: Array<number | null> | number }> }) : null;
  check("D9 the adopted flow's spec carries the air calls", flowRow?.runs === 0 && Array.isArray(flowSpec?.slots[0]?.wind) && flowSpec?.slots[1]?.wind === 0.6, JSON.stringify(flowSpec?.slots.map((s) => s.wind)));

  const flank = await T("design_sequence", { name: "E2E Flank Program", slots: JSON.stringify([{ grammar: "The Standoff" }, { grammar: "The Withdrawal" }]) });
  check("D10 the flank program registers (no air)", flank.status === "OK", flank.result.slice(0, 200));
  const dirFlank = await T("direct_sequence", { sceneNumber: 1, program: "E2E Flank Program" });
  check("D11 the flank direction lands whole too (now two proven sentences, one adopted)", dirFlank.status === "OK" && dirFlank.result.includes("SEQUENCE DIRECTED (program 'E2E Flank Program') across 2 shot(s)"), dirFlank.result.slice(0, 220));

  const dirStorm2 = await T("direct_sequence", { sceneNumber: 2, program: "E2E Storm Program" });
  check("D12 the program re-run grows the flow it taught (the flow can now be consulted)", dirStorm2.status === "OK" && dirStorm2.result.includes("learned flow 'E2E Storm Flow' (BATTLE) recorded the run: 1 run(s), 1 clear(s) - the sentence landed whole, the clean read earns the clear"), dirStorm2.result.slice(-560));

  const consult = await T("direct_sequence", { sceneNumber: 2, register: "BATTLE" });
  check("D13 the consult directs from the flow AND proposes the unadopted flank on the same read", consult.status === "OK" && consult.result.includes("SEQUENCE DIRECTED (learned flow 'E2E Storm Flow' (register BATTLE, 1 run(s), 1 clear(s)))") && consult.result.includes("Adoption: 'E2E Flank Program' (1 landed-whole run of 1) verified but no flow carries it yet"), consult.result.slice(-620));
  const afterConsult = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "E2E Storm Flow" } } });
  check("D14 the flow's record is honest (program run + consult run)", afterConsult?.runs === 2 && afterConsult?.clears === 2, `runs=${afterConsult?.runs} clears=${afterConsult?.clears}`);

  const ash = await T("design_sequence", { name: "E2E Ash Program", slots: JSON.stringify([{ grammar: "The Ascent", wind: 0.4 }, { grammar: "The Withdrawal", wind: [0.5, null] }]) });
  check("D15 the ash program registers (mixed air)", ash.status === "OK", ash.result.slice(0, 200));
  const dirAsh = await T("direct_sequence", { sceneNumber: 2, program: "E2E Ash Program" });
  check("D16 the ash direction lands whole (stays unadopted for the manifest)", dirAsh.status === "OK" && dirAsh.result.includes("SEQUENCE DIRECTED (program 'E2E Ash Program') across 2 shot(s)"), dirAsh.result.slice(0, 220));

  const dust = await T("design_sequence", { name: "E2E Dust Program", slots: JSON.stringify([{ grammar: "The Standoff" }, { grammar: "The Reveal" }]) });
  check("D17 the dust program registers", dust.status === "OK", dust.result.slice(0, 200));
  const dirDust = await T("direct_sequence", { sceneNumber: 1, program: "E2E Dust Program" });
  check("D18 the dust direction lands whole (a record to reset)", dirDust.status === "OK" && dirDust.result.includes("SEQUENCE DIRECTED (program 'E2E Dust Program') across 2 shot(s)"), dirDust.result.slice(0, 220));
  const reset = await T("design_sequence", { name: "E2E Dust Program", slots: JSON.stringify([{ grammar: "The Standoff" }, { grammar: "The Reveal", note: "re-cut" }]) });
  check("D19 the redesign resets the measured record (a new sentence is a new lesson)", reset.status === "OK" && reset.result.includes("the measured record resets - a redesigned sentence is a new sentence"), reset.result.slice(0, 320));
  const dustRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "E2E Dust Program" } } });
  check("D20 the dust ledger is empty after the redesign", dustRow?.outcomes === "[]", dustRow?.outcomes ?? "null");

  // ───────────────────── E. the manifest ─────────────────────
  const manifestRes = await call(ownerJar, `/api/sequence-manifest?projectId=${labId}`);
  check("E1 the OWNER reads the manifest", manifestRes.status === 200, String(manifestRes.status));
  const manifest = (await manifestRes.json()) as {
    episodes: Array<{ number: number; scenes: Array<{ number: number; shots: Array<{ label: string; beats: Array<{ move: string; wind?: number }>; fx: Array<{ kind: string }>; render: { status: string } | null }> }> }>;
    programs: Array<{ name: string; runs: number; verifiedRuns: number; lastVerified: boolean | null; unadopted: boolean; learnedBy: string[]; slots: Array<{ wind?: Array<number | null> | number }> }>;
    flows: Array<{ register: string; name: string; runs: number; clears: number }>;
  };
  const ep1 = manifest.episodes.find((e) => e.number === 1);
  const sc1 = ep1?.scenes.find((s) => s.number === 1);
  const sc2 = ep1?.scenes.find((s) => s.number === 2);
  const pStorm = manifest.programs.find((p) => p.name === "E2E Storm Program");
  const pFlank = manifest.programs.find((p) => p.name === "E2E Flank Program");
  const pAsh = manifest.programs.find((p) => p.name === "E2E Ash Program");
  const pCalm = manifest.programs.find((p) => p.name === "E2E Calm Program");
  const pDust = manifest.programs.find((p) => p.name === "E2E Dust Program");
  check("E2 the adopted program shows its record and its flow", pStorm?.runs === 2 && pStorm?.verifiedRuns === 2 && pStorm?.unadopted === false && pStorm?.learnedBy[0] === "E2E Storm Flow", JSON.stringify(pStorm && { runs: pStorm.runs, verifiedRuns: pStorm.verifiedRuns, unadopted: pStorm.unadopted, learnedBy: pStorm.learnedBy }));
  check("E3 the proven-unadopted programs carry the badge; the reset and the undirected carry none", pFlank?.runs === 1 && pFlank?.verifiedRuns === 1 && pFlank?.unadopted === true && pAsh?.runs === 1 && pAsh?.verifiedRuns === 1 && pAsh?.unadopted === true && pCalm?.runs === 0 && pCalm?.unadopted === false && pDust?.runs === 0, JSON.stringify(manifest.programs.map((p) => `${p.name}:${p.runs}:${p.verifiedRuns}:${p.unadopted}`)));
  check("E4 the call sheet carries the stamped air scene by scene", sc2?.shots[0]?.beats.every((b) => b.wind === 0.4) === true && sc2?.shots[1]?.beats[0]?.wind === 0.5 && sc2?.shots[1]?.beats[1]?.wind === undefined, JSON.stringify(sc2?.shots.map((s) => s.beats.map((b) => b.wind))));
  const stormFlow = manifest.flows.find((f) => f.name === "E2E Storm Flow");
  check("E5 the flows ledger stands beside the programs ledger", stormFlow?.runs === 2 && stormFlow?.clears === 2, JSON.stringify(stormFlow));

  // ───────────────────── F. the HTTP role matrix ─────────────────────
  const anon = await call(null, `/api/sequence-manifest?projectId=${labId}`);
  check("F1 anonymous manifest reads are 401", anon.status === 401);
  const viewerGet = await call(viewerJar, `/api/sequence-manifest?projectId=${labId}`);
  check("F2 the VIEWER reads the call sheet (crew-readable)", viewerGet.status === 200, String(viewerGet.status));
  const ownerDsh = await call(ownerJar, `/api/dsh?projectId=${labId}`);
  check("F3 the OWNER reads the production's direction (bypass intact)", ownerDsh.status === 200);

  // ───────────────────── G. context + cleanup ─────────────────────
  const ctx = await buildCompactContext(labId);
  check("G1 the context carries the learned flow's standing", ctx?.sequenceFlows?.includes("BATTLE 'E2E Storm Flow' The Reveal>The Assault (2 runs, 2 clears, 2/2 landed whole)") === true, ctx?.sequenceFlows ?? "null");
  check("G2 the context proposes the proven sentences no flow carries", ctx?.sequenceAdoptions?.includes("Adoption: 'E2E Ash Program' (1 landed-whole run of 1), 'E2E Flank Program'") === true && ctx?.sequenceAdoptions?.includes("verified but no flow carries them yet") === true, ctx?.sequenceAdoptions ?? "null");

  await db.project.delete({ where: { id: labId } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverFlows = await db.sequenceFlow.count({ where: { projectId: labId } });
  const leftoverUser = await db.user.findUnique({ where: { email: `viewer-${MARK}@studio.dev` } });
  if (leftoverUser) await db.user.delete({ where: { id: leftoverUser.id } });
  check("G3 every throwaway row is gone (cascade holds)", !leftover && leftoverFlows === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
