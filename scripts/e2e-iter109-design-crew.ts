// Iteration 109 E2E (pure half): THE STUDIO DESIGNS CHARACTERS.
// Proves without a database or a provider:
//   A. the spec law: clampSpec clamps numbers, refuses out-of-vocabulary
//      enums and bad hexes (named in `rejected`), drops unknown fields
//   B. the tuner whitelist: applySpecPatch applies only patchable fields
//   C. the judge protocol: parseJudgeVerdict clamps scores, derives the
//      overall, keeps only patchable fields on issues; garbage -> null
//   D. the floor: patchFromIssues + bestRound
//   E. ONE LAW, TWO RUNTIMES: the Python generator's resolve_spec clamps
//      the same extremes to the same bounds (needs python3 + the bridge
//      dir; the bpy module is NOT needed for resolve_spec)
// Run: npx tsx scripts/e2e-iter109-design-crew.ts
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  clampSpec, applySpecPatch, parseJudgeVerdict, patchFromIssues, bestRound, defaultSpec, NUMERIC_RANGES,
} from "../src/lib/design/character-spec";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

// A
const a = clampSpec({ eyes: { size: 9, color: "#AABBCC", shape: "cat" }, hair: { style: "mohawk", color: "red" }, body: { gender: "male" }, junk: { x: 1 } });
check("numbers clamp to the range", a.spec.eyes.size === NUMERIC_RANGES["eyes.size"][1], String(a.spec.eyes.size));
check("hex accepted and normalized", a.spec.eyes.color === "#aabbcc");
check("bad enum refused and named", a.rejected.includes("eyes.shape") && a.rejected.includes("hair.style") && a.spec.hair.style === defaultSpec().hair.style, JSON.stringify(a.rejected));
check("bad hex refused and named", a.rejected.includes("hair.color"));
check("valid enum lands", a.spec.body.gender === "male");
check("unknown section dropped", !("junk" in (a.spec as unknown as Record<string, unknown>)));

// B
const b = applySpecPatch(defaultSpec(), { "eyes.size": 1.2, "outfit.type": "tunic", "body.wings": 2, "eyes.color": "nope" });
check("whitelisted fields apply", b.spec.eyes.size === 1.2 && b.spec.outfit.type === "tunic");
check("non-whitelisted field refused", b.rejected.includes("body.wings"));
check("bad value inside a whitelisted field refused", b.rejected.includes("eyes.color") && !b.applied.includes("eyes.color"));

// C
const v = parseJudgeVerdict('noise {"scores":{"face":0.8,"eyes":1.7,"hair":0.4},"issues":[{"aspect":"hair","note":"bangs too sparse","field":"hair.bangs","suggestion":"full"},{"aspect":"x","note":"y","field":"body.wings","suggestion":1}],"note":"close"} tail');
check("verdict parses through noise", v !== null);
check("scores clamp 0..1, missing aspects score 0", v!.scores.eyes === 1 && v!.scores.palette === 0);
check("overall derived when absent", Math.abs(v!.overall - (0.8 + 1 + 0.4) / 7) < 0.002, String(v!.overall));
check("issue fields filtered to the whitelist", v!.issues[0].field === "hair.bangs" && v!.issues[1].field === undefined && v!.issues[1].aspect === "style");
check("garbage verdict -> null", parseJudgeVerdict("no json here") === null);

// D
const p = patchFromIssues(v!.issues);
check("judge suggestions become the floor patch", JSON.stringify(p) === JSON.stringify({ "hair.bangs": "full" }));
const best = bestRound([{ verdict: null }, { verdict: { ...v!, overall: 0.5 } }, { verdict: { ...v!, overall: 0.7 } }, { verdict: { ...v!, overall: 0.7 } }]);
check("best round = highest overall, earliest on ties", best?.verdict?.overall === 0.7);

// E
try {
  const bridgeDir = path.join(process.cwd(), "bridges", "blender");
  const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(bridgeDir)})
import anime_character as ac
lo = ac.resolve_spec({"designSpec": {${Object.keys(NUMERIC_RANGES).map((k) => `"${k.split(".")[0]}": {}`).filter((x, i, arr) => arr.indexOf(x) === i).join(", ")}}})
def ext(val):
    ds = {}
    for k in ${JSON.stringify(Object.keys(NUMERIC_RANGES))}:
        s, f = k.split(".")
        ds.setdefault(s, {})[f] = val
    r = ac.resolve_spec({"designSpec": ds})
    return {k: r[k.split(".")[0]][k.split(".")[1]] for k in ${JSON.stringify(Object.keys(NUMERIC_RANGES))}}
print(json.dumps({"hi": ext(99), "lo": ext(-99)}))
`;
  const out = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf-8" }).trim().split("\n").pop()!);
  let mism: string[] = [];
  for (const [k, [lo, hi]] of Object.entries(NUMERIC_RANGES)) {
    if (Math.abs(out.hi[k] - hi) > 1e-9 || Math.abs(out.lo[k] - lo) > 1e-9) mism.push(`${k}: py ${out.lo[k]}..${out.hi[k]} vs ts ${lo}..${hi}`);
  }
  check("python resolve_spec clamps every numeric field to the TS bounds", mism.length === 0, mism.join("; "));
} catch (err) {
  check("python parity ran", false, err instanceof Error ? err.message.slice(0, 200) : String(err));
}

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} - iteration 109 design crew (pure half)`);
process.exit(failures === 0 ? 0 : 1);
