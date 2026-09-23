export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { bridgeStatus, bridgeHostEnv } from "@/lib/bridge/blender";
import { img2vidStatus } from "@/lib/bridge/img2vid";

/** Live engine-driver status: is a real Blender attached, or is the simulator driving? */
export async function GET() {
  const status = await bridgeStatus(true);
  return NextResponse.json({ ...status, envHint: bridgeHostEnv() || null, img2vid: img2vidStatus() });
}
