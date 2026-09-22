export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { generateShotPanelArt } from "@/lib/ai/art";

/** Generate AI panel art for one shot (manhua / manhwa / manga style). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const { shotId, format } = (body ?? {}) as { shotId?: unknown; format?: unknown };
  if (!shotId || typeof shotId !== "string") {
    return NextResponse.json({ error: "shotId required" }, { status: 400 });
  }

  try {
    const result = await generateShotPanelArt(shotId, format);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
