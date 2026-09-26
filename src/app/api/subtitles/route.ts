// ─────────────────────────────────────────────────────────────
// SUBTITLE TRANSLATION (Terminology-memory-enforced)
// POST {action:"translate", projectId, targetLang, srt?|episodeId?}
//   - srt given: translate that document
//   - episodeId given: build cues from the episode's dialogue
//     (cumulative shot-duration timing) and translate those
// EDITOR+ only (it spends provider calls); VIEWERs are read-only
// and the proxy already refuses them before this route runs.
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { authGuardResponse, requireRole } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { parseSrt, serializeSrt, type SrtCue } from "@/lib/subtitles/srt";
import {
  buildEpisodeDialogueCues,
  normalizeLangTag,
  translateSubtitleCues,
} from "@/lib/subtitles/translate";

export const maxDuration = 300;

export async function POST(req: Request) {
  const guard = await requireRole(req, "EDITOR");
  if (!guard.ok) return authGuardResponse(guard)!;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "translate") {
    return Response.json({ error: "Unknown action - use {action:'translate'}" }, { status: 400 });
  }

  const projectId = String(body.projectId ?? "");
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId, { write: true });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const targetLang = normalizeLangTag(String(body.targetLang ?? ""));
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(targetLang)) {
    return Response.json({ error: "targetLang must be a language tag like en-US or ja-JP" }, { status: 400 });
  }

  const source = typeof body.srt === "string" ? body.srt.trim() : "";
  const episodeId = typeof body.episodeId === "string" ? body.episodeId : "";

  let cues: SrtCue[] = [];
  let sourceNote = "";
  if (source) {
    const parsed = parseSrt(source);
    if (parsed.cues.length === 0) {
      return Response.json(
        { error: "No valid SRT cues found - check the timecodes", skipped: parsed.skipped },
        { status: 400 },
      );
    }
    cues = parsed.cues;
    sourceNote = `pasted SRT (${parsed.cues.length} cues${parsed.skipped > 0 ? `, ${parsed.skipped} block(s) skipped as unparseable` : ""})`;
  } else if (episodeId) {
    const built = await buildEpisodeDialogueCues(episodeId);
    if (built.cues.length === 0) {
      return Response.json({ error: built.note }, { status: 400 });
    }
    cues = built.cues;
    sourceNote = built.note;
  } else {
    return Response.json({ error: "Provide srt text or an episodeId" }, { status: 400 });
  }

  let outcome;
  try {
    outcome = await translateSubtitleCues(projectId, cues, targetLang);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Translation failed" },
      { status: 500 },
    );
  }

  const srt = serializeSrt(outcome.cues);

  await db.productionEvent.create({
    data: {
      projectId,
      actor: "USER",
      type: "TRANSLATION",
      summary: `Subtitles translated to ${targetLang}: ${outcome.stats.cues} cues, glossary ${outcome.stats.glossarySize}, ${outcome.stats.termHits} enforcement pass(es)`,
      payload: JSON.stringify({
        targetLang,
        source: sourceNote,
        stats: outcome.stats,
        suggestions: outcome.suggestions,
      }),
    },
  });

  return Response.json({
    targetLang,
    sourceNote,
    sourceCues: cues,
    cues: outcome.cues,
    srt,
    glossary: outcome.glossary,
    suggestions: outcome.suggestions,
    stats: outcome.stats,
  });
}
