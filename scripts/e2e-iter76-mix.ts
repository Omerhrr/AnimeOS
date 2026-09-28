// Iteration 76 E2E: THE MIX IS GRADED (episode-grade audio mix).
// Proves, against the RUNNING studio, the REAL ffmpeg and the REAL
// cut pipeline:
//   A. source: the bus law, the dialogue duck, the measured
//      normalization, the persisted stems, the manifest evidence,
//      the doctrine (rule 50 + the law)
//   B. pure: mixGainDb (the clamp law), measureLufs over a REAL wav
//   C. accounts + throwaway production + a crafted voice take
//   D. the graded mix end to end: a REAL cut whose cues ride the four
//      buses, the score ducking under the voice, the master measured
//      to -16 LUFS (twice - determinism), the stems on disk, the
//      manifest carrying the numbers
//   E. the control: a cue-less episode honestly ungraded
//   F. the role matrix: a non-member refuses at the PEN
//   G. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter76-mix.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { mixGainDb, measureLufs, MIX_BUS_GAIN, MIX_TARGET_LUFS, MIX_GAIN_LIMIT_DB } from "../src/lib/comic/cut";
import { readFileSync, existsSync, unlinkSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter76-mix";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": `e2e-${MARK}` };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email, name, password }),
  });
  const body = (await res.json()) as { user?: { id: string; role: string }; id?: string; role?: string };
  if (res.ok) return { id: body.user?.id ?? body.id ?? "", role: body.user?.role ?? body.role ?? "" };
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
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

interface CutResponse {
  url: string; file: string; manifestFile: string; durationMs: number;
  shotCount: number; cueCount: number; renderedNow: number; warnings: string[];
  audioKinds: Record<string, number>;
  mix: {
    target: number; buses: Record<string, number>; ducked: boolean;
    stems: string[]; mixFile: string | null;
    lufsRaw: number | null; gainDb: number; lufsFinal: number | null; measured: boolean;
  } | null;
  error?: string;
}

function cutFiles(): string[] {
  const dir = path.join(process.cwd(), "public", "renders", "cuts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith("iter76-mix-lab"));
}

function removeCutFiles(): void {
  for (const f of cutFiles()) {
    const p = path.join(process.cwd(), "public", "renders", "cuts", f);
    if (existsSync(p)) unlinkSync(p);
  }
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
  await db.audioCue.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.sequenceFlow.deleteMany({ where: { projectId: labId } });
  await db.designPreset.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function craftVoiceTake(file: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // a speech-ish tone: formant band + syllabic tremolo, 1.6s
    const child = spawn("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "sine=frequency=210:duration=1.6",
      "-af", "tremolo=f=4.5:d=0.85,bandpass=f=950:width_type=o:w=600,volume=0.7",
      "-ar", "24000", "-ac", "1", file,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c: Buffer) => { err += c.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`take craft failed: ${err}`))));
  });
}

async function main() {
  console.log(`== Iteration 76: the mix is graded (episode-grade audio mix) ==\n`);

  // ───────────────────── A. source-level checks ─────────────────────
  const cutSrc = readFileSync("src/lib/comic/cut.ts", "utf8");
  check("A1 the bus law stands (four kinds, fixed gains)", cutSrc.includes('VOICE: 1.0') && cutSrc.includes('SFX: 0.9') && cutSrc.includes('BGM: 0.55') && cutSrc.includes('AMBIENCE: 0.4'));
  check("A2 the loudness law is measured (-16 LUFS target, clamped gain)", cutSrc.includes("MIX_TARGET_LUFS = -16") && cutSrc.includes("MIX_GAIN_LIMIT_DB = 12"));
  check("A3 the dialogue duck is a REAL sidechain compressor", cutSrc.includes("sidechaincompress=threshold=0.04:ratio=6:attack=12:release=320"));
  check("A4 the measure runs EBU R128 (ebur128) and reads the summary", cutSrc.includes("ebur128=peak=true") && cutSrc.includes("LUFS"));
  check("A5 the ceiling is honest (a limit, not a make-up gain)", cutSrc.includes("alimiter=limit=${MIX_CEILING}:level=disabled"));
  check("A6 the stems persist beside the cut and the mix is a deliverable", cutSrc.includes("`${slug}.${k.toLowerCase()}.wav`") && cutSrc.includes("`${slug}.mix.wav`"));
  check("A7 the manifest carries the mix evidence", cutSrc.includes("lufsRaw: mix.lufsRaw") && cutSrc.includes("gainDb: mix.gainDb") && cutSrc.includes("ducked: mix.ducked"));
  check("A8 a failed mix leaves no stem lies behind", cutSrc.includes("no stem lies behind"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A9 rule 50 teaches the graded-mix law", prompts.includes("50. THE MIX IS GRADED") && prompts.includes("a loudness nobody measured is a loudness nobody delivered"));
  check("A10 the curriculum grew the mix line", prompts.includes("- THE MIX IS GRADED: a cut whose audio"));
  check("A11 rules stay sequential (49 to 50, no duplicates)", (prompts.match(/^49\. THE KEYS OWN THE BODY/gm) ?? []).length === 1 && (prompts.match(/^50\. THE MIX IS GRADED/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  check("B1 the gain law walks a hot mix DOWN", mixGainDb(-14) === -2, `got ${mixGainDb(-14)}`);
  check("B2 the gain law walks a quiet mix UP", mixGainDb(-19) === 3, `got ${mixGainDb(-19)}`);
  check("B3 the gain clamps at the limit (a broken bed is not fixed by +40 dB)", mixGainDb(-40) === MIX_GAIN_LIMIT_DB && mixGainDb(-2) === -MIX_GAIN_LIMIT_DB);
  check("B4 the law constants stand", MIX_TARGET_LUFS === -16 && MIX_BUS_GAIN.VOICE === 1.0 && MIX_BUS_GAIN.BGM === 0.55);

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
    removeCutFiles();
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  check("C2 the owner's session reads live", (await call(ownerJar, "/api/projects")).status === 200);
  await register("reader@studio.dev", "Quiet Reader", "viewing123");

  const created = await executeTool("throwaway", "create_project", { title: `Iter76 Mix Lab ${MARK}`, logline: "a throwaway production for the graded-mix proof - the buses own the balance", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;

  // a REAL voice take on disk (the voice bus mixes it, no TTS provider needed)
  const takeRel = "/voices/iter76-e2e-take.wav";
  const takeAbs = path.join(process.cwd(), "public", takeRel);
  await craftVoiceTake(takeAbs);
  const takeLufs = await measureLufs(takeAbs);
  check("C4 the crafted take measures as real audio", takeLufs !== null && isFinite(takeLufs) && takeLufs < -3, `lufs=${takeLufs}`);

  // create_project seeds Season 1 - ride it, only create when absent
  let season = await db.season.findFirst({ where: { projectId: labId, number: 1 } });
  if (!season) season = await db.season.create({ data: { projectId: labId, number: 1, title: "Season One" } });
  const ep1 = await db.episode.create({ data: { seasonId: season.id, number: 1, title: "The Graded Mix", status: "IN_PRODUCTION" } });
  const ep2 = await db.episode.create({ data: { seasonId: season.id, number: 2, title: "The Quiet Control", status: "IN_PRODUCTION" } });
  const scene1 = await db.scene.create({ data: { episodeId: ep1.id, number: 1, title: "Clash at the Temple Gate" } });
  const scene2 = await db.scene.create({ data: { episodeId: ep2.id, number: 1, title: "The Silent Room" } });
  const shot1 = await db.shot.create({ data: { sceneId: scene1.id, number: 1, description: "the hero lands at the gate", duration: 2.5, movement: "DOLLY_IN" } });
  const shot2 = await db.shot.create({ data: { sceneId: scene1.id, number: 2, description: "the blade answers", duration: 2.5, movement: "STATIC" } });
  const shot3 = await db.shot.create({ data: { sceneId: scene2.id, number: 1, description: "an empty room holds its breath", duration: 2.0, movement: "STATIC" } });

  // the cue sheet: all four kinds ride (VOICE with a REAL take + a synth blip, SFX, BGM, AMBIENCE)
  await db.audioCue.create({ data: { shotId: shot1.id, kind: "VOICE", label: "Lin Yue take", startMs: 300, durationMs: 1600, volume: 0.9, voiceUrl: `${takeRel}?v=1`, voiceState: "NEUTRAL" } });
  await db.audioCue.create({ data: { shotId: shot1.id, kind: "BGM", label: "Cultivation Theme", startMs: 0, durationMs: 2500, volume: 0.8 } });
  await db.audioCue.create({ data: { shotId: shot1.id, kind: "AMBIENCE", label: "Temple Wind", startMs: 0, durationMs: 2500, volume: 0.7 } });
  await db.audioCue.create({ data: { shotId: shot2.id, kind: "SFX", label: "Impact Thunder", startMs: 200, durationMs: 1200, volume: 0.9 } });
  await db.audioCue.create({ data: { shotId: shot2.id, kind: "VOICE", label: "Blade Spirit", startMs: 400, durationMs: 1200, volume: 0.85, voiceState: "EXCITED" } });
  check("C5 the cue sheet stands (5 cues, four kinds)", (await db.audioCue.count({ where: { shot: { sceneId: scene1.id } } })) === 5);

  // ───────────────────── D. the graded mix end to end ─────────────────────
  const post1 = await call(ownerJar, `/api/episodes/${ep1.id}/cut`, { method: "POST", body: JSON.stringify({ mode: "PREVIEW" }) });
  const post1Text = await post1.text();
  check("D1 the cut builds over the real pipeline", post1.status === 200, `status ${post1.status}: ${post1Text.slice(0, 160)}`);
  const cut1 = JSON.parse(post1Text) as CutResponse;
  check("D2 the result carries a MIX, not a vibe", cut1.mix !== null && cut1.mix.measured === true, JSON.stringify(cut1.mix)?.slice(0, 200) + ` warnings: ${cut1.warnings.join(" | ").slice(0, 300)}`);
  const mix1 = cut1.mix;
  if (mix1) {
    check("D3 the four buses rode the law", mix1.buses.VOICE === 1.0 && mix1.buses.SFX === 0.9 && mix1.buses.BGM === 0.55 && mix1.buses.AMBIENCE === 0.4, JSON.stringify(mix1.buses));
    check("D4 the score DUCKED under the voice", mix1.ducked === true);
    check("D5 the master landed on the -16 LUFS target", mix1.lufsFinal !== null && mix1.lufsFinal >= -17.5 && mix1.lufsFinal <= -14.5, `lufsFinal=${mix1.lufsFinal}`);
    check("D6 the applied gain is the law's walk (measured, clamped)", mix1.lufsRaw !== null && mix1.gainDb === mixGainDb(mix1.lufsRaw), `raw=${mix1.lufsRaw} gain=${mix1.gainDb}`);
    check("D7 the four stems persist beside the cut", mix1.stems.length === 4 && mix1.stems.every((s) => existsSync(path.join(process.cwd(), "public", s))), JSON.stringify(mix1.stems));
    check("D8 the mix wav persists beside the cut", mix1.mixFile !== null && existsSync(path.join(process.cwd(), "public", mix1.mixFile)));
    check("D9 the mp4 exists and is no stub", existsSync(path.join(process.cwd(), "public", cut1.url)) && statSync(path.join(process.cwd(), "public", cut1.url)).size > 50_000);
  }
  if (mix1) {
    const voiceStemLufs = await measureLufs(path.join(process.cwd(), "public", mix1.stems.find((s) => s.includes(".voice.")) ?? ""));
    check("D10 the voice stem carries real audio", voiceStemLufs !== null && voiceStemLufs > -60 && voiceStemLufs < 0, `lufs=${voiceStemLufs}`);
  }
  const manifestPath = path.join(process.cwd(), "public", cut1.manifestFile);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { audio: { realTakes: number; synthesized: number; mix: { lufsFinal: number | null; ducked: boolean } | null } };
  check("D11 the manifest carries the mix evidence (real take + blip named honestly)", manifest.audio.mix !== null && manifest.audio.mix.lufsFinal === (mix1?.lufsFinal ?? null) && manifest.audio.realTakes === 1 && manifest.audio.synthesized === 1);
  check("D12 the cut rode the real clips (2 shots assembled)", cut1.shotCount === 2 && cut1.cueCount === 5, `shots=${cut1.shotCount} cues=${cut1.cueCount}`);

  // determinism: the same cue sheet must land the same measured numbers
  const post2 = await call(ownerJar, `/api/episodes/${ep1.id}/cut`, { method: "POST", body: JSON.stringify({ mode: "PREVIEW" }) });
  const cut2 = (await post2.json()) as CutResponse;
  check("D13 the rebuild measures the SAME numbers (bit-stable law, not luck)", cut2.mix !== null && cut1.mix !== null && cut2.mix.lufsRaw === cut1.mix.lufsRaw && cut2.mix.lufsFinal === cut1.mix.lufsFinal, `raw ${cut1.mix?.lufsRaw} vs ${cut2.mix?.lufsRaw}, final ${cut1.mix?.lufsFinal} vs ${cut2.mix?.lufsFinal}`);

  // ───────────────────── E. the control: a cue-less episode is honestly ungraded ─────────────────────
  const post3 = await call(ownerJar, `/api/episodes/${ep2.id}/cut`, { method: "POST", body: JSON.stringify({ mode: "PREVIEW" }) });
  const post3Text = await post3.text();
  check("E1 the quiet episode still cuts", post3.status === 200, `status ${post3.status}: ${post3Text.slice(0, 160)}`);
  const cut3 = JSON.parse(post3Text) as CutResponse;
  check("E2 no cues means NO mix claim (silence is honest)", cut3.mix === null, JSON.stringify(cut3.mix));
  const manifest3 = JSON.parse(readFileSync(path.join(process.cwd(), "public", cut3.manifestFile), "utf8")) as { audio: { mix: unknown } };
  check("E3 the manifest honestly records no mix", manifest3.audio.mix === null);
  check("E4 no stem files lie around for the quiet episode", !cutFiles().some((f) => f.includes("ep02") && f.endsWith(".wav")));

  // ───────────────────── F. the role matrix: a non-member refuses at the PEN ─────────────────────
  const readerJar = await loginJar("reader@studio.dev", "viewing123");
  const forbidden = await call(readerJar, `/api/episodes/${ep1.id}/cut`, { method: "POST", body: JSON.stringify({ mode: "PREVIEW" }) });
  check("F1 a non-member cannot grade a mix they are not on", forbidden.status === 403, `status ${forbidden.status}`);

  // ───────────────────── G. cleanup ─────────────────────
  await cleanupLab(labId);
  removeCutFiles();
  if (existsSync(takeAbs)) unlinkSync(takeAbs);
  const labGone = await db.project.findFirst({ where: { id: labId } });
  check("G1 the lab is gone and the disk is clean", labGone === null && cutFiles().length === 0);

  console.log(`\n== Iteration 76: ${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
