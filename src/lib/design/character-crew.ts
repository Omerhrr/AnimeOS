// ─────────────────────────────────────────────────────────────
// THE CHARACTER DESIGN CREW (iteration 109) - the studio's designer
// harness: an orchestrator that deploys specialist agents, each with
// its own SKILL (instructions + the one capability it drives) and its
// own ACCEPTANCE TEST, and runs them as many rounds as the work needs.
//
//   SHEET READER  vision     the model sheet (or the character's
//                             written design when no sheet exists)
//                             -> a design spec in the generator's
//                             language (character-spec.ts)
//                 accepts:   the spec validates (clampSpec) with no
//                             rejected identity fields
//   BUILDER       Blender    the spec -> a designed anime character
//                             (anime_character.py) rendered as a
//                             model-sheet turnaround + a .blend
//                 accepts:   the turnaround rendered every view
//   JUDGE         vision     turnaround vs the canonical sheet ->
//                             per-aspect scores + issues that NAME the
//                             spec field to move
//                 accepts:   a parseable verdict
//   TUNER         language   the verdict -> a whitelisted spec patch
//                 accepts:   at least one field applied
//
// The ORCHESTRATOR walks read -> (build -> judge -> tune)*, keeps the
// best round, stops at the bar or the round budget, and lands the
// winning spec on the character (Character.designSpec) - from then on
// every render builds that character. Every agent step is traced
// (agent, round, ok, note, ms) and the run lands as a production event.
// Providers that do not answer degrade honestly: no sheet -> the
// reader works from text; no judge -> the crew builds once and says
// the design is unjudged; no tuner -> the judge's own field
// suggestions move the spec.
// ─────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { runtimeBlenderBin } from "@/lib/blender/runtime";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import { characterDesignDna } from "@/lib/animation/design";
import {
  applySpecPatch, bestRound, clampSpec, defaultSpec, parseJudgeVerdict, patchFromIssues, specLine,
  NUMERIC_RANGES, ENUMS, COLOR_FIELDS, type AnimeDesignSpec, type JudgeVerdict,
} from "@/lib/design/character-spec";

export const CREW_BAR = 0.72;
export const CREW_MAX_ROUNDS = 6;

// ── the skills (each agent's instructions) ───────────────────

const SCHEMA_DOC = `Spec fields (JSON, nested by section):
${Object.entries(NUMERIC_RANGES).map(([k, [lo, hi]]) => `  ${k}: number ${lo}..${hi}`).join("\n")}
${Object.entries(ENUMS).map(([k, v]) => `  ${k}: one of ${v.join(" | ")}`).join("\n")}
${COLOR_FIELDS.map((k) => `  ${k}: hex color "#rrggbb"`).join("\n")}
  outfit.sash: boolean`;

export const CREW_SKILLS = {
  sheetReader: `You are the SHEET READER of an anime/donghua character design crew. You translate a character's canonical model sheet (and their written design) into the build spec a Blender character generator consumes. Read it like a character designer: gender presentation, build and proportions, face shape (oval/round/angular, how tapered the jaw), eye size, eye shape (almond = soft, sharp = narrow/angular), eye color as an exact hex, hairstyle (topknot/ponytail/braid/long/short), hair color hex, bangs (parted/full/none), outfit type (hanfu = floor-length layered robe, tunic = knee-length over trousers, fitted = close top over trousers), sleeves (bell = wide hanging, fitted = narrow), collar (crossed = jiaoling, high = mandarin), sash.
${SCHEMA_DOC}
Reply with ONLY a JSON object {"spec": {<nested spec>}, "note": "one sentence on what defines this character's look"}.`,
  judge: `You are the JUDGE of an anime/donghua character design crew. Image 1 is the character's CANONICAL reference (model sheet or concept). Image 2 is the studio's 3D build rendered as a turnaround (front, three-quarter, side, back, face close-up). Score how well the BUILD matches the REFERENCE per aspect, 0..1: face (shape, proportion), eyes (size, shape, color), hair (style, silhouette, color, bangs), outfit (garment type, sleeves, collar, layering), palette (the color scheme), silhouette (overall body shape and proportion), style (does it read as the same anime/donghua design language). Be a strict art director: 0.9 = a designer would sign off, 0.5 = recognizably related, 0.2 = a different character.
For every real mismatch, write an issue and NAME the spec field that would fix it with a concrete suggested value.
${SCHEMA_DOC}
Reply with ONLY JSON: {"scores": {"face":n,"eyes":n,"hair":n,"outfit":n,"palette":n,"silhouette":n,"style":n}, "overall": n, "issues": [{"aspect": "...", "note": "...", "field": "section.key", "suggestion": <value>}], "note": "one sentence verdict"}.`,
  tuner: `You are the TUNER of an anime/donghua character design crew. You get the current build spec and the judge's verdict. Propose the SMALLEST set of spec changes that fixes the judge's biggest issues - move numbers in measured steps (never jump a range end to end), change an enum only when the judge says the category is wrong, set colors as exact hex. Do not touch aspects the judge scored >= 0.85.
${SCHEMA_DOC}
Reply with ONLY JSON: {"patch": {"section.key": value, ...}, "why": "one sentence"}.`,
} as const;

// ── trace ────────────────────────────────────────────────────

export interface CrewStep { agent: "orchestrator" | "sheetReader" | "builder" | "judge" | "tuner"; round: number; ok: boolean; note: string; ms: number }
export interface CrewRound { round: number; spec: AnimeDesignSpec; sheetUrl: string | null; verdict: JudgeVerdict | null }
export interface CrewResult {
  ok: boolean;
  characterId: string;
  name: string;
  rounds: CrewRound[];
  best: CrewRound | null;
  bar: number;
  cleared: boolean;
  steps: CrewStep[];
  line: string;
  error?: string;
}

async function timed<T>(steps: CrewStep[], agent: CrewStep["agent"], round: number, fn: () => Promise<{ ok: boolean; note: string; value?: T }>): Promise<{ ok: boolean; note: string; value?: T }> {
  const t0 = Date.now();
  let res: { ok: boolean; note: string; value?: T };
  try {
    res = await fn();
  } catch (err) {
    res = { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
  steps.push({ agent, round, ok: res.ok, note: res.note.slice(0, 300), ms: Date.now() - t0 });
  return res;
}

function jsonOf(raw: string): Record<string, unknown> | null {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(raw.slice(s, e + 1));
  } catch {
    return null;
  }
}

/** Male presentation shifts the defaults the reader did not set. */
function genderDefaults(spec: AnimeDesignSpec, raw: Record<string, unknown>): AnimeDesignSpec {
  if (spec.body.gender !== "male") return spec;
  const rb = (raw.body ?? {}) as Record<string, unknown>;
  const re = (raw.eyes ?? {}) as Record<string, unknown>;
  return {
    ...spec,
    body: { ...spec.body, shoulders: rb.shoulders !== undefined ? spec.body.shoulders : 1.12, hips: rb.hips !== undefined ? spec.body.hips : 0.92, bust: rb.bust !== undefined ? spec.body.bust : 0 },
    eyes: { ...spec.eyes, size: re.size !== undefined ? spec.eyes.size : 0.92, shape: re.shape !== undefined ? spec.eyes.shape : "sharp", lashes: re.lashes !== undefined ? spec.eyes.lashes : 0.75 },
    brows: { ...spec.brows, thickness: 1.25 },
  };
}

// ── the agents ───────────────────────────────────────────────

async function sheetReaderAgent(character: { name: string; appearance: string | null; modelSheetPrompt: string | null; personality: string | null }, sheetData: string | null, seed: AnimeDesignSpec) {
  const zai = await ZAI.create();
  const text = `${CREW_SKILLS.sheetReader}\n\nCHARACTER: ${character.name}\nWRITTEN DESIGN: ${character.appearance ?? ""}\nVISUAL ANCHOR: ${character.modelSheetPrompt ?? ""}\nPERSONALITY: ${character.personality ?? ""}\n${sheetData ? "The model sheet is attached." : "No model sheet exists yet - read the written design."}`;
  const content: Array<Record<string, unknown>> = [{ type: "text", text }];
  if (sheetData) content.push({ type: "image_url", image_url: { url: sheetData } });
  const res = (sheetData
    ? await zai.chat.completions.createVision({ messages: [{ role: "user", content }], thinking: { type: "disabled" } } as never)
    : await zai.chat.completions.create({ messages: [{ role: "user", content: text }], thinking: { type: "disabled" } } as never)) as { choices?: Array<{ message?: { content?: string } }> };
  const j = jsonOf(res.choices?.[0]?.message?.content ?? "");
  if (!j || typeof j.spec !== "object") return { ok: false, note: "the sheet reader broke protocol (no spec JSON)" };
  const { spec, rejected } = clampSpec(j.spec, seed);
  const shaped = genderDefaults(spec, j.spec as Record<string, unknown>);
  return { ok: true, note: `${specLine(shaped)}${rejected.length ? ` (rejected: ${rejected.join(", ")})` : ""} - ${String(j.note ?? "")}`, value: shaped };
}

async function builderAgent(dna: Record<string, unknown>, outDir: string, look: string): Promise<{ ok: boolean; note: string; value?: { sheet: string; views: Record<string, string>; blend: string } }> {
  const bin = runtimeBlenderBin();
  if (!bin) return { ok: false, note: "no Blender binary - provision the runtime first" };
  fs.mkdirSync(outDir, { recursive: true });
  const dnaPath = path.join(outDir, "dna.json");
  fs.writeFileSync(dnaPath, JSON.stringify(dna));
  const script = path.join(process.cwd(), "bridges", "blender", "anime_turnaround.py");
  const blend = path.join(outDir, "character.blend");
  const argv = ["-b", "-P", script, "--", "--dna", dnaPath, "--out", outDir, "--look", look, "--samples", "20", "--res", "480", "--blend", blend];
  const out = await new Promise<{ code: number | null; log: string }>((resolve) => {
    const child = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    let log = "";
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 8 * 60_000);
    child.stdout.on("data", (c: Buffer) => { log += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { log += c.toString(); });
    child.on("exit", (code) => { clearTimeout(killer); resolve({ code, log }); });
    child.on("error", (e) => { clearTimeout(killer); resolve({ code: -1, log: log + e.message }); });
  });
  const m = out.log.replace(/\r/g, "\n").match(/^TURNAROUND (.+)$/m);
  if (!m) return { ok: false, note: `the turnaround did not land: ${out.log.slice(-400)}` };
  const j = JSON.parse(m[1]) as { views: Record<string, string>; sheet: string | null };
  if (!j.sheet || !fs.existsSync(j.sheet)) return { ok: false, note: "the turnaround rendered no sheet" };
  return { ok: true, note: `${Object.keys(j.views).length} views rendered`, value: { sheet: j.sheet, views: j.views, blend } };
}

async function judgeAgent(referenceData: string | null, referenceText: string, turnData: string) {
  const zai = await ZAI.create();
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: `${CREW_SKILLS.judge}\n\n${referenceData ? "" : `No reference image exists - judge against this WRITTEN design instead (image 1 is omitted; the only image is the build):\n${referenceText}`}` },
  ];
  if (referenceData) content.push({ type: "image_url", image_url: { url: referenceData } });
  content.push({ type: "image_url", image_url: { url: turnData } });
  const res = (await zai.chat.completions.createVision({ messages: [{ role: "user", content }], thinking: { type: "disabled" } } as never)) as { choices?: Array<{ message?: { content?: string } }> };
  const v = parseJudgeVerdict(res.choices?.[0]?.message?.content ?? "");
  if (!v) return { ok: false, note: "the judge broke protocol (no verdict JSON)" };
  return { ok: true, note: `overall ${Math.round(v.overall * 100)}% - ${v.note}`, value: v };
}

async function tunerAgent(spec: AnimeDesignSpec, verdict: JudgeVerdict) {
  const zai = await ZAI.create();
  const text = `${CREW_SKILLS.tuner}\n\nCURRENT SPEC:\n${JSON.stringify(spec)}\n\nJUDGE VERDICT:\n${JSON.stringify(verdict)}`;
  const res = (await zai.chat.completions.create({ messages: [{ role: "user", content: text }], thinking: { type: "disabled" } } as never)) as { choices?: Array<{ message?: { content?: string } }> };
  const j = jsonOf(res.choices?.[0]?.message?.content ?? "");
  if (!j || typeof j.patch !== "object") return { ok: false, note: "the tuner broke protocol (no patch JSON)" };
  return { ok: true, note: String(j.why ?? ""), value: j.patch as Record<string, unknown> };
}

function fileAsDataUrl(abs: string): string | null {
  try {
    return `data:image/png;base64,${fs.readFileSync(abs).toString("base64")}`;
  } catch {
    return null;
  }
}

// ── the orchestrator ─────────────────────────────────────────

export async function runCharacterDesignCrew(
  projectId: string,
  characterName: string,
  opts?: { rounds?: number; bar?: number; look?: "TOON" | "PBR" },
): Promise<CrewResult> {
  const steps: CrewStep[] = [];
  const bar = Math.min(0.95, Math.max(0.4, opts?.bar ?? CREW_BAR));
  const maxRounds = Math.min(CREW_MAX_ROUNDS, Math.max(1, Math.round(opts?.rounds ?? 3)));
  const ch = await db.character.findFirst({ where: { projectId, name: characterName }, include: { states: true } });
  if (!ch) {
    return { ok: false, characterId: "", name: characterName, rounds: [], best: null, bar, cleared: false, steps, line: `No character named '${characterName}'.`, error: "not found" };
  }
  const project = await db.project.findUnique({ where: { id: projectId } });
  const look = opts?.look ?? ((project?.renderLook as "TOON" | "PBR" | null) ?? (["DONGHUA", "ANIME", "KOREAN"].includes(String(project?.visualStyle)) ? "TOON" : "PBR"));
  const baseDna = characterDesignDna({ name: ch.name, role: ch.role, appearance: ch.appearance, modelSheetPrompt: ch.modelSheetPrompt, stateClothing: null, stateWeapon: null }) as unknown as Record<string, unknown>;
  const sheetData = publicImageAsDataUrl(ch.modelSheetUrl);
  const refText = [ch.appearance, ch.modelSheetPrompt].filter(Boolean).join(" . ");
  let stored: AnimeDesignSpec | null = null;
  try {
    stored = ch.designSpec ? clampSpec(JSON.parse(ch.designSpec)).spec : null;
  } catch {
    stored = null;
  }
  const seed = stored ?? defaultSpec({ hairStyle: String(baseDna.hairStyle), hairColor: String(baseDna.hairColor), build: String(baseDna.build) });

  steps.push({ agent: "orchestrator", round: 0, ok: true, note: `crew deployed for ${ch.name}: up to ${maxRounds} round(s), bar ${Math.round(bar * 100)}%, look ${look}, reference ${sheetData ? "model sheet" : "written design"}`, ms: 0 });

  // 1. SHEET READER
  const read = await timed<AnimeDesignSpec>(steps, "sheetReader", 0, () => sheetReaderAgent(ch, sheetData, seed));
  let spec = read.ok && read.value ? read.value : seed;

  const rounds: CrewRound[] = [];
  const dir = path.join(process.cwd(), "public", "designs", ch.id);
  for (let r = 1; r <= maxRounds; r++) {
    // 2. BUILDER
    const outDir = path.join(dir, `r${r}`);
    const built = await timed(steps, "builder", r, () => builderAgent({ ...baseDna, designSpec: spec }, outDir, look));
    if (!built.ok || !built.value) break;
    const sheetUrl = `/designs/${ch.id}/r${r}/turn_sheet.png`;
    // 3. JUDGE
    const turnData = fileAsDataUrl(built.value.sheet);
    const judged = turnData
      ? await timed<JudgeVerdict>(steps, "judge", r, () => judgeAgent(sheetData, refText, turnData))
      : { ok: false, note: "turnaround unreadable", value: undefined };
    rounds.push({ round: r, spec, sheetUrl, verdict: judged.ok && judged.value ? judged.value : null });
    if (!judged.ok || !judged.value) {
      steps.push({ agent: "orchestrator", round: r, ok: false, note: "the judge did not answer - the build stands UNJUDGED; the crew stops rather than tune blind", ms: 0 });
      break;
    }
    if (judged.value.overall >= bar) {
      steps.push({ agent: "orchestrator", round: r, ok: true, note: `cleared the bar at round ${r}`, ms: 0 });
      break;
    }
    if (r === maxRounds) break;
    // 4. TUNER (the judge's own suggestions are the floor)
    const tuned = await timed<Record<string, unknown>>(steps, "tuner", r, () => tunerAgent(spec, judged.value!));
    const patch = tuned.ok && tuned.value && Object.keys(tuned.value).length ? tuned.value : patchFromIssues(judged.value.issues);
    const applied = applySpecPatch(spec, patch);
    if (applied.applied.length === 0) {
      steps.push({ agent: "orchestrator", round: r, ok: false, note: "no applicable change proposed - the crew stops at its best round", ms: 0 });
      break;
    }
    steps.push({ agent: "orchestrator", round: r, ok: true, note: `moved ${applied.applied.join(", ")}${applied.rejected.length ? ` (rejected ${applied.rejected.join(", ")})` : ""}`, ms: 0 });
    spec = applied.spec;
  }

  const best = bestRound(rounds) ?? rounds[rounds.length - 1] ?? null;
  const cleared = Boolean(best?.verdict && best.verdict.overall >= bar);
  if (best) {
    await db.character.update({ where: { id: ch.id }, data: { designSpec: JSON.stringify(best.spec), designSheetUrl: best.sheetUrl, designedAt: new Date() } });
  }
  const line = best
    ? `${ch.name}: ${rounds.length} round(s), best round ${best.round} ${best.verdict ? `at ${Math.round(best.verdict.overall * 100)}%` : "(unjudged)"} vs the ${Math.round(bar * 100)}% bar - ${cleared ? "CLEARED" : "below the bar"}; spec landed: ${specLine(best.spec)}. Turnaround: ${best.sheetUrl}`
    : `${ch.name}: the crew could not build a turnaround (${steps.filter((s) => !s.ok).map((s) => s.note).slice(-1)[0] ?? "unknown"})`;
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "DSH",
      type: "DESIGN",
      summary: `Character design crew - ${line}`.slice(0, 480),
      payload: JSON.stringify({ characterId: ch.id, bar, cleared, rounds: rounds.map((r) => ({ round: r.round, overall: r.verdict?.overall ?? null, sheetUrl: r.sheetUrl })), steps }),
    },
  }).catch(() => null);
  return { ok: Boolean(best), characterId: ch.id, name: ch.name, rounds, best, bar, cleared, steps, line };
}
