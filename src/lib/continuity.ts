import { db } from "@/lib/db";
import type { CapabilityCheck } from "@/lib/types";
import { safeJsonParse } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// CONTINUITY ENGINE - a first-class production system (§27)
// Detects conflicts between story requirements and canonical history.
// The system never silently creates an inconsistent asset.
// ─────────────────────────────────────────────────────────────

export interface ContinuityConflict {
  entityName: string;
  kind: string;
  eventEpisode: number | null;
  description: string;
  severity: string;
  resolutions: string[];
}

const RESOLUTIONS_BY_KIND: Record<string, string[]> = {
  DESTROYED: [
    "Script error - rewrite the line",
    "Flashback - mark the shot as a flashback",
    "Restored - add a restoration story event before this scene",
    "Alternate weapon - substitute a different asset",
  ],
  LOST: [
    "Script error - rewrite the line",
    "Recovered - add a recovery event before this scene",
    "Alternate asset - substitute",
  ],
  INJURED: [
    "Healed - add recovery event before this scene",
    "Intentional - keep injury visible in the render",
    "Timeline error - move the scene earlier",
  ],
  TRANSFORMED: [
    "Revert transformation before this scene",
    "Use the transformed state deliberately",
  ],
};

export function resolutionsFor(kind: string): string[] {
  return RESOLUTIONS_BY_KIND[kind] ?? ["Review the continuity event manually"];
}

/**
 * Scan a scene description (plus its shots) against the project's
 * canonical continuity events. Named entities with destructive history
 * are flagged as conflicts.
 */
export async function checkSceneContinuity(projectId: string, sceneId: string) {
  const scene = await db.scene.findUnique({
    where: { id: sceneId },
    include: { shots: true, environment: true },
  });
  if (!scene) return { conflicts: [], checked: 0 };

  const events = await db.continuityEvent.findMany({
    where: { projectId, kind: { in: ["DESTROYED", "LOST", "INJURED", "TRANSFORMED"] } },
  });

  const text = [
    scene.title,
    scene.description ?? "",
    scene.environment?.name ?? "",
    ...scene.shots.map((s) => `${s.description} ${s.lighting ?? ""}`),
  ]
    .join(" \n ")
    .toLowerCase();

  const conflicts: ContinuityConflict[] = [];
  for (const ev of events) {
    const name = ev.entityName.toLowerCase();
    if (name.length < 3) continue;
    if (text.includes(name)) {
      conflicts.push({
        entityName: ev.entityName,
        kind: ev.kind,
        eventEpisode: ev.episodeNumber,
        description: ev.description,
        severity: ev.severity,
        resolutions: resolutionsFor(ev.kind),
      });
    }
  }

  return { conflicts, checked: events.length };
}

/**
 * Missing-capability detection (§26): compare what a scene needs
 * against what the production actually has.
 */
export async function checkSceneCapabilities(projectId: string, sceneId: string): Promise<CapabilityCheck[]> {
  const scene = await db.scene.findUnique({
    where: { id: sceneId },
    include: {
      environment: true,
      shots: true,
      episode: { include: { season: { include: { project: { include: { characters: true, assets: true } } } } } },
    },
  });
  if (!scene) return [];

  const project = scene.episode.season.project;
  const characters = safeJsonParse<{ name: string }[]>(null as never, []);
  void characters;

  const checks: CapabilityCheck[] = [];
  const hay = `${scene.title} ${scene.description ?? ""} ${scene.shots.map((s) => s.description).join(" ")}`.toLowerCase();

  // Characters present in project vs. mentioned in scene text
  for (const ch of project.characters) {
    if (ch.derivativeType) continue;
    const mentioned = hay.includes(ch.name.toLowerCase());
    if (mentioned) {
      checks.push({ requirement: ch.name, category: "Character", present: true, detail: `Registered production character (${ch.role ?? "cast"})` });
    }
  }

  // Environment
  if (scene.environment) {
    checks.push({ requirement: scene.environment.name, category: "Environment", present: true, detail: "Linked environment asset" });
  }

  // Assets mentioned but missing (props / effects)
  const knownAssets = project.assets.map((a) => ({ name: a.name, category: a.category, status: a.status }));
  const effects = knownAssets.filter((a) => a.category === "EFFECT");
  const props = knownAssets.filter((a) => a.category === "PROP");

  // Heuristic: known named techniques / vfx terms that commonly appear in scenes
  const effectKeywords = [...effects.map((e) => e.name), ...props.map((p) => p.name)];
  const suspectedRequirements = extractSuspectedRequirements(scene.description ?? "", scene.title);

  for (const req of suspectedRequirements) {
    const found = effectKeywords.find((k) => k.toLowerCase().includes(req.toLowerCase()) || req.toLowerCase().includes(k.toLowerCase()));
    checks.push({
      requirement: req,
      category: "VFX / Prop",
      present: Boolean(found),
      detail: found ? `Covered by asset: ${found}` : "Missing - DSH must create this before rendering",
    });
  }

  return checks;
}

const COMMON_TECHNIQUE_HINTS = [
  "flame", "fire", "lightning", "sword", "energy", "storm", "rain", "fog",
  "explosion", "smoke", "aura", "ice", "wind", "magic", "domain",
];

function extractSuspectedRequirements(description: string, title: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const found = new Set<string>();
  for (const hint of COMMON_TECHNIQUE_HINTS) {
    if (text.includes(hint)) {
      // Surface as Title Case requirement
      found.add(hint.charAt(0).toUpperCase() + hint.slice(1));
    }
  }
  return [...found].slice(0, 6);
}
