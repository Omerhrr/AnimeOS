// E2E ITERATION 137 - THE PALETTE DRIFT RECEIPT, ANSWERED BY THE
// RESTORE ITSELF (the sandbox-rebuild law honored end to end).
//
// The 136 night named the frontier: S004's palette 10 (the judge read
// the render purple/maroon against a dark-blue/gold sheet - the 128
// design anchor outranking the sheet's own read). Before the iteration
// could pen a law, the sandbox WIPED (the whole environment gone; the
// remote carried everything). The restore re-ran the standing laws on
// the fresh environment:
//   1. THE AUTO-SEED returned the production byte-faithful (the seed's
//      own rows: the scene, the six shots, the cast).
//   2. THE 122 RESTORE anchored four fresh model sheets (the image
//      channel draws anew), wired the COMMITTED r2 designs byte-exact
//      (Lin 517 chars, Wei 518 - the drain's own DNA source), and read
//      the sheet DNA for the whole cast.
//   3. THE 130 GATE measured every sheet against its design's dye
//      class (value AND hue) and regenerated while OUT: Lin landed
//      jade-teal (#294845 nearest, design #2f6d63), Wei landed the
//      design's value class (#282627 nearest, design #3a2230).
//   4. THE LEDGER (probe-137-dyeledger) reads the cast DNA exactly as
//      the engine assembles it: the sheet's read wins the merge, and
//      the 128 design anchor STANDS DOWN (no anchored rows) - Wei's
//      build wears #3d3d3d robe + #c4a35a gold accent, matching the
//      sheet art the judge anchors on. The pre-wipe contradiction
//      (sheet dark blue vs render purple) is structurally healed: the
//      sheet now lives IN the design's class, so anchor and read agree.
// THE GATE below: the source pins, the DB ledger, the ledger's unit
// truth through the REAL lib functions, and the REAL worker_run node
// truth - the built materials carry the sheet's own hexes.
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter137-restore.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
function expect(name: string, cond: unknown, detail?: unknown) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures++;
}

const ROOT = path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const BLENDER = process.env.ANIMEOS_BLENDER_BIN || "/home/z/blender-5.2.2-linux-x64/blender";

// ── 1. THE SOURCE LAWS STAND (the restore changed no bridge law) ──
const bridge = read("bridges/blender/animeos_bridge.py");
const tp = read("bridges/blender/toon_pass.py");
const animeCharacter = read("bridges/blender/anime_character.py");
expect("the anime law stands at 125 (no bridge law moved)",
  animeCharacter.includes("ANIME_LAW_VERSION = 125"), "v125");
expect("the toon law stands at 132 (the 136 boldness rung)",
  tp.includes("TOON_LAW_VERSION = 132"), "v132");
expect("the presence law stands at 108",
  bridge.includes("PRESENCE_LAW_VERSION = 108"), "v108");

// ── 2. THE DB LEDGER (the restored rows' own truth) ──
async function main() {
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
expect("the production restored (Immortal Path present)", Boolean(project));
if (!project) process.exit(1);
const scene = await db.scene.findFirst({
  where: { episode: { season: { projectId: project.id } } },
  orderBy: { number: "asc" },
});
expect("the scene restored (The Ruined Temple)", scene?.title === "The Ruined Temple", scene?.title);
const shots = await db.shot.findMany({ where: { sceneId: scene!.id }, orderBy: { number: "asc" } });
expect("the six shots restored with the standing framings",
  shots.length === 6
  && shots.map((s) => s.shotType).join(",") === "ESTABLISHING,MEDIUM,CLOSEUP,WIDE,LOW_ANGLE,WIDE",
  shots.map((s) => s.shotType).join(","));

const wei = await db.character.findFirst({ where: { projectId: project.id, name: "Demon Lord Wei" }, include: { states: true } });
const lin = await db.character.findFirst({ where: { projectId: project.id, name: "Lin Yue" }, include: { states: true } });
expect("Wei restored", Boolean(wei));
expect("Lin restored", Boolean(lin));

const weiDna = wei?.sheetDna ? JSON.parse(wei.sheetDna) : null;
const linDna = lin?.sheetDna ? JSON.parse(lin.sheetDna) : null;
expect("Wei's sheet DNA is fresh for his standing sheet (the staleness key holds)",
  Boolean(weiDna && wei?.modelSheetUrl && weiDna.sheetUrl === wei.modelSheetUrl), weiDna?.sheetUrl);
expect("Wei's sheet read wears the design's class: charcoal robe + GOLD accent + topknot",
  weiDna?.robeColor === "#3d3d3d" && weiDna?.robeAccent === "#c4a35a" && weiDna?.hairStyle === "topknot",
  { robe: weiDna?.robeColor, accent: weiDna?.robeAccent, hair: weiDna?.hairStyle });
expect("Lin's sheet read wears the jade-teal class: teal robe + topknot",
  linDna?.robeColor === "#2b5246" && linDna?.hairStyle === "topknot",
  { robe: linDna?.robeColor, hair: linDna?.hairStyle });
expect("Wei's COMMITTED design wired byte-exact (518 chars - the drain's own DNA source)",
  wei?.designSpec?.length === 518, wei?.designSpec?.length);
expect("Lin's COMMITTED design wired byte-exact (517 chars)",
  lin?.designSpec?.length === 517, lin?.designSpec?.length);
expect("Wei's designSheet points at the committed r2 turnaround",
  wei?.designSheetUrl === "/designs/cmuqieinq000cpxz7lp5ohq41/r2/turn_sheet.png", wei?.designSheetUrl);
expect("Lin's designSheet points at the committed r2 turnaround",
  lin?.designSheetUrl === "/designs/cmuq1s4i00007ppgsjqryw9r5/r2/turn_sheet.png", lin?.designSheetUrl);
for (const c of [wei, lin]) {
  const p = c?.modelSheetUrl ? path.join(process.cwd(), "public", c.modelSheetUrl.split("?")[0]) : null;
  expect(`${c?.name}'s canonical sheet exists on disk`, Boolean(p && fs.existsSync(p)), p);
}

// ── 3. THE LEDGER'S UNIT TRUTH (the engine's own compile) ──
const { detectCast } = await import("../src/lib/ai/art");
const { characterDesignDna } = await import("../src/lib/animation/design");
const { adherentDna, sheetDnaFresh } = await import("../src/lib/blender/adherence");
const { planSheetConformance, extractSheetPalette, designDyeClass } = await import("../src/lib/blender/sheet-palette");
const castRows = await db.character.findMany({ where: { projectId: project.id }, include: { states: true } });

function ledgerFor(c: NonNullable<typeof wei>) {
  const st = [...c.states].sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0];
  const regex = characterDesignDna({
    name: c.name, role: c.role, appearance: c.appearance, modelSheetPrompt: c.modelSheetPrompt,
    stateClothing: st?.clothing ?? null, stateWeapon: st?.weapon ?? null,
  });
  const fresh = sheetDnaFresh(c.sheetDna, c.modelSheetUrl);
  const merged = adherentDna(regex, fresh);
  return { regex, fresh, merged };
}

const weiLedger = ledgerFor(wei!);
expect("Wei's merge wears the sheet's robe (the sheet read outranks the regex compile)",
  weiLedger.merged.robeColor === "#3d3d3d" && weiLedger.merged.sheetFields.includes("robeColor"),
  { robe: weiLedger.merged.robeColor, fields: weiLedger.merged.sheetFields });
expect("Wei's merged robe sits IN the design's value class (the 128 anchor's own gate)",
  designDyeClass(weiLedger.merged.robeColor!, weiLedger.regex.robeColor!)?.out === false,
  designDyeClass(weiLedger.merged.robeColor!, weiLedger.regex.robeColor!));
const weiPalette = await extractSheetPalette(
  await fs.promises.readFile(path.join(process.cwd(), "public", wei!.modelSheetUrl!.split("?")[0])),
);
const weiRows = planSheetConformance(
  { robe: weiLedger.merged.robeColor, accent: weiLedger.merged.robeAccent, hair: weiLedger.merged.hairColor, boots: "#2a2a30" },
  weiPalette, weiLedger.merged.conformFactor, undefined,
  { robe: weiLedger.regex.robeColor, accent: weiLedger.regex.robeAccent, hair: weiLedger.regex.hairColor },
);
expect("Wei's conformance anchors NOTHING (the 128 design anchor stands down - the drift's structural heal)",
  weiRows.every((r) => !r.anchored), weiRows.map((r) => ({ role: r.role, anchored: r.anchored, skipped: r.skipped })));

const linLedger = ledgerFor(lin!);
expect("Lin's merge wears the sheet's robe (teal - the 130 gate's landing)",
  linLedger.merged.robeColor === "#2b5246", linLedger.merged.robeColor);
expect("Lin's merged robe sits IN the design's class",
  designDyeClass(linLedger.merged.robeColor!, linLedger.regex.robeColor!)?.out === false,
  designDyeClass(linLedger.merged.robeColor!, linLedger.regex.robeColor!));

// ── 4. THE REAL worker_run NODE TRUTH (the built materials' dyes) ──
function castEntry(c: NonNullable<typeof wei>, ledger: ReturnType<typeof ledgerFor>, palette: string[]) {
  const rows = planSheetConformance(
    { robe: ledger.merged.robeColor, accent: ledger.merged.robeAccent, hair: ledger.merged.hairColor, boots: "#2a2a30" },
    palette, ledger.merged.conformFactor, undefined,
    { robe: ledger.regex.robeColor, accent: ledger.regex.robeAccent, hair: ledger.regex.hairColor },
  );
  return {
    ...ledger.merged,
    designSpec: JSON.parse(c.designSpec!),
    sheetConformance: {
      characterName: c.name, palette, rows,
      note: "the canonical sheet is color law over a sheet-adherent DNA - the repair pull closes the remaining drift",
    },
  };
}

const weiPaletteFull = weiPalette;
const linSheetPath = path.join(process.cwd(), "public", lin!.modelSheetUrl!.split("?")[0]);
const linPalette = await extractSheetPalette(await fs.promises.readFile(linSheetPath));

const RUNNER = `import importlib.util, json, os, sys
_tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-2:]
bridge, job = _tail[0], _tail[1]
spec = importlib.util.spec_from_file_location("bridge", bridge)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.worker_run(job)
st = json.load(open(job))
import bpy
mats = {}
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    hexv = mat.get("animeosBaseHex") or mat.get("animeos_dye")
    if isinstance(hexv, str) and hexv.startswith("#"):
        mats[mat.name] = hexv
json.dump({"mats": mats, "law": ((st.get("render") or {}).get("look") or {}).get("lawVersion"),
           "identity": st.get("identity"), "stage": st.get("stage")},
          open(os.path.join(os.path.dirname(job), "dye-truth.json"), "w"), indent=1)
`;

function runCut(tag: string, shotType: string, lens: string, desc: string, cast: unknown[]) {
  const out_dir = fs.mkdtempSync(path.join(os.tmpdir(), `e137-${tag}-`));
  const job = path.join(out_dir, "job.json");
  const payload = {
    shot: { number: tag === "s004" ? 4 : 1, description: desc, shotType, lens,
            movement: tag === "s004" ? "STATIC" : "CRANE", lighting: "Moonlight + storm clouds",
            duration: 0.8, cast },
    scene: { number: 12, title: "The Ruined Temple", fogDensity: 0.45, lightningIntensity: 0.3,
             energyIntensity: 0.6, cameraDistance: 1.0, rimLightIntensity: 0.5 },
    project: { title: "Immortal Path", visualStyle: "DONGHUA", resolution: "320x180", fps: 2 },
    mode: "PREVIEW",
  };
  fs.writeFileSync(job, JSON.stringify({ jobId: `e137-${tag}`, payload, outDir: out_dir }));
  const script = path.join(out_dir, "runner.py");
  fs.writeFileSync(script, RUNNER);
  const r = spawnSync(BLENDER, ["-b", "--factory-startup", "-P", script, "--",
    path.join(ROOT, "bridges", "blender", "animeos_bridge.py"), job], { timeout: 900000 });
  const truth = JSON.parse(fs.readFileSync(path.join(out_dir, "dye-truth.json"), "utf8"));
  return truth;
}

const weiDesc = shots[3]?.description ?? "The Demon Lord Wei descends";
const weiCast = castEntry(wei!, weiLedger, weiPaletteFull);
const weiCut = runCut("s004", "WIDE", "28mm", weiDesc, [weiCast]);
if (!weiCut) process.exit(1);
expect("Wei's cut rides the 132 law", weiCut.law === 132, weiCut.law);
expect("Wei's built ROBE wears the sheet's charcoal (#3d3d3d - the node truth)",
  (weiCut.mats["RobeMat"] || "").toLowerCase() === "#3d3d3d", weiCut.mats["RobeMat"]);
expect("Wei's built ACCENT wears the sheet's GOLD (#c4a35a - the gold trim is the sheet's own law)",
  (weiCut.mats["AccentMat"] || "").toLowerCase() === "#c4a35a", weiCut.mats["AccentMat"]);
expect("Wei's built HAIR wears the sheet's black (#1a1a1a)",
  (weiCut.mats["HairMat"] || "").toLowerCase() === "#1a1a1a", weiCut.mats["HairMat"]);
expect("Wei's conformance evidence rides the stage (the sheet's law named)",
  typeof weiCut.identity?.sheet === "string" && weiCut.identity.sheet === "Demon Lord Wei", weiCut.identity);

const linDesc = shots[0]?.description ?? "Establishing shot";
const linCast = castEntry(lin!, linLedger, linPalette);
const linCut = runCut("s001", "ESTABLISHING", "24mm", linDesc, [linCast]);
if (!linCut) process.exit(1);
expect("Lin's cut rides the 132 law", linCut.law === 132, linCut.law);
expect("Lin's built ROBE wears the sheet's teal (#2b5246 - the 130 gate's landing)",
  (linCut.mats["RobeMat"] || "").toLowerCase() === "#2b5246", linCut.mats["RobeMat"]);
expect("Lin's built ACCENT wears the sheet's read (#4d7a7a)",
  (linCut.mats["AccentMat"] || "").toLowerCase() === "#4d7a7a", linCut.mats["AccentMat"]);

await db.$disconnect();
console.log(failures === 0 ? "\nALL GREEN - e2e-iter137-restore" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("e2e-iter137 failed:", e); process.exit(1); });
