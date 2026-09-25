export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// WORKPLACE THREADS - comments anchored to the production's own
// artifacts (Iteration 48: the studio becomes a workplace).
//
//   GET    ?anchorType=SHOT&anchorId=...   → one thread, oldest first
//   GET    ?projectId=...                  → recent threads across the production (Reviews view)
//   POST   {anchorType, anchorId, body}    → speak (ANY signed-in member - the proxy
//                                            allowlists exactly this path for VIEWERs)
//   PATCH  {id, action: resolve|unresolve} → the thread's author or EDITOR+
//
// Anchors and where the projectId actually comes from:
//   EPISODE → episode.season.projectId   SCENE → scene.episode.season.projectId
//   SHOT    → shot.scene.episode.season.projectId (a comic panel IS its shot)
//   TAKE    → audioCue.shot... (a voice take is an AudioCue row)
//   FACT    → universeFact.projectId
// The client never declares the project - the anchor row is the truth.
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { authGuardResponse, requireUser, ROLE_RANK } from "@/lib/auth";

type Ctx = { projectId: string; label: string };

const ANCHOR_TYPES = ["EPISODE", "SCENE", "SHOT", "TAKE", "FACT"] as const;
type AnchorType = (typeof ANCHOR_TYPES)[number];

/** Verify the anchor exists and resolve its projectId + a readable label for the audit trail. */
async function resolveAnchor(anchorType: string, anchorId: string): Promise<Ctx | null> {
  if (!ANCHOR_TYPES.includes(anchorType as AnchorType)) return null;
  switch (anchorType as AnchorType) {
    case "EPISODE": {
      const row = await db.episode.findUnique({ where: { id: anchorId }, include: { season: true } });
      return row ? { projectId: row.season.projectId, label: `Episode ${row.number} "${row.title}"` } : null;
    }
    case "SCENE": {
      const row = await db.scene.findUnique({
        where: { id: anchorId },
        include: { episode: { include: { season: true } } },
      });
      return row ? { projectId: row.episode.season.projectId, label: `Scene ${row.number} "${row.title}"` } : null;
    }
    case "SHOT": {
      const row = await db.shot.findUnique({
        where: { id: anchorId },
        include: { scene: { include: { episode: { include: { season: true } } } } },
      });
      return row ? { projectId: row.scene.episode.season.projectId, label: `Shot ${String(row.number).padStart(3, "0")}` } : null;
    }
    case "TAKE": {
      const row = await db.audioCue.findUnique({
        where: { id: anchorId },
        include: { shot: { include: { scene: { include: { episode: { include: { season: true } } } } } } },
      });
      return row ? { projectId: row.shot.scene.episode.season.projectId, label: `Take "${row.label}"` } : null;
    }
    case "FACT": {
      const row = await db.universeFact.findUnique({ where: { id: anchorId } });
      return row ? { projectId: row.projectId, label: `Fact "${row.text.slice(0, 40)}"` } : null;
    }
  }
}

export async function GET(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return authGuardResponse(guard)!;
  const { searchParams } = new URL(req.url);
  const anchorType = searchParams.get("anchorType") ?? "";
  const anchorId = searchParams.get("anchorId") ?? "";
  const projectId = searchParams.get("projectId") ?? "";

  if (anchorType && anchorId) {
    const comments = await db.comment.findMany({
      where: { anchorType, anchorId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return Response.json(comments);
  }

  if (projectId) {
    const comments = await db.comment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 120,
    });
    return Response.json(comments);
  }

  return Response.json({ error: "anchorType+anchorId or projectId required" }, { status: 400 });
}

export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return authGuardResponse(guard)!;
  const user = guard.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const anchorType = String(body.anchorType ?? "");
  const anchorId = String(body.anchorId ?? "");
  const text = String(body.body ?? "").trim();
  if (!anchorId || !text) return Response.json({ error: "anchorId and body are required" }, { status: 400 });
  if (text.length > 2000) return Response.json({ error: "Comment body exceeds 2000 characters" }, { status: 400 });

  const ctx = await resolveAnchor(anchorType, anchorId);
  if (!ctx) return Response.json({ error: `Unknown ${anchorType || "anchor"} - the anchor row must exist` }, { status: 404 });

  const comment = await db.comment.create({
    data: {
      projectId: ctx.projectId,
      anchorType,
      anchorId,
      authorId: user.id,
      authorName: user.name,
      body: text,
    },
  });

  await db.productionEvent.create({
    data: {
      projectId: ctx.projectId,
      actor: "USER",
      type: "COMMENT",
      summary: `${user.name} commented on ${ctx.label}: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
      payload: JSON.stringify({ commentId: comment.id, anchorType, anchorId, author: user.name }),
    },
  });

  return Response.json(comment);
}

export async function PATCH(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return authGuardResponse(guard)!;
  const user = guard.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const comment = await db.comment.findUnique({ where: { id: String(body.id ?? "") } });
  if (!comment) return Response.json({ error: "Comment not found" }, { status: 404 });

  const action = String(body.action ?? "");
  if (action !== "resolve" && action !== "unresolve") {
    return Response.json({ error: "Unknown action - use resolve or unresolve" }, { status: 400 });
  }

  // Resolving is a direction decision: the thread's author may close
  // their own thread; everyone else needs EDITOR or above.
  const isAuthor = comment.authorId === user.id;
  if (!isAuthor && ROLE_RANK[user.role] < ROLE_RANK.EDITOR) {
    return Response.json(
      { error: "Only the thread's author or an EDITOR+ can resolve a thread" },
      { status: 403 },
    );
  }

  const updated = await db.comment.update({
    where: { id: comment.id },
    data: {
      resolved: action === "resolve",
      resolvedAt: action === "resolve" ? new Date() : null,
      resolvedBy: action === "resolve" ? user.id : null,
    },
  });

  if (action === "resolve") {
    await db.productionEvent.create({
      data: {
        projectId: comment.projectId,
        actor: "USER",
        type: "COMMENT",
        summary: `${user.name} resolved a ${comment.anchorType} thread (${comment.authorName}'s)`,
        payload: JSON.stringify({ commentId: comment.id, anchorType: comment.anchorType, anchorId: comment.anchorId }),
      },
    });
  }

  return Response.json(updated);
}
