// ─────────────────────────────────────────────────────────────
// PER-PROJECT ACCESS SCOPING (Iteration 49: siloed productions)
//
// The third layer of studio auth, after the proxy's coarse gate
// and lib/auth's DB-fresh role gate: MEMBERSHIP. A member sees
// exactly the productions whose crew they are on; every
// project-scoped route resolves through here so the silo holds
// across the whole API surface, not just the project list.
//
//   OWNER  → implicit member of EVERY production. No row, no
//            lookup, no branch that can refuse them: the studio's
//            administrator is never blocked from any corner of
//            the system (reads, writes, roster, crew, gate).
//   others → one DB-fresh membership row (projectId, userId)
//            grants visibility; `craft` is the member's lens on
//            the production (dashboard emphasis), never a
//            permission. Writes stay gated by the global role.
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { sessionUser, type SessionUser, type StudioRole } from "@/lib/auth";

export const CRAFTS = ["DIRECTING", "ART", "VOICE", "REVIEW"] as const;
export type Craft = (typeof CRAFTS)[number];

export function isCraft(v: string): v is Craft {
  return (CRAFTS as readonly string[]).includes(v);
}

export const CRAFT_LABEL: Record<Craft, string> = {
  DIRECTING: "Directing",
  ART: "Art",
  VOICE: "Voice",
  REVIEW: "Review",
};

export type ProjectAccess =
  | { ok: true; user: SessionUser; craft: Craft | null; viaOwner: boolean }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * The DB-fresh project gate used by every project-scoped route.
 *
 * Pass the projectId the REQUEST claims (query, body or resolved
 * from an anchor row - the caller decides what is authoritative)
 * and this decides whether the caller may see or touch it:
 *   401 not signed in · 404 no such project · 403 not on the crew.
 * OWNER passes unconditionally - full access to the entire system.
 */
export async function requireProjectAccess(
  req: Request | undefined,
  projectId: string | null | undefined,
  opts?: { write?: boolean }
): Promise<ProjectAccess> {
  const user = await sessionUser(req, { touch: true });
  if (!user) return { ok: false, status: 401, error: "Sign in to use the studio" };

  const pid = String(projectId ?? "").trim();
  if (!pid) return { ok: false, status: 404, error: "Project not found - no projectId resolved" };

  // The OWNER bypass comes BEFORE any membership lookup: an owner
  // is a member of everything by definition and can never be
  // refused, throttled or siloed anywhere in the studio.
  if (user.role === "OWNER") return { ok: true, user, craft: null, viaOwner: true };

  const project = await db.project.findUnique({ where: { id: pid }, select: { id: true } });
  if (!project) return { ok: false, status: 404, error: "Production not found" };

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: pid, userId: user.id } },
  });
  if (!membership) {
    return {
      ok: false,
      status: 403,
      error: opts?.write
        ? "You are not on this production's crew - an OWNER can add you"
        : "This production is not on your slate - ask an OWNER to add you to the crew",
    };
  }

  const craft = isCraft(membership.craft) ? membership.craft : "REVIEW";
  return { ok: true, user, craft, viaOwner: false };
}

/**
 * Resolve an id-scoped row's projectId through its relation chain
 * (the server decides - the client never declares the project).
 */
export async function projectOfRow(
  kind: "shot" | "scene" | "episode" | "audioCue" | "character" | "characterState" | "environment" | "universeFact" | "artist" | "lora" | "arcTemplate" | "asset" | "comment" | "renderJob",
  id: string
): Promise<string | null> {
  if (!id) return null;
  switch (kind) {
    case "shot": {
      const row = await db.shot.findUnique({
        where: { id },
        select: { scene: { select: { episode: { select: { season: { select: { projectId: true } } } } } } },
      });
      return row?.scene.episode.season.projectId ?? null;
    }
    case "scene": {
      const row = await db.scene.findUnique({
        where: { id },
        select: { episode: { select: { season: { select: { projectId: true } } } } },
      });
      return row?.episode.season.projectId ?? null;
    }
    case "episode": {
      const row = await db.episode.findUnique({ where: { id }, select: { season: { select: { projectId: true } } } });
      return row?.season.projectId ?? null;
    }
    case "audioCue": {
      const row = await db.audioCue.findUnique({
        where: { id },
        select: { shot: { select: { scene: { select: { episode: { select: { season: { select: { projectId: true } } } } } } } } },
      });
      return row?.shot.scene.episode.season.projectId ?? null;
    }
    case "character":
      return (await db.character.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "characterState": {
      const row = await db.characterState.findUnique({
        where: { id },
        select: { character: { select: { projectId: true } } },
      });
      return row?.character.projectId ?? null;
    }
    case "environment":
      return (await db.environment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "universeFact":
      return (await db.universeFact.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "artist":
      return (await db.artist.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "lora":
      return (await db.styleLora.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "arcTemplate":
      return (await db.arcTemplate.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "asset":
      return (await db.asset.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "comment":
      return (await db.comment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "renderJob":
      return (await db.renderJob.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  }
}

/** Projects the user may see: null means ALL (OWNER bypass). */
export async function visibleProjectIds(user: SessionUser): Promise<string[] | null> {
  if (user.role === "OWNER") return null;
  const rows = await db.projectMembership.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

/** True when the user may see the given project (OWNER always). */
export async function canSeeProject(user: SessionUser, projectId: string): Promise<boolean> {
  if (user.role === "OWNER") return true;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { id: true },
  });
  return Boolean(membership);
}

/** The caller's craft lens on a project (OWNER: null = the wide lens). */
export async function craftOn(user: SessionUser, projectId: string): Promise<Craft | null> {
  if (user.role === "OWNER") return null;
  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { craft: true },
  });
  return membership ? (isCraft(membership.craft) ? membership.craft : "REVIEW") : null;
}

export type { SessionUser, StudioRole };
