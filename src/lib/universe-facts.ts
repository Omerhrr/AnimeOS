import { db } from "@/lib/db";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import ZAI from "z-ai-web-dev-sdk";

// ─────────────────────────────────────────────────────────────
// UNIVERSE-FACTS VISION CHECKS (the world's canon joins the QA loop)
//
// A production's universe facts are its canon rules of the world:
// the blade glows cyan when spirit energy channels, two moons hang
// over the Cloud Terrace, the antagonist never removes his mask.
// This module closes the loop between that canon and the ART:
//
//   1. VLM CHECK - a vision model receives the shot's panel art plus
//      the production's active facts and returns a strict JSON verdict
//      per fact: holds (true/false), confidence (0..1) and a note.
//
//   2. EVENTS - every verdict persists as a FACT_HELD / FACT_BROKEN
//      continuity event (previous verdicts for the same shot are
//      replaced), so the event stream and DSH see the audit.
//
//   3. RE-RENDER QUEUE - broken facts with confidence >=
//      UNIVERSE_QUEUE_THRESHOLD rank their shots into a
//      worst-first queue. The Continuity view offers a one-click
//      re-render + re-check per queued shot, so canon violations
//      flow straight back into the art pipeline.
// ─────────────────────────────────────────────────────────────

export const UNIVERSE_QUEUE_THRESHOLD = 0.6;
export const UNIVERSE_EVENT_KINDS = ["FACT_HELD", "FACT_BROKEN"] as const;

export type UniverseFactCategory = "WORLD" | "CHARACTER" | "PROP" | "LOCATION" | "RULE";

export interface FactVerdict {
  factId: string;
  text: string;
  holds: boolean;
  confidence: number;
  note: string;
}

export interface UniverseCheckResult {
  shotId: string;
  shotRef: string;
  episode: number;
  verdicts: FactVerdict[];
  broken: number; // verdicts that are broken AND confident (feed the queue)
  summary: string;
}

export interface UniverseQueueItem {
  shotId: string;
  ref: string;
  description: string;
  artUrl: string | null;
  worst: number; // lowest confidence among the shot's confident violations
  items: Array<{ factText: string; confidence: number; note: string; eventId: string }>;
}

interface FactVerdictJsonBody {
  verdicts?: Array<{ id?: string; holds?: boolean; confidence?: number; note?: string }>;
  summary?: string;
}

function parseVerdictJson(raw: string): FactVerdictJsonBody | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as FactVerdictJsonBody;
  } catch {
    return null;
  }
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Shot reference label (E{n} Sc{n} S{n}) from an included shot. */
function shotRefOf(shot: {
  number: number;
  scene: { number: number; episode: { number: number } };
}): string {
  return `E${shot.scene.episode.number} Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;
}

/**
 * VLM universe-facts check for ONE shot: the panel art is judged
 * against the production's active facts. Findings persist as
 * FACT_HELD / FACT_BROKEN continuity events (previous verdicts for
 * the same shot are replaced so the stream stays readable).
 */
export async function checkShotUniverseFacts(shotId: string): Promise<
  { ok: true; result: UniverseCheckResult } | { ok: false; error: string }
> {
  const shot = await db.shot.findUnique({
    where: { id: shotId },
    include: {
      scene: {
        include: {
          episode: {
            include: {
              season: { include: { project: { include: { universeFacts: true } } } },
            },
          },
        },
      },
    },
  });
  if (!shot) return { ok: false, error: "Shot not found" };
  if (!shot.artworkUrl) return { ok: false, error: "This shot has no panel art to check yet" };

  const project = shot.scene.episode.season.project;
  const facts = project.universeFacts.filter((f) => f.active);
  if (facts.length === 0) {
    return { ok: false, error: "This production has no active universe facts - add a few canon rules first (Continuity view or the add_universe_fact tool)" };
  }

  const artData = publicImageAsDataUrl(shot.artworkUrl);
  if (!artData) return { ok: false, error: "Panel art is missing on disk" };

  const ref = shotRefOf(shot);
  const factLines = facts.map((f, i) => `${i + 1}. [id:${f.id}] (${f.category}) ${f.text}`);
  const prompt = [
    "You are a universe-facts auditor for an animation production.",
    "Image 1 is a story panel. Below are the production's canonical universe facts.",
    "For EACH fact judge whether the panel is CONSISTENT with it: the fact must not be contradicted by anything visible.",
    "Reply with STRICT JSON only, no markdown fences:",
    '{"verdicts": [{"id": "<fact id from the list>", "holds": true|false, "confidence": 0.0-1.0, "note": "one short sentence"}], "summary": "one sentence overall"}',
    "confidence expresses how sure you are of the verdict. If a fact cannot be judged from the image at all, still return its row with confidence <= 0.3 and say why in the note.",
    "An example row: {\"id\": \"clx123\", \"holds\": false, \"confidence\": 0.82, \"note\": \"only one moon visible\"}",
    "",
    "UNIVERSE FACTS:",
    ...factLines,
  ].join("\n");

  let raw = "";
  try {
    const zai = await ZAI.create();
    const res = (await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: artData } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    raw = res.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "vision check failed" };
  }

  const body = parseVerdictJson(raw);
  if (!body || !Array.isArray(body.verdicts)) {
    return { ok: false, error: `vision model returned unparsable verdict: ${raw.slice(0, 120)}` };
  }

  const byId = new Map(facts.map((f) => [f.id, f]));
  const verdicts: FactVerdict[] = [];
  for (const v of body.verdicts) {
    const id = String(v.id ?? "");
    const fact = byId.get(id);
    if (!fact) continue; // hallucinated ids are dropped, not guessed
    verdicts.push({
      factId: fact.id,
      text: fact.text,
      holds: v.holds === true,
      confidence: clamp01(v.confidence),
      note: String(v.note ?? "").slice(0, 240),
    });
  }
  if (verdicts.length === 0) {
    return { ok: false, error: "vision verdict referenced none of the production's facts" };
  }

  // persist: one event per verdict, prior verdicts for the same shot replaced
  const tag = `[universe ${shot.id}]`;
  await db.continuityEvent.deleteMany({
    where: { projectId: project.id, kind: { in: [...UNIVERSE_EVENT_KINDS] }, description: { startsWith: tag } },
  });
  const rows = verdicts.map((v) => ({
    projectId: project.id,
    entityType: "UNIVERSE_FACT",
    entityName: v.text.slice(0, 90),
    kind: v.holds ? "FACT_HELD" : "FACT_BROKEN",
    episodeNumber: shot.scene.episode.number,
    description: `${tag} (${ref}) confidence ${v.confidence.toFixed(2)} - ${v.note || (v.holds ? "consistent with the panel" : "contradicted by the panel")}`.slice(0, 900),
    severity: !v.holds && v.confidence >= UNIVERSE_QUEUE_THRESHOLD ? "WARNING" : "INFO",
  }));
  await db.continuityEvent.createMany({ data: rows });

  const broken = verdicts.filter((v) => !v.holds && v.confidence >= UNIVERSE_QUEUE_THRESHOLD).length;
  return {
    ok: true,
    result: {
      shotId: shot.id,
      shotRef: ref,
      episode: shot.scene.episode.number,
      verdicts,
      broken,
      summary: String(body.summary ?? "").slice(0, 400) || `${verdicts.filter((v) => v.holds).length}/${verdicts.length} facts hold on this panel`,
    },
  };
}

const SHOT_ID_TAG = /^\[universe ([A-Za-z0-9]+)\]/;

/**
 * The re-render queue: shots whose latest universe check produced a
 * confident violation, worst confidence first. Each item carries the
 * violated fact texts so the re-render knows what to fix.
 */
export async function universeReRenderQueue(projectId: string): Promise<UniverseQueueItem[]> {
  const events = await db.continuityEvent.findMany({
    where: { projectId, kind: "FACT_BROKEN", severity: "WARNING" },
    orderBy: { createdAt: "desc" },
    take: 240,
  });
  if (events.length === 0) return [];

  // group by shot id from the description tag, keep the newest note per fact
  const grouped = new Map<string, UniverseQueueItem["items"]>();
  for (const ev of events) {
    const m = ev.description.match(SHOT_ID_TAG);
    if (!m) continue;
    const shotId = m[1];
    const confMatch = ev.description.match(/confidence (0\.\d+)/);
    const confidence = confMatch ? clamp01(confMatch[1]) : 1;
    const note = ev.description.replace(SHOT_ID_TAG, "").replace(/^\s*\([^)]*\)\s*confidence [\d.]+\s*-\s*/, "").trim();
    if (!grouped.has(shotId)) grouped.set(shotId, []);
    grouped.get(shotId)!.push({ factText: ev.entityName, confidence, note, eventId: ev.id });
  }
  if (grouped.size === 0) return [];

  const shots = await db.shot.findMany({
    where: { id: { in: [...grouped.keys()] } },
    include: { scene: { include: { episode: true } } },
  });

  const items: UniverseQueueItem[] = shots.map((shot) => {
    const factItems = grouped.get(shot.id) ?? [];
    return {
      shotId: shot.id,
      ref: shotRefOf(shot),
      description: shot.description,
      artUrl: shot.artworkUrl,
      worst: factItems.length ? Math.min(...factItems.map((f) => f.confidence)) : 1,
      items: factItems,
    };
  });
  return items.sort((a, b) => a.worst - b.worst).slice(0, 20);
}

/** Everything the Continuity view's universe panel needs in one GET. */
export async function universePanelData(projectId: string) {
  const [facts, queue, shots] = await Promise.all([
    db.universeFact.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    universeReRenderQueue(projectId),
    db.shot.findMany({
      where: { scene: { episode: { season: { projectId } } } },
      include: { scene: { include: { episode: true } } },
      orderBy: [{ scene: { number: "asc" } }, { number: "asc" }],
      take: 120,
    }),
  ]);
  return {
    facts,
    queue,
    shots: shots.map((s) => ({
      shotId: s.id,
      ref: shotRefOf(s),
      description: s.description,
      hasArt: Boolean(s.artworkUrl),
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// REWORDED-FACT RE-AUDIT HELPER
//
// When a fact is reworded, every verdict it ever earned was judged
// against the OLD wording (events carry the fact text as their
// entity name), so the new wording starts with a clean slate the
// old panels never saw. This helper closes that loop: it finds the
// panels that audited the old wording and re-runs the vision check
// on them, so the SAME panels answer whether the NEW wording holds.
// Re-audits replace the per-panel verdict sets (the standard check
// behavior), so the health rollup, the drift curves and the
// re-render queue all read the new wording's history afterwards.
// ─────────────────────────────────────────────────────────────

export interface ReauditTarget {
  shotId: string;
  ref: string;
  hasArt: boolean;
  lastAt: string; // when this panel last audited the old wording
}

/**
 * The panels whose verdict history matches the given (old) fact
 * text, newest audit first. Pure key matching: the fact text sliced
 * to 90 chars is the event entity name the pipeline writes.
 */
export async function reauditTargetsForFact(oldText: string): Promise<ReauditTarget[]> {
  const events = await db.continuityEvent.findMany({
    where: { kind: { in: [...UNIVERSE_EVENT_KINDS] }, entityName: oldText.trim().slice(0, 90) },
    orderBy: { createdAt: "desc" },
    take: 240,
  });
  if (events.length === 0) return [];

  const shotIds = new Set<string>();
  const lastAt = new Map<string, Date>();
  for (const ev of events) {
    const m = ev.description.match(SHOT_ID_TAG);
    if (!m) continue;
    const shotId = m[1];
    shotIds.add(shotId);
    if (!lastAt.has(shotId) || (lastAt.get(shotId)!.getTime() < ev.createdAt.getTime())) {
      lastAt.set(shotId, ev.createdAt);
    }
  }
  if (shotIds.size === 0) return [];

  const shots = await db.shot.findMany({
    where: { id: { in: [...shotIds] } },
    include: { scene: { include: { episode: true } } },
  });
  return shots
    .map((shot) => ({
      shotId: shot.id,
      ref: shotRefOf(shot),
      hasArt: Boolean(shot.artworkUrl),
      lastAt: (lastAt.get(shot.id) ?? shot.createdAt).toISOString(),
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt)); // newest audits first
}

export interface ReauditOutcome {
  shotId: string;
  ref: string;
  ok: boolean;
  error?: string; // why the panel could not be re-audited (missing art, ...)
  holds?: number; // this fact's fresh verdicts that held
  broken?: number; // this fact's fresh verdicts that broke
  note?: string; // the fresh verdict's note for this fact
  summary?: string;
}

export interface ReauditResult {
  factId: string;
  oldText: string;
  newText: string;
  targets: number; // panels that audited the old wording
  audited: number; // panels actually re-checked
  held: number;
  broken: number;
  results: ReauditOutcome[];
  summary: string;
}

export const REAUDIT_CAP = 6; // panels re-audited per call (the rest wait for the queue)

/**
 * Re-audit the panels that judged the OLD wording of a fact against
 * its CURRENT (new) wording. Non-art panels are reported honestly as
 * skipped; each successful panel replaces its verdict set through
 * the standard check path. Lands a CONTINUITY production event.
 */
export async function reauditRewordedFact(
  factId: string,
  oldText: string,
  cap = REAUDIT_CAP,
): Promise<{ ok: true; result: ReauditResult } | { ok: false; error: string }> {
  const fact = await db.universeFact.findUnique({ where: { id: factId } });
  if (!fact) return { ok: false, error: "Fact not found" };
  if (!fact.active) return { ok: false, error: "This fact is retired - reactivate it before re-auditing" };
  const old = String(oldText ?? "").trim();
  if (!old) return { ok: false, error: "The old wording is required (the panels are found by what they audited)" };
  if (old === fact.text.trim()) {
    return { ok: false, error: "That is already the fact's current wording - nothing was reworded" };
  }

  const targets = await reauditTargetsForFact(old);
  const results: ReauditOutcome[] = [];
  for (const target of targets.slice(0, Math.max(1, cap))) {
    if (!target.hasArt) {
      results.push({ shotId: target.shotId, ref: target.ref, ok: false, error: "no panel art to check" });
      continue;
    }
    const check = await checkShotUniverseFacts(target.shotId);
    if (!check.ok) {
      results.push({ shotId: target.shotId, ref: target.ref, ok: false, error: check.error });
      continue;
    }
    const mine = check.result.verdicts.filter((v) => v.factId === fact.id);
    const held = mine.filter((v) => v.holds).length;
    const broken = mine.length - held;
    results.push({
      shotId: target.shotId,
      ref: target.ref,
      ok: true,
      holds: held,
      broken,
      note: mine[0]?.note ?? "",
      summary: check.result.summary,
    });
  }

  const audited = results.filter((r) => r.ok).length;
  const held = results.reduce((a, r) => a + (r.holds ?? 0), 0);
  const broken = results.reduce((a, r) => a + (r.broken ?? 0), 0);
  const skipped = results.length - audited;

  let summary: string;
  if (targets.length === 0) {
    summary = `no panels ever audited the old wording - audit a fresh panel to see whether the new wording holds`;
  } else {
    summary = `${audited} of ${targets.length} prior panel(s) re-audited under the new wording: ${held} held / ${broken} broke${skipped > 0 ? ` (${skipped} skipped)` : ""}`;
    if (targets.length > results.length) {
      summary += `, ${targets.length - results.length} older panel(s) left for the re-render queue`;
    }
  }

  await db.productionEvent.create({
    data: {
      projectId: fact.projectId,
      actor: "USER",
      type: "CONTINUITY",
      summary: `Reworded fact re-audited - "${fact.text.slice(0, 60)}": ${summary}`,
      payload: JSON.stringify({ factId: fact.id, oldText: old.slice(0, 200), newText: fact.text.slice(0, 200), targets: targets.length, audited, held, broken, results }),
    },
  });

  return {
    ok: true,
    result: { factId: fact.id, oldText: old, newText: fact.text, targets: targets.length, audited, held, broken, results, summary },
  };
}
