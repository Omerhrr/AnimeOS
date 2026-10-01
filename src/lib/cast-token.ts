/**
 * cast-token - THE NAME IS A WHOLE WORD (iteration 106, the queued
 * seam the render night recorded: detectCast's substring match read
 * "coiling" as Lin Yue's "lin").
 *
 * The old law matched the cast by RAW SUBSTRING - a character named
 * "Lin Yue" was detected inside any description carrying the letter
 * sequence "lin", so "the blade's edge, coiling with qi" cast Lin
 * Yue in a shot that never named her. The detection is a WORD
 * question, not a string question, so the law tokenizes both sides:
 *
 *   - a cast name contributes its FIRST TOKEN, lowercased (the
 *     "Lin Yue" -> "lin" anchor the whole pipeline already matches
 *     on - the law changes the matching, never the names);
 *   - a description tokenizes on non letter/digit boundaries (the
 *     unicode law: any script's letters and digits stay inside a
 *     token), so "coiling" is the ONE token `coiling`, "Lin's
 *     blade" yields `lin`, `s`, `blade`;
 *   - a token matches only EXACTLY: "lin" == "lin" fires,
 *     "coiling" contains "lin" and does not.
 *
 * Hyphenated spellings split at the hyphen ("lin-feng" mentions the
 * `lin` token - the same read the word-boundary laws of every
 * search engine give), possessives fire ("Lin's blade" names Lin),
 * and an empty token (a name of pure punctuation) never matches -
 * the old `includes("")` read EVERY description as a match, the
 * law honestly refuses.
 *
 * Pure - no imports - so the server routes, the generation prompts
 * and the panel inspector dialog all ride the SAME law module (one
 * law, three call sites, zero copies).
 */

export function castNameToken(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .split(/\s+/)[0]
    ?.trim() ?? "";
}

export function tokenizeDescription(description: string): string[] {
  return String(description ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function descriptionMentions(description: string, token: string): boolean {
  const t = String(token ?? "").trim().toLowerCase();
  if (!t) return false;
  // THE SCRIPT LAW: CJK text carries NO word boundaries, so a CJK
  // token matches by containment inside an unbroken run - the
  // word-boundary law only governs scripts that HAVE boundaries
  // (the trap pair 'coiling'/'lin' is latin and stays exact-only)
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
  const cjkToken = cjk.test(t);
  for (const tok of tokenizeDescription(description)) {
    if (tok === t) return true;
    if (cjkToken && cjk.test(tok) && tok.includes(t)) return true;
  }
  return false;
}

/** THE LAW: the cast members whose first-name token appears as a
 * WHOLE token of the description (latin scripts: exact-token only;
 * unspaced scripts: the script law's containment), in the roster's
 * own order, max 3 (the same shape every call site kept). */
export function filterCastByDescription<T>(characters: T[], description: string, max = 3): T[] {
  const out: T[] = [];
  for (const c of characters) {
    const token = castNameToken((c as { name?: unknown })?.name as string);
    if (token && descriptionMentions(description, token)) {
      out.push(c);
      if (out.length >= max) break;
    }
  }
  return out;
}
