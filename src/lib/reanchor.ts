import { db } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";
import { generateCharacterModelSheet } from "@/lib/ai/art";
import { scoreShotIdentity } from "@/lib/identity";
import { characterDesignDna } from "@/lib/animation/design";
import { readSheetDna } from "@/lib/blender/adherence";
import { extractSheetPalette, designDyeClass, hexDist } from "@/lib/blender/sheet-palette";

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

// ─────────────────────────────────────────────────────────────
// THE SHEET ACCEPTANCE (iteration 149) - the reference does not
// move under an honest receipt.
//
// The 148 night's finding, named: the repair's re-anchor beat
// regenerated the canonical sheet for every still-below member with
// NO acceptance and NO stability - the regenerated sheets judge
// harsher than the anchored truth (the 146 night's +25 rode the
// same beat; the 148 night's same beat subtracted). A sheet that
// changes every regeneration is not a reference.
//
// The night130 law is the gate the beat was missing: the BUILD DNA
// (what actually poisons the render) measured against the committed
// design dyes through designDyeClass (VALUE and HUE together):
//
//   - the build IN the design's class -> THE HONEST RECEIPT STANDS:
//     no regeneration is owed, the reference does not move, the
//     still-below is named honestly (the craft lever for a score is
//     the craft, never a moved goalpost);
//   - the build OUT of the design's class -> the sheet itself is the
//     drifted artifact and the reference must be re-derived: bounded
//     best-of-SHEET_ACCEPT_ATTEMPTS candidates, each measured in its
//     own pixels through the SAME hue-class measure BEFORE it may
//     install; the first candidate IN class installs (file + row +
//     both canonical events + the sheet DNA re-read); every candidate
//     OUT means THE CHANNEL KEPT ITS DRIFT and the standing sheet
//     remains the reference (never install an un-honest sheet);
//   - no dyes to judge (a guess build, no design robe) -> the
//     canonical re-anchor proceeds under the old law, named.
// ─────────────────────────────────────────────────────────────

/** The bounded best-of (the night130 law's own bound). */
export const SHEET_ACCEPT_ATTEMPTS = 3;

export type SheetAcceptanceVerdict = "STAND_DOWN_HONEST" | "REGEN_OWED" | "CANONICAL_FALLTHROUGH";

/** The PURE gate (the E2E asserts it): what the build's class read
 * owes the reference. null = the acceptance has no voice. */
export function acceptanceGateVerdict(buildOut: boolean | null): SheetAcceptanceVerdict {
  if (buildOut === null) return "CANONICAL_FALLTHROUGH";
  return buildOut ? "REGEN_OWED" : "STAND_DOWN_HONEST";
}

export interface SheetClassRead {
  measured: boolean;
  nearest: string | null;
  out: boolean | null;
  dLum: number | null;
  dHue: number | null;
}

/** THE SHEET'S OWN CLASS (the night130 measure): the sheet file's
 * measured palette, the nearest cluster to the design robe dye, that
 * cluster's distance from the design's class. Deterministic: the
 * same bytes always land the same read. */
export async function measureSheetClass(sheetUrl: string | null | undefined, designRobe: string | null | undefined): Promise<SheetClassRead> {
  if (!sheetUrl || !designRobe || !designRobe.startsWith("#")) return { measured: false, nearest: null, out: null, dLum: null, dHue: null };
  const p = path.join(process.cwd(), "public", sheetUrl.split("?")[0]);
  if (!fs.existsSync(p)) return { measured: false, nearest: null, out: null, dLum: null, dHue: null };
  let palette: string[];
  try {
    palette = await extractSheetPalette(await fs.promises.readFile(p));
  } catch {
    return { measured: false, nearest: null, out: null, dLum: null, dHue: null };
  }
  if (!palette.length) return { measured: false, nearest: null, out: null, dLum: null, dHue: null };
  let nearest = palette[0];
  for (const c of palette) if (hexDist(designRobe, c) < hexDist(designRobe, nearest)) nearest = c;
  const cls = designDyeClass(nearest, designRobe);
  return { measured: true, nearest, out: cls.out, dLum: cls.dLum, dHue: cls.dHue };
}

export interface AcceptedReanchorOutcome {
  /** boolean, not the `true` literal (the 155 repair): the outcome
   * carries real failure variants (character missing, canonical
   * failure) - the literal lied, and the fresh toolchain the tenth
   * drift's rebuild installed caught it. */
  ok: boolean;
  characterId: string;
  characterName: string;
  projectId: string;
  verdict: SheetAcceptanceVerdict;
  /** a new sheet was measured IN class and installed (or the
   * canonical fall-through fired - the old law's own decision). */
  accepted: boolean;
  /** candidates generated (0 on a stand-down). */
  attempts: number;
  gate: { buildRobe: string | null; designRobe: string | null; dLum: number | null; dHue: number | null };
  note: string;
  /** the canonical payload when a sheet installed. */
  result?: ReanchorResult;
  error?: string;
}

/** Install an accepted candidate: the candidate file becomes the
 * canonical sheet (file + row), BOTH canonical events fire (the
 * canonical law - the drift curve restarts), and the sheet DNA is
 * re-read so the build compiles through the NEW sheet (the night130
 * law's own step 4). */
async function installAcceptedSheet(
  characterId: string,
  candidate: Awaited<ReturnType<typeof generateCharacterModelSheet>> & { installed: false },
  character: { id: string; name: string; projectId: string; modelSheetPrompt: string | null },
  actor: "DSH" | "USER",
  attempt: number,
  cls: SheetClassRead,
): Promise<ReanchorResult> {
  const canonicalPath = path.join(process.cwd(), "public", "sheets", `${characterId}.png`);
  const candidatePath = path.join(process.cwd(), "public", candidate.modelSheetUrl.split("?")[0]);
  await fs.promises.copyFile(candidatePath, canonicalPath);
  try { fs.unlinkSync(candidatePath); } catch {}

  const now = new Date();
  const modelSheetUrl = `/sheets/${characterId}.png?v=${Date.now()}`;
  const anchorHead = candidate.anchor.slice(0, 180);
  const oldHead = character.modelSheetPrompt ? character.modelSheetPrompt.slice(0, 120) : null;
  const classNote = `dLum ${cls.dLum?.toFixed(3) ?? "-"}, dHue ${cls.dHue !== null && cls.dHue !== undefined ? cls.dHue.toFixed(3) : "exempt"}`;

  await db.character.update({
    where: { id: characterId },
    data: { modelSheetUrl, modelSheetPrompt: candidate.anchor, modelSheetAt: now },
  });
  await db.productionEvent.create({
    data: {
      projectId: character.projectId,
      actor,
      type: "REANCHOR",
      summary: `Re-anchored ${character.name}: canonical model sheet regenerated AND ACCEPTED at candidate ${attempt} (the hue-class honest receipt: ${classNote}) - identity baseline restarts`,
      payload: JSON.stringify({ characterId, oldAnchor: oldHead, newAnchor: candidate.anchor.slice(0, 400), acceptance: { attempt, attempts: SHEET_ACCEPT_ATTEMPTS, classRead: cls } }),
    },
  });
  await db.continuityEvent.create({
    data: {
      projectId: character.projectId,
      entityType: "CHARACTER",
      entityName: character.name,
      kind: "IDENTITY_REANCHOR",
      episodeNumber: null,
      severity: "INFO",
      description: `re-anchor ${character.name}: accepted sheet installed through the hue-class honest receipt (${classNote}); drift curve baseline restarts. New anchor: ${anchorHead}${oldHead ? ` (replaced: ${oldHead})` : ""}`.slice(0, 900),
    },
  });

  // the build compiles through the NEW sheet (the night130 law's step 4)
  const dna = await readSheetDna(characterId, { refresh: true });

  return {
    characterId,
    characterName: character.name,
    projectId: character.projectId,
    oldAnchor: character.modelSheetPrompt,
    newAnchor: candidate.anchor,
    modelSheetUrl,
    rescored: [],
    rescoreErrors: dna.ok ? [] : [{ ref: "sheet-dna", error: dna.error ?? "re-read failed" }],
    rescoredAt: now.toISOString(),
  };
}

/**
 * THE RE-ANCHOR BEAT WITH ITS SHEET ACCEPTANCE (iteration 149): the
 * night130 gate decides whether the reference may move at all; a
 * regeneration owed runs the bounded best-of candidates, each
 * measured in its own pixels BEFORE it may install; the standing
 * sheet survives every refused candidate byte-exact.
 *
 * `buildRobe` rides in from the caller's own fresh DNA read when one
 * exists (the repair pass reads it in its a-1 half); without one the
 * gate reads the sheet itself, and with no dyes to judge the
 * canonical re-anchor proceeds under the old law, named.
 */
export async function reanchorWithSheetAcceptance(
  characterId: string,
  opts?: { buildRobe?: string | null; actor?: "DSH" | "USER" },
): Promise<AcceptedReanchorOutcome> {
  const character = await db.character.findUnique({
    where: { id: characterId },
    include: { states: { orderBy: { episodeNumber: "asc" } } },
  });
  if (!character) return { ok: false, characterId, characterName: "", projectId: "", verdict: "CANONICAL_FALLTHROUGH", accepted: false, attempts: 0, gate: { buildRobe: null, designRobe: null, dLum: null, dHue: null }, note: "character missing", error: "Character not found" };

  const latestState = [...character.states].sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0] ?? null;
  const design = characterDesignDna({
    name: character.name,
    role: character.role,
    appearance: character.appearance,
    modelSheetPrompt: character.modelSheetPrompt,
    stateClothing: latestState?.clothing ?? null,
    stateWeapon: latestState?.weapon ?? null,
  });
  const designRobe = design.robeColor ?? null;

  // the gate rides the caller's fresh build read when given; else the
  // sheet's own cached DNA read
  let buildRobe = opts?.buildRobe ?? null;
  if (buildRobe === null) {
    const dna = await readSheetDna(characterId);
    buildRobe = dna.ok ? dna.dna.robeColor : null;
  }
  const gate = buildRobe && designRobe ? designDyeClass(buildRobe, designRobe) : null;
  const gateOut = gate ? gate.out : null;
  const verdict = acceptanceGateVerdict(gateOut);
  const g = { buildRobe: buildRobe ?? null, designRobe, dLum: gate?.dLum ?? null, dHue: gate?.dHue ?? null };
  const base = { characterId, characterName: character.name, projectId: character.projectId, gate: g };

  if (verdict === "STAND_DOWN_HONEST") {
    return {
      ok: true,
      ...base,
      verdict,
      accepted: false,
      attempts: 0,
      // the 155 repair: the verdict derives from a non-null gate's own
      // read, so the ternaries ride the true side at runtime - but the
      // compiler cannot see the derivation, so the null-safety is
      // spelled (no `?.` into a method call).
      note: `the honest receipt stands - the build (${buildRobe}) wears the design's class (dLum ${gate ? gate.dLum.toFixed(3) : "n/a"}, dHue ${gate && gate.dHue !== null ? gate.dHue.toFixed(3) : "exempt"}); the reference does not move`,
    };
  }

  if (verdict === "CANONICAL_FALLTHROUGH") {
    // no dyes to judge: the canonical decision is its own law (the
    // old behavior), named
    const ra = await reanchorCharacter(characterId, { rescore: 0, actor: opts?.actor ?? "USER" });
    if (!ra.ok) {
      return { ok: false, ...base, verdict, accepted: false, attempts: 0, note: "the canonical re-anchor failed", error: ra.error };
    }
    return { ok: true, ...base, verdict, accepted: true, attempts: 0, note: "no dyes to judge - the canonical re-anchor proceeded under the old law", result: ra.result };
  }

  // REGEN_OWED: the bounded best-of candidates, each measured BEFORE
  // it may install - the standing sheet survives every refusal.
  let lastRead: SheetClassRead = { measured: false, nearest: null, out: null, dLum: null, dHue: null };
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= SHEET_ACCEPT_ATTEMPTS; attempt++) {
    let candidate;
    try {
      candidate = await generateCharacterModelSheet(characterId, { install: false });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "image provider error";
      continue;
    }
    lastRead = await measureSheetClass(candidate.modelSheetUrl, designRobe);
    if (lastRead.measured && lastRead.out === false) {
      const result = await installAcceptedSheet(characterId, candidate, character, opts?.actor ?? "USER", attempt, lastRead);
      return {
        ok: true,
        ...base,
        verdict,
        accepted: true,
        attempts: attempt,
        note: `candidate ${attempt}/${SHEET_ACCEPT_ATTEMPTS} measured IN the design's class and installed (dLum ${lastRead.dLum?.toFixed(3)}, dHue ${lastRead.dHue !== null ? lastRead.dHue.toFixed(3) : "exempt"})`,
        result,
      };
    }
  }

  const why = lastError
    ? `the last candidate failed to generate (${lastError})`
    : lastRead.measured
      ? `the last candidate measured OUT (nearest ${lastRead.nearest}, dLum ${lastRead.dLum?.toFixed(3)}, dHue ${lastRead.dHue !== null ? lastRead.dHue.toFixed(3) : "exempt"})`
      : "the last candidate could not be measured";
  return {
    ok: true,
    ...base,
    verdict,
    accepted: false,
    attempts: SHEET_ACCEPT_ATTEMPTS,
    note: `the channel kept its drift - ${SHEET_ACCEPT_ATTEMPTS} candidates, none IN the design's class (${why}); the standing sheet remains the reference`,
  };
}

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
