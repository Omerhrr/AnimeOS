import { db } from "@/lib/db";
import { classifyStateDelivery, type DeliveryId } from "@/lib/comic/delivery";
import { defaultVoiceFor, isVoiceId } from "@/lib/comic/voice-catalog";

// ─────────────────────────────────────────────────────────────
// VOICE CASTING + STATE-AWARE DELIVERY (server side)
//
// One module owns the two lookups every voice take needs:
//  1. WHO speaks: the character's cast artist (per-artist voice
//     casting) supplies the TTS voice, falling back to the
//     deterministic speaker hash.
//  2. HOW the line is played: the speaker's episode-resolved
//     character state classifies into a delivery profile.
// The render API and the DSH voice-direction tool share this module
// so both always agree on casting and delivery.
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

/**
 * Resolve the speaker's current state for this shot's episode and
 * classify it into a delivery profile. Same-episode TEMPORARY states
 * (dramatic beats like "Battle-damaged (temple fight)") win over the
 * latest PERMANENT progression state; no match reads neutral.
 */
export async function resolveAutoDelivery(
  speaker: string,
  episodeNumber: number | null,
  projectId: string,
): Promise<ResolvedDelivery> {
  const fallback: ResolvedDelivery = { id: "NEUTRAL", source: "auto", stateLabel: null };
  if (!speaker) return fallback;
  try {
    const characters = await db.character.findMany({
      where: { projectId },
      include: { states: true },
    });
    const character = characters.find((c) => c.name.trim().toLowerCase() === speaker.toLowerCase());
    if (!character) return fallback;

    const candidates = character.states.filter((s) => {
      if (s.episodeNumber == null) return false;
      if (s.stateType === "TEMPORARY") return s.episodeNumber === episodeNumber;
      return episodeNumber == null || s.episodeNumber <= episodeNumber;
    });
    // temporary beats first, then the latest episode-resolved state
    candidates.sort((a, b) => {
      const ta = a.stateType === "TEMPORARY" ? 1 : 0;
      const tb = b.stateType === "TEMPORARY" ? 1 : 0;
      if (ta !== tb) return tb - ta;
      return (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1);
    });

    for (const state of candidates) {
      const hit = classifyStateDelivery(state.label);
      if (hit) return { id: hit, source: "auto", stateLabel: state.label };
    }
    // no classified state: fall back to the canonical condition summary
    const canonical = classifyStateDelivery(character.canonicalState ?? "");
    if (canonical) return { id: canonical, source: "auto", stateLabel: character.canonicalState?.slice(0, 80) ?? null };
    return fallback;
  } catch {
    return fallback;
  }
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
