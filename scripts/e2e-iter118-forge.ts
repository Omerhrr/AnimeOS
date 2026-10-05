// E2E iteration 118 - THE FORGE OPENS. The Blender built-in addons
// are open to DSH and the whole expert crew: the roster truth lives
// in src/lib/crew/experts.ts (BLENDER_FORGE + each bench's addons),
// the runtime truth lives in bridges/blender/animeos_addons.py
// (FORGE_CATALOG + ensure_builtins on every worker session), the
// canonical pose vocabulary persists as a real Pose Asset library,
// and the anatomy law sculpts the mannequin toward a real body.
// The two catalogs must never disagree on names.
import { EXPERT_BENCHES, BLENDER_FORGE, forgeContextLine, expertCrewContextLine, expertBench } from "../src/lib/crew/experts";

let failures = 0;
function expect(name: string, cond: boolean, detail: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : ` - ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!cond) failures++;
}

async function main() {
  // ── 1. THE ROSTER TRUTH: the forge catalog ──
  expect("the forge catalog carries 13 built-ins", BLENDER_FORGE.length === 13, BLENDER_FORGE.length);
  const modules = new Set(BLENDER_FORGE.map((a) => a.module));
  expect("every module is unique", modules.size === 13, [...modules]);
  const knownBenches = new Set(EXPERT_BENCHES.map((b) => b.id));
  expect("every forge entry names a real bench", BLENDER_FORGE.every((a) => knownBenches.has(a.bench)),
    BLENDER_FORGE.filter((a) => !knownBenches.has(a.bench)).map((a) => a.module));
  expect("every forge entry says what it is FOR here", BLENDER_FORGE.every((a) => a.use.length > 20));
  expect("rigify is honestly kind=core", BLENDER_FORGE.find((a) => a.module === "rigify")?.kind === "core");
  expect("no addon is double-claimed across benches",
    (() => {
      const seen = new Set<string>();
      for (const a of BLENDER_FORGE) {
        if (seen.has(a.module)) return false;
        seen.add(a.module);
      }
      return true;
    })());

  // ── 2. THE BENCHES OWN THEIR TOOLS ──
  // The 13 built-ins cover six benches; the others (colorist, groomer,
  // lighter) ride CORE Blender (hair curves, cloth/flesh solvers, light
  // rigs) - their tools are laws already, not addons. The honest
  // roster never inflates: a bench names tools only where a tool
  // exists.
  const withTools = EXPERT_BENCHES.filter((b) => (b.addons?.length ?? 0) > 0);
  expect("the benches with named tools exist", withTools.length >= 6, withTools.map((b) => b.id));
  for (const b of withTools) {
    expect(`${b.title}'s tools exist in the catalog`,
      (b.addons ?? []).every((m) => modules.has(m)), b.addons);
  }
  for (const a of BLENDER_FORGE) {
    const bench = EXPERT_BENCHES.find((b) => b.id === a.bench);
    expect(`${a.module} is owned by ${a.bench} on the roster`,
      !!bench && (bench.addons ?? []).includes(a.module));
  }

  // ── 3. NAME PARITY with the Python runtime catalog ──
  const fs = await import("fs");
  const path = await import("path");
  const py = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "animeos_addons.py"), "utf-8");
  const pyModules = new Set<string>();
  for (const m of py.matchAll(/"([a-z_0-9]+)":\s*\{\s*\n?\s*"title":/g)) pyModules.add(m[1]);
  expect("the Python FORGE_CATALOG carries the same 13 modules", pyModules.size === 13 && [...pyModules].every((m) => modules.has(m)),
    { py: [...pyModules].sort(), ts: [...modules].sort() });
  const pyBenches = new Set<string>();
  for (const m of py.matchAll(/"bench":\s*"([a-z-]+)"/g)) pyBenches.add(m[1]);
  expect("the Python catalog names the same benches", [...pyBenches].every((b) => knownBenches.has(b)), [...pyBenches]);

  // ── 4. THE CONTEXT LINES DSH READS ──
  const forge = forgeContextLine();
  expect("the forge context line opens with the count", forge.startsWith("blender forge (13 built-ins open"), forge.slice(0, 60));
  expect("the forge context line names every bench with tools",
    withTools.every((b) => forge.includes(b.id)), forge.slice(0, 200));
  const crew = expertCrewContextLine();
  expect("the crew context line still stands", (crew ?? "").startsWith("expert crew:") && (crew ?? "").includes("THE CHARACTER DESIGNER"));

  // ── 5. THE POSE LIBRARY FILE IS REAL AND COMMITTED ──
  const libPath = path.join(process.cwd(), "public", "pose-library", "animeos_poses_v1.blend");
  expect("the pose asset library exists on disk", fs.existsSync(libPath), libPath);
  if (fs.existsSync(libPath)) {
    const buf = fs.readFileSync(libPath);
    // compressed saves carry a zstd container - the honest check is
    // size (an asset library of 13 poses on 13 bones is tens of KB)
    expect("the library is a real, non-empty .blend", buf.length > 4096, buf.length);
  }
  const plPy = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "animeos_pose_library.py"), "utf-8");
  expect("the pose library builds from the bridge's own pose vocabulary", plPy.includes("ab.POSE_JOINTS") && plPy.includes("ab.solve_leg_ik"));
  expect("the pose library uses the production bone table convention", plPy.includes('_bone_names(spec)'));

  // ── 6. THE ANATOMY LAW IS WIRED INTO THE CHARACTER BUILD ──
  const ac = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "anime_character.py"), "utf-8");
  expect("build_body calls the anatomy pass", ac.includes("import body_anatomy") && ac.includes("apply_anatomy"));
  expect("the anatomy evidence rides the anime dict", ac.includes('"anatomy": anatomy'));
  expect("the character law version advanced past 119 (the craft rides the same figure)", ac.includes("ANIME_LAW_VERSION = 125"));
  const ba = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "body_anatomy.py"), "utf-8");
  // 18 static field sites (the 119 silhouette law adds the two
  // obliques); the R/L loops carry them to 24 structures at runtime -
  // the anatomy smoke proves all 24 land in real Blender.
  expect("the anatomy field carries 18 static sites (24 structures at runtime)",
    (ba.match(/st\((f?")/g) ?? []).length === 18, (ba.match(/st\((f?")/g) ?? []).length);
  expect("the sculptor scales the tool with the body", ba.includes("THE SCULPTOR SCALES THE TOOL WITH THE BODY"));
  const bridge = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py"), "utf-8");
  expect("the worker opens the forge before the scene build",
    bridge.includes("import animeos_addons") && bridge.includes("ensure_builtins"));
  expect("the pool worker opens the forge at boot",
    /pool_worker_main[\s\S]{0,800}ensure_builtins/.test(bridge));

  // ── 7. THE RANK LAW HOLDS: expertBench still resolves ──
  expect("expertBench resolves the choreographer", expertBench("choreographer")?.id === "choreographer");
  expect("the roster stays honest (9 benches, 8 standing)",
    EXPERT_BENCHES.length === 9 && EXPERT_BENCHES.filter((b) => b.status === "STANDING").length === 8);

  console.log(`\n${failures === 0 ? "E2E ALL GREEN" : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("e2e failed:", e);
  process.exit(1);
});
