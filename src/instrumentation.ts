// Next.js instrumentation hook: boots the cadence scheduler's
// in-process loop on the nodejs server runtime (API routes + SSR).
// The loop fires due StudioSchedules every minute; see
// src/lib/scheduler.ts. Edge runtime and static builds opt out.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startSchedulerLoop } = await import("@/lib/scheduler");
    startSchedulerLoop();
  } catch (err) {
    console.error("[scheduler] boot failed:", err instanceof Error ? err.message : err);
  }
}
