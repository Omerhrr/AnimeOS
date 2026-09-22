import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const chars = await db.character.findMany({
  where: { project: { title: "Immortal Path" } },
  select: { name: true, voiceArtistId: true, voiceArtist: { select: { name: true, voiceId: true } } },
});
console.log("cast:", JSON.stringify(chars));
const artists = await db.artist.findMany({
  where: { project: { title: "Immortal Path" } },
  select: { name: true, voiceId: true, role: true },
});
console.log("artists:", JSON.stringify(artists));
const cues = await db.audioCue.findMany({
  where: { kind: "VOICE" },
  select: { id: true, label: true, voiceUrl: true, voiceSig: true, voiceActor: true, voiceDelivery: true, shot: { select: { number: true, scene: { select: { number: true, episode: { select: { number: true } } } } } } },
});
console.log("voice cues:", JSON.stringify(cues.map((c) => ({
  ep: c.shot.scene.episode?.number, scene: c.shot.scene.number, shot: c.shot.number,
  label: c.label.slice(0, 44), rendered: Boolean(c.voiceUrl),
  sig: c.voiceSig ? JSON.parse(c.voiceSig) : null, actor: c.voiceActor, standing: c.voiceDelivery,
})), null, 1));
await db.$disconnect();
