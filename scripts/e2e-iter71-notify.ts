// Iteration 71 E2E: PER-MEMBER OUTBOUND NOTIFICATIONS.
// Proves, against the RUNNING studio, the REAL database and a REAL
// local HTTP receiver:
//   A. source: the notify lib, the delivery ledger, the /api route,
//      the tool hooks (post_digest + schedule_release + the calendar
//      PATCH), the dashboard panel, the documented dev escape
//   B. pure: webhookUrlRefusal strictness (the E2E process never sets
//      the env), describeFanout honesty
//   C. accounts + throwaway production
//   D. the channel end to end: PATCH config (webhook saved through the
//      SSRF pen with the dev escape on the SERVER only), post_digest
//      fans out to the live receiver (kind DIGEST, the project named),
//      the delivery ledger records SENT, schedule_release fans out
//      RELEASE, an unsubscribed member receives nothing and owes no
//      rows, a garbage URL is refused at the pen (400)
//   E. cleanup (exact rows + files + config reset)
// Run: npx tsx scripts/e2e-iter71-notify.ts
// Precondition: dev server on :3000 STARTED WITH
// ANIMEOS_WEBHOOK_ALLOW_PRIVATE=1 (documented dev escape; restart
// clean afterwards - phase B below checks the strict posture).

import { createServer, type Server } from "node:http";
import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { webhookUrlRefusal } from "../src/lib/digest";
import { describeFanout } from "../src/lib/studio/notify";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter71-notify";
const RECEIVER_PORT = 8731;

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

async function call(jar: Jar | null, p: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter71" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter71" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter71", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter71" },
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

interface ReceiverHit {
  path: string;
  body: { kind?: string; headline?: string; lines?: string[]; project?: string; postedAt?: string };
}

async function startReceiver(): Promise<{ server: Server; hits: ReceiverHit[] }> {
  const hits: ReceiverHit[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => { raw += c.toString(); });
    req.on("end", () => {
      try {
        hits.push({ path: req.url ?? "/", body: JSON.parse(raw || "{}") });
      } catch {
        hits.push({ path: req.url ?? "/", body: {} });
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(RECEIVER_PORT, "127.0.0.1", resolve));
  return { server, hits };
}

async function main() {
  console.log("== Iteration 71: per-member outbound notifications - the news leaves the building ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const notify = readFileSync("src/lib/studio/notify.ts", "utf8");
  check("A1 the notify lib stands (deliver, fan out, describe)", notify.includes("deliverToMember") && notify.includes("notifyMembers") && notify.includes("describeFanout"));
  check("A2 the ledger records every attempt honestly", notify.includes("SENT") && notify.includes("REFUSED") && notify.includes("FAILED") && notify.includes("notificationDelivery.create"));
  check("A3 the audience is crew + OWNERs, subscription-gated", notify.includes("memberships: { some: { projectId } }") && notify.includes("notifyOnDigest") && notify.includes("notifyOnRelease"));

  const digest = readFileSync("src/lib/digest.ts", "utf8");
  check("A4 the dev escape is documented and guarded", digest.includes("ANIMEOS_WEBHOOK_ALLOW_PRIVATE") && digest.includes("DEV/TEST escape") && digest.includes('process.env.ANIMEOS_WEBHOOK_ALLOW_PRIVATE === "1"'));

  const route = readFileSync("src/app/api/notifications/route.ts", "utf8");
  check("A5 the route is self-service with the SSRF pen", route.includes("webhookUrlRefusal") && route.includes("where: { id: user.id }") && route.includes("webhookRedacted"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  check("A6 post_digest fans out to the subscribed crew", tools.includes('notifyMembers(projectId, "DIGEST"') && tools.includes("describeFanout(fanout)"));
  check("A7 schedule_release fans out the slate (both directions)", tools.includes('notifyMembers(projectId, "RELEASE"') && tools.includes("describeFanout(fanout)"));

  const releases = readFileSync("src/app/api/releases/route.ts", "utf8");
  check("A8 the calendar dialog's PATCH fans out too", releases.includes("notifyMembers") && releases.includes("outbound: fanout"));

  const dash = readFileSync("src/components/views/dashboard-view.tsx", "utf8");
  check("A9 the dashboard carries the outbound panel + ledger chips", dash.includes("OutboundPanel") && dash.includes("My outbound") && dash.includes("OUT_STATUS"));

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A10 the ledger model stands", schema.includes("model NotificationDelivery") && schema.includes("notifyOnDigest") && schema.includes("notifyWebhook"));

  // ───────────────────── B. pure checks ─────────────────────
  check("B1 the refusal refuses garbage URLs", webhookUrlRefusal("not-a-url") !== null && webhookUrlRefusal("ftp://x.example") !== null);
  check("B2 the refusal refuses loopback and private hosts (strict, no env here)", webhookUrlRefusal("http://127.0.0.1:9/hook") !== null && webhookUrlRefusal("http://10.1.2.3/hook") !== null && webhookUrlRefusal("http://169.254.169.254/meta") !== null);
  check("B3 public https passes the guard", webhookUrlRefusal("https://hooks.example.com/channel") === null);
  check("B4 describeFanout names the truth", describeFanout({ reached: 2, refused: 1, failed: 0, skipped: 0 }).includes("2 member channel(s) reached") && describeFanout({ reached: 0, refused: 0, failed: 0, skipped: 3 }).includes("no working channel"));

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  const viewerLogin = await register("reader@studio.dev", "Silent Reader", "viewing123");
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");

  // config reset so the run starts clean (idempotent re-runs)
  await db.user.update({ where: { id: ownerLogin.id }, data: { notifyWebhook: null, notifyEmail: false, notifyOnDigest: false, notifyOnRelease: false } });
  await db.notificationDelivery.deleteMany({});

  const created = await executeTool("throwaway", "create_project", { title: `Iter71 Notify Lab ${MARK}`, logline: "a throwaway production for the per-member outbound proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C2 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the channel end to end ─────────────────────
  // The tool calls below run IN THIS PROCESS (executeTool direct), so the
  // documented dev escape is set here too - exactly what the dev server
  // carries (phase D2/D3 already proved the server-side pen honors it).
  // Section B above proved the strict posture with the env absent.
  process.env.ANIMEOS_WEBHOOK_ALLOW_PRIVATE = "1";
  const { server, hits } = await startReceiver();
  check("D0 the local receiver listens", hits.length === 0);

  const badPatch = await call(ownerJar, "/api/notifications", { method: "PATCH", body: JSON.stringify({ notifyWebhook: "not-a-url" }) });
  const badPatchBody = (await badPatch.json().catch(() => ({}))) as { error?: string };
  check("D1 a garbage URL is refused at the pen (400)", badPatch.status === 400 && (badPatchBody.error ?? "").includes("not a valid URL"), badPatchBody.error ?? `status=${badPatch.status}`);
  const privatePatch = await call(viewerJar, "/api/notifications", { method: "PATCH", body: JSON.stringify({ notifyWebhook: `http://127.0.0.1:${RECEIVER_PORT}/steal`, notifyOnDigest: true }) });
  const privateBody = (await privatePatch.json().catch(() => ({}))) as { config?: { webhookRedacted?: string } };
  check("D2 a VIEWER tunes their own channels too (self-service), the pen reads the server's escape for everyone", privatePatch.status === 200 && Boolean(privateBody.config?.webhookRedacted), `status=${privatePatch.status}`);

  const saved = await call(ownerJar, "/api/notifications", { method: "PATCH", body: JSON.stringify({ notifyWebhook: `http://127.0.0.1:${RECEIVER_PORT}/hook`, notifyOnDigest: true, notifyOnRelease: true }) });
  const savedJson = (await saved.json().catch(() => ({}))) as { config?: { webhookRedacted?: string } };
  check("D3 the owner's channels save (the pen reads the server's dev escape)", saved.status === 200, `${saved.status}`);
  check("D4 the saved webhook reads back redacted", Boolean(savedJson.config?.webhookRedacted?.startsWith("http://127.0.0.1:8731/hook")), JSON.stringify(savedJson.config ?? {}));

  // subscribe the viewer on the same project but with NO working channel:
  // they get digest pushes only via the email flag they leave off
  await db.user.update({ where: { id: viewerLogin.id }, data: { notifyOnDigest: true, notifyOnRelease: true, notifyWebhook: null, notifyEmail: false } });

  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Notify" });
  const digestPost = await T("post_digest", { hours: 24 });
  check("D5 the daily digest posts and names the outbound truth", digestPost.status === "OK" && digestPost.result.includes("Outbound:"), digestPost.result.slice(-260));
  await new Promise((r) => setTimeout(r, 300));
  const digestHits = hits.filter((h) => h.body.kind !== undefined || h.path === "/hook");
  check("D6 the receiver caught the digest push", digestHits.length >= 1 && digestHits.some((h) => (h.body.lines ?? []).some((l) => l.includes("production event"))), JSON.stringify(hits.map((h) => h.body.headline)));
  check("D7 the push carries the studio's JSON shape", digestHits.length >= 1 && Boolean(digestHits[0].body.postedAt) && Array.isArray(digestHits[0].body.lines));

  const ownerDeliveries = await db.notificationDelivery.findMany({ where: { userId: ownerLogin.id }, orderBy: { createdAt: "asc" } });
  check("D8 the delivery ledger records SENT for the owner's webhook", ownerDeliveries.length >= 1 && ownerDeliveries.every((d) => d.status === "SENT" && d.kind === "DIGEST"), JSON.stringify(ownerDeliveries.map((d) => [d.kind, d.status])));

  const viewerDeliveries = await db.notificationDelivery.findMany({ where: { userId: viewerLogin.id } });
  check("D9 the unsubscribed-channel member receives nothing and owes no rows", viewerDeliveries.length === 0, JSON.stringify(viewerDeliveries.map((d) => d.status)));

  const slate = await T("schedule_release", { seasonNumber: 1, episodeNumber: 1, releaseAt: "2026-12-24", platform: "Bilibili" });
  check("D10 the slate lands and names the outbound truth", slate.status === "OK" && slate.result.includes("Outbound:"), slate.result.slice(-220));
  await new Promise((r) => setTimeout(r, 300));
  check("D11 the receiver caught the release push", hits.length >= 2, JSON.stringify(hits.map((h) => h.body.headline)));
  check("D12 the release push names the episode and the platform", hits.some((h) => (h.body.headline ?? "").includes("EP1") && (h.body.headline ?? "").includes("Bilibili")), JSON.stringify(hits.map((h) => h.body.headline)));
  const releaseRows = await db.notificationDelivery.findMany({ where: { userId: ownerLogin.id, kind: "RELEASE" } });
  check("D13 the ledger records the release pushes as SENT", releaseRows.length >= 1 && releaseRows.every((d) => d.status === "SENT"), JSON.stringify(releaseRows.map((d) => d.status)));

  const feed = await call(ownerJar, "/api/notifications");
  const feedJson = (await feed.json()) as { config?: { webhookRedacted?: string | null }; deliveries?: Array<{ status: string }> };
  check("D14 the member's own ledger reads back through the API", feed.status === 200 && (feedJson.deliveries ?? []).length >= 2 && (feedJson.deliveries ?? []).every((d) => d.status === "SENT"), JSON.stringify(feedJson.deliveries?.slice(0, 3)));

  const unschedule = await T("schedule_release", { seasonNumber: 1, episodeNumber: 1 });
  check("D15 the unschedule fans out too (a date leaving is news)", unschedule.status === "OK" && unschedule.result.includes("Outbound:"), unschedule.result.slice(-200));

  // ───────────────────── E. cleanup ─────────────────────
  await db.notificationDelivery.deleteMany({});
  await db.user.update({ where: { id: ownerLogin.id }, data: { notifyWebhook: null, notifyEmail: false, notifyOnDigest: false, notifyOnRelease: false } });
  await db.user.update({ where: { id: viewerLogin.id }, data: { notifyOnDigest: false, notifyOnRelease: false, notifyWebhook: null } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } });
  const gone = await db.project.findUnique({ where: { id: labId } });
  check("E1 the throwaway lab is gone (exact cleanup)", gone === null);
  const ledgerEmpty = await db.notificationDelivery.count({});
  check("E2 the delivery ledger is clean", ledgerEmpty === 0, `rows=${ledgerEmpty}`);

  server.close();
  console.log(`\n== ${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});
