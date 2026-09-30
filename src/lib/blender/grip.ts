/**
 * grip - THE HAND CLOSES ON THE HILT (iteration 97, the grip-contact
 * slice).
 *
 * The readings named the pair: the designed sword built three
 * DISCONNECTED pieces - a tilted blade slab, a straight-axis guard
 * cube and a hilt cylinder floating near the elbow - so the fist
 * curled around air while the weapon read as debris. The law makes
 * the hand-weapon pair STRUCTURAL: one GRIP ANCHOR (the fist's
 * center, derived once from the hand rig's own geometry - the palm
 * front face and the finger pivots' height), one axis per weapon
 * kind (the kind's own tilt preserved - the read stays), and every
 * piece PLACED BY THE LAW along that axis through the anchor:
 *
 *   sword: the hilt centered AT the anchor (the fist grips it), the
 *     guard just past the hilt's forward end, the blade meeting the
 *     guard and extending down-forward;
 *   staff / spear: the shaft THROUGH the fist at the kind's own
 *     hold fraction (the gem/tip ride the shaft's local frame);
 *   the stand-in's energy blade: centered at the anchor (its
 *     midpoint gripped - the contact the v3.2 read always meant).
 *
 * All the pieces parent to one GRIP PIVOT empty placed at the
 * anchor (child of the hand), so the pair is structural - the
 * weapon rides every pose frame through the hand, and the
 * follow-through pivots the WHOLE weapon around the fist (the
 * physically honest flex) instead of re-tilting the blade slab
 * away from its own hilt.
 *
 * The DETERMINISTIC grip hash (sha256-16 over the canonical law
 * key, versioned 97) is mirrored bit-exactly in the worker's
 * grip_hash - one law, two runtimes.
 */

import { createHash } from "node:crypto";

export const GRIP_LAW_VERSION = 97;

/** The fist's center in hand-local space: just past the palm's front
 * face (y -0.009) at the finger pivots' height (z -0.05) raised by
 * the curl's half-chord - derived once from the rig both figures
 * share. */
export const GRIP_ANCHOR = { x: 0.0, y: -0.01, z: -0.048 } as const;

export const GRIP_KINDS = ["sword", "staff", "spear", "blade"] as const;
export type GripKind = (typeof GRIP_KINDS)[number];

/** Per-kind law constants (hand-local units): the axis tilt (degrees
 * about X - the kind's own read, preserved), the hold offset along
 * the shaft axis for through-grip kinds, the hilt length, and the
 * guard offset for the sword. */
export const GRIP_SPEC: Record<GripKind, { tilt: number; hold: number; hilt: number; guard: number }> = {
  sword: { tilt: -55.0, hold: 0.0, hilt: 0.14, guard: 0.076 },
  staff: { tilt: -72.0, hold: 0.25, hilt: 0.0, guard: 0.0 },
  spear: { tilt: -72.0, hold: 0.2, hilt: 0.0, guard: 0.0 },
  // the stand-in's emissive energy blade (midpoint-gripped)
  blade: { tilt: -72.0, hold: 0.0, hilt: 0.0, guard: 0.0 },
};

const round4 = (x: number) => Math.round(x * 10000) / 10000;
const fmt4 = (x: number) => x.toFixed(4);

/** The axis direction the TIP points (hand-local), from the kind's
 * own tilt: the mesh's local -z maps to this under R_x(tilt). */
export function gripTipAxis(kind: GripKind): { x: number; y: number; z: number } {
  const t = (GRIP_SPEC[kind]?.tilt ?? 0) * (Math.PI / 180);
  // R_x(t) * (0,0,-1) = (0, sin t, -cos t) - down-forward for the
  // negative tilts the kinds carry
  return { x: 0.0, y: round4(Math.sin(t)), z: round4(-Math.cos(t)) };
}

/** Where a piece sits (PIVOT-LOCAL - the pivot empty hangs at the
 * anchor, so the pieces hang relative to it) given the kind and its
 * distance along the tip axis. The law's single placement function
 * - the worker mirrors it piece for piece. */
export function gripPieceOffset(kind: GripKind, along: number): { x: number; y: number; z: number } {
  const u = gripTipAxis(kind);
  return {
    x: round4(u.x * along),
    y: round4(u.y * along),
    z: round4(u.z * along),
  };
}

/** The canonical key - the anchor, the per-kind constants and the
 * axis the pieces hang from, pipe-format, versioned 97. Mirrors
 * grip_key in the worker field for field. */
export function gripKey(): string {
  const kinds = GRIP_KINDS.map((k) => {
    const s = GRIP_SPEC[k];
    const u = gripTipAxis(k);
    return `${k}:tilt=${fmt4(s.tilt)},hold=${fmt4(s.hold)},hilt=${fmt4(s.hilt)},guard=${fmt4(s.guard)},u=${fmt4(u.y)},${fmt4(u.z)}`;
  });
  return (
    `${GRIP_LAW_VERSION}` +
    `|A=${fmt4(GRIP_ANCHOR.x)},${fmt4(GRIP_ANCHOR.y)},${fmt4(GRIP_ANCHOR.z)}` +
    `|${kinds.join("|")}` +
    `|v1`
  );
}

/** The DETERMINISTIC grip hash - sha256-16 over the canonical key
 * (mirrors grip_hash in the worker bit-exactly). */
export function gripHash(): string {
  return createHash("sha256").update(gripKey(), "utf8").digest("hex").slice(0, 16);
}

/** Human one-liner for stage text and logs. */
export function gripLine(): string {
  return `grip v97: the hand closes on the hilt (one anchor at y ${GRIP_ANCHOR.y}, z ${GRIP_ANCHOR.z}; every piece on the kind's own axis; the follow-through pivots the weapon around the fist)`;
}
