// ─────────────────────────────────────────────────────────────
// AnimeOS PAIRED PERFORMANCE LAW (iteration 119) - THE DUEL
// PERFORMS. THE HERO'S SLASH IS THE PARTNER'S BLOCK.
//
// Since 116 a two-character shot blocks BOTH figures (the stand-off,
// the pair framing) - but only the HERO performs: the partner holds
// one STANCE for the whole clip while the hero runs a keyed program
// at him. The judge's own law names the failure: "a clash reads as a
// clash, never two statues standing apart". A duel is ONE
// performance written on two bodies.
//
// The law this module keeps (the eye-and-pen rule holds - this is a
// deterministic craft law, not a model call):
//
//   1. ONE CLASH, ONE CLOCK. The partner's keys keep the hero's
//      strike moments EXACTLY (the moments the impact light and the
//      camera punch already fire on) and may only insert keys
//      BETWEEN them - both bodies answer the same beat.
//   2. THE ANSWER TABLE. What the partner's body owes each hero
//      strike pose is fixed craft knowledge: a SLASH is answered by
//      a BLOCK, a LEAP by a CROUCH, a LUNGE by a block that gives
//      ground into the fall. No LLM decides the answer at render
//      time.
//   3. THE SHAPE OF AN ANSWER. The partner opens ready, forms the
//      guard during the hero's wind-up, meets the strike ON its
//      key, holds the block through the hero's read, takes the
//      recoil the violence owes, and recovers by the last frame.
//   4. ONE CLASH, ONE LIGHT. The partner program carries no impact
//      and no smear of its own - the hero program's impact light
//      and camera punch already fire once for the clash. Two
//      flares would be a lie about one impact.
//   5. EXPLICIT DIRECTION WINS. A creator/DSH can pass their own
//      partner program (pairedChoreo on the wire); the derivation
//      only fills what direction left open.
//
// Deterministic: the same hero program always derives the same
// partner program, bit-exact - retries are stable and the unit e2e
// can check the pairing without spawning a renderer.
// ─────────────────────────────────────────────────────────────

import type { ChoreoKey, ChoreoProgram } from "./choreography";
import { POSES } from "./poses";

/** What the partner's body owes a hero pose that lands on him:
 * the guard he meets it with and the recoil the hit earns. */
export interface PairedAnswer {
  meet: string;
  recoil: string;
}

/** The answer table - the craft vocabulary of a wuxia answer.
 * Hero poses that never land on the partner answer with STANCE. */
export const PAIRED_ANSWERS: Record<string, PairedAnswer> = {
  SLASH: { meet: "BLOCK", recoil: "CROUCH" },
  LUNGE: { meet: "BLOCK", recoil: "FALL" },
  LEAP: { meet: "CROUCH", recoil: "RISE" },
  CAST: { meet: "BLOCK", recoil: "STANCE" },
  DRAW: { meet: "BLOCK", recoil: "STANCE" },
  BLOCK: { meet: "BLOCK", recoil: "STANCE" },
  POINT: { meet: "STANCE", recoil: "STANCE" },
  STANCE: { meet: "STANCE", recoil: "STANCE" },
  WALK: { meet: "STANCE", recoil: "STANCE" },
  CROUCH: { meet: "STANCE", recoil: "STANCE" },
  FALL: { meet: "STANCE", recoil: "STANCE" },
  RISE: { meet: "STANCE", recoil: "STANCE" },
  BOW: { meet: "BOW", recoil: "BOW" },
};

/** Hero poses whose arrival counts as a strike on the partner (the
 * answer table's meet pose forms for these). */
export const PAIRED_STRIKE_POSES = ["SLASH", "LUNGE", "LEAP", "CAST", "DRAW"];

export const PAIRED_PERFORMANCE_LAW_VERSION = 119;

export interface PairedPerformance {
  program: ChoreoProgram;
  /** The derivation, one line per key - the audit trail the evidence
   * carries (why the partner's body did what it did). */
  derivation: string[];
}

interface PendingRecoil {
  owed: boolean;
  pose: string;
  fromAt: number; // the strike's at - the recoil lands after the read
}

/**
 * Derive the partner's keyed program from the hero's. The hero's
 * strike moments are kept exactly; between them the partner forms
 * guards, takes the recoil and recovers. Bit-exact by construction.
 */
export function compilePairedProgram(hero: ChoreoProgram, partnerName?: string): PairedPerformance {
  const keys: ChoreoKey[] = [];
  const derivation: string[] = [];
  let recoil: PendingRecoil | null = null;

  const heroKeys = hero.keys.map((k, i) => ({
    ...k,
    pose: (POSES as readonly string[]).includes(k.pose) ? k.pose : "STANCE",
    isLast: i === hero.keys.length - 1,
  }));

  for (const k of heroKeys) {
    const answer = PAIRED_ANSWERS[k.pose] ?? { meet: "STANCE", recoil: "STANCE" };
    const meets = PAIRED_STRIKE_POSES.includes(k.pose);

    if (k.isLast) {
      // the last frame: take the recoil the last strike owed, then
      // recover (or bow out with him)
      if (recoil?.owed) {
        const mid = Math.round(((recoil.fromAt + 1) / 2) * 1000) / 1000;
        if (mid > k.at - 0.05) {
          // the clip is too tight for both beats: the recoil IS the landing
          keys.push({ at: k.at, pose: recoil.pose, kind: "anticipation" });
          derivation.push(`@${k.at} ${k.pose.toLowerCase()}:${k.kind} -> ${recoil.pose.toLowerCase()}:anticipation (takes the recoil the strike earned; the clip is too tight to recover)`);
        } else {
          keys.push({ at: mid, pose: recoil.pose, kind: "anticipation" });
          derivation.push(`@${mid} -> ${recoil.pose.toLowerCase()}:anticipation (takes the recoil the strike earned)`);
          keys.push({ at: k.at, pose: k.pose === "BOW" ? "BOW" : "STANCE", kind: "follow" });
          derivation.push(`@${k.at} -> ${k.pose === "BOW" ? "bow" : "stance"}:follow (recovers by the last frame)`);
        }
      } else {
        keys.push({ at: k.at, pose: k.pose === "BOW" ? "BOW" : "STANCE", kind: "follow" });
        derivation.push(`@${k.at} ${k.pose.toLowerCase()}:${k.kind} -> ${k.pose === "BOW" ? "bow" : "stance"}:follow (${k.pose === "BOW" ? "bows out with him" : "recovers by the last frame"})`);
      }
      recoil = null;
      continue;
    }

    if (k.at === 0) {
      // the opening: nothing ARRIVES at t=0 - the body opens READY
      // (or already guarding when the hero opens in a strike pose)
      keys.push({ at: 0, pose: meets ? answer.meet : "STANCE", kind: "hold" });
      derivation.push(`@0 -> ${meets ? answer.meet.toLowerCase() : "stance"}:hold (opens ${meets ? "guarding the " + k.pose.toLowerCase() : "ready"})`);
      continue;
    }

    if (meets && k.kind !== "follow") {
      // the strike (or its wind-up/hold) lands on the partner:
      // meet it - a hold ON the strike keeps the meet sold
      keys.push({ at: k.at, pose: answer.meet, kind: k.kind === "hold" ? "hold" : "strike" });
      derivation.push(
        `@${k.at} ${k.pose.toLowerCase()}:${k.kind} -> ${answer.meet.toLowerCase()}:${k.kind === "hold" ? "hold" : "strike"} (meets the ${k.pose.toLowerCase()})`,
      );
      if (k.kind !== "anticipation") {
        recoil = { owed: answer.recoil !== "STANCE", pose: answer.recoil, fromAt: k.at };
      }
      continue;
    }

    if (k.kind === "follow") {
      // a mid-clip settle with no strike owed: reset to the ready body
      keys.push({ at: k.at, pose: "STANCE", kind: "follow" });
      derivation.push(`@${k.at} ${k.pose.toLowerCase()}:${k.kind} -> stance:follow (resets to ready)`);
      continue;
    }

    if (k.kind === "hold" && keys.length > 0) {
      // a hold off the strike: the body keeps what it sold
      const prev = keys[keys.length - 1];
      keys.push({ at: k.at, pose: prev.pose, kind: "hold" });
      derivation.push(`@${k.at} ${k.pose.toLowerCase()}:${k.kind} -> ${prev.pose.toLowerCase()}:hold (keeps the read)`);
      continue;
    }

    // wind-up / travel between beats: the guard forms
    keys.push({ at: k.at, pose: "STANCE", kind: "move" });
    derivation.push(`@${k.at} ${k.pose.toLowerCase()}:${k.kind} -> stance:move (reads the wind-up, the guard forms)`);
  }

  // the program shape compileChoreo/normalize_choreo enforce:
  // first key at 0, last at 1, strictly increasing
  keys[0] = { ...keys[0], at: 0 };
  keys[keys.length - 1] = { ...keys[keys.length - 1], at: 1 };
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].at <= keys[i - 1].at) {
      keys[i] = { ...keys[i], at: Math.min(1, Math.round((keys[i - 1].at + 0.01) * 1000) / 1000) };
    }
  }

  const program: ChoreoProgram = {
    name: partnerName ? `The Answer (${partnerName})` : "The Answer",
    keys,
    // ONE CLASH, ONE LIGHT: the hero program's impact and smear are
    // the clash's own accents - the partner carries none.
    impact: null,
    smear: null,
    note: `the paired performance law (v${PAIRED_PERFORMANCE_LAW_VERSION}): ${partnerName ?? "the partner"} answers the hero's keys on one clock`,
  };
  return { program, derivation };
}

/** True when the hero program actually strikes at the partner (a
 * program of pure holds/stances earns no pairing). */
export function pairingEarned(hero: ChoreoProgram): boolean {
  return hero.keys.some((k) => PAIRED_STRIKE_POSES.includes(k.pose));
}

/** One-liner for evidence and stage text. */
export function pairedPerformanceLine(hero: ChoreoProgram, partnerName?: string): string {
  const { program } = compilePairedProgram(hero, partnerName);
  const answered = program.keys.filter((k) => k.kind === "strike").length;
  return `${partnerName ?? "the partner"} answers on one clock: ${program.keys
    .map((k) => `${k.pose.toLowerCase()}@${k.at}`)
    .join(" -> ")} (${answered} strike beat(s) met)`;
}

/**
 * THE CHOREOGRAPHER'S PAIRING (iteration 119): derive the partner's
 * answer program from a shot's DIRECTED GRAMMAR - the pose beats the
 * action choreographer compiles are the hero's half of the duel. The
 * hero program is built from the beats' own poses (each beat's end
 * pose arrives at the beat's end; a strike pose arrives as a
 * strike), then the answer table answers it. Returns null when the
 * grammar carries no performance worth pairing (too few beats, no
 * valid poses, no strike) - the caller keeps the static stand-off,
 * honestly.
 */
export function pairedProgramFromGrammar(grammarJson: string | null | undefined, partnerName?: string): PairedPerformance | null {
  if (!grammarJson) return null;
  let beats: Array<{ to?: unknown; poseEnd?: unknown }> = [];
  try {
    const parsed = JSON.parse(grammarJson) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    beats = parsed as Array<{ to?: unknown; poseEnd?: unknown }>;
  } catch {
    return null;
  }
  const valid = beats.filter((b) => {
    const pose = String(b?.poseEnd ?? "").trim().toUpperCase();
    return (POSES as readonly string[]).includes(pose) && Number.isFinite(Number(b?.to)) && Number(b.to) > 0 && Number(b.to) <= 1;
  });
  if (valid.length < 2) return null;
  const first = beats[0] ?? {};
  const openPose = String((first as { poseStart?: unknown }).poseStart ?? "").trim().toUpperCase();
  const openValid = (POSES as readonly string[]).includes(openPose) ? openPose : String(first.poseEnd ?? "").trim().toUpperCase();
  const hero: ChoreoProgram = {
    name: "The Directed Action",
    keys: [
      { at: 0, pose: (POSES as readonly string[]).includes(openValid) ? openValid : "STANCE", kind: "move" },
      ...valid.map((b) => {
        const pose = String(b.poseEnd).trim().toUpperCase();
        return { at: Math.min(1, Number(b.to)), pose, kind: (PAIRED_STRIKE_POSES.includes(pose) ? "strike" : "move") as ChoreoKey["kind"] };
      }),
    ],
    impact: null,
    smear: null,
    note: "the hero program mirrored from the directed grammar's pose beats",
  };
  // the keys must rise strictly - a beat that lands at or before its
  // predecessor's moment is dropped (the earlier arrival owns the
  // clock; the grammar's own from<to law keeps this rare)
  const rising: ChoreoKey[] = [];
  for (const k of hero.keys) {
    if (rising.length > 0 && k.at <= rising[rising.length - 1].at) continue;
    rising.push(k);
  }
  hero.keys = rising;
  if (hero.keys.length < 2) return null;
  if (!pairingEarned(hero)) return null;
  return compilePairedProgram(hero, partnerName);
}
