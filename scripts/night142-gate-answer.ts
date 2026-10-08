// THE GATE ANSWERS (the 142 night's publish attempt, rerun after the
// server's prisma client caught up to the arc): the SAME attempt the
// rescore rides - login, POST /api/publish, the refusal verbatim.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";

async function main() {
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "director@studio.dev", password: "anchored2026" }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const jar = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const res = await fetch(`${BASE}/api/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: jar },
    body: JSON.stringify({ episodeId: scene.episodeId, platform: "YOUTUBE" }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`POST /api/publish -> ${res.status}`);
  console.log(JSON.stringify(body, null, 2).slice(0, 1400));
}
main().finally(() => db.$disconnect());
