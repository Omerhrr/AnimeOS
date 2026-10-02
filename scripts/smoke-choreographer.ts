// Iteration 117 smoke (pure): THE ACTION CHOREOGRAPHER.
// Proves without a database or a provider:
//   A. S006's real brief compiles to the clash DNA - beats timed to
//      the shot's own audio cues, fx and physics bound to the beats
//      whose entry IS the cue
//   B. the declines are honest (establishing/closeup text, empty
//      text, no clock)
//   C. the draw and the flash paths compile
//   D. determinism - the same brief compiles byte-for-byte
// Run: npx tsx scripts/smoke-choreographer.ts
import {
  compileActionDna, FX_KINDS, PHYSICS_KINDS,
  type ActionBrief, type FxProgram, type PhysicsProgram,
} from "../src/lib/crew/action-choreographer";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

// ── S006's real brief (seed.ts, shot 6 of scene 12) ──────────
const S006: ActionBrief = {
  description: "Impact - first clash, Lin Yue and Demon Lord Wei collide under the broken roof, lightning detonates through it, debris suspended mid-air",
  lighting: "Lightning detonation",
  movement: "STATIC",
  duration: 3.6,
  audioCues: [
    { kind: "SFX", label: "Impact detonation", startMs: 200, },
    { kind: "SFX", label: "Debris scatter", startMs: 1100 },
    { kind: "BGM", label: "Percussion hit", startMs: 200 },
  ],
};

const dna = compileActionDna(S006);
check("S006 compiles", dna.ok, dna.decline ?? "");
check("the decline is null on success", dna.decline === null);

const grammar = dna.grammar ? (JSON.parse(dna.grammar) as Array<Record<string, unknown>>) : [];
check("grammar is 4 beats (lunge/slash/lock/recover/settle)", grammar.length === 4, String(grammar.length));
check("beat 0 is the tell and the strike: LUNGE->SLASH", grammar[0]?.poseStart === "LUNGE" && grammar[0]?.poseEnd === "SLASH", JSON.stringify(grammar[0]));
// the impact cue is 200ms of 3600ms -> the strike ends there
check("the strike ends ON the impact cue (200/3600)", Math.abs(Number(grammar[0]?.to) - 0.056) < 1e-9, String(grammar[0]?.to));
check("beat 1 is the lock: SLASH->BLOCK", grammar[1]?.poseStart === "SLASH" && grammar[1]?.poseEnd === "BLOCK", JSON.stringify(grammar[1]));
check("the lock holds to the debris cue (1100/3600)", Math.abs(Number(grammar[1]?.to) - 0.306) < 1e-9, String(grammar[1]?.to));
check("the camera keeps the shot's directed move in every beat", grammar.every((b) => b.move === "STATIC"), JSON.stringify(grammar.map((b) => b.move)));

const fx = dna.fx ? (JSON.parse(dna.fx) as FxProgram[]) : [];
check("fx carries the lightning burst", fx.some((p) => p.kind === "BURST" && p.color === "#e8eeff" && p.intensity === 0.9), JSON.stringify(fx));
check("no trail - S006's text names no blade (the expert invents nothing)", !fx.some((p) => p.kind === "TRAIL"), JSON.stringify(fx.map((p) => p.kind)));
check("all fx kinds are worker vocabulary", fx.every((p) => (FX_KINDS as readonly string[]).includes(p.kind)));
const burst = fx.find((p) => p.kind === "BURST");
check("the burst binds the beat whose entry IS the impact cue (beat 1)", Array.isArray(burst?.beats) && burst.beats.length === 1 && burst.beats[0] === 1, JSON.stringify(burst?.beats));

const phys = dna.physics ? (JSON.parse(dna.physics) as PhysicsProgram[]) : [];
check("physics carries the body's reaction", phys.some((p) => p.kind === "REACTION"), JSON.stringify(phys.map((p) => p.kind)));
check("physics carries the debris", phys.some((p) => p.kind === "DEBRIS"), JSON.stringify(phys.map((p) => p.kind)));
check("all physics kinds are worker vocabulary", phys.every((p) => (PHYSICS_KINDS as readonly string[]).includes(p.kind)));
const debris = phys.find((p) => p.kind === "DEBRIS");
check("the debris binds the beat whose entry IS the scatter cue (beat 2)", Array.isArray(debris?.beats) && debris.beats.length === 1 && debris.beats[0] === 2, JSON.stringify(debris?.beats));
const reaction = phys.find((p) => p.kind === "REACTION");
check("the reaction binds the impact beat (beat 1)", Array.isArray(reaction?.beats) && reaction.beats[0] === 1, JSON.stringify(reaction?.beats));
check("the read names the clock", /timed to the shot's own audio cues/.test(dna.line), dna.line);

// ── the declines ─────────────────────────────────────────────
const s001 = compileActionDna({
  description: "Establishing shot - Azure Mountain summit, temple ruin in the storm, clouds churning below the peak; Lin Yue a lone figure on the summit path",
  lighting: "Moonlight + storm clouds", movement: "CRANE", duration: 4.2, audioCues: [],
});
check("the establishing shot declines (no directed action)", !s001.ok && /no action/.test(s001.decline ?? ""), s001.decline ?? "compiled");
const s003 = compileActionDna({
  description: "Close-up - Lin Yue's eyes narrow; the rain sound dies unnaturally",
  lighting: "Cold key, deep shadow", movement: "STATIC", duration: 2.8, audioCues: [],
});
check("the closeup declines (silence stays silent)", !s003.ok, s003.decline ?? "compiled");
const noText = compileActionDna({ description: null, lighting: null, movement: "STATIC", duration: 2, audioCues: [] });
check("empty text declines", !noText.ok, noText.decline ?? "compiled");
const noClock = compileActionDna({ description: "first clash", lighting: null, movement: "STATIC", duration: 0, audioCues: [] });
check("no duration declines (no clock to stage on)", !noClock.ok && /duration/.test(noClock.decline ?? ""), noClock.decline ?? "compiled");
check("declines carry empty DNA", s001.grammar === null && s001.fx === null && s001.physics === null && s001.events.length === 0);

// ── the draw and the flash ───────────────────────────────────
const s005 = compileActionDna({
  description: "Sword draw - Lin Yue's jade blade sings out of its sheath, azure energy coiling up the steel",
  lighting: "Blade emission + rim light", movement: "ORBIT", duration: 4.2, audioCues: [],
});
check("the draw compiles", s005.ok, s005.decline ?? "");
const s005g = s005.grammar ? (JSON.parse(s005.grammar) as Array<Record<string, unknown>>) : [];
check("the draw phrase reaches and clears: STANCE->DRAW->STANCE", s005g[0]?.poseEnd === "DRAW" && s005g[1]?.poseStart === "DRAW" && s005g[1]?.poseEnd === "STANCE", JSON.stringify(s005g));
check("the draw keeps the orbit in every beat", s005g.every((b) => b.move === "ORBIT"));
const s005fx = s005.fx ? (JSON.parse(s005.fx) as FxProgram[]) : [];
check("the draw carries the trail and the gathered aura", s005fx.some((p) => p.kind === "TRAIL") && s005fx.some((p) => p.kind === "AURA" && p.beats === "ALL"), JSON.stringify(s005fx));
check("the draw names the canonical clock (no cues)", /canonical beats/.test(s005.line), s005.line);

const s004 = compileActionDna({
  description: "Reverse shot - a shadow detaches itself from the altar; the Demon Lord's aura crawls across the floor",
  lighting: "Aura glow + lightning", movement: "PAN", duration: 4.0, audioCues: [],
});
check("the flash compiles (aura + lightning, no clash)", s004.ok, s004.decline ?? "");
const s004g = s004.grammar ? (JSON.parse(s004.grammar) as Array<Record<string, unknown>>) : [];
check("the flash clock is two beats (calm, storm)", s004g.length === 2, String(s004g.length));
check("the flash keeps the pan", s004g.every((b) => b.move === "PAN"));
const s004fx = s004.fx ? (JSON.parse(s004.fx) as FxProgram[]) : [];
check("the flash binds the storm beat (beat 1, not frame zero)", s004fx.some((p) => p.kind === "BURST" && Array.isArray(p.beats) && p.beats[0] === 1), JSON.stringify(s004fx));
check("the flash carries the aura", s004fx.some((p) => p.kind === "AURA"));

// ── a clash that NAMES blades earns the trail ────────────
const bladed = compileActionDna({
  description: "Their blades meet in midair - the clash shakes the hall",
  lighting: null, movement: "TRACKING", duration: 3.0, audioCues: [],
});
check("the bladed clash compiles", bladed.ok, bladed.decline ?? "");
const bladedFx = bladed.fx ? (JSON.parse(bladed.fx) as FxProgram[]) : [];
check("the bladed clash carries the trail riding the hero's energy", bladedFx.some((p) => p.kind === "TRAIL" && (p.color === null || p.color === undefined)), JSON.stringify(bladedFx));
check("the bladed clash keeps the tracking move", (bladed.grammar ? (JSON.parse(bladed.grammar) as Array<Record<string, unknown>>) : []).every((b) => b.move === "TRACKING"));

// ── determinism ──────────────────────────────────────────────
const again = compileActionDna(S006);
check("the same brief compiles byte-for-byte", JSON.stringify(dna) === JSON.stringify(again));

console.log(failures === 0 ? "\nSMOKE GREEN - the choreographer compiles" : `\nSMOKE RED - ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
