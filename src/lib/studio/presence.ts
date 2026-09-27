// ─────────────────────────────────────────────────────────────
// STUDIO PRESENCE (iteration 68 - who is in the room)
//
// The roster already carries liveness: every authenticated API call
// bumps the caller's lastSeenAt (lib/auth's touch, fire-and-forget),
// so any polling client - the dashboard, the DSH console - stays
// fresh by simply working. Presence classifies that signal:
//
//   online  - seen within the last 3 minutes  (at the bench now)
//   recent  - seen within the last hour       (in and out)
//   away    - seen further back than an hour  (the desk is empty)
//   offline - never seen                      (the key unused)
//
// Pure and deterministic: the same lastSeenAt against the same now
// always lands the same bucket - the E2E proves the boundaries.
// ─────────────────────────────────────────────────────────────

export const PRESENCE_ONLINE_MS = 3 * 60_000;
export const PRESENCE_RECENT_MS = 60 * 60_000;

export type PresenceBucket = "online" | "recent" | "away" | "offline";

export function presenceBucket(lastSeenAt: Date | string | null | undefined, now: Date): PresenceBucket {
  if (!lastSeenAt) return "offline";
  const t = typeof lastSeenAt === "string" ? new Date(lastSeenAt).getTime() : lastSeenAt.getTime();
  if (!Number.isFinite(t)) return "offline";
  const delta = now.getTime() - t;
  if (delta < 0) return "online"; // clock skew - they are clearly alive
  if (delta <= PRESENCE_ONLINE_MS) return "online";
  if (delta <= PRESENCE_RECENT_MS) return "recent";
  return "away";
}

export const PRESENCE_LABEL: Record<PresenceBucket, string> = {
  online: "at the bench",
  recent: "in and out",
  away: "away",
  offline: "never seen",
};
