export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

const SIZE_BY_SHOT_TYPE: Record<string, "1024x1024" | "768x1344" | "864x1152" | "1344x768" | "1152x864" | "1440x720" | "720x1440"> = {
  ESTABLISHING: "1344x768",
  WIDE: "1152x864",
  LOW_ANGLE: "864x1152",
  MEDIUM: "1152x864",
  CLOSEUP: "1152x864",
  EXTREME_CLOSEUP: "1024x1024",
};

const FORMAT_STYLE: Record<string, string> = {
  MANHUA: "Full-colour Chinese manhua panel illustration, cinematic donghua atmosphere, rich jade-teal and ink palette, dramatic lighting, high quality, detailed",
  MANHWA: "Korean webtoon panel illustration, clean line art, soft modern shading, sleek dramatic mood, high quality, detailed",
  MANGA: "Black-and-white Japanese manga panel, expressive ink linework, screentone shading, high contrast monochrome, high quality, detailed",
};

const FRAMING: Record<string, string> = {
  ESTABLISHING: "wide establishing shot, epic vista",
  WIDE: "wide shot, characters small in a large environment",
  LOW_ANGLE: "dramatic low-angle shot looking up at the subject",
  MEDIUM: "medium shot, waist-up framing",
  CLOSEUP: "close-up on the face, emotional focus",
  EXTREME_CLOSEUP: "extreme close-up, one striking detail fills the frame",
};

function shotTypeEnum(value: unknown): string | null {
  const v = String(value ?? "").toUpperCase();
  return FRAMING[v] ? v : null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  const { shotId, format } = (body ?? {}) as { shotId?: unknown; format?: unknown };
  if (!shotId || typeof shotId !== "string") {
    return NextResponse.json({ error: "shotId required" }, { status: 400 });
  }
  const comicFormat = FORMAT_STYLE[String(format)] ? String(format) : "MANHUA";

  const shot = await db.shot.findUnique({
    where: { id: shotId },
    include: {
      scene: {
        include: {
          environment: true,
          episode: { include: { season: { include: { project: { include: { characters: { include: { states: true } } } } } } } },
        },
      },
    },
  });
  if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });

  const project = shot.scene.episode.season.project;
  const scene = shot.scene;

  // Characters referenced by this shot get their canonical look injected
  const desc = shot.description.toLowerCase();
  const cast = project.characters
    .filter((c) => desc.includes(c.name.toLowerCase().split(" ")[0]))
    .slice(0, 3)
    .map((c) => {
      const active = [...c.states]
        .filter((s) => s.episodeNumber === null || s.episodeNumber <= shot.scene.episode.number)
        .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1))[0];
      const look = [c.appearance, active?.clothing, active?.weapon, active?.cultivation ? `${c.name} is at ${active.cultivation} cultivation stage` : null]
        .filter(Boolean)
        .join("; ");
      return look ? `${c.name}: ${look}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const promptParts = [
    FORMAT_STYLE[comicFormat],
    FRAMING[shotTypeEnum(shot.shotType) ?? "MEDIUM"],
    shot.description,
    scene.environment ? `Setting: ${scene.environment.name}${scene.environment.description ? ` — ${scene.environment.description}` : ""}` : null,
    scene.timeOfDay ? `${scene.timeOfDay.toLowerCase()} lighting` : null,
    scene.weather ? `${scene.weather.toLowerCase()} weather` : null,
    shot.lighting ? `Lighting: ${shot.lighting}` : null,
    cast ? `Characters:\n${cast}` : null,
    "single comic panel, no text, no speech bubbles, no captions, no watermark, no border, no panel frame",
  ];

  const prompt = promptParts.filter(Boolean).join(". ");

  try {
    const zai = await ZAI.create();
    const response = await zai.images.generations.create({
      prompt,
      size: SIZE_BY_SHOT_TYPE[shot.shotType] ?? "1152x864",
    });
    const base64 = response.data?.[0]?.base64;
    if (!base64) throw new Error("Empty image response");

    const dir = path.join(process.cwd(), "public", "panels");
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${shot.id}.png`);
    await fs.promises.writeFile(file, Buffer.from(base64, "base64"));

    // cache-busting version so <img> refreshes on regeneration
    const artworkUrl = `/panels/${shot.id}.png?v=${Date.now()}`;
    await db.shot.update({ where: { id: shot.id }, data: { artworkUrl } });

    return NextResponse.json({ artworkUrl, prompt: prompt.slice(0, 500) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
