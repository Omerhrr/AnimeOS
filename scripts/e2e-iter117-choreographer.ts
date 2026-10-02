// Iteration 117 E2E: THE EXPERT CREW STANDS UP - the choreographer's
// DNA obeys every law the wire obeys. Proves without a database:
//   A. the consult's rank law, pure half: the compiled DNA feeds the
//      SAME per-column fill the consult performs (empty columns take
//      it; directed columns stand)
//   B. ONE LAW, TWO RUNTIMES (TS): normalizeGrammar - the wire mirror
//      the payload assembly obeys - accepts the expert's grammar for
//      every directed shot, and the shot directive hash MOVES when
//      the DNA lands (the wire carries what the expert compiled)
//   C. ONE LAW, TWO RUNTIMES (Python): fx_pass.normalize_fx and
//      physics_pass.normalize_physics - the worker's own validators -
//      accept the expert's programs with the grammar's beat count
//      (needs python3 + the bridge dir; both passes are bpy-free)
// Run: npx tsx scripts/e2e-iter117-choreographer.ts
import { execFileSync } from "node:child_process";
import path from "node:path";
import { normalizeGrammar, compileShotDirective } from "../src/lib/shot-directive";
import { compileActionDna, type ActionBrief } from "../src/lib/crew/action-choreographer";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

const BRIEFS: Array<{ name: string; brief: ActionBrief }> = [
  {
    name: "S006 (the clash)",
    brief: {
      description: "Impact - first clash, Lin Yue and Demon Lord Wei collide under the broken roof, lightning detonates through it, debris suspended mid-air",
      lighting: "Lightning detonation", movement: "STATIC", duration: 3.6,
      audioCues: [
        { kind: "SFX", label: "Impact detonation", startMs: 200 },
        { kind: "SFX", label: "Debris scatter", startMs: 1100 },
        { kind: "BGM", label: "Percussion hit", startMs: 200 },
      ],
    },
  },
  {
    name: "S005 (the draw)",
    brief: {
      description: "Sword draw - Lin Yue's jade blade sings out of its sheath, azure energy coiling up the steel",
      lighting: "Blade emission + rim light", movement: "ORBIT", duration: 4.2, audioCues: [],
    },
  },
  {
    name: "S004 (the flash)",
    brief: {
      description: "Reverse shot - a shadow detaches itself from the altar; the Demon Lord's aura crawls across the floor",
      lighting: "Aura glow + lightning", movement: "PAN", duration: 4.0, audioCues: [],
    },
  },
];

// ── A. the consult's rank law, pure half ───────────────────
const s006 = compileActionDna(BRIEFS[0].brief);
check("S006 compiles", s006.ok, s006.decline ?? "");
// faithful to the consult's has(): a directed column is a non-empty
// JSON ARRAY - anything else is an empty column the expert may fill
const has = (col: string | null): boolean => {
  try { const v = col ? JSON.parse(col) : null; return Array.isArray(v) && v.length > 0; } catch { return false; }
};
const fillIfEmpty = (col: string | null, dna: string | null): string | null => (has(col) ? col : dna);
const directed = '[{"kind":"BURST","intensity":1,"beats":"ALL"}]';
check("an explicitly directed column stands", fillIfEmpty(directed, s006.fx ?? null) === directed);
check("an empty column takes the expert's DNA", fillIfEmpty(null, s006.grammar) === s006.grammar);
check("a corrupt column reads empty (the expert fills it)", fillIfEmpty("not json", s006.grammar) === s006.grammar);

// ── B. the TS wire mirror ────────────────────────────────────
for (const { name, brief } of BRIEFS) {
  const dna = compileActionDna(brief);
  check(`${name} compiles`, dna.ok, dna.decline ?? "");
  const g = dna.grammar ? normalizeGrammar(JSON.parse(dna.grammar)) : null;
  check(`${name}: normalizeGrammar accepts the expert's beats`, g !== null && g.length >= 2, `${dna.grammar?.slice(0, 80)}`);
  check(`${name}: every beat's wind survives the mirror`, g ? g.every((b) => b.wind === null || (b.wind >= 0 && b.wind <= 1)) : false);
  // the hash MOVES: the same shot with and without the DNA compiles
  // to different directives (the wire carries what the expert wrote)
  const withDna = compileShotDirective({
    movement: brief.movement ?? null, poseStart: "STANCE", poseEnd: "STANCE",
    duration: brief.duration, lighting: brief.lighting ?? null,
    grammar: dna.grammar, fx: dna.fx, physics: dna.physics, choreo: null,
    cloth: null, flesh: null, speechLines: null,
    expressionPresent: false, compPresent: false, clothDirectivePresent: false, cameraChoreoPresent: false,
  });
  const withoutDna = compileShotDirective({
    movement: brief.movement ?? null, poseStart: "STANCE", poseEnd: "STANCE",
    duration: brief.duration, lighting: brief.lighting ?? null,
    grammar: null, fx: null, physics: null, choreo: null,
    cloth: null, flesh: null, speechLines: null,
    expressionPresent: false, compPresent: false, clothDirectivePresent: false, cameraChoreoPresent: false,
  });
  check(`${name}: the directive hash moves when the DNA lands`, withDna.hash !== withoutDna.hash, `${withDna.hash} vs ${withoutDna.hash}`);
}

// ── C. the Python mirror (the worker's own validators) ───────
try {
  const bridgeDir = path.join(process.cwd(), "bridges", "blender");
  const payload: Record<string, { grammar: unknown[] | null; fx: unknown[] | null; physics: unknown[] | null; beatCount: number }> = {};
  for (const { name, brief } of BRIEFS) {
    const dna = compileActionDna(brief);
    const beats = dna.grammar ? (JSON.parse(dna.grammar) as unknown[]) : null;
    payload[name] = {
      grammar: beats,
      fx: dna.fx ? (JSON.parse(dna.fx) as unknown[]) : null,
      physics: dna.physics ? (JSON.parse(dna.physics) as unknown[]) : null,
      beatCount: beats?.length ?? 1,
    };
  }
  const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(bridgeDir)})
import fx_pass, physics_pass

payload = json.loads(${JSON.stringify(JSON.stringify(payload))})
results = {}
for name, p in payload.items():
    fx_programs, fx_notes = fx_pass.normalize_fx(p["fx"], p["beatCount"]) if p["fx"] else ([], [])
    ph_programs, ph_notes = physics_pass.normalize_physics(p["physics"], p["beatCount"]) if p["physics"] else ([], [])
    fx_kinds = sorted({prog["kind"] for prog in fx_programs})
    ph_kinds = sorted({prog["kind"] for prog in ph_programs})
    fx_beats = sorted({b for prog in fx_programs for b in prog["beats"]})
    ph_beats = sorted({b for prog in ph_programs for b in prog["beats"]})
    results[name] = {
        "fxKinds": fx_kinds, "phKinds": ph_kinds,
        "fxBeats": fx_beats, "phBeats": ph_beats,
        "fxNotes": fx_notes, "phNotes": ph_notes,
    }
print(json.dumps(results))
`;
  const out = execFileSync("python3", ["-c", py], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const results = JSON.parse(out.trim()) as Record<string, { fxKinds: string[]; phKinds: string[]; fxBeats: number[]; phBeats: number[] }>;

  const s006r = results["S006 (the clash)"];
  check("worker accepts the burst + reaction + debris kinds", s006r.fxKinds.includes("BURST") && s006r.phKinds.includes("REACTION") && s006r.phKinds.includes("DEBRIS"), JSON.stringify(s006r));
  check("the burst's beat binding survives the worker's normalize (beat 1)", s006r.fxBeats.includes(1), JSON.stringify(s006r.fxBeats));
  check("the debris binds beat 2 on the worker's clock", s006r.phBeats.includes(2), JSON.stringify(s006r.phBeats));
  check("no honest note rejected a program", s006r.fxKinds.length > 0 && s006r.phKinds.length === 2, JSON.stringify({ fx: s006r.fxNotes, ph: s006r.phNotes }));

  const s005r = results["S005 (the draw)"];
  check("the draw's trail + aura survive the worker", s005r.fxKinds.includes("TRAIL") && s005r.fxKinds.includes("AURA"), JSON.stringify(s005r));
  const s004r = results["S004 (the flash)"];
  check("the flash's burst + aura survive the worker", s004r.fxKinds.includes("BURST") && s004r.fxKinds.includes("AURA"), JSON.stringify(s004r));
} catch (err) {
  check("python mirror ran", false, err instanceof Error ? err.message.slice(0, 200) : String(err));
}

console.log(failures === 0 ? "\nE2E GREEN - the choreographer's DNA obeys every law the wire obeys" : `\nE2E RED - ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
