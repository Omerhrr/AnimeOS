export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess, projectOfRow } from "@/lib/access";

export async function POST(req: Request) {
  const body = await req.json();
  const access = await requireProjectAccess(req, String(body.projectId ?? ""), { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const asset = await db.asset.create({
    data: {
      projectId: String(body.projectId),
      category: String(body.category ?? "PROP"),
      name: String(body.name ?? "Unnamed Asset"),
      description: body.description ? String(body.description) : null,
    },
  });
  await db.assetVersion.create({ data: { assetId: asset.id, version: 1, note: "Initial version" } });
  return NextResponse.json({ id: asset.id });
}

/** Bump version / change status. */
export async function PATCH(req: Request) {
  const body = await req.json();
  const asset = await db.asset.findUnique({ where: { id: String(body.id) } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireProjectAccess(req, asset.projectId, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let version = asset.currentVersion;
  if (body.bumpVersion) {
    version = asset.currentVersion + 1;
    await db.assetVersion.create({ data: { assetId: asset.id, version, note: String(body.note ?? `v${version}`) } });
  }
  const updated = await db.asset.update({
    where: { id: asset.id },
    data: {
      currentVersion: version,
      status: body.status ? String(body.status) : asset.status,
      description: body.description ? String(body.description) : asset.description,
    },
  });
  return NextResponse.json({ id: updated.id, version: updated.currentVersion });
}
