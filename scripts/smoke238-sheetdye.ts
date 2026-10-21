// SMOKE 238 - THE DYE THE SHEET NEVER DECIDED STOPS RIDING VISIBLE
// SURFACES. The judge's own words at the wide cell (S004 Wei, night
// repair-2026-10-20) named two walls: "the face structure is heavily
// simplified to a generic anime style" (face 0.2) and "the hair color
// has drifted from black to purple" (hair 0.4). The trace answered
// both with one law, every link on the record:
//
//   (1) THE BROW'S OWN DYE (anime_character.py): the brow decal dyed
//       from spec["hair"]["color"] - Wei's spec rode #5f9ea0 teal
//       over the sheet's own #0a0a0a answer (resolve_spec's own law:
//       "the designSpec wins over both"). The brow dyes from the
//       merged DNA's hairColor (the sheet's decided answer, the same
//       dye the hair mesh grades from); the spec stays the fallback.
//   (2) THE ENERGY DYE ANSWERS TO THE SHEET (animeos_bridge.py,
//       dye-v1): the 141 conviction (proven, never cured) named the
//       fx LIGHT TRANSPORT as the only lever; the 149 law bounded the
//       flood; the 238 trace names the hue's author - a colorless
//       program rode bladeColor or the code default #5eead4 teal the
//       sheet never decided (Wei: weaponType none, no blade field in
//       the sheet DNA). The weaponless member's hue derives from the
//       design's own painted accent (the robe accent); the weaponed
//       member keeps the blade's dye byte-exact; the default rides
//       only when the sheet answers neither. The 141 sentence
//       completes: the sheet decides WHAT COLOR the aura is.
//
// This smoke asserts the two seams' bytes, the pure law's real
// behavior (python-execd), the standing paths' byte-exactness, and
// the rung routing the 237 law owns (untouched).
// Run: npx tsx scripts/smoke238-sheetdye.ts
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION, type PlanMemberQueue } from "../src/lib/render-night-plan";
import { carriedAcceptanceVerdicts, type CarriedVerdict } from "../src/lib/acceptance-carry";
import type { RepairWorkOrder } from "../src/lib/repair-work-order";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

// ── shape 1: the brow's own dye (the law's first surface) ──
console.log("shape: the brow's own dye (anime_character.py)");
const ac = fs.readFileSync(path.join(process.cwd(), "bridges/blender/anime_character.py"), "utf8");
ok(ac.includes("def paint_brow(spec, w=256, h=64, dye_hex=None):"), "paint_brow grows the dye_hex param (the sheet's answer rides in)");
ok(ac.includes('col = np.array(_hex_srgb(dye_hex or spec["hair"]["color"]), np.float32) * 0.8'), "the dye line reads the sheet's answer first, the spec as fallback");
ok(ac.includes('paint_brow(spec, dye_hex=(dna.get("hairColor") or None))'), "the call site passes the merged DNA's own hairColor (the same dye the hair mesh grades from)");
ok(ac.includes("THE BROW'S OWN DYE (iteration 238"), "the law names itself at the seam");
ok(ac.includes('d.get("hairColor") or D["hair"]["color"]'), "resolve_spec's own standing line stays byte-exact (the spec still wins the HAIR mesh's spec reads - only the brow's dye re-anchors)");

// ── shape 2: the energy dye answers to the sheet (the law's second surface) ──
console.log("shape: the energy dye answers to the sheet (animeos_bridge.py, dye-v1)");
const br = fs.readFileSync(path.join(process.cwd(), "bridges/blender/animeos_bridge.py"), "utf8");
ok(br.includes('SHEET_DYE_LAW_VERSION = "dye-v1"'), "the law stands as named (dye-v1)");
ok(br.includes("the moon decides WHERE the glint sits, the sheet decides WHAT"), "the 141 sentence's completion rides the law's own words");
ok(br.includes("def sheet_energy_hex(cast_row):"), "the pure law exists");
ok(br.includes('if weapon and weapon != "none" and isinstance(blade, str) and blade.strip():'), "the weaponed member keeps the blade's own dye (byte-exact)");
ok(br.includes("return accent.strip()"), "the weaponless member's hue derives from the design's own painted accent (the robe accent)");
ok(br.includes("return \"#5eead4\""), "the default rides only when the sheet answers neither (the honest fallback, named)");
ok(br.includes("sheet_energy_hex(hero), job_id)"), "the fx rig's transport hue reads the sheet's answer (the 149 law's own call site)");
ok(!br.includes('(hero or {}).get("bladeColor") or "#5eead4", job_id)'), "the old default-first line is gone from the fx rig call site");
ok(br.includes('energy_hex = hero.get("bladeColor") or "#5eead4"'), "the BladeMat's own line stays byte-exact (the law's scope names the fx transport hue; a weaponless member builds no blade mesh)");
ok(/CRAFT_AIM_LAW_VERSION = "craft-v\d+"/.test(br) && br.includes('CRAFT_RUNGS = ("face", "paint")'), "the craft aim law stands versioned (the rungs untouched - the asserts hold the law, not one version string)");
const fxp = fs.readFileSync(path.join(process.cwd(), "bridges/blender/fx_pass.py"), "utf8");
ok(fxp.includes('ob.visible_diffuse = False  # THE FX TRANSPORT GUARD (149): the dye keeps its class') && fxp.includes("def _transport_light"), "the 149 transport guard stands byte-exact in the fx pass (the bound keeps its teeth)");

// ── shape 3: the pure law's real behavior (python-execd) ──
console.log("shape: sheet_energy_hex answers as the law names (real execution)");
const pyProbe = `
import re, json
src = open("bridges/blender/animeos_bridge.py").read()
m = re.search(r"def sheet_energy_hex\\(cast_row\\):.*?(?=\\n# ──|\\n\\Z)", src, re.S)
ns = {}
exec(m.group(0), ns)
f = ns["sheet_energy_hex"]
wei = {"weaponType": "none", "bladeColor": "#5eead4", "robeAccent": "#c4ad7e"}
lin = {"weaponType": "sword", "bladeColor": "#5eead4", "robeAccent": "#d4af37"}
silent = {"weaponType": "none", "robeAccent": None, "bladeColor": ""}
empty = None
print(json.dumps({
  "wei_gold": f(wei),
  "lin_blade": f(lin),
  "silent_default": f(silent),
  "none_default": f(empty),
  "no_weapon_field": f({"bladeColor": "#5eead4"}),
}))
`;
try {
  const out = execFileSync("python3", ["-c", pyProbe], { cwd: process.cwd(), encoding: "utf8" });
  const r = JSON.parse(out.trim().split("\n").filter((l) => l.startsWith("{"))[0]);
  ok(r.wei_gold === "#c4ad7e", "Wei (weaponType none) reads the sheet's own accent - the gold the trim painted, never the default teal");
  ok(r.lin_blade === "#5eead4", "Lin (weaponType sword) keeps the blade's own dye byte-exact");
  ok(r.silent_default === "#5eead4", "a sheet that answers neither falls to the default, named");
  ok(r.none_default === "#5eead4", "no row at all falls to the default (the honest fallback)");
  ok(r.no_weapon_field === "#5eead4" || r.no_weapon_field === "#5eead4", "a row with no weapon field takes the accent path when one paints, else the default");
} catch (e) {
  ok(false, `the python probe rode: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`);
}

// ── shape 4: the plan's own law stands (the rungs untouched) ──
console.log("shape: the 237 rung routing stands (the plan law untouched)");
ok(RENDER_NIGHT_PLAN_LAW_VERSION >= 238, `the plan law stands numbered (v${RENDER_NIGHT_PLAN_LAW_VERSION} - the asserts hold the law, not one version number)`);
const ORDER: RepairWorkOrder = {
  source: "RENDER",
  verdict: "BELOW",
  night: "repair-2026-10-20-ii",
  budget: { members: 4, shotsPerMember: 3, shotsPerPass: 4 },
  namedRefs: ["E7 Sc12 S002", "E7 Sc12 S004"],
  answeredBy: "repair-pass",
  orderLine: "RENDER sits BELOW - the named cells ride first.",
};
const QUEUES: PlanMemberQueue[] = [
  {
    member: "Demon Lord Wei",
    below: [{ shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.4 }],
  },
];
const carry: CarriedVerdict = "STAND_DOWN_HONEST";
const carries = carriedAcceptanceVerdicts(
  [{ night: "acceptance-2026-10-20", characterName: "Demon Lord Wei", verdict: carry }],
  ["Demon Lord Wei"],
);
const plan = renderNightPlan({
  order: ORDER,
  queues: QUEUES,
  carry: carries,
  night: "repair-2026-10-20-ii",
  callsPerMember: 1,
  framings: { "shot-s004": "wide" },
});
ok(plan.ok && plan.calls.length === 1, "the plan builds one call for the wide cell");
ok(plan.calls[0]?.rung === "paint", "the wide framing's rung routing stands (paint - the 237 law's own answer; the 238 dye rides the standing craft beneath it)");
ok((plan.calls[0]?.lever ?? "").includes("the toon look's own language"), "the wide cell's lever line keeps its own words");
ok((plan.calls[0]?.carried ?? "").includes("the honest receipt stands"), "the carry rides under its own verdict (the acceptance's answer, named)");

console.log(`\nSMOKE 238: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
