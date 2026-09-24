import fs from "fs";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { detectCast } from "@/lib/ai/art";
import { resolveActiveState } from "@/lib/animation/state-poses";

// ─────────────────────────────────────────────────────────────
// ART-AWARE CONTINUITY (the art layer joins the continuity engine)
//
// The story-side continuity engine checks narrative history; this
// module checks the ART against it, two layers deep:
//
//   1. DETERMINISTIC SCAN - timestamps and coverage:
//        - stale-state   the panel art predates the episode-active
//                        development state that should appear in it
//                        (a state recorded after the art was drawn
//                        is not in the drawing).
//        - stale-anchor  the panel art predates the character's
//                        current model-sheet anchor - the panel may
//                        drift from the locked design.
//        - anchor-missing a featured character has no model sheet,
//                        so nothing locks their design across panels.
//
//   2. VLM DEEP CHECK - a vision model compares the shot's panel art
//      against the character's canonical model sheet and returns a
//      strict JSON verdict (identity, wardrobe, weapon, palette).
//      Findings land as ART_DRIFT continuity events, clean checks as
//      ART_VERIFIED - both visible in the Continuity view and to DSH.
// ─────────────────────────────────────────────────────────────

export type ArtContinuityKind = "stale-state" | "stale-anchor" | "anchor-missing";

export interface ArtContinuityItem {
  kind: ArtContinuityKind;
  severity: "INFO" | "WARNING";
  characterName: string;
  note: string;
}

export interface ArtShotReport {
  shotId: string;
  ref: string; // E{n} Sc{n} S{n} label
  episode: number;
  sceneNumber: number;
  number: number;
  description: string;
  hasArt: boolean;
  items: ArtContinuityItem[];
}

export interface ArtContinuityScan {
  shots: ArtShotReport[];
  counts: { staleState: number; staleAnchor: number; anchorMissing: number; checked: number; flagged: number };
}

/** Load a public-relative image path as a data URL (null when unreadable). */
export function publicImageAsDataUrl(publicPath: string | null | undefined): string | null {
  if (!publicPath) return null;
  const clean = publicPath.split("?")[0];
  const file = path.join(process.cwd(), "public", path.normalize(clean).replace(/^([.][.][/\\])+/, ""));
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (stat.size <= 0 || stat.size > 8 * 1024 * 1024) return null;
  const ext = path.extname(file).toLowerCase().replace(".", "") || "png";
  return `data:image/${ext};base64,${fs.readFileSync(file).toString("base64")}`;
}

/**
 * Deterministic art-continuity scan for a whole project: every shot's
 * featured cast is checked against the art layer's timestamps.
 */
export async function scanArtContinuity(projectId: string): Promise<ArtContinuityScan> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      characters: { include: { states: true } },
      seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } },
    },
  });
  if (!project) return { shots: [], counts: { staleState: 0, staleAnchor: 0, anchorMissing: 0, checked: 0, flagged: 0 } };

  const shots: ArtShotReport[] = [];
  const counts = { staleState: 0, staleAnchor: 0, anchorMissing: 0, checked: 0, flagged: 0 };

  for (const season of project.seasons) {
    for (const episode of season.episodes) {
      for (const scene of [...episode.scenes].sort((a, b) => a.number - b.number)) {
        for (const shot of [...scene.shots].sort((a, b) => a.number - b.number)) {
          counts.checked += 1;
          const ref = `E${episode.number} Sc${scene.number} S${String(shot.number).padStart(3, "0")}`;
          const items: ArtContinuityItem[] = [];
          const cast = detectCast(project.characters, shot.description);
          for (const member of cast) {
            if (!member.modelSheetUrl) {
              counts.anchorMissing += 1;
              items.push({
                kind: "anchor-missing",
                severity: "INFO",
                characterName: member.name,
                note: `${member.name} has no model sheet - nothing locks their design across panels featuring them`,
              });
            }
            if (!shot.artGeneratedAt) continue;
            const active = resolveActiveState(member.states, episode.number);
            if (active && active.createdAt > shot.artGeneratedAt) {
              counts.staleState += 1;
              items.push({
                kind: "stale-state",
                severity: "WARNING",
                characterName: member.name,
                note: `${member.name}'s state "${active.label}" was recorded after this panel was drawn - the art does not carry it`,
              });
            }
            if (member.modelSheetAt && member.modelSheetAt > shot.artGeneratedAt) {
              counts.staleAnchor += 1;
              items.push({
                kind: "stale-anchor",
                severity: "WARNING",
                characterName: member.name,
                note: `${member.name}'s model-sheet anchor was regenerated after this panel - the art may drift from the locked design`,
              });
            }
          }
          if (items.length > 0) counts.flagged += 1;
          shots.push({
            shotId: shot.id,
            ref,
            episode: episode.number,
            sceneNumber: scene.number,
            number: shot.number,
            description: shot.description,
            hasArt: Boolean(shot.artworkUrl),
            items,
          });
        }
      }
    }
  }

  return { shots, counts };
}

export interface ArtVlmVerdict {
  consistent: boolean;
  summary: string;
  drift: Array<{ aspect: string; note: string }>;
  characterName: string | null;
  shotRef: string;
}

interface VisionJsonBody {
  consistent?: boolean;
  summary?: string;
  drift?: Array<{ aspect?: string; note?: string }>;
}

function parseVerdictJson(raw: string): VisionJsonBody | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as VisionJsonBody;
  } catch {
    return null;
  }
}

/**
 * VLM deep check for ONE shot: the panel art goes against the
 * featured character's canonical model sheet. Findings persist as
 * ART_DRIFT / ART_VERIFIED continuity events (previous verdicts for
 * the same shot are replaced, so the event stream stays readable).
 */
export async function checkShotArtContinuity(shotId: string): Promise<
  { ok: true; verdict: ArtVlmVerdict; eventKind: string } | { ok: false; error: string }
> {
  const shot = await db.shot.findUnique({
    where: { id: shotId },
    include: {
      scene: {
        include: {
          episode: {
            include: {
              season: { include: { project: { include: { characters: { include: { states: true } } } } } },
            },
          },
        },
      },
    },
  });
  if (!shot) return { ok: false, error: "Shot not found" };
  if (!shot.artworkUrl) return { ok: false, error: "This shot has no panel art to check yet" };

  const episode = shot.scene.episode;
  const project = episode.season.project;
  const cast = detectCast(project.characters, shot.description);
  const member = cast.find((c) => c.modelSheetUrl) ?? null;
  if (!member) {
    return { ok: false, error: "No featured character with a model sheet - generate one first (the anchor is what the art is checked against)" };
  }

  const artData = publicImageAsDataUrl(shot.artworkUrl);
  const sheetData = publicImageAsDataUrl(member.modelSheetUrl);
  if (!artData || !sheetData) return { ok: false, error: "Panel art or model sheet is missing on disk" };

  const shotRef = `E${episode.number} Sc${shot.scene.number} S${String(shot.number).padStart(3, "0")}`;
  const prompt = [
    "You are a continuity supervisor for an animation production.",
    `Image 1 is a story panel. Image 2 is the canonical character model sheet for ${member.name}.`,
    "Compare the character in the panel against the canonical sheet and judge whether the SAME character appears: face and hair, wardrobe, weapon/props, color palette, art style.",
    "Reply with STRICT JSON only, no markdown fences:",
    '{"consistent": true|false, "summary": "one sentence", "drift": [{"aspect": "hair|face|wardrobe|weapon|palette|style", "note": "what drifted"}]}',
    "An empty drift array means the panel matches the sheet.",
  ].join("\n");

  let raw = "";
  try {
    const zai = await ZAI.create();
    const res = (await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: artData } },
            { type: "image_url", image_url: { url: sheetData } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    raw = res.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "vision check failed" };
  }

  const body = parseVerdictJson(raw);
  if (!body) return { ok: false, error: `vision model returned unparsable verdict: ${raw.slice(0, 120)}` };

  const drift = (body.drift ?? [])
    .filter((d) => d && (d.aspect || d.note))
    .map((d) => ({ aspect: String(d.aspect ?? "general"), note: String(d.note ?? "") }));
  const verdict: ArtVlmVerdict = {
    consistent: body.consistent === true && drift.length === 0,
    summary: String(body.summary ?? "").slice(0, 400) || (body.consistent ? "panel matches the canonical sheet" : "panel drifts from the canonical sheet"),
    drift,
    characterName: member.name,
    shotRef,
  };

  // persist the verdict as continuity events; replace prior verdicts
  // for the same shot so the event stream stays readable
  const tag = `[art ${shotRef}]`;
  await db.continuityEvent.deleteMany({
    where: { projectId: project.id, kind: { in: ["ART_DRIFT", "ART_VERIFIED"] }, description: { startsWith: tag } },
  });
  const kind = verdict.consistent ? "ART_VERIFIED" : "ART_DRIFT";
  const descriptionParts = [
    tag,
    verdict.summary,
    ...drift.map((d) => `${d.aspect}: ${d.note}`),
  ];
  await db.continuityEvent.create({
    data: {
      projectId: project.id,
      entityType: "CHARACTER",
      entityName: member.name,
      kind,
      episodeNumber: episode.number,
      description: descriptionParts.join(" - ").slice(0, 900),
      severity: verdict.consistent ? "INFO" : "WARNING",
    },
  });

  return { ok: true, verdict, eventKind: kind };
}
