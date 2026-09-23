// ─────────────────────────────────────────────────────────────
// SHOT POSE VOCABULARY (character motion inside the frame)
//
// Camera grammar moves the lens; POSES move the subject. A shot can
// carry a start pose and an end pose (named entries from this
// vocabulary) and every motion-capable driver interpolates between
// them across the clip:
//
//   - BLENDER / BLENDER_LOCAL - the bridge add-on's skeletal
//     stand-in (jointed figure with an emissive blade) is posed per
//     frame between start and end, eased.
//   - IMG2VID - an interpolation-model provider (ANIMEOS_IMG2VID_HOST)
//     receives the key art + the pose pair and renders character
//     motion inside the frame.
//   - MOTION - ffmpeg cannot articulate a painted character, so the
//     engine plays the pair as a blocking approximation: program
//     wording + an impact beat at the end pose.
//
// Everything here is pure and deterministic: the same pose pair
// always plans the same joint program, so retries are stable and
// tests can unit-check the vocabulary without spawning a renderer.
// ─────────────────────────────────────────────────────────────

export interface PoseJoints {
  rootX: number; // forward offset (meters, + toward camera side)
  rootY: number; // height offset (meters, + up)
  spine: number; // torso bend (degrees, + forward)
  head: number; // head pitch (degrees, + down)
  rArm: number; // right shoulder raise (degrees, 0 = down, -180 = overhead)
  rElbow: number; // right elbow bend (degrees, 0 = straight)
  lArm: number;
  lElbow: number;
  rLeg: number; // right thigh raise (degrees, + forward)
  rKnee: number; // right knee bend (degrees, 0 = straight)
  lLeg: number;
  lKnee: number;
}

export const POSES = [
  "STANCE",
  "WALK",
  "LUNGE",
  "SLASH",
  "CAST",
  "DRAW",
  "BLOCK",
  "LEAP",
  "CROUCH",
  "FALL",
  "RISE",
  "BOW",
  "POINT",
] as const;

export type PoseId = (typeof POSES)[number];

export const POSE_LABELS: Record<string, string> = {
  STANCE: "ready stance",
  WALK: "mid-stride walk",
  LUNGE: "forward lunge",
  SLASH: "overhead slash",
  CAST: "channeling cast",
  DRAW: "bow draw",
  BLOCK: "guard block",
  LEAP: "airborne leap",
  CROUCH: "low crouch",
  FALL: "collapsing fall",
  RISE: "rising up",
  BOW: "respectful bow",
  POINT: "arm-point call",
};

export const POSE_GLOSS: Record<string, string> = {
  STANCE: "neutral ready stance, weight centered",
  WALK: "mid-stride walk cycle frame",
  LUNGE: "explosive forward lunge, lead arm thrust",
  SLASH: "overhead blade slash arcing down",
  CAST: "both arms raised channeling energy",
  DRAW: "bow fully drawn, anchor at the cheek",
  BLOCK: "low guard, forearms crossed",
  LEAP: "airborne tuck at the apex",
  CROUCH: "compressed low crouch, coiled",
  FALL: "crumpling collapse toward the ground",
  RISE: "pushing up from the ground, one knee loaded",
  BOW: "formal bow from the waist",
  POINT: "arm extended, pointing the call",
};

/** Joint angles per named pose (degrees / meters). */
export const POSE_JOINTS: Record<string, PoseJoints> = {
  STANCE: { rootX: 0, rootY: 0, spine: 1, head: 0, rArm: -8, rElbow: 8, lArm: 8, lElbow: 8, rLeg: 0, rKnee: 4, lLeg: 0, lKnee: 4 },
  WALK: { rootX: 0.1, rootY: 0.0, spine: 2, head: 0, rArm: 18, rElbow: 12, lArm: -18, lElbow: 12, rLeg: 28, rKnee: 12, lLeg: -14, lKnee: 8 },
  LUNGE: { rootX: 0.35, rootY: -0.12, spine: 10, head: -3, rArm: -95, rElbow: 5, lArm: 35, lElbow: 45, rLeg: 55, rKnee: 40, lLeg: -25, lKnee: 10 },
  SLASH: { rootX: 0.1, rootY: -0.05, spine: -8, head: -5, rArm: -160, rElbow: 20, lArm: -30, lElbow: 30, rLeg: 10, rKnee: 10, lLeg: -8, lKnee: 6 },
  CAST: { rootX: 0, rootY: 0.02, spine: -4, head: -12, rArm: -120, rElbow: 50, lArm: -120, lElbow: 50, rLeg: 6, rKnee: 6, lLeg: -6, lKnee: 6 },
  DRAW: { rootX: 0.05, rootY: -0.03, spine: 3, head: 2, rArm: -85, rElbow: 95, lArm: -70, lElbow: 12, rLeg: 12, rKnee: 14, lLeg: -10, lKnee: 6 },
  BLOCK: { rootX: 0, rootY: -0.06, spine: 6, head: 4, rArm: -70, rElbow: 100, lArm: -60, lElbow: 100, rLeg: 20, rKnee: 30, lLeg: -10, lKnee: 15 },
  LEAP: { rootX: 0.15, rootY: 0.55, spine: -6, head: -4, rArm: -140, rElbow: 20, lArm: -120, lElbow: 20, rLeg: 60, rKnee: 70, lLeg: 35, lKnee: 55 },
  CROUCH: { rootX: 0.05, rootY: -0.4, spine: 18, head: 6, rArm: -30, rElbow: 40, lArm: -20, lElbow: 35, rLeg: 70, rKnee: 95, lLeg: 55, lKnee: 90 },
  FALL: { rootX: 0.05, rootY: -0.62, spine: 32, head: 20, rArm: 40, rElbow: 10, lArm: -55, lElbow: 15, rLeg: 15, rKnee: 45, lLeg: 5, lKnee: 30 },
  RISE: { rootX: 0.1, rootY: -0.25, spine: 14, head: 4, rArm: -20, rElbow: 25, lArm: -15, lElbow: 20, rLeg: 40, rKnee: 60, lLeg: 25, lKnee: 40 },
  BOW: { rootX: 0, rootY: -0.04, spine: 38, head: 22, rArm: 12, rElbow: 6, lArm: 12, lElbow: 6, rLeg: 0, rKnee: 2, lLeg: 0, lKnee: 2 },
  POINT: { rootX: 0.05, rootY: 0, spine: 2, head: -2, rArm: -88, rElbow: 4, lArm: 10, lElbow: 12, rLeg: 8, rKnee: 6, lLeg: -6, lKnee: 4 },
};

const JOINT_KEYS = Object.keys(POSE_JOINTS.STANCE) as Array<keyof PoseJoints>;

/** Accepts free text and maps it onto the vocabulary (null when unknown). */
export function normalizePose(value: unknown): string | null {
  const raw = String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!raw) return null;
  if ((POSES as readonly string[]).includes(raw)) return raw;
  // forgiving aliases DSH or creators may type
  const aliases: Record<string, string> = {
    IDLE: "STANCE",
    STAND: "STANCE",
    READY: "STANCE",
    STEP: "WALK",
    STRIDE: "WALK",
    ATTACK: "LUNGE",
    STRIKE: "SLASH",
    SWORD_SLASH: "SLASH",
    SPELL: "CAST",
    CHANNEL: "CAST",
    AIM: "DRAW",
    GUARD: "BLOCK",
    DEFEND: "BLOCK",
    JUMP: "LEAP",
    DUCK: "CROUCH",
    COLLAPSE: "FALL",
    STAND_UP: "RISE",
    SALUTE: "BOW",
    GREET: "BOW",
    CALL: "POINT",
  };
  return aliases[raw] ?? null;
}

function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Interpolate two named poses across t (0..1) with eased timing.
 * Unknown poses fall back to STANCE so a bad chip can never break a
 * render mid-flight.
 */
export function lerpPose(start: string | null | undefined, end: string | null | undefined, t: number): PoseJoints {
  const a = POSE_JOINTS[normalizePose(start) ?? "STANCE"] ?? POSE_JOINTS.STANCE;
  const b = POSE_JOINTS[normalizePose(end) ?? "STANCE"] ?? POSE_JOINTS.STANCE;
  const k = easeInOutCubic(t);
  const out = {} as PoseJoints;
  for (const key of JOINT_KEYS) {
    out[key] = Number((a[key] + (b[key] - a[key]) * k).toFixed(3));
  }
  return out;
}

/** True when the shot actually carries a pose program worth animating. */
export function hasPoseProgram(start: string | null | undefined, end: string | null | undefined): boolean {
  return Boolean(normalizePose(start) || normalizePose(end));
}

/** Short chip wording, e.g. "STANCE -> LUNGE". */
export function poseChip(start: string | null | undefined, end: string | null | undefined): string | null {
  const a = normalizePose(start);
  const b = normalizePose(end);
  if (!a && !b) return null;
  if (a && b && a !== b) return `${a} → ${b}`;
  return a ?? b ?? null;
}

/** Human one-liner for stage text and DSH results. */
export function describePosePair(start: string | null | undefined, end: string | null | undefined): string {
  const a = normalizePose(start);
  const b = normalizePose(end);
  if (!a && !b) return "";
  const aTxt = a ? `${a} (${POSE_GLOSS[a] ?? "pose"})` : "";
  const bTxt = b ? `${b} (${POSE_GLOSS[b] ?? "pose"})` : "";
  if (a && b && a !== b) return `character motion ${aTxt} → ${bTxt}`;
  if (a && b) return `held character pose ${aTxt}`;
  return `character pose ${aTxt || bTxt}`;
}
