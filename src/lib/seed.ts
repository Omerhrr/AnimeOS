import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// DEMO UNIVERSE SEED - "Immortal Path" (仙途)
// Implements the exact examples from the vision doc:
//   §18 character development, §27 continuity conflict,
//   §29 scene derivation, §30 shot breakdown, §14 terminology.
// Idempotent: only seeds when the database is empty.
// ─────────────────────────────────────────────────────────────

export async function ensureSeed() {
  const existing = await db.project.findFirst();
  if (existing) return existing.id;

  const project = await db.project.create({
    data: {
      title: "Immortal Path",
      logline: "A powerless village boy walks the cultivation path from Qi Condensation to Sword Sovereign.",
      format: "SERIES",
      animationType: "3D",
      visualStyle: "DONGHUA",
      originalLanguage: "zh-CN",
      subtitleLanguages: JSON.stringify(["en-US", "ja-JP", "ko-KR", "fr-FR"]),
      fps: 24,
      resolution: "1920x1080",
    },
  });

  const season = await db.season.create({
    data: { projectId: project.id, number: 1, title: "Season 1 - The Awakened Blade" },
  });

  const ep7 = await db.episode.create({
    data: {
      seasonId: season.id,
      number: 7,
      title: "The Storm Over Azure Mountain",
      synopsis: "Lin Yue shelters in a ruined temple on Azure Mountain. The storm is not natural - someone is hunting him.",
      status: "IN_PRODUCTION",
    },
  });

  // ── Characters (§17/§18/§20) ─────────────────────────────
  const linYue = await db.character.create({
    data: {
      projectId: project.id,
      name: "Lin Yue",
      role: "PROTAGONIST",
      age: "16",
      personality: "Stubborn, quietly compassionate, carries the memory of his burned village",
      backstory: "Sole survivor of Willow Village. Tested with a broken spirit root, yet the sword answers him.",
      appearance: JSON.stringify({ face: "Sharp jaw, calm eyes", body: "Lean, 175cm", hair: "Black topknot, jade ribbon", features: "Faint scar over left brow" }),
      wardrobe: JSON.stringify([
        { name: "Disciple Robes", slot: "casual" },
        { name: "Battle Robes", slot: "battle" },
        { name: "Sect Elder Robes", slot: "formal" },
      ]),
      abilities: JSON.stringify(["Basic Swordsmanship", "Azure Flame", "Sword Domain"]),
      animationLib: JSON.stringify(["idle", "walk", "run", "sword_draw", "combat_combo_01", "meditate"]),
      canonicalState: "Both arms intact; cultivation at Foundation Establishment as of Episode 15",
    },
  });

  const chenHao = await db.character.create({
    data: {
      projectId: project.id,
      name: "Chen Hao",
      role: "RIVAL",
      age: "17",
      personality: "Arrogant, brilliant, haunted by Lin Yue's rise",
      backstory: "First blade of Azure Sect's inner court. Refuses to believe a broken spirit root can outmatch him.",
      abilities: JSON.stringify(["Seven Star Swordplay"]),
      animationLib: JSON.stringify(["idle", "walk", "combat_combo_02"]),
    },
  });

  const elderHan = await db.character.create({
    data: {
      projectId: project.id,
      name: "Elder Han",
      role: "MENTOR",
      age: "62",
      personality: "Dry humor, ancient patience, hides a debt to Lin Yue's father",
      abilities: JSON.stringify(["Formation Mastery"]),
    },
  });

  const demonLord = await db.character.create({
    data: {
      projectId: project.id,
      name: "Demon Lord Wei",
      role: "ANTAGONIST",
      age: "Unknown",
      personality: "Courteous, utterly ruthless",
      backstory: "Sealed beneath Azure Mountain for nine hundred years. The storm answers to him.",
    },
  });

  const clone001 = await db.character.create({
    data: {
      projectId: project.id,
      name: "Lin Yue - Clone 001",
      role: "SUPPORTING",
      derivativeType: "CLONE",
      parentId: linYue.id,
      personality: "Shares Lin Yue's instincts; flickers under heavy damage",
      abilities: JSON.stringify(["Basic Swordsmanship"]),
      canonicalState: "Instance of the Clone Technique; shares model, rig, materials and animation library with the original",
    },
  });

  await db.relationship.createMany({
    data: [
      { fromId: linYue.id, toId: chenHao.id, type: "RIVAL" },
      { fromId: linYue.id, toId: elderHan.id, type: "MASTER" },
      { fromId: clone001.id, toId: linYue.id, type: "CLONE" },
      { fromId: demonLord.id, toId: linYue.id, type: "ENEMY" },
    ],
  });

  // Character development states (§18) - history is preserved
  await db.characterState.createMany({
    data: [
      {
        characterId: linYue.id, label: "S01 - Village Disciple", episodeNumber: 1, stateType: "PERMANENT",
        cultivation: "Qi Condensation", weapon: "Wooden Sword", clothing: "Disciple Robes",
        abilities: JSON.stringify(["Basic Swordsmanship"]),
      },
      {
        characterId: linYue.id, label: "S02 - Foundation Established", episodeNumber: 15, stateType: "PERMANENT",
        cultivation: "Foundation Establishment", weapon: "Jade Sword", clothing: "Battle Robes",
        abilities: JSON.stringify(["Advanced Swordsmanship", "Azure Flame"]),
      },
      {
        characterId: linYue.id, label: "S03 - Core Formation", episodeNumber: 40, stateType: "PERMANENT",
        cultivation: "Core Formation", weapon: "Celestial Sword", clothing: "Sect Elder Robes",
        abilities: JSON.stringify(["Sword Domain", "Azure Heaven Flame"]),
      },
      {
        characterId: linYue.id, label: "Battle-damaged (temple fight)", episodeNumber: 7, stateType: "TEMPORARY",
        cultivation: "Foundation Establishment", weapon: "Jade Sword", clothing: "Battle Robes (torn)",
        abilities: JSON.stringify(["Advanced Swordsmanship"]),
      },
    ],
  });

  // ── Environments (§28) ───────────────────────────────────
  const azureMountain = await db.environment.create({
    data: {
      projectId: project.id,
      name: "Azure Mountain",
      description: "A Nine-thousand-meter cultivation peak wrapped in a sea of clouds. Sect gates on the south face; ancient ruins near the summit.",
      timeOfDay: "Night",
      weather: "Storm",
      atmosphere: JSON.stringify(["Rain", "Fog", "Wind"]),
      lighting: "Moonlight, lightning flashes, cold rim light",
    },
  });

  const ancientTemple = await db.environment.create({
    data: {
      projectId: project.id,
      name: "Ancient Temple",
      description: "Ruined mountain shrine older than the Sect. Cracked stone tiles, collapsed roof, a dormant sword altar.",
      timeOfDay: "Night",
      weather: "Storm (interior: wind through broken walls)",
      atmosphere: JSON.stringify(["Interior shadows", "Dust motes", "Rain leaks"]),
      lighting: "Interior shadows, lightning through broken roof",
    },
  });

  // ── Assets (§7 asset tools) ──────────────────────────────
  const jadeSword = await db.asset.create({
    data: { projectId: project.id, category: "PROP", name: "Jade Sword", description: "Lin Yue's blade from Episode 15 until its destruction.", status: "APPROVED", currentVersion: 3 },
  });
  await db.assetVersion.create({ data: { assetId: jadeSword.id, version: 1, note: "First proxy model" } });
  await db.assetVersion.create({ data: { assetId: jadeSword.id, version: 2, note: "Jade shader + energy channel" } });
  await db.assetVersion.create({ data: { assetId: jadeSword.id, version: 3, note: "Battle-damage variant" } });

  await db.asset.create({ data: { projectId: project.id, category: "EFFECT", name: "Azure Flame", description: "Signature cultivation flame - blue-green fire with sword-qi particles.", status: "BUILDING" } });
  await db.asset.create({ data: { projectId: project.id, category: "PROP", name: "Wooden Sword", status: "APPROVED" } });
  await db.asset.create({ data: { projectId: project.id, category: "ENVIRONMENT", name: "Azure Mountain", status: "APPROVED" } });

  // ── Terminology / translation memory (§14) ───────────────
  await db.terminology.createMany({
    data: [
      { projectId: project.id, term: "Azure Flame", category: "TECHNIQUE", translations: JSON.stringify({ "zh-CN": "青焰", "en-US": "Azure Flame", "ja-JP": "蒼炎", "ko-KR": "창염" }) },
      { projectId: project.id, term: "Lin Yue", category: "CHARACTER_NAME", translations: JSON.stringify({ "zh-CN": "林越", "en-US": "Lin Yue", "ja-JP": "リン・ユエ", "ko-KR": "린 위에" }) },
      { projectId: project.id, term: "Qi Condensation", category: "REALM", translations: JSON.stringify({ "zh-CN": "炼气期", "en-US": "Qi Condensation", "ja-JP": "煉気期", "ko-KR": "련기기" }) },
      { projectId: project.id, term: "Foundation Establishment", category: "REALM", translations: JSON.stringify({ "zh-CN": "筑基期", "en-US": "Foundation Establishment", "ja-JP": "築基期", "ko-KR": "축기기" }) },
      { projectId: project.id, term: "Azure Mountain", category: "LOCATION", translations: JSON.stringify({ "zh-CN": "青云山", "en-US": "Azure Mountain", "ja-JP": "青雲山", "ko-KR": "청운산" }) },
    ],
  });

  // ── Scene 12 + shot breakdown (§29/§30/§31) ──────────────
  const scene12 = await db.scene.create({
    data: {
      episodeId: ep7.id,
      number: 12,
      title: "The Ruined Temple",
      description: "Lin Yue enters an ancient ruined temple during a storm. Rain hammers the broken roof. As he catches his breath, the temperature drops - the storm outside has stopped moving. He draws his sword; azure energy gathers along the blade as lightning illuminates the altar.",
      environmentId: ancientTemple.id,
      timeOfDay: "Night",
      weather: "Storm",
      atmosphere: JSON.stringify(["Rain", "Fog", "Wind", "Lightning"]),
      lighting: "Moonlight through broken roof, lightning flashes, cold interior shadows",
      status: "PREVIEW",
    },
  });

  const shotDefs = [
    { number: 1, description: "Establishing shot - Azure Mountain summit, temple ruin in the storm, clouds churning below the peak", shotType: "ESTABLISHING", lens: "24mm", movement: "CRANE", duration: 4.2, lighting: "Moonlight + storm clouds" },
    { number: 2, description: "Lin Yue enters the temple, robes whipping in the wind, rain trailing off his shoulders", shotType: "MEDIUM", lens: "35mm", movement: "TRACKING", duration: 5.0, lighting: "Backlight + interior shadows" },
    { number: 3, description: "Close-up - Lin Yue's eyes narrow; the rain sound dies unnaturally", shotType: "CLOSEUP", lens: "85mm", movement: "STATIC", duration: 2.8, lighting: "Cold key, deep shadow" },
    { number: 4, description: "Reverse shot - a shadow detaches itself from the altar; the Demon Lord's aura crawls across the floor", shotType: "WIDE", lens: "35mm", movement: "PAN", duration: 4.0, lighting: "Aura glow + lightning" },
    { number: 5, description: "Sword draw - jade blade sings out of its sheath, azure energy coiling up the steel", shotType: "LOW_ANGLE", lens: "50mm", movement: "ORBIT", duration: 4.2, lighting: "Blade emission + rim light" },
    { number: 6, description: "Impact - first clash, lightning detonates through the broken roof, debris suspended mid-air", shotType: "WIDE", lens: "28mm", movement: "STATIC", duration: 3.6, lighting: "Lightning detonation" },
  ];
  for (const s of shotDefs) {
    await db.shot.create({ data: { sceneId: scene12.id, ...s, status: "DRAFT" } });
  }

  // ── Continuity events (§27) ──────────────────────────────
  await db.continuityEvent.createMany({
    data: [
      {
        projectId: project.id, entityType: "PROP", entityName: "Jade Sword", kind: "DESTROYED", episodeNumber: 29,
        description: "Jade Sword shattered against Demon Lord Wei's chains in Episode 29.",
        severity: "CRITICAL",
      },
      {
        projectId: project.id, entityType: "CHARACTER", entityName: "Lin Yue", kind: "INJURED", episodeNumber: 33,
        description: "Lin Yue loses his left arm defending Misthaven City. Permanent from Episode 33 onward.",
        severity: "WARNING",
      },
    ],
  });

  // ── A completed preview render + DSH evaluation (shot 5) ─
  const shot5 = await db.shot.findFirst({ where: { sceneId: scene12.id, number: 5 } });
  if (shot5) {
    const doneJob = await db.renderJob.create({
      data: {
        projectId: project.id, shotId: shot5.id, mode: "PREVIEW",
        status: "REVIEW", progress: 100, stage: "Awaiting DSH inspection",
        attempt: 1, durationMs: 16000,
        startedAt: new Date(Date.now() - 3600_000), finishedAt: new Date(Date.now() - 3500_000),
      },
    });
    await db.evaluation.create({
      data: {
        renderJobId: doneJob.id,
        verdict: "NEEDS_REVISION",
        summary: "Sword draw reads clearly but the shot underuses its drama: the camera orbits too wide, the figure sits low in frame, and the blade energy is barely visible against the fog.",
        findings: JSON.stringify([
          { aspect: "Camera", status: "ISSUE", note: "Camera is too wide for a sword-draw beat - the draw happens in the middle third." },
          { aspect: "Exposure", status: "ISSUE", note: "Character is underexposed; rim light is not separating him from the temple wall." },
          { aspect: "VFX", status: "ISSUE", note: "Azure energy emission lacks intensity - the blade glow washes out in the fog." },
          { aspect: "Atmosphere", status: "ISSUE", note: "Background fog is too dense; the temple interior loses depth." },
          { aspect: "Character", status: "GOOD", note: "Battle-robe state and silhouette are correct for Episode 7." },
        ]),
        actions: JSON.stringify([
          { type: "ADJUST_SCENE", param: "cameraDistance", from: 1.0, to: 0.72, reason: "Move camera ~1.5m closer so the draw fills frame" },
          { type: "ADJUST_SCENE", param: "rimLightIntensity", from: 0.5, to: 0.78, reason: "Increase rim light to separate figure from background" },
          { type: "ADJUST_SCENE", param: "energyIntensity", from: 0.6, to: 0.88, reason: "Increase sword energy emission" },
          { type: "ADJUST_SCENE", param: "fogDensity", from: 0.45, to: 0.3, reason: "Reduce fog density by roughly a third" },
        ]),
      },
    });
    await db.shot.update({ where: { id: shot5.id }, data: { status: "REVIEW" } });
  }

  // ── Production history (§47/§52) ─────────────────────────
  await db.productionEvent.createMany({
    data: [
      { projectId: project.id, actor: "DSH", type: "PROJECT", summary: "Production 'Immortal Path' initialized - Donghua / 3D / zh-CN" },
      { projectId: project.id, actor: "DSH", type: "TOOL_CALL", summary: "character.create → Lin Yue (PROTAGONIST) with 3 development states" },
      { projectId: project.id, actor: "DSH", type: "TOOL_CALL", summary: "character.create → Chen Hao (RIVAL), Elder Han (MENTOR), Demon Lord Wei (ANTAGONIST)" },
      { projectId: project.id, actor: "DSH", type: "TOOL_CALL", summary: "environment.create → Azure Mountain, Ancient Temple" },
      { projectId: project.id, actor: "DSH", type: "TOOL_CALL", summary: "scene.create → Episode 7 / Scene 12 'The Ruined Temple' with 6-shot breakdown" },
      { projectId: project.id, actor: "DSH", type: "CONTINUITY", summary: "Continuity watch registered: Jade Sword destroyed (Ep 29), Lin Yue loses left arm (Ep 33)" },
      { projectId: project.id, actor: "DSH", type: "EVALUATION", summary: "Preview inspection Shot 005 → NEEDS_REVISION (4 modification actions proposed)" },
    ],
  });

  await seedStudioTeam(project.id);

  return project.id;
}

// ─────────────────────────────────────────────────────────────
// STUDIO TEAM SEED - style LoRA registry, artist roster,
// per-shot assignments and motion-panel sound design.
// Idempotent (checks by unique name) so it can also augment a
// live production database without touching existing artwork.
// ─────────────────────────────────────────────────────────────

export async function seedStudioTeam(projectId: string) {
  // ── Style LoRA registry ────────────────────────────────
  const loraDefs = [
    { name: "immortal-path-v3", triggerPhrase: "immortalpath_xianxia_style, jade_teal_rimlight", weight: 0.85, baseModel: "SDXL", notes: "House style adapter - matches the season 1 look. Default for hero shots." },
    { name: "ink-wash-flashback", triggerPhrase: "inkwash_2d, monochrome_wash, brush_stroke_edges", weight: 0.7, baseModel: "SDXL", notes: "2D ink-wash treatment for Willow Village flashbacks (Ep 9, 19)." },
    { name: "azure-flame-fx", triggerPhrase: "azureflame_vfx, volumetric_sword_qi, teal_energy_rim", weight: 0.9, baseModel: "SDXL", notes: "Energy-VFX accent for cultivation blasts and sword-qi moments." },
  ];
  const loras: Record<string, string> = {};
  for (const def of loraDefs) {
    const existing = await db.styleLora.findUnique({ where: { projectId_name: { projectId, name: def.name } } });
    if (existing) { loras[def.name] = existing.id; continue; }
    const lora = await db.styleLora.create({ data: { projectId, ...def } });
    loras[def.name] = lora.id;
  }

  // ── Artist roster ──────────────────────────────────────
  const artistDefs = [
    { name: "Mei Lin", role: "Key animator - characters", color: "#e8b04b" },
    { name: "Jiang Wu", role: "Backgrounds & environments", color: "#5aa88f" },
    { name: "Su Qing", role: "Effects animation", color: "#b07cd8" },
    { name: "Dao Zhang", role: "Webtoon inker / cleanup", color: "#d8767c" },
  ];
  const artists: Record<string, string> = {};
  for (const def of artistDefs) {
    const existing = await db.artist.findFirst({ where: { projectId, name: def.name } });
    if (existing) { artists[def.name] = existing.id; continue; }
    const artist = await db.artist.create({ data: { projectId, ...def } });
    artists[def.name] = artist.id;
  }

  // ── Scene 12 shot assignments + sound design ───────────
  const scene12 = await db.scene.findFirst({
    where: { episode: { season: { projectId } }, number: 12 },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  if (!scene12) return;

  const assignment: Array<{ number: number; artist: string; lora?: string; strength?: number }> = [
    { number: 1, artist: "Jiang Wu", lora: "immortal-path-v3", strength: 0.85 },
    { number: 2, artist: "Mei Lin" },
    { number: 3, artist: "Mei Lin" },
    { number: 4, artist: "Su Qing" },
    { number: 5, artist: "Su Qing", lora: "azure-flame-fx", strength: 0.9 },
    { number: 6, artist: "Dao Zhang" },
  ];
  for (const a of assignment) {
    const shot = scene12.shots.find((s) => s.number === a.number);
    if (!shot) continue;
    const patch: Record<string, unknown> = {};
    if (!shot.artistId && artists[a.artist]) patch.artistId = artists[a.artist];
    if (a.lora && !shot.loraId && loras[a.lora]) {
      patch.loraId = loras[a.lora];
      patch.loraStrength = a.strength ?? null;
    }
    if (Object.keys(patch).length) await db.shot.update({ where: { id: shot.id }, data: patch });
  }

  // Sound design for the motion panels (timed against shot duration)
  const cueDefs: Array<{ number: number; cues: Array<{ kind: string; label: string; startMs: number; durationMs: number; volume: number }> }> = [
    {
      number: 1,
      cues: [
        { kind: "AMBIENCE", label: "Storm howl over the peak", startMs: 0, durationMs: 4200, volume: 0.55 },
        { kind: "BGM", label: "Ominous strings enter", startMs: 600, durationMs: 3600, volume: 0.4 },
        { kind: "SFX", label: "Distant thunder crack", startMs: 2600, durationMs: 900, volume: 0.7 },
      ],
    },
    {
      number: 2,
      cues: [
        { kind: "AMBIENCE", label: "Rain on broken tiles", startMs: 0, durationMs: 5000, volume: 0.6 },
        { kind: "SFX", label: "Footsteps splashing", startMs: 400, durationMs: 1800, volume: 0.5 },
      ],
    },
    {
      number: 3,
      cues: [
        { kind: "SFX", label: "Rain dies unnaturally", startMs: 700, durationMs: 800, volume: 0.75 },
        { kind: "VOICE", label: "The rain... it stopped.", startMs: 1500, durationMs: 1200, volume: 0.9 },
      ],
    },
    {
      number: 4,
      cues: [
        { kind: "AMBIENCE", label: "Sub-bass dread drone", startMs: 0, durationMs: 4000, volume: 0.5 },
        { kind: "SFX", label: "Aura crawling - glassy hiss", startMs: 1800, durationMs: 1600, volume: 0.55 },
      ],
    },
    {
      number: 5,
      cues: [
        { kind: "SFX", label: "Blade shing - unsheathe", startMs: 300, durationMs: 700, volume: 0.9 },
        { kind: "SFX", label: "Azure energy coiling", startMs: 900, durationMs: 2000, volume: 0.6 },
      ],
    },
    {
      number: 6,
      cues: [
        { kind: "SFX", label: "Impact detonation", startMs: 200, durationMs: 1200, volume: 1.0 },
        { kind: "SFX", label: "Debris scatter", startMs: 1100, durationMs: 1400, volume: 0.65 },
        { kind: "BGM", label: "Percussion hit", startMs: 200, durationMs: 1000, volume: 0.6 },
      ],
    },
  ];
  for (const def of cueDefs) {
    const shot = scene12.shots.find((s) => s.number === def.number);
    if (!shot) continue;
    const existing = await db.audioCue.count({ where: { shotId: shot.id } });
    if (existing > 0) continue;
    for (const cue of def.cues) {
      await db.audioCue.create({ data: { shotId: shot.id, ...cue } });
    }
  }

  // One authored dialogue line so the VO cue pairs with a bubble
  const shot3 = scene12.shots.find((s) => s.number === 3);
  if (shot3 && !shot3.dialogue) {
    await db.shot.update({
      where: { id: shot3.id },
      data: { dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The rain... it stopped.", kind: "THOUGHT" }]) },
    });
  }
}
