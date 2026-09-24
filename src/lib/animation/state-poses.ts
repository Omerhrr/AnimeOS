// ─────────────────────────────────────────────────────────────
// PER-STATE POSE PRESETS (development state changes HOW a pose is
// performed)
//
// A character's development state is more than wardrobe and voice -
// it is also body language. Each state can carry a pose pair (from
// the shot pose vocabulary) that becomes the DEFAULT motion program
// for any shot featuring that character while the state is
// episode-effective:
//
//   - DSH create_character_state auto-resolves a preset from the
//     state's label and reports it.
//   - The casting board (characters view) can set or clear the pair
//     per state, or re-apply the library preset.
//   - The shots API applyStatePoses action + the panel inspector's
//     "Use state poses" button land the preset on a shot in one step.
//   - The MOTION/BLENDER/IMG2VID drivers then perform the pair.
//
// Everything here is pure and dependency-light (poses.ts only) so
// client components and server routes share one library.
// ─────────────────────────────────────────────────────────────

import { POSE_GLOSS, normalizePose } from "@/lib/animation/poses";

export interface StatePosePreset {
  poseStart: string;
  poseEnd: string;
  note: string; // why the state performs this way
}

/** Curated state-label keywords -> pose pair, first hit wins. */
export const STATE_POSE_PRESETS: Array<{ keys: string[]; preset: StatePosePreset }> = [
  { keys: ["CALM", "SERENE", "PEACEFUL", "COLLECTED", "COMPOSED"], preset: { poseStart: "STANCE", poseEnd: "STANCE", note: "calm holds a ready stance with living breath" } },
  { keys: ["MEDITAT", "TRANSCEND"], preset: { poseStart: "STANCE", poseEnd: "CAST", note: "meditation gathers into channeling" } },
  { keys: ["ANGRY", "ENRAGED", "FURIOUS", "RAGE", "WRATH", "SEETHING"], preset: { poseStart: "STANCE", poseEnd: "LUNGE", note: "anger coils, then explodes forward" } },
  { keys: ["AGGRESS", "HOSTILE", "BELLIGERENT", "BATTLE_FURY", "BLOODLUST"], preset: { poseStart: "LUNGE", poseEnd: "SLASH", note: "aggression presses the attack" } },
  { keys: ["COMBAT", "BATTLE_READY", "FRONTLINE", "WAR_READY"], preset: { poseStart: "LUNGE", poseEnd: "SLASH", note: "committed to the strike" } },
  { keys: ["DETERMINED", "RESOLVE", "RESOLVED", "STEELY", "UNBROKEN"], preset: { poseStart: "CROUCH", poseEnd: "RISE", note: "determination rises from a loaded knee" } },
  { keys: ["GRIEV", "SORROW", "DESPAIR", "MOURN", "HEARTBROKEN"], preset: { poseStart: "STANCE", poseEnd: "CROUCH", note: "grief folds the body inward" } },
  { keys: ["BROKEN", "DEFEATED", "CRUSHED", "HOPELESS"], preset: { poseStart: "CROUCH", poseEnd: "FALL", note: "defeat collapses the frame" } },
  { keys: ["EXHAUST", "WEARY", "SPENT", "DRAINED"], preset: { poseStart: "STANCE", poseEnd: "CROUCH", note: "exhaustion sinks the stance" } },
  { keys: ["WOUNDED", "INJURED", "BLOODIED", "HURT", "MAIMED", "DAMAGED", "BATTLE_DAMAGED"], preset: { poseStart: "STANCE", poseEnd: "FALL", note: "the injury takes the legs out" } },
  { keys: ["RECOVER", "HEALING", "RALLYING", "MENDING"], preset: { poseStart: "FALL", poseEnd: "RISE", note: "recovery pushes back upright" } },
  { keys: ["TRIUMPH", "VICTOR", "EXULT", "JUBILANT", "GLORIOUS"], preset: { poseStart: "CROUCH", poseEnd: "LEAP", note: "victory launches skyward" } },
  { keys: ["JOY", "CHEER", "HAPPY", "ELATED", "DELIGHT"], preset: { poseStart: "STANCE", poseEnd: "LEAP", note: "joy leaves the ground" } },
  { keys: ["FEAR", "TERRIF", "AFRAID", "PANIC", "DREAD"], preset: { poseStart: "STANCE", poseEnd: "BLOCK", note: "fear throws up a guard" } },
  { keys: ["DEFENSIVE", "GUARDED", "ON_GUARD", "CAUTIOUS", "WARY", "BRACED"], preset: { poseStart: "STANCE", poseEnd: "BLOCK", note: "caution squares into a guard" } },
  { keys: ["STEALTH", "SNEAK", "INFILTRAT", "LURK", "HIDDEN"], preset: { poseStart: "STANCE", poseEnd: "CROUCH", note: "stealth compresses the silhouette" } },
  { keys: ["TRAVEL", "JOURNEY", "MARCH", "PATROL", "WANDER", "ROAD"], preset: { poseStart: "STANCE", poseEnd: "WALK", note: "the road sets the stride" } },
  { keys: ["IMPATIENT", "RESTLESS", "PACING"], preset: { poseStart: "WALK", poseEnd: "STANCE", note: "restlessness halts mid-stride" } },
  { keys: ["SURPRISED", "SHOCKED", "STARTLED", "ALARMED", "STUNNED"], preset: { poseStart: "STANCE", poseEnd: "CROUCH", note: "the flinch drops the center" } },
  { keys: ["COMMAND", "AUTHORIT", "REGAL", "NOBLE", "DECREE"], preset: { poseStart: "STANCE", poseEnd: "POINT", note: "authority points the call" } },
  { keys: ["RESPECT", "CEREMON", "FORMAL", "HONOR", "REVERENT"], preset: { poseStart: "STANCE", poseEnd: "BOW", note: "ceremony bows from the waist" } },
  { keys: ["APOLOGET", "REMORSE", "ASHAMED", "GUILTY", "PENITENT"], preset: { poseStart: "STANCE", poseEnd: "BOW", note: "remorse bows the head" } },
  { keys: ["CHANNEL", "EMPOWERED", "ASCEND", "AWAKEN", "OVERDRIVE", "BUFFED"], preset: { poseStart: "STANCE", poseEnd: "CAST", note: "power rises through the arms" } },
  { keys: ["CURIOUS", "SCOUT", "SEARCH", "PROBE", "INVESTIGAT"], preset: { poseStart: "STANCE", poseEnd: "POINT", note: "curiosity points past the frame" } },
];

/** Resolve the library preset for a state label (null when no keyword hits). */
export function presetPosesForStateLabel(label: unknown): StatePosePreset | null {
  const norm = String(label ?? "").toUpperCase().replace(/[^A-Z_]+/g, "_");
  if (!norm) return null;
  for (const entry of STATE_POSE_PRESETS) {
    if (entry.keys.some((k) => norm.includes(k))) return entry.preset;
  }
  return null;
}

/** Minimal state shape the resolver works on (client + server safe). */
export interface StateLike {
  episodeNumber: number | null;
  poseStart?: string | null;
  poseEnd?: string | null;
  createdAt?: Date;
}

/**
 * The character's development state active at a given episode:
 * latest state whose episodeNumber is null or <= the episode;
 * same-episode ties break on creation time (a state recorded later
 * supersedes). Shared so shot tools and UI agree with the art prompts.
 */
export function resolveActiveState<T extends StateLike>(states: T[], episodeNumber: number): T | null {
  const ts = (d: unknown) => new Date(d as string | number | Date).getTime() || 0;
  return [...states]
    .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
    .sort((a, b) =>
      (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1)
      || ts(b.createdAt) - ts(a.createdAt)
    )[0] ?? null;
}

/**
 * Pose pair a set of states contributes at an episode: the active
 * state's preset when it carries both ends; falls back to the label
 * library preset only when asked (auto flag).
 */
export function statePosePair(
  states: Array<StateLike & { label?: string }>,
  episodeNumber: number,
  auto = false
): { poseStart: string; poseEnd: string; source: string } | null {
  const active = resolveActiveState(states, episodeNumber);
  if (!active) return null;
  const start = normalizePose(active.poseStart) ?? null;
  const end = normalizePose(active.poseEnd) ?? null;
  if (start || end) {
    const chip = [start, end].filter(Boolean).join(" -> ");
    return { poseStart: start ?? "STANCE", poseEnd: end ?? "STANCE", source: `state preset (${chip})` };
  }
  if (auto) {
    const lib = presetPosesForStateLabel(active.label ?? "");
    if (lib) return { poseStart: lib.poseStart, poseEnd: lib.poseEnd, source: `library preset for "${active.label ?? "state"}"` };
  }
  return null;
}

/** Human gloss for a state's stored pair (empty when none). */
export function describeStatePoses(state: { poseStart?: string | null; poseEnd?: string | null }): string {
  const start = state.poseStart ? POSE_GLOSS[state.poseStart] ?? null : null;
  const end = state.poseEnd ? POSE_GLOSS[state.poseEnd] ?? null : null;
  if (!start && !end) return "";
  if (start && end && start !== end) return `${start} into ${end}`;
  return start ?? end ?? "";
}
