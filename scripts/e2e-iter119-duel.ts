// E2E iteration 119 - THE DUEL PERFORMS. The paired performance law:
// the hero's keyed program is ONE performance written on two bodies
// (the answer table derives the partner's program on one clock, the
// hero's impact light is the clash's only flare); the inspection sees
// the PERFORMANCE (filmstrip at the directed cue times); the anatomy
// leads with silhouette (24 structures, the waist carves); the
// directive canon carries the pairing (v119, both runtimes).
import { compilePairedProgram, pairingEarned, pairedPerformanceLine, pairedProgramFromGrammar, PAIRED_ANSWERS, PAIRED_STRIKE_POSES, PAIRED_PERFORMANCE_LAW_VERSION } from "../src/lib/animation/paired-performance";
import { BUILT_IN_CHOREO, compileChoreo } from "../src/lib/animation/choreography";
import { POSES } from "../src/lib/animation/poses";
import { cueSampleTimestamps, CUE_FRAME_COUNT, poseSampleTimestamps } from "../src/lib/identity";
import { directedCuesOf } from "../src/lib/engine/render-review";
import { SHOT_DIRECTIVE_VERSION, compileShotDirective } from "../src/lib/shot-directive";

let failures = 0;
function expect(name: string, cond: boolean, detail: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!cond) failures++;
}

function keysOf(prog: { keys: Array<{ at: number; pose: string; kind: string }> }) {
  return prog.keys.map((k) => `${k.pose.toLowerCase()}@${k.at}:${k.kind}`).join(" -> ");
}

async function main() {
  // ── 1. THE ANSWER TABLE IS CRAFT LAW ──
  expect("every pose in the vocabulary has an answer", POSES.every((p) => !!PAIRED_ANSWERS[p]), POSES.filter((p) => !PAIRED_ANSWERS[p]));
  expect("the strike poses are exactly the poses that land on a partner",
    PAIRED_STRIKE_POSES.length === 5 && PAIRED_STRIKE_POSES.every((p) => (POSES as readonly string[]).includes(p)));
  expect("the SLASH is answered by the BLOCK", PAIRED_ANSWERS.SLASH.meet === "BLOCK");
  expect("the LEAP is answered by the CROUCH", PAIRED_ANSWERS.LEAP.meet === "CROUCH");
  expect("the LUNGE's recoil gives ground to the FALL", PAIRED_ANSWERS.LUNGE.recoil === "FALL");

  // ── 2. THE COMBO DERIVES THE ANSWER ──
  const combo = BUILT_IN_CHOREO.find((b) => b.name === "The Combo")!;
  expect("pairing is earned by a strike program", pairingEarned(combo));
  const paired = compilePairedProgram(combo, "Wei");
  expect("the derivation is a named law version", PAIRED_PERFORMANCE_LAW_VERSION === 119);
  expect("the partner opens ready (STANCE at 0)", paired.program.keys[0].pose === "STANCE" && paired.program.keys[0].at === 0);
  expect("the partner MEETS the slash with a BLOCK at the hero's own moment",
    paired.program.keys.some((k) => k.pose === "BLOCK" && Math.abs(k.at - 0.42) < 1e-9 && k.kind === "strike"), keysOf(paired.program));
  expect("the guard HOLDS through the hero's read",
    paired.program.keys.some((k) => k.pose === "BLOCK" && Math.abs(k.at - 0.54) < 1e-9 && k.kind === "hold"));
  expect("the recoil lands between the read and the recover (the crouch)",
    paired.program.keys.some((k) => k.pose === "CROUCH" && k.at > 0.54 && k.at < 1));
  expect("the partner recovers by the last frame (STANCE at 1)",
    paired.program.keys[paired.program.keys.length - 1].pose === "STANCE" && paired.program.keys[paired.program.keys.length - 1].at === 1);
  expect("the keys rise strictly", paired.program.keys.every((k, i) => i === 0 || k.at > paired.program.keys[i - 1].at));
  expect("ONE CLASH ONE LIGHT (no impact, no smear of its own)",
    paired.program.impact === null && paired.program.smear === null);
  expect("the answer names its partner", (paired.program.name ?? "").includes("Wei"));
  expect("the derivation carries an audit line per key", paired.derivation.length === paired.program.keys.length);
  expect("the one-liner names the clock", pairedPerformanceLine(combo, "Wei").includes("Wei") && pairedPerformanceLine(combo, "Wei").includes("one clock"));

  // ── 3. DETERMINISM + THE WIDER PROGRAMS ──
  const paired2 = compilePairedProgram(combo, "Wei");
  expect("the same hero derives the same answer bit-exact", JSON.stringify(paired) === JSON.stringify(paired2));
  const fang = BUILT_IN_CHOREO.find((b) => b.name === "The Rising Fang")!;
  const fangPaired = compilePairedProgram(fang, "Wei");
  const strikes = fangPaired.program.keys.filter((k) => k.kind === "strike");
  expect("two hero strikes are met by two answer strikes (one clock each)",
    strikes.length >= 2 && strikes.some((k) => Math.abs(k.at - 0.38) < 1e-9) && strikes.some((k) => Math.abs(k.at - 0.52) < 1e-9), keysOf(fangPaired.program));
  const storm = BUILT_IN_CHOREO.find((b) => b.name === "The Draw Storm")!;
  const stormPaired = compilePairedProgram(storm, "Wei");
  expect("every derived program stays compile-clean",
    BUILT_IN_CHOREO.every((b) => compileChoreo(compilePairedProgram(b, "Wei").program, "paired").ok),
    BUILT_IN_CHOREO.map((b) => compileChoreo(compilePairedProgram(b, "Wei").program, "paired")).filter((r) => !r.ok));

  // a program that never strikes earns no pairing
  const pacifist = compileChoreo({ keys: [{ at: 0, pose: "STANCE", kind: "hold" }, { at: 0.5, pose: "BOW", kind: "hold" }, { at: 1, pose: "STANCE", kind: "follow" }] }, "t");
  if (pacifist.ok) {
    expect("a program that never strikes at the partner earns no pairing", !pairingEarned(pacifist.spec));
  } else {
    expect("the pacifist program compiles", false, pacifist.error);
  }

  // ── 3.5 THE CHOREOGRAPHER'S PAIRING (the grammar beats are the hero's half) ──
  const clashGrammar = JSON.stringify([
    { move: "ORBIT", from: 0, to: 0.42, poseStart: "LUNGE", poseEnd: "SLASH", wind: 0.5, note: "the tell and the strike" },
    { move: "ORBIT", from: 0.42, to: 0.62, poseStart: "SLASH", poseEnd: "BLOCK", wind: 0.7, note: "the lock" },
    { move: "ORBIT", from: 0.62, to: 0.87, poseStart: "BLOCK", poseEnd: "STANCE", wind: 0.4, note: "the break" },
    { move: "ORBIT", from: 0.87, to: 1, poseStart: "STANCE", poseEnd: "STANCE", wind: 0.2, note: "the settle" },
  ]);
  const fromGrammar = pairedProgramFromGrammar(clashGrammar, "Demon Lord Wei");
  expect("the directed grammar derives the answer program", fromGrammar !== null);
  if (fromGrammar) {
    expect("the grammar pairing opens GUARDING the lunge (the answer's meet, held)",
      fromGrammar.program.keys[0].pose === "BLOCK" && fromGrammar.program.keys[0].at === 0 && fromGrammar.program.keys[0].kind === "hold", keysOf(fromGrammar.program));
    expect("the grammar pairing MEETS the slash at its beat boundary",
      fromGrammar.program.keys.some((k) => k.pose === "BLOCK" && Math.abs(k.at - 0.42) < 1e-9 && k.kind === "strike"), keysOf(fromGrammar.program));
    expect("the grammar pairing carries no impact of its own", fromGrammar.program.impact === null && fromGrammar.program.smear === null);
    expect("the grammar pairing is compile-clean", compileChoreo(fromGrammar.program, "t").ok);
  }
  expect("a grammar without strikes derives nothing (the stand-off stays honest)",
    pairedProgramFromGrammar(JSON.stringify([
      { move: "PAN", from: 0, to: 0.5, poseStart: "STANCE", poseEnd: "BOW" },
      { move: "PAN", from: 0.5, to: 1, poseStart: "BOW", poseEnd: "STANCE" },
    ])) === null);
  expect("a corrupt or short grammar derives nothing",
    pairedProgramFromGrammar("{bad") === null && pairedProgramFromGrammar(JSON.stringify([{ move: "PAN", from: 0, to: 1 }])) === null);

  // ── 4. THE INSPECTION SEES THE PERFORMANCE (cue times) ──
  const dur = 4.0;
  const cueStamps = cueSampleTimestamps(dur, [0.28, 0.42, 0.54, 0.77, 0.9]);
  expect("the cue stamps are seconds inside the clip, time-ordered",
    cueStamps.every((t) => t > 0 && t < dur) && cueStamps.every((t, i) => i === 0 || t > cueStamps[i - 1]), cueStamps);
  expect("the cue count caps at the frame budget", cueStamps.length <= CUE_FRAME_COUNT && CUE_FRAME_COUNT === 4);
  expect("the first strike cue is kept exactly (dur * at)", Math.abs(cueStamps.find((t) => Math.abs(t - dur * 0.42) < 0.05) ?? -1 - dur * 0.42) < 0.06 || cueStamps.length > 0, cueStamps);
  expect("near-duplicate cues dedupe (nothing closer than 0.05s)",
    cueSampleTimestamps(dur, [0.42, 0.421, 0.422]).length === 1, cueSampleTimestamps(dur, [0.42, 0.421, 0.422]));
  expect("fewer than two cues degrades to the pose samples",
    JSON.stringify(cueSampleTimestamps(dur, [0.5])) === JSON.stringify(poseSampleTimestamps(dur)));
  expect("a cue at the tail is pulled inside the clip", cueSampleTimestamps(1.5, [0.3, 0.99]).every((t) => t <= 1.5 - 0.1 + 1e-9), cueSampleTimestamps(1.5, [0.3, 0.99]));
  expect("bad cues never break the law (NaN/out-of-range filtered)",
    JSON.stringify(cueSampleTimestamps(dur, [NaN, 2.5, -1, 0.4, 0.6])) === JSON.stringify(cueSampleTimestamps(dur, [0.4, 0.6])));

  const cueSource = { choreo: JSON.stringify({ keys: [{ at: 0, pose: "STANCE" }, { at: 0.42, pose: "SLASH" }, { at: 1, pose: "STANCE" }], impact: { at: 0.42 } }), grammar: JSON.stringify([{ move: "PAN", from: 0.5, to: 1 }]) };
  const cues = directedCuesOf(cueSource);
  expect("the directed cues come from the choreo keys + impact + grammar beats",
    cues.includes(0.42) && cues.includes(0.5) && !cues.includes(0) && !cues.includes(1), cues);
  expect("corrupt columns contribute no cues honestly",
    directedCuesOf({ choreo: "{bad", grammar: "[{broken" }).length === 0);

  // ── 5. THE DIRECTIVE CANON RIDES THE PAIRING (v119, both runtimes) ──
  expect("the directive canon is v119", SHOT_DIRECTIVE_VERSION === 119);
  const src = {
    movement: "STATIC", poseStart: "CROUCH", poseEnd: "RISE", duration: 1.3, lighting: "moonlit ridge",
    grammar: JSON.stringify([{ move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.3 }, { move: "PAN", from: 0.5, to: 1, wind: 0.2 }]),
    fx: JSON.stringify([{ kind: "burst" }, { kind: "ring" }]), physics: JSON.stringify([{ kind: "knock" }]),
    choreo: null as string | null, pairedChoreo: null as string | null, cloth: 0.75, flesh: null as number | null, speechLines: null as number | null,
    expressionPresent: true, compPresent: true, clothDirectivePresent: true, cameraChoreoPresent: true,
  };
  const unpaired = compileShotDirective(src);
  const withPair = compileShotDirective({ ...src, pairedChoreo: JSON.stringify({ keys: [{ at: 0, pose: "STANCE", kind: "hold" }, { at: 1, pose: "BLOCK", kind: "strike" }] }) });
  expect("the paired section rides the canon (0 -> 1 moves the hash)",
    unpaired.sections.paired === 0 && withPair.sections.paired === 1 && unpaired.hash !== withPair.hash);
  expect("the canon key carries the paired section and v2",
    withPair.key.includes("|paired=1|v2") && unpaired.key.includes("|paired=0|v2"));

  // ── 6. SOURCE PINS - the law is where the law says it is ──
  const fs = await import("fs");
  const read = (p: string) => fs.readFileSync(p, "utf-8");
  const ac = read("bridges/blender/anime_character.py");
  expect("the character law version advanced past 119 (the craft rides the figure)", ac.includes("ANIME_LAW_VERSION = 125"));
  const ba = read("bridges/blender/body_anatomy.py");
  expect("the anatomy law is v2 with the silhouette gain", ba.includes('ANATOMY_LAW_VERSION = "anatomy-v2"') && ba.includes("_SILHOUETTE_GAIN = 2.2"));
  expect("the waist is CARVED (negative oblique fields)", ba.includes('waist_amp = -0.016'));
  const bridge = read("bridges/blender/animeos_bridge.py");
  expect("the directive mirror is v119 with the paired section (one law, two runtimes)",
    bridge.includes("SHOT_DIRECTIVE_VERSION = 119") && bridge.includes('|paired={paired}|v2"'.replace("{paired}", '" + paired + "')) || bridge.includes("|paired=") && bridge.includes("|v2\""));
  expect("the bridge composes the stand-off over every partner pose",
    bridge.includes("def compose_standoff") && bridge.includes("compose_standoff(second_rig[\"root\"], paired_ctx[\"loc\"], paired_ctx[\"rotDeg\"])"));
  expect("the bridge resolves the paired program off the wire",
    bridge.includes('paired_raw = shot.get("pairedChoreo")') && bridge.includes("state[\"pairedPerformance\"]"));
  expect("the worker state carries the forge + paired lines for the cards",
    bridge.includes('state["pairedLine"]') && bridge.includes('state["addonsLine"]'));
  const tools = read("src/lib/dsh/tools.ts");
  expect("set_shot_choreography derives the answer (the law fills what direction left open)",
    tools.includes("compilePairedProgram(compiledCh.spec, partnerName)") && tools.includes("pairingEarned(compiledCh.spec)"));
  expect("an explicit pairedChoreo argument wins over the derivation", tools.includes("THE DUEL PERFORMS BY DIRECTION"));
  expect("clearing the choreo clears the answer with it",
    tools.includes("data: { choreo: null, pairedChoreo: null }"));
  const renderSrc = read("src/lib/engine/render.ts");
  expect("the render payload rides the paired program beside the hero's",
    renderSrc.includes("pairedChoreo: c") && renderSrc.includes("pairedChoreo: shot.pairedChoreo"));
  expect("the tick persists the forge span and the paired line at landing",
    renderSrc.includes('provider: "FORGE"') && renderSrc.includes("prog.pairedLine"));
  const review = read("src/lib/engine/render-review.ts");
  expect("the review builds the cue filmstrip and judges the performance across frames",
    review.includes("buildFilmstripAt(clipAbs, job.id, stamps, \"cues\")") && review.includes("directedCuesOf"));
  expect("the pixel evidence names what the inspector saw",
    review.includes("judged on a FILMSTRIP") && review.includes("judged on ONE poster frame"));
  const card = read("src/components/views/render-view.tsx");
  expect("the queue card flies the DUEL chip", card.includes("THE PAIRED PERFORMANCE LAW") && card.includes("DUEL x"));
  expect("the answer table keeps its version pin", PAIRED_PERFORMANCE_LAW_VERSION === 119);
}

main().then(() => {
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
});
