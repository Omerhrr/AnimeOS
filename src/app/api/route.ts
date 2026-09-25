export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

// Studio meta endpoint: a liveness probe that says what this service
// is instead of a scaffold hello-world.
export async function GET() {
  return NextResponse.json({
    name: "AnimeOS",
    tagline: "AI-Native Animation Production Platform",
    motto: "DSH decides · Tools execute · Engine builds · State remembers",
    status: "ok",
    time: new Date().toISOString(),
  });
}
