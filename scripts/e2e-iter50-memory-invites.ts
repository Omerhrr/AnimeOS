// Iteration 50 E2E: per-production DSH memory boundaries + invite links.
// Proves, against the RUNNING studio and the REAL database:
//   A. source: the Invite model, the OWNER-only invites route, the
//      register-time redemption (single-use, revoke/expiry honored),
//      the identity-aware executeTool (create_project seats its
//      creator), the conversation staying on the turn's home
//      production, doctrine rule 26 and the UI hooks
//   B. HTTP: the keyring is OWNER-only; a cut key registers its holder
//      with the invited role (and crew seat) in one transaction; the
//      key is then spent; revoked/expired/bogus keys open nothing
//   C. the DSH memory boundary END TO END: a real DSH turn that
//      creates a production mid-conversation keeps BOTH conversation
//      messages on the home production, starts the newborn's history
//      with an origin event, seats the creator on the newborn crew
//      (DIRECTING) and puts the newborn on their slate - while a
//      stranger still sees nothing
// Run: bun scripts/e2e-iter50-memory-invites.ts
// Precondition: dev server on :3000 with the Immortal Path seed. The
// script registers its own accounts and cleans up every row it created.

import { db } from "../src/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter50-boundary-proof";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter50" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter50" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter50", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function rawRegister(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter50" },
    body: JSON.stringify(body),
  });
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await rawRegister({ email, name, password });
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
  console.log("== Iteration 50: per-production DSH memory boundaries + invite links ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const { readFileSync } = await import("node:fs");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A1 Invite model exists with a unique code and a one-shot usedById", schema.includes("model Invite") && schema.includes("code        String    @unique") && schema.includes("usedById    String?   @unique"));
  check("A2 an invite never carries OWNER (ownership is earned, not invited)", schema.includes('// EDITOR | VIEWER (never OWNER)'));

  const invitesRoute = readFileSync("src/app/api/invites/route.ts", "utf8");
  check("A3 the keyring is OWNER-only on GET, POST and PATCH", (invitesRoute.match(/requireRole\(req, "OWNER"\)/g) ?? []).length >= 3);
  check("A4 revoked/expired/used keys open nothing at redeem time", invitesRoute.includes("revokedAt") && invitesRoute.includes("expiresAt"));

  const registerRoute = readFileSync("src/app/api/auth/register/route.ts", "utf8");
  check("A5 register resolves the invite BEFORE creating the user", registerRoute.indexOf("invite.findUnique") < registerRoute.indexOf("user.create"));
  check("A6 register spends the key in the same transaction that seats the member", registerRoute.includes("$transaction") && registerRoute.includes("usedAt: new Date()"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  check("A7 executeTool knows whose turn it is", tools.includes("user?: { id: string; name: string; role: string } | null"));
  check("A8 DSH-made productions seat their creator (DIRECTING)", /create_project[\s\S]{0,1800}craft: "DIRECTING"/.test(tools.slice(tools.indexOf('case "create_project"'), tools.indexOf('case "create_project"') + 2000)));

  const orch = readFileSync("src/lib/dsh/orchestrator.ts", "utf8");
  check("A9 the conversation persists to the turn's HOME production, not the mid-turn switch", orch.includes("originProjectId") && !orch.includes("projectId: activeProjectId,\n      role: \"dsh\""));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A10 doctrine rule 26: ONE PRODUCTION, ONE MEMORY", prompts.includes("26. ONE PRODUCTION, ONE MEMORY"));

  const signin = readFileSync("src/app/signin/page.tsx", "utf8");
  check("A11 the sign-in form pre-aims at registration from ?invite=", signin.includes('params.get("invite")') && signin.includes('invite: inviteCode || undefined'));

  const userMenu = readFileSync("src/components/studio/user-menu.tsx", "utf8");
  const crewDialog = readFileSync("src/components/views/crew-dialog.tsx", "utf8");
  check("A12 the OWNER menu carries the Invites keyring", userMenu.includes("InvitesDialog") && userMenu.includes("/api/invites"));
  check("A13 the crew dialog cuts invites pre-aimed at its own production", crewDialog.includes("Cut an invite") && crewDialog.includes("/api/invites"));

  // ───────────────────── B. accounts ─────────────────────
  const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
  const reader = await register("reader@studio.dev", "Lin Reader", "viewing123");
  check("B1 the seeded accounts hold their roles", owner.role === "OWNER" && reader.role === "VIEWER", `${owner.role}/${reader.role}`);

  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const readerJar = await loginJar("reader@studio.dev", "viewing123");

  const ownerList = (await (await call(ownerJar, "/api/projects")).json()) as Array<{ id: string; title: string }>;
  const seed = ownerList.find((p) => p.title === "Immortal Path");
  if (!seed) throw new Error("Immortal Path seed not found - cannot run the boundary proof");

  // ───────────────────── C. the keyring (invites API) ─────────────────────
  const anonInvites = await call(null, "/api/invites");
  check("C1 anonymous keyring access is 401", anonInvites.status === 401);
  const readerInvites = await call(readerJar, "/api/invites");
  check("C2 the keyring refuses a VIEWER (OWNER-only, no exceptions)", readerInvites.status === 403);

  const ownerInviteRes = await call(ownerJar, "/api/invites", { method: "POST", body: JSON.stringify({ role: "EDITOR", expiresInDays: 7 }) });
  const ownerInvite = await json(ownerInviteRes);
  check("C3 the OWNER cuts a studio-wide EDITOR key", ownerInviteRes.status === 201 && typeof ownerInvite.code === "string" && String(ownerInvite.code).length >= 16);

  const ownerRoleRes = await call(ownerJar, "/api/invites", { method: "POST", body: JSON.stringify({ role: "OWNER" }) });
  check("C4 ownership is never invited (400)", ownerRoleRes.status === 400);

  const bogusProjRes = await call(ownerJar, "/api/invites", { method: "POST", body: JSON.stringify({ role: "VIEWER", projectId: "no-such-project" }) });
  check("C5 a key naming a missing production is refused (404)", bogusProjRes.status === 404);

  const crewInviteRes = await call(ownerJar, "/api/invites", { method: "POST", body: JSON.stringify({ role: "VIEWER", projectId: seed.id, craft: "VOICE" }) });
  const crewInvite = await json(crewInviteRes);
  check("C6 the OWNER cuts a crew-seat key (VIEWER + VOICE lens on the seed)", crewInviteRes.status === 201 && crewInvite.projectId === seed.id);

  const listRes = await call(ownerJar, "/api/invites");
  const list = await json(listRes);
  const listed = ((list.invites ?? []) as Array<{ code: string; status: string }>).find((i) => i.code === ownerInvite.code);
  check("C7 the keyring lists the fresh key as ACTIVE", listRes.status === 200 && listed?.status === "ACTIVE");

  // ───────────────────── D. redemption ─────────────────────
  const carolRes = await rawRegister({ email: "carol50@studio.dev", name: "Carol Keyed", password: "keyed-pass-50", invite: ownerInvite.code });
  const carolData = await json(carolRes);
  const carolUser = carolData.user as { id: string; role: string } | undefined;
  check("D1 an EDITOR key lands its holder as EDITOR", carolRes.status === 201 && carolUser?.role === "EDITOR", JSON.stringify(carolData).slice(0, 120));

  const spentList = (await (await call(ownerJar, "/api/invites")).json()) as { invites: Array<{ code: string; status: string; usedBy: { email: string } | null }> };
  const spent = spentList.invites.find((i) => i.code === ownerInvite.code);
  check("D2 the key is spent (USED, stamped with its holder)", spent?.status === "USED" && spent?.usedBy?.email === "carol50@studio.dev");

  const reuseRes = await rawRegister({ email: "carol-again50@studio.dev", name: "Carol Again", password: "keyed-pass-50", invite: ownerInvite.code });
  check("D3 a spent key opens nothing (410)", reuseRes.status === 410);

  const bogusRes = await rawRegister({ email: "nobody50@studio.dev", name: "Nobody", password: "keyed-pass-50", invite: "not-a-real-code" });
  check("D4 a bogus key is 404", bogusRes.status === 404);

  const revokeRes = await call(ownerJar, "/api/invites", { method: "POST", body: JSON.stringify({ role: "VIEWER" }) });
  const revokeInvite = await json(revokeRes);
  const revoked = await call(ownerJar, "/api/invites", { method: "PATCH", body: JSON.stringify({ id: revokeInvite.id, action: "revoke" }) });
  const revokedUse = await rawRegister({ email: "revoked50@studio.dev", name: "Revoked", password: "keyed-pass-50", invite: revokeInvite.code });
  check("D5 a revoked key opens nothing (410)", revoked.status === 200 && revokedUse.status === 410);

  const expiredInvite = await db.invite.create({
    data: { code: "expirediter50code00", role: "VIEWER", createdById: owner.id, expiresAt: new Date(Date.now() - 3600 * 1000) },
  });
  const expiredUse = await rawRegister({ email: "expired50@studio.dev", name: "Expired", password: "keyed-pass-50", invite: expiredInvite.code });
  check("D6 an expired key opens nothing (410)", expiredUse.status === 410);

  const daveRes = await rawRegister({ email: "dave50@studio.dev", name: "Dave Seated", password: "keyed-pass-50", invite: crewInvite.code });
  const daveData = await json(daveRes);
  const daveUser = daveData.user as { id: string; role: string } | undefined;
  const daveMembership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: seed.id, userId: daveUser?.id ?? "" } },
  });
  check("D7 a crew-seat key lands the role AND the seat (VOICE lens on the seed) in one transaction", daveRes.status === 201 && daveUser?.role === "VIEWER" && daveMembership?.craft === "VOICE");

  const daveJar = await loginJar("dave50@studio.dev", "keyed-pass-50");
  const daveSlate = (await (await call(daveJar, "/api/projects")).json()) as Array<{ id: string }>;
  check("D8 the seated newcomer's slate opens on their production", daveSlate.length === 1 && daveSlate[0]?.id === seed.id);

  // control: a plain registration is still an honest VIEWER
  const erin = await register("erin50@studio.dev", "Erin Plain", "plain-pass-50");
  check("D9 without a key the door still defaults to VIEWER", erin.role === "VIEWER");

  // ───────────────────── E. the DSH memory boundary (end to end) ─────────────────────
  // Seat carol on the seed crew so she may direct there (she arrived
  // through a studio-wide key, no seats attached).
  await db.projectMembership.create({ data: { projectId: seed.id, userId: carolUser!.id, craft: "DIRECTING" } });
  const carolJar = await loginJar("carol50@studio.dev", "keyed-pass-50");

  const bornTitle = `Boundary Child ${Date.now().toString(36)}`;
  const turnRes = await call(carolJar, "/api/dsh", {
    method: "POST",
    body: JSON.stringify({
      projectId: seed.id,
      message: `${MARK}: create a NEW production titled '${bornTitle}' (format SHORT, logline 'born mid-conversation to prove the memory boundary'). Then stop and summarize what happened to this conversation.`,
    }),
  });
  const turn = await json(turnRes);
  const bornId = String(turn.activeProjectId ?? "");
  check("E1 the DSH turn runs and switches to the newborn production", turnRes.status === 200 && bornId.length > 0 && bornId !== seed.id, JSON.stringify(turn).slice(0, 200));

  const homeMessages = await db.dshMessage.findMany({ where: { projectId: seed.id, content: { contains: MARK } }, orderBy: { createdAt: "asc" } });
  const userMsg = homeMessages.find((m) => m.role === "user");
  const replyMsg = userMsg
    ? await db.dshMessage.findFirst({ where: { projectId: seed.id, role: "dsh", createdAt: { gte: userMsg.createdAt } }, orderBy: { createdAt: "asc" } })
    : null;
  check("E2 BOTH conversation messages stay on the home production (user + dsh)", Boolean(userMsg) && Boolean(replyMsg) && replyMsg!.content.toLowerCase().includes("boundary"), `user=${Boolean(userMsg)} reply=${Boolean(replyMsg)}`);

  const bornMessages = await db.dshMessage.count({ where: { projectId: bornId } });
  check("E3 the newborn's conversation history starts EMPTY (no borrowed half)", bornMessages === 0, `got ${bornMessages}`);

  const originEvent = await db.productionEvent.findFirst({
    where: { projectId: bornId, type: "PROJECT", summary: { contains: "Created by DSH" } },
    orderBy: { createdAt: "desc" },
  });
  check("E4 the newborn's history opens with an origin event naming its maker", Boolean(originEvent) && (originEvent?.summary ?? "").includes("Carol Keyed"), originEvent?.summary?.slice(0, 100));

  const bornMembership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: bornId, userId: carolUser!.id } },
  });
  check("E5 the creator is seated on the newborn crew (DIRECTING)", bornMembership?.craft === "DIRECTING");

  const carolSlate = (await (await call(carolJar, "/api/projects")).json()) as Array<{ id: string; onCrew: boolean }>;
  const slateHolds = carolSlate.filter((p) => p.id === seed.id || p.id === bornId);
  check("E6 the creator's slate holds exactly their two productions (home + newborn)", slateHolds.length === 2 && slateHolds.every((p) => p.onCrew), `got ${carolSlate.length} rows`);

  const bornRead = await call(carolJar, `/api/projects/${bornId}`);
  check("E7 the creator reads the newborn they were seated on (200)", bornRead.status === 200);

  const strangerRead = await call(readerJar, `/api/projects/${bornId}`);
  check("E8 a stranger still cannot see the newborn (403)", strangerRead.status === 403);

  const ownerBornRead = await call(ownerJar, `/api/projects/${bornId}`);
  check("E9 the OWNER reads the newborn with NO membership row (never blocked)", ownerBornRead.status === 200 && (await db.projectMembership.findFirst({ where: { projectId: bornId, userId: owner.id } })) === null);

  const ownerBornDsh = await call(ownerJar, `/api/dsh?projectId=${bornId}`);
  check("E10 the OWNER reads the newborn's (empty) DSH memory - every room is open", ownerBornDsh.status === 200);

  // ───────────────────── cleanup ─────────────────────
  await db.project.delete({ where: { id: bornId } }).catch(() => null);
  await db.dshMessage.deleteMany({ where: { projectId: seed.id, content: { contains: MARK } } });
  if (replyMsg) await db.dshMessage.delete({ where: { id: replyMsg.id } }).catch(() => null);
  await db.invite.deleteMany({ where: { createdById: owner.id, createdAt: { gte: new Date(Date.now() - 3600 * 1000) } } });
  await db.invite.delete({ where: { id: expiredInvite.id } }).catch(() => null);
  // deleting the users cascades their memberships and nulls their invite stamps
  await db.user.deleteMany({ where: { email: { in: ["carol50@studio.dev", "dave50@studio.dev", "erin50@studio.dev"] } } });
  // the TOOL_CALL/PROJECT events the turn landed on the seed stay as append-only history

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});
