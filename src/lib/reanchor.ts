import { db } from "@/lib/db";
import { generateCharacterModelSheet } from "@/lib/ai/art";
import { scoreShotIdentity } from "@/lib/identity";

// ─────────────────────────────────────────────────────────────
// THE IDENTITY RE-ANCHOR WORKFLOW
//
// A DECLINING identity drift curve means a character's resemblance
// to their canonical model sheet is sliding across the show. The
// re-paint loop fixes ONE panel; the re-anchor fixes the REFERENCE:
// the canonical sheet itself is regenerated from the character's
// CURRENT design text (appearance notes, the episode-resolved
// state's wardrobe/weapon, the production's art style), the new
// anchor string is stored, and an IDENTITY_REANCHOR continuity
// event marks the moment. The drift rollup reads those events and
// RESTARTS the trend baseline there, so the old decline documents
// history without poisoning the new sheet's curve.
//
// Re-anchor is a CANONICAL decision, not a quality knob: it is for
// when the design itself moved (a wardrobe state changed the look)
// or the old sheet no longer matches intent - never to chase a bad
// painter around a good anchor (that is what re-paints are for).
// ─────────────────────────────────────────────────────────────

export const REANCHOR_DEFAULT_RESCORE = 3;
export const REANCHOR_MAX_RESCORE = 6;

export interface ReanchorScoredRow {
  ref: string;
  shotId: string;
  worst: number;
  entryForCharacter: number | null;
}

export interface ReanchorResult {
  characterId: string;
  characterName: string;
  projectId: string;
  oldAnchor: string | null;
  newAnchor: string;
  modelSheetUrl: string | null;
  rescored: ReanchorScoredRow[];
  rescoreErrors: Array<{ ref: string; error: string }>;
  rescoredAt: string;
}

/**
 * Regenerate ONE character's canonical model sheet and mark the
 * re-anchor: new sheet image + anchor string, a REANCHOR production
 * event, an IDENTITY_REANCHOR continuity event (the drift-curve
 * marker), and an optional vision re-score of their most recent
 * scored panels against the NEW sheet so the restarted baseline has
 * fresh points immediately.
 */
export async function reanchorCharacter(
  characterId: string,
  opts?: { rescore?: number; actor?: "DSH" | "USER" },
): Promise<{ ok: true; result: ReanchorResult } | { ok: false; error: string }> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    include: { project: { select: { id: true } } },
  });
  if (!character) return { ok: false, error: "Character not found" };

  const oldAnchor = character.modelSheetPrompt;

  // regenerate the canonical sheet from the CURRENT design text
  let sheet: Awaited<ReturnType<typeof generateCharacterModelSheet>>;
  try {
    sheet = await generateCharacterModelSheet(characterId);
  } catch (err) {
    return { ok: false, error: `Sheet regeneration failed: ${err instanceof Error ? err.message : "image provider error"}` };
  }

  const now = new Date();
  const actor = opts?.actor ?? "USER";
  const anchorHead = sheet.anchor.slice(0, 180);
  const oldHead = oldAnchor ? oldAnchor.slice(0, 120) : null;

  await db.productionEvent.create({
    data: {
      projectId: character.project.id,
      actor,
      type: "REANCHOR",
      summary: `Re-anchored ${character.name}: canonical model sheet regenerated, identity baseline restarts`,
      payload: JSON.stringify({ characterId: character.id, oldAnchor: oldHead, newAnchor: sheet.anchor.slice(0, 400) }),
    },
  });
  await db.continuityEvent.create({
    data: {
      projectId: character.project.id,
      entityType: "CHARACTER",
      entityName: character.name,
      kind: "IDENTITY_REANCHOR",
      episodeNumber: null,
      severity: "INFO",
      description: `re-anchor ${character.name}: canonical sheet regenerated from the current design text, drift curve baseline restarts. New anchor: ${anchorHead}${oldHead ? ` (replaced: ${oldHead})` : ""}`.slice(0, 900),
    },
  });

  // re-score the character's most recent scored panels against the NEW sheet
  const rescore = Math.max(0, Math.min(REANCHOR_MAX_RESCORE, Math.round(Number(opts?.rescore ?? REANCHOR_DEFAULT_RESCORE) || 0)));
  const rescored: ReanchorScoredRow[] = [];
  const rescoreErrors: Array<{ ref: string; error: string }> = [];
  if (rescore > 0) {
    const recent = await db.identityScore.findMany({
      where: { projectId: character.project.id, source: "PANEL" },
      include: { shot: { include: { scene: { include: { episode: true } } } } },
      orderBy: { scoredAt: "desc" },
      take: 24,
    });
    const mine = recent
      .filter((r) => {
        try {
          const parsed = JSON.parse(r.scores) as Array<{ characterName?: unknown }>;
          return Array.isArray(parsed) && parsed.some((e) => e?.characterName === character.name);
        } catch {
          return false;
        }
      })
      .slice(0, rescore);
    for (const row of mine) {
      const ref = `E${row.shot.scene.episode.number} Sc${row.shot.scene.number} S${String(row.shot.number).padStart(3, "0")}`;
      const res = await scoreShotIdentity(row.shotId);
      if (res.ok) {
        const mineEntry = res.scored.verdict.entries.find((e) => e.characterName === character.name);
        rescored.push({ ref, shotId: row.shotId, worst: res.scored.verdict.worst, entryForCharacter: mineEntry?.similarity ?? null });
      } else {
        rescoreErrors.push({ ref, error: res.error });
      }
    }
  }

  return {
    ok: true,
    result: {
      characterId: character.id,
      characterName: character.name,
      projectId: character.project.id,
      oldAnchor,
      newAnchor: sheet.anchor,
      modelSheetUrl: sheet.modelSheetUrl,
      rescored,
      rescoreErrors,
      rescoredAt: now.toISOString(),
    },
  };
}

/** Resolve a character by name within one production, then re-anchor them. */
export async function reanchorByName(
  projectId: string,
  name: string,
  opts?: { rescore?: number; actor?: "DSH" | "USER" },
): Promise<{ ok: true; result: ReanchorResult } | { ok: false; error: string }> {
  const clean = String(name ?? "").trim();
  if (!clean) return { ok: false, error: "characterName is required" };
  const character = await db.character.findFirst({ where: { projectId, name: clean } });
  if (!character) {
    const known = await db.character.findMany({ where: { projectId }, select: { name: true } });
    return { ok: false, error: `No character named "${clean}" in this production. Cast: ${known.map((c) => c.name).join(", ") || "none"}.` };
  }
  return reanchorCharacter(character.id, opts);
}
