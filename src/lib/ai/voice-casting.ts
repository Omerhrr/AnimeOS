import { db } from "@/lib/db";
import { classifyStateDelivery, type DeliveryId } from "@/lib/comic/delivery";
import { defaultVoiceFor, isVoiceId } from "@/lib/comic/voice-catalog";

// ─────────────────────────────────────────────────────────────
// VOICE CASTING + STATE-AWARE PERFORMANCE (server side)
//
// One module owns the four lookups every voice take needs:
//  1. WHO speaks: the character's cast artist (per-artist voice
//     casting) supplies the TTS voice, falling back to the
//     deterministic speaker hash.
//  2. HOW the line is played: the speaker's episode-resolved
//     character state classifies into a delivery profile.
//  3. WHO they sound like WHILE in that state: a state can carry a
//     voice VARIANT (a different TTS voice id), so possession,
//     transformation, clone or corrupted beats perform with a
//     different voice entirely - casting beyond delivery registers.
//  4. HOW the variant PERFORMS: a state can carry speed/pitch hints
//     that bend the take's pace and voice depth while it is
//     effective, so a possessed read can be slower and deeper
//     without anyone re-pinning a delivery register.
// The render API, the direction diff and the DSH voice tools share
// this module so all of them always agree on casting, delivery and
// variants.
// ─────────────────────────────────────────────────────────────

export interface ResolvedDelivery {
  id: DeliveryId;
  source: "auto" | "manual" | "direction" | "line";
  stateLabel: string | null; // character state the delivery came from
}

export interface ResolvedCast {
  voiceId: string;
  artistName: string | null; // cast artist when the take came from a voice casting
  source: "cast" | "auto" | "manual";
}

/** A state-bound voice swap: while the state is effective, lines use this voice. */
export interface ResolvedVariant {
  voiceId: string;
  stateLabel: string; // the state that supplies the variant voice
}

/** State-bound performance hints: pace and pitch bend while effective. */
export interface ResolvedHints {
  stateLabel: string; // the state that supplies the hints
  speed: number | null; // multiplier on the take's base speed
  pitch: number | null; // playback pitch factor (<1 deeper, >1 higher)
}

interface StateCandidate {
  label: string;
  stateType: string;
  episodeNumber: number | null;
  voiceVariant: string | null;
  speedHint: number | null;
  pitchHint: number | null;
}

/** The delivery, variant and hints a speaker's episode-resolved state performance implies. */
export interface ResolvedPerformance {
  delivery: ResolvedDelivery;
  variant: ResolvedVariant | null;
  hints: ResolvedHints | null;
}

function clampHint(v: number | null, lo: number, hi: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.min(hi, Math.max(lo, Math.round(v * 100) / 100));
}

/**
 * Resolve the speaker's candidate states for this shot's episode:
 * same-episode TEMPORARY states (dramatic beats like "Battle-damaged
 * (temple fight)") win over the latest PERMANENT progression state.
 */
function candidateStates(states: StateCandidate[], episodeNumber: number | null): StateCandidate[] {
  const eligible = states.filter((s) => {
    if (s.episodeNumber == null) return false;
    if (s.stateType === "TEMPORARY") return s.episodeNumber === episodeNumber;
    return episodeNumber == null || s.episodeNumber <= episodeNumber;
  });
  // temporary beats first, then the latest episode-resolved state
  return eligible.sort((a, b) => {
    const ta = a.stateType === "TEMPORARY" ? 1 : 0;
    const tb = b.stateType === "TEMPORARY" ? 1 : 0;
    if (ta !== tb) return tb - ta;
    return (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1);
  });
}

/**
 * Best state matching a per-line override (exact > prefix > contains,
 * case-insensitive). A deliberate line-level override ignores episode
 * eligibility: the director wants THIS beat even if the state's
 * episode timing does not line up. null when nothing matches.
 */
function matchStateOverride(states: StateCandidate[], override: string): StateCandidate | null {
  const want = override.trim().toLowerCase();
  if (!want) return null;
  let best: { state: StateCandidate; score: number } | null = null;
  for (const state of states) {
    const label = state.label.trim().toLowerCase();
    const score = label === want ? 3 : label.startsWith(want) ? 2 : label.includes(want) ? 1 : 0;
    if (score > 0 && (!best || score > best.score)) best = { state, score };
  }
  return best ? best.state : null;
}

/**
 * One pass over the speaker's states: the first classifiable state
 * sets the delivery, the first state carrying a voiceVariant sets the
 * variant voice. Both are independent: a state can swap the voice
 * without pinning a register, and a register can come from a state
 * that has no variant.
 *
 * `stateOverride` forces ONE of the speaker's states to perform the
 * line (per-line direction from the dialogue editor): variant voice,
 * hints and the state-classified delivery all come from it. When no
 * state matches the override the resolution falls back to auto.
 */
export async function resolveStatePerformance(
  speaker: string,
  episodeNumber: number | null,
  projectId: string,
  stateOverride?: string | null,
): Promise<ResolvedPerformance> {
  const fallback: ResolvedPerformance = {
    delivery: { id: "NEUTRAL", source: "auto", stateLabel: null },
    variant: null,
    hints: null,
  };
  if (!speaker) return fallback;
  try {
    const characters = await db.character.findMany({
      where: { projectId },
      include: { states: { select: { label: true, stateType: true, episodeNumber: true, voiceVariant: true, speedHint: true, pitchHint: true } } },
    });
    const character = characters.find((c) => c.name.trim().toLowerCase() === speaker.toLowerCase());
    if (!character) return fallback;

    const allStates = character.states as StateCandidate[];
    const forced = stateOverride ? matchStateOverride(allStates, stateOverride) : null;
    const candidates = forced ? [forced] : candidateStates(allStates, episodeNumber);

    let delivery: ResolvedDelivery | null = null;
    for (const state of candidates) {
      const hit = classifyStateDelivery(state.label);
      if (hit) {
        delivery = { id: hit, source: "auto", stateLabel: state.label };
        break;
      }
    }
    if (!delivery) {
      // no classified state: fall back to the canonical condition summary
      const canonical = classifyStateDelivery(character.canonicalState ?? "");
      if (canonical) {
        delivery = { id: canonical, source: "auto", stateLabel: character.canonicalState?.slice(0, 80) ?? null };
      }
    }

    let variant: ResolvedVariant | null = null;
    for (const state of candidates) {
      if (state.voiceVariant && isVoiceId(state.voiceVariant)) {
        variant = { voiceId: state.voiceVariant, stateLabel: state.label };
        break;
      }
    }

    // hints ride the same states: the first candidate carrying a speed
    // or pitch hint supplies the performance bend for this line
    let hints: ResolvedHints | null = null;
    for (const state of candidates) {
      if (state.speedHint != null || state.pitchHint != null) {
        hints = {
          stateLabel: state.label,
          speed: clampHint(state.speedHint, 0.5, 2),
          pitch: clampHint(state.pitchHint, 0.5, 2),
        };
        break;
      }
    }

    return { delivery: delivery ?? fallback.delivery, variant, hints };
  } catch {
    return fallback;
  }
}

/**
 * Resolve the speaker's state-derived delivery for this shot's
 * episode. Kept for the DSH direction tool; take planning uses
 * resolveStatePerformance so delivery and variant share one lookup.
 */
export async function resolveAutoDelivery(
  speaker: string,
  episodeNumber: number | null,
  projectId: string,
): Promise<ResolvedDelivery> {
  return (await resolveStatePerformance(speaker, episodeNumber, projectId)).delivery;
}

/**
 * Per-artist voice casting: resolve the TTS voice a speaker's lines
 * are performed with. Priority: explicit voice argument > the cast
 * artist attached to the character > deterministic hash default.
 */
export async function resolveVoiceCast(
  speaker: string,
  projectId: string,
  explicitVoice?: unknown,
): Promise<ResolvedCast> {
  if (isVoiceId(explicitVoice)) {
    return { voiceId: explicitVoice, artistName: null, source: "manual" };
  }
  if (speaker) {
    try {
      const character = await db.character.findFirst({
        where: { projectId, name: speaker },
        include: { voiceArtist: true },
      });
      const artist = character?.voiceArtist;
      if (artist?.voiceId && isVoiceId(artist.voiceId)) {
        return { voiceId: artist.voiceId, artistName: artist.name, source: "cast" };
      }
      if (artist && !artist.voiceId) {
        // cast exists but the artist has no voice yet: use their hash default
        return { voiceId: defaultVoiceFor(speaker), artistName: artist.name, source: "cast" };
      }
    } catch {
      // fall through to deterministic casting
    }
  }
  return { voiceId: defaultVoiceFor(speaker || "narrator"), artistName: null, source: "auto" };
}
