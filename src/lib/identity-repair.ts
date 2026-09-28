/**
 * identity-repair - THE GAP IS REPAIRED (iteration 80).
 *
 * The standing is the work order (THE CAST ANSWERS THE BAR): a BELOW
 * member is NAMED with their worst shot ref - and a work order nobody
 * executes is a shame, not a plan. This module is the loop that
 * executes it, in two halves:
 *
 *   (a) RE-RENDER: the member's sheet is read into build DNA (the
 *       vision read, cached on the character - THE DNA ADHERES TO THE
 *       SHEET), their worst shots re-render over the real engine with
 *       the adherent DNA riding, and every re-render is re-scored by
 *       the REAL vision channel against the same sheet.
 *
 *   (b) RE-ANCHOR: a member still below after the re-renders has their
 *       canonical sheet regenerated from the current design text
 *       (reanchorCharacter - the same canonical decision the drift
 *       loop uses), and the shots are re-scored against the NEW sheet.
 *
 * The ledger is honest by construction: per shot the before reading,
 * the after reading, and the verdict the pair earns - REPAIRED (the
 * bar is cleared), IMPROVED (moved up, bar not cleared), UNCHANGED,
 * WORSE, or UNSCORED (the re-score failed - named, not hidden). The
 * cast standing is read again when the loop ends: the gap that
 * remains is named, never averaged away.
 */

import { db } from "@/lib/db";
import { castIdentityMeasurement, scoreRenderIdentity, type CastIdentityMeasurement, type IdentitySource } from "@/lib/identity";
import { readSheetDna, parseSilhouetteShape, silhouetteShapeLine, parseFaceProfile, faceProfileLine, parseMaterialProfile, materialProfileLine } from "@/lib/blender/adherence";
import { reanchorCharacter } from "@/lib/reanchor";
import { createRenderJob, tickRenderJob } from "@/lib/engine/render";

// ── the loop's knobs (bounded: a repair pass is a pass, not a night) ──
export const REPAIR_MAX_MEMBERS = 4;
export const REPAIR_MAX_SHOTS_PER_MEMBER = 3;
export const REPAIR_TICKS = 420;
export const REPAIR_TICK_MS = 500;

export type ShotRepairVerdict = "REPAIRED" | "IMPROVED" | "UNCHANGED" | "WORSE" | "UNSCORED";
export type MemberRepairVerdict = "REPAIRED" | "IMPROVED" | "STILL_BELOW" | "UNSCORED";

export interface RepairShotRow {
  ref: string;
  shotId: string;
  before: number;
  after: number | null;
  verdict: ShotRepairVerdict;
  error?: string;
}

export interface RepairMemberRow {
  characterId: string;
  name: string;
  before: { standing: string; average: number | null; worst: number | null; worstRef: string | null };
  dna: { source: "cached" | "read" | "failed" | "skipped"; line: string };
  shots: RepairShotRow[];
  reanchored: boolean;
  reanchorError?: string;
  after: { standing: string; average: number | null; worst: number | null };
  verdict: MemberRepairVerdict;
}

export interface RepairPassResult {
  projectId: string;
  source: IdentitySource;
  bar: number;
  members: RepairMemberRow[];
  before: { below: number; clearing: number; measured: number };
  after: { below: number; clearing: number; measured: number };
}

// ── the pure verdict law (the E2E asserts it) ──

/** The verdict one before→after pair earns against the bar. */
export function shotRepairVerdict(before: number, after: number | null, bar: number): ShotRepairVerdict {
  if (after === null || !Number.isFinite(after)) return "UNSCORED";
  if (after >= bar) return "REPAIRED";
  if (after > before) return "IMPROVED";
  if (after === before) return "UNCHANGED";
  return "WORSE";
}

/** The member's verdict: any repaired shot repairs the member; any
 * improved shot improves them; all-scored-but-unmoved is still below;
 * a member with nothing scored is honestly unscored. */
export function memberRepairVerdict(shots: RepairShotRow[]): MemberRepairVerdict {
  if (shots.length === 0) return "UNSCORED";
  if (shots.some((s) => s.verdict === "REPAIRED")) return "REPAIRED";
  if (shots.some((s) => s.verdict === "IMPROVED")) return "IMPROVED";
  if (shots.every((s) => s.verdict === "UNSCORED")) return "UNSCORED";
  return "STILL_BELOW";
}

export function repairVerdictLine(v: MemberRepairVerdict): string {
  switch (v) {
    case "REPAIRED": return "REPAIRED - the bar is cleared";
    case "IMPROVED": return "IMPROVED - moved up, bar not cleared yet";
    case "STILL_BELOW": return "STILL BELOW - the re-render moved nothing";
    case "UNSCORED": return "UNSCORED - the re-score failed, named in the ledger";
  }
}

// ── the loader: a BELOW member's worst shots, by their own readings ──

export interface BelowShot {
  shotId: string;
  ref: string;
  similarity: number;
}

/**
 * The named shots where this character's own vision reading sits
 * under the bar (RENDER source), worst first - exactly the queue the
 * standing names, resolved from the persisted per-character entries.
 */
export async function belowRenderShotsForCharacter(
  projectId: string,
  characterName: string,
  bar: number,
  limit: number,
): Promise<BelowShot[]> {
  const rows = await db.identityScore.findMany({
    where: { projectId, source: "RENDER" },
    include: { shot: { include: { scene: { include: { episode: true } } } } },
    orderBy: { scoredAt: "desc" },
    take: 64,
  });
  const out: BelowShot[] = [];
  for (const row of rows) {
    let entries: Array<{ characterName?: unknown; similarity?: unknown }> = [];
    try {
      const parsed = JSON.parse(row.scores);
      if (Array.isArray(parsed)) entries = parsed;
    } catch {
      continue;
    }
    const mine = entries.find((e) => e?.characterName === characterName);
    if (!mine || typeof mine.similarity !== "number") continue;
    if (mine.similarity >= bar) continue;
    out.push({
      shotId: row.shotId,
      ref: `E${row.shot.scene.episode.number} Sc${row.shot.scene.number} S${String(row.shot.number).padStart(3, "0")}`,
      similarity: mine.similarity,
    });
  }
  return out.sort((a, b) => a.similarity - b.similarity).slice(0, Math.max(1, limit));
}

// ── the render wait (bounded, in-process) ──

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function renderAndWait(projectId: string, shotId: string): Promise<{ ok: boolean; status: string }> {
  const job = await createRenderJob(projectId, shotId, "PREVIEW");
  if (!job) return { ok: false, status: "no-job" };
  let ticked = await tickRenderJob(job.id);
  for (let i = 0; i < REPAIR_TICKS && ticked && ticked.status === "RENDERING"; i++) {
    await sleep(REPAIR_TICK_MS);
    ticked = await tickRenderJob(job.id);
  }
  return {
    ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl,
    status: `${ticked?.status ?? "lost"} ${ticked?.stage ?? ""}`.trim(),
  };
}

// ── the loop ──

function standingSnapshot(m: CastIdentityMeasurement) {
  return { below: m.below, clearing: m.clearing, measured: m.measured };
}

function memberSnapshot(m: CastIdentityMeasurement, characterId: string) {
  const mem = m.members.find((x) => x.characterId === characterId);
  if (!mem) return { standing: "ABSENT", average: null, worst: null, worstRef: null };
  return { standing: mem.standing, average: mem.average, worst: mem.worst, worstRef: mem.worstRef };
}

/**
 * Run the repair loop over the production's BELOW cast members
 * (RENDER bar): re-read their sheet DNA, re-render their worst named
 * shots, re-score with the real vision channel, re-anchor the members
 * the re-render could not lift (when reanchor is on), and read the
 * standing again. Every miss is named in the ledger.
 */
export async function runIdentityRepairPass(
  projectId: string,
  opts?: { members?: number; shotsPerMember?: number; reanchor?: boolean; nameFilter?: string },
): Promise<RepairPassResult> {
  const memberLimit = Math.max(1, Math.min(REPAIR_MAX_MEMBERS, Math.round(Number(opts?.members ?? 2) || 2)));
  const shotLimit = Math.max(1, Math.min(REPAIR_MAX_SHOTS_PER_MEMBER, Math.round(Number(opts?.shotsPerMember ?? 1) || 1)));
  const reanchor = opts?.reanchor !== false;
  const nameFilter = (opts?.nameFilter ?? "").trim().toLowerCase();

  const before = await castIdentityMeasurement(projectId, "RENDER");
  const belowMembers = before.members
    .filter((m) => m.standing === "BELOW")
    .filter((m) => !nameFilter || m.name.toLowerCase().includes(nameFilter))
    .slice(0, memberLimit);

  const rows: RepairMemberRow[] = [];
  for (const member of belowMembers) {
    // (a-1) THE SHEET IS READ INTO BUILD DNA: a fresh vision read (the
    // cache is deliberately bypassed - a repair re-measures its truth)
    let dna: RepairMemberRow["dna"] = { source: "skipped", line: `${member.name}: no sheet read attempted` };
    if (member.anchored) {
      const read = await readSheetDna(member.characterId, { refresh: true });
      dna = read.ok
        ? { source: read.source, line: adherenceLineFromRead(member.name, read.dna) }
        : { source: "failed", line: `${member.name}: sheet DNA read failed - ${read.error}` };
    } else {
      dna = { source: "skipped", line: `${member.name}: unanchored cannot be repaired against nothing` };
    }

    // (a-2) RE-RENDER the named worst shots with the adherent DNA riding
    const targets = await belowRenderShotsForCharacter(projectId, member.name, before.bar, shotLimit);
    const shotRows: RepairShotRow[] = [];
    for (const t of targets) {
      const rendered = await renderAndWait(projectId, t.shotId);
      if (!rendered.ok) {
        shotRows.push({ ref: t.ref, shotId: t.shotId, before: t.similarity, after: null, verdict: "UNSCORED", error: `re-render did not finish (${rendered.status})` });
        continue;
      }
      const rescored = await scoreRenderIdentity(t.shotId);
      const after = rescored.ok ? rescored.scored.verdict.entries.find((e) => e.characterName === member.name)?.similarity ?? null : null;
      shotRows.push({
        ref: t.ref,
        shotId: t.shotId,
        before: t.similarity,
        after,
        verdict: shotRepairVerdict(t.similarity, after, before.bar),
        ...(rescored.ok ? {} : { error: rescored.error }),
      });
    }

    let reanchored = false;
    let reanchorError: string | undefined;

    // (b) STILL BELOW -> the sheet itself answers next: regenerate it
    // from the current design text, then re-score the same shots
    // against the NEW sheet (the re-anchor is the loop's second half).
    if (reanchor && memberRepairVerdict(shotRows) !== "REPAIRED" && member.anchored) {
      const ra = await reanchorCharacter(member.characterId, { rescore: 0, actor: "DSH" });
      if (ra.ok) {
        reanchored = true;
        for (const row of shotRows) {
          if (row.verdict === "REPAIRED") continue;
          const rescored = await scoreRenderIdentity(row.shotId);
          const after = rescored.ok ? rescored.scored.verdict.entries.find((e) => e.characterName === member.name)?.similarity ?? null : null;
          row.after = after;
          row.verdict = shotRepairVerdict(row.before, after, before.bar);
          if (!rescored.ok) row.error = rescored.error;
        }
      } else {
        reanchorError = ra.error;
      }
    }

    rows.push({
      characterId: member.characterId,
      name: member.name,
      before: { standing: member.standing, average: member.average, worst: member.worst, worstRef: member.worstRef },
      dna,
      shots: shotRows,
      reanchored,
      ...(reanchorError ? { reanchorError } : {}),
      after: memberSnapshot(await castIdentityMeasurement(projectId, "RENDER"), member.characterId),
      verdict: memberRepairVerdict(shotRows),
    });
  }

  const after = await castIdentityMeasurement(projectId, "RENDER");

  const result: RepairPassResult = {
    projectId,
    source: "RENDER",
    bar: before.bar,
    members: rows,
    before: standingSnapshot(before),
    after: standingSnapshot(after),
  };

  // the loop's landing: one production event carrying the ledger
  if (rows.length > 0) {
    await db.productionEvent.create({
      data: {
        projectId,
        actor: "DSH",
        type: "IDENTITY_REPAIR",
        summary: `Identity repair pass: ${rows.length} below member(s) worked - ${rows.filter((r) => r.verdict === "REPAIRED").length} repaired, ${rows.filter((r) => r.verdict === "IMPROVED").length} improved, ${rows.filter((r) => r.verdict === "STILL_BELOW").length} still below; standing ${standingSnapshot(before).below} below -> ${standingSnapshot(after).below} below at bar ${Math.round(before.bar * 100)}%`,
        payload: JSON.stringify({
          bar: before.bar,
          before: standingSnapshot(before),
          after: standingSnapshot(after),
          members: rows.map((r) => ({
            name: r.name,
            dna: r.dna,
            reanchored: r.reanchored,
            verdict: r.verdict,
            shots: r.shots.map((s) => ({ ref: s.ref, before: s.before, after: s.after, verdict: s.verdict, error: s.error })),
          })),
        }),
      },
    });
  }

  return result;
}

/** The sheet read as one adherence line (read-shaped, for the ledger) -
 * THE SILHOUETTE SHAPES THE MESH: the shaping the sheet's own
 * silhouette sentence compiles into rides the line when it applies;
 * THE FACE IS SCULPTED, NOT ASSEMBLED: the face family's bounded
 * profile rides it too; THE SURFACE IS GRADED, NOT PAINTED: the
 * material grade compiled from the read's own hexes rides with them. */
function adherenceLineFromRead(name: string, read: { hairStyle: unknown; hairColor: unknown; robeColor: unknown; robeAccent: unknown; skinTone: unknown; weaponType: unknown; build: unknown; beard: unknown; silhouette: unknown; faceShape?: unknown }): string {
  const owned: string[] = [];
  if (read.hairStyle !== null) owned.push("hairStyle");
  if (read.hairColor !== null) owned.push("hairColor");
  if (read.robeColor !== null) owned.push("robeColor");
  if (read.robeAccent !== null) owned.push("robeAccent");
  if (read.skinTone !== null) owned.push("skinTone");
  if (read.weaponType !== null) owned.push("weaponType");
  if (read.build !== null) owned.push("build");
  if (read.beard !== null) owned.push("beard");
  if (read.faceShape !== null && read.faceShape !== undefined) owned.push("faceShape");
  const shape = parseSilhouetteShape(typeof read.silhouette === "string" ? read.silhouette : null, typeof read.build === "string" ? read.build : null);
  const shapeLine = silhouetteShapeLine(shape);
  const face = parseFaceProfile(typeof read.faceShape === "string" ? read.faceShape : null, typeof read.build === "string" ? read.build : null);
  const faceLine = faceProfileLine(face);
  const materials = parseMaterialProfile(typeof read.skinTone === "string" ? read.skinTone : null, typeof read.robeColor === "string" ? read.robeColor : null, typeof read.hairColor === "string" ? read.hairColor : null);
  const materialLine = materialProfileLine(materials);
  return owned.length > 0
    ? `${name}: sheet-adherent build (${owned.join(", ")} from the sheet read; palette pull 0.75; ${shapeLine}; ${faceLine}; ${materialLine})`
    : `${name}: guess build (regex DNA only) - the sheet read landed nothing usable`;
}
