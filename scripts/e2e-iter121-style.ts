// E2E iteration 121 - THE STYLE LAW (the distribution's ceiling): the
// toon ramps + the line weight answer the framing, the face paint
// answers the establishing scale, and the anchor sheet answers in the
// shot's framing (the like-for-like reference + the framing contract).
// The pixel laws live in bridges/blender/toon_pass.py (the framing
// tables + the solved hull offset + the decal staging), the worker
// carries them through the framing context, and the identity gate
// stops scoring the FRAMING instead of the character.
import { framingViewFor, buildIdentityPrompt } from "../src/lib/identity";
import fs from "node:fs";
import path from "node:path";
import glob from "node:fs/promises";

let failures = 0;
function expect(name: string, cond: boolean, detail: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!cond) failures++;
}

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

async function main() {
  // ── 1. THE SHEET ANSWERS IN THE SHOT'S FRAMING (pure) ──
  expect("the closeup framings answer in the sheet's close view",
    framingViewFor("CLOSEUP") === "close" && framingViewFor("EXTREME_CLOSEUP") === "close", "close");
  expect("the medium framings answer in the sheet's three-quarter view",
    framingViewFor("MEDIUM") === "three", "three");
  expect("the wide framings answer in the sheet's front view",
    framingViewFor("WIDE") === "front" && framingViewFor("ESTABLISHING") === "front"
    && framingViewFor("LOW_ANGLE") === "front" && framingViewFor("WS") === "front", "front");
  expect("an unknown framing falls to the full-body front view; a missing one reads MEDIUM (the schema default)",
    framingViewFor("SOMETHING_ELSE") === "front" && framingViewFor(undefined) === "three", "front");

  // ── 2. THE PROMPT CARRIES THE FRAMING CONTRACT (pure) ──
  const sheets = [
    { name: "Lin Yue", data: "d1", framingRef: { view: "close", data: "d2" } },
    { name: "Demon Lord Wei", data: "d3" },
  ];
  const prompt = buildIdentityPrompt(sheets, 3, "close");
  expect("the manifest numbers the sheet and its framing reference in order",
    prompt.includes("Image 2: canonical model sheet for Lin Yue")
    && prompt.includes("Image 3: Lin Yue's close view from the same sheet (the like-for-like framing for this shot)")
    && prompt.includes("Image 4: canonical model sheet for Demon Lord Wei"), prompt.split("\n")[1]);
  expect("the framing contract names the shot's framing scale", prompt.includes("framed as a close-scale view"), prompt);
  expect("the framing contract omits - never penalizes - what the framing hides",
    prompt.includes("omit an aspect the framing cannot show rather than scoring it low"), prompt);
  const bare = buildIdentityPrompt([{ name: "Lin Yue", data: "d1" }], undefined, "front");
  expect("a sheet without a view on disk still prompts (honest fallback)",
    bare.includes("Image 2: canonical model sheet for Lin Yue") && !bare.includes("like-for-like"), bare.split("\n")[1]);
  const panel = buildIdentityPrompt([{ name: "Lin Yue", data: "d1" }]);
  expect("the PANEL path stays the story-panel prompt", panel.startsWith("You are a casting director")
    && panel.includes("Image 1 is a story panel."), panel.split("\n")[0]);

  // ── 3. THE STYLE LAW LIVES IN THE TOON PASS (source truth) ──
  const tp = read("bridges/blender/toon_pass.py");
  expect("the toon pass declares the style law version (advanced legitimately to 130)", tp.includes("TOON_LAW_VERSION = 130"), "v128");
  expect("the toon ramp table answers every framing",
    tp.includes("STYLE_RAMP_BY_SHOT") && tp.includes('"ESTABLISHING":    (0.46, 0.80, 0.020)')
    && tp.includes('"WIDE":            (0.50, 0.85, 0.025)')
    && tp.includes('"CLOSEUP":         (0.62, 1.00, 0.040)'), "the ramp table");
  expect("the cel tree takes the ramp", tp.includes("def _cel_tree(mat, rgb, kind, hex_to_rgb=None, ramp=None, painterly=0.0, trim=False)"), "_cel_tree");
  expect("the ramp scales the shadow floor", tp.includes("(SKIN_FLOOR if kind == \"skin\" else SHADOW_FLOOR) * r_floor_k"), "floor");
  expect("the line weight solves from the framing",
    tp.includes("def ink_offset_for(framing_ctx, mode)") && tp.includes("HULL_INK_PX")
    && tp.includes("INK_OFFSET_BOUNDS") && tp.includes("px_per_world = res_x * lens / (dist * SENSOR_MM)"), "the solve");
  expect("the hull loop expands by the solved offset",
    tp.includes("v.co += v.normal * ink_offset"), "the hull loop");
  expect("apply_look carries the framing context", tp.includes("def apply_look(bpy, scn, look, mode, hex_to_rgb, comp_profile=None, framing_ctx=None)"), "apply_look");
  expect("the evidence names the ramp and the solved offset",
    tp.includes('"styleRamp"') && tp.includes('"inkOffset"') && tp.includes('"inkTargetPx"'), "evidence");

  // ── 4. THE FACE PAINT ANSWERS THE ESTABLISHING SCALE (source truth) ──
  expect("the face paint staging table exists for the wide family",
    tp.includes("FACE_PAINT_BY_SHOT") && tp.includes('"ESTABLISHING": {"eye": 1.45')
    && tp.includes('"WIDE":         {"eye": 1.30'), "the face paint table");
  expect("the staging vertex-scales the decal meshes (the rig owns the object scale)",
    tp.includes("def stage_face_paint_for_framing(bpy, shot_type)") && tp.includes("v.co = (v.co[0] * k, v.co[1] * k, v.co[2] * k)")
    && tp.includes("FACE_PAINT_MESHES"), "the staging");
  expect("the tight framings refuse the face paint staging",
    tp.includes("tight framing - the 113 face paint stands"), "the refusal");
  expect("the eye decals keep their mesh names", tp.includes('"eye": ("EyeLMesh", "EyeRMesh")'), "the names");

  // ── 5. THE WORKER CARRIES THE LAWS (source truth) ──
  const bridge = read("bridges/blender/animeos_bridge.py");
  expect("the worker stages the face paint before the look",
    bridge.includes("toon_pass.stage_face_paint_for_framing(bpy, shot.get(\"shotType\"))")
    && bridge.indexOf("stage_face_paint_for_framing") < bridge.indexOf("toon_pass.apply_look"), "the order");
  expect("the worker builds the framing context (distance, lens, real output width)",
    bridge.includes("framing_ctx = {\"shotType\": shot.get(\"shotType\"), \"dist\": _f_mult * toon_pass.FIGURE_H")
    && bridge.includes('"lens": _f_lens, "resX": out_w}'), "the ctx");
  expect("the face paint evidence rides the render state", bridge.includes('state["render"]["facePaint"]'), "evidence");
  expect("the turnaround keeps the classic offset (no framing ctx)",
    read("bridges/blender/anime_turnaround.py").includes("tp.apply_look(bpy, scn, a.look.upper(), \"FINAL\", br.hex_to_rgb, None)"), "the sheet cam");

  // ── 6. THE FRAMING REFERENCES EXIST ON DISK (the real turnarounds) ──
  // every generated turnaround must carry the three views the law
  // attaches (front / three / close) next to the stitched sheet
  let sheetCount = 0, viewCount = 0;
  const publicDir = path.join(ROOT, "public", "designs");
  if (fs.existsSync(publicDir)) {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : p;
      });
    for (const f of walk(publicDir)) {
      if (f.endsWith("turn_sheet.png")) {
        sheetCount += 1;
        for (const v of ("front three close").split(" ")) {
          if (fs.existsSync(f.replace("turn_sheet.png", `turn_${v}.png`))) viewCount += 1;
        }
      }
    }
  }
  expect("generated turnarounds exist on disk", sheetCount >= 1, sheetCount);
  expect("every generated sheet carries its three framing views", sheetCount >= 1 && viewCount === sheetCount * 3,
    { sheetCount, viewCount });
  void glob;

  // ── 7. THE IDENTITY GATE READS THE SAME LAW (source truth) ──
  const identity = read("src/lib/identity.ts");
  expect("the identity context attaches the framing-matched view",
    identity.includes("framingViewUrl") && identity.includes("framingRef"), "the ctx");
  expect("only the generated turnarounds carry views (an uploaded sheet rides alone)",
    identity.includes("turn_sheet\\.png$"), "the guard");
  expect("the raw call rides the framing reference images",
    identity.includes("s.framingRef ? [{ type: \"image_url\" as const, image_url: { url: s.framingRef.data } }] : []"), "the attach");

  // ── 8. THE DESIGNED TURNAROUND ANSWERS FIRST (iteration 122) ──
  // the render pipeline constructs the character through the design
  // crew's landed build, so the like-for-like reference is THAT
  // turnaround's own view - the standing production's anchored
  // image-gen sheets never carry views on their own URL, which left
  // the framing reference dead in the exact place the night runs.
  expect("the framing reference resolves design-first (designSheetUrl before modelSheetUrl)",
    identity.includes("for (const url of [c.designSheetUrl, c.modelSheetUrl])"), "the order");
  expect("the view resolver takes the cast member (not a bare url)",
    identity.includes("framingViewUrl(c, framingView)"), "the call");
  expect("the cast member type carries the designed turnaround",
    read("src/lib/ai/art.ts").includes("designSheetUrl?: string | null"), "the field");
  const linViews = ROOT + "/public/designs/cmuq1s4i00007ppgsjqryw9r5/r2";
  const weiViews = ROOT + "/public/designs/cmuqieinq000cpxz7lp5ohq41/r2";
  const viewsOk = (dir: string) => ["close", "three", "front"].every((v) => fs.existsSync(`${dir}/turn_${v}.png`));
  expect("the COMMITTED Lin Yue turnaround carries the three framing views on disk", viewsOk(linViews), linViews);
  expect("the COMMITTED Wei turnaround carries the three framing views on disk", viewsOk(weiViews), weiViews);
}

main().then(() => {
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
});
