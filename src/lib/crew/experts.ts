// ─────────────────────────────────────────────────────────────
// THE EXPERT CREW (iteration 117) - the studio's standing benches.
//
// The question that named this module: anime and donghua are made by
// ARTISTS - the designer, the sculptor, the choreographer, the
// colorist - so why not agent experts per craft, each with full
// knowledge of the field, that DSH delegates to?
//
// The answer is YES, with one law the studio earned in a hundred
// iterations: AN AGENT IS THE EYE AND THE PEN, NEVER THE HAND.
// An expert agent that drives Blender frame by frame is
// non-deterministic, unauditable and ruinously expensive. So each
// expert owns its craft as LAWS (deterministic compilers and passes
// that produce the pixels - bit-exact, auditable, free at render
// time) and as JUDGE RUBRICS (the vision readings that name which
// law moved wrong). The agent's knowledge lives in the REPO - the
// skill brief below, the law library, the anchor sheets, the ledger
// - never in model memory; agents are stateless, the studio
// remembers.
//
// A bench is STANDING when its craft has real laws in the repo it
// can be held to; PLANNED when the bench is named but its first law
// has not landed. This module is the honest roster: every STANDING
// bench names the laws that make it real.
// ─────────────────────────────────────────────────────────────

export interface ExpertBench {
  /** Stable id - the crew ledger keys on this. */
  id: string;
  /** The bench title, as the studio says it. */
  title: string;
  /** The craft this expert owns (one sentence). */
  craft: string;
  /** The skill brief - the domain knowledge the expert carries.
   * This is the seed of the expert's future agent prompt: what a
   * master of this craft knows that the laws must encode. */
  skill: string;
  /** The laws the expert owns, BY NAME - each must exist in the repo
   * (the file/module named) for the bench to claim STANDING. */
  owns: string[];
  /** The judge rubric - what this expert reads the pixels FOR. */
  judge: string;
  /** STANDING = real laws in the repo; PLANNED = named, awaiting its
   * first law. An honest roster never inflates. */
  status: "STANDING" | "PLANNED";
  /** The Blender built-in addons this bench owns (the forge catalog
   * keys, iteration 118). Access is not license: a use must earn its
   * keep through a night as a law before the bench claims it. */
  addons?: string[];
}

export const EXPERT_BENCHES: ExpertBench[] = [
  {
    id: "character-designer",
    title: "THE CHARACTER DESIGNER",
    craft: "Turns a model sheet into a built, judged, tuned 3D character.",
    skill: "Reads a sheet like a character designer: proportions, face shape, eye shape and color as exact hex, hairstyle and bangs, garment class (hanfu/tunic/fitted), sleeves, collar, sash - and knows which spec field moves which aspect of the build.",
    owns: [
      "the design crew (SHEET READER -> BUILDER -> JUDGE -> TUNER, src/lib/design/character-crew.ts)",
      "the design spec law (src/lib/design/character-spec.ts)",
      "the anime character generator (bridges/blender/anime_character.py + anime_turnaround.py)",
    ],
    judge: "turnaround vs canonical sheet, per aspect (face/eyes/hair/outfit/palette/silhouette/style), issues that NAME the spec field to move",
    addons: ["io_scene_fbx", "io_scene_gltf2", "io_mesh_uv_layout"],
    status: "STANDING",
  },
  {
    id: "choreographer",
    title: "THE ACTION CHOREOGRAPHER",
    craft: "Compiles a shot's directed action words into the performance its beats perform.",
    skill: "Stages a fight like a wuxia stunt choreographer: the tell before the strike, the clash that lands ON its sound cue, the lock, the reaction the body owes the violence, the debris the world owes the impact - phrased as grammar beats (LUNGE->SLASH->STANCE), fx (BURST at the impact, TRAIL on the blade) and physics (DEBRIS, REACTION), timed to the shot's own audio cues.",
    owns: [
      "the action compiler (src/lib/crew/action-choreographer.ts, iteration 117)",
    ],
    judge: "does the clip PERFORM its directed action - a clash reads as a clash (poses cut, the burst lands where the cut lands, debris scatters on its cue), never two statues standing apart",
    addons: ["pose_library", "io_anim_bvh"],
    status: "STANDING",
  },
  {
    id: "cinematographer",
    title: "THE CINEMATOGRAPHER",
    craft: "Owns the lens: framing, blocking, camera placement and depth.",
    skill: "Blocks a scene like a director of photography: the two-shot blocks BOTH figures (lens-perpendicular through the hero, both in profile), the framing solves from the union of the subjects, tight framings keep the stand-off, the DOF tracks the face, the 28mm wide reads the arena.",
    owns: [
      "the blocking law - standoff_placement, THE TWO-SHOT BLOCKS BOTH (bridges/blender/animeos_bridge.py, iteration 116)",
      "the pair framing law - THE PAIR IS THE SUBJECT (_Framing pair-width solve, iteration 116)",
      "the DOF face-track law (iteration 114)",
      "the tight-framing stand-off (iteration 113)",
    ],
    judge: "does the frame read - both subjects present and placed, the sightline honest, the close-up's face level and tracked",
    addons: ["viewport_vr_preview"],
    status: "STANDING",
  },
  {
    id: "colorist",
    title: "THE COLORIST",
    craft: "Owns color truth: the sheet's palette is law over every build.",
    skill: "Extracts a palette like a colorist: value-stratified (every luminance class owning >=5% of the sheet gets its own dominant cluster, dark first - the dark regions the old extractor was blind to), then pulls the build toward the sheet's clusters with a bounded, skip-earns-its-skip conformance (a near distance that is mostly value drift PULLS, it does not skip).",
    owns: [
      "the sheet palette extractor (src/lib/blender/sheet-palette.ts, value-stratified per iteration 116)",
      "the sheet conformance pull (planSheetConformance, bounded by build adherence)",
    ],
    judge: "does the render wear its sheet's colors - per row (robe/accent/hair/boots), honestly true beats skipped, REFUSED never silently forgiven",
    status: "STANDING",
  },
  {
    id: "art-director",
    title: "THE ART DIRECTOR",
    craft: "Owns the style law: the frame reads as donghua cel, every shot, every light.",
    skill: "Holds the style bar: banded toon shading with the ink edge, the inverted hull that survives the night scene, palette washes at establishing scale, the moon-tinted rim that draws a dark figure against a dark wall.",
    owns: [
      "the toon pass - banded cel shading (bridges/blender/toon_pass.py)",
      "the inverted-hull ink law (ANIMEOS_INK=hull, iteration 110)",
      "the stand-off rim law - THE STAND-OFF READS (StandoffRim, iteration 116)",
    ],
    judge: "does every frame read as the show's style - bands, edges, wash, rim - at wide as much as at closeup",
    addons: ["cycles", "node_wrangler", "bl_pkg", "hydra_storm"],
    status: "STANDING",
  },
  {
    id: "sculptor",
    title: "THE SCULPTOR",
    craft: "Owns the body: anatomy, proportion and the read of the figure.",
    skill: "Reads a figure like a sculptor: the mannequin's anatomy (the shoulder line, the hip mass, the limb rhythm), what reads at distance vs at 0.5m, where a silhouette lies about a limb.",
    owns: [
      "the sculpt pass + retopo flows (bridges/blender sculpt specs, src/lib/blender/sculpt.ts)",
      "the mannequin body-read laws (iterations 104-108)",
    ],
    judge: "does the body read TRUE - anatomy first, then style; no dead limbs, no lying silhouettes",
    addons: ["rigify"],
    status: "STANDING",
  },
  {
    id: "groomer",
    title: "THE GROOMER",
    craft: "Owns hair and cloth as secondary motion that answers the beats.",
    skill: "Grooms like an animation groomer: the strand silhouettes that survive the lens, the springs that drag and whip with the pose velocity, the solver calls (the wind per beat, the cloth/flesh answers per shot).",
    owns: [
      "the groom law v1 + strand builder (bridges/blender groom specs)",
      "the secondary motion rig - damped springs on the beat clock (iterations 54-70)",
    ],
    judge: "does the hair and cloth ANSWER the action - follow-through on the cut, whip on the fast frame, stillness honest on the hold",
    status: "STANDING",
  },
  {
    id: "lighter",
    title: "THE LIGHTER",
    craft: "Owns light: the key, the rim, the storm, the emission.",
    skill: "Lights like a donghua lighter: the face key at eye level, the rim that separates dark-on-dark, the storm strobe on its windows, the blade emission that carries the energy glow with the swing.",
    owns: [
      "the face key light law (iteration 114)",
      "the lightning strobe windows (bridges/blender/animeos_bridge.py lightning_windows)",
      "the set-stage lights (SET_STAGE_BY_SHOT, iteration 114)",
    ],
    judge: "does the light serve the read - faces keyed, dark figures separated, spectacle lit where the cut lands",
    status: "STANDING",
  },
  {
    id: "storyteller",
    title: "THE STORYTELLER",
    craft: "Owns the arc: why the scene turns, which beat carries the turn.",
    skill: "Reads a scene like a story editor: the register of each beat (BATTLE/PURSUIT/REVEAL/STANDOFF/RITUAL/INTRIGUE/RESOLVE), where the turning point lands, which shot carries it, what the audience must know and feel by the cut.",
    owns: [], // the first storyteller law has not landed yet
    judge: "does the cut sequence land the scene's turn - the arc registers flow, no beat idles",
    addons: ["io_curve_svg", "ui_translate"],
    status: "PLANNED",
  },
];

export function expertBench(id: string): ExpertBench | null {
  return EXPERT_BENCHES.find((b) => b.id === id) ?? null;
}

export function standingBenches(): ExpertBench[] {
  return EXPERT_BENCHES.filter((b) => b.status === "STANDING");
}

/** The context line DSH reads before it delegates: the studio's
 * standing crew, named, with the craft each owns. */
export function expertCrewContextLine(): string | null {
  const parts = EXPERT_BENCHES.map((b) =>
    b.status === "STANDING" ? `${b.title} (${b.craft})` : `${b.title} - bench named, first law pending`,
  );
  return `expert crew: ${parts.join(" | ")}`;
}

// ─────────────────────────────────────────────────────────────
// THE BLENDER FORGE (iteration 118) - the full toolbox, by bench.
//
// The studio's directive: DSH and the crew get access to ALL of
// Blender's built-in addons. The registry law lives in
// bridges/blender/animeos_addons.py (every worker session enables
// every bundled addon, policy ANIMEOS_ADDONS); this catalog is the
// CREW's side of the same law: which bench owns which tool and what
// it is FOR here. The Python side is runtime truth (what actually
// opened for this render, riding the job state); this is roster
// truth. They must never disagree on names.
//
// THE LAW THAT KEEPS: access is not license. Enabling a tool grants
// the TOOL; the pixels still come only from laws that earned their
// keep through a night. A bench that wants to USE its tool lands a
// deterministic pass the night can judge - the eye-and-pen rule
// holds at every bench.
// ─────────────────────────────────────────────────────────────

export interface ForgeAddon {
  /** The Blender module name - mirrors the Python FORGE_CATALOG. */
  module: string;
  title: string;
  bench: string;
  use: string;
  /** core = always loaded by Blender (scripts/addons_core, e.g.
   * rigify); addon = enabled via the addon registry. */
  kind: "addon" | "core";
}

export const BLENDER_FORGE: ForgeAddon[] = [
  { module: "cycles", title: "Cycles Render Engine", bench: "art-director", use: "the render engine every clip rides (banded toon + ink)", kind: "addon" },
  { module: "rigify", title: "Rigify", bench: "sculptor", use: "full feature rigs (human metarig, limbs, face) - the door to production-grade character rigging beyond the mannequin's custom rig", kind: "core" },
  { module: "pose_library", title: "Pose Library", bench: "choreographer", use: "the canonical grammar poses persist as Blender Pose Assets (public/pose-library/animeos_poses_v1.blend) - a shared vocabulary every shot links", kind: "addon" },
  { module: "node_wrangler", title: "Node Wrangler", bench: "art-director", use: "shader-node craft shortcuts - the look-dev bench's editor side (GUI sessions, inert headless)", kind: "addon" },
  { module: "io_anim_bvh", title: "BVH format", bench: "choreographer", use: "motion-capture import - the choreography bench's door to real mocap drives", kind: "addon" },
  { module: "io_scene_fbx", title: "FBX format", bench: "character-designer", use: "the designed character exchanges with external DCCs/engines", kind: "addon" },
  { module: "io_scene_gltf2", title: "glTF 2.0 format", bench: "character-designer", use: "the web-native asset door - GLB exports for studio viewers", kind: "addon" },
  { module: "io_mesh_uv_layout", title: "UV Layout", bench: "character-designer", use: "UV export for painted maps (decals, embroidery)", kind: "addon" },
  { module: "io_curve_svg", title: "SVG Import", bench: "storyteller", use: "vector art (logos, title calligraphy, shot graphics) lands as curves", kind: "addon" },
  { module: "bl_pkg", title: "Extensions Repository", bench: "art-director", use: "the extension manager - the provisioner's door to installing community extensions on demand", kind: "addon" },
  { module: "hydra_storm", title: "Hydra Storm", bench: "art-director", use: "USD/Hydra render-delegate door for external pipeline interchange", kind: "addon" },
  { module: "ui_translate", title: "Interface Translation", bench: "storyteller", use: "localized Blender UI for multinational artist sessions", kind: "addon" },
  { module: "viewport_vr_preview", title: "VR Preview", bench: "cinematographer", use: "VR framing reviews (GUI sessions, inert headless) - recorded honestly as enabled-but-idle in background runs", kind: "addon" },
];

/** The forge line DSH reads: the full toolbox is open, by bench. */
export function forgeContextLine(): string {
  const byBench = new Map<string, string[]>();
  for (const a of BLENDER_FORGE) {
    const arr = byBench.get(a.bench) ?? [];
    arr.push(a.module);
    byBench.set(a.bench, arr);
  }
  const parts = [...byBench.entries()].map(([bench, mods]) => `${bench}: ${mods.join(",")}`);
  return `blender forge (${BLENDER_FORGE.length} built-ins open, access for every bench): ${parts.join(" | ")}`;
}
