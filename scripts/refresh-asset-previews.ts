// Refresh all asset previews through the preview-only builder path.
import { PrismaClient } from "@prisma/client";
import { refreshAssetPreview } from "../src/lib/blender/assets";

const db = new PrismaClient();

async function main() {
  const assets = await db.blenderAsset.findMany({ orderBy: [{ kind: "asc" }, { refName: "asc" }] });
  for (const a of assets) {
    const res = await refreshAssetPreview(a.id);
    console.log(`${a.kind} ${a.refName}:`, res.ok ? `preview refreshed -> ${res.previewPath}` : `FAILED: ${res.log.slice(-200)}`);
  }
}

main().finally(() => db.$disconnect());
