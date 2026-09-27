export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { parseSlots } from "@/lib/dsh/sequence-flows";

// ─────────────────────────────────────────────────────────────
// THE SEQUENCE MANIFEST (iteration 63) - the director's call
// sheet: the show's cutting language as it STANDS. Three ledgers
// in one read:
//   episodes  - every scene's shots in story order, each with the
//               beat chain its grammar directs, the pose pair,
//               the fx/physics the world answers on, and the
//               latest render state
//   programs  - the named sequence programs (design_sequence
//               presets) - the sentences the studio can direct
//   flows     - the learned sequence flows (learn_sequence_flow)
//               - the sentences the studio REMEMBERS, with their
//               measured records
// Crew-readable (VIEWER included): a call sheet is how the whole
// crew reads the direction. No mutation, ever.
// ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const [project, recentJobs, presets, flows] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        seasons: {
          orderBy: { number: "asc" },
          select: {
            number: true,
            episodes: {
              orderBy: { number: "asc" },
              select: {
                id: true,
                number: true,
                title: true,
                status: true,
                scenes: {
                  orderBy: { number: "asc" },
                  select: {
                    number: true,
                    title: true,
                    status: true,
                    shots: {
                      orderBy: { number: "asc" },
                      select: {
                        id: true,
                        number: true,
                        description: true,
                        shotType: true,
                        duration: true,
                        status: true,
                        grammar: true,
                        poseStart: true,
                        poseEnd: true,
                        fx: true,
                        physics: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.renderJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" as const },
      take: 400,
      select: { id: true, shotId: true, status: true, mode: true, attempt: true, createdAt: true },
    }),
    db.designPreset.findMany({
      where: { projectId, kind: "SEQUENCE" },
      orderBy: { updatedAt: "desc" as const },
      take: 40,
      select: { name: true, spec: true, usageCount: true, updatedAt: true },
    }),
    db.sequenceFlow.findMany({
      where: { projectId },
      orderBy: [{ register: "asc" as const }, { clears: "desc" as const }],
      take: 40,
      select: { register: true, name: true, spec: true, outcomes: true, runs: true, clears: true, learnedFrom: true },
    }),
  ]);
  if (!project) return NextResponse.json({ error: "production not found" }, { status: 404 });

  const parseJson = <T,>(raw: string | null): T[] => {
    try {
      const parsed = JSON.parse(raw || "[]") as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  };

  // latest render per shot (jobs arrive newest-first; first wins)
  const latestByShot = new Map<string, { id: string; status: string; mode: string; attempt: number }>();
  for (const job of recentJobs) {
    if (job.shotId && !latestByShot.has(job.shotId)) {
      latestByShot.set(job.shotId, { id: job.id, status: job.status, mode: job.mode, attempt: job.attempt });
    }
  }

  type Beat = { move: string; from: number; to: number; wind?: number; poseStart?: string | null; poseEnd?: string | null };
  type FxRow = { kind: string; intensity?: number };
  type PhysRow = { kind: string; intensity?: number };

  const episodes = project.seasons.flatMap((s) =>
    s.episodes.map((e) => ({
      id: e.id,
      number: e.number,
      title: e.title,
      status: e.status,
      scenes: e.scenes.map((sc) => ({
        number: sc.number,
        title: sc.title,
        status: sc.status,
        shots: sc.shots.map((sh) => {
          const beats = parseJson<Beat>(sh.grammar);
          return {
            id: sh.id,
            number: sh.number,
            label: `Sc${sc.number} S${String(sh.number).padStart(3, "0")}`,
            description: sh.description,
            shotType: sh.shotType,
            duration: sh.duration,
            status: sh.status,
            beats: beats.map((b) => ({
              move: b.move,
              from: b.from,
              to: b.to,
              wind: typeof b.wind === "number" ? b.wind : undefined,
              poses: b.poseStart || b.poseEnd ? `${b.poseStart ?? ""}->${b.poseEnd ?? ""}` : null,
            })),
            poseStart: sh.poseStart,
            poseEnd: sh.poseEnd,
            fx: parseJson<FxRow>(sh.fx).map((p) => ({ kind: p.kind, intensity: p.intensity })),
            physics: parseJson<PhysRow>(sh.physics).map((p) => ({ kind: p.kind, intensity: p.intensity })),
            render: latestByShot.get(sh.id) ?? null,
          };
        }),
      })),
    })),
  );

  const programs = presets.map((p) => {
    let description: string | null = null;
    let slots: Array<{ grammar: string; poseStart: string | null; poseEnd: string | null; fx: string | null; physics: string | null; note: string | null }> = [];
    try {
      const parsed = JSON.parse(p.spec || "null") as { description?: unknown; slots?: unknown } | null;
      if (Array.isArray(parsed?.slots)) slots = parsed.slots as typeof slots;
      if (typeof parsed?.description === "string") description = parsed.description;
    } catch {
      slots = [];
    }
    return { name: p.name, description, slots, usageCount: p.usageCount, updatedAt: p.updatedAt.toISOString() };
  });

  const flowsOut = flows.map((f) => {
    const outcomes = (() => {
      try {
        const parsed = JSON.parse(f.outcomes || "[]") as unknown;
        return Array.isArray(parsed) ? (parsed as Array<{ verified: boolean; at: string }>) : [];
      } catch {
        return [];
      }
    })();
    const last = outcomes.length > 0 ? outcomes[outcomes.length - 1] : null;
    return {
      register: f.register,
      name: f.name,
      slots: parseSlots(f.spec),
      runs: f.runs,
      clears: f.clears,
      learnedFrom: f.learnedFrom,
      lastVerified: last ? last.verified : null,
    };
  });

  return NextResponse.json({ episodes, programs, flows: flowsOut });
}
