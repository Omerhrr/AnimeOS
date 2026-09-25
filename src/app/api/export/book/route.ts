// ─────────────────────────────────────────────────────────────
// COMIC BOOK EXPORT (CBZ / PDF)
// GET /api/export/book?episodeId=...&format=cbz|pdf&direction=ltr|rtl
//
// Streams the built book with a Content-Disposition download name
// and lands an EXPORT production event so the history feed records
// what shipped. GET is a read of the production's own art, so any
// signed-in member (including VIEWERs) may download.
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { authGuardResponse, requireUser } from "@/lib/auth";
import { buildComicBook, type BookDirection, type BookFormat } from "@/lib/comic/export-book";

export async function GET(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return authGuardResponse(guard)!;

  const url = new URL(req.url);
  const episodeId = url.searchParams.get("episodeId") ?? "";
  const format = (url.searchParams.get("format") ?? "cbz").toUpperCase() as BookFormat;
  const direction = (url.searchParams.get("direction") ?? "ltr").toUpperCase() as BookDirection;

  if (!episodeId) return Response.json({ error: "episodeId is required" }, { status: 400 });
  if (format !== "CBZ" && format !== "PDF") {
    return Response.json({ error: "format must be cbz or pdf" }, { status: 400 });
  }
  if (direction !== "LTR" && direction !== "RTL") {
    return Response.json({ error: "direction must be ltr or rtl" }, { status: 400 });
  }

  let result;
  try {
    result = await buildComicBook(episodeId, format, direction);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Book build failed" },
      { status: 400 },
    );
  }

  await db.productionEvent.create({
    data: {
      projectId: (await db.episode.findUnique({ where: { id: episodeId }, select: { season: { select: { projectId: true } } } }))?.season.projectId ?? null,
      actor: "USER",
      type: "EXPORT",
      summary: `${format} book exported (${result.meta.direction} binding): ${result.meta.pages} page(s), ${result.meta.panels} panel(s) -> ${result.filename}`,
      payload: JSON.stringify({ ...result.meta, filename: result.filename }),
    },
  });

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "X-Book-Meta": encodeURIComponent(JSON.stringify(result.meta)),
      "Cache-Control": "no-store",
    },
  });
}
