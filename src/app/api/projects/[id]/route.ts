export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, authGuardResponse } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** Full production universe - the persistent animated state (§47).
 *  Crew-scoped: members of THIS production (OWNER always). */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const access = await requireProjectAccess(req, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const project = await db.project.findUnique({
    where: { id },
    include: {
      seasons: {
        orderBy: { number: "asc" },
        include: {
          episodes: {
            orderBy: { number: "asc" },
            include: {
              scenes: {
                orderBy: { number: "asc" },
                include: {
                  environment: true,
                  shots: {
                    orderBy: { number: "asc" },
                    include: {
                      lora: true,
                      artist: true,
                      audioCues: { orderBy: { startMs: "asc" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      characters: {
        orderBy: { createdAt: "asc" },
        include: {
          states: { orderBy: { episodeNumber: "asc" } },
          relationsFrom: { include: { to: true } },
          relationsTo: { include: { from: true } },
          derivatives: true,
          voiceArtist: { select: { id: true, name: true, voiceId: true } },
        },
      },
      environments: { orderBy: { createdAt: "asc" } },
      loras: { orderBy: { createdAt: "asc" }, include: { _count: { select: { shots: true } } } },
      artists: { orderBy: { createdAt: "asc" }, include: { _count: { select: { shots: true } } } },
      assets: { orderBy: { createdAt: "asc" }, include: { versions: { orderBy: { version: "asc" } } } },
      terminology: { orderBy: { createdAt: "asc" } },
      continuityEvents: { orderBy: { createdAt: "desc" } },
      productionEvents: { orderBy: { createdAt: "desc" }, take: 60 },
      dshMessages: { orderBy: { createdAt: "asc" } },
      renderJobs: { orderBy: { createdAt: "desc" }, include: { shot: { include: { scene: true } }, evaluation: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // The human approval gate is studio POLICY: flipping it is OWNER-only
  // and DB-fresh (the rest of the patch stays EDITOR-tunable).
  let gateActor: string | null = null;
  if (body.approvalGate !== undefined) {
    const guard = await requireRole(req, "OWNER");
    if (!guard.ok) return authGuardResponse(guard)!;
    gateActor = guard.user.name;
  }

  const data: Record<string, unknown> = {};
  for (const key of ["title", "logline", "format", "animationType", "visualStyle", "originalLanguage", "resolution", "status"]) {
    if (body[key] !== undefined) data[key] = String(body[key]);
  }
  if (body.fps !== undefined) data.fps = Number(body.fps);
  if (body.subtitleLanguages !== undefined) data.subtitleLanguages = JSON.stringify(body.subtitleLanguages);
  if (body.approvalGate !== undefined) data.approvalGate = Boolean(body.approvalGate);
  // Per-production art style tuning (nullable free-text directives)
  for (const key of ["artStylePrompt", "artPalettePrompt", "artNegativePrompt"]) {
    if (body[key] !== undefined) {
      const v = String(body[key] ?? "").trim();
      data[key] = v.length > 0 ? v.slice(0, 600) : null;
    }
  }
  const project = await db.project.update({ where: { id }, data });
  if (body.approvalGate !== undefined) {
    await db.productionEvent.create({
      data: {
        projectId: project.id,
        actor: "USER",
        type: "PROJECT",
        summary: `Human approval gate ${project.approvalGate ? "ARMED - DSH-approved renders now wait for a creator's approval" : "released - DSH approvals land directly"}`,
        payload: JSON.stringify({ approvalGate: project.approvalGate, by: gateActor }),
      },
    });
  }
  if (Object.keys(data).some((k) => k.startsWith("art"))) {
    await db.productionEvent.create({
      data: {
        projectId: project.id,
        actor: "USER",
        type: "STATE_CHANGE",
        summary: `Art style direction updated - new panel art & model sheets will follow it`,
        payload: JSON.stringify({
          artStylePrompt: project.artStylePrompt,
          artPalettePrompt: project.artPalettePrompt,
          artNegativePrompt: project.artNegativePrompt,
        }),
      },
    });
  }
  return NextResponse.json({ id: project.id });
}
