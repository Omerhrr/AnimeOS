export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireProjectAccess, projectOfRow } from "@/lib/access";
import { buildEpisodeCut } from "@/lib/comic/cut";

// ─────────────────────────────────────────────────────────────
// EPISODE CUT EXPORT (mux animated clips + stems → one mp4)
//
// POST /api/episodes/{id}/cut  { mode?: "PREVIEW" | "FINAL" }
// Assembles every shot's rendered clip in story order, re-times and
// synthesizes the episode's sound-design cues onto that timeline
// server-side (real TTS takes included), and muxes video + stems
// into public/renders/cuts/{slug}.mp4 with a JSON sidecar manifest.
// ─────────────────────────────────────────────────────────────

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const episodeProject = await projectOfRow("episode", id);
  if (!episodeProject) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  const access = await requireProjectAccess(req, episodeProject, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let mode: "PREVIEW" | "FINAL" = "PREVIEW";
  try {
    const body = (await req.json()) as { mode?: unknown };
    if (body?.mode === "FINAL") mode = "FINAL";
  } catch {
    // no body or malformed body defaults to PREVIEW
  }

  try {
    const result = await buildEpisodeCut(id, mode);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cut export failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
