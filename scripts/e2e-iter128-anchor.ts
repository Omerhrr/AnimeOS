// E2E iteration 128 - THE DESIGN DYE IS THE ANCHOR + THE EMBROIDERY
// RUNG. The 127 night moved the aggregate for the first time in five
// nights (mean 48 / median 40 / p10 35, from 43/35/25) and its notes
// named the remaining walls in the judge's own words:
//   1. THE SHEET'S OWN RENDER DRIFTS FROM THE COMMITTED DESIGN - the
//      reader measured #9bbcb3 off the sheet's own render while the
//      committed design says #2f6d63, and the conformance built the
//      sheet's mistake into the cast (S004 "a simplified white robe
//      instead of the canonical teal/gold", S005 palette still 20).
//      The answer: the conformance gains the design's own dye as the
//      ANCHOR - a riding dye that sits outside the committed design
//      dye's value class (the 115 PULL_LUM_CAP measure) is the
//      sheet's own render drift; the design's dye leads (the adherent
//      0.75 factor), the row is named, and the drifted sheet's
//      palette stands down for that role.
//   2. "A SIMPLIFIED LOW-POLY 3D MODEL THAT LACKS THE INTRICATE GOLD
//      EMBROIDERY" (S005 style) - the canon's trim ADDRESS exists
//      (the sash, the hem trim, the accent pieces) but a flat accent
//      band reads as paint. The answer: THE EMBROIDERY RUNG - at the
//      painted framings the accent-dyed trim weaves a quantized
//      stitch wave across its whole surface and robe-scale cloth
//      weaves inside its hem band region, the thread being the
//      band's own dye lifted (the metallic-thread read) - cloth
//      only, after the brush, the measurer chain never sees it.
// The probes import the REAL modules (tsx for the TS law, plain
// python3 for the toon pass - no bpy - the laws are pure).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
function expect(name: string, cond: boolean, detail: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!cond) failures++;
}

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const PY_PROBE = `
import colorsys, importlib.util, json, os, sys
ROOT = sys.argv[-1]
spec = importlib.util.spec_from_file_location("tp", os.path.join(ROOT, "bridges", "blender", "toon_pass.py"))
tp = importlib.util.module_from_spec(spec); spec.loader.exec_module(tp)
out = {}
out["lawVersion"] = tp.TOON_LAW_VERSION

# THE THREAD TONE (the metallic-thread read): bounded into the unit
# cube, lifted, warm-pushed - for the canon accents and the extremes.
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexlin(h):
    return tuple(srgb_to_lin(int(h[i:i+2], 16) / 255.0) for i in (0, 2, 4))
def thread_check(h):
    base = hexlin(h)
    t = tp.embroidery_thread_for(base)
    return {
        "bounded": all(0.0 <= v <= 1.0 for v in t),
        "lifted": sum(t) > sum(base) and t[0] > base[0] and t[1] > base[1],
        "warmPush": t[0] >= min(1.0, base[0] * tp.EMBROIDERY_THREAD_LIFT + tp.EMBROIDERY_THREAD_WARM) - 1e-9,
        "thread": [round(v, 6) for v in t],
        "base": [round(v, 6) for v in base]}
out["jadeThread"] = thread_check("3f8f7a")   # Lin's canonical accent
out["goldThread"] = thread_check("a8842c")   # Wei's canonical accent
out["whiteThread"] = thread_check("ffffff")
out["blackThread"] = thread_check("101010")

# THE LEVERS HOLD THEIR SCOPE: the ANCHORED robe dye (#4a8177 - the
# 0.75 blend of the sheet-read #9bbcb3 back toward the committed
# #2f6d63) is a DARK-MID dye in the design's own value class - NOT a
# pale dye (the bank's own law: darks read dark honestly, no branch).
# What the anchor RESTORES is the CHROMA: the drifted sheet-read dye
# sat at linear S 0.21 (the wash's gray-sage), the anchored dye sits
# past 0.50 - more than twice the saturation, the design's own read.
anchored = hexlin("4a8177")
_a_h, a_l, a_s = colorsys.rgb_to_hls(*anchored)
drifted = hexlin("9bbcb3")
_d_h, d_l, d_s = colorsys.rgb_to_hls(*drifted)
out["anchored"] = {
    "isPaleCloth": tp._is_pale_cloth(anchored),
    "darkMid": a_l < 0.30,
    "sat": round(a_s, 6),
    "driftedSat": round(d_s, 6),
    "satRestored": a_s > d_s * 2.0}
# and the DESIGN dye itself (#2f6d63) - what the anchor restores the
# value class TOWARD - is chroma-rich in its own class.
design = hexlin("2f6d63")
_dh, dl, ds = colorsys.rgb_to_hls(*design)
out["design"] = {"sat": round(ds, 6), "linearL": round(dl, 6)}

# the 127 statement stands untouched: the swing law of the framing
out["swing"] = {"establishing": round(tp.painterly_swing_for(0.70), 6),
                "wide": round(tp.painterly_swing_for(0.55), 6),
                "low": round(tp.painterly_swing_for(0.40), 6),
                "bounded": tp.painterly_swing_for(1.5) <= 0.5}
print("PROBE_JSON " + json.dumps(out))
`;

// ── the REAL TS-module probe (tsx, the anchor plan law) ──
const TS_PROBE = `
import { planSheetConformance, relLum, blendHex, DESIGN_ANCHOR_FACTOR } from "../src/lib/blender/sheet-palette";
const palette = ["#9bbcb3", "#dfe4ec", "#476565", "#0d0d0d", "#a8842c"];
const out: Record<string, unknown> = {};
// the named case: the sheet-read pale robe vs the committed jade design
const named = planSheetConformance(
  { robe: "#9bbcb3", accent: "#3f8f7a", hair: "#0d0d0d", boots: "#241a12" },
  palette, 0.75, undefined,
  { robe: "#2f6d63", accent: "#3f8f7a", hair: "#16161d" },
);
out.named = named;
// the honest case: a riding dye INSIDE the design's value class keeps
// the standing law (no anchor row, the palette pull proceeds)
const honest = planSheetConformance(
  { robe: "#3f7d72" },   // near the design's value class
  palette, 0.75, undefined,
  { robe: "#2f6d63" },
);
out.honest = honest;
// the absent-design case: no design param - the 127 law byte-equal
const absent = planSheetConformance({ robe: "#9bbcb3", accent: "#3f8f7a" }, palette, 0.75);
out.absent = absent;
const absentLegacy = planSheetConformance({ robe: "#9bbcb3", accent: "#3f8f7a" }, palette, 0.75, undefined, undefined);
out.absentLegacy = absentLegacy;
// the anchor lands INSIDE the design's value class
const robeRow = (named as Array<{ role: string; to: string; anchored?: string }>).find((r) => r.role === "robe")!;
out.anchorLandsInClass = Math.abs(relLum(robeRow.to) - relLum("#2f6d63")) <= 0.15;
out.anchorExact = robeRow.to === blendHex("#9bbcb3", "#2f6d63", DESIGN_ANCHOR_FACTOR);
console.log("TS_PROBE_JSON " + JSON.stringify(out));
`;

async function main() {
  // ── 1. THE DESIGN DYE IS THE ANCHOR (source law, TS side) ──
  const sp = read("src/lib/blender/sheet-palette.ts");
  expect("the conformance declares the design anchor's bound (the adherent 0.75 factor)",
    sp.includes("export const DESIGN_ANCHOR_FACTOR = 0.75"), "the factor");
  expect("the anchor rows carry their own naming (anchored field on the row)",
    sp.includes("anchored?: string;") && sp.includes("anchored: `design anchor:"), "the naming");
  expect("the anchor fires on the 115 value-class measure (PULL_LUM_CAP) and only on a real hex",
    sp.includes("Math.abs(relLum(from) - relLum(designDye)) > PULL_LUM_CAP")
      && sp.includes('designDye &&') && sp.includes('designDye.startsWith("#")'), "the gate");
  expect("the anchored row stands the sheet's palette down for the role (no pull after the anchor)",
    sp.includes("continue;\n    }\n    let nearest = palette[0];"), "the stand-down");
  expect("the anchor is an OPTIONAL fifth param - the 127 callers keep their exact behavior",
    sp.includes("design?: { robe?: string; accent?: string; hair?: string; boots?: string }"), "the param");

  const rt = read("src/lib/engine/render.ts");
  expect("the render path hands the design text's own compile as the anchor (the committed design intent)",
    rt.includes("castDesigns.push({ robe: regex.robeColor, accent: regex.robeAccent, hair: regex.hairColor })")
      && rt.includes("castDesigns[i] ?? {}"), "the wiring");
  expect("the conformance note names the anchor count when it led",
    rt.includes("the design anchor led on ${anchoredCount} drifted row(s)"), "the note");

  const bridge = read("bridges/blender/animeos_bridge.py");
  expect("the bridge's evidence carries the anchored naming on the applied rows",
    bridge.includes('**({"anchored": str(row.get("anchored"))} if row.get("anchored") else {})'), "the evidence");

  // ── 2. THE EMBROIDERY RUNG (source law, toon pass) ──
  const tp = read("bridges/blender/toon_pass.py");
  expect("the toon pass declares the 129 law version", tp.includes("TOON_LAW_VERSION = 129"), "v128");
  expect("the rung's dials are named laws (stitch, strength, thread lift, warm push, the trim address)",
    tp.includes("EMBROIDERY_STITCH = 21.0") && tp.includes("EMBROIDERY_STRENGTH = 0.55")
      && tp.includes("EMBROIDERY_THREAD_LIFT = 1.42") && tp.includes("EMBROIDERY_THREAD_WARM = 0.05")
      && tp.includes('TRIM_MAT_MARKS = ("accent",)'), "the dials");
  expect("the thread tone is bounded and hue-faithful (the metallic-thread read)",
    tp.includes("def embroidery_thread_for(rgb):") && tp.includes("out.append(min(1.0, max(0.0, v)))"), "the thread");
  expect("the weave is CLOTH ONLY (the skin never weaves, the hair never weaves)",
    tp.includes('if kind == "cloth" and not mat.get("animeos_set_surface"):') && tp.includes("CLOTH ONLY - the skin never weaves"), "the guard");
  expect("the accent trim weaves whole; robe-scale cloth weaves the hem band region (the yuanbian)",
    tp.includes("if not trim:") && tp.includes("hem.inputs[1].default_value = HEM_BAND"), "the mask");
  expect("the stitch field is three CONSTANT steps on the mesh's own Generated coords (never a gradient)",
    tp.includes('est.color_ramp.interpolation = "CONSTANT"')
      && tp.includes('nt.links.new(em_tc.outputs["Generated"], em_sep.inputs[0])'), "the field");
  expect("the weave rides AFTER the brush (the two statements compose) and inside the band emissions",
    tp.includes("_brush_wrap(em_lit, rgb, color_in)") && tp.includes("_embroidery_wrap(em, shadow_base)")
      && tp.includes("_embroidery_wrap(em_lit, rgb)"), "the order");
  expect("the rung's evidence names both addresses (trims + hems) and the thread's dials",
    tp.includes('"trims": emb_trims, "hems": emb_hems') && tp.includes('"threadLift": EMBROIDERY_THREAD_LIFT'), "the evidence");
  expect("the set's own cloths never weave (the world is not embroidered)",
    tp.includes("not mat.get(\"animeos_set_surface\"):\n            is_trim"), "the set exclusion");

  // ── 3. THE LAWS ANSWER FOR REAL (plain python3, no bpy) ──
  const r = spawnSync("python3", ["-c", PY_PROBE, ROOT], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0 || !r.stdout.includes("PROBE_JSON")) {
    expect("the real-module probe runs", false, { status: r.status, err: r.stderr?.slice(0, 300) });
    return finish();
  }
  const probeOut = r.stdout.slice(r.stdout.indexOf("PROBE_JSON ") + "PROBE_JSON ".length).split("\n")[0];
  const probe = JSON.parse(probeOut);
  expect("the law version answers 129 from the real module", probe.lawVersion === 129, probe.lawVersion);
  expect("the jade accent's thread is bounded, lifted and warm-pushed (Lin's canonical trim)",
    probe.jadeThread.bounded && probe.jadeThread.lifted && probe.jadeThread.warmPush, probe.jadeThread);
  expect("the gold accent's thread is bounded, lifted and warm-pushed (Wei's canonical trim)",
    probe.goldThread.bounded && probe.goldThread.lifted && probe.goldThread.warmPush, probe.goldThread);
  expect("the thread tone is bounded at the extremes (white pins, near-black warms only)",
    probe.whiteThread.bounded && probe.blackThread.bounded
      && Math.max(...probe.whiteThread.thread) <= 1.0, [probe.whiteThread, probe.blackThread]);
  expect("the ANCHORED dye is a dark-mid jade in the design's own class (darks read dark - no pale branch) whose chroma the anchor RESTORES (2x+ the drifted dye's saturation)",
    probe.anchored.darkMid && !probe.anchored.isPaleCloth && probe.anchored.satRestored
      && probe.anchored.sat > 0.5, probe.anchored);
  expect("the DESIGN dye itself is chroma-rich in its own class (the anchor restores the saturated read)",
    probe.design.sat > 0.6, probe.design);
  expect("the 127 swing statement stands untouched (base + gain x depth, bounded)",
    probe.swing.establishing === Math.round(0.31 * 1e6) / 1e6
      && probe.swing.wide === Math.round(0.265 * 1e6) / 1e6
      && probe.swing.low === Math.round(0.22 * 1e6) / 1e6
      && probe.swing.bounded, probe.swing);

  // ── 4. THE ANCHOR PLAN ANSWERS FOR REAL (tsx, the REAL module) ──
  const probeFile = path.join(ROOT, "scripts", ".probe-128-inline.ts");
  fs.writeFileSync(probeFile, TS_PROBE);
  const tr = spawnSync("npx", ["tsx", probeFile], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  fs.rmSync(probeFile, { force: true });
  const tOut = tr.stdout?.includes("TS_PROBE_JSON")
    ? tr.stdout.slice(tr.stdout.indexOf("TS_PROBE_JSON ") + "TS_PROBE_JSON ".length).split("\n")[0]
    : null;
  if (!tOut) {
    expect("the real TS-module probe runs", false, { status: tr.status, err: (tr.stderr || "").slice(0, 300) });
    return finish();
  }
  const tp2 = JSON.parse(tOut);
  const named = tp2.named as Array<{ role: string; from: string; to: string; delta: number; anchored?: string; skipped?: string }>;
  const robe = named.find((x) => x.role === "robe")!;
  expect("THE NAMED CASE anchors: the sheet-read #9bbcb3 pulls back to the exact 0.75 blend of the committed #2f6d63",
    robe.anchored !== undefined && tp2.anchorExact === true && robe.to === "#4a8177", robe);
  expect("the anchor row names the drift it outranked (the sheet's own render vs the committed design)",
    typeof robe.anchored === "string" && robe.anchored.includes("#9bbcb3") && robe.anchored.includes("#2f6d63")
      && robe.anchored.includes("the design's dye leads"), robe.anchored);
  expect("the anchor lands INSIDE the design's value class (the 115 measure holds after the pull-back)",
    tp2.anchorLandsInClass === true, tp2.anchorLandsInClass);
  expect("the honest dye (inside the design's value class) takes NO anchor - the standing palette pull proceeds",
    named.find((x) => x.role === "accent")?.anchored === undefined
      && (tp2.honest as Array<{ anchored?: string }>).every((x) => !x.anchored), tp2.honest);
  expect("the absent-design call is byte-equal to the legacy call (the 127 law unchanged without a design)",
    JSON.stringify(tp2.absent) === JSON.stringify(tp2.absentLegacy), "identical");
  expect("roles without a design dye never anchor (boots keep the standing pull)",
    named.find((x) => x.role === "boots")?.anchored === undefined, named.find((x) => x.role === "boots"));

  // ── 5. THE NIGHT TOOL (the 122 ops law: double-fork detach, the explicit env) ──
  const night = read("scripts/detached-night128.mjs");
  expect("the night detaches double-forked with the explicit DATABASE_URL, hull ink, median of 3",
    night.includes('DATABASE_URL: "file:/home/z/my-project/AnimeOS/db/custom.db"')
      && night.includes('ANIMEOS_INK: "hull"') && night.includes('ANIMEOS_SCORE_SAMPLES: "3"')
      && night.includes("child.unref()") && night.includes("mid.unref()"), "the env");
  expect("the night drives the same tick the UI drives (reset | drain | rescore)",
    night.includes('reset: "scripts/reset-sc12-renders.ts"') && night.includes('drain: "scripts/night111-run.ts"')
      && night.includes('rescore: "scripts/night111-rescore.ts"'), "the phases");

  finish();
}

function finish() {
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
