// ─────────────────────────────────────────────────────────────
// E2E ITERATION 149 - THE REFERENCE DOES NOT MOVE UNDER AN HONEST
// RECEIPT (the sheet acceptance) + THE FX TRANSPORT GUARD.
//
// The 148 night's finding, named: the repair's re-anchor beat
// regenerated the canonical sheet for every still-below member with
// no acceptance and no stability - 4/4 re-renders completed under
// the scaled wait and the pixels were sheet-credible, but the
// judge's reference moved under them (the 146 night's +25 and the
// 148 night's minus rode the SAME beat). A sheet that changes every
// regeneration is not a reference.
//
// THE FIX, two laws:
//   THE SHEET ACCEPTANCE (the night130 law, completed): the re-anchor
//   beat gates on the member's BUILD DNA measured against the
//   committed design dyes (designDyeClass - value AND hue). An honest
//   build means the reference STANDS (the still-below is named, the
//   beat stands down, no image is even generated); a drifted build
//   owes a bounded best-of-3 candidates, each measured in its OWN
//   pixels BEFORE it may install; a channel that keeps its drift
//   keeps its standing sheet. The candidate path (install: false)
//   never touches the standing file or the row - the acceptance
//   decides. Only an ACCEPTED sheet re-scores the shots.
//   THE FX TRANSPORT GUARD (the 115 sheen law's finished sentence,
//   light-side per the 141 discipline): the fx emitters lose DIFFUSE
//   ray visibility (the flood that re-dyes the hero's dark masses
//   dies) and one bounded point light of the program's own hue
//   re-carries the ambience - the show stays with the camera, the
//   glint stays with the glossy rays, the masses keep the dye's
//   class. (The material-side cures of the 141 night were cut by
//   their own receipts; the lever is light-side or nothing.)
//
// This gate proves the laws end to end:
//   A  the source law (the versions, the acceptance wiring, the
//      stood-down no-rescore structure, the candidate path, the
//      standing tick-budget + arc laws unmoved)
//   B  the PURE gate (the three verdicts; the 129 blue-robe case
//      through the real measure; the absent-sheet read)
//   C  the REAL stand-down through the real lib functions (a real
//      sheet on a real lab character; an honest build; NO image
//      generation - the row, the file bytes and the event stream
//      all stand still)
//   D  the REAL regen-owed invariant (the 129 blue build; the bounded
//      candidates through the real image channel; EITHER an accepted
//      sheet installed with its canonical events OR the channel kept
//      its drift and the standing sheet stands byte-exact)
//   E  the anti-fabrication law (the production receipt's bytes are
//      untouched) + the fx guard rides the worker source
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter149-reference.ts
// (needs the dev server + the image channel: the lab sheets are REAL)
// ─────────────────────────────────────────────────────────────

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import {
  runIdentityRepairPass, REPAIR_LAW_VERSION, REPAIR_STALL_TICKS, REPAIR_MAX_WAIT_TICKS,
} from "../src/lib/identity-repair";
import {
  acceptanceGateVerdict, measureSheetClass, reanchorWithSheetAcceptance,
  SHEET_ACCEPT_ATTEMPTS, REANCHOR_DEFAULT_RESCORE,
} from "../src/lib/reanchor";
import { designDyeClass } from "../src/lib/blender/sheet-palette";
import { characterDesignDna } from "../src/lib/animation/design";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const MARK = "iter149-reference";

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
  get header() {
    return [...this.m.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`http://localhost:3000/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`register ${email}: ${res.status}`);
  const jar = new Jar();
  const csrfRes = await fetch(`http://localhost:3000/api/auth/csrf`, { headers: { cookie: jar.header } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const callback = await fetch(`http://localhost:3000/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": `e2e-${MARK}`, cookie: jar.header },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
  });
  jar.absorb(callback);
  const probe = await fetch(`http://localhost:3000/api/projects`, { headers: { cookie: jar.header } });
  if (probe.status !== 200) throw new Error(`login failed for ${email}`);
  const me = (await (await fetch(`http://localhost:3000/api/auth/session`, { headers: { cookie: jar.header } })).json()) as { user?: { id?: string; role?: string } };
  return { id: me.user?.id ?? "", role: me.user?.role ?? "" };
}

function sheetPath(modelSheetUrl: string | null | undefined): string {
  return path.join(process.cwd(), "public", (modelSheetUrl ?? "").split("?")[0]);
}

function fileBytes(p: string): string {
  try { return readFileSync(p).toString("base64"); } catch { return "ABSENT"; }
}

async function cleanupLab(labId: string): Promise<void> {
  const labJobs = await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  for (const r of labJobs) {
    if (r.outputUrl) {
      const p = path.join(process.cwd(), "public", r.outputUrl);
      if (existsSync(p)) unlinkSync(p);
    }
    const st = path.join(process.cwd(), "public", "renders", `.job-${r.id}.json`);
    if (existsSync(st)) unlinkSync(st);
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderReview.deleteMany({ where: { projectId: labId } });
  await db.identityArcReading.deleteMany({ where: { projectId: labId } });
  await db.identityScore.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.continuityEvent.deleteMany({ where: { projectId: labId } });
  const labChars = await db.character.findMany({ where: { projectId: labId } });
  for (const c of labChars) {
    for (const f of [`${c.id}.png`, `${c.id}-dna.json`, `${c.id}.candidate.png`]) {
      const p = path.join(process.cwd(), "public", "sheets", f);
      if (existsSync(p)) unlinkSync(p);
    }
  }
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function main() {
  console.log("== Iteration 149: THE REFERENCE DOES NOT MOVE UNDER AN HONEST RECEIPT ==\n");

  // ───────────────────── A. the source law ─────────────────────
  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  const reanchorSrc = readFileSync("src/lib/reanchor.ts", "utf8");
  const artSrc = readFileSync("src/lib/ai/art.ts", "utf8");
  const arcSrc = readFileSync("src/lib/identity-arc.ts", "utf8");
  const fxSrc = readFileSync("bridges/blender/fx_pass.py", "utf8");

  check("A1a the repair lib carries the reference law version (149)",
    repairSrc.includes(`export const REPAIR_LAW_VERSION = ${REPAIR_LAW_VERSION}`) && REPAIR_LAW_VERSION === 149);
  check("A1b the re-anchor beat rides the sheet acceptance",
    repairSrc.includes("reanchorWithSheetAcceptance") && repairSrc.includes("buildRobe"),
    "the beat passes the fresh DNA read's robe to the gate");
  check("A1c only an ACCEPTED sheet re-scores the shots (the stood-down beat keeps the re-render verdicts)",
    repairSrc.includes("a stood-down beat keeps the re-render verdicts") &&
    repairSrc.indexOf("ra.accepted && ra.result") !== -1,
    "re-judging the same pixels against the same sheet is variance double-dipping");
  check("A1d the acceptance law lives in the re-anchor's home",
    reanchorSrc.includes("SHEET_ACCEPT_ATTEMPTS = 3") && reanchorSrc.includes("acceptanceGateVerdict") &&
    reanchorSrc.includes("measureSheetClass") && reanchorSrc.includes("reanchorCharacter"),
    "bounded best-of 3 (the night130 bound); the canonical decision stands beside it");
  check("A1e the candidate path never touches the standing reference",
    artSrc.includes("install?: boolean") && artSrc.includes(".candidate.png") &&
    artSrc.includes("THE CANDIDATE IS NOT THE REFERENCE"));
  check("A1f the tick-budget law stands (the 147 constants did not move)",
    REPAIR_STALL_TICKS === 240 && REPAIR_MAX_WAIT_TICKS === 2640);
  check("A1g the arc law version stands at 146",
    arcSrc.includes("export const IDENTITY_ARC_LAW_VERSION = 146"));

  // ───────────────────── B. the pure gate ─────────────────────
  check("B1a an honest build stands down (the reference does not move)",
    acceptanceGateVerdict(false) === "STAND_DOWN_HONEST");
  check("B1b a drifted build owes the bounded regen",
    acceptanceGateVerdict(true) === "REGEN_OWED");
  check("B1c no dyes to judge - the canonical decision answers (named)",
    acceptanceGateVerdict(null) === "CANONICAL_FALLTHROUGH");
  check("B1d the 129 blue-robe case reads OUT through the real measure (value in, hue out)",
    (() => { const c = designDyeClass("#285578", "#2f6d63"); return c.out === true && !c.valueOut && c.hueOut === true; })(),
    JSON.stringify(designDyeClass("#285578", "#2f6d63")));
  check("B1e the design's own dye reads IN (the honest receipt exists)",
    designDyeClass("#2f6d63", "#2f6d63").out === false);
  check("B1f an absent sheet measures honestly unmeasurable",
    (await measureSheetClass("/sheets/definitely-absent-149.png", "#2f6d63")).measured === false);

  // ───────────────────── C/D. the REAL reference laws ─────────────────────
  const prodReceiptBefore = (() => {
    try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
  })();

  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }

  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C0a the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter149 Reference Lab ${MARK}`, logline: "a throwaway production for the sheet-acceptance proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C0b the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  try {
    await T("create_episode", { title: "The Standing Reference", count: 1 });
    const hero = await db.character.create({
      data: {
        projectId: labId, name: "Lin Yue", role: "PROTAGONIST",
        // the design text compiles the committed robe dye (jade robes ->
        // #2f6d63, the exact 129 case's design dye)
        appearance: JSON.stringify({ notes: "young cultivator in deep jade robes, black hair, calm eyes" }),
      },
    });

    const realSheet = await T("generate_model_sheet", { characterName: "Lin Yue" });
    const heroRow = await db.character.findUnique({ where: { id: hero.id } });
    check("C0c the REAL model sheet generated and anchored",
      realSheet.status === "OK" && Boolean(heroRow?.modelSheetUrl), realSheet.result.slice(0, 140));

    const design = characterDesignDna({
      name: heroRow!.name, role: heroRow!.role, appearance: heroRow!.appearance,
      modelSheetPrompt: heroRow!.modelSheetPrompt, stateClothing: null, stateWeapon: null,
    });
    check("C0d the lab design carries the committed jade robe dye",
      design.robeColor === "#2f6d63", `robeColor ${design.robeColor}`);

    const standingBytes = fileBytes(sheetPath(heroRow!.modelSheetUrl));
    const promptBefore = heroRow!.modelSheetPrompt;

    // ── C: the REAL stand-down (the honest receipt) ──
    const honest = await reanchorWithSheetAcceptance(hero.id, { buildRobe: design.robeColor, actor: "DSH" });
    check("C1a the honest build STANDS DOWN", honest.ok && honest.verdict === "STAND_DOWN_HONEST" && honest.accepted === false, honest.ok ? honest.note : String(honest.error));
    check("C1b the stand-down generates NOTHING (attempts 0)",
      honest.ok && honest.attempts === 0);
    check("C1c the standing sheet's bytes stand untouched",
      fileBytes(sheetPath(heroRow!.modelSheetUrl)) === standingBytes);
    check("C1d the anchor stands untouched",
      (await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetPrompt === promptBefore);
    const reanchorEventsAfterC = await db.productionEvent.count({ where: { projectId: labId, type: "REANCHOR" } });
    check("C1e no canonical event fired on a stand-down", reanchorEventsAfterC === 0);
    check("C1f the gate's read rides the outcome (the numbers the note names)",
      honest.ok && honest.gate.buildRobe === "#2f6d63" && honest.gate.designRobe === "#2f6d63");

    // ── D: the REAL regen-owed (the 129 blue build) ──
    const drifted = await reanchorWithSheetAcceptance(hero.id, { buildRobe: "#285578", actor: "DSH" });
    check("D1a the blue build owes the regen (REGEN_OWED)",
      drifted.ok && drifted.verdict === "REGEN_OWED", drifted.ok ? drifted.note : String(drifted.error));
    check("D1b the attempts stay inside the bound", drifted.ok && drifted.attempts >= 1 && drifted.attempts <= SHEET_ACCEPT_ATTEMPTS,
      `attempts ${drifted.attempts}`);

    const afterRow = await db.character.findUnique({ where: { id: hero.id } });
    const reanchorEvents = await db.productionEvent.findMany({ where: { projectId: labId, type: "REANCHOR" }, orderBy: { createdAt: "asc" } });
    if (drifted.ok && drifted.accepted) {
      // the accepted branch: the reference moved LAWFULLY - measured IN
      // class first, both canonical events, the row moved
      check("D2a the accepted sheet installed through the hue-class receipt",
        reanchorEvents.length === 1 && reanchorEvents[0].summary.includes("ACCEPTED") && reanchorEvents[0].summary.includes("hue-class honest receipt"),
        reanchorEvents[0]?.summary.slice(0, 140) ?? "no event");
      check("D2b the reference's ART moved under the acceptance (url re-versioned, bytes changed) while the anchor TEXT stands (it compiles from the design, not the pixels)",
        afterRow?.modelSheetUrl !== heroRow!.modelSheetUrl &&
        fileBytes(sheetPath(afterRow?.modelSheetUrl)) !== standingBytes &&
        afterRow?.modelSheetPrompt === promptBefore);
      check("D2c the canonical sheet file exists and the candidate path is gone",
        existsSync(sheetPath(afterRow?.modelSheetUrl)) && !existsSync(path.join(process.cwd(), "public", "sheets", `${hero.id}.candidate.png`)));
    } else {
      // the kept-drift branch: the standing sheet stands byte-exact,
      // no event, the refusal NAMED
      check("D2a the channel kept its drift - the standing sheet stands byte-exact",
        fileBytes(sheetPath(afterRow?.modelSheetUrl)) === standingBytes,
        "never install an un-honest sheet");
      check("D2b no canonical event fired on a kept-drift refusal", reanchorEvents.length === 0);
      check("D2c the refusal is NAMED in the note",
        drifted.ok && drifted.note.includes("the channel kept its drift"), drifted.ok ? drifted.note : "");
    }

    // the repair loop's wiring rides the same gate (source-level: the
    // real loop needs a render + a below standing - the 146/147 gates
    // carry that proof; here the beat's OWN decision is the law)
    check("D3 the repair pass exports the law its beat rides",
      typeof runIdentityRepairPass === "function" && repairSrc.includes("THE REFERENCE DOES NOT MOVE UNDER AN HONEST RECEIPT"));

    // ── E: the fx guard rides the worker source + the anti-fabrication law ──
    check("E1a the fx emitters lose diffuse transport in the worker source",
      fxSrc.includes("visible_diffuse = False") && fxSrc.includes("THE FX TRANSPORT GUARD"));
    check("E1b the transport light is bounded and deterministic",
      fxSrc.includes("FX_TRANSPORT_SHARE = 0.35") && fxSrc.includes("FX_TRANSPORT_WATTS = 60.0") &&
      fxSrc.includes("def fx_transport_energy"));
    check("E1c the re-anchor scoring default stands (the canonical path did not move)",
      REANCHOR_DEFAULT_RESCORE === 3);

    const prodReceiptAfter = (() => {
      try { return readFileSync("receipts/identity-arc.jsonl", "utf8"); } catch { return "ABSENT"; }
    })();
    check("E2 the production receipt's bytes are untouched through the whole run",
      prodReceiptBefore === prodReceiptAfter);
  } finally {
    await cleanupLab(labId);
    console.log("\n(lab cleaned - the no-residue law)");
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - e2e-iter149-reference`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("e2e failed:", e); process.exit(1); });
