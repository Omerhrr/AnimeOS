// E2E: real img2vid provider, per-state pose presets, art-aware continuity.
// Steps:
//   plan - pure checks: the state pose preset library + active-state
//          resolution, provider selection (host wins, zai default,
//          off disables), the z.ai img2vid prompt (pose beat, camera
//          gloss, identity lock) and duration clamp, key-art data URL
//          resolution.
//   tool - live pipeline: DSH create_character_state auto-lands a
//          library preset and set_state_poses steers/clears it;
//          applyStatePoses lands a state's pair on a shot (explicit
//          preset and library fallback); panel-art generation stamps
//          artGeneratedAt and carries the previous shot's continuity
//          line; the art-continuity scan flags stale-state and
//          stale-anchor; the VLM check lands an ART_* continuity
//          event; the REAL z.ai video model renders a pose clip end
//          to end (submit -> poll -> download -> ffprobe h264); DSH
//          check_art_continuity speaks the scan and deep verdicts.
//          Every artifact is removed at the end.
import { presetPosesForStateLabel, resolveActiveState, statePosePair } from "@/lib/animation/state-poses";
import {
  img2vidHost, img2vidProvider, img2vidStatus, buildImg2VidPrompt,
  img2vidDurationClamp, resolveImg2VidImageUrl,
  submitImg2VidZaiJob, pollImg2VidZaiJob,
} from "@/lib/bridge/img2vid";
import { tickRenderJob } from "@/lib/engine/render";
import { executeTool } from "@/lib/dsh/tools";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const step = process.argv[2] ?? "plan";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function api<T>(p: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${p}`, init);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

function ffprobe(file: string): Promise<{ duration: number; streams: Array<{ codec_type: string; codec_name: string }> } | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      try {
        const j = JSON.parse(out) as { streams: Array<{ codec_type: string; codec_name: string }>; format: { duration: string } };
        resolve({ duration: Number(j.format.duration ?? 0), streams: j.streams });
      } catch {
        resolve(null);
      }
    });
  });
}

const SCENE_PARAMS = { fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.5, cameraDistance: 1.0, rimLightIntensity: 0.5 };

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── state pose preset library ──
  const furious = presetPosesForStateLabel("Furious");
  check("furious resolves to STANCE -> LUNGE", furious?.poseStart === "STANCE" && furious?.poseEnd === "LUNGE", JSON.stringify(furious));
  const grieving = presetPosesForStateLabel("grieving soul");
  check("grieving resolves to STANCE -> CROUCH", grieving?.poseStart === "STANCE" && grieving?.poseEnd === "CROUCH", JSON.stringify(grieving));
  const damaged = presetPosesForStateLabel("Battle-damaged (temple fight)");
  check("battle-damaged resolves to STANCE -> FALL", damaged?.poseStart === "STANCE" && damaged?.poseEnd === "FALL", JSON.stringify(damaged));
  const calm = presetPosesForStateLabel("calm");
  check("calm holds a ready stance", calm?.poseStart === "STANCE" && calm?.poseEnd === "STANCE", JSON.stringify(calm));
  const determined = presetPosesForStateLabel("Determined (final trial)");
  check("determined rises from a loaded knee", determined?.poseStart === "CROUCH" && determined?.poseEnd === "RISE", JSON.stringify(determined));
  check("unmatched labels resolve to no preset", presetPosesForStateLabel("Mysterious stranger") === null, "null");
  check("every library preset names valid poses", [furious, grieving, damaged, calm, determined].every((p) => p !== null), "all hit");

  // ── active state resolution ──
  const states = [
    { label: "ep1 state", episodeNumber: 1, poseStart: null, poseEnd: null },
    { label: "ep15 state", episodeNumber: 15, poseStart: "DRAW", poseEnd: "BLOCK" },
    { label: "always state", episodeNumber: null, poseStart: null, poseEnd: null },
  ];
  check("latest episode-effective state wins", resolveActiveState(states, 20)?.label === "ep15 state", resolveActiveState(states, 20)?.label ?? "none");
  check("older episode picks the earlier state", resolveActiveState(states, 5)?.label === "ep1 state", resolveActiveState(states, 5)?.label ?? "none");
  check("null episode stays effective forever", resolveActiveState([states[2]], 99)?.label === "always state", "fallback");
  check("future state is not yet effective", resolveActiveState(states, 0)?.label === "always state", resolveActiveState(states, 0)?.label ?? "none");

  // ── statePosePair ──
  const explicit = statePosePair(states as never, 20);
  check("explicit state pair wins", explicit?.poseStart === "DRAW" && explicit?.poseEnd === "BLOCK", JSON.stringify(explicit));
  const libStates = [{ label: "Furious", episodeNumber: 1, poseStart: null, poseEnd: null }];
  const auto = statePosePair(libStates, 5, true);
  check("library preset applies on auto", auto?.poseStart === "STANCE" && auto?.poseEnd === "LUNGE", JSON.stringify(auto));
  const manual = statePosePair(libStates, 5, false);
  check("no library preset without auto", manual === null, String(manual));

  // ── img2vid provider selection ──
  const prevHost = process.env.ANIMEOS_IMG2VID_HOST;
  const prevOff = process.env.ANIMEOS_IMG2VID;
  delete process.env.ANIMEOS_IMG2VID_HOST;
  delete process.env.ANIMEOS_IMG2VID;
  check("default provider is the built-in zai model", img2vidProvider() === "zai", String(img2vidProvider()));
  process.env.ANIMEOS_IMG2VID = "off";
  check("ANIMEOS_IMG2VID=off disables the slot", img2vidProvider() === null && img2vidStatus().available === false, String(img2vidProvider()));
  delete process.env.ANIMEOS_IMG2VID;
  process.env.ANIMEOS_IMG2VID_HOST = "127.0.0.1:8399";
  check("an attached host wins over zai", img2vidProvider() === "host" && img2vidHost() === "127.0.0.1:8399", String(img2vidProvider()));
  if (prevHost) process.env.ANIMEOS_IMG2VID_HOST = prevHost; else delete process.env.ANIMEOS_IMG2VID_HOST;
  if (prevOff) process.env.ANIMEOS_IMG2VID = prevOff; else delete process.env.ANIMEOS_IMG2VID;

  // ── the z.ai animation prompt ──
  const pair = buildImg2VidPrompt({ poseStart: "STANCE", poseEnd: "LUNGE", movement: "DOLLY_IN", shotType: "MEDIUM", lighting: "moonlit rim" });
  check("prompt carries both pose glosses", pair.includes("ready stance") && pair.includes("forward lunge"), pair.slice(0, 130));
  check("prompt carries the camera program", pair.includes("pushes in") && pair.includes("medium view"), "camera gloss");
  check("prompt locks identity to the key art", pair.includes("EXACTLY as in the source frame"), "identity lock");
  const held = buildImg2VidPrompt({ poseStart: "CAST", poseEnd: "CAST", movement: "STATIC", shotType: "CLOSEUP", lighting: null });
  check("held pose asks for living motion", held.includes("holds") && held.includes("breathing"), "subtle motion");
  const ambient = buildImg2VidPrompt({ poseStart: null, poseEnd: null, movement: "ORBIT", shotType: "WIDE", lighting: null });
  check("no poses falls back to ambient motion", ambient.includes("ambient motion") && ambient.includes("orbits"), "ambient");

  // ── duration clamp + key art resolution ──
  check("duration clamps into the 3..10 window", img2vidDurationClamp(1) === 3 && img2vidDurationClamp(30) === 10 && img2vidDurationClamp(5.4) === 5, `${img2vidDurationClamp(1)}/${img2vidDurationClamp(30)}/${img2vidDurationClamp(5.4)}`);
  check("missing key art resolves to null", resolveImg2VidImageUrl("/panels/definitely-missing.png") === null, "null");
  const tmpPanel = path.join(process.cwd(), "public", "panels", ".e2e-iter29-art.png");
  fs.mkdirSync(path.dirname(tmpPanel), { recursive: true });
  fs.writeFileSync(tmpPanel, Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001080600000", "hex"));
  const dataUrl = resolveImg2VidImageUrl(`/panels/.e2e-iter29-art.png?v=${Date.now()}`);
  check("local key art becomes a data URL", Boolean(dataUrl?.startsWith("data:image/png;base64,")), dataUrl?.slice(0, 40) ?? "none");
  check("absolute urls pass through untouched", resolveImg2VidImageUrl("https://cdn.example.com/art.png") === "https://cdn.example.com/art.png", "passthrough");
  fs.unlinkSync(tmpPanel);
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const rendersDir = path.join(process.cwd(), "public", "renders");
  const panelsDir = path.join(process.cwd(), "public", "panels");
  const sheetsDir = path.join(process.cwd(), "public", "sheets");
  for (const d of [rendersDir, panelsDir, sheetsDir]) fs.mkdirSync(d, { recursive: true });
  const beforeFiles = new Set([...fs.readdirSync(rendersDir), ...fs.readdirSync(panelsDir), ...fs.readdirSync(sheetsDir)]);

  // ── fixture production ──
  const proj = await db.project.create({
    data: {
      title: "E2E Iter29 Provider",
      logline: "real img2vid provider, per-state pose presets, art-aware continuity",
      fps: 24,
      resolution: "1280x720",
      characters: {
        create: [
          {
            name: "Lin Yue", role: "PROTAGONIST",
            appearance: JSON.stringify({ notes: "young cultivator, silver hair, jade eyes" }),
            states: {
              create: [
                // no explicit poses: the library preset must supply them
                { label: "Furious (temple duel)", episodeNumber: 1, stateType: "TEMPORARY" },
              ],
            },
          },
          { name: "Chen Hao", role: "RIVAL" },
        ],
      },
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Terrace Duel",
              scenes: {
                create: [
                  {
                    number: 1,
                    title: "Terrace",
                    description: "a rain-slick terrace above the cloud sea",
                    ...SCENE_PARAMS,
                    shots: {
                      create: [
                        { number: 1, description: "Lin Yue stands ready at the terrace edge", shotType: "MEDIUM", movement: "PAN", duration: 5 },
                        { number: 2, description: "Lin Yue snaps into the duel", shotType: "CLOSEUP", movement: "DOLLY_IN", duration: 4 },
                        { number: 3, description: "Chen Hao mocks from the far rail", shotType: "WIDE", movement: "STATIC", duration: 3 },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } }, characters: { include: { states: true } } },
  });
  const projectId = proj.id;
  const linYue = proj.characters.find((c) => c.name === "Lin Yue")!;
  const chenHao = proj.characters.find((c) => c.name === "Chen Hao")!;
  const furiousState = linYue.states[0];
  const shots = proj.seasons[0].episodes[0].scenes[0].shots.sort((a, b) => a.number - b.number);
  console.log(`fixture project ${projectId} with ${shots.length} shots, ${proj.characters.length} characters`);

  const blenderDir = "/home/z/blender-4.3.2-linux-x64";
  const blenderBackup = "/home/z/.blender-e2e-hidden";
  const hideBlender = () => { try { if (fs.existsSync(blenderDir)) fs.renameSync(blenderDir, blenderBackup); } catch { /* ignore */ } };
  const unhideBlender = () => { try { if (fs.existsSync(blenderBackup)) fs.renameSync(blenderBackup, blenderDir); } catch { /* ignore */ } };

  try {
    // ── 1. DSH create_character_state auto-lands a library preset ──
    const created = await executeTool(projectId, "create_character_state", {
      characterName: "Chen Hao", label: "Determined (rematch)", episodeNumber: 1, stateType: "TEMPORARY",
    });
    check("create_character_state auto-lands the library preset", created.status === "OK" && created.result.includes("CROUCH") && created.result.includes("RISE"), created.result.slice(0, 140));
    const badStatePose = await executeTool(projectId, "create_character_state", {
      characterName: "Chen Hao", label: "Temp", poseStart: "FLYING KICK",
    });
    check("create_character_state rejects unknown poses", badStatePose.status === "ERROR" && badStatePose.result.includes("Unknown pose"), badStatePose.result.slice(0, 90));

    // ── 2. set_state_poses steers the preset explicitly ──
    const setPoses = await executeTool(projectId, "set_state_poses", {
      characterName: "Lin Yue", stateLabel: "Furious", poseStart: "DRAW", poseEnd: "BLOCK",
    });
    check("set_state_poses lands an explicit pair", setPoses.status === "OK" && setPoses.result.includes("fully drawn") && setPoses.result.includes("forearms crossed"), setPoses.result.slice(0, 140));
    const setPosesBad = await executeTool(projectId, "set_state_poses", {
      characterName: "Lin Yue", poseStart: "FLYING KICK",
    });
    check("set_state_poses rejects unknown poses", setPosesBad.status === "ERROR", setPosesBad.result.slice(0, 80));
    const unknownState = await executeTool(projectId, "set_state_poses", {
      characterName: "Lin Yue", stateLabel: "Nonexistent", poseStart: "CAST",
    });
    check("set_state_poses reports unmatched labels", unknownState.status === "ERROR" && unknownState.result.includes("No state"), unknownState.result.slice(0, 110));

    // ── 3. applyStatePoses lands the state pair on a shot ──
    const apply1 = await api<{ id: string; statePoses: { applied: boolean; source?: string; now?: string | null } }>("/api/shots", {
      method: "PATCH",
      body: JSON.stringify({ id: shots[1].id, applyStatePoses: true }),
    });
    check("applyStatePoses applies the explicit state preset", apply1.status === 200 && apply1.body.statePoses.applied === true && (apply1.body.statePoses.source ?? "").includes("Furious"), JSON.stringify(apply1.body.statePoses).slice(0, 160));
    const shot2 = await db.shot.findUnique({ where: { id: shots[1].id } });
    check("the shot now performs DRAW -> BLOCK", shot2?.poseStart === "DRAW" && shot2?.poseEnd === "BLOCK", `${shot2?.poseStart}/${shot2?.poseEnd}`);

    // clearing the state pair falls back to the label's library preset
    const clearedState = await executeTool(projectId, "set_state_poses", {
      characterName: "Lin Yue", stateLabel: "Furious", poseStart: "", poseEnd: "",
    });
    check("set_state_poses clears with empty strings", clearedState.status === "OK", clearedState.result.slice(0, 90));
    const apply2 = await api<{ id: string; statePoses: { applied: boolean; source?: string } }>("/api/shots", {
      method: "PATCH",
      body: JSON.stringify({ id: shots[0].id, applyStatePoses: true }),
    });
    check("cleared state falls back to the library preset", apply2.status === 200 && apply2.body.statePoses.applied === true && (apply2.body.statePoses.source ?? "").includes("library"), JSON.stringify(apply2.body.statePoses).slice(0, 160));
    const shot1 = await db.shot.findUnique({ where: { id: shots[0].id } });
    check("library fallback lands STANCE -> LUNGE for Furious", shot1?.poseStart === "STANCE" && shot1?.poseEnd === "LUNGE", `${shot1?.poseStart}/${shot1?.poseEnd}`);

    // a shot naming no cast member cannot inherit a preset
    const lonelyShot = await db.shot.create({
      data: { sceneId: shots[0].sceneId, number: 4, description: "the empty terrace after the storm", shotType: "ESTABLISHING", duration: 3 },
    });
    const apply3 = await api<{ id: string; statePoses: { applied: boolean; reason?: string } }>("/api/shots", {
      method: "PATCH",
      body: JSON.stringify({ id: lonelyShot.id, applyStatePoses: true }),
    });
    check("no-cast shot reports why nothing applied", apply3.status === 200 && apply3.body.statePoses.applied === false && (apply3.body.statePoses.reason ?? "").includes("no cast"), JSON.stringify(apply3.body.statePoses).slice(0, 140));

    // ── 4. panel art: artGeneratedAt + previous-shot continuity line ──
    const art1 = await api<{ artworkUrl?: string; prompt?: string; error?: string }>("/api/panel-art", {
      method: "POST", body: JSON.stringify({ shotId: shots[0].id, format: "MANHUA" }),
    });
    check("panel art generated for shot 1", art1.status === 200 && Boolean(art1.body.artworkUrl), art1.body.error ?? "ok");
    const art1Row = await db.shot.findUnique({ where: { id: shots[0].id } });
    check("art generation stamps artGeneratedAt", art1Row?.artGeneratedAt != null && Boolean(art1Row.artworkUrl), String(art1Row?.artGeneratedAt));
    check("art prompt paints the state's start pose", Boolean(art1.body.prompt?.includes("mid-action")), art1.body.prompt?.slice(0, 120));
    const art2 = await api<{ artworkUrl?: string; prompt?: string; error?: string }>("/api/panel-art", {
      method: "POST", body: JSON.stringify({ shotId: shots[1].id, format: "MANHUA" }),
    });
    check("panel art generated for shot 2", art2.status === 200 && Boolean(art2.body.artworkUrl), art2.body.error ?? "ok");
    check("art prompt carries the previous-panel continuity line", Boolean(art2.body.prompt?.includes("Continuity with the previous panel")), art2.body.prompt?.slice(0, 160));

    // ── 5. deterministic art-continuity scan ──
    // a state recorded AFTER the art makes that art stale
    await db.characterState.create({
      data: { characterId: linYue.id, label: "Grieving (after the duel)", episodeNumber: 1, stateType: "TEMPORARY" },
    });
    // a regenerated anchor AFTER the art also makes it stale
    await db.character.update({ where: { id: linYue.id }, data: { modelSheetAt: new Date(Date.now() + 60_000) } });
    const scan1 = await api<{ counts: { checked: number; staleState: number; staleAnchor: number; anchorMissing: number }; shots: Array<{ shotId: string; items: Array<{ kind: string }> }> }>(`/api/continuity-art?projectId=${projectId}`);
    check("scan checks every shot", scan1.body.counts.checked === 4, JSON.stringify(scan1.body.counts));
    check("scan flags stale state art", scan1.body.counts.staleState >= 2, `staleState=${scan1.body.counts.staleState}`);
    check("scan flags stale anchors", scan1.body.counts.staleAnchor >= 2, `staleAnchor=${scan1.body.counts.staleAnchor}`);
    check("scan flags the missing anchor cast", scan1.body.counts.anchorMissing >= 1, `anchorMissing=${scan1.body.counts.anchorMissing}`);

    // DSH scan wording
    const dshScan = await executeTool(projectId, "check_art_continuity", {});
    check("check_art_continuity reports stale art", dshScan.status === "OK" && dshScan.result.includes("STALE ART") && dshScan.result.includes("ANCHOR MISSING"), dshScan.result.slice(0, 150));

    // ── 6. VLM deep check: panel art vs the canonical model sheet ──
    const sheet = await api<{ modelSheetUrl?: string; error?: string }>("/api/character-sheet", {
      method: "POST", body: JSON.stringify({ characterId: linYue.id }),
    });
    check("model sheet generated for the anchor", sheet.status === 200 && Boolean(sheet.body.modelSheetUrl), sheet.body.error ?? "ok");
    // modelSheetAt is now ~now: the art (older) goes stale vs anchor
    const vlm = await api<{ error?: string; verdict?: { consistent: boolean; summary: string; drift: Array<{ aspect: string }>; characterName: string | null; shotRef: string }; eventKind?: string }>("/api/continuity-art", {
      method: "POST", body: JSON.stringify({ shotId: shots[0].id }),
    });
    check("VLM check returns a verdict", vlm.status === 200 && Boolean(vlm.body.verdict?.summary), vlm.body.error ?? vlm.body.verdict?.summary ?? "no verdict");
    check("VLM verdict names the anchor and shot", vlm.body.verdict?.characterName === "Lin Yue" && Boolean(vlm.body.verdict.shotRef), `${vlm.body.verdict?.characterName}/${vlm.body.verdict?.shotRef}`);
    const artEvent = await db.continuityEvent.findFirst({
      where: { projectId, kind: { in: ["ART_DRIFT", "ART_VERIFIED"] } },
      orderBy: { createdAt: "desc" },
    });
    check("VLM verdict lands as an ART_* continuity event", Boolean(artEvent) && (artEvent?.description ?? "").includes(`[art ${vlm.body.verdict?.shotRef}]`), artEvent?.kind ?? "none");
    const dshDeep = await executeTool(projectId, "check_art_continuity", { sceneNumber: 1, shotNumber: 1, deep: true });
    check("DSH deep check speaks the vision verdict", dshDeep.status === "OK" && (dshDeep.result.includes("ART_VERIFIED") || dshDeep.result.includes("ART_DRIFT")), dshDeep.result.slice(0, 150));

    // ── 7. the REAL z.ai img2vid provider renders a pose clip ──
    // keep the driver chain deterministic: no bridge, no local blender
    hideBlender();
    const prevHostEnv = process.env.ANIMEOS_IMG2VID_HOST;
    delete process.env.ANIMEOS_IMG2VID_HOST;
    try {
      check("zai provider active for the live render", img2vidProvider() === "zai", String(img2vidProvider()));
      // the video endpoint rate-limits bursts - retry the submit across
      // the 429 window before giving up on the live-provider checks
      let submit: Awaited<ReturnType<typeof submitImg2VidZaiJob>> | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        submit = await submitImg2VidZaiJob({
          jobId: "e2e-iter29-zai",
          imageUrl: shots[0].artworkUrl,
          poseStart: "STANCE",
          poseEnd: "LUNGE",
          movement: "PAN",
          shotType: "MEDIUM",
          lighting: "rain-slick moonlit rim light",
          duration: 5,
          mode: "PREVIEW",
        });
        if (submit.submitted) break;
        console.log(`  submit attempt ${attempt} failed (${submit.error}) - cooling down 30s`);
        await new Promise((r) => setTimeout(r, 30_000));
      }
      check("real video model accepted the pose job", submit?.submitted === true && Boolean(submit.taskId), submit?.error ?? submit?.taskId?.slice(0, 12));

      // drive the tick path with a real IMG2VID job row
      const job = await db.renderJob.create({
        data: {
          projectId,
          shotId: shots[0].id,
          mode: "PREVIEW",
          status: "RENDERING",
          stage: "Img2Vid: z.ai interpolation model generating the pose clip",
          attempt: 1,
          driver: "IMG2VID",
          durationMs: 5000,
          providerTaskId: submit?.taskId ?? null,
          startedAt: new Date(),
        },
      });
      let final = { status: "", outputUrl: null as string | null, stage: "", progress: 0 };
      const deadline = Date.now() + 8 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10_000));
        const ticked = await tickRenderJob(job.id);
        final = { status: ticked.status, outputUrl: ticked.outputUrl, stage: ticked.stage, progress: ticked.progress };
        if (ticked.status !== "RENDERING") break;
      }
      check("img2vid job completes through the tick path", final.status === "REVIEW", `${final.status} :: ${final.stage}`);
      check("finished img2vid job carries a clip url", Boolean(final.outputUrl?.startsWith("/renders/")), final.outputUrl ?? "none");
      const clipPath = path.join(process.cwd(), "public", final.outputUrl ?? "none");
      const probe = final.outputUrl ? await ffprobe(clipPath) : null;
      check("img2vid clip is a real h264 mp4", Boolean(probe?.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264")), probe ? `${probe.duration.toFixed(2)}s` : "no probe");
      check("img2vid clip carries video duration", (probe?.duration ?? 0) > 2, String(probe?.duration));
      await db.renderJob.delete({ where: { id: job.id } }).catch(() => {});
      try { fs.unlinkSync(clipPath); } catch { /* cleaned with the fixture sweep */ }
    } finally {
      if (prevHostEnv) process.env.ANIMEOS_IMG2VID_HOST = prevHostEnv;
      unhideBlender();
    }

    // ── 8. driver chain with the provider off falls through to a real engine ──
    const prevOffEnv = process.env.ANIMEOS_IMG2VID;
    process.env.ANIMEOS_IMG2VID = "off";
    hideBlender();
    try {
      const motionShot = await executeTool(projectId, "render_shot", { sceneNumber: 1, shotNumber: 1 });
      const motionJob = await db.renderJob.findFirst({ where: { projectId, shotId: shots[0].id }, orderBy: { createdAt: "desc" } });
      check("provider off + no bridge falls through to MOTION", motionShot.status === "OK" && motionJob?.driver === "MOTION", `${motionJob?.driver} :: ${motionShot.result.slice(0, 90)}`);
      check("render_shot names the pose beat", motionShot.result.includes("STANCE") && motionShot.result.includes("LUNGE"), motionShot.result.slice(0, 130));
      if (motionJob) await db.renderJob.delete({ where: { id: motionJob.id } }).catch(() => {});
    } finally {
      if (prevOffEnv) process.env.ANIMEOS_IMG2VID = prevOffEnv; else delete process.env.ANIMEOS_IMG2VID;
      unhideBlender();
    }

    // ── 9. DSH context carries the state presets ──
    const ctx = await executeTool(projectId, "get_production_context", {});
    check("context lists state pose presets", ctx.status === "OK" && ctx.result.includes("poses"), "context");
  } finally {
    // ── cleanup: fixture project + its artifacts ──
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    const removeIfNew = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        if (!beforeFiles.has(f)) {
          try { fs.unlinkSync(path.join(dir, f)); } catch { /* already gone */ }
        }
      }
    };
    removeIfNew(rendersDir);
    removeIfNew(panelsDir);
    removeIfNew(sheetsDir);
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
