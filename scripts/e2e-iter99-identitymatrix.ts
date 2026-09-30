// Iteration 99 E2E: THE DISTRIBUTION IS THE RELEASE (the Distributional
// Identity matrix). Proves, against the RUNNING studio, the REAL
// database and the real per-character vision readings:
//   A. source: the matrix law (TS), the DSH tool, the registry at 89
//   B. pure: the five bucket laws (framing / yaw / lighting / state /
//      expression - the SAME derivation the payload rides), the
//      distribution law (mean / median / nearest-rank p10 / worst,
//      exact values), the release-floor verdict boundaries
//      (RELEASE / HOLD / BELOW / UNSCORED), the rollup + the line
//   C. accounts + throwaway production: a REAL cast and a REAL shot
//      vocabulary spanning all five axes, REAL persisted per-character
//      readings (the same rows the cast standing reads)
//   D. the REAL loader: the matrix over the lab cell-by-cell
//      bit-exact (overall + all five axes + per-member slices), the
//      UNSCORED member riding along, the STANDING beside (the teeth
//      stay: any reading under the bar still puts its member BELOW)
//   E. the DSH tool reads the matrix (release answer + named cells +
//      the unscored member), the panel source honestly unscored; the
//      viewer gate; exact cleanup
// Run: PHASE=a|b|all npx tsx scripts/e2e-iter99-identitymatrix.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { castIdentityMeasurement } from "../src/lib/identity";
import {
  MATRIX_AXES,
  identityFramingBucket, identityYawBucket, identityLightingBucket, identityStateBucket, identityExpressionBucket,
  identityDistribution, identityMatrixFromRows, identityMatrixData, identityMatrixLine,
  type MatrixAxisTable, type MatrixReadingRow,
} from "../src/lib/identity-matrix";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter99-identitymatrix";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}
const close = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) < eps;
const cellOf = (tbl: MatrixAxisTable, key: string) => tbl.cells.find((c) => c.key === key);

// ── the crafted lab: six shots spanning all five axes, two scored
//    members + one unscored rider. The readings are HAND-CHOSEN so
//    every cell's stats are assertable bit-exactly. ──
const LAB_SHOTS = [
  { number: 1, description: "She roars and her fury fills the night as the blade circles", shotType: "CLOSEUP", movement: "ORBIT", poseStart: "STANCE", poseEnd: null as string | null, lighting: "moonlit night" },
  { number: 2, description: "She walks the ridge alone, quiet beneath the first light", shotType: "WIDE", movement: "STATIC", poseStart: "WALK", poseEnd: null as string | null, lighting: "dawn light" },
  { number: 3, description: "Tears stream down her face as she crouches by the fall", shotType: "MEDIUM", movement: "DOLLY_IN", poseStart: "CROUCH", poseEnd: null as string | null, lighting: "Moonlight + storm clouds" },
  { number: 4, description: "She gasps at the blade's edge, eyes wide", shotType: "EXTREME_CLOSEUP", movement: "PAN", poseStart: "STANCE", poseEnd: null as string | null, lighting: "Blade emission + rim light" },
  { number: 5, description: "The valley sleeps below the cliff path", shotType: "ESTABLISHING", movement: "CRANE", poseStart: null as string | null, poseEnd: null as string | null, lighting: "Cold key, deep shadow" },
  { number: 6, description: "She steels herself and rises from the crouch", shotType: "LOW_ANGLE", movement: "TRACKING", poseStart: "CROUCH", poseEnd: "RISE", lighting: "Aura glow + lightning" },
];
// per shot: [Lin Yue, Bai Ling] - Lin RELEASES, Bai's tail dips (HOLD)
const LIN = [0.92, 0.88, 0.85, 0.9, 0.86, 0.83];
const BAI = [0.86, 0.84, 0.76, 0.88, 0.72, 0.55];

async function cleanupLab(labId: string): Promise<void> {
  const labChars = await db.character.findMany({ where: { projectId: labId } });
  for (const c of labChars) {
    const sheetPath = path.join(process.cwd(), "public", "sheets", `${c.id}.png`);
    if (existsSync(sheetPath)) unlinkSync(sheetPath);
  }
  await db.identityScore.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email, name, password }),
  });
  const body = (await res.json()) as { user?: { id: string; role: string } };
  if (res.ok) return { id: body.user?.id ?? "", role: body.user?.role ?? "" };
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": `e2e-${MARK}` };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": `e2e-${MARK}` } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": `e2e-${MARK}`, cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function run() {
  console.log(`== Iteration 99: the distribution is the release (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };

  if (PHASE === "b" || PHASE === "b2") {
    const labRow = await db.project.findFirst({ where: { title: { contains: MARK } } });
    if (!labRow) throw new Error(`phase ${PHASE}: the lab is missing - run PHASE=a first`);
    labId = labRow.id;
    const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
    ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
  }

  if (PHASE === "a" || PHASE === "all") {

  // ── A. the source stands ──
  const src = readFileSync("src/lib/identity-matrix.ts", "utf8");
  check("A1 the matrix law stands (buckets, distribution, verdict, rollup, loader, line)",
    src.includes("export function identityFramingBucket") && src.includes("export function identityYawBucket")
    && src.includes("export function identityLightingBucket") && src.includes("export function identityStateBucket")
    && src.includes("export function identityExpressionBucket") && src.includes("export function identityDistribution")
    && src.includes("export function identityMatrixFromRows") && src.includes("export async function identityMatrixData")
    && src.includes("export function identityMatrixLine") && src.includes("export const MATRIX_AXES"));
  check("A2 the release floor is judged distributionally (p10 nearest-rank, the body/tail split)",
    src.includes("Math.ceil(0.1 * n)") && src.includes('"RELEASE" | "HOLD" | "BELOW" | "UNSCORED"')
    && src.includes("mean < floor || median < floor"));
  check("A3 the expression bucket rides the SAME law the payload rides (parseExpressionClip)",
    src.includes('from "@/lib/blender/expressions"') && src.includes("parseExpressionClip(description, poseStart, poseEnd).emotion"));
  check("A4 the matrix reads the SAME per-character entries the standing reads (no new judge)",
    src.includes("entry.characterName") && src.includes("identityThresholdFor") === false && src.includes("IDENTITY_RENDER_THRESHOLD"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A5 the registry stands at 89 tools (the matrix joins by name)", toolCount === 90, `count=${toolCount}`);
  check("A6 the identity_matrix tool teaches THE DISTRIBUTION IS THE RELEASE",
    tools.includes('name: "identity_matrix"') && tools.includes("THE DISTRIBUTION IS THE RELEASE")
    && tools.includes("identityMatrixData(projectId, source)") && tools.includes("identityMatrixLine(m)"));

  // ── B. the pure laws ──
  check("B1 the framing bucket: the close list mirrors the groom's hero framings",
    identityFramingBucket("CLOSEUP") === "close" && identityFramingBucket("EXTREME_CLOSEUP") === "close"
    && identityFramingBucket("MCU") === "close" && identityFramingBucket("WIDE") === "wide"
    && identityFramingBucket("WS") === "wide" && identityFramingBucket("ESTABLISHING") === "wide"
    && identityFramingBucket("OTS") === "wide" && identityFramingBucket("MEDIUM") === "med"
    && identityFramingBucket("MED") === "med" && identityFramingBucket("LOW_ANGLE") === "med"
    && identityFramingBucket("garbage") === "med" && identityFramingBucket(null) === "med");
  check("B2 the yaw bucket: the lens's yaw family from the movement grammar",
    identityYawBucket("ORBIT") === "yawing" && identityYawBucket("PAN") === "yawing"
    && identityYawBucket("DOLLY_IN") === "traveling" && identityYawBucket("TRACKING") === "traveling"
    && identityYawBucket("CRANE") === "traveling" && identityYawBucket("STATIC") === "locked"
    && identityYawBucket(null) === "locked" && identityYawBucket("spin") === "locked");
  check("B3 the lighting bucket: the light families the words name, first match owns",
    identityLightingBucket("moonlit night") === "night" && identityLightingBucket("Moonlight + storm clouds") === "storm"
    && identityLightingBucket("dawn light") === "dawn" && identityLightingBucket("Aura glow + lightning") === "storm"
    && identityLightingBucket("Blade emission + rim light") === "emission"
    && identityLightingBucket("Cold key, deep shadow") === "shadow" && identityLightingBucket("Backlight + interior shadows") === "shadow"
    && identityLightingBucket("torchlit corridor") === "fire" && identityLightingBucket("high noon") === "day"
    && identityLightingBucket("") === "unlit" && identityLightingBucket(null) === "unlit"
    && identityLightingBucket("some weird sauce") === "unlit");
  check("B4 the state bucket: the pose the body opens in, unset named honestly",
    identityStateBucket("CROUCH") === "CROUCH" && identityStateBucket(" stance ") === "STANCE"
    && identityStateBucket(null) === "unset" && identityStateBucket("") === "unset");
  check("B5 the expression bucket: the shot's own drama (the payload's derivation)",
    identityExpressionBucket("She roars at the gate", null, null) === "anger"
    && identityExpressionBucket("Tears stream down her face", null, null) === "grief"
    && identityExpressionBucket("She gasps at the blade", null, null) === "surprise"
    && identityExpressionBucket("She steels herself", null, null) === "resolve"
    && identityExpressionBucket(null, "FALL", null) === "fear"
    && identityExpressionBucket(null, "LUNGE", "SLASH") === "resolve"
    && identityExpressionBucket("The valley sleeps", null, null) === "calm");

  // the distribution law, exact values
  const d6 = identityDistribution([0.5, 0.6, 0.7, 0.8, 0.9, 1.0], 0.7);
  check("B6 the distribution law: mean/median/p10/worst exact over six readings",
    d6.n === 6 && close(d6.mean, 0.75) && close(d6.median, 0.75) && close(d6.p10, 0.5)
    && close(d6.worst, 0.5) && close(d6.best, 1.0) && d6.belowFloor === 2 && close(d6.belowFraction ?? -1, 1 / 3)
    && d6.verdict === "HOLD",
    JSON.stringify(d6));
  check("B7 RELEASE: the tail and the body both clear",
    identityDistribution([0.7, 0.8, 0.9], 0.7).verdict === "RELEASE"
    && identityDistribution([0.9], 0.7).verdict === "RELEASE"
    && identityDistribution([0.7, 1.0], 0.7).verdict === "RELEASE");
  check("B8 HOLD: the body clears, the tail dips (the boundary pair)",
    identityDistribution([0.65, 1.0], 0.7).verdict === "HOLD"
    && close(identityDistribution([0.65, 1.0], 0.7).p10 ?? -1, 0.65)
    && close(identityDistribution([0.65, 1.0], 0.7).mean ?? -1, 0.825));
  check("B9 BELOW: the body itself sits under (mean OR median)",
    identityDistribution([0.4, 0.5, 0.6], 0.7).verdict === "BELOW"
    && identityDistribution([0.5], 0.7).verdict === "BELOW"
    && identityDistribution([0.9, 0.2, 0.2], 0.7).verdict === "BELOW");
  const d0 = identityDistribution([], 0.7);
  check("B10 UNSCORED: nothing measured, named - never guessed",
    d0.n === 0 && d0.mean === null && d0.median === null && d0.p10 === null && d0.verdict === "UNSCORED"
    && d0.belowFraction === null);
  check("B11 the nearest-rank law: p10 IS the worst through ten readings, then the rank moves",
    close(identityDistribution([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], 0.7).p10 ?? -1, 0.1)
    && close(identityDistribution([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0], 0.7).p10 ?? -1, 0.2)
    && identityDistribution([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0], 0.7).verdict === "BELOW");
  check("B12 the below share rides the distribution",
    close(identityDistribution([0.5, 0.6, 0.8, 0.9], 0.7).belowFraction ?? -1, 0.5)
    && identityDistribution([0.5, 0.6, 0.8, 0.9], 0.7).verdict === "HOLD"
    && close(identityDistribution([0.5, 0.6, 0.8, 0.9], 0.7).mean ?? -1, 0.7));

  // the rollup law over crafted rows (pure - no DB)
  const rows: MatrixReadingRow[] = [
    { characterId: "c1", characterName: "Lin Yue", similarity: 0.9, shotId: "s1", ref: "E1 Sc1 S001", framing: "close", yaw: "yawing", expression: "anger", lighting: "night", state: "STANCE" },
    { characterId: "c1", characterName: "Lin Yue", similarity: 0.8, shotId: "s2", ref: "E1 Sc1 S002", framing: "wide", yaw: "locked", expression: "calm", lighting: "dawn", state: "WALK" },
    { characterId: "c2", characterName: "Bai Ling", similarity: 0.5, shotId: "s3", ref: "E1 Sc1 S003", framing: "close", yaw: "yawing", expression: "anger", lighting: "night", state: "STANCE" },
  ];
  const m3 = identityMatrixFromRows(rows, 0.7, "RENDER");
  check("B13 the rollup: the overall cell carries every reading",
    m3.readings === 3 && m3.overall.n === 3 && close(m3.overall.mean ?? -1, 0.7333333333333333)
    && close(m3.overall.p10 ?? -1, 0.5) && close(m3.overall.worst ?? -1, 0.5) && m3.overall.verdict === "HOLD"
    && m3.overall.worstRef === "E1 Sc1 S003");
  check("B14 the rollup: the axes slice by their own bucket (the anger cell pools both members)",
    m3.axes.length === 5 && m3.axes.map((t) => t.axis).join(",") === MATRIX_AXES.join(",")
    && close(cellOf(m3.axes[0], "close")?.p10 ?? -1, 0.5) && close(cellOf(m3.axes[0], "close")?.mean ?? -1, 0.7)
    && close(cellOf(m3.axes[2], "anger")?.mean ?? -1, 0.7) && cellOf(m3.axes[2], "anger")?.n === 2
    && cellOf(m3.axes[2], "calm")?.n === 1);
  check("B15 the rollup: members ordered worst-p10 first, each sliced on every axis",
    m3.members.length === 2 && m3.members[0].name === "Bai Ling" && m3.members[1].name === "Lin Yue"
    && m3.members[0].overall.verdict === "BELOW" && m3.members[1].overall.verdict === "RELEASE"
    && m3.members[0].axes.length === 5 && close(cellOf(m3.members[1].axes[0], "wide")?.mean ?? -1, 0.8));
  const line3 = identityMatrixLine(m3);
  check("B16 the line reads honest (verdict, named cells, members)",
    line3.includes("the production HOLDS") && line3.includes("p10 50%") && line3.includes("framing:")
    && line3.includes("Bai Ling - BELOW") && line3.includes("Lin Yue - RELEASES"),
    line3.slice(0, 220));
  const line0 = identityMatrixLine(identityMatrixFromRows([], 0.7, "RENDER"));
  check("B17 the empty line names itself (score the renders first)",
    line0.includes("nothing measured"), line0);

  // ── C. the lab: a REAL production, REAL cast, REAL persisted readings ──
  const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
  ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
  check("C1 the owner stands", owner.id !== "" && owner.role === "OWNER", `role=${owner.role}`);

  const created = await executeTool("throwaway", "create_project", { title: `Iter99 Matrix Lab ${MARK}`, logline: "a throwaway production for the distributional identity matrix proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C2 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Distribution Arc", count: 1 });
  check("C3 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Night Ridge" } });
  }
  const shots: Record<number, { id: string; shotType: string; movement: string | null; poseStart: string | null; poseEnd: string | null; lighting: string | null; description: string }> = {};
  for (const d of LAB_SHOTS) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, shotType: d.shotType, movement: d.movement, poseStart: d.poseStart, poseEnd: d.poseEnd, lighting: d.lighting, duration: 2.5 } });
    shots[d.number] = { id: s.id, shotType: s.shotType, movement: s.movement, poseStart: s.poseStart, poseEnd: s.poseEnd, lighting: s.lighting, description: s.description };
  }
  check("C4 the six-shot axis vocabulary stands", Object.keys(shots).length === 6);

  const hero = await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });
  const rival = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "RIVAL" } });
  const rider = await db.character.create({ data: { projectId: labId, name: "Demon Lord Wei", role: "ANTAGONIST" } });
  check("C5 the three-member lab cast exists (two scored, one rider)", !!hero && !!rival && !!rider);

  // the two scored members anchor (flat real sheets) - the matrix
  // needs no anchor, but the STANDING beside it does (the unanchored
  // cannot answer the bar)
  for (const c of [hero, rival]) {
    const sheetPath = path.join(process.cwd(), "public", "sheets", `${c.id}.png`);
    execSync(`mkdir -p "$(dirname "${sheetPath}")" && ffmpeg -y -loglevel error -f lavfi -i color=c=0x2a4d69:s=512x512 -frames:v 1 "${sheetPath}"`);
    await db.character.update({ where: { id: c.id }, data: { modelSheetUrl: `/sheets/${c.id}.png`, modelSheetPrompt: "iter99 matrix lab anchor (E2E flat)", modelSheetAt: new Date() } });
  }
  check("C5b the two scored members anchored (the standing can read them)",
    !!(await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl
    && !!(await db.character.findUnique({ where: { id: rival.id } }))?.modelSheetUrl);

  // the buckets the loader MUST derive from these shots (hand-derived)
  const wantBuckets = [
    { framing: "close", yaw: "yawing", expression: "anger", lighting: "night", state: "STANCE" },
    { framing: "wide", yaw: "locked", expression: "calm", lighting: "dawn", state: "WALK" },
    { framing: "med", yaw: "traveling", expression: "grief", lighting: "storm", state: "CROUCH" },
    { framing: "close", yaw: "yawing", expression: "surprise", lighting: "emission", state: "STANCE" },
    { framing: "wide", yaw: "traveling", expression: "calm", lighting: "shadow", state: "unset" },
    { framing: "med", yaw: "traveling", expression: "resolve", lighting: "storm", state: "CROUCH" },
  ];
  const derivedOk = LAB_SHOTS.map((s, i) => {
    const w = wantBuckets[i];
    return identityFramingBucket(s.shotType) === w.framing && identityYawBucket(s.movement) === w.yaw
      && identityExpressionBucket(s.description, s.poseStart, s.poseEnd) === w.expression
      && identityLightingBucket(s.lighting) === w.lighting && identityStateBucket(s.poseStart) === w.state;
  });
  check("C6 every lab shot derives its five-axis cell by the pure laws", derivedOk.every(Boolean), JSON.stringify(derivedOk));

  for (let i = 0; i < 6; i++) {
    const entries = [
      { characterName: "Lin Yue", similarity: LIN[i], aspects: {}, note: "crafted matrix reading" },
      { characterName: "Bai Ling", similarity: BAI[i], aspects: {}, note: "crafted matrix reading" },
    ];
    const worst = Math.min(LIN[i], BAI[i]);
    await db.identityScore.create({
      data: { projectId: labId, shotId: shots[i + 1].id, source: "RENDER", scores: JSON.stringify(entries), worst, castSize: 2, note: "iter99 matrix lab" },
    });
  }
  check("C7 the six RENDER reading rows persisted (12 per-character entries)",
    (await db.identityScore.count({ where: { projectId: labId, source: "RENDER" } })) === 6);
  }

  if (PHASE === "b" || PHASE === "b2" || PHASE === "all") {

  // ── D. the REAL loader: the matrix over the lab, cell by cell ──
  const m = await identityMatrixData(labId, "RENDER");
  check("D1 the loader read 12 readings over 3 members", m.readings === 12 && m.cast === 3, `readings=${m.readings} cast=${m.cast}`);
  check("D2 the floor rides the RENDER law (70%)", close(m.floor, 0.7));

  check("D3 the overall cell exact (the production RELEASES while the tail's member holds)",
    m.overall.n === 12 && close(m.overall.mean ?? -1, 9.85 / 12) && close(m.overall.median ?? -1, 0.855)
    && close(m.overall.p10 ?? -1, 0.72) && close(m.overall.worst ?? -1, 0.55) && close(m.overall.best ?? -1, 0.92)
    && m.overall.belowFloor === 1 && m.overall.verdict === "RELEASE" && m.overall.worstRef === "E1 Sc1 S006",
    JSON.stringify(m.overall));

  const framing = m.axes.find((t) => t.axis === "framing")!;
  check("D4 the framing axis: cells worst-p10 first, each exact",
    framing.cells.map((c) => c.key).join(",") === "med,wide,close"
    && cellOf(framing, "med")!.n === 4 && close(cellOf(framing, "med")!.mean ?? -1, 2.99 / 4)
    && close(cellOf(framing, "med")!.median ?? -1, 0.795) && close(cellOf(framing, "med")!.p10 ?? -1, 0.55)
    && cellOf(framing, "med")!.verdict === "HOLD" && cellOf(framing, "med")!.worstRef === "E1 Sc1 S006"
    && cellOf(framing, "wide")!.verdict === "RELEASE" && close(cellOf(framing, "wide")!.p10 ?? -1, 0.72)
    && close(cellOf(framing, "close")!.mean ?? -1, 0.89) && close(cellOf(framing, "close")!.p10 ?? -1, 0.86)
    && cellOf(framing, "close")!.verdict === "RELEASE" && cellOf(framing, "close")!.worstRef === "E1 Sc1 S001",
    JSON.stringify(framing.cells));

  const expression = m.axes.find((t) => t.axis === "expression")!;
  check("D5 the expression axis: the resolve cell sits BELOW (the repair reads its name)",
    expression.cells.map((c) => c.key).join(",") === "resolve,calm,grief,anger,surprise"
    && cellOf(expression, "resolve")!.verdict === "BELOW" && close(cellOf(expression, "resolve")!.mean ?? -1, 0.69)
    && cellOf(expression, "resolve")!.worstRef === "E1 Sc1 S006"
    && cellOf(expression, "calm")!.n === 4 && cellOf(expression, "grief")!.n === 2
    && close(cellOf(expression, "grief")!.mean ?? -1, 0.805) && cellOf(expression, "anger")!.n === 2
    && close(cellOf(expression, "surprise")!.p10 ?? -1, 0.88) && cellOf(expression, "surprise")!.verdict === "RELEASE",
    JSON.stringify(expression.cells));

  const yaw = m.axes.find((t) => t.axis === "yaw")!;
  check("D6 the yaw axis: the traveling lens carries the tail",
    yaw.cells.map((c) => c.key).join(",") === "traveling,locked,yawing"
    && cellOf(yaw, "traveling")!.n === 6 && close(cellOf(yaw, "traveling")!.mean ?? -1, 4.57 / 6)
    && close(cellOf(yaw, "traveling")!.median ?? -1, 0.795) && cellOf(yaw, "traveling")!.verdict === "HOLD"
    && close(cellOf(yaw, "locked")!.p10 ?? -1, 0.84) && close(cellOf(yaw, "yawing")!.p10 ?? -1, 0.86));

  const lighting = m.axes.find((t) => t.axis === "lighting")!;
  check("D7 the lighting axis: the storm family holds the dip, every family named",
    lighting.cells.map((c) => c.key).join(",") === "storm,shadow,dawn,night,emission"
    && cellOf(lighting, "storm")!.n === 4 && cellOf(lighting, "storm")!.verdict === "HOLD"
    && cellOf(lighting, "shadow")!.n === 2 && close(cellOf(lighting, "shadow")!.p10 ?? -1, 0.72)
    && close(cellOf(lighting, "emission")!.p10 ?? -1, 0.88) && cellOf(lighting, "emission")!.verdict === "RELEASE");

  const state = m.axes.find((t) => t.axis === "state")!;
  check("D8 the state axis: the crouch carries the tail, the unset state named honestly",
    state.cells.map((c) => c.key).join(",") === "CROUCH,unset,WALK,STANCE"
    && cellOf(state, "CROUCH")!.n === 4 && cellOf(state, "CROUCH")!.verdict === "HOLD"
    && cellOf(state, "unset")!.n === 2 && close(cellOf(state, "unset")!.p10 ?? -1, 0.72)
    && close(cellOf(state, "STANCE")!.p10 ?? -1, 0.86));

  check("D9 the members: Bai Ling first (HOLD), Lin Yue RELEASES, the unscored rider named",
    m.members.length === 3 && m.members[0].name === "Bai Ling" && m.members[0].overall.verdict === "HOLD"
    && close(m.members[0].overall.mean ?? -1, 4.61 / 6) && close(m.members[0].overall.median ?? -1, 0.8)
    && close(m.members[0].overall.p10 ?? -1, 0.55) && m.members[0].overall.worstRef === "E1 Sc1 S006"
    && m.members[1].name === "Lin Yue" && m.members[1].overall.verdict === "RELEASE"
    && close(m.members[1].overall.mean ?? -1, 5.24 / 6) && close(m.members[1].overall.p10 ?? -1, 0.83)
    && m.members[2].name === "Demon Lord Wei" && m.members[2].overall.verdict === "UNSCORED",
    JSON.stringify(m.members.map((x) => ({ name: x.name, verdict: x.overall.verdict }))));

  const baiFraming = m.members[0].axes.find((t) => t.axis === "framing")!;
  const linFraming = m.members[1].axes.find((t) => t.axis === "framing")!;
  check("D10 the member slice is the diagnostic: Bai Ling's med framings BELOW while her closeups RELEASE; Lin Yue clears everywhere",
    cellOf(baiFraming, "med")!.verdict === "BELOW" && close(cellOf(baiFraming, "med")!.mean ?? -1, 0.655)
    && cellOf(baiFraming, "close")!.verdict === "RELEASE" && cellOf(baiFraming, "wide")!.verdict === "RELEASE"
    && m.members[1].axes.length === 5 && cellOf(linFraming, "med")!.verdict === "RELEASE"
    && close(cellOf(linFraming, "med")!.p10 ?? -1, 0.83),
    JSON.stringify(baiFraming.cells));

  // the teeth stay: the standing law beside the matrix
  const standing = await castIdentityMeasurement(labId, "RENDER");
  const baiStanding = standing.members.find((x) => x.name === "Bai Ling");
  const linStanding = standing.members.find((x) => x.name === "Lin Yue");
  check("D11 the STANDING beside the matrix (rule 69 keeps its teeth: any dip is still a work order)",
    baiStanding?.standing === "BELOW" && baiStanding?.worstRef === "E1 Sc1 S006"
    && linStanding?.standing === "CLEARING" && standing.below === 1,
    JSON.stringify({ bai: baiStanding?.standing, lin: linStanding?.standing }));

  // ── E. the DSH tool reads the matrix ──
  const tool = await executeTool(labId, "identity_matrix", {}, ownerUser);
  check("E1 the tool reads the matrix (OK, the release answer, the named cells, the rider)",
    tool.status === "OK" && tool.result.includes("IDENTITY MATRIX (render source, floor 70%)")
    && tool.result.includes("the production RELEASES") && tool.result.includes("Bai Ling - HOLD")
    && tool.result.includes("resolve - BELOW") && tool.result.includes("Demon Lord Wei - unscored"),
    tool.result.slice(0, 300));
  check("E2 the tool's tail answers the release question",
    tool.result.includes("The distribution RELEASES - the tail and the body both hold the floor"),
    tool.result.slice(-260));
  const toolPanel = await executeTool(labId, "identity_matrix", { source: "panel" }, ownerUser);
  check("E3 the panel source honestly unscored (nothing measured there)",
    toolPanel.status === "OK" && toolPanel.result.includes("nothing measured") && toolPanel.result.includes("panel source"),
    toolPanel.result.slice(0, 200));

  // the viewer gate: a real VIEWER session cannot write the studio
  const viewerLogin = await register("reader@studio.dev", "Rin Reader", "viewing123");
  check("E4a the seeded viewer holds VIEWER", viewerLogin.role === "VIEWER", `role=${viewerLogin.role}`);
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  check("E4b the viewer's session reads live", (await call(viewerJar, "/api/projects")).status === 200);
  const viewerWrite = await call(viewerJar, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("E4c the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ── F. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  const scoreLeftovers = await db.identityScore.count({ where: { projectId: labId } });
  check("F1 the lab is gone exactly (project + readings)", leftovers.length === 0 && scoreLeftovers === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 99 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});
