// Iteration 52 E2E: the designed assets learn to MOVE (rigged performance).
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the motion schema (motionPreset / loopPath / motionBakedAt),
//      the design_motion tool (62nd), the v6 builder's --motion pass with
//      the ASSET_LOOP marker, motion_rig.py (real armatures, seamless
//      bakes, loop renders), the worker riding fix (rig roots anchor,
//      propsAnimated), the MOTION IS DESIGN doctrine + rule 29, the
//      context line's performing/MOTIONLESS readout, the UI loop player
//      and the API motion passthrough
//   B. tool-level through the REAL executeTool path: named motion presets
//      land as the production's performance law, honest refusals (bad
//      kind, bad motion name), a REAL motion build (armature baked into
//      the .blend, animated mp4 loop on disk), a blender_exec probe
//      INSIDE the saved .blend proving armature + Action + loop modifiers
//   C. the self-correcting loop covers motion: a motionless creature
//      audit raises a MAJOR MOTION issue, design_fix bakes the archetype
//      default performance (real rig + loop), and the re-audit clears it
//   D. the design context line reports the performing standing
//   E. the HTTP surface obeys the role matrix (anon 401, non-member 403,
//      OWNER unblocked) and the library API carries the motion fields
// Run: bun scripts/e2e-iter52-motion.ts
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH
// (the mp4 encode path). Creates its own throwaway production and
// stranger account and cleans every row it made.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { assetsForRender } from "../src/lib/blender/assets";
import { buildCompactContext } from "../src/lib/dsh/tools";
import { readFileSync } from "node:fs";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter52-motion";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

class Jar {
  private m = new Map<string, string>();
  absorb(res: Response) {
    const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0) this.m.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  get header(): string {
    return Array.from(this.m.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function call(jar: Jar | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter52" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter52" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter52", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter52" },
    body: JSON.stringify({ email, name, password }),
  });
  if (res.status === 409) {
    const row = await db.user.findUnique({ where: { email } });
    if (!row) throw new Error(`register says 409 but ${email} is not in the db`);
    return { id: row.id, role: row.role };
  }
  if (!res.ok) throw new Error(`register failed for ${email}: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { user: { id: string; role: string } };
  return data.user;
}

function isMp4(path: string): boolean {
  try {
    const fd = fs.openSync(path, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    return buf.subarray(4, 8).toString("ascii") === "ftyp" && fs.statSync(path).size > 1000;
  } catch {
    return false;
  }
}

async function main() {
  console.log("== Iteration 52: the designed assets learn to MOVE ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A1 assets carry the performance fields (motionPreset, loopPath, motionBakedAt)", schema.includes("motionPreset  String?") && schema.includes("loopPath      String?") && schema.includes("motionBakedAt DateTime?"));
  check("A2 the preset registry now names MOTION as a kind", schema.includes("MATERIAL | LIGHTING | MOTION"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A3 the registry stands at 66 tools (design_motion is the 62nd)", toolCount === 66, `count=${toolCount}`);
  check("A4 design_motion registers named performance law", tools.includes('name: "design_motion"') && tools.includes("hover | spin | pulse | hover-spin") && tools.includes("slither | flap | walk | prowl | breathe | idle"));
  check("A5 the build tool takes a motion preset name", tools.includes("motion: \"string (optional - a design_motion preset name"));
  check("A6 the context line reads the performing standing", tools.includes("performing") && tools.includes("MOTIONLESS (props/creatures need design_motion + a rebuild)"));

  const motion = readFileSync("src/lib/blender/motion.ts", "utf8");
  check("A7 the motion spec compiler validates kind + motion + clamps", motion.includes("MOTIONS_BY_KIND") && motion.includes("DEFAULT_MOTION_BY_ARCHETYPE") && motion.includes("compileMotionSpec"));

  const builder = readFileSync("bridges/blender/asset_builder.py", "utf8");
  check("A8 the v7 builder bakes a --motion pass and reports the loop", builder.includes("ASSET BUILDER (v7.0)") && builder.includes("--motion") && builder.includes("ASSET_LOOP") && builder.includes("MOTION_SUMMARY"));
  check("A9 the motion-only pass (design_fix path) re-rigs and saves a NEW file", builder.includes("motion-only pass") && builder.includes("save_as_mainfile"));

  const rig = readFileSync("bridges/blender/motion_rig.py", "utf8");
  check("A10 motion_rig builds REAL armatures with named bones per archetype", rig.includes("def build_perf_armature") && rig.includes("LegUpB") && rig.includes("WingB1") && rig.includes('"Coil#": "Chain#"') && rig.includes("PerfRoot"));
  check("A11 bakes are seamless loops (keys to N+1, CYCLES modifiers)", rig.includes("n_frames + 2") && rig.includes('modifiers.new(type="CYCLES")'));
  check("A12 rigid binds preserve world position empirically", rig.includes("def bind_parts") && rig.includes("matrix_basis = ob.matrix_basis @ (landed.inverted() @ world)"));
  check("A13 the loop renders through the proven encode chain", rig.includes("def render_loop") && rig.includes("libx264") && rig.includes("FFMPEG"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A14 riding renders anchor RIG ROOTS (bindings survive) and report propsAnimated", bridge.includes("only ROOT objects get anchored") && bridge.includes("propsAnimated"));
  check("A15 the v5.0 quadruped Underbelly material bug is fixed", bridge.includes('part(belly_mesh, "Underbelly", belly)') && !bridge.includes('part(belly, "Underbelly", belly)'));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A16 MOTION IS DESIGN is doctrine and rule 29 teaches performance", prompts.includes("- MOTION IS DESIGN") && prompts.includes("29. DESIGNED ASSETS PERFORM"));
  check("A17 motion is judged by watching the loop, never by imagining", prompts.includes("motion is judged by watching, never by imagining"));

  const review = readFileSync("src/lib/blender/design-review.ts", "utf8");
  check("A18 the audit weighs MOTION (0.12, beside VARIATION 0.09) and flags motionless props/creatures", review.includes("motion: 0.12") && review.includes("designed but motionless"));
  check("A19 the fix pass bakes a REAL performance for MOTION issues", review.includes("THE MOTION FIX") && review.includes("DEFAULT_MOTION_BY_ARCHETYPE"));

  const renderView = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A20 the asset card plays the baked loop", renderView.includes("<video") && renderView.includes("a.loopPath"));

  const assetsRoute = readFileSync("src/app/api/blender-assets/route.ts", "utf8");
  check("A21 the library API passes the motion preset through", assetsRoute.includes("motionName: String(body.motion"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter52 Motion Lab ${MARK}`, logline: "a throwaway production for the rigged-performance proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway motion lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the motion registry ─────────────────────
  const hover = await T("design_motion", { name: "E2E Seal Drift", kind: "PROP", motion: "hover-spin", speed: 1, amplitude: 1.2, cycleFrames: 24 });
  check("C1 a prop motion preset lands as production law", hover.status === "OK" && hover.result.includes("registered"), hover.result.slice(0, 120));
  const hoverRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "MOTION", name: "E2E Seal Drift" } } });
  const hoverSpec = hoverRow ? (JSON.parse(hoverRow.spec) as { motion: string; cycleFrames: number }) : null;
  check("C2 the motion row carries the compiled spec", hoverSpec?.motion === "hover-spin" && hoverSpec?.cycleFrames === 24);
  const dance = await T("design_motion", { name: "E2E River Dance", kind: "CREATURE", motion: "slither", speed: 1, amplitude: 1 });
  check("C3 a creature motion preset lands", dance.status === "OK");
  const badKind = await T("design_motion", { name: "E2E Character Bob", kind: "CHARACTER", motion: "hover" });
  check("C4 a CHARACTER motion refuses honestly (poses own performance)", badKind.status === "ERROR" && badKind.result.includes("PROP or CREATURE"), badKind.result.slice(0, 120));
  const badMotion = await T("design_motion", { name: "E2E Nonsense", kind: "PROP", motion: "moonwalk" });
  check("C5 an unknown motion name refuses with the allowed list", badMotion.status === "ERROR" && badMotion.result.includes("allowed"), badMotion.result.slice(0, 140));

  // ───────────────────── D. the REAL motion build ─────────────────────
  const seal = await T("create_asset", { category: "PROP", name: "E2E Azure Seal", description: "a great azure spirit seal, an ornate artifact engraved with glowing runes, polished gold accents" });
  check("D1 the prop registers", seal.status === "OK", seal.result.slice(0, 80));
  const wyrm = await T("create_asset", { category: "CREATURE", name: "E2E Crimson Wyrm", description: "a massive crimson spirit serpent, a divine horned wyrm with a glowing scarlet mane" });
  check("D2 the creature registers", wyrm.status === "OK", wyrm.result.slice(0, 80));

  console.log("   (real Blender motion builds follow - the runtime rigs and renders)");
  const buildStatic = await T("blender_asset_build", { kind: "CREATURE", refName: "E2E Crimson Wyrm" });
  check("D3 the wyrm builds STATIC first (v1, motionless)", buildStatic.status === "OK", buildStatic.result.slice(0, 120));
  const wyrmRow = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "CREATURE", refName: "E2E Crimson Wyrm" } } });
  check("D4 the static wyrm carries no motion fields", wyrmRow?.status === "READY" && wyrmRow?.motionPreset === null && wyrmRow?.loopPath === null);

  const buildMoving = await T("blender_asset_build", { kind: "PROP", refName: "E2E Azure Seal", motion: "E2E Seal Drift", material: "E2E Missing Steel" });
  check("D5 the seal builds UNDER THE MOTION PRESET (honest unknown-recipe degradation)", buildMoving.status === "OK", buildMoving.result.slice(0, 140));
  const sealRow = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Azure Seal" } } });
  check("D6 the seal row records the preset + the loop", sealRow?.motionPreset === "E2E Seal Drift" && Boolean(sealRow?.loopPath) && Boolean(sealRow?.motionBakedAt), JSON.stringify({ preset: sealRow?.motionPreset, loop: sealRow?.loopPath }));
  check("D7 the animated loop is a REAL mp4 on disk", Boolean(sealRow?.loopPath) && isMp4(`${process.cwd()}/public${sealRow?.loopPath ?? "/x.mp4"}`), sealRow?.loopPath ?? "no loop");
  const sealMeta = sealRow?.meta ? JSON.parse(sealRow.meta) as { motion?: { name?: string; archetype?: string; frames?: number; bound?: number }; builderVersion?: string } : null;
  check("D8 the build meta carries the motion summary (archetype, frames, bound parts)", sealMeta?.motion?.archetype === "prop" && (sealMeta?.motion?.frames ?? 0) >= 16 && (sealMeta?.motion?.bound ?? 0) >= 4 && sealMeta?.builderVersion === "v7.0", JSON.stringify(sealMeta?.motion));
  const sealUsage = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "MOTION", name: "E2E Seal Drift" } } });
  check("D9 consuming a motion preset bumps its usage count", (sealUsage?.usageCount ?? 0) >= 1, `usage=${sealUsage?.usageCount}`);
  const stageHand = await T("create_character", { name: "E2E Stage Hand", role: "SUPPORTING" });
  check("D10a the character registers (the motion refusal needs a resolvable design)", stageHand.status === "OK", stageHand.result.slice(0, 100));
  const charBuild = await T("blender_asset_build", { kind: "CHARACTER", refName: "E2E Stage Hand", motion: "E2E Seal Drift" });
  check("D10 a character build with motion refuses before any Blender work", charBuild.status === "ERROR" && charBuild.result.includes("motion presets apply to PROP and CREATURE"), charBuild.result.slice(0, 140));

  // probe INSIDE the saved .blend: a real rig, a real Action, loop modifiers
  const blendPath = sealRow?.blendPath ?? "";
  const probe = await T("blender_exec", {
    purpose: "E2E probe: prove the seal .blend carries a real armature + looping Action",
    script: `import bpy
bpy.ops.wm.open_mainfile(filepath=r"${blendPath}")
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
act = bpy.data.actions.get("PerfCycle")
bone_fc = 0
mods = 0
if act:
    for fc in act.fcurves:
        if fc.data_path.startswith("pose.bones"):
            bone_fc += 1
            mods += len(fc.modifiers)
bound = sum(1 for o in bpy.data.objects if o.type == "MESH" and o.parent_bone)
print("PROBE_ARMS %d" % len(arms))
print("PROBE_BONES %d" % (len(arms[0].pose.bones) if arms else 0))
print("PROBE_ACT %s" % (act.name if act else "none"))
print("PROBE_FC %d" % bone_fc)
print("PROBE_MODS %d" % mods)
print("PROBE_BOUND %d" % bound)
`,
  });
  check("E1 the .blend contains a REAL armature", probe.status === "OK" && probe.result.includes("PROBE_ARMS 1"), probe.result.slice(0, 200));
  check("E2 the armature carries the PerfCycle Action with bone fcurves + CYCLES modifiers", probe.status === "OK" && /PROBE_FC ([1-9]\d*)/.test(probe.result) && /PROBE_MODS ([1-9]\d*)/.test(probe.result), probe.result.slice(0, 200));
  check("E3 named parts are rigidly bound to bones", probe.status === "OK" && /PROBE_BOUND ([4-9]|\d\d)/.test(probe.result), probe.result.slice(0, 200));

  // ───────────────────── F. the loop covers motion ─────────────────────
  const auditStatic = await T("design_audit", { refName: "E2E Crimson Wyrm", kind: "CREATURE" });
  check("F1 the static wyrm audit NEEDS_WORK with a MAJOR MOTION issue", auditStatic.status === "OK" && auditStatic.result.includes("NEEDS_WORK") && auditStatic.result.includes("MOTION"), auditStatic.result.slice(0, 220));
  const motionIssue = await db.designIssue.findFirst({ where: { projectId: labId, refName: "E2E Crimson Wyrm", kind: "MOTION", status: "OPEN" } });
  check("F2 the MOTION issue persists with the honest note", Boolean(motionIssue) && Boolean(motionIssue?.note.includes("motionless")), motionIssue?.note.slice(0, 100));
  const auditMoving = await T("design_audit", { refName: "E2E Azure Seal", kind: "PROP" });
  check("F3 the performing seal's audit reads 'performing' and raises no MOTION issue", auditMoving.status === "OK" && auditMoving.result.includes("performing") && !auditMoving.result.includes("MOTION"), auditMoving.result.slice(0, 220));

  console.log("   (the fix pass bakes the archetype default performance for the wyrm)");
  const wyrmBefore = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "CREATURE", refName: "E2E Crimson Wyrm" } } });
  const fix = await T("design_fix", { refName: "E2E Crimson Wyrm", kind: "CREATURE" });
  const wyrmAfter = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "CREATURE", refName: "E2E Crimson Wyrm" } } });
  check("F4 design_fix bakes the slither default and bumps the version", fix.status === "OK" && (wyrmAfter?.version ?? 0) === (wyrmBefore?.version ?? 0) + 1, fix.result.slice(0, 200));
  check("F5 the wyrm now records a performance + a real mp4 loop", Boolean(wyrmAfter?.motionPreset) && Boolean(wyrmAfter?.loopPath) && isMp4(`${process.cwd()}/public${wyrmAfter?.loopPath ?? "/x.mp4"}`), JSON.stringify({ preset: wyrmAfter?.motionPreset, loop: wyrmAfter?.loopPath }));
  const motionIssueAfter = await db.designIssue.findFirst({ where: { projectId: labId, refName: "E2E Crimson Wyrm", kind: "MOTION" }, orderBy: { createdAt: "desc" } });
  check("F6 the MOTION issue cleared only because the re-audit agrees", motionIssueAfter?.status === "FIXED" && Boolean(motionIssueAfter?.fixNote?.includes("baked")), motionIssueAfter?.status ?? "missing");
  const fixResultNote = fix.status === "OK" ? fix.result : "";
  check("F7 the fix result reports the re-audit standing", fixResultNote.includes("Re-audit"), fixResultNote.slice(0, 160));

  const status = await T("design_status", {});
  check("F8 design_status reports the performing standing", status.status === "OK" && status.result.includes("performing") && status.result.includes("E2E Azure Seal"), status.result.slice(0, 240));
  const lib = await T("blender_asset_library", {});
  check("F9 the library readout names performing vs motionless", lib.status === "OK" && lib.result.includes("performing 'E2E Seal Drift'") && lib.result.includes("loop on file"), lib.result.slice(0, 240));

  // ───────────────────── G. the context line + riding payloads ─────────────────────
  const ctx = await buildCompactContext(labId);
  const designLine = ctx?.design ?? "";
  check("G1 the context design line reports the performing library", designLine.includes("performing") && designLine.includes("+loop"), designLine.slice(0, 240));
  check("G2 motion presets ride the context's registry line", designLine.includes("motion 'E2E Seal Drift'") || designLine.includes("motion 'E2E River Dance'"), designLine.slice(0, 240));

  const ride = await assetsForRender(labId, [], null, "the E2E Crimson Wyrm coils as the E2E Azure Seal glows");
  check("G3 a shot naming both performing assets gets both .blend paths", ride.props.length === 2 && ride.props.every((p) => fs.existsSync(p.path)), ride.props.map((p) => p.name).join(","));
  const noRide = await assetsForRender(labId, [], null, "an empty hall with nothing named");
  check("G4 an unnamed shot honestly loads nothing", noRide.props.length === 0);

  // ───────────────────── H. the HTTP role matrix ─────────────────────
  const anon = await call(null, `/api/blender-assets?projectId=${labId}`);
  check("H1 anonymous library reads are 401", anon.status === 401);
  const strangerEmail = `stranger52-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger52", "stranger-pass-52");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-52");
  const strangerGet = await call(strangerJar, `/api/design-reviews?projectId=${labId}`);
  check("H2 a non-member sees no design standing (403)", strangerGet.status === 403);
  const strangerPost = await call(strangerJar, "/api/blender-assets", { method: "POST", body: JSON.stringify({ action: "build", projectId: labId, kind: "PROP", refName: "E2E Azure Seal", motion: "E2E Seal Drift" }) });
  check("H3 a non-member cannot drive a motion build (403)", strangerPost.status === 403);
  const ownerGet = await call(ownerJar, `/api/blender-assets?projectId=${labId}`);
  const ownerData = (await ownerGet.json().catch(() => ({}))) as { assets?: Array<{ motionPreset?: string | null; loopPath?: string | null }> };
  check("H4 the OWNER reads the library with motion fields (bypass intact)", ownerGet.status === 200 && Array.isArray(ownerData.assets) && ownerData.assets.some((a) => a.motionPreset !== undefined));
  const ownerDrive = await call(ownerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ action: "audit", projectId: labId, refName: "E2E Azure Seal", kind: "PROP" }) });
  check("H5 the OWNER drives the loop over HTTP", ownerDrive.status === 200);

  // ───────────────────── I. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  await db.user.delete({ where: { id: stranger.id } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverPresets = await db.designPreset.count({ where: { projectId: labId } });
  check("I1 every throwaway row is gone (cascade holds)", !leftover && leftoverPresets === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
