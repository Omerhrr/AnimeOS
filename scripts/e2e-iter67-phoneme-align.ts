// Iteration 67 E2E: TIMESTAMPED PHONEME ALIGNMENT - the forced aligner.
// Proves, against the RUNNING studio, the REAL database and the REAL
// audio pipeline:
//   A. source: the aligner (words on measured anchors, phoneme windows,
//      the stop-closure law, the honest proportional degradation), the
//      sampler, the viseme wiring (the aligner tries first, the warp
//      stays as the honest fallback), the audit persistence, doctrine
//      rule 45, the registry (still 80 tools)
//   B. the pure aligner over a REAL synthesized WAV: words land on the
//      planted energy bursts, phoneme windows are monotonic and inside
//      the word, vowel windows measure open, stop windows cap shut,
//      two runs land bit-identical
//   C. accounts + throwaway production
//   D. the REAL pipeline: a speaking closeup with a crafted take - the
//      payload's viseme program carries the plan's closures when the
//      model serves it (a refused plan is the documented environmental
//      skip), the worker renders the lip-synced clip, the acoustic
//      audit persists the phoneme timeline on the cue
//   E. the HTTP role matrix (anon 401, VIEWER 403, OWNER unblocked)
//   F. cleanup (exact rows + the crafted take)
// Run: npx tsx scripts/e2e-iter67-phoneme-align.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { alignPhonemeTimeline, VOWEL_VISEMES, STOP_VISEMES } from "../src/lib/animation/align";
import { analyzeAcoustics, tokenizeLine } from "../src/lib/animation/acoustic";
import { audioOpennessSampler } from "../src/lib/animation/viseme-audio";
import { NEURAL_VISEME_SHAPES, type NeuralUnit } from "../src/lib/animation/viseme-neural";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter67-phoneme-align";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter67" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter67" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter67", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter67" },
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

/** a 24kHz mono PCM16 WAV with four 220ms tone bursts at planted nuclei */
function craftTakeWav(burstCentersMs: number[], totalMs = 2400): Buffer {
  const rate = 24000;
  const samples = Math.floor((totalMs / 1000) * rate);
  const pcm = Buffer.alloc(samples * 2);
  const burstHalf = 110; // ms each side of the center
  for (let i = 0; i < samples; i++) {
    const tMs = (i / rate) * 1000;
    let amp = 0.0;
    for (const c of burstCentersMs) {
      if (Math.abs(tMs - c) <= burstHalf) {
        // a smooth syllable-shaped burst (hann window), loud enough to gate
        const phase = (tMs - (c - burstHalf)) / (2 * burstHalf);
        amp = Math.max(amp, 0.55 * Math.sin(Math.PI * phase));
      }
    }
    const v = amp > 0 ? amp * Math.sin(2 * Math.PI * 180 * (tMs / 1000)) : 0;
    pcm.writeInt16LE(Math.round(v * 32767 * 0.9), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function unit(ph: string, v: string, w: number): NeuralUnit {
  return { ph, v, w };
}

async function main() {
  console.log("== Iteration 67: timestamped phoneme alignment - the forced aligner ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const align = readFileSync("src/lib/animation/align.ts", "utf8");
  check("A1 the aligner teaches the law (anchors own the clock, audio owns the energy, the plan owns the closure)", align.includes("the plan owns the closure, the audio owns the energy") && align.includes("every millisecond traces to the WAV"));
  check("A2 words spend the anchors their vowels demand (at least one)", align.includes("Math.max(1, units.filter") && align.includes("VOWEL_VISEMES.has(units[k].v)"));
  check("A3 a stop the plan placed caps the openness in its exact window", align.includes("STOP_CAP = 0.1") && align.includes("o = Math.min(o, STOP_CAP)"));
  check("A4 scarce anchors degrade to proportional placement and say so", align.includes("anchors scarce") && align.includes("proportional = true"));
  check("A5 the vowel and stop vocabularies are law", align.includes('["AA", "EY", "IY", "OW", "UW", "AH"]') && align.includes('["M_B_P", "SIL"]'));

  const audio = readFileSync("src/lib/animation/viseme-audio.ts", "utf8");
  check("A6 the openness sampler shares the envelope's own DNA", audio.includes("AUDIO OPENNESS SAMPLER") && audio.includes("openness stays AUDIO-owned at phoneme resolution") && audio.includes("loudnessGate(frames)"));

  const neural = readFileSync("src/lib/animation/viseme-neural.ts", "utf8");
  check("A7 the aligner tries FIRST; the weight warp stays the honest fallback", neural.includes("The FORCED") && neural.includes("alignPhonemeTimeline({") && neural.indexOf("alignPhonemeTimeline({") < neural.indexOf("retimedPlanVisemes(lineUnits"));
  check("A8 the aligned segments skip the conform (they already carry identity + measured openness)", neural.includes("the aligner's segments already carry plan identity + measured openness"));
  check("A9 the note names the phones and the stop closures", neural.includes("phoneme-aligned (${program.alignedUnits} phones"));

  const acoustic = readFileSync("src/lib/animation/acoustic.ts", "utf8");
  check("A10 the audit persists the phoneme timeline with the evidence", acoustic.includes("TIMESTAMPED PHONEME ALIGNMENT") && acoustic.includes("phonemeTimeline: {") && acoustic.includes("evidence is never invented"));
  check("A11 a refused plan leaves the timeline null and says so", acoustic.includes("phoneme timeline unavailable (plan or anchors refused)"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A12 rule 45 teaches the three-owner law", prompts.includes("45. THE PLAN OWNS THE CLOSURE") && prompts.includes("an alignment defect to report, not a style"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A13 the registry stands at 80 tools (the aligner extends the mouth, it adds no tool)", toolCount === 80, `count=${toolCount}`);

  // ───────────────────── B. the pure aligner over a REAL synthesized WAV ─────────────────────
  const bursts = [300, 700, 1100, 1500];
  const wav = craftTakeWav(bursts);
  const span = { startMs: 0, endMs: 2400 };
  const profile = analyzeAcoustics(wav, span);
  check("B1 the synthesized take measures four syllable anchors on the bursts", !!profile && profile.nuclei.length === 4 && profile.nuclei.every((n, i) => Math.abs(n - bursts[i]) <= 60), JSON.stringify(profile?.nuclei));
  if (profile) {
    const sampler = audioOpennessSampler(wav, span);
    check("B2 the sampler measures open on a burst and shut in the gaps", !!sampler && sampler(bursts[0]) > 0.5 && sampler(0) < 0.1 && sampler(2300) < 0.1, sampler ? `on=${sampler(bursts[0]).toFixed(2)} off=${sampler(0).toFixed(2)}` : "null");
    // "I am the storm" - four words: I(1 vowel) am(1) the(0->1) storm(1)
    const units: NeuralUnit[] = [
      unit("AY", "AA", 1.0), unit("M", "M_B_P", 0.6), unit("AE", "AA", 1.0), unit("M", "M_B_P", 0.6),
      unit("DH", "TH", 0.5), unit("AH", "AH", 0.9),
      unit("S", "S_SH", 0.6), unit("T", "M_B_P", 0.5), unit("AO", "OW", 1.2), unit("R", "R", 0.7), unit("M", "M_B_P", 0.6),
    ];
    const line = "I am the storm";
    const tokens = tokenizeLine(line);
    check("B3 the line tokenizes to the four words", tokens.join("|") === "i|am|the|storm", tokens.join("|"));
    const aligned = sampler ? alignPhonemeTimeline({ units, line, span, profile, shapes: NEURAL_VISEME_SHAPES, opennessAt: sampler }) : null;
    if (aligned) {
      const t = aligned.timeline;
      check("B4 every word landed on its planted burst", t.words.length === 4 && t.words.every((w, i) => {
        const mid = (w.sMs + w.eMs) / 2;
        return Math.abs(mid - bursts[i]) <= 130;
      }), JSON.stringify(t.words));
      check("B5 the phoneme windows are monotonic and inside the span", t.units.every((u, i) => u.eMs > u.sMs && (i === 0 || u.sMs >= t.units[i - 1].eMs - 1) && u.sMs >= span.startMs && u.eMs <= span.endMs), "monotonicity");
      check("B6 every phone carries its millisecond window and its plan identity", t.units.every((u) => u.eMs > u.sMs && typeof u.o === "number" && !!NEURAL_VISEME_SHAPES[u.v]), JSON.stringify(t.units.slice(0, 3)));
      const stopCells = t.units.filter((u) => u.stop);
      const vowelCells = t.units.filter((u) => VOWEL_VISEMES.has(u.v) && !STOP_VISEMES.has(u.v));
      check("B7 the plan's stops close the mouth in their windows", stopCells.length >= 3 && stopCells.every((u) => u.o <= 0.1 + 1e-9), JSON.stringify(stopCells.slice(0, 3).map((u) => [u.ph, u.o])));
      check("B8 the vowel windows measure the audio's energy (open where the voice rang)", vowelCells.length >= 3 && vowelCells.every((u) => u.o > 0.28), JSON.stringify(vowelCells.slice(0, 3).map((u) => [u.ph, u.o])));
      check("B9 the word windows breathe but never leave the span", t.words.every((w) => w.sMs >= span.startMs - 1 && w.eMs <= span.endMs + 1), JSON.stringify(t.words));
      check("B10 the aligner is deterministic (two runs land identical)", JSON.stringify(aligned.timeline) === JSON.stringify((() => {
        const again = alignPhonemeTimeline({ units, line, span, profile, shapes: NEURAL_VISEME_SHAPES, opennessAt: sampler! });
        return again?.timeline;
      })()));
      // scarce anchors degrade honestly
      const poorProfile = { ...profile, nuclei: [profile.nuclei[0]] };
      const degraded = alignPhonemeTimeline({ units, line, span, profile: poorProfile, shapes: NEURAL_VISEME_SHAPES, opennessAt: sampler! });
      check("B11 scarce anchors degrade to proportional placement, named", !!degraded && degraded.timeline.proportional && degraded.timeline.note.includes("anchors scarce"), degraded?.timeline.note ?? "null");
    } else {
      check("B4 the aligner engaged", false, "aligner returned null");
    }
  }

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  // self-healing pre-clean: a crashed earlier run's lab must not poison this one
  const stale = await db.project.findMany({ where: { title: { contains: MARK } } });
  for (const st of stale) {
    await db.project.delete({ where: { id: st.id } }).catch(() => {});
  }
  const created = await executeTool("throwaway", "create_project", { title: `Iter67 Phoneme Align Lab ${MARK}`, logline: "a throwaway production for the timestamped phoneme alignment proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C2 the throwaway alignment lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the REAL pipeline: a speaking closeup ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Voice" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Storm declaration", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Voice Saint Rhen declares herself the storm - the camera holds her face", shotType: "CLOSEUP", movement: "STATIC", poseStart: "STANCE", poseEnd: "STANCE" });
  await T("create_character", { name: "E2E Voice Saint Rhen", role: "PROTAGONIST", appearance: "a storm caller in deep teal robes, silver hair cropped short", personality: "fierce" });
  const dialogue = JSON.stringify([{ speaker: "E2E Voice Saint Rhen", text: "I am the storm", kind: "SPEECH" }]);
  const dlg = await T("set_shot_dialogue", { sceneNumber: 1, shotNumber: 1, lines: dialogue });
  check("D1 the dialogue lands on the closeup", dlg.status === "OK", dlg.result.slice(0, 140));
  const cue = await T("add_audio_cue", { kind: "VOICE", label: "E2E Voice Saint Rhen: I am the storm", startMs: 200, durationMs: 2400 });
  check("D2 the voice cue registers", cue.status === "OK", cue.result.slice(0, 140));
  const sceneRowPre = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRowPre) throw new Error("scene row missing - cannot continue");
  const shotPre = await db.shot.findFirst({ where: { sceneId: sceneRowPre.id, number: 1 } });
  if (!shotPre) throw new Error("shot missing - cannot continue");
  const cueRow = await db.audioCue.findFirst({ where: { shotId: shotPre.id, kind: "VOICE" } });
  if (!cueRow) throw new Error("cue missing - cannot continue");
  // the crafted take becomes the cue's real take (deterministic fixture
  // seeding - the TTS provider is not on trial here)
  const takeWav = craftTakeWav(bursts);
  const voicesDir = path.join(process.cwd(), "public", "voices");
  fs.mkdirSync(voicesDir, { recursive: true });
  const wavPath = path.join(voicesDir, `${cueRow.id}.wav`);
  fs.writeFileSync(wavPath, takeWav);
  await db.audioCue.update({
    where: { id: cueRow.id },
    data: { voiceUrl: `/voices/${cueRow.id}.wav?v=67`, voiceDurationMs: 2400 },
  });

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shot1 = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 1 } });
  if (!shot1) throw new Error("shot missing - cannot continue");

  console.log("   (real render follows - the closeup performs the line)");
  const job = await createRenderJob(labId, shot1.id, "PREVIEW");
  check("D3 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("D4 the speaking closeup renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("D5 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as { speech?: { lines?: number; visemes?: number } };
    check("D6 the worker performed the viseme program", (state.speech?.visemes ?? 0) >= 4, JSON.stringify(state.speech));
  }
  const jobRow = await db.renderJob.findUnique({ where: { id: job.id } });
  const lipNote = jobRow?.lipNote ?? "";
  const planServed = lipNote.includes("phoneme-aligned");
  if (planServed) {
    check("D7 the note names the phoneme alignment (phones + stop closures)", /phoneme-aligned \(\d+ phones, \d+ stop closures?\)/.test(lipNote), lipNote.slice(0, 220));
  } else {
    check("D7 the plan's refusal is honest (the acoustic paths still stand)", lipNote.length > 0 && (lipNote.includes("audio-driven") || lipNote.includes("lip-sync")), lipNote.slice(0, 220) || "no note");
    console.log("   (the vision/LLM provider refused the phoneme plan - the documented environmental skip; the pure path above carries the proof)");
  }

  // the acoustic audit persists the timeline on the cue
  const auditRes = await call(ownerJar, `/api/audio-cues/${cueRow.id}`, { method: "POST", body: JSON.stringify({}) });
  check("D8 the acoustic audit runs over the crafted take", auditRes.status === 200 || auditRes.status === 201, `${auditRes.status}`);
  const cueAfter = await db.audioCue.findUnique({ where: { id: cueRow.id } });
  const report = cueAfter?.acousticReport ? (JSON.parse(cueAfter.acousticReport) as { phonemeTimeline?: { units: Array<{ ph: string; sMs: number; eMs: number; o: number; stop: boolean }>; words: Array<{ text: string; sMs: number; eMs: number }>; anchors: number; proportional: boolean; note: string } | null; note?: string }) : null;
  if (report?.phonemeTimeline) {
    const t = report.phonemeTimeline;
    check("D9 the persisted timeline carries millisecond phoneme windows", t.units.length >= 4 && t.units.every((u) => u.eMs > u.sMs && typeof u.o === "number"), JSON.stringify(t.units.slice(0, 3)));
    check("D10 the persisted words sit on the planted bursts", t.words.length === 4 && t.words.every((w, i) => Math.abs((w.sMs + w.eMs) / 2 - bursts[i]) <= 130), JSON.stringify(t.words));
    check("D11 the persisted note is honest about the placement", t.note.length > 0 && (t.note.includes("anchors") || t.note.includes("proportional")), t.note);
  } else {
    check("D9 the audit records the refused plan honestly", !!report && typeof report.note === "string" && report.note.length > 0, report?.note ?? "no report");
    console.log("   (the timeline stayed null - the plan provider refused; the note says so)");
  }

  // ───────────────────── E. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "align the phones" }) });
  check("E1 anonymous direction is 401", anon.status === 401);
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  const viewerPost = await call(viewerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "align the phones" }) });
  check("E2 a VIEWER cannot direct the mouth (403)", viewerPost.status === 403);
  const ownerCues = await call(ownerJar, `/api/audio-cues?shotId=${shotPre.id}`);
  check("E3 the OWNER reads the cue sheet anywhere (bypass intact)", ownerCues.status === 200);

  // ───────────────────── F. cleanup (exact rows + the crafted take) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  fs.rmSync(wavPath, { force: true });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  check("F1 every throwaway row is gone (cascade holds)", !leftover);
  try {
    fs.rmSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), { force: true });
  } catch {
    // best effort
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
