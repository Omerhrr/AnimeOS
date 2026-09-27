import { AsyncLocalStorage } from "node:async_hooks";

// ─────────────────────────────────────────────────────────────
// MEMBER ATTRIBUTION (iteration 68 - the digests know who)
//
// A production event is only worth digesting when it names the
// member who caused it. Rather than threading the session user
// through every one of the tool layer's event-creation sites, the
// actor rides an AsyncLocalStorage context: executeTool runs every
// tool body inside the context, and every event creator (the
// design ledger's landDesignEvent, the tool cases' inline events)
// reads it. Events created OUTSIDE a tool call - the scheduler's
// fires, the engine's housekeeping - find an empty store and stay
// honestly unattributed (the studio itself did them).
// ─────────────────────────────────────────────────────────────

const storage = new AsyncLocalStorage<{ userId: string | null }>();

/** Run a tool body with the acting member stamped on the context. */
export function runWithActor<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId }, fn);
}

/** The member causing the current work (null = the studio itself). */
export function currentActorId(): string | null {
  return storage.getStore()?.userId ?? null;
}
