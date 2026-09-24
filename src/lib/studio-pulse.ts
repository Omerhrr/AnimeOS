import { db } from "@/lib/db";
import { canonHealthData } from "@/lib/canon-health";
import { scheduleHealthData } from "@/lib/schedule-health";
import { universeReRenderQueue } from "@/lib/universe-facts";
import { IDENTITY_REPAINT_THRESHOLD, AFFINITY_WATCH_THRESHOLD, identityDriftData } from "@/lib/identity";

// ─────────────────────────────────────────────────────────────
// STUDIO PULSE - one honest readout of the whole studio's health
//
// "How are we doing?" should not take four panels and a guess. The
// pulse aggregates the health layers the studio already records:
//
//   canon      - the universe-facts verdict history as a score
//   identity   - vision-scored panels, drift queue, affinity pass
//   schedules  - 14-day fire outcomes, overdue and error streaks
//   queue      - active render jobs and the re-render queue depth
//
// No model calls, no provider calls: pure DB reads, so DSH can call
// it any time (studio_pulse) and the answer is instant.
// ─────────────────────────────────────────────────────────────

export interface StudioPulse {
  headline: string;
  canon: string;
  identity: string;
  schedules: string;
  queue: string;
  lines: string[];
}

/** Build the full pulse for one production. Safe on empty projects. */
export async function studioPulse(projectId: string): Promise<StudioPulse> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { title: true } });
  const [canon, schedules, identityRows, embeddings, activeJobs, rerenderQueue, drift] = await Promise.all([
    canonHealthData(projectId),
    scheduleHealthData(projectId),
    db.identityScore.findMany({ where: { projectId }, orderBy: { worst: "asc" } }),
    db.panelEmbedding.findMany({ where: { projectId }, orderBy: { worst: "asc" } }),
    db.renderJob.count({ where: { projectId, status: { in: ["QUEUED", "RENDERING"] } } }),
    universeReRenderQueue(projectId).catch(() => [] as Awaited<ReturnType<typeof universeReRenderQueue>>),
    identityDriftData(projectId).catch(() => ({ characters: [], watch: [], headline: "identity drift curves unavailable" })),
  ]);

  const d = canon.digest;
  const canonSummary = d.score == null
    ? d.headline
    : `canon score ${(d.score * 100).toFixed(0)}% ${d.band} (${d.verifiedFacts}/${d.activeFacts} active facts audited, ${d.violatedFacts} violated); last 14d: ${d.recent.held} held / ${d.recent.broken} broken`;

  const avgWorst = identityRows.length > 0 ? identityRows.reduce((a, r) => a + r.worst, 0) / identityRows.length : null;
  const belowBar = identityRows.filter((r) => r.worst < IDENTITY_REPAINT_THRESHOLD).length;
  const identityLine = identityRows.length === 0
    ? "identity: no panel vision-scored yet"
    : `identity: ${identityRows.length} panel(s) scored, avg worst ${(avgWorst! * 100).toFixed(0)}%, ${belowBar} below the ${(IDENTITY_REPAINT_THRESHOLD * 100).toFixed(0)}% bar`;
  const affinityWorst = embeddings[0]?.worst ?? null;
  const affinityLine = embeddings.length === 0
    ? "no affinity pass yet (provider-free, instant)"
    : `affinity pass on ${embeddings.length} panel(s), lowest ${(affinityWorst! * 100).toFixed(0)}%${affinityWorst! < AFFINITY_WATCH_THRESHOLD ? " (watch: far from the sheet)" : ""}`;
  const driftLine = drift.characters.length === 0
    ? "no per-character drift curves yet"
    : drift.watch.length > 0
      ? `DRIFT CURVES: ${drift.watch.map((c) => `${c.characterName} ${(c.delta! * 100).toFixed(0)}% over ${c.panels} panel(s)`).join(", ")} declining`
      : `${drift.characters.length} character curve(s), none declining`;

  const scheduleLine = schedules.rows.length === 0
    ? schedules.headline
    : `${schedules.headline}${schedules.erroring > 0 ? ` - ${schedules.rows.filter((r) => r.errorStreak >= 2 || (r.enabled && r.lastStatus === "ERROR")).map((r) => `'${r.name}'`).join(", ")} needs attention` : ""}`;

  const queueLine = `${activeJobs} active render job(s), re-render queue ${rerenderQueue.length} panel(s)`;

  const headlineParts: string[] = [];
  if (d.score != null) headlineParts.push(`canon ${d.band}`);
  if (belowBar > 0) headlineParts.push(`${belowBar} identity drift`);
  if (drift.watch.length > 0) headlineParts.push(`${drift.watch.length} declining character curve(s)`);
  if (canon.suggestions.length > 0) headlineParts.push(`${canon.suggestions.length} fact(s) to reword/retire`);
  if (schedules.overdue > 0) headlineParts.push(`${schedules.overdue} schedule(s) overdue`);
  if (schedules.erroring > 0) headlineParts.push(`${schedules.erroring} schedule(s) erroring`);
  if (headlineParts.length === 0) headlineParts.push("no red flags");

  const lines = [
    `PULSE - ${project?.title ?? "production"}: ${headlineParts.join(", ")}`,
    `Canon: ${canonSummary}`,
    d.worstFacts.length > 0 ? `Canon worst: ${d.worstFacts.slice(0, 3).map((f) => `${f.status} - ${f.text.slice(0, 60)}`).join("; ")}` : "Canon worst: none",
    canon.suggestions.length > 0
      ? `Canon retire suggestions: ${canon.suggestions.map((s) => `"${s.text.slice(0, 50)}" (${s.reason.split(" - ")[0]})`).join("; ")}`
      : "Canon retire suggestions: none",
    `Identity: ${identityLine}; ${affinityLine}; ${driftLine}`,
    `Schedules: ${scheduleLine}`,
    `Queue: ${queueLine}`,
  ];

  return {
    headline: headlineParts.join(", "),
    canon: canonSummary,
    identity: `${identityLine}; ${affinityLine}; ${driftLine}`,
    schedules: scheduleLine,
    queue: queueLine,
    lines,
  };
}
