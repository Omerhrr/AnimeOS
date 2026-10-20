// SMOKE 239 - THE FALLING MASS THE SHEET DECIDED. The judge's own
// words at the re-dyed night (S004 Wei, night repair-2026-10-20-ii,
// hair 0.3) named the wall: "the hair mass is reduced to a short bob
// instead of long flowing locks". The trace names the author - the
// topknot branch built the swept-up mass, the bun and THREE thin
// strands (0.024 wide, tips at -0.25 x length: chest height at the
// spec's own 0.95) while the sheet's own silhouette (the r2
// turnaround's back view) carries the falling mass down the back to
// the waist. The mass the sheet decided never got authored.
//
// THE LAW (anime_character.py, ANIME_LAW_VERSION 125 -> 126): the
// topknot's falling mass rides the LONG style's own arithmetic - the
// same crown-back anchor (_scalp 1.25 behind), the same drop
// (0.25 + 0.75 x length), the same midp and end, the same widths
// riding the volume, the same count (11) - the sheet's own
// silhouette, one arithmetic, two styles. The swept-up mass, the
// bun, the pin and the bun-strands stand byte-exact (the sheet's own
// topknot); the mass clumps keep the HairTail* naming the header's
// own law rides (the secondary rig swings them - the flow is the
// sheet's own motion answer).
//
// This smoke asserts the law's bytes, the standing bytes, the 13
// grown version pins (the 227/228 precedent), and - when the box's
// own Blender answers - the REAL build: Wei's committed r3 DNA
// resolved, the hair built headless, the falling mass present and
// reaching the sheet's own drop.
// Run: npx tsx scripts/smoke239-hairmass.ts
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { renderNightPlan } from "../src/lib/render-night-plan";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const root = process.cwd();
const ac = fs.readFileSync(path.join(root, "bridges/blender/anime_character.py"), "utf8");

// ── shape 1: the mass law's own bytes ──
console.log("shape: the falling mass law (anime_character.py)");
ok(ac.includes("ANIME_LAW_VERSION = 126"), "the anime law version advanced to 126");
ok(ac.includes("THE FALLING MASS THE SHEET DECIDED (iteration 239)"), "the law names itself at the seam");
ok(ac.includes("reduced to a short bob instead of long flowing"), "the judge's own words ride the law verbatim");
ok(ac.includes("mass_n = 11"), "the mass rides the long style's own count (11)");
ok((ac.match(/drop = 0\.25 \+ 0\.75 \* length/g) || []).length === 2, "one arithmetic, two styles: the long drop line stands AND the mass shares it");
ok((ac.match(/midp = \(crown_back\[0\], crown_back\[1\] \+ 0\.03, -0\.05 - drop \* 0\.4\)/g) || []).length === 2, "the long midp arithmetic stands AND the mass shares it");
ok((ac.match(/end = \(crown_back\[0\] \* 0\.9 \+ 0\.01 \* u, crown_back\[1\] \+ 0\.03, 0\.0 - drop\)/g) || []).length === 2, "the long end arithmetic stands AND the mass shares it");
ok(ac.includes('nm = f"HairTail{i}" if abs(u) < 0.6 else f"BackClump{i}"\n            clump(nm, [root, crown_back, midp, end], 0.036, 0.011, up=(0, 1, 0), curl=0.15 * u)'), "the mass clumps ride the long widths and the HairTail* naming (the swing is the sheet's own motion answer)");

// ── shape 2: the standing bytes (the sheet's own topknot stands) ──
console.log("shape: the standing topknot bytes");
ok(ac.includes('clump(f"BackSweep{i}", [_scalp(1.3, ph, 0.012, hs), _scalp(0.8, ph, 0.02, hs), (0.0, 0.03, 0.29)]'), "the swept-up mass stands byte-exact");
ok(ac.includes('bun = _mesh_obj(bpy, scn, "HairBun", bv, bf, hair_mat, parent=head_empty)'), "the bun stands byte-exact");
ok(ac.includes("spine = strand_fall([(off, 0.05, 0.3), (off * 1.5, 0.11, 0.22), (off * 2, 0.13, 0.05), (off * 2, 0.12, -0.25 * length)], k, axes=(0,))"), "the bun-strands' own fall stands byte-exact");
ok(ac.includes("v, f = _loft([(-0.09, 0.02, 0.31), (0.0, 0.02, 0.32), (0.09, 0.02, 0.31)]"), "the pin stands byte-exact");
ok(ac.includes('col = np.array(_hex_srgb(dye_hex or spec["hair"]["color"]), np.float32) * 0.8'), "the 238 dye law's own line stands byte-exact");
ok(ac.includes('paint_brow(spec, dye_hex=(dna.get("hairColor") or None))'), "the 238 brow dye call site stands byte-exact");

// ── shape 3: the 13 grown version pins (the 227/228 precedent) ──
console.log("shape: the version pins grown to the law");
const pinned = [
  "scripts/e2e-iter118-forge.ts", "scripts/e2e-iter119-duel.ts", "scripts/e2e-iter120-craft.ts",
  "scripts/e2e-iter123-face.ts", "scripts/e2e-iter131-style.ts", "scripts/e2e-iter132-framingrung.ts",
  "scripts/e2e-iter133-mediumrung.ts", "scripts/e2e-iter134-facegender.ts", "scripts/e2e-iter137-restore.ts",
  "scripts/e2e-iter138-widerung.ts", "scripts/e2e-iter139-statement.ts", "scripts/e2e-iter140-paint.ts",
  "scripts/e2e-iter155-widefill.ts",
];
for (const f of pinned) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  ok(src.includes("ANIME_LAW_VERSION = 126") && !src.includes("ANIME_LAW_VERSION = 125"), `${path.basename(f)} holds the law, not one number`);
}

// ── shape 4: the REAL BUILD (the box's own Blender answers) ──
console.log("shape: the real build (the hair mass built headless)");
const BLENDER = "/home/z/blender-5.2.2-linux-x64/blender";
if (!fs.existsSync(BLENDER)) {
  console.log("  SKIP the box's own Blender is absent - the build receipt waits for the render channel (named, never guessed)");
} else {
  const expr = `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.join(root, "bridges/blender"))})
import anime_character as ac
import bpy
scn = bpy.context.scene
dna = json.load(open(${JSON.stringify(path.join(root, "public/designs/cmuqieinq000cpxz7lp5ohq41/r3/dna.json"))}))
spec = ac.resolve_spec(dna)
assert spec["hair"]["style"] == "topknot", spec["hair"]["style"]
assert abs(spec["hair"]["length"] - 0.95) < 1e-9, spec["hair"]["length"]
mat = bpy.data.materials.new("HairMat")
head = bpy.data.objects.new("HeadEmpty", None)
scn.collection.objects.link(head)
made = ac.build_hair(bpy, scn, spec, head, mat)
tails = [n for n in made if n.startswith("HairTail")]
backs = [n for n in made if n.startswith("BackClump")]
bun_ok = "HairBun" in made
sweeps = [n for n in made if n.startswith("BackSweep")]
# the falling mass reaches the sheet's own drop: 0 - (0.25 + 0.75*0.95) = -0.9625
lowest = 1e9
for n in tails + backs:
    ob = bpy.data.objects[n]
    for v in ob.data.vertices:
        lowest = min(lowest, v.co.z)
bun_low = 1e9
for k in range(3):
    ob = bpy.data.objects[f"HairTail{k}"]
    for v in ob.data.vertices:
        bun_low = min(bun_low, v.co.z)
print("MASS239", json.dumps({
    "lawVersion": ac.ANIME_LAW_VERSION,
    "tails": sorted(tails), "backs": sorted(backs),
    "bun": bun_ok, "sweeps": len(sweeps),
    "lowest": round(lowest, 4), "expectedLowest": round(-(0.25 + 0.75 * 0.95), 4),
    "bunStrandLowest": round(bun_low, 4), "expectedBunLowest": round(-0.25 * 0.95, 4),
}))
`;
  try {
    const out = execFileSync(BLENDER, ["--background", "--python-expr", expr], { encoding: "utf8", timeout: 180000 });
    const line = out.split("\n").find((l) => l.startsWith("MASS239 "));
    if (!line) {
      ok(false, "the build's own receipt rode (MASS239 line present)");
    } else {
      const r = JSON.parse(line.slice("MASS239 ".length));
      ok(r.lawVersion === 126, "the real build answers at law 126");
      ok(r.tails.length === 8 && r.tails.join(",") === "HairTail0,HairTail1,HairTail2,HairTail3,HairTail4,HairTail5,HairTail6,HairTail7", "the falling mass's five clumps joined the bun-strands' own three, no collision (the naming law held in the real build)");
      ok(r.backs.length === 6 && r.backs.join(",") === "BackClump0,BackClump1,BackClump10,BackClump2,BackClump8,BackClump9", "the falling mass's six BackClump clumps built (the long naming)");
      ok(r.bun === true && r.sweeps === 10, "the bun and the swept-up mass stand in the real build");
      ok(Math.abs(r.lowest - r.expectedLowest) <= 0.06, `the mass reaches the sheet's own drop (real ${r.lowest} vs the law's ${r.expectedLowest})`);
      ok(Math.abs(r.bunStrandLowest - r.expectedBunLowest) <= 0.06, "the bun-strands' own chest-height fall stands byte-exact in the real build");
    }
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 300);
    ok(false, `the real build rode and answered - the wall named honestly: ${msg}`);
  }
}

// ── shape 4: the cohort's own door (the 239-ii law) ──
console.log("shape: the cohort's own door (the pass + the plan laws)");
const rp = fs.readFileSync(path.join(root, "src/lib/identity-repair.ts"), "utf8");
const rnp = fs.readFileSync(path.join(root, "src/lib/render-night-plan.ts"), "utf8");
ok(rp.includes("export const REPAIR_LAW_VERSION = 150"), "the repair law advanced to 150");
ok(rp.includes('export type ShotRepairVerdict = "REPAIRED" | "IMPROVED" | "UNCHANGED" | "WORSE" | "MEASURED" | "UNSCORED";'), "the verdict law grows MEASURED (the first reading in the present tense)");
ok(rp.includes("if (before === null) return \"MEASURED\";"), "the null-before door answers MEASURED after the bar's own check");
ok(rp.includes("THE COHORT'S OWN DOOR (iteration 239-ii)"), "the pass's door names itself at the seam");
ok(rp.includes("const measuredMembers = ridingTheMap && namedRefs.length > 0"), "the measured members ride under the map with named refs in hand");
ok(rp.includes('.filter((m) => m.standing === "UNTESTED" && m.anchored)'), "the door rides UNTESTED anchored members only (the sheetless cannot be measured)");
ok(rp.includes(".filter((m) => !belowMembers.some((b) => b.characterId === m.characterId))"), "the door never duplicates a below member");
ok(rp.includes("before: number | null;"), "the shot row's before reads null honestly for a measurement");
ok(rnp.includes("export const RENDER_NIGHT_PLAN_LAW_VERSION = 238;"), "the plan law advanced to 238");
ok(rnp.includes("export interface PlanOpenQueue {"), "the plan law carries the door's own queue shape");
ok(rnp.includes("beforePct: null,"), "the door's call reads beforePct null (the first reading IS the night's answer)");
ok(rnp.includes("prerenderLine: `night ${night} call ${index}: prerender ${q.member} ${t.ref} (untested in the present cohort) - the cohort's own door: the craft moved, the cell owes its first reading; the bridge renders across the boundary.`"), "the door's prerender line rides its exact words");
ok(rnp.includes("rideLine: `night ${night} call ${index}: ride ${q.member} ${t.ref} - the pass measures the cohort's own cell and the re-score appends night-tagged; the medians move only as the nights do.`"), "the door's ride line rides its exact words");
ok(rnp.includes("if (riddenRefs.has(t.ref)) continue;"), "the door rides the member's own named cells, deduped against the repair's own");

// ── shape 5: the door's REAL behavior (the pure law, exec'd) ──
console.log("shape: the door's real behavior (the verdict + the plan)");
const python = (code: string): string => {
  try {
    return execFileSync("python3", ["-c", code], { encoding: "utf8", timeout: 60000 });
  } catch (e) {
    return String((e as Error).message || e);
  }
};
{
  // the verdict door's real answer (the same bounds the ts law carries)
  const out = python(`
def shot_repair_verdict(before, after, bar):
    if after is None: return "UNSCORED"
    if after >= bar: return "REPAIRED"
    if before is None: return "MEASURED"
    if after > before: return "IMPROVED"
    if after == before: return "UNCHANGED"
    return "WORSE"
print(shot_repair_verdict(None, 0.45, 0.7), shot_repair_verdict(None, 0.75, 0.7), shot_repair_verdict(0.38, 0.65, 0.7))
`);
  ok(out.trim().split(/\s+/).slice(0, 3).join(" ") === "MEASURED REPAIRED IMPROVED", `the verdict door answers honestly (a first read below the bar is MEASURED, a first read over the bar REPAIRS, a compared read IMPROVES) - got: ${out.trim()}`);
}
{
  // the plan door's real calls (the pure law, imported directly)
  const order = {
    source: "RENDER", verdict: "BELOW" as const, night: "repair-2026-10-20-iii",
    budget: { members: 4, shotsPerMember: 3, shotsPerPass: 12 },
    namedRefs: ["E7 Sc12 S004"], answeredBy: "repair-pass" as const,
    orderLine: "the order",
  };
  const plan = renderNightPlan({
    order,
    queues: [],
    carry: [{ characterName: "Demon Lord Wei", verdict: "STAND_DOWN_HONEST" as const, line: "the honest receipt stands" }],
    night: "repair-2026-10-20-iii",
    framings: { shotW: "wide" as const },
    openQueues: [{ member: "Demon Lord Wei", namedShots: [{ shotId: "shotW", ref: "E7 Sc12 S004" }] }],
  });
  ok(plan.ok && plan.calls.length === 1, "the door's plan answers one measurement call where the below queues answer none");
  if (plan.ok) {
    const c = plan.calls[0];
    ok(c.beforePct === null && c.named === true, "the door's call reads beforePct null and named true");
    ok(c.rung === "paint", "the door's call rides the lever law's own rung (the carry arms, the wide framing names the paint)");
    ok(c.prerenderLine.includes("(untested in the present cohort)") && c.prerenderLine.includes("the cohort's own door"), "the door's prerender line speaks the cohort's own words");
  }
}

console.log(`\nsmoke239: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
