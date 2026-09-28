// Iteration 66 E2E: THE SHEET DRESSES THE RENDER - the identity-faithful
// render path. Proves, against the RUNNING studio, the REAL database and
// the REAL Blender runtime:
//   A. source: the sheet-palette module (deterministic measurement, the
//      bounded pull, the honest skips), the render wiring (the hero's
//      sheet is read, measured and planned before the payload), the
//      payload type, the bridge apply (named materials recolored, the
//      state's identity line), the FINAL bounces, the doctrine
//      (THE SHEET DRESSES THE RENDER + rule 44)
//   B. the pure math: a planted-palette sheet measures back its own
//      colors; a far color pulls toward the sheet; a true color skips
//   C. accounts + throwaway production
//   D. a REAL render: the hero's crafted sheet rides the payload as a
//      conformance plan, the worker dresses the named materials and the
//      state's identity line names them; a control render with no sheet
//      carries no identity line
//   E. the HTTP role matrix (anon 401, VIEWER 403, OWNER unblocked)
//   F. cleanup (exact rows, the crafted sheet removed)
// Run: npx tsx scripts/e2e-iter66-sheet-identity.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { extractSheetPalette, planSheetConformance, blendHex, hexDist, BOOTS_DEFAULT } from "../src/lib/blender/sheet-palette";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter66-sheet-identity";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter66" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter66" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter66", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter66" },
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

/** a crafted model sheet: four solid bands so the measured palette is exact */
async function craftSheet(filePath: string): Promise<void> {
  const bands = [
    { r: 192, g: 32, b: 192 },  // magenta
    { r: 192, g: 192, b: 32 },  // chartreuse
    { r: 192, g: 32, b: 32 },   // deep red
    { r: 232, g: 232, b: 232 }, // paper white
  ];
  const width = 64;
  const bandH = 24;
  const rows: Buffer[] = [];
  for (let bi = 0; bi < bands.length; bi++) {
    const row = Buffer.alloc(width * 3);
    for (let x = 0; x < width; x++) {
      row[x * 3] = bands[bi].r;
      row[x * 3 + 1] = bands[bi].g;
      row[x * 3 + 2] = bands[bi].b;
    }
    for (let y = 0; y < bandH; y++) rows.push(row);
  }
  await sharp(Buffer.concat(rows), { raw: { width, height: bandH * bands.length, channels: 3 } })
    .png()
    .toFile(filePath);
}

async function main() {
  console.log("== Iteration 66: the sheet dresses the render - the identity-faithful render path ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const sp = readFileSync("src/lib/blender/sheet-palette.ts", "utf8");
  check("A1 the module teaches the law (the sheet is color law, bounded, honest)", sp.includes("THE SHEET DRESSES THE RENDER") && sp.includes("the sheet pulls, it does not repaint") && sp.includes("never silently applied"));
  check("A2 the measurement is deterministic (quantized clusters, no randomness)", sp.includes("QUANT_SHIFT = 4") && sp.includes("MIN_SHARE = 0.02") && !sp.includes("Math.random"));
  check("A3 the pull is bounded at 35% and true colors skip", sp.includes("CONFORM_FACTOR = 0.35") && sp.includes("SKIP_BELOW = 0.1"));
  check("A4 the graded roles are robe, accent, hair and boots (skin and blade untouched)", sp.includes('mat: "RobeMat"') && sp.includes('mat: "AccentMat"') && sp.includes('mat: "HairMat"') && sp.includes('mat: "BootsMat"') && !sp.includes('"SkinMat"'), sp.includes("SkinMat") ? "SkinMat appears" : "clean");

  const render = readFileSync("src/lib/engine/render.ts", "utf8");
  // bumped at iteration 80: the render path dresses EVERY detected cast
  // member from their own sheet (the per-member loop), not just the hero
  check("A5 the render reads EVERY member's sheet before the payload", render.includes("THE SHEET DRESSES THE RENDER") && render.includes("extractSheetPalette") && render.includes("memberRow?.modelSheetUrl"));
  check("A6 an unreadable sheet is honestly absent (never silently applied)", render.includes("an unreadable sheet is honestly absent"));
  check("A7 every detected member carries their own plan (iteration 80)", render.includes("for (let i = 0; i < detected.length && i < cast.length; i++)") && render.includes("cast[i] = {"));

  const bridgeType = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A8 the wire type carries the conformance", bridgeType.includes("sheetConformance?:"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A9 the worker dresses the NAMED materials from the plan", bridge.includes("THE SHEET DRESSES THE RENDER") && bridge.includes('mat_name = str(row.get("mat") or "") + suffix') && bridge.includes('bpy.data.materials.get(mat_name)') && bridge.includes('"Base Color"].default_value = (r, g, bl, 1.0)'));
  check("A10 the state reports the conformance honestly (per member, applied, skipped)", bridge.includes('state["identity" if cast_idx == 0 else "identityB"] = {') && bridge.includes('"conformed": applied') && bridge.includes('"skipped": skipped'));
  check("A11 FINAL renders read like a room (real bounces; PREVIEW stays flat)", bridge.includes("the FINAL frame reads like a room") && bridge.includes("scn.cycles.diffuse_bounces = 2") && bridge.includes('state["render"] = {"samples"'));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A12 the curriculum grew THE SHEET DRESSES THE RENDER", prompts.includes("- THE SHEET DRESSES THE RENDER") && prompts.includes("dressed in guesses"));
  check("A13 rule 44 teaches the identity read-back", prompts.includes("44. THE SHEET DRESSES THE RENDER") && prompts.includes("a stale sheet dressed into the render is drift rendered on purpose"));

  // ───────────────────── B. the pure math ─────────────────────
  const tmpSheet = path.join(process.cwd(), "tmp", `e2e66-sheet-${Date.now()}.png`);
  fs.mkdirSync(path.dirname(tmpSheet), { recursive: true });
  await craftSheet(tmpSheet);
  const palette = await extractSheetPalette(await fs.promises.readFile(tmpSheet));
  check("B1 the planted bands measure back as the palette", palette.length >= 3 && palette.some((p) => hexDist(p, "#c020c0") < 0.09) && palette.some((p) => hexDist(p, "#c0c020") < 0.09), JSON.stringify(palette));
  const pal2 = await extractSheetPalette(await fs.promises.readFile(tmpSheet));
  check("B2 the measurement is bit-stable across reads", JSON.stringify(palette) === JSON.stringify(pal2));
  const rows = planSheetConformance({ robe: "#2f6d63", accent: "#bfbf21", hair: "#16161d", boots: BOOTS_DEFAULT }, palette);
  const farRows = planSheetConformance({ robe: "#b0483f" }, palette);
  const robeRow = farRows.find((r) => r.role === "robe");
  const accentRow = rows.find((r) => r.role === "accent");
  check("B3 a far color pulls toward its nearest cluster (bounded, no repaint)", !!robeRow && !robeRow.skipped && robeRow.to !== robeRow.from && hexDist(robeRow.from, robeRow.to) <= 0.35, JSON.stringify(robeRow));
  check("B4 the pull lands BETWEEN the DNA and the sheet", !!robeRow && hexDist(robeRow.to, "#c020c0") < hexDist(robeRow.from, "#c020c0"), JSON.stringify(robeRow));
  check("B5 an already-true color skips with its name", !!accentRow && !!accentRow.skipped && accentRow.to === accentRow.from, JSON.stringify(accentRow));
  check("B5b a full palette keeps every distinct band", palette.length === 4, JSON.stringify(palette));
  check("B6 the blend helper is a pure convex step", blendHex("#000000", "#ffffff", 0.5) === "#808080" && blendHex("#102030", "#102030", 0.9) === "#102030");

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter66 Sheet Identity Lab ${MARK}`, logline: "a throwaway production for the sheet-dresses-the-render proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C2 the throwaway identity lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the REAL render: the sheet dresses it ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Palette" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Terrace night", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Palette Saint Wei stands on the terrace at night, robes catching the moonlight", shotType: "WIDE", movement: "STATIC", poseStart: "STANCE", poseEnd: "STANCE" });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the same terrace, empty - nobody stands here", shotType: "MEDIUM", movement: "STATIC" });
  const lin = await T("create_character", { name: "E2E Palette Saint Wei", role: "PROTAGONIST", appearance: "a sword cultivator in storm-blue layered robes with an old-gold sash, ink-black hair tied in a topknot", personality: "stoic" });
  check("D1 the cast registers", lin.status === "OK", lin.result.slice(0, 110));
  const charRow = await db.character.findFirst({ where: { projectId: labId, name: "E2E Palette Saint Wei" } });
  if (!charRow) throw new Error("character missing - cannot continue");
  // the crafted sheet becomes the character's canonical sheet (deterministic
  // fixture seeding - the vision provider is not on trial here)
  const sheetRel = path.join("sheets", `${charRow.id}.png`);
  const sheetAbs = path.join(process.cwd(), "public", sheetRel);
  fs.mkdirSync(path.dirname(sheetAbs), { recursive: true });
  await craftSheet(sheetAbs);
  await db.character.update({ where: { id: charRow.id }, data: { modelSheetUrl: `/${sheetRel}?v=66` } });

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  const shot1 = shots.find((s) => s.number === 1);
  const shot2Row = shots.find((s) => s.number === 2);
  if (!shot1 || !shot2Row) throw new Error("shots missing - cannot continue");

  console.log("   (real render follows - the sheet dresses the figure before frame one)");
  const job = await createRenderJob(labId, shot1.id, "PREVIEW");
  check("D2 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  // the payload is inspectable the moment the worker takes it
  const payloadPath = path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`);
  let payloadConf: { characterName?: string; palette?: string[]; rows?: Array<{ role: string; mat: string; from: string; to: string; delta: number; skipped?: string }> } | null = null;
  for (let i = 0; i < 40 && !payloadConf; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (fs.existsSync(payloadPath)) {
      const raw = JSON.parse(fs.readFileSync(payloadPath, "utf-8")) as { payload?: { shot?: { cast?: Array<{ name?: string; sheetConformance?: typeof payloadConf }> } } };
      const c0 = raw.payload?.shot?.cast?.[0];
      if (c0?.sheetConformance?.rows?.length) payloadConf = c0.sheetConformance;
    }
  }
  check("D3 the payload rides the hero's conformance plan", !!payloadConf && payloadConf.characterName === "E2E Palette Saint Wei" && (payloadConf.palette?.length ?? 0) >= 3, JSON.stringify(payloadConf?.characterName ?? null));
  const appliedPlanRow = payloadConf?.rows?.find((r) => !r.skipped);
  check("D4 the plan carries real pulls (the DNA colors are far from the sheet)", !!appliedPlanRow && appliedPlanRow.from !== appliedPlanRow.to && (payloadConf?.rows?.length ?? 0) === 4, JSON.stringify(payloadConf?.rows?.map((r) => [r.mat, r.skipped ?? "pull"])));
  const planTargetRow = appliedPlanRow;

  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("D5 the dressed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("D6 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = fs.readFileSync(payloadPath, "utf-8");
    const state = JSON.parse(stateRaw) as {
      identity?: { sheet?: string; palette?: string[]; conformed?: Array<{ mat: string; from: string; to: string; delta: number }>; skipped?: Array<{ mat: string; skipped: string }>; law?: string };
      render?: { samples?: number; bounces?: number };
      figureSource?: string;
    };
    check("D7 the worker state carries the identity line", state.identity?.sheet === "E2E Palette Saint Wei" && (state.identity?.palette?.length ?? 0) >= 3, JSON.stringify(state.identity?.sheet ?? null));
    const appliedTarget = state.identity?.conformed?.find((r) => planTargetRow && r.mat === planTargetRow.mat);
    check("D8 the pulled material was dressed exactly as the plan said (plan -> apply contract)", !!appliedTarget && !!planTargetRow && appliedTarget.from === planTargetRow.from && appliedTarget.to === planTargetRow.to && (appliedTarget.delta ?? 0) > 0, JSON.stringify(appliedTarget));
    check("D9 the law is stamped (color law, recipes untouched)", (state.identity?.law ?? "").includes("recipe parameters untouched"), state.identity?.law ?? "none");
    check("D10 the render state reports the flat PREVIEW path honestly", state.render?.samples === 10 && state.render?.bounces === 0, JSON.stringify(state.render));
  }

  // the control render: no cast on the stage - no identity line at all
  const ctrlJob = await createRenderJob(labId, shot2Row.id, "PREVIEW");
  let ctrlFinal = ctrlJob;
  const ctrlDeadline = Date.now() + 480_000;
  while (ctrlFinal.status === "RENDERING" && Date.now() < ctrlDeadline) {
    await new Promise((r) => setTimeout(r, 4000));
    ctrlFinal = (await tickRenderJob(ctrlJob.id))!;
  }
  check("D11 the empty-stage control renders", ctrlFinal.status === "REVIEW", `control ended ${ctrlFinal.status}`);
  if (ctrlFinal.status === "REVIEW") {
    const ctrlRaw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${ctrlJob.id}.json`), "utf-8")) as { identity?: unknown };
    check("D12 an empty stage carries no identity line (nothing was dressed)", ctrlRaw.identity === undefined, JSON.stringify(ctrlRaw.identity));
  }

  // ───────────────────── E. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "dress the render" }) });
  check("E1 anonymous direction is 401", anon.status === 401);
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  const viewerPost = await call(viewerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "dress the render" }) });
  check("E2 a VIEWER cannot direct the render path (403)", viewerPost.status === 403);
  const ownerRenders = await call(ownerJar, `/api/render-jobs?projectId=${labId}`);
  check("E3 the OWNER reads the render standing anywhere (bypass intact)", ownerRenders.status === 200);

  // ───────────────────── F. cleanup (exact rows + the crafted sheet) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  fs.rmSync(sheetAbs, { force: true });
  fs.rmSync(tmpSheet, { force: true });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  check("F1 every throwaway row is gone (cascade holds)", !leftover);
  for (const jid of [job.id, ctrlJob.id]) {
    try {
      fs.rmSync(path.join(process.cwd(), "public", "renders", `.job-${jid}.json`), { force: true });
    } catch {
      // best effort
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("E2E crashed:", e);
    process.exit(1);
  });
