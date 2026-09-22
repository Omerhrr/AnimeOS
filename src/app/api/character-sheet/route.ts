export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { generateCharacterModelSheet } from "@/lib/ai/art";

/**
 * Generate a character model sheet - the reference image + canonical
 * visual anchor that keep faces consistent across panels.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const { characterId } = (body ?? {}) as { characterId?: unknown };
  if (!characterId || typeof characterId !== "string") {
    return NextResponse.json({ error: "characterId required" }, { status: 400 });
  }

  try {
    const result = await generateCharacterModelSheet(characterId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model sheet generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
