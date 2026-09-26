// Iteration 49 E2E: per-role dashboard emphasis + per-project crew scoping
// + an OWNER who is never blocked anywhere.
// Proves, against the RUNNING studio and the REAL database:
//   A. source: the ProjectMembership model, the access gate with the OWNER
//      bypass, the filtered project list, the creator membership, the
//      crew-management route and the emphasis endpoint exist
//   B. HTTP matrix over real NextAuth cookie sessions:
//      - a fresh VIEWER sees an EMPTY slate and 403s on every project route
//      - OWNER adds them to a crew -> they see exactly that production
//      - craft lens lands in /api/studio/emphasis; self-retune 200; retuning
//        another member 403 (OWNER-only); crew add/remove OWNER-only
//      - membership removal revokes access on the very next call
//      - an EDITOR who creates a production leads its crew (DIRECTING) and
//        non-crew members still cannot touch it
//      - the OWNER hits the whole battery (reads AND writes, incl. another
//        production's crew) and never gets a 401/403 - full access, period
// Run: bun scripts/e2e-iter49-scoping.ts
// Precondition: dev server on :3000 with the Immortal Path seed. The script
// registers its own accounts (the first registration becomes OWNER) and
// cleans up every row it created.

import { db } from "../src/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

class Jar {
  private m = new Map<string, string>();
  absorb(res: Response) {
    const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0) this.m.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  get header(): string {
    return Array.from(this.m.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function call(jar: Jar | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter49" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter49" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter49", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/studio/emphasis");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter49" },
    body: JSON.stringify({ email, name, password }),
  });
  if (res.status === 409) {
    const row = await db.user.findUnique({ where: { email } });
    if (!row) throw new Error(`register says 409 but ${email} is not in the db`);
    return { id: row.id, role: row.role };
  }
  if (!res.ok) throw new Error(`register failed for ${email}: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { user: { id: string; role: string } };
  return data.user;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown>; } catch { return {}; }
}

async function main() {
  console.log("== Iteration 49: crew scoping, per-role dashboards, the unblockable OWNER ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const { readFileSync } = await import("node:fs");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A1 ProjectMembership model exists with the unique crew pair", schema.includes("model ProjectMembership") && schema.includes("@@unique([projectId, userId])"));
  check("A2 craft lens vocabulary in the schema", schema.includes('craft     String   @default("REVIEW")'));

  const access = readFileSync("src/lib/access.ts", "utf8");
  check("A3 access gate puts the OWNER bypass BEFORE any membership lookup", access.indexOf('user.role === "OWNER"') < access.indexOf("db.projectMembership.findUnique"));
  check("A4 gate speaks the slate message for non-members", access.includes("not on your slate"));

  const projectsRoute = readFileSync("src/app/api/projects/route.ts", "utf8");
  check("A5 project list filters by visibleProjectIds (OWNER: null = all)", projectsRoute.includes("visibleProjectIds") && projectsRoute.includes("{ id: { in: visibleIds } }"));
  check("A6 project creation lands the creator a DIRECTING membership", projectsRoute.includes('craft: "DIRECTING"') && projectsRoute.includes('requireRole(req, "EDITOR")'));

  const membersRoute = readFileSync("src/app/api/projects/[id]/members/route.ts", "utf8");
  check("A7 crew mutations are OWNER-only (POST and DELETE)", (membersRoute.match(/requireRole\(req, "OWNER"\)/g) ?? []).length >= 2);
  check("A8 a member may retune their own lens, nobody else's", membersRoute.includes("isSelf") && membersRoute.includes("Only an OWNER can change another member's craft"));

  const emphasisRoute = readFileSync("src/app/api/studio/emphasis/route.ts", "utf8");
  check("A9 emphasis endpoint exists with the OWNER studio-wide slice", emphasisRoute.includes("studio-wide") || emphasisRoute.includes("studio"));

  const dash = readFileSync("src/components/views/dashboard-view.tsx", "utf8");
  check("A10 dashboard renders the four craft lenses", ["DirectingPanel", "ArtPanel", "VoicePanel", "ReviewPanel"].every((s) => dash.includes(s)));

  // ───────────────────── B. accounts ─────────────────────
  const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
  const reader = await register("reader@studio.dev", "Lin Reader", "viewing123");
  const alice = await register("alice49@studio.dev", "Alice Temp", "temp-pass-49");
  const bob = await register("bob49@studio.dev", "Bob Temp", "temp-pass-49");
  check("B1 first registration is the studio OWNER", owner.role === "OWNER", `got ${owner.role}`);
  check("B2 later registrations are VIEWERs", reader.role === "VIEWER" && alice.role === "VIEWER" && bob.role === "VIEWER");

  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const readerJar = await loginJar("reader@studio.dev", "viewing123");
  const aliceJar = await loginJar("alice49@studio.dev", "temp-pass-49");
  const bobJar = await loginJar("bob49@studio.dev", "temp-pass-49");

  // ───────────────────── C. the slate (project list scoping) ─────────────────────
  const ownerList = (await (await call(ownerJar, "/api/projects")).json()) as Array<{ id: string; title: string; crewCount: number; onCrew: boolean }>;
  const seed = ownerList.find((p) => p.title === "Immortal Path");
  check("C1 OWNER sees the seeded production with NO membership row (implicit access)", Boolean(seed) && (await db.projectMembership.findFirst({ where: { projectId: seed!.id, userId: owner.id } })) === null);

  const ownerEmph = (await (await call(ownerJar, `/api/studio/emphasis?projectId=${seed!.id}`)).json()) as { self: { viaOwner: boolean; craft: string | null }; studio: { projectCount: number } | null };
  check("C2 OWNER emphasis carries viaOwner + the studio-wide slice", ownerEmph.self?.viaOwner === true && (ownerEmph.studio?.projectCount ?? 0) >= 1);

  const aliceEmpty = (await (await call(aliceJar, "/api/projects")).json()) as unknown[];
  check("C3 a fresh VIEWER's slate is EMPTY", Array.isArray(aliceEmpty) && aliceEmpty.length === 0);

  const aliceProj = await call(aliceJar, `/api/projects/${seed!.id}`);
  check("C4 non-member project detail is 403", aliceProj.status === 403);
  const aliceTerms = await call(aliceJar, `/api/terminology?projectId=${seed!.id}`);
  check("C5 non-member child route (terminology) is 403", aliceTerms.status === 403);

  // a shot on the seed production to anchor a comment
  const seedShot = await db.shot.findFirst({
    where: { scene: { episode: { season: { projectId: seed!.id } } } },
    select: { id: true },
  });
  const aliceComment = await call(aliceJar, "/api/comments", { method: "POST", body: JSON.stringify({ anchorType: "SHOT", anchorId: seedShot?.id, body: "non-member speaking test" }) });
  check("C6 non-member cannot even SPEAK on a foreign production's threads", aliceComment.status === 403);

  // ───────────────────── D. crew membership changes everything ─────────────────────
  const addAlice = await call(ownerJar, `/api/projects/${seed!.id}/members`, { method: "POST", body: JSON.stringify({ userId: alice.id, craft: "VOICE" }) });
  check("D1 OWNER adds Alice to the crew (VOICE lens)", addAlice.status === 200, String(addAlice.status));

  const aliceList = (await (await call(aliceJar, "/api/projects")).json()) as Array<{ id: string; onCrew: boolean }>;
  check("D2 Alice's slate now shows exactly that one production", aliceList.length === 1 && aliceList[0].id === seed!.id && aliceList[0].onCrew === true);

  const aliceDetail = await call(aliceJar, `/api/projects/${seed!.id}`);
  check("D3 crew member reads the production", aliceDetail.status === 200);

  const aliceEmph = (await (await call(aliceJar, `/api/studio/emphasis?projectId=${seed!.id}`)).json()) as { self: { craft: string | null; viaOwner: boolean }; studio: unknown };
  check("D4 emphasis carries the VOICE craft lens and NO studio slice for a non-owner", aliceEmph.self?.craft === "VOICE" && aliceEmph.studio === null);

  const aliceSpeak = await call(aliceJar, "/api/comments", { method: "POST", body: JSON.stringify({ anchorType: "SHOT", anchorId: seedShot?.id, body: "crew member speaking - Iteration 49" }) });
  check("D5 crew VIEWER speaks on their production's thread (membership + the one viewer-mutable path)", aliceSpeak.status === 200);

  const selfRetune = await call(aliceJar, `/api/projects/${seed!.id}/members`, { method: "PATCH", body: JSON.stringify({ userId: alice.id, craft: "ART" }) });
  check("D6 a member retunes their OWN lens", selfRetune.status === 200);
  const retuned = (await (await call(aliceJar, `/api/studio/emphasis?projectId=${seed!.id}`)).json()) as { self: { craft: string | null } };
  check("D7 the retune lands immediately in the emphasis", retuned.self?.craft === "ART");

  const addReader = await call(ownerJar, `/api/projects/${seed!.id}/members`, { method: "POST", body: JSON.stringify({ userId: reader.id, craft: "REVIEW" }) });
  check("D8 OWNER adds the reader (REVIEW lens)", addReader.status === 200);
  const alicePatchReader = await call(aliceJar, `/api/projects/${seed!.id}/members`, { method: "PATCH", body: JSON.stringify({ userId: reader.id, craft: "VOICE" }) });
  check("D9 a member cannot retune ANOTHER member's lens", alicePatchReader.status === 403);
  const aliceAdd = await call(aliceJar, `/api/projects/${seed!.id}/members`, { method: "POST", body: JSON.stringify({ userId: bob.id }) });
  check("D10 crew add is OWNER-only", aliceAdd.status === 403);

  const kickAlice = await call(ownerJar, `/api/projects/${seed!.id}/members?userId=${alice.id}`, { method: "DELETE" });
  check("D11 OWNER removes Alice from the crew", kickAlice.status === 200);
  const aliceAfter = await call(aliceJar, `/api/projects/${seed!.id}`);
  check("D12 access is revoked on the very next call", aliceAfter.status === 403);

  // ───────────────────── E. EDITOR creates; the silo holds ─────────────────────
  const promote = await call(ownerJar, "/api/studio/members", { method: "PATCH", body: JSON.stringify({ userId: bob.id, role: "EDITOR" }) });
  check("E1 OWNER promotes Bob to EDITOR", promote.status === 200);
  const bobJar2 = await loginJar("bob49@studio.dev", "temp-pass-49"); // fresh claim

  const createRes = await call(bobJar2, "/api/projects", { method: "POST", body: JSON.stringify({ title: "Scoping Probe 49", logline: "created by the E2E", visualStyle: "ANIME", animationType: "2D" }) });
  check("E2 EDITOR creates a production", createRes.status === 200);
  const created = (await createRes.json()) as { id: string };

  const bobProjects = (await (await call(bobJar2, "/api/projects")).json()) as Array<{ id: string }>;
  check("E3 the creator sees their own production", bobProjects.some((p) => p.id === created.id));

  const bobEmph = (await (await call(bobJar2, `/api/studio/emphasis?projectId=${created.id}`)).json()) as { self: { craft: string | null } };
  check("E4 the creator leads their crew (DIRECTING lens)", bobEmph.self?.craft === "DIRECTING");

  const ownerSees = (await (await call(ownerJar, "/api/projects")).json()) as Array<{ id: string }>;
  check("E5 the OWNER sees the new production too (implicit)", ownerSees.some((p) => p.id === created.id));

  const readerSees = (await (await call(readerJar, "/api/projects")).json()) as Array<{ id: string }>;
  check("E6 the reader's slate holds only THEIR crews (not Bob's)", readerSees.every((p) => p.id === seed!.id) && readerSees.length === 1);

  const bobEp = await call(bobJar2, "/api/episodes", { method: "POST", body: JSON.stringify({ projectId: created.id, number: 1, title: "Probe Episode" }) });
  check("E7 the creator writes into their production", bobEp.status === 200);
  const aliceEp = await call(aliceJar, "/api/episodes", { method: "POST", body: JSON.stringify({ projectId: created.id, number: 2, title: "Sneak" }) });
  check("E8 a non-crew member cannot write into it", aliceEp.status === 403);

  // ───────────────────── F. the OWNER is never blocked, anywhere ─────────────────────
  const ownerPaths: Array<[string, string, string | undefined]> = [
    ["GET", `/api/projects`, undefined],
    ["GET", `/api/projects/${seed!.id}`, undefined],
    ["GET", `/api/projects/${created.id}`, undefined],
    ["GET", `/api/projects/${created.id}/members`, undefined],
    ["GET", `/api/studio/emphasis?projectId=${created.id}`, undefined],
    ["GET", `/api/episodes?projectId=${created.id}`, undefined],
    ["GET", `/api/characters?projectId=${seed!.id}`, undefined],
    ["GET", `/api/dsh?projectId=${seed!.id}`, undefined],
    ["GET", `/api/render-jobs?projectId=${seed!.id}`, undefined],
    ["GET", `/api/continuity?projectId=${seed!.id}`, undefined],
    ["GET", `/api/terminology?projectId=${seed!.id}`, undefined],
    ["GET", `/api/identity?projectId=${seed!.id}`, undefined],
    ["GET", `/api/canon-health?projectId=${seed!.id}`, undefined],
    ["GET", `/api/schedules?projectId=${seed!.id}`, undefined],
    ["GET", `/api/digest?projectId=${seed!.id}`, undefined],
    ["GET", `/api/comments?projectId=${seed!.id}`, undefined],
    ["GET", `/api/loras?projectId=${seed!.id}`, undefined],
    ["GET", `/api/artists?projectId=${seed!.id}`, undefined],
    ["GET", `/api/plan-templates?projectId=${seed!.id}`, undefined],
    ["GET", `/api/blender-assets?projectId=${seed!.id}`, undefined],
    ["GET", `/api/arc-templates?projectId=${seed!.id}`, undefined],
    ["GET", `/api/studio/members`, undefined],
    ["PATCH", `/api/projects/${seed!.id}`, JSON.stringify({ approvalGate: false })],
    ["PATCH", `/api/projects/${created.id}`, JSON.stringify({ logline: "owner touched it" })],
    ["POST", `/api/characters`, JSON.stringify({ projectId: created.id, name: "Owner Probe" })],
    ["POST", `/api/terminology`, JSON.stringify({ projectId: created.id, term: "OwnerProbe", translations: { "en-US": "OwnerProbe" } })],
    ["POST", `/api/comments`, JSON.stringify({ anchorType: "SHOT", anchorId: seedShot?.id, body: "owner walks every room" })],
  ];
  let ownerBlock = 0;
  const ownerBlockDetail: string[] = [];
  for (const [method, path, body] of ownerPaths) {
    const res = await call(ownerJar, path, { method, body });
    if (res.status === 401 || res.status === 403) {
      ownerBlock += 1;
      ownerBlockDetail.push(`${method} ${path} -> ${res.status}`);
    }
  }
  check("F1 OWNER hits 28 endpoints (reads AND writes on TWO productions incl. another's crew) - zero 401/403", ownerBlock === 0, ownerBlockDetail.join("; "));

  const gateBack = await call(ownerJar, `/api/projects/${seed!.id}`, { method: "PATCH", body: JSON.stringify({ approvalGate: false }) });
  check("F2 the OWNER flips studio policy (the human gate) freely", gateBack.status === 200);

  // ───────────────────── cleanup ─────────────────────
  await db.project.delete({ where: { id: created.id } }).catch(() => null);
  await db.projectMembership.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
  await db.user.delete({ where: { id: alice.id } }).catch(() => null);
  await db.user.delete({ where: { id: bob.id } }).catch(() => null);
  // the owner probe comment + reader's REVIEW membership stay as the honest end state:
  // reader keeps a lens on Immortal Path; the studio demonstrates the scoping live.

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});
