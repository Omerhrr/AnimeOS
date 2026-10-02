// ─────────────────────────────────────────────────────────────
// THE CHOREOGRAPHER'S CONSULT (iteration 117) - the DB side of the
// action choreographer. Every render job funnel (createRenderJob)
// consults the expert before the payload assembles: the shot's own
// words compile into ACTION DNA and the shot's EMPTY action columns
// receive it. THE RANK LAW: explicit direction outranks the expert -
// per column. A column DSH or the creator directed is never touched;
// the event ledger names exactly what the expert filled, so the
// direction is auditable and overridable (set_shot_grammar /
// set_shot_fx / set_shot_physics all outrank from then on).
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import {
  compileActionDna,
  type ActionBrief,
} from "@/lib/crew/action-choreographer";
import { pairedProgramFromGrammar } from "@/lib/animation/paired-performance";
import { detectCast } from "@/lib/ai/art";

/** The slice of the Shot the consult reads (createRenderJob's loaded
 * row satisfies this shape). */
export interface ChoreographerShot {
  id: string;
  number: number;
  description: string | null;
  lighting: string | null;
  movement: string | null;
  duration: number | null;
  grammar: string | null;
  fx: string | null;
  physics: string | null;
  audioCues: Array<{ kind: string; label: string; startMs: number }>;
}

export interface ConsultResult {
  /** The columns the expert filled (empty when it declined). */
  directed: Array<"grammar" | "fx" | "physics" | "pairedChoreo">;
  /** The exact column values the expert wrote - the caller patches
   * its OWN in-memory shot row with these so THIS job's payload
   * carries the DNA (the consult never assumed the caller's row
   * identity: a patch, not a mutation of a borrowed object). */
  patch: Record<string, string>;
  /** The one-line read for the caller's evidence. */
  line: string | null;
  decline: string | null;
}

const has = (col: string | null | undefined): boolean => {
  if (!col) return false;
  try {
    const v = JSON.parse(col);
    return Array.isArray(v) && v.length > 0;
  } catch {
    return false;
  }
};

/** Consult the choreographer for one shot. Writes ONLY the shot's
 * empty action columns (per column), patches the in-memory row so
 * THIS job's payload carries the DNA, and lands one event naming
 * what the expert directed. Pure decline = no writes, no event. */
export async function consultActionChoreographer(
  projectId: string,
  shot: ChoreographerShot,
): Promise<ConsultResult> {
  const brief: ActionBrief = {
    description: shot.description,
    lighting: shot.lighting,
    movement: shot.movement,
    duration: shot.duration,
    audioCues: (shot.audioCues ?? []).map((c) => ({ kind: c.kind, label: c.label, startMs: c.startMs })),
  };
  const dna = compileActionDna(brief);
  if (!dna.ok) return { directed: [], patch: {}, line: null, decline: dna.decline };

  const patch: Record<string, string> = {};
  const directed: ConsultResult["directed"] = [];
  if (dna.grammar && !has(shot.grammar)) { patch.grammar = dna.grammar; directed.push("grammar"); }
  if (dna.fx && !has(shot.fx)) { patch.fx = dna.fx; directed.push("fx"); }
  if (dna.physics && !has(shot.physics)) { patch.physics = dna.physics; directed.push("physics"); }

  // THE DUEL PERFORMS (iteration 119): when the directed action
  // strikes and a SECOND cast member stands on the stage, the
  // choreographer also writes the partner's ANSWER program (the hero's
  // SLASH is his BLOCK) into the shot's empty pairedChoreo column -
  // one performance on two bodies, never two statues standing apart.
  // Explicit direction (set_shot_choreography's paired argument)
  // outranks the expert per the rank law.
  let pairedLine: string | null = null;
  if (dna.grammar) {
    const hasPaired = (() => {
      try {
        const v = (shot as unknown as { pairedChoreo?: string | null }).pairedChoreo;
        return Boolean(v && JSON.parse(v));
      } catch { return true; }
    })();
    if (!hasPaired) {
      const castRows = await db.character.findMany({ where: { projectId }, include: { states: true } });
      const detected = detectCast(castRows, shot.description ?? "").slice(0, 2);
      if (detected.length >= 2) {
        const paired = pairedProgramFromGrammar(dna.grammar, detected[1].name);
        if (paired) {
          patch.pairedChoreo = JSON.stringify(paired.program);
          directed.push("pairedChoreo");
          pairedLine = `THE DUEL PERFORMS: ${detected[1].name} answers on one clock (${paired.program.keys.length} keys - ${paired.derivation.filter((d) => d.includes(":strike")).length} strike beat(s) met)`;
        }
      }
    }
  }

  if (directed.length === 0) return { directed: [], patch: {}, line: null, decline: null };

  await db.shot.update({ where: { id: shot.id }, data: patch });

  const label = `Shot ${String(shot.number).padStart(3, "0")}`;
  const summary = `THE CHOREOGRAPHER DIRECTED ${label}: ${dna.line} (filled ${directed.join(", ")})${pairedLine ? ` - ${pairedLine}` : ""} - compiled from the shot's own words; explicit direction outranks the expert`;
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "TOOL_CALL",
      summary,
      payload: JSON.stringify({
        expert: "choreographer",
        shotId: shot.id,
        filled: directed,
        events: dna.events,
        grammar: dna.grammar ? JSON.parse(dna.grammar) : null,
        fx: dna.fx ? JSON.parse(dna.fx) : null,
        physics: dna.physics ? JSON.parse(dna.physics) : null,
      }),
    },
  });

  return { directed, patch, line: dna.line, decline: null };
}
