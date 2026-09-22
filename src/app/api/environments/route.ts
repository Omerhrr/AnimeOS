export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "Unnamed Environment");
  const exists = await db.environment.findFirst({ where: { projectId: String(body.projectId), name } });
  if (exists) return NextResponse.json({ id: exists.id, reused: true });
  const env = await db.environment.create({
    data: {
      projectId: String(body.projectId),
      name,
      description: body.description ? String(body.description) : null,
      timeOfDay: body.timeOfDay ? String(body.timeOfDay) : null,
      weather: body.weather ? String(body.weather) : null,
      atmosphere: body.atmosphere ? JSON.stringify(body.atmosphere) : null,
      lighting: body.lighting ? String(body.lighting) : null,
    },
  });
  return NextResponse.json({ id: env.id });
}
