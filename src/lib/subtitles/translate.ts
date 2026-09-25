// ─────────────────────────────────────────────────────────────
// SUBTITLE TRANSLATION ENGINE (Terminology memory is law)
//
// Translates SRT cues into a target language with the production's
// Terminology memory enforced as a glossary: the canonical term map
// is injected into every batch prompt, and a deterministic
// post-pass re-writes any glossary term the model drifted from, so
// Lin Yue stays Lin Yue (and 青焰 stays Azure Flame) across every
// cue, every episode, every language. Terms the model rendered
// consistently but that are NOT yet in memory come back as
// suggestions the creator (or DSH) can adopt into the memory.
// ─────────────────────────────────────────────────────────────

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { parseDialogue } from "@/lib/comic/dialogue";
import type { SrtCue } from "@/lib/subtitles/srt";

export interface GlossaryEntry {
  term: string;
  category: string | null;
  translation: string | null; // the entry's rendering for the TARGET lang (null = memory has none yet)
  known: Record<string, string>; // all languages memory holds (audit)
}

export interface SubtitleSuggestion {
  term: string;
  translation: string;
  hits: number;
}

export interface TranslationStats {
  cues: number;
  batches: number;
  glossarySize: number;
  termHits: number; // cues where the deterministic post-pass had to enforce a term
  suggestions: number;
  longestTargetLine: number;
  providerNote: string;
}

export interface TranslationOutcome {
  cues: SrtCue[]; // same timing, translated text
  glossary: GlossaryEntry[];
  suggestions: SubtitleSuggestion[];
  stats: TranslationStats;
}

// Batch sizing: big enough for the model to see context, small
// enough that one JSON parse failure costs little.
const BATCH_SIZE = 14;
const MAX_GLOSSARY_ENTRIES = 40;

// ─── The glossary: Terminology memory, resolved for one language ──

export async function fetchGlossary(projectId: string, targetLang: string): Promise<GlossaryEntry[]> {
  const rows = await db.terminology.findMany({
    where: { projectId },
    orderBy: { term: "asc" },
    take: MAX_GLOSSARY_ENTRIES,
  });
  return rows.map((row) => {
    let known: Record<string, string> = {};
    try {
      const parsed = JSON.parse(row.translations);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        known = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string" && (v as string).trim().length > 0)
            .map(([k, v]) => [k, String(v)]),
        );
      }
    } catch {
      known = {};
    }
    const translation = known[targetLang] ?? null;
    return { term: row.term, category: row.category ?? null, translation, known };
  });
}

function glossaryPromptBlock(glossary: GlossaryEntry[]): string {
  const lines = glossary.map((g) => {
    const cat = g.category ? ` [${g.category}]` : "";
    const fix = g.translation ? ` -> ALWAYS "${g.translation}"` : " -> no fixed rendering yet: pick ONE consistent translation";
    return `- "${g.term}"${cat}${fix}`;
  });
  return lines.length > 0 ? lines.join("\n") : "(no glossary entries - translate freely)";
}

// ─── The deterministic enforcement pass ─────────────────────────
// For every glossary term with a fixed rendering: if the SOURCE cue
// mentions the term but the translated cue lost it, re-write the
// occurrence. This is the memory's teeth - the LLM proposes, the
// Terminology memory disposes.

function enforceGlossary(
  sourceText: string,
  targetText: string,
  glossary: GlossaryEntry[],
): { text: string; enforced: string[] } {
  let text = targetText;
  const enforced: string[] = [];
  for (const g of glossary) {
    if (!g.translation) continue;
    if (!sourceText.includes(g.term)) continue;
    if (text.includes(g.translation)) continue;
    // The source used a canonical term and the translation neither
    // kept the term nor used its fixed rendering: replace the term
    // occurrence (or its raw appearance) with the canonical render.
    if (text.includes(g.term)) {
      text = text.split(g.term).join(g.translation);
      enforced.push(g.term);
    }
  }
  return { text, enforced };
}

// ─── The LLM batch call ─────────────────────────────────────────

interface BatchResult {
  byIndex: Map<number, string>;
  suggestions: SubtitleSuggestion[];
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function translateBatch(
  batch: SrtCue[],
  targetLang: string,
  context: { title: string; logline: string | null; style: string },
  glossary: GlossaryEntry[],
  attempt = 1,
): Promise<BatchResult> {
  const numbered = batch.map((c) => `${c.index}. ${c.text.replace(/\n/g, " ⏎ ")}`).join("\n");

  const prompt = `You are the localization lead for an animated production. Translate each subtitle cue into ${targetLang}.

PRODUCTION: "${context.title}" (${context.style})${context.logline ? ` - ${context.logline}` : ""}

GLOSSARY (Terminology memory - canonical renderings, non-negotiable):
${glossaryPromptBlock(glossary)}

RULES:
- Keep every glossary term consistent with its fixed rendering when one is listed.
- Subtitle brevity: prefer natural spoken lines over literal completeness; aim under ~42 characters per line where the language allows.
- Preserve the speaker's register (formal elder, sharp rival, calm mentor...).
- Do NOT add speaker names, quotes, explanations or comments. Translate only.
- Never use em dashes or en dashes in the output; use commas, colons or periods.

CUES (index. text; " ⏎ " marks an original line break):
${numbered}

Respond with ONLY JSON:
{"translations":[{"i":<cue index>,"text":"<translated text>"}],"newTerms":[{"term":"<source proper noun or fixed phrase worth memorizing>","translation":"<your ${targetLang} rendering>"}]}

newTerms: only proper nouns, titles, techniques or place names you translated consistently and that are worth adding to the production's Terminology memory. Empty array if none. Every cue index must appear exactly once in translations.`;

  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    thinking: { type: "disabled" },
  });
  const raw = (completion.choices[0]?.message?.content ?? "").trim();

  const parsed = extractJson(raw);
  if (!parsed && attempt < 2) {
    // One honest retry on an unparseable answer.
    return translateBatch(batch, targetLang, context, glossary, attempt + 1);
  }
  const byIndex = new Map<number, string>();
  if (parsed) {
    const translations = Array.isArray(parsed.translations) ? parsed.translations : [];
    for (const row of translations) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const idx = Number(r.i);
      const text = typeof r.text === "string" ? r.text.trim() : "";
      if (Number.isFinite(idx) && text) byIndex.set(idx, text);
    }
  }
  const suggestions: SubtitleSuggestion[] = [];
  if (parsed && Array.isArray(parsed.newTerms)) {
    for (const row of parsed.newTerms) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const term = typeof r.term === "string" ? r.term.trim() : "";
      const translation = typeof r.translation === "string" ? r.translation.trim() : "";
      if (term && translation) suggestions.push({ term, translation, hits: 0 });
    }
  }
  return { byIndex, suggestions };
}

// ─── The engine entry ───────────────────────────────────────────

export async function translateSubtitleCues(
  projectId: string,
  cues: SrtCue[],
  targetLang: string,
): Promise<TranslationOutcome> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { title: true, logline: true, visualStyle: true, originalLanguage: true },
  });
  if (!project) throw new Error("Project not found");

  const glossary = await fetchGlossary(projectId, targetLang);
  const context = { title: project.title, logline: project.logline, style: project.visualStyle };

  const translated: SrtCue[] = [];
  const suggestionCount = new Map<string, SubtitleSuggestion>();
  let batches = 0;
  let termHits = 0;
  let missing = 0;

  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    const batch = cues.slice(i, i + BATCH_SIZE);
    const { byIndex, suggestions } = await translateBatch(batch, targetLang, context, glossary);
    batches += 1;

    for (const s of suggestions) {
      const key = `${s.term}=>${s.translation}`;
      const existing = suggestionCount.get(key);
      if (existing) existing.hits += 1;
      else suggestionCount.set(key, { ...s, hits: 1 });
    }

    for (const cue of batch) {
      const target = byIndex.get(cue.index);
      if (!target) {
        // Honest fallback: keep the source text, count the gap.
        translated.push({ ...cue });
        missing += 1;
        continue;
      }
      const { text, enforced } = enforceGlossary(cue.text, target, glossary);
      if (enforced.length > 0) termHits += 1;
      translated.push({ ...cue, text: text.replace(/ ?⏎ ?/g, "\n") });
    }
  }

  const suggestions = [...suggestionCount.values()]
    .filter((s) => !glossary.some((g) => g.term === s.term))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 8);

  const stats: TranslationStats = {
    cues: cues.length,
    batches,
    glossarySize: glossary.length,
    termHits,
    suggestions: suggestions.length,
    longestTargetLine: translated.reduce((max, c) => Math.max(max, ...c.text.split("\n").map((l) => l.length)), 0),
    providerNote:
      missing > 0
        ? `${missing} cue(s) kept their source text - the model skipped them in every batch`
        : "every cue translated",
  };

  return { cues: translated, glossary, suggestions, stats };
}

// ─── Cue source for episodes without a pasted SRT ───────────────
// Builds subtitle cues from the episode's shot dialogue with
// cumulative shot-duration timing (the same convention the cut
// manifest uses; takes/visemes refine it there, dialogue-only here).

export async function buildEpisodeDialogueCues(episodeId: string): Promise<{ cues: SrtCue[]; note: string }> {
  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    select: {
      number: true,
      title: true,
      scenes: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          shots: {
            orderBy: { number: "asc" },
            select: { duration: true, dialogue: true },
          },
        },
      },
    },
  });
  if (!episode) throw new Error("Episode not found");

  const cues: SrtCue[] = [];
  let cursorMs = 0;
  let index = 1;

  for (const scene of episode.scenes) {
    for (const shot of scene.shots) {
      const lines = parseDialogue(shot.dialogue).filter((l) => l.text.trim().length > 0);
      const shotMs = Math.max(500, Math.round(shot.duration * 1000));
      if (lines.length > 0) {
        const per = Math.floor(shotMs / lines.length);
        for (let i = 0; i < lines.length; i++) {
          const speaker = lines[i].speaker ? `${lines[i].speaker}: ` : "";
          cues.push({
            index: index++,
            startMs: cursorMs + i * per,
            endMs: cursorMs + (i + 1) * per - 40,
            text: `${speaker}${lines[i].text.trim()}`,
          });
        }
      }
      cursorMs += shotMs;
    }
  }

  return {
    cues,
    note:
      cues.length > 0
        ? `dialogue of ${episode.scenes.reduce((n, s) => n + s.shots.length, 0)} shot(s), timed by cumulative shot durations (cut-manifest timing refines this at publish)`
        : "this episode has no dialogue yet",
  };
}

// ─── Language normalization ─────────────────────────────────────

export function normalizeLangTag(lang: string): string {
  const tag = lang.trim();
  if (/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(tag)) return tag;
  return tag.replace(/\s+/g, "-");
}
