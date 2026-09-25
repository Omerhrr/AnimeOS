// ─────────────────────────────────────────────────────────────
// DESIGN DNA (the design pass)
//
// The studio's DESIGN data (painted model sheets, appearance notes,
// wardrobe, weapon descriptions, environment briefs) lives in the
// DB - but until now it only fed the 2D panel-art path. The 3D path
// (Blender worker, browser preview) rendered anonymous stand-ins:
// a box figure on a flat plate with sphere rocks, and the preview a
// hardcoded scene. This module closes that gap: it compiles the
// same design text every other consumer uses into a small
// JSON-serializable DNA structure both 3D consumers render from.
//
// Pure and deterministic: the same text always compiles to the same
// DNA, so a shot's 3D output is reproducible and the Blender worker
// and the browser preview agree on colors and shapes for free.
// ─────────────────────────────────────────────────────────────

export type HairStyle = "topknot" | "ponytail" | "braid" | "long" | "short";
export type WeaponType = "sword" | "staff" | "spear" | "none";
export type Build = "lean" | "sturdy" | "heavy";

export interface CharacterDesignDna {
  name: string;
  hairColor: string; // hex
  hairStyle: HairStyle;
  robeColor: string; // hex
  robeAccent: string; // hex (sash, ribbon, trim)
  skinTone: string; // hex
  weaponType: WeaponType;
  bladeColor: string; // hex emissive (weapon energy / spirit glow)
  build: Build;
  /** The design text the DNA was compiled from (audit trail). */
  source: string;
}

export type TerrainKind = "terrace" | "peak" | "forest" | "gorge" | "temple";
export type TimeOfDay = "night" | "dawn" | "dusk" | "day";
export type Weather = "storm" | "rain" | "mist" | "snow" | "clear";

export interface EnvironmentDesignDna {
  name: string;
  terrain: TerrainKind;
  timeOfDay: TimeOfDay;
  weather: Weather;
  skyColor: string; // hex
  fogColor: string; // hex
  groundColor: string; // hex
  keyLight: string; // hex (sun/moon key light color)
  features: string[]; // moons | pagoda | bell | banners | pillars | waterfall | stream | bamboo | cloudsea | altar | columns | lanterns
  source: string;
}

// ─── text → color resolution (first match wins) ─────────────

const HAIR_COLOR_WORDS: Array<[RegExp, string]> = [
  [/iron[- ]?grey|iron[- ]?gray/, "#6b7280"],
  [/\bsteel[- ]?grey\b/, "#7a8494"],
  [/\bsilver\b/, "#c3c9d4"],
  [/\bwhite\b/, "#dfe4ec"],
  [/\bblonde\b|\bgold(en)?\b/, "#c9a227"],
  [/auburn|chestnut|\bbrown\b/, "#5a3a24"],
  [/\bazure\b|\bblue\b/, "#3a8fa8"],
  [/\bjade\b|\bgreen\b/, "#3f8f7a"],
  [/crimson|\bred\b/, "#8e2f3c"],
  [/\bviolet\b|purple/, "#6d5aa8"],
  [/\bgrey\b|\bgray\b/, "#6b7280"],
  [/\bblack\b|\braven\b|\bink\b/, "#16161d"],
];

const ROBE_COLORS: Array<[RegExp, string]> = [
  [/jade[- ]?teal|jade[- ]?green|jade robes?/, "#2f6d63"],
  [/storm[- ]?grey|storm[- ]?gray|\bgrey\b robes?|\bgray\b robes?/, "#4a5560"],
  [/\bwhite\b robes?|moon[- ]?white/, "#d9dce1"],
  [/\bblack\b robes?|ink[- ]?dark|shadow[- ]?dark|\bblack\b/, "#1a1b21"],
  [/\bazure\b/, "#2e6f9e"],
  [/\bcrimson\b|\bscarlet\b|\bred\b/, "#8e2f3c"],
  [/\bviolet\b|\bpurple\b/, "#5b4a8f"],
  [/\bgold(en)?\b/, "#a8842c"],
  [/\bjade\b|teal/, "#2f6d63"],
  [/\bgrey\b|\bgray\b/, "#4a5560"],
];

const ACCENT_COLORS: Array<[RegExp, string]> = [
  [/jade (?:ribbon|cord|sash)|jade trim/, "#3f8f7a"],
  [/storm[- ]?grey sash|grey sash|gray sash/, "#39424d"],
  [/\bgold(en)?\b (?:sash|trim|cord|embroid)/, "#a8842c"],
  [/\bcrimson\b (?:sash|trim|cord)/, "#8e2f3c"],
  [/\bscarlet\b (?:sash|trim)/, "#8e2f3c"],
  [/\bviolet\b (?:sash|trim)/, "#5b4a8f"],
  [/\bsilver\b (?:sash|trim|cord)/, "#aab2c0"],
];

const SKIN_TONES: Array<[RegExp, string]> = [
  [/\bpale\b|\bfair\b/, "#e6c8a8"],
  [/\btan\b|\bsun[- ]?weathered\b/, "#b98a62"],
  [/\bdark\b skin|deep[- ]?bronze/, "#8a5f42"],
];

const BLADE_COLORS: Array<[RegExp, string]> = [
  [/\bcyan\b/, "#5eead4"],
  [/\bazure\b (?:energy|glow|light|spirit|blade)|azure/, "#6db8ff"],
  [/\bcrimson\b (?:energy|glow|blade)|crimson/, "#ff5e6d"],
  [/\bviolet\b (?:energy|glow|blade)|violet/, "#b28aff"],
  [/\bgold(en)?\b (?:energy|glow|blade)/, "#ffd166"],
  [/\bjade\b (?:energy|glow|blade|light)|jade/, "#4ade80"],
  [/spirit[- ]?water|moonlight/, "#9fd8e8"],
];

// ─── character DNA ───────────────────────────────────────────

export interface CharacterDesignInput {
  name: string;
  role?: string | null;
  appearance?: string | null; // JSON or free text
  modelSheetPrompt?: string | null; // the canonical visual anchor
  stateClothing?: string | null;
  stateWeapon?: string | null;
}

function firstMatch(text: string, table: Array<[RegExp, string]>, fallback: string): string {
  for (const [re, hex] of table) {
    if (re.test(text)) return hex;
  }
  return fallback;
}

function appearanceText(input: CharacterDesignInput): string {
  // The canonical anchor wins (it is what the painted sheet locked in);
  // appearance notes and the active state carry the rest.
  return [
    input.modelSheetPrompt?.trim() || null,
    input.appearance?.trim() || null,
    input.stateClothing?.trim() || null,
    input.stateWeapon?.trim() || null,
  ]
    .filter(Boolean)
    .join(" . ");
}

function hairStyleOf(text: string): HairStyle {
  if (/topknot|top knot|bun\b/.test(text)) return "topknot";
  if (/ponytail|pony tail/.test(text)) return "ponytail";
  if (/braid|plait/.test(text)) return "braid";
  if (/long hair|flowing hair|wind[- ]?tossed|loose hair|mane/.test(text)) return "long";
  if (/short hair|cropped|shaved|buzz/.test(text)) return "short";
  // hair mentioned with length hints absent - long reads better on stylized figures
  return /\bhair\b/.test(text) ? "long" : "short";
}

const HAIR_ANCHORS = /((?:[\w'-]+[\s'-]){0,3})(?:hair|topknot|ponytail|braid|plait|mane|locks|tuft)/g;

/** Hair color only from words NEAR a hair anchor: "storm-grey eyes"
 * must never dye the hair when the anchor text says "black hair". */
function hairColorOf(text: string): string {
  for (const m of text.matchAll(HAIR_ANCHORS)) {
    const windowText = m[0];
    for (const [re, hex] of HAIR_COLOR_WORDS) {
      if (re.test(windowText)) return hex;
    }
  }
  return "#16161d";
}

function weaponTypeOf(text: string): WeaponType {
  // blade before staff: a "bamboo pipe AND a practice sword" carries
  // the sword; the staff reading is the last resort
  if (/spear|lance|polearm|halberd/.test(text)) return "spear";
  if (/blade|sword|saber|jian|katana/.test(text)) return "sword";
  if (/staff|cane|pipe\b|scepter|rod\b/.test(text)) return "staff";
  return "none";
}

function buildOf(text: string, role?: string | null): Build {
  if (/heavy|giant|hulking|massive|burly/.test(text)) return "heavy";
  if (/sturdy|broad[- ]?shouldered|muscular|powerful|elder/.test(text)) return "sturdy";
  if (/lean|slim|slender|youth|young|small/.test(text)) return "lean";
  const r = (role ?? "").toUpperCase();
  if (r === "MENTOR" || r === "ELDER") return "sturdy";
  return "lean";
}

/** Compile a character's design text into renderable DNA (pure). */
export function characterDesignDna(input: CharacterDesignInput): CharacterDesignDna {
  const text = appearanceText(input);
  const role = (input.role ?? "").toUpperCase();
  // Role-aware fallbacks keep the cast visually distinct even when
  // the design text is thin: protagonist jade-teal, mentor storm-grey,
  // antagonist dark crimson, rival violet, supporting azure.
  const fallbackRobe =
    role === "ANTAGONIST" ? "#3a2230" : role === "RIVAL" ? "#5b4a8f" : role === "MENTOR" ? "#4a5560" : role === "SUPPORTING" ? "#2e6f9e" : "#2f6d63";
  return {
    name: input.name,
    hairColor: hairColorOf(text),
    hairStyle: hairStyleOf(text),
    robeColor: firstMatch(text, ROBE_COLORS, fallbackRobe),
    robeAccent: firstMatch(text, ACCENT_COLORS, "#a8842c"),
    skinTone: firstMatch(text, SKIN_TONES, "#d9b48f"),
    weaponType: weaponTypeOf(text),
    bladeColor: firstMatch(text, BLADE_COLORS, "#5eead4"),
    build: buildOf(text, input.role),
    source: text.slice(0, 400),
  };
}

// ─── environment DNA ─────────────────────────────────────────

const TERRAIN_FEATURES: Array<[RegExp, string]> = [
  [/two moons|\bmoons\b/, "moons"],
  [/\bmoon\b(?!s)/, "moons"],
  [/pagoda/, "pagoda"],
  [/\bbell\b/, "bell"],
  [/banner/, "banners"],
  [/pillar/, "pillars"],
  [/waterfall/, "waterfall"],
  [/\bstream\b|creek|brook/, "stream"],
  [/bamboo/, "bamboo"],
  [/sea of clouds|cloud sea|clouds/, "cloudsea"],
  [/altar/, "altar"],
  [/column|colonnade/, "columns"],
  [/lantern/, "lanterns"],
];

function terrainOf(text: string): TerrainKind {
  if (/gorge|canyon|ravine|valley/.test(text)) return "gorge";
  if (/temple|shrine|hall|ruin|altar|monastery/.test(text)) return "temple";
  if (/forest|woods|grove|bamboo/.test(text)) return "forest";
  if (/terrace|platform|plaza|courtyard|stones/.test(text)) return "terrace";
  if (/peak|summit|mountain|cliff/.test(text)) return "peak";
  return "terrace";
}

function timeOfDayOf(text: string, fallback: string | null | undefined): TimeOfDay {
  if (/moonlit|night|midnight|small hours|starlit/.test(text)) return "night";
  if (/dawn|sunrise|morning|first light/.test(text)) return "dawn";
  if (/dusk|sunset|twilight|evening/.test(text)) return "dusk";
  if (/day\b|daylight|noon|afternoon|sunlit|sun-high/.test(text)) return "day";
  const f = (fallback ?? "").toLowerCase();
  if (f.includes("night")) return "night";
  if (f.includes("dawn") || f.includes("morning")) return "dawn";
  if (f.includes("dusk") || f.includes("sunset") || f.includes("twilight") || f.includes("evening")) return "dusk";
  return "day";
}

function weatherOf(text: string, fallback: string | null | undefined): Weather {
  const f = (fallback ?? "").toLowerCase();
  if (/storm|lightning|thunder/.test(text) || f.includes("storm") || f.includes("lightning") || f.includes("thunder")) return "storm";
  if (/rain|drizzle|downpour/.test(text) || f.includes("rain")) return "rain";
  if (/snow|blizzard|frost/.test(text) || f.includes("snow") || f.includes("frost")) return "snow";
  if (/mist|fog|haze/.test(text) || f.includes("mist") || f.includes("fog")) return "mist";
  return "clear";
}

// Sky / fog / ground / key light per time of day, darkened by storm.
const SKY_BY_TOD: Record<TimeOfDay, string> = {
  night: "#0b1220",
  dawn: "#7a5a48",
  dusk: "#5a3a48",
  day: "#9db8cc",
};
const FOG_BY_TOD: Record<TimeOfDay, string> = {
  night: "#0a1018",
  dawn: "#8a6a52",
  dusk: "#4a3040",
  day: "#a8bccb",
};
const GROUND_BY_TOD: Record<TimeOfDay, string> = {
  night: "#16211d",
  dawn: "#3a3630",
  dusk: "#2c2830",
  day: "#3d4a41",
};
const KEY_BY_TOD: Record<TimeOfDay, string> = {
  night: "#cfe0ee",
  dawn: "#e8b98a",
  dusk: "#e0906a",
  day: "#f2ede2",
};

function shade(hex: string, k: number): string {
  // k < 1 darkens, k > 1 lightens (clamped)
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export interface EnvironmentDesignInput {
  name: string;
  description?: string | null;
  atmosphere?: string | null; // JSON string[] or free text
  timeOfDay?: string | null; // environment-level default
  weather?: string | null;
  sceneTimeOfDay?: string | null; // scene-level override
  sceneWeather?: string | null;
}

/** Compile an environment's design text into renderable DNA (pure). */
export function environmentDna(input: EnvironmentDesignInput): EnvironmentDesignDna {
  const text = [input.name ?? "", input.description ?? "", input.atmosphere ?? ""].filter(Boolean).join(" . ");
  const tod = timeOfDayOf(text, input.sceneTimeOfDay ?? input.timeOfDay);
  const weather = weatherOf(text, input.sceneWeather ?? input.weather);
  const stormK = weather === "storm" ? 0.62 : weather === "rain" ? 0.74 : weather === "snow" ? 1.08 : 1.0;
  const features: string[] = [];
  for (const [re, f] of TERRAIN_FEATURES) {
    if (re.test(text) && !features.includes(f)) features.push(f);
  }
  return {
    name: input.name,
    terrain: terrainOf(text),
    timeOfDay: tod,
    weather,
    skyColor: shade(SKY_BY_TOD[tod], stormK),
    fogColor: shade(FOG_BY_TOD[tod], stormK),
    groundColor: shade(GROUND_BY_TOD[tod], stormK),
    keyLight: KEY_BY_TOD[tod],
    features,
    source: text.slice(0, 400),
  };
}
